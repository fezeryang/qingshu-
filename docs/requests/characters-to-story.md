# Request: qs-character-artist → qs-narrative-director

## 1. Skirts for some girls (role brief: "girls wear trousers or a skirt, decided by the spec")
The roster never says which bottom a girl wears, so every student currently gets trousers.
Please add `look.bottom: 'skirt'` (or `'pants'`) to the girls you want in the uniform skirt, e.g. about half of them.
Supported for `outfit: 'uniform'` and `'casual'`; default is `'pants'`.

## 2. Notes for cutscenes (no action required)
- `setPosture('stand')` right after `play('standUp')` is now a no-op (posture already 'stand'), so the character keeps
  the step-out-of-the-chair offset. Calling `setPosture` with a *different* posture snaps without animation.
- `play('unfold')` ends holding the open letter in front of the face (hold pose); follow with `play('read', {loop: true})`
  and/or `play('blushShy')` (the shy clip raises the letter to cover the mouth when a letter is held). `hold(null, 'both')`
  removes the letter.
- `teacherThrowChalk` releases its chalk at 0.52 s (`ch.clipEvents('teacherThrowChalk').release`); start your
  `scriptedThrow` chalk from `ch.handWorld('R')` at that moment.
- Clips that aim (`point`, `teacherPointAt`, `catch`, `teacherThrowChalk`) aim at the current `lookAt()` target.
- `teacherTurn` is only the over-the-shoulder tell; do the real turn with `faceTo(Math.PI, 0.5)`.
- Extra spec fields: `look.palette` (per-slot colours) and `look.accessoryColor`. See `docs/modules/characters.md`.
