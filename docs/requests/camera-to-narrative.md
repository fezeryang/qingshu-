# camera → narrative

All presets in contract §4.5 exist and always resolve, even with bad arguments (a warning is logged
once). The full option list is in `docs/modules/camera.md`. The things most likely to matter for the
endings are:

- **Units:** `shot/cut` `roll` and `dutch(angleDeg)` are in degrees. `orbit` `fromYaw/toYaw` prefer
  degrees (non-integer values within ±2π are read as radians). Orbit yaw = direction from the target to the
  camera in the character convention (0 → camera at −Z of the target). `orbit.height` = absolute camera Y
  (as in the stub).
- **slowMo(scale, dur)**: `dur` is in real seconds. Slow motion is cleared automatically on `card`,
  `title`, `aim` and `round:setup`, so a forgotten slow-mo can't leak into the next round.
- **Landing beat:** on `ball:landed` the camera cuts to a 0.6 s low-angle freeze-frame of the ball and the
  recipient (UI clock). Any shot you call supersedes it immediately. If you want to let it play first,
  `await ctx.cam.afterLanding()` (*addition*).
- **Effects layer is under the UI:** captions/dialogue show on top of `fade(1)` and a closed heart iris
  ("caption over black" works). `ctx.cam.setFxOverUI(true)` flips that if a transition must hide the UI.
- **irisHeart('out', dur, target)** accepts a Character / char id to centre the heart on a face. 'out'
  stays closed until `irisHeart('in')`, a `fade`, the next round, or the `title`/`aim` phase.
- A new camera move supersedes the running one, whose Promise resolves at once, so
  `Promise.all([cam.orbit(...), ui.say(...)])` patterns are safe.
- `wide('classroom')` has built-in framings `classroom.camWide|camBack|camFront|camWindow|camHigh`.

## Fix round 1 (BUG-005): no change needed, one suggestion
The camera now hides, for the render only, classmates whose heads are right in front of the lens. In a
single-subject shot it also hides a same-depth neighbour whose face is half-cropped by the frame edge. This
fixes the `front()` close-ups in confetti / caught_read / perfect without any story change. Suggestion for
a later pass: `front()` in `cutscenes/common.js` could call `ctx.cam.closeUp(ch, {side, dist, fov, dur})`.
It already searches for an angle that is clear of geometry and third-person heads.

## Playtest 1: new presets for the 6–10-shot endings
Three additions are available on `ctx.cam` (details in `docs/modules/camera.md` → "New presets"):

```js
await cam.whipPan('crush');                              // snap-look to a reaction (0.24 s, speed-line streak)
await cam.reactionCutaway(ch, { hold: 0.8 });            // quick comic cut to a classmate's face, clear angle, small dutch
await cam.pushIn(crush, { dur: 1.5, amount: 0.4 });      // slow dramatic dolly toward a face
```

Suggested rhythm for comic beats: line → `whipPan(listener)` → `reactionCutaway(other, {hold: 0.6})` →
back to a `twoShot`. `reactionCutaway` picks its own clear angle, so it is safe to point at any seated
classmate. Your `front()` framings also benefit from the automatic foreground clean-up (fix round 1).
