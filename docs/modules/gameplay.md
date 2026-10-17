# Gameplay module (`src/gameplay/`)

Owner: qs-gameplay-engineer. Contract: `docs/CONTRACTS.md` §4.3 (`ctx.gameplay`) and §5 (Collider, Landing).

## Files

| File | Role |
|---|---|
| `index.js` | `install(ctx)`: input (charge / study / hold breath / nudge), FP arms, live ball, events, `ctx.gameplay` |
| `physics.js` | Deterministic ball physics. Imports only `three` + `core/layout.js`, so it runs in Node |
| `landing.js` | Physics result → contract `Landing` (pure) |
| `solver.js` | `solveLaunch`, verified by simulation |
| `fx.js` | Ball view (tumble, squash, settle wobble, hand-to-origin blend), trajectory dots, paper bits |
| `debugdraw.js` | `?debug=1`: collider wireframes and predicted flight path |

Dev and test files live in `dev/gameplay/`:

| File | Purpose |
|---|---|
| `physics.test.mjs` | 35 Node unit tests |
| `refscene.mjs` | Node reference classroom |
| `sweep.js` | C1 seat sweep |
| `random.js` | C2 stress test plus named targets |
| `mechanics.js` | Input mechanics check |
| `shots.js`, `charge.js` | Screenshot scripts |
| `tune.mjs`, `playerreach.mjs` | Tuning helpers |

```
node dev/gameplay/physics.test.mjs
node tools/shot.mjs --script dev/gameplay/sweep.js     --out dev/gameplay/shots
node tools/shot.mjs --script dev/gameplay/random.js    --out dev/gameplay/shots
node tools/shot.mjs --script dev/gameplay/mechanics.js --out dev/gameplay/shots
node tools/shot.mjs --script dev/gameplay/shots.js     --out dev/gameplay/shots
```

## Physics

- **Fixed step and sub-steps.** The fixed step is `H = 1/240 s`. Each step is split into sub-steps so the ball moves at most `0.45 R` (1.8 cm) per sub-step. Because of this, no contact is ever skipped and the centre never crosses a face, so thin desk tops, glass and bin walls cannot be tunnelled.
- **Contacts.** Up to 3 resolution passes handle corners, edges and wedges.
- **Frame-rate independence.** The live ball uses an accumulator with render interpolation. Its trajectory is therefore bit-identical to the solver's and `predict`'s, whatever the frame rate or slow motion.
- **Forces.**
  - Gravity 9.8.
  - Air drag `a = −(0.016|v| + 0.03) v`.
  - Wind: only for `x < −2.6`, ramping up toward the window, `1.6 m/s² × strength` along `classroom.wind.dir`.
  - Telekinesis: `1.0 m/s²` sideways (lowered from 2.5 by lead decision: ≈0.5–1 m landing shift at full willpower) relative to the flight direction. It is flipped when the camera looks back at the ball, so "A" is always screen-left.
- **Contact response.**
  - Restitution along the normal. Paper gets deader at speed: `e × clamp(1.12 − 0.08·v, 0.45, 1)`. Contacts slower than 0.3 m/s are perfectly inelastic.
  - Coulomb friction impulse.
  - Rolling resistance on supports (`roll × g`) with static stick.
  - Moving colliders impart their surface velocity: fan blades use their `velocity`; character colliders get a velocity estimated from frame-to-frame motion, clamped to 3 m/s.
- **Materials (`MATERIALS` in physics.js).** A collider's own `restitution` / `friction` override the per-tag defaults.

  | Tag | e | mu |
  |---|---|---|
  | wood (desk, chair, podium) | 0.3 | 0.5 |
  | book | 0.2 | 0.6 |
  | head | 0.55 | 0.3 |
  | body | 0.3 | 0.6 |
  | teacher | 0.5 | 0.4 |
  | floor | 0.25 | 0.6 |
  | wall | 0.35 | 0.4 |
  | glass | 0.4 | 0.2 |

- **Landing triggers.**
  - Rest: support normal y > 0.5 and speed (relative to the support) < 0.12 m/s for 0.25 s.
  - Wedged: touching anything while slow for 0.6 s.
  - A trigger is entered.
  - A fan blade is touched.
  - Timeout after 7 s.
- **Safety net.** A last-resort room containment check (the room box, plus the open-window aperture) counts interventions in `sim.guard`. It never fired in the 2000-throw Node test or the 200-throw browser test; if it ever does, a world collider is missing.
- **Malformed colliders.** Unknown kind, NaN, or missing fields are skipped, never fatal. There is also a NaN guard.

### Deviation from GDD §6.1: `SPEED_MAX = 10.5 m/s` (GDD: 9)

From the player's seat, a 9 m/s throw cannot reach the trash bin (~9.3 m away), the teacher's desk, or the teacher, even in vacuum (ceiling 3.2 m). Those are the `three_pointer`, `graded` and `chalk_counter` endings. At 10.5 m/s all of them, and every desk, solve robustly with power ≤ 0.93. The speed is one constant, `PHYS.SPEED_MAX`; the lead may revert it.

## Landing classification (`landing.js`)

Priority order:

1. Any hit on a `teacher` collider → `teacher`. This outranks everything (GDD §7).
2. A fan → `fan`, with `fanId`.
3. Trigger `trash` → `trash`; other triggers → `outside`.
4. Otherwise, by the **last support**:

| Last support | Type | seatId / ownerId |
|---|---|---|
| desk, chair, book (ownerId = seat) | `desk` / `chair` (`self` if it is the player's seat) | seatId = the seat; ownerId = `cast.occupant(seat)` |
| podium, teacherDesk | `podium` | |
| a person's head/body (lap, shoulder, top of head) | `chair` at that person's seat | ownerId = that person |
| floor | `floor` | adds `nearSeatId` |
| props / unknown | the desk underneath if the point lies on one, else `floor` | |

Extra Landing fields: `support {tag, ownerId}`, `reason` (`rest`/`trigger`/`fan`/`timeout`/`intercept`), `fanId`, `nearSeatId`.

## Solver (`solver.js`)

1. **Goal.** The goal is derived from what contains or touches the target:
   - a trigger (bin / outside), or a fan disc;
   - a seat (desk / chair / book with that seat id);
   - the podium, the teacher, or a person (the first hit must be them);
   - the floor (lands on the floor within 1 m);
   - otherwise "near the point" (within 0.35 m).
2. **Pitch order.** Pitches are tried in preference order:
   - `lob` (default): 58, 62, 54, 66, 50, … then low and steep fallbacks.
   - `flat`: starts at 8°.
   - `pitchDeg` tries ±16° around the given value first.
   - `minPitchDeg` / `maxPitchDeg` restrict the range.
3. **Power by bisection.** For each pitch, the power is bisected so the obstacle-free, drag-correct arc passes through an aim point. This arc uses a lightweight 1/120 s integrator, because it only picks the aim power. Aim points are the target plus small along/side offsets; seat targets include forward offsets (+0.12 m) so the ball can land beyond the occupant's head. Arcs that would scrape the ceiling, or cross a spinning fan's disc, are pruned.
4. **Verification.**
   - Every candidate is fully simulated: static colliders + a snapshot of `cast.colliders()` + non-fan dynamic colliders. Fan discs act as keep-out zones; for the `fan` goal, success means lingering ≥ 0.1 s in the blade plane.
   - **Pass 1, "clean"** (BUG-001): characters are inflated (heads +4 cm, bodies/arms +3 cm) and any contact with them is rejected. A path that touches nobody in the inflated scene touches nobody in the real scene either. Its outcome is then decided by the static world alone, independent of head animation or gaze tracking.
   - **Pass 2, "contact"**: runs only when pass 1 finds nothing (or only a fragile path, robust < 2). It uses the real snapshot and allows character contacts, e.g. a bounce off a head. Goals of kind `person` use only this pass.
   - Successful candidates are re-run with yaw ±0.26° and power ±0.004 (in the same pass's scene) to measure robustness (0–4).
   - The first candidate with robust 4 and the rest point within 0.2 m wins. Otherwise the best candidate found within the budget wins.
5. **Deterministic budget** (BUG-003): at most `opts.maxSims` (240) full simulations and `opts.maxArcs` (9000) arc evaluations. The same scene and target always give the same answer, whatever the machine load. `opts.budgetMs` (2500) is only a safety cap far above the real cost. Measured costs: 5–40 simulations for most targets, ~120 for the hardest (r0c4, r3c5, podium), typically 5–120 ms on an idle machine.
6. **Return value.** `{yaw, pitch, power, expect: {type, seatId, ownerId, pos, flightTime}, goal, robust, clean, pass, sims, arcs, ms}`. `clean` means no character contact.

## Input feel (`index.js`)

- **Charging.** `Mouse0` charges `0 → 1` over 1.1 s with ease-out (`1 − (1 − t)²`). After that the power wobbles smoothly between 0.85 and 1, as a sum of two cosines whose frequencies come from `ctx.rng.fork('gameplay')` each round.
- **Release.** Releasing `Mouse0` launches with `yaw = fp.yaw`, `pitch = fp.pitch + 10°`, speed `2.2 + power × 8.3` m/s.
- **Studying.** `Mouse2` / `Space` toggles studying and emits `aim:study {on}`. Pressing it mid-charge cancels the charge and emits `aim:cancel`. Charging is impossible while studying.
- **Launch origin.** `launchOrigin()` depends only on `PLAYER_EYE` and the current `ctx.cam.fp` yaw/pitch: 0.17 m right, 0.13 m down, ~0.29 m forward. It never depends on the arm animation. At launch the ball mesh starts at `arms.handWorld()` and blends into the physical path over ~0.1 s; this is visual only.
- **Trajectory dots.** While charging, 14 `Points` dots (one draw call) show the first 0.35 s of the real simulated arc. They update every frame with power and view.
- **Hold breath (flight).** Holding `Space` sets `willpower.active` and emits `ball:willpower {on}`. Willpower drains over 1.5 s of game time, once per throw. `KeyA` / `KeyD` push the ball sideways while it is active.
- **FP arms.** Visible only in the aim phase (camera request):
  - `holdBall` / `charge` (with `setCharge`) / `study`, and `throw` until the flow switches to flight.
  - On every other phase change they are set to `hidden` immediately, including endings with no throw (`caught_read`, `coward`).
  - They are also hidden whenever `ctx.cam.mode !== 'fp'`.
- **Incidents.** Gameplay pushes these to `ctx.round.incidents` and emits `incident`:
  - `{kind: 'wind', pos, drift}` once per flight, when wind displaced the ball by > 0.1 m;
  - `{kind: 'fanHit', id, pos}`.

## Additions to `ctx.gameplay` (beyond the contract)

| API | Purpose |
|---|---|
| `holdBreath(on)` | Test hook equivalent to holding Space during flight |
| `release()` | Stop snapping an intercepted ball to the catcher's hand. It snaps for up to 6 s; it also stops when story re-parents or hides `ball.mesh` |
| `lastSolve` | The last `solveLaunch` result, including `expect`, `robust` and `ms` |
| `PHYS` | Tuning constants (read-mostly) |
| `debug.{sim, live, staticGrid, fans, predictPoints}` | Internals, for tests |
| `ball.landing` | The last emitted Landing |
| `ball.support` | Last support `{tag, ownerId}` |
| `ball.nearMisses` | Near misses this flight |
| `ball.power` | Power of the current throw |
| `predict(spec, seconds)` | Also accepts `{vel}` or `{origin}` overrides. Returns points every 1/60 s and stops at the landing |
| `solveLaunch(target, opts)` | Also accepts `opts.maxSims`, `opts.maxArcs`, `opts.budgetMs` (safety cap), `opts.minPitchDeg`, `opts.maxPitchDeg` |

## Notes for other modules

- **Mesh ownership.** `ball.mesh` is a Group: mesh → squash → spin → `createProp('letterBall')`. After landing, gameplay stops writing the mesh transform, apart from a short squash/wobble or while following a catcher. Story may move it or re-parent it; on `round:setup` it is put back in the scene and hidden.
- **Intercepts.** `intercept(charId)` works for students and `'teacher'`. It returns `true` if the ball was flying.
- **Near misses.** Measured from the head surface (`|ball − head| − r ≤ 0.35`), once per person, only if the ball never touched them.
