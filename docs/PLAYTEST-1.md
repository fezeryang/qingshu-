# Playtest round 1 — user feedback and lead decisions

The user played commit `ad723db` on a real GPU. Feedback (translated) and what each owner must do.

| # | User feedback | Decision | Owner |
|---|---|---|---|
| 1 | The voices are wrong — what classmates say and the voices in scenes. | Dialogue is voiced with **real Chinese speech** (speechSynthesis zh-CN, distinct pitch/rate per character, sentence-level) whenever a Chinese voice exists; soft, pleasant blips only as fallback; a setting picks voice / blips / off. New `ctx.audio.voiceLine()`; `ui.say` uses it and waits for it. Audit every scene's voice and crowd sounds for harshness. | audio, ui |
| 2, 7 | Hitting a desk is hard; the ball flies so fast the camera switch can't keep up. | Stylised floaty paper-ball physics: lower gravity and launch speeds so a typical throw flies **1.3–2.5 s** with the same reachable targets; desk tops catch the ball; gentle aim assist toward the desk nearest the predicted landing point; slightly longer charge preview. Camera re-tunes the hand-off and bullet time for the slower flight. | gameplay, camera |
| 3, 4, 5 | Hitting a classmate should have its own scene; after a bonk the ball falls to the floor and you always get the "nobody noticed" ending. A hit classmate could quietly pick it up and peek. | New **recipient rule** (GDD §7): desk → occupant; bonk → the first classmate hit picks it up; floor near a seat → the nearest classmate sneaks it up; only far-from-everyone stays `lost`. New endings `love_bonk` (the ball bonks the crush → meet-cute) and `passed_around` (a gossip peeks and the note is passed around the class). Every recipient ending stages its delivery type. | narrative |
| 6 | Every ending's story could have more shots and be funnier visually. | Each ending gets more beats and shots (aim for 6–10 distinct shots), visual gags, reaction cut-aways from classmates and the teacher, comic timing. | narrative (+ camera presets) |
| 8 | Stop the server and fix the above. | Server stopped. | lead |

Rules for this round: same contracts (updated sections: GDD §6.1 and §7, CONTRACTS §4.6–4.8, ACCEPTANCE E5), same ownership, no commits, Markdown in English. Verify with `node tools/check.mjs`, `--smoke`, your own tests, and a few screenshots you inspect. QA does not run this round — the user will play it directly.

## Addendum — voice realism (user decision)

The user asked for the most realistic voices available. Decision: **pre-render every fixed dialogue line with Microsoft neural voices via `edge-tts`** and ship them as small MP3 files; browser speechSynthesis (best-ranked voice) is only the runtime fallback for text that can't be pre-rendered (the player's custom letter, any line missing from the manifest).

- Pipeline (owned by qs-audio-composer, new exclusive dirs `tools/voices/**` and `assets/voices/**`):
  1. **Harvest**: a headless script records every `voiceLine(text, voice, {charId})` and read-aloud call while running the intro, lecture bubbles that are voiced, and every ending across seeds × player genders × recipients, plus the preset letters → `tools/voices/lines.json`.
  2. **Casting**: `tools/voices/casting.json` maps each character id (and role fallbacks) to an edge-tts voice + small rate/pitch offsets (±10% max) so 23 classmates, the teacher and NPCs sound distinct but natural. Voices: zh-CN Xiaoxiao/Xiaoyi (female), Yunxi/Yunxia (young male), Yunjian/Yunyang (adult male), plus zh-TW HsiaoChen/HsiaoYu/YunJhe for extra variety.
  3. **Generate**: `edge-tts` (Python venv under `tools/voices/.venv`, git-ignored) → mono MP3 ~32 kbps via ffmpeg → `assets/voices/<hash>.mp3` + `assets/voices/manifest.json` keyed by hash(voiceKey + text). Re-runnable and incremental; budget ≤ 12 MB.
  4. **Runtime**: `voiceLine` / `speak` look up the manifest first and play the clip through the voice bus (duck music, cancellable, Promise with `.cancel()`), else fall back to browser speech, else blips.
- Licensing note: edge-tts uses Microsoft's online neural voices; fine for this personal project, but review the terms before any commercial release.

## Addendum 2 — voice scope (user clarification)

The user clarified: **ending cutscenes stay text-only** (dialogue box + typewriter, no speech and no blips). Real voices are wanted **only in the classroom**:
- the intro ritual: teacher "上课！", monitor "起立！", the whole class "老师好——" as a layered chorus, "坐下";
- the teacher speaking during play: lecture lines, the warning "嗯？", scolding / calling on students, "最后一排那个同学……";
- classmates' chatter: a low, layered 叽叽喳喳 bed of real whispered/murmured speech fragments (several voices, randomised, filtered), following the AI's murmur level.

Implementation: `voiceLine` voices a line only when the phase is `intro`, `aim` or `flight` (classroom play); in `ending`/`card` it resolves immediately and silently, and the UI shows text only. Teacher lecture bubbles are voiced (`ui.bubble(..., {voiced: true})` from the AI). The harvest/generation pipeline only needs the classroom lines plus a chatter-fragment set, so the asset budget drops to ≤ 6 MB.
