# AI module (`src/ai/`)

Owner: qs-ai-designer. Contract: `docs/CONTRACTS.md` §4.4 (`ctx.ai`).

| File | Role |
|---|---|
| `index.js` | `install(ctx)`: wiring, event subscriptions, `playerExposure()`, `ctx.ai` |
| `teacher.js` | Teacher state machine, view cone, suspicion, hearing, blackboard writing, lecture bubbles, locomotion |
| `students.js` | Classmate ambient behaviour by trait, ball reactions, in-flight accidents, P1 mini-scenes, murmur loop |
| `lines.js` | All player-facing Chinese text: board lessons, easter eggs, teacher and classmate lines |

Dev scripts (in `dev/ai/`):

```
node tools/shot.mjs --script dev/ai/timeline.js  --out dev/ai/shots   # 60 s state timeline, D2/D3/D4 timings, natural incident rate (JSON only)
node tools/shot.mjs --script dev/ai/teacher.js   --out dev/ai/shots   # writing / warning / watching / patrol / suspicious / drinking shots
node tools/shot.mjs --script dev/ai/incidents.js --out dev/ai/shots   # each accident via students.trigger, one shot each
```

## When the AI runs

- The teacher is driven only while it is enabled **and** the flow phase is `aim` or `flight`. Entering `aim` always calls `setEnabled(true)`, because the story intro disables the teacher. In every other phase the AI stops moving the teacher (`_settle`), and the story owns him.
- On `round:setup`:
  - The teacher goes to `idle` with suspicion 0 (a `suspicion` event is emitted), the forced state is cleared, a lesson is picked, and the chalk is put back in his hand.
  - Classmates are rebuilt from `ctx.cast`.
  - All random streams are re-forked from `ctx.rng`: `teacher`, `teacherGaze`, `teacherLines`, `ambient`, `incidents` and `trigger`.
- When `aim` starts, the teacher opens with a short `watching` (1.8–2.6 s, with an opening line) and then the cycle runs.
- When `ending`, `card`, `title` or `letter` starts, every classmate the AI touched is restored (clips stopped, seated, gaze and expression neutral, hands emptied). Every async behaviour is invalidated through a generation token.

## Teacher

### State cycle

Durations are game seconds. Random values come from `ctx.rng.fork('teacher')`.

| State | Duration | Eyes | What happens | Next |
|---|---|---|---|---|
| `writing` | 3–7 (× 1→0.62 over the period) | 0 | Faces the board (yaw 0) and chalks the lesson character by character with `blackboard.append`. Walks between board spots; wipes the board at 5 lines. Sometimes mutters over his shoulder | `fakeout` 20%, otherwise `warning` |
| `warning` | 0.5–0.9 | 0 | **Tell.** Chalk stops, the torso turns 17°, the head peeks over the shoulder (`lookAt`), a `?` emote, and sometimes a "嗯？" bubble or `teacherAdjustGlasses` | `suspicious` if suspicion > 0.6; otherwise `patrol` (~10%, more late in the period), `drinking` (~12%) or `watching` |
| `watching` | 2.5–5 (× 1→1.4) | 1 | Turns to the class (`teacherTurn` then `teacherLecture`). The gaze sweeps classmates' heads, and looks at the player more often as suspicion rises. Lecture bubbles every 2.6–4.2 s. Sometimes calls on a student (P1) | `writing` mostly, sometimes `patrol` or `drinking` |
| `fakeout` | 0.9–1.3 | 1 | Half turn (70–85°) and back. At that angle the cone never reaches the player's seat: it is scary but safe | `writing` (1.5–3.5 s) |
| `drinking` | 2–2.4 | 0.25 | Faces the class with eyes closed, holding a thermos, `teacherDrink` | `watching` (short) or `writing` |
| `patrol` | route | 1 | Board → lane behind the desk → aisle x = ±1.4 → down to z 0–1.4 at 0.85 m/s. Pauses facing the back rows, then walks back with his back to the class | `writing` or `watching` |
| `suspicious` | 3–4.5 (extends while ≥ 0.6) | 1 | Glasses adjust, `?` emote, stares at the player (`lookAt`). Walks to the aisle mouth; above 0.8 he walks further down to z = −2.55. Suspicion rises 1.25× faster | `watching` if still ≥ 0.6, otherwise `writing` with "……好好听课。" |
| `alert` | — | 1 | Caught. Points at the player (or tracks the ball), angry face | Stays until the round ends |
| `cutscene` | — | 1 | `setEnabled(false)`: the AI does nothing | — |
| `idle` | — | 1 | Before `aim` | `watching` (opening) |

- Locomotion is done by the AI itself, by setting `root.position` and `root.rotation.y`. It does not use `walkTo`/`faceTo`, so it can be cancelled instantly (round reset, cutscene). Walking plays the `walk` loop.
- Paths go through the lane behind the teacher's desk (z = −5.4) and the aisle mouths (z = −4.3). The step off the platform is a smooth 0.2 m ramp.
- Turning speed is 7 rad/s, so a half turn takes about 0.45 s.

### Vision

`visibility(pos, {occlusion=true}) → 0..1` (added API) is the product of five factors:

- **Eyes**: the per-state factor in the table above.
- **Horizontal cone**: centred on the body yaw. It is fully visible within 38° of centre and fades to 0 at 55°, so the total width is 110°.
- **Vertical cone**: fully visible within 55° of horizontal, fading to 0 at 80°.
- **Distance**: 1 up to 7 m, falling to 0.72 at 12 m.
- **Occlusion**: each classmate head whose sphere (radius 0.16) the line of sight passes through multiplies visibility by 0.55. The total occlusion factor never drops below 0.3.

`canSee(pos)` is `visibility(pos) > 0.25`.

- **Origin**: the teacher's `headWorld()`.
- **Writing and warning**: visibility is always 0, even mid-turn. The back is turned by definition, which makes D3 deterministic.
- **Player check**: the aim point is `PLAYER_EYE`. While charging, the raised arm pokes above the heads in front, so occlusion is ignored and the aim point is 0.3 m higher.
- **Ball check**: occlusion is ignored.
- **`facingClass`**: eyes ≥ 0.5 and the forward vector points toward +Z (z component > 0.35).

### Suspicion

The AI writes `ctx.round.suspicion` every tick. It emits `suspicion` only when the value has moved by 0.05 or more, or reached 0 or 1, so the bus log is not flooded.

**Aim phase:**

- **Studying**: −0.5/s.
- **Exposure > 0 and visible**: `+exposure × visibility × 0.55/s`, multiplied by 1.25 while `suspicious` and by 2 while `alert`.
- **Otherwise**: −0.15/s.
- **At 1**: sets `caughtDuring = 'aim'`, enters `alert` (unless a state is forced), and emits `teacher:caught {reason:'aim'}` once.

**Flight phase:**

- **Ball flying and visible**: `+1.5 × visibility/s`, ×1.4 when the ball is within 3 m of the teacher. There is no decay during flight.
- **At 1**: sets `teacherSawBall = true` and `caughtDuring = 'flight'`, enters `alert` (ball), and emits `teacher:caught {reason:'ball'}`.
- **Ball tracking**: while the teacher can see the ball, his eyes track `ball.mesh` with a `shock` face, which reads well in the PiP.

**Exposure** (`ctx.ai.playerExposure()`):

- Studying: 0.
- Charging: 1.
- Otherwise: `0.2 × smoothstep(22°, 45°, angular distance between ctx.cam.fp yaw/pitch and the blackboard)`. The default forward view (about 21° from the board) counts as "looking at the board" and gives 0.

### Hearing

During `flight`, a `ball:hit` with speed > 2 on head, desk, teacherDesk, podium, book, glass, window frame, blackboard, trash rim, door or chair makes a writing teacher go to `warning` early (0.45–0.65 s, "什么声音？"). He then goes to `watching` with his first gaze on the sound. A `ball:nearMiss` on the teacher does the same.

### Forcing (tests)

`force(state, dur=999)` holds `state` for `dur` game seconds:

- **No natural transitions run while forced**: timers, escalation to `suspicious`, hearing, natural `teacherTurn`, and `alert` on a catch are all suppressed. The state's own behaviour keeps running: writing chalks, watching lectures and sweeps its gaze, a forced patrol loops its route, and a forced fakeout holds the half turn.
- **The pose snaps immediately**:
  - `writing` / `warning`: teleported to a board spot, yaw 0.
  - `watching` / `drinking` / `alert` / `suspicious`: yaw set toward the class or the player.
  - `fakeout`: snapped to the half turn.
- **`teacher:caught` is still emitted** when suspicion reaches 1 during a forced state. The state just does not change to `alert`.
- **The forced state is cleared** on `round:setup` and by `setEnabled(false)`. Call `force` **after** `__qs.start()`.
- **Explicit trigger overrides force.** `students.trigger('teacherTurn')` breaks a forced state, so a test can force `writing` and then trigger a mid-flight turn (F3).

### Blackboard

- **Lessons**: one of four per round (二次函数, 抛物线的应用, 一元二次方程, 圆的切线), each a title plus 7–9 lines. A line is chalked at 4.5–7 characters/s, with a 0.35–0.7 s pause after it.
- **Board spots**: the teacher stands at board spot 0 for the first lines and at spot 1 for later ones.
- **Wipe**: the board is wiped once it holds 5 lines.
- **Easter eggs**: each new line has a 12% chance of being an egg (at most 2 per round), such as "解：设暗恋对象为 x".
- **Writes**: only `append` and `clear` are used, never `write`, so text the story wrote during the intro is kept until the first wipe.

## Classmates

### Ambient

Ambient is active when the ambient flag is on **and** the phase is `aim` or `flight`. It can also be active in `intro` or `ending` if the story calls `setAmbient(true)` during that phase.

- **Mode follows the teacher**:
  - The teacher is `writing` or `drinking`: each student switches to **mischief** after 0.6–3.2 s.
  - `warning` or `fakeout`: alert students (per-trait chance, e.g. gossip 0.9, sleeper 0.08) switch back to **behave** within 0.08–0.4 s. This is a second, social tell for the player.
  - Any facing state: everyone switches to behave within 0.12–0.9 s, except per-trait "oblivious" students (sleeper 65%, gamer 25%, artsy 20%, foodie 12%).
- **Behave** activities: `attentive` (`sitIdle` while looking at the teacher's head) or `notes` (`write`). Nerds and monitors always take notes.
- **Mischief by trait**:

  | Trait | Mischief |
  |---|---|
  | sleeper | `sleep` (+ `zzz`) |
  | foodie | `eat` (snack prop from the clip) |
  | gamer | `phone` |
  | gossip | `chatLeft` / `chatRight` toward the deskmate |
  | nerd | `write` (+ raises a hand) |
  | clown | `turnBack` + smug face toward the row behind / `laugh` |
  | artsy | gaze out of the window, `music` / `sparkle` |
  | monitor / disciplinarian | sit straight; the disciplinarian sometimes glares back (`turnBack` + `anger`) |
  | chuuni | `facepalm` + smug, "吾之右手……" |
  | shy | blushing glance at someone |
  | jock | restless |
  | normal | a mix |

- **Random fidgets** (aim phase only): `yawn`, `stretch`, `nod`, `laugh`, plus trait bubbles.
- **During flight**: no new activities start (keeps the accident rate restrained). Only mode switches and reactions happen.
- **Suspicious teacher**: classmates within 2.4 m of the player glance at the player.
- **Alert (caught)**: the whole class looks at the player, and some show `!`.

### Reactions

These always happen. In a quiet class they are limited to face, emote and gaze.

- **Gaze follows the ball.** Each classmate looks at `ball.mesh` once it is within 75° of their forward direction and within 8 m, or within 1 m in any direction, after a cosmetic 0.05–0.35 s delay.
- **`ball:nearMiss`**: shock face, `!`, and `gasp` (full ambient only).
- **`ball:hit` on a head**: `dizzy` + `?`, then 0.8 s later an angry face, a look toward the player, `anger`, and `turnBack` (full ambient only), i.e. looking for the culprit.
- **`react(kind, id)`**: accepts `nearMiss` / `flinch`, `hit` / `head`, `witness`, `landed` / `desk`, and `catch`.

### In-flight accidents

`students.trigger(kind, id?) → bool`. Each accident emits `student:event {kind: action, id}` and `incident {kind, action, id, pos, natural}`, and pushes `{kind, action, id, pos, t, flightT, natural}` to `ctx.round.incidents`. The `incident.kind` values follow the contract list; `action` carries the specific event.

| `trigger` kind | `incident.kind` / `action` | Effect |
|---|---|---|
| `stretch` | `block` / `stretch` | `stretch` clip (arms above the head, so the arm colliders really block); "啊——好困……" |
| `raiseHand` | `block` / `raiseHand` | `raiseHand` clip; "老师，我有问题！" |
| `standUp` | `block` / `standUp` | `standUp`, stays standing for 1.6 s, then `sitDown`; "老师，我想去厕所！" |
| `sneeze` | `block` / `sneeze` | `sneeze` clip (head jerk); "阿嚏！" + `sweat` |
| `catch` | `catch` / `catch` | Jock reflex. Arms a catch: the hands go up (`catch` clip) when the ball is within 1.4 m, and `ctx.gameplay.intercept(id)` fires within 0.5 m of the hand or the top of the head. An explicit trigger uses 0.75 m and catches immediately if the ball is within 2.2 m. Outside flight, it only plays the pose |
| `witness` | `witness` / `witness` | `turnBack`, shock, `!`, "纸团？"; +0.2 suspicion if the teacher is `facingClass` |
| `gust` (alias `wind`) | `wind` / `gust` | `classroom.gust(0.85–1, 1.5)`; window-side students look at the window |
| `teacherTurn` | `teacherTurn` / `teacherTurn` | Teacher goes to `warning` (0.3–0.45 s), then `watching`. The camera's PiP keys on these `teacher:state` events |

Extra (non-accident) trigger kinds: `yawn`, `turnAround` / `turnBack`, `flinch`, `hit`, `passNote`, `callOn`.

Without an `id`:

- While the ball is flying, the classmate closest to its predicted path is used.
- For `catch`, a jock is preferred (the nearest one).
- Otherwise a trait match is picked: `raiseHand` → nerd or monitor, `stretch` → sleeper or jock, `standUp` → clown or normal.

**Natural rate.** At `ball:launched`, the AI calls `ctx.gameplay.predict({origin, vel}, 3)` (falling back to a ballistic arc) and plans at most one accident per throw:

- **Jock reflex**: if the path passes within 0.65 m of a jock's hand zone, a catch happens with 35% probability.
- **Other accidents**: otherwise, with 30% probability, one accident is picked by weight among the feasible ones:
  - block: a student whose seat is within 0.7 m (horizontally) of the path at arm height, fired 0.45 s before closest approach;
  - sneeze: a head within 0.6 m;
  - witness: within 2.2 m;
  - gust: the path is near the windows;
  - teacherTurn: the teacher is writing and not forced, at 30% of the flight.
- **Samples**: 5 of 12 throws (seeds 200–211) and 2 of 9 throws (seeds 100–109, from `timeline.js`) met an accident, about 33% overall.

**Quiet class.** `setAmbient(false)` stops all of the above (no fidgets, no natural accidents, no reflex catch, no call-on or notes, no body clips in reactions) and restores everyone to seated idle. Explicit `trigger()` still works.

**Stickiness.**

- `setAmbient(false)` called outside `intro`/`ending` (e.g. by a test during `aim`) is **sticky** across rounds until `setAmbient(true)`.
- Called during `intro`/`ending` (the story) it is reset at the next `round:setup`.

### P1 scenes

- **Call-on**: during `watching` (22%, once per state), the teacher says "{name}，你来回答一下。". The student stands, answers (correct for nerd and monitor), the teacher replies, and the student sits down.
- **Scolding**: when the teacher turns, an oblivious slacker is scolded 55% of the time ("{name}！醒醒！"); they startle and straighten up.
- **Note passing**: deskmates (gossip, clown or normal) pass a `replyNote` hand to hand while the teacher writes (every 14–26 s, 60% chance).
- **Murmur**: a `ctx.audio.loop('murmur')` runs in aim and flight. Its volume is 0.04 + 0.32 × (share of the class in mischief), ×0.6 during flight. It is throttled to 4 updates/s and stopped in other phases.

## Added API (beyond the contract)

- `ctx.ai.teacher`:
  - `visibility(pos, {occlusion})`, `playerVisibility()`
  - `addSuspicion(dv)`, `hear(pos)`, `turnEarly({explicit})`, `lookAtChar(char, dur)`, `canSpeak()`
  - `enabled`, `forced → {state, remaining} | null`, `timeLeft`
  - `timeline` (`[{t, state, prev, forced, dur}]` for the current round), `debug()`
- `say(text, {dur})` takes an optional duration.
- `ctx.ai.students`: `ambient` (getter: is ambient active right now), `callOn(id?)`, `passNote()`, `list()` (`[{id, trait, seat, mode, act, busy}]`).
- `ctx.ai`: `STATES`, `INCIDENT_KINDS`, `TUNE` (all tuning numbers), and `debug.timeline` / `debug.teacher()` / `debug.students()`.

## Classroom speech completion

Teacher lectures, patrol remarks, scolding and warnings opt into voiced bubbles. Ordinary voiced teacher lines have a four-game-second gap; urgent warning tells may interrupt. Flight suppresses ordinary lectures and student answers, preserving short warning tells. Bracketed stage directions stay silent.

`teacher.say(text, {voiced, tell, hold})` supports an optional speech reservation (`hold`, game seconds) for call-on exchanges. A call-on waits for the question and answer bubbles before the teacher replies; bubble completion includes the audio duration with a finite timeout. Ordinary lectures also wait while an audio job is active. Reset clears voice-budget state.

The murmur loop is released on scene exit, round reset, and ambient disable, and recreated when ambient behaviour resumes. Chatter volume still follows the fraction of misbehaving students.

Verification scripts: `dev/ai/voice.js` (speech budget and flight tells), `dev/ai/teacher.js` (six state screenshots), and `dev/audio/classroom.js` (integrated speech lifecycle). Acceptance categories D and H cover teacher detection/accidents and audio output.

Explicit `witness` events remain visible when ambient activity is disabled for deterministic QA. An explicit in-flight `catch` starts the reach animation immediately; successful interception still requires the existing distance check. D5 verifies all six reaction poses.
