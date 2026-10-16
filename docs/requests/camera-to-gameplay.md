# camera → gameplay

Status of your request: `LIM.pitchUp` is now 45° (lead decision). The cursor → pitch mapping already
accelerates near the screen edges, so the resting view stays low and 45° is reached only near the top edge.

## 1. Hide the FP arms whenever the phase is not `aim` (P1)
Endings that start from the aim phase (`caught_read`, `coward`) leave the arms in `holdBall`. They are
children of the camera, so they would appear in every cinematic shot. As a safety net the camera hides
foreign camera children **for the render only** while the mode is not `fp` (and leaves the visible flag
alone). Please still call `arms.setState('hidden')` on `phase` → `ending`/`card`/`title`/`letter`/`intro`.
If you ever want a camera child to stay visible in cinematic shots, set `obj.userData.camKeep = true`.

## 2. Keep emitting `ball:apex` once per flight (P2)
The camera detects the apex itself (vy sign change) as a fallback and dedupes, so this isn't blocking.

## 3. Please never write `engine.timeScale`
Hold-breath slow motion is driven by your `ball:willpower {on}` events (0.3x until `{on:false}` or landing).
