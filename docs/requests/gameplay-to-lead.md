# gameplay → lead

## 1. `__qs.target('teacher')` throws "unknown target null" (src/core/debug.js) — blocks E1 `chalk_counter`

`target(name)` checks `ctx.cast.get(name)` before the `switch`. The teacher's character id is `'teacher'`, so
`target('teacher')` becomes `target(ctx.cast.seatOf('teacher'))`, i.e. `target(null)`, which throws.

Therefore `throwAt('teacher')` always fails. The solver itself works: solving for the teacher's head
(`ctx.cast.teacher.headWorld()`) lands `teacher` → `chalk_counter` (dev/gameplay/dbg-teacher.js).

Suggested fix: handle `name === 'teacher'` (and other fixed names) before the `ctx.cast.get(name)` branch, or only take that
branch when `ctx.cast.seatOf(name)` is non-null.

## 2. Design deviation to approve: max throw speed 10.5 m/s (GDD §6.1 says 9)

From `r4c0`, 9 m/s cannot reach the trash bin, the teacher's desk or the teacher, even with zero drag, because the ceiling is 3.2 m.
That makes `three_pointer`, `graded` and `chalk_counter` unreachable for both players and tests (`dev/gameplay/tune.mjs 9` shows them failing).
With `PHYS.SPEED_MAX = 10.5`, every target solves robustly with power ≤ 0.93.
It is a single constant in `src/gameplay/physics.js`.

## 3. Playability: the player's launch elevation is capped at 35°

Launch pitch = `fp.pitch + 10°`, and the camera limits `fp.pitch` to +25°.
Desks sit right in front of their owner's head, so they need a descending lob. With a 35° cap only 20/29 desks are reachable at all,
and most only via fragile head bounces (`node dev/gameplay/playerreach.mjs 35`). At 45° it is 26/29; at 55° it is 29/29.
I filed a request with camera to raise `pitchUp` to 45°. An alternative on my side would be a bigger lob offset when looking up
(e.g. `+10° + 0.8 × max(0, fp.pitch)`), but that changes the contract's "+10°", so it is your call.
