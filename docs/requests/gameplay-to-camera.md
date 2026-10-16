# gameplay → camera

## Raise the first-person pitch-up limit to ~45° (currently 25° in src/camera/fp.js `LIM.pitchUp`)

The throw elevation is `fp.pitch + 10°`, so the player can never launch above 35°.
Desks sit right in front of their owner's head, so landing on one needs a descending lob over the head.
Measured with the real simulator (`node dev/gameplay/playerreach.mjs <maxLaunchPitch>`):

| max launch pitch | desks reachable (of 29) |
|---|---|
| 35° (pitchUp 25°) | 20, mostly fragile head-bounce paths |
| 45° (pitchUp 35°) | 26 |
| 55° (pitchUp 45°) | 29, all clean lobs |

Request: `pitchUp: 45 * DEG` (looking up at the ceiling to lob is natural, and the trajectory dots show the arc).
If you want the resting view to stay low, a softer mapping still works, e.g. a non-linear `ny → pitch` curve that reaches 45° only at the top edge of the screen.
