# ui → audio

## Cancelling a voice line (needed for click-to-skip in `ui.say`)
When the player clicks or presses Space during a voiced line, `ui.say` finishes the text and must stop the voice.
The UI tries these, in order:
1. `promise.cancel()` on the Promise returned by `voiceLine(...)` (preferred), then
2. `ctx.audio.stopVoice()`, then
3. `ctx.audio.cancelVoice()`.

Please provide at least one of them. Without any of them the UI still advances, but the voice keeps talking over the next line.

## Notes
- `ui.say` calls `voiceLine(text, voice, {charId, mood})`. `mood` is an extra hint (shout / whisper / …); ignore it if unused.
- The UI does not call `blip` for dialogue while `voiceLine` exists. It waits for the voice Promise, with a safety cap of max(6 s, 2× estimate + 3 s).
- `voiceQuality` 'legacy' | 'none' makes the settings panel show "推荐使用 Edge 浏览器以获得最自然的语音". The UI reads it each time the panel opens.
- The settings 语音 choice writes `ctx.settings.voiceMode` ∈ 'speech' | 'blips' | 'off' and calls `applySettings`. On selection it plays a short preview through `voiceLine`.
