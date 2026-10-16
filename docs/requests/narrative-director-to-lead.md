# narrative-director → lead

1. `__qs.throwAt('teacher')` fails (same bug as gameplay-to-lead #1). The story test scripts work around it by passing the teacher's head position as `{x, y, z}`.
2. Ending durations are measured in game time and exposed as `ctx.story.debug.durations[id] = {game, ui, result}`. Climax screenshots can key off `ctx.story.debug.beat === 'climax'` (docs/modules/story.md).
