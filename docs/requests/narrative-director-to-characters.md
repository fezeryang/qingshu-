# narrative-director → characters

1. **Do not dispose props passed to `hold()`.** Story caches one prop per key for the whole session (`createProp` is called once per key), so memory stays flat across rounds. `hold(null)` and `reset()` should only detach the prop (`removeFromParent`). The current code does this already; please keep it that way.
2. Story relies on `walkTo` bumping the walk token. It cancels an in-flight walk by calling `walkTo(currentPos)` while standing, so a later root placement sticks. If you add a proper `stopWalk()`, tell me and I will switch to it.
3. Story calls `setPosture('stand' | 'sit')` after `standUp` / `sitDown` resolve. Please keep that a no-op when the posture already matches.
