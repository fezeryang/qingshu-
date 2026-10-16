# Camera module (`src/camera/`) — implementation notes

Owner: qs-camera-director. Contract: `docs/CONTRACTS.md` §4.5 (unchanged; everything below marked *addition* is extra).

## Files

| File | Role |
|---|---|
| `index.js` | Director: mode switching, per-tick pipeline, event automation (launch / apex / approach / near miss / hold-breath / PiP / landing), round reset, public `ctx.cam` |
| `rig.js` | Pose math, `lookQuat`, target resolution (`Character` / char id / `'teacher'` / `'crush'` / Vector3 / `[x,y,z]` / Object3D / anchor `{pos, look}`), framing constraint |
| `collide.js` | Segment casts, push-out and room clamping against `world.classroom.colliders` + `cast.colliders()` (spring arm, preset anti-clipping) |
| `fp.js` | First person (mode `fp`) |
| `follow.js` | Ball follow cam (mode `follow`): `chase`, `side`, `fpStay` |
| `shots.js` | Cinematic moves and presets (mode `cinematic`) |
| `slowmo.js` | Time-scale manager — the only writer of `engine.timeScale` |
| `motion.js` | Additive shake / kick / flinch / whip springs |
| `fx.js` | DOM overlay: fade, flash, letterbox, heart iris (2D canvas), speed lines, slow-mo vignette, PiP frame |
| `pip.js` | Picture-in-picture second camera (scissor/viewport pass) |
| `title.js` | Title establishing shot + dust motes |

## Per-tick pipeline (`ORDER.CAMERA`, after physics and characters)

`KeyC` → flight automation (apex fallback, approach detection) → slow-mo ramp → motion springs →
mode pose → roll channel → transition blend → (follow) min-distance + framing constraint → write camera
(+ additive motion) → PiP camera → F1 metrics → speed lines / vignette → render-function sync.

Cinematic moves only store progress in their `ctx.time.tween` callback; the pose is evaluated in the
camera update, so `orbit` / `track` follow live targets. `cut()` and every `dur: 0` move also write the
camera immediately, so a screenshot taken right after a cut (without a tick) is correct.

## Modes

- **title** (phases `title`, `letter`): slow 44 s dolly along the back of the room toward the sunlit
  windows, with ~260 additive dust motes (90 in lowfx) that are only visible in this mode.
- **fp** (phase `aim`; `intro` blends into it): cursor `nx/ny` → yaw ±75°, pitch −35°…+45° (lead decision;
  gameplay adds a +10° lob), × `settings.sensitivity`, mild acceleration near the screen edges, exponential
  smoothing. Breathing sway (tiny). `gameplay.aim.studying` → pitch −50° (looks at the book). Charging:
  FOV 70→60, small lean forward/down, tremble above 85 % power. Teacher `warning` during aim → a small
  involuntary flinch. Input disabled → the view holds, and external writes to `fp.yaw/pitch` stick.
  `fp.getAimRay()` uses the smoothed yaw/pitch (no breathing/shake noise).
- **follow** (on `ball:launched`): 0.25 s pull-out blend from the eye (UI clock), plus a 0.15 s 0.1x
  "release freeze".
  - `chase` (default): 0.7–1.0 m behind/above along the horizontal velocity, raised when the ball falls
    steeply, looks slightly ahead. It swings up to 26° to the roomier side during bullet time.
  - `side`: parallel tracking shot 1.9 m to the roomier side of the launch direction.
  - `fpStay`: stays at the seat, turns/zooms; half-stands or leans when the view is blocked.
  - Spring arm: segment cast from the ball to the ideal camera (characters inflated). If the arm would be
    shorter than 0.34 m it swings up (or down, under the ceiling) in the same frame. Then push-out, room
    clamp and fan-disc avoidance; if push-out lands the camera on top of the ball (ball resting against a
    head or book stack), it is re-placed on the first clear arm ≥ 0.3 m. Colliders that only contain the
    ball in their *inflated* form are still tested with their raw shape.
  - Framing constraint: the ball is kept within |ndc| ≤ 0.6 by a minimal rotation. F1 measures 0.7.
  - `KeyC` cycles styles (0.35 s blend) and emits `cam:mode {mode:'follow', style}`. The chosen style
    persists across rounds.
- **cinematic**: any preset / `shot` / `cut`. A new move supersedes the previous one, whose Promise
  resolves immediately.

## Automatic bullet time (all timed in real/UI seconds)

| Trigger | Scale | Duration |
|---|---|---|
| `ball:launched` | 0.1 (snap) | 0.15 s |
| `ball:apex` (or detected vy sign change) | 0.4 | 0.5 s |
| ball descending, < 1.2 m from a desk/chair/podium/trash rim/head | 0.25 | until `ball:landed` + 0.3 s (hard cap 2.2 s) |
| `ball:nearMiss` | 0.5 + whip pan | 0.25 s |
| `ball:willpower {on}` | 0.3 | until `{on:false}` / landing (cap 8 s) |
| PiP opens | 0.35 | 0.55 s |

The effective scale is the minimum of all requests, ramped in log space. `slowmo {scale}` is emitted when
the target changes. Safety: every request has a max lifetime (≤ 30 s), and the requests are cleared (scale
snapped to 1) on `round:setup` and on phases `title`, `aim` and `card`.

## Landing

On `ball:landed` (in follow mode) the camera cuts to a low-angle shot of the ball with the recipient's face
behind it (window → looking out of the open window; fan → looking up at the fan). It then pushes in for
0.6 s (UI clock). Story shots called right away simply supersede it. *Addition:* `ctx.cam.afterLanding()`
returns a Promise for the end of that beat, in case a cutscene wants to wait for it.

## PiP

When `teacher:state` becomes `warning|watching|patrol|suspicious|alert|fakeout` while the ball is flying in
follow mode, a second camera frames the teacher's face. It uses a 3/4 view from the class side, so you see
the profile while they face the board and the full face once they turn. The image fills a top-right window
(28 % of the width, 16:10) placed below the HUD band (y ≥ 14 % of the height). A red pulsing DOM frame with
a "！" badge sits on top, and a short 0.35x slow-mo plays. The PiP closes on `writing`/`idle`, on landing,
on the `ending`/`card` phases and on `round:setup`. `pip(on, {target})` works for any target. While the
PiP is off, the default single render is restored (`engine.setRenderFn(null)`). The custom render function
is also installed outside `fp` when something foreign is still visible under the camera (e.g. FP arms
during an ending). It hides those children for that frame only. Add `userData.camKeep = true` to keep a
camera child visible.

## Effects layer

`#cam-fx` (pointer-events: none) is inserted **between the canvas and `#ui-root`**. Dialogue, captions and
the ending card therefore always render above fades/irises: a fade left at 1 can never hide the card, and
"caption over black" works. *Addition:* `ctx.cam.setFxOverUI(true)` moves the layer above the UI if a
transition must cover the HUD. All transitions run on the UI clock (not stretched by slow motion) and always
resolve. The heart iris is a 2D canvas (Path2D heart + `destination-out`). An SVG `<mask>` version corrupted
the UI's SVG rendering in Chromium, so don't reintroduce one.

`round:setup` hard-resets everything (fade, flash, letterbox, iris, speed lines, vignette, PiP, slow-mo,
roll, shake, FOV 70, mode `fp`). Phases `title` and `aim` fade out leftovers (0.3–0.4 s).

## API details and units

- `shot({pos, look, fov=50, dur=0, ease, roll=0, clock})`: `pos`/`look` accept Vector3, `[x,y,z]`,
  `{x,y,z}`, Object3D or Character. A missing `pos` keeps the position (a pan); a missing `look` keeps the
  direction. `roll` is in **degrees**. `ease` is a function or a name from `core/util.js` `ease`.
  `clock: 'ui'` is optional.
- `cut({pos, look, fov=50, roll})`: same as `shot` with `dur: 0`.
- `sequence(items)`: each item is a shot object, `{wait}`, `{preset:'closeUp', args:[…]}` or
  `async (cam) => …`. `hold` (s) waits after a step. Bad items are skipped.
- `closeUp(char, {side:'front'|'left'|'right', dist, fov=35, dur=0.6, height=0.03, roll})`: without an explicit
  `dist` the camera sits at max(0.7 m, distance that fits the *visual* head — bounding box of `parts.head`
  incl. hair — with headroom); an explicit `dist` is respected (extreme close-ups). Eyes on the
  upper third with headroom from the head-collider radius, and lead room toward where they face.
  Candidate angles/heights are tried until the camera is not inside geometry, has a clear line to the
  face, and has no third person's head (judged at 1.8× the head-collider radius) in front of the lens.
- `twoShot(a, b, {dur=0.6, fov=40})`: perpendicular to the pair on their facing side (3/4 front when both
  face the same way). Heads end up at about ±0.5 ndc. The camera pulls in and widens the lens if the room
  is too small.
- `overShoulder(from, to, {dur=0.6, fov=38, side:'right'|'left'})`.
- `wide(arg, {dur=0, fov})`: `arg` is a set name (→ `anchors.camWide`), `'set.anchorKey'`, a set object or
  an anchor `{pos, look|yaw}`. `'classroom'` and its keys `camWide|camBack|camFront|camWindow|camHigh` are
  built in (the world's `classroom.anchors` override them).
- `orbit(target, {radius=2, height, fromYaw, toYaw, dur=3, fov=45, blend=0.35})`: the target is tracked live.
  Yaw is the direction from the target to the camera, using the character convention (yaw 0 → camera at
  −Z of the target). Degrees are preferred; non-integer values within ±2π are read as radians. Default:
  from the current azimuth, +60°. `height` = absolute camera Y (as in the stub); the default is target + 0.3.
- `crashZoom(target, {dur=0.25, push=0.35, fov})`: push in + narrow FOV so the head fills ~half the frame,
  then a kick.
- `dutch(angleDeg=12, dur=0.4)`: roll channel. It persists until the next `shot`/preset (roll 0 by default)
  or a mode change.
- `track(obj, {offset, lookOffset, local, dur=1.5, lag=14, fov=50})`: without `offset`, chases from behind
  along the object's motion. It keeps tracking after the Promise resolves, until superseded.
- `shake(amp=0.3, dur=0.4)`: amp ≈ 0.1 subtle, 0.3 noticeable, 1 violent. `kick(amp=0.3)`.
  `settings.reducedMotion` scales motion to 25 % and disables speed lines.
- `slowMo(scale, dur=1, {ease:'snap'})`: dur is in **real seconds**, and the Promise resolves when it ends.
  `slowMo(1)` cancels script slow-mo.
- `fade(opacity=1, dur=0.5, color='#000')`, `flash(color='#fff', dur=0.3)`, `letterbox(on=true|0..1,
  dur=0.5)` (bars are 12 % each).
- `irisHeart('out'|'in', dur=1, screenPos, color='#16080f')`: 'out' closes onto the point (with a heartbeat
  pulse) and stays closed; 'in' opens from it. `screenPos` is a Character / char id / Vector3 / Object3D
  (projected), `{x,y}` in 0..1 screen fractions (top-left origin), or pixels. The default is the centre.
- *Additions:* `lookAt(target, {dur, fov})`, `setFollowStyle(style)`, `followStyle`, `afterLanding()`,
  `clearEffects(dur)`, `setFxOverUI(bool)`, `metrics`, `debug()`. Assigning `cam.mode = 'fp'|'follow'|
  'title'|'cinematic'` is also supported.

## QA hooks

- `ctx.cam.metrics.flights[]` / `.last`: per flight `{style, frames, inside (|ndc| ≤ 0.7), ratio, maxAbs,
  occluded (camera→ball segment blocked by a collider), minDist, avgDist, landing}`. It is measured on the
  final camera every tick of follow mode while the ball is flying (this is the F1 metric).
- `ctx.cam.debug()`: mode, style, timeScale, active slow-mo requests, roll, fov, pip, fade/letterbox/iris/
  flash state, camera position — for A4/F4 residue checks.

## Self-test scripts

`dev/camera/flight.js` (flight sequence + PiP), `dev/camera/f1.js` (F1 over 16 targets × 3 styles),
`dev/camera/presets.js` (presets + heart iris), `dev/camera/fp.js` (title / aim / charge / study / side /
fpStay / landing), `dev/camera/reset.js` (junk arguments, KeyC, hold-breath, residue across retry).
