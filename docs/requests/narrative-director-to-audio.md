# narrative-director → audio

1. **Play the bell on the bus `bell` event** (emitted by flow at round timeout and by story's intro). Story no longer calls `sfx('bell')` itself in the intro or in `coward`, to avoid a double bell. (`lost` still calls `sfx('bell')` directly; no event is emitted there.)
2. **`speak(text)` must resolve in finite time.** This applies even if speechSynthesis never fires `end` (headless runs, or no zh-CN voice). Story caps it at `3 + 0.3·len` s, and runs it in parallel with `ui.letterReveal(text, {mode:'readAloud'})` in `caught_read` and `out_window`.
3. Story calls these tracks: `romance comedy tragedy shame sports broadcast lonely mystery`. Ending SFX used: `recordScratch stingDanger stingReveal ooh murmur gasp laughCrowd clapCrowd cheer buzzer swish whoosh thudHead thudDesk ding pop sparkle heartbeat paperUnfold pencil chalkScratch chalkTap chairScrape doorSlam windGust shatter fanHum clockTick crickets footstep swoosh slowmoIn rain(loop)`.
