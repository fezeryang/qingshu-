# Interface Contracts (lead-owned; binding on every agent)

> This is the "law" that lets several agents build in parallel. **Do not rename or change the signature of any API, event or convention listed here.**
> You may **add** methods/fields to your own module (document them in `docs/modules/<module>.md`), but never remove or alter existing ones.
> Need a new capability from another module? Write `docs/requests/<you>-to-<them>.md` and list it in your delivery report; the lead coordinates.
> The current `index.js` in every module folder is a **gray-box stub** written by the lead. It already implements the shape of this contract, and the game is playable end-to-end with stubs only. Your job is to replace your stub with the real implementation while keeping the contract intact.

## 1. Architecture

```
index.html → src/main.js → build ctx → install modules in order → ctx.flow.run()
```

- Each module entry `src/<module>/index.js` exports `async function install(ctx)` and attaches its API to ctx (e.g. `ctx.world = {...}`). Install order: `world → characters → story → cast(core) → stage(core) → ai → gameplay → camera → audio → ui → flow(core)`. **During install you may only use modules installed before you**; access the rest at runtime (events / per-frame updates).
- **Modules never import each other** (`tools/check.mjs` rule R2). You may import only `src/core/*`, `three`, `three/addons/*` and files inside your own folder. All cross-module calls go through `ctx.xxx` and the event bus.
- Per-frame updates: `ctx.engine.onUpdate(fn(dt, time), ORDER.X)`. Order: `INPUT(-100) → AI(10) → WORLD(15) → CHARACTERS(20) → GAMEPLAY(30) → STORY(35) → CAMERA(40) → UI(50) → AUDIO(60)`. `dt` is **game time** (affected by slow motion); unscaled time is `time.uiDt`.
- **Timing rule (R1):** no `setTimeout / setInterval / requestAnimationFrame` anywhere in `src/`. Wait with:
  - `await ctx.time.wait(sec)` — game clock (slows in slow motion, stops while paused)
  - `await ctx.time.waitUI(sec)` — clock unaffected by slow motion (typewriters, transitions)
  - `await ctx.time.tween({ duration, ease, clock: 'game'|'ui', onUpdate(k, raw) })`
  - `await ctx.time.until(pred, timeoutSec, clock)`
  These are all driven by `engine.tick()`, so tests can fast-forward a whole round deterministically with `__qs.advance()`. CSS animations/transitions are fine for purely visual effects, but **any wait the flow depends on** must use ctx.time.
- **Randomness rule (R3):** anything affecting gameplay or endings uses `ctx.rng` (recreated each round from the seed; `ctx.rng.fork('label')` gives an independent stream). Purely cosmetic jitter may use `Math.random()`, but inside `src/gameplay`, `src/ai`, `src/story` the line must end with the comment `// cosmetic`.
- When `ctx.config.lowfx === true` (URL `?lowfx=1`): no shadows, fewer particles, simplified effects. Tests run in lowfx, but **normal mode must look good**.
- Only the **camera module** writes `ctx.engine.timeScale` (flow resets it to 1 at round start). Anyone else who wants slow motion calls `ctx.cam.slowMo()` or emits the relevant event.
- **Per-round reset:** on the `round:setup` event every module clears its transient state (camera: fade/letterbox/PiP off; ui: close overlays, reset HUD; audio: stop loops; world: `setMood('day')`, clear the blackboard; gameplay: hide the ball; ai: teacher back at the board).

## 2. Coordinates and conventions

- Metres, +Y up. Students face **-Z** (blackboard at z = -6). Every layout number comes from `src/core/layout.js` — never hard-code them.
- A character's `root` origin is **on the floor between its feet**; `root.rotation.y = yaw`; at yaw = 0 the character faces -Z. Yaw from a toward b: `yawTo(a, b)` (`src/core/util.js`). Facing vector: `(-sin(yaw), 0, -cos(yaw))`.
- Seated students: `root.position = (seat.x, 0, seat.chairZ)`, yaw = 0. Teacher on the platform: `y = PLATFORM.h (0.2)`.
- Player viewpoint: `PLAYER_EYE` (seat `r4c0`).

## 3. Event bus `ctx.bus`

`bus.on(type, fn) → off`, `bus.once`, `bus.next(type, filter) → Promise`, `bus.emit(type, payload)`.

| Event | Payload | Emitted by |
|---|---|---|
| `phase` | `{from, to, endingId?}` — to ∈ title/letter/intro/aim/flight/ending/card | flow |
| `round:setup` | `{seed, index, crushId, playerGender}` | flow |
| `round:timeout` | `{}` (bell rang, never threw) | flow |
| `bell` | `{}` | flow / story |
| `stage` | `{name}` | stage |
| `input` | `{code, down}` | input |
| `aim:charge` | `{power}` charging started | gameplay |
| `aim:cancel` | `{}` charge cancelled | gameplay |
| `aim:study` | `{on}` pretend-to-study toggled | gameplay |
| `ball:launched` | `{pos, vel, power}` | gameplay |
| `ball:hit` | `{tag, ownerId, speed, pos}` every significant contact | gameplay |
| `ball:nearMiss` | `{ownerId, dist, pos}` passed within 0.35 m of someone's head | gameplay |
| `ball:apex` | `{pos}` | gameplay |
| `ball:willpower` | `{on}` hold-breath on/off | gameplay |
| `ball:landed` | `Landing` (see §5) | gameplay (must fire within 8 s of launch) |
| `teacher:state` | `{state, prev}` | ai |
| `teacher:caught` | `{reason: 'aim'|'ball'}` | ai |
| `suspicion` | `{value}` 0–1 | ai |
| `student:event` | `{kind, id}` kind ∈ stretch/standUp/sneeze/turnAround/raiseHand/witness/catch/flinch/… | ai |
| `incident` | `{kind, id?, pos?}` in-flight accident (wind/fanHit/catch/block/witness/teacherTurn) | ai / gameplay |
| `say` | `{speaker, text, voice, charId?}` a dialogue line starts | ui |
| `cam:mode` | `{mode}` | camera |
| `slowmo` | `{scale}` | camera |
| `ending:shown` | `{endingId, isNew}` | flow |

## 4. Module APIs

### 4.1 `ctx.world` (env-artist)

```js
ctx.world.classroom = {
  name: 'classroom', group,                  // THREE.Group (stage adds it to the scene)
  background, fog, exposure,                 // applied by stage.show()
  colliders: Collider[],                     // static colliders (§5), aligned with visible geometry
  dynamicColliders(): Collider[],            // per frame: fan blades (obb with velocity), etc.
  blackboard: { write(text), append(text), clear(), text },   // chalk text on a canvas texture, supports '\n'
  clock: { set(minutes, seconds) },          // wall clock shows remaining time (or a real clock face)
  windows: [{id, x, z, w, sillY, h, open}],  // same as layout.WINDOWS
  fans: [{id, center, radius, bladeY, spinning, angle, rps}],
  wind: { strength, dir },                   // current gust at the windows (0..1); gameplay applies force; curtains follow
  gust(strength, dur),                       // trigger a gust (called by ai/gameplay)
  setMood('day'|'sunset'|'night'|'rain'),    // lighting mood (endings)
  update(dt, time),
}
ctx.world.buildSet(name) → Set               // ending sets, built lazily once and reused
// Set = { name, group, background?, fog?, exposure?, anchors: {[key]: {pos: Vector3, yaw?: number, look?: Vector3}}, update(dt) }
```

Required ending sets and anchors (story depends on these keys):

| set | Used by | anchors |
|---|---|---|
| `rooftop` | perfect (sunset rooftop) | `left`, `right` (two characters facing each other), `door`, `railing`, `camWide`, `camSunset` |
| `office` | wrong_caught (parents summoned, rain) | `teacherChair`, `student`, `parent1`, `parent2`, `desk`, `camWide`, `camOverShoulder` |
| `cherryPath` | same_gender / wrong_accept montage (cherry-blossom path) | `left`, `right`, `bench`, `camWide`, `camTrackStart`, `camTrackEnd` |
| `court` | three_pointer (basketball court) | `hoop`, `player`, `coach`, `crowd0..crowd5`, `camWide` |
| `schoolyard` | out_window (sports field + PA loudspeaker) | `landing`, `principal`, `speaker`, `flagpole`, `camWide`, `camHigh` |
| `canteen` | spare montage set (canteen) | `tableA`, `tableB`, `camWide` |

(The `lost` ending uses `classroom.setMood('night')`. For `camXxx` anchors, `pos` is the camera position and `look` the look-at point.)

### 4.2 `ctx.characters` (character-artist)

```js
ctx.characters.create(spec) → Character
ctx.characters.createArms() → FPArms          // first-person hands; gameplay parents them to the camera
ctx.characters.createProp(name) → Object3D    // 'letterBall','letterOpen','replyNote','chalk','thermos','book','phone','snack','confetti','redChalk','dustpan','broom','basketball','megaphone'
```

**spec** (produced by `story.makeRoster`):
```js
{ id, name, gender: 'm'|'f', role: 'student'|'teacher'|'npc', trait,
  look: { skin, hairColor, hairStyle, eyeColor?, glasses, height /*0.92–1.08*/, build: 'slim'|'normal'|'sturdy',
          outfit: 'uniform'|'shirtTie'|'suit'|'tracksuit'|'casual'|'janitor', accessory: 'none'|'hairclip'|'headband'|'bandaid'|'earbuds'|'freckles'|'mole' },
  voice: { pitch /*0.5–2*/, speed? } }
// hairStyle ∈ short, buzz, messy, sidepart, curtain, bob, ponytail, twintails, long, bun, braid, combover, bald
```
Unknown values must **degrade gracefully** (fall back to defaults), never throw.
`trait` ∈ `monitor` (class monitor, snitch type), `disciplinarian` (discipline officer, snitch type), `nerd`, `sleeper`, `foodie`, `gossip`, `jock` (PE rep, catches balls by reflex), `artsy`, `chuuni`, `shy`, `clown`, `gamer`, `normal`; the teacher is `strict`; NPCs anything.

**Character**:
```js
{
  id, spec, root /* Group, origin at the feet */, parts: { pelvis, torso, head, ... },
  posture /* 'sit'|'stand' */, setPosture(p),
  play(clip, {loop=false, speed=1, fade=0.2}) → Promise   // one-shot clips resolve when finished; loops resolve immediately
  stop(clip?),
  setExpression(name),            // neutral, happy, smile, blush, love, shock, angry, sad, cry, smug, sleepy, sweat, suspicious, determined, dizzy, embarrassed
  lookAt(target: Vector3|Object3D|null, weight=1),   // head + eye tracking (null = back to neutral)
  emote(kind, dur=1.5) → Promise, // 3D symbol above the head: '!', '?', 'heart', 'hearts', 'sweat', 'anger', 'zzz', 'sparkle', 'blush', 'question', 'music', 'dots', 'skull'
  hold(prop|null, hand='R'),      // attach a prop to a hand
  walkTo(pos: Vector3, {speed=1.1}) → Promise,   // turn and walk in a straight line on the floor plane; resolves on arrival
  faceTo(posOrYaw, dur=0.3) → Promise,
  getColliders() → Collider[],    // world space: head (sphere, tag 'head'/'teacher') and torso (box, tag 'body'/'teacher'), updated with the animation;
                                  // when the arms are above the shoulders (stretch/raiseHand/cheer/catch/standUp…) also forearm/hand spheres (tag 'body'), so a stretching classmate really blocks the ball
  headWorld(target) → Vector3,
  handWorld(hand, target) → Vector3,
  reset(),                        // back to defaults (clips, expression, props, gaze)
  update(dt),                     // called every frame by ctx.cast (do not register your own onUpdate per character)
}
```
Required clips: `idle, sitIdle, write, sleep, yawn, stretch, raiseHand, sneeze, turnBack, chatLeft, chatRight, eat, phone, standUp, sitDown, pickUp, unfold, read, blushShy, nod, shakeHead, cheer, clap, laugh, gasp, facepalm, point, wave, bow, walk, run, dance, cry, faint, shiver, catch, throw, teacherWrite, teacherLecture, teacherTurn, teacherDrink, teacherPointAt, teacherThrowChalk, teacherAdjustGlasses`. Unknown clip → warn once and resolve.

**FPArms**:
```js
{ group /* child of the camera */, setGender(g), setState('idle'|'holdBall'|'charge'|'throw'|'study'|'hidden'|'write'),
  setCharge(0..1) /* arm raise + slight tremble */, handWorld(target) → Vector3 /* where the held ball is */, update(dt) }
```

### 4.3 `ctx.gameplay` (gameplay-engineer)

```js
ctx.gameplay = {
  ball: { state /* 'hidden'|'held'|'flying'|'rest'|'gone' */, pos, vel, t, mesh, hits[], bounces },
  aim: { enabled, charging, power /*0..1*/, studying },
  willpower: { value /*0..1*/, active },       // hold-breath
  launch({yaw, pitch, power} | {dir, power}),  // real physics launch from launchOrigin(); pitch is the actual launch elevation
  launchOrigin() → Vector3,                    // the exact origin launch() uses
  solveLaunch(target: Vector3, {pitchDeg?, mode?: 'lob'|'flat'}) → {yaw, pitch, power} | null,
      // must be verified with the SAME simulator launch() uses (obstacles included): the returned solution really
      // comes to rest on the collider containing target (or enters its trigger) in the current scene.
  predict({yaw, pitch, power}, seconds) → Vector3[],   // trajectory preview (charge dots, tests)
  nudge(x /* -1..1 */),                        // telekinesis nudge (requires hold-breath)
  scriptedThrow({mesh, from, to, height, duration}) → Promise,  // non-physical arc for cutscenes (reply note, chalk)
  intercept(charId),                           // someone (student or 'teacher') catches the ball mid-air: it snaps to their hand and Landing{type:'intercept', ownerId} is emitted
}
```
- Input (aim phase and `ctx.input.enabled`): hold `Mouse0` to charge / release to throw; hold `Mouse2` or `Space` to pretend to study (no charging; pressing it mid-charge cancels). Launch direction = `ctx.cam.fp` yaw/pitch + 10° lob. Flight phase: hold `Space` to hold breath (emit `ball:willpower`), `KeyA/KeyD` nudge.
- Physics parameters per GDD §6.1; `R = BALL_RADIUS`; fixed substeps (≤ 1/240 s); never tunnels through desks/walls; never produces NaN.
- Wind: `ctx.world.classroom.wind` pushes the ball sideways near the windows.
- Landing classification outputs `Landing` (§5). Emit `ball:landed` when the ball rests for 0.25 s, enters a trigger, is hit by a fan blade, or after a 7 s timeout.

### 4.4 `ctx.ai` (ai-designer)

```js
ctx.ai = {
  teacher: {
    character, state /* 'idle'|'writing'|'warning'|'watching'|'fakeout'|'drinking'|'patrol'|'suspicious'|'alert'|'cutscene' */,
    facingClass /* bool: can see the class right now */, suspicion /* = ctx.round.suspicion */,
    canSee(pos: Vector3) → bool,     // view cone + distance + simple occlusion
    force(state, dur), setSuspicion(v),
    setEnabled(bool),                // story disables the AI during cutscenes and drives the teacher itself (state = 'cutscene')
    say(text) → Promise,             // lecture speech bubble (via ui.bubble)
  },
  students: {
    setAmbient(bool),                // ambient fidgeting on/off (off during cutscenes)
    trigger(kind, id?) → bool,       // force a classmate event (tests)
    react(kind, id),                 // immediate reaction to a ball event (hit, near miss, witness)
  },
  playerExposure() → 0..1,           // how suspicious the player looks right now (charging = 1, looking around ≈ 0.2, studying = 0)
}
```
- ai writes `ctx.round.suspicion`, `ctx.round.teacherSawBall`, `ctx.round.caughtDuring`, and pushes accident records to `ctx.round.incidents`.
- While writing, the teacher writes on the board: `ctx.world.classroom.blackboard.append(...)`.

### 4.5 `ctx.cam` (camera-director)

```js
ctx.cam = {
  camera, mode /* 'title'|'fp'|'follow'|'cinematic' */,
  fp: { yaw, pitch, study, getAimRay() → {origin, dir} },
  toFP({instant}), followBall(style?: 'chase'|'side'|'fpStay'), cycleFollowStyle(),
  shot({pos, look, fov=50, dur=0 /*0 = hard cut*/, ease, roll=0}) → Promise,   // interpolate from the current camera
  cut({pos, look, fov, roll}),                                                 // hard cut
  sequence(shots[]) → Promise,
  // presets (all options optional, all return Promises)
  closeUp(char, {side:'front'|'left'|'right', dist=0.7, fov=35, dur=0.6, height}),
  twoShot(a, b, {dur, fov}),
  overShoulder(from, to, {dur}),
  wide(anchorOrSetName, {dur}),
  orbit(target, {radius, height, fromYaw, toYaw, dur}),
  crashZoom(target, {dur}),
  dutch(angleDeg, dur),
  track(object3d, {offset, lookOffset, dur}),        // follow any object (reply note, chalk)
  // effects
  shake(amp, dur), kick(amp),
  slowMo(scale, dur, {ease}) → Promise,              // the only place allowed to write timeScale
  letterbox(on, dur) → Promise, fade(opacity, dur, color) → Promise, flash(color, dur) → Promise,
  irisHeart('in'|'out', dur, screenPos?) → Promise,  // heart-shaped iris transition
  pip(on, {target}),                                  // picture-in-picture (teacher turning mid-flight)
}
```
Automatic behaviour: phase title → establishing shot; aim → FP (cursor position mapped to yaw ±75°, pitch −35°…+45° — the +45° up limit lets players lob at up to 55°; smoothed; looks down at the book while studying; FOV tightens while charging); `ball:launched` → follow the ball (C cycles styles), bullet time at the apex and near landing; mid-flight `teacher:state` warning/watching → PiP + slow motion; `ball:willpower` → slow motion; `ball:landed` → landing freeze-frame shot.

### 4.6 `ctx.story` (narrative-director)

```js
ctx.story = {
  ENDINGS: [{ id, title, subtitle, rarity: 'common'|'rare'|'secret', hint, icon, color }],   // 13, see GDD §7
  letters: [{ id, title, text }],                     // ≥ 3 presets
  makeRoster(rng, playerGender, opts?) → { students: Spec[], teacher: Spec, seatMap: {seatId: id|null}, crushId, playerSeatId },
      // opts.crushId / opts.seatMap override (tests)
  resolve(round) → endingId,                          // the GDD §7 priority table, a pure function
  playIntro() → Promise,                              // class starts + crush reveal (≤ 6 s, click to skip)
  playEnding(endingId) → Promise,                     // immediate reaction + ending cutscene; leaves the game on its final frame
  gallery: { unlocked() → id[], unlock(id) → isNew, reset() },   // localStorage 'qingshu.endings'
}
```

### 4.7 `ctx.ui` (ui-designer)

```js
ctx.ui = {
  title() → Promise<{action:'start', playerGender}>,   // title screen (gallery/settings inside; resolves only on "start"); calls ctx.audio.unlock() on the first click
  letterEditor({presets}) → Promise<{text, presetId}>,
  crumple() → Promise,                                  // hold-to-crumple interaction
  hud: { show(bool), setObjective(text), prompt(text|null) },   // the HUD reads ctx.round / ctx.gameplay / ctx.ai itself every frame
  say(speaker, text, {charId?, voice?, mood?}) → Promise,       // dialogue box: typewriter + blips (ctx.audio.blip), auto-advance (click/Space speeds up)
  bubble(target: charId|Vector3, text, {dur}) → Promise,       // world-anchored speech bubble (lectures, whispers)
  caption(text, {style: 'impact'|'chapter'|'whisper', dur}) → Promise,   // big manga caption ("社死！")
  letterReveal(text, {mode: 'read'|'readAloud'|'grading'|'reply', score?}) → Promise,
  endingCard(ending, {isNew, unlocked, total}) → Promise<'retry'|'rewrite'|'title'>,
  gallery() → Promise,
  toast(text),
  closeAll(),
  debugChoose(choice),            // tests: press an ending-card button programmatically
}
```
The UI is a DOM layer under `#ui-root`; only interactive elements get `pointer-events:auto`. **Never block mouse input to the canvas** (during aim the canvas must receive presses and releases).

### 4.8 `ctx.audio` (audio-composer)

```js
ctx.audio = {
  unlock(),                                   // create/resume the AudioContext on the first user gesture
  music(trackId|null, {fade=1}),              // tracks below; null fades out
  setTension(0..1),                           // adaptive tension layer in the classroom track
  sfx(name, {volume, rate, pos?}),            // one-shot; pos (world space) → simple panning
  loop(name, {volume}) → {set({volume, rate}), stop(fade)},   // looping sound
  blip(voice /*{pitch}*/, char),              // dialogue blip (once per character typed)
  speak(text, {pitch, rate}) → Promise,       // read aloud (speechSynthesis zh-CN, falls back to a blip sequence)
  duck(amount, dur), applySettings(settings),
  debug: { music, recent: [] },               // current track + last 50 audio events (for QA)
}
```
- Tracks: `title, classroom, flight, romance, comedy, tragedy, shame, sports, broadcast, lonely, mystery, victory`
- SFX: `paperCrumple, paperUnfold, whoosh, thudDesk, thudHead, bounceSoft, chalkScratch, chalkTap, bell, heartbeat, stingDanger, stingReveal, sparkle, recordScratch, gasp, laughCrowd, clapCrowd, ooh, murmur, footstep, chairScrape, sneeze, fanHum, windGust, slowmoIn, slowmoOut, pageFlip, pop, swoosh, ding, buzzer, swish, clockTick, sip, doorSlam, rain, birds, pencil, cough, hmm, crickets, cheer, kiss, shatter, typewriter`
- Unknown names: warn once, never throw. The audio module subscribes to events itself for most automatic music/SFX (phase, ball:*, teacher:state…); cutscenes add hand-placed cues on top.

## 5. Data structures

**Collider**
```js
{ kind: 'box', min: Vector3, max: Vector3, tag, ownerId?, restitution?, friction? }        // AABB
{ kind: 'obb', center, halfSize, quaternion, tag, ownerId?, velocity? }
{ kind: 'sphere', center, radius, tag, ownerId? }
{ kind: 'trigger', min, max, tag }                                                         // entering = settled
```
tag ∈ `floor, ceiling, wall, windowGlass, windowFrame, podium, teacherDesk, blackboard, desk, chair, book, trashRim, trash(trigger), outside(trigger), fan, head, body, teacher, door, prop`.
ownerId: desk/chair/book → seat id; head/body → character id; teacher → 'teacher'; fan → fan id.

**Landing**
```js
{ type: 'desk'|'chair'|'self'|'floor'|'podium'|'teacher'|'trash'|'outside'|'fan'|'intercept'|'timeout',
  seatId /* seat it landed on */, ownerId /* character in that seat, or whoever caught it */,
  pos, hits: [{tag, ownerId, t, speed}], flightTime, bounces, nearMisses: [{ownerId, dist}] }
```

**ctx.round** (created by flow; writer of each field in comments)
```js
{ index, seed, playerGender, crushId, roster, letter: {text, presetId},       // flow
  duration, timeLeft,                                                        // flow
  suspicion, teacherSawBall, caughtDuring /* null|'aim'|'flight' */, incidents: [],   // ai (gameplay may push incidents)
  launched, landing,                                                         // flow / gameplay
  endingId, flags: {} }                                                      // flow / story
```

## 6. Debug / test API `window.__qs` (`src/core/debug.js`)

`manual(on)`, `advance(sec)`, `advanceUntil(pred, timeout)`, `render()`, `state()`, `start({seed, playerGender, letter, skipIntro, crushId?, seatMap?, roundSeconds?})`, `target(name)`, `throwAt(name|{x,y,z}, opts)` (name ∈ seat id / character id / 'crush' / 'trash' / 'window' / 'podium' / 'fan' / 'teacher' / 'floor' / 'self'), `throwRaw(sol)`, `forceTeacher(state, dur)`, `setSuspicion(v)`, `runUntilPhase(name)`, `runToEnding(timeout)`, `cardChoice(c)`, `errors`, `events`.

Screenshots: `node tools/shot.mjs --script <script> --out <dir>`; the script runs inside the page with `qs` and `await shot('name')` in scope.

## 7. Performance budget

- Classroom aim view: ≤ 800 draw calls (environment ≤ 250, each character ≤ 20), ≤ 800k triangles; 60 fps on a mid-range desktop GPU.
- Share geometries/materials (classmates use one geometry set plus a few material variants); canvas textures ≤ 1024².
- Boot to title ≤ 3 s (no big downloads); static assets ≤ 15 MB excluding vendor.
- After 10 rounds, `renderer.info.memory` geometries/textures must not keep growing (ending sets are built lazily once and reused).
