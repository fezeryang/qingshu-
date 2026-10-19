# Characters module (`src/characters/`, owner: qs-character-artist)

Implements `ctx.characters` per CONTRACTS.md §4.2. Everything is procedural (three.js geometry + canvas textures).

## Files

| File | What |
|---|---|
| `index.js` | `install(ctx)`: `create`, `createArms`, `createProp`, `say` → mouth flaps, confetti updater |
| `character.js` | Character factory: rig, meshes, animation layers, IK, look-at, springs, props, emotes, colliders |
| `body.js` | proportions (kid / adult × build × gender), bone layout, skinned body geometry per outfit shape |
| `head.js` | head geometry with a face-centred azimuthal UV projection (the face canvas maps onto the front of the skull) |
| `face.js` | 256² face canvas painter: 16 contract expressions + internal clip faces, blink, talking mouth, gaze, glasses glint, tears |
| `hair.js` | 13 hair styles + glasses + head accessories; swinging pieces (ponytail, twin tails, braid, long hair) |
| `clips.js` | all clips as `fn(P, t, c)` pose functions, base sit/stand postures, landmarks |
| `pose.js` | pose buffers, layer blending, clip-writer API, analytic two-bone IK |
| `looks.js` | spec → full look (deterministic defaults from the id hash) + 16-slot palette |
| `toon.js` | toon gradient, palette textures/materials (cached by colour set), inverted-hull outline material |
| `emotes.js` | emote symbol textures (shared) |
| `props.js` | all props, confetti animation |
| `arms.js` | first-person hands |

## Rig and rendering

- `root` (Group, origin at the feet, faces -Z) → `rig` (Group, uniform scale = `look.height`) → bones (`THREE.Bone`, a nested
  Object3D hierarchy): `hips → spine → chest → neck → head`; `chest → shoulderL/R → upperArm → forearm → hand → index`;
  `hips → thigh → shin → foot`. Rest pose has identity rotations (arms down, legs straight).
- Body = one `SkinnedMesh` (rigid weights, blended across hips/spine/chest for the torso and across hips/thighs for the skirt)
  using a 16×1 palette texture, so every outfit colour is a palette slot and **geometry is shared** by all characters with the
  same (adult, build, gender, outfit shape, bottom). Head (face canvas material), hair (+ glasses/accessories, palette material)
  and each swinging hair piece are rigid meshes on the head bone.
- Outline: inverted hull (`BackSide`, vertex extrusion along normals × per-vertex `aOutline` weight × view depth, so the line
  keeps a roughly constant pixel width). Head, hair and body (torso full weight, limbs reduced, small details 0). Disabled
  (not created) in `?lowfx=1`.
- **Draw calls per character**: lowfx 3–5 (body, head, hair, +1 per swinging hair piece); normal mode 6–10 (each of those plus its
  outline). +1 for a visible emote, +1–3 per held prop. Shadow pass adds the same count again for shadow casters
  (body/head/hair). Budget ≤ 20 is met with margin.
- Kid proportions: hips 0.77 m, head radius 0.2 × 1.16 (≈1:3.7 head-to-body); seated head centre ≈ 1.08 m
  (`HEAD_Y_SEATED`), seated pelvis rests on `CHAIR.seatY`, seated feet are IK-planted on the floor, seated hands are
  IK-placed on `DESK.topY`. Adults (teacher/npc): longer legs/torso, ~1.75 m.

## Spec handling (graceful degradation)

Unknown / missing look fields fall back to deterministic defaults derived from a hash of `spec.id`. Colours accept numbers,
`'#rrggbb'`, `'0xrrggbb'`, `rgb()`/`hsl()`, or preset words (`black, brown, light, tan, …`). Unknown `hairStyle` → `short`
(as required); unknown outfit → role default (student `uniform`, teacher `shirtTie`, npc `casual`).

Additions to the spec (optional):
- `look.bottom: 'skirt' | 'pants'` (or `look.skirt: true`) — uniform/casual only; default pants.
- `look.palette: { top, topAccent, shirt, bottom, bottomAccent, shoe, sole, tie, frame, acc, sock }` — per-slot colour overrides.
- `look.accessoryColor` — colour for hairclip/headband/hair ties.

## Character API additions (beyond the contract)

| Member | Meaning |
|---|---|
| `look` | resolved look (read-only) |
| `expression` (getter) | current expression name |
| `held` (getter) | `{L, R, both}` props currently held |
| `layers` (getter) | debug view of the animation layers |
| `isPlaying(name)` | clip active and not fading out |
| `clipDuration(name)`, `clipEvents(name)` | seconds; event times, e.g. `teacherThrowChalk → {release: 0.52}`, `throw → {release: 0.45}`, `catch/pickUp → {grab}`, `unfold → {open: 0.75}` |
| `onClipEvent = (clip, event) => {}` | optional callback fired at those event times |
| `hold(prop, 'L'|'R'|'both')` | `'both'` holds a prop between the two hands (used for the open letter) |
| `drop(hand='R') → prop` | detach the held prop keeping its world transform (re-parented to the scene) — e.g. hand the chalk to `scriptedThrow` |
| `talk(sec)`, `setTalking(bool)` | mouth flaps (also automatic for `say` events with a matching `charId`, duration estimated from the text) |
| `setGlint(bool)` | anime glasses glare (only drawn if the character wears glasses); several teacher clips glint automatically |
| `setOutline(bool)`, `blink()`, `drawCalls` | misc |
| `parts` | every bone by name, plus `pelvis` (= hips), `torso` (= chest), `headCenter`, `gripL/gripR/gripBoth`, `body`, `face`, `rig`, `root` |

`ctx.characters` also exposes `get(id)`, and the name lists `clips`, `expressions`, `emotes`, `props`, `hairStyles`.

## Animation system

- Each update: base posture pose (sit/stand) → default idle (`sitIdle`/`idle`, always running underneath, teacher stands
  with hands behind the back) → layers (crossfaded by weight) → breathing → look-at overlay → FK → IK (hands/feet) → hair
  springs → face → emote. Time comes only from the `dt` passed by `ctx.cast` (slow motion and fast-forward are exact).
- Two tracks: loops (and held results) on track A, one-shots on track B over them. A new loop replaces the old loop; a
  one-shot overlays and fades back to whatever loop is underneath (e.g. `sneeze` during `write`).
- `play()` promises: one-shots resolve via `ctx.time.wait(dur / speed)` — they resolve even if the character is hidden (cast
  does not update hidden characters) — or when interrupted by another clip on the same track. Loops resolve immediately.
- `loop: true` on a one-shot clip loops its "hold" segment (e.g. `raiseHand`, `stretch`, `turnBack`, `point`, `cheer`,
  `blushShy`, `wave`, `gasp`, `facepalm`, `teacherPointAt` keep the pose until `stop()`).
- Persistent results: `standUp` ends in posture `stand` (stepped ~0.34 m toward the nearest aisle when in the classroom so the
  body clears the chair; `walkTo` bakes that offset into `root.position`); `sitDown` returns to the chair; `unfold` ends
  holding the open letter in front of the face (hold pose until the next clip); `faint` stays lying down.
  `setPosture(p)` with the current posture is a no-op (keeps the aisle offset).
- Auto props: `write` pencil, `eat` snack, `phone` phone, `read` letterOpen, `unfold` letterBall → letterOpen, `teacherWrite`
  / `teacherThrowChalk` chalk (released at the `release` event), `teacherDrink` thermos, `teacherLecture` book — only if that
  hand is empty; removed when the clip ends (except the unfolded letter).
- Clips that aim (`point`, `teacherPointAt`, `catch`, `teacherThrowChalk`) aim at the current `lookAt` target if one is set.
- `teacherTurn` is the over-the-shoulder "tell" (head first, then shoulders, glasses glint); it does **not** change root yaw —
  use `faceTo(yaw, dur)` for the actual turn. `faceTo` adds small in-place steps for big turns when standing.
- `walkTo` stands up first if seated, turns, then walks (`walk`, or `run` when speed > 2.2 m/s); in the classroom the root
  follows the platform height (0.2 m on the 讲台).

## Colliders

`getColliders()` (cached per frame): head sphere (r ≈ 0.215 × height × head scale), torso AABB from an oriented box in spine
space (so it follows bends), and when a hand is above shoulder height, a forearm sphere and a hand sphere (r 0.06). Tags
`head`/`body`, or `teacher` for the teacher (ownerId `'teacher'`). Collider objects are rebuilt once per frame (stable within a frame); each call returns a new array.

## FP arms

`createArms()`: two hands with sleeves (uniform blue, white stripes and cuffs; girls get slimmer sleeves and a pink scrunchie).
Spring-driven, camera-space targets per state; `study`/`write` targets are anchored on the player's desk in world space
(falls back to camera space if the camera is > 1.2 m from the player's eye). `charge` raises and pulls back the hand with
tremble above 85 %; `throw` whips forward for 0.3 s then drops out of view. `handWorld()` = the ball in the right hand.

## Props

`createProp(name, opts?)` — all contract names plus `pencil`; unknown names → a blank card (warning, never throws).
Geometry/materials are shared between instances: clone the material before changing opacity/colour.
`confetti` is an `InstancedMesh` of heart scraps that flutter down to `opts.floorY` (default 0) on the game clock while it is
in the scene; `opts.count`, `opts.spread`, `opts.fall=false`; `prop.userData.reset()` restarts the fall.
Each prop has `userData.grip` (hand offset) used by `hold()`.

## Dev scripts

`dev/characters/lineup.js`, `hair.js`, `faces.js`, `clips.js`, `classroom.js`, `arms.js` →
`node tools/shot.mjs --script dev/characters/<x>.js --out dev/characters/shots`.

## Face and matrix update performance

The face cache key includes only visible animation channels: tear frames invalidate `cry`, blink
frames invalidate blinkable eyes, and talk frames invalidate mouths that actually change shape.
Expression and gaze changes still update immediately. Internal spring, emote and collider reads
reuse world matrices already refreshed by the pose/collider update. Public `headWorld()` and
`handWorld()` still refresh their ancestor chains, including after a cutscene teleport.

Collision refreshes now walk only the parent-ordered paths for the head, spine and arms. They skip
render-only hair/outline/prop nodes and leg bones while still updating root transforms after a
teleport. `dev/perf/colliders.js` compares these matrices against a full hierarchy update across
96 character/clip cases, including 72 raised-arm cases.
