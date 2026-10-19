# Audio module (`src/audio/`) — qs-audio-composer

Music and SFX use procedural WebAudio. Classroom speech uses bundled neural MP3 clips, with browser speech and soft blips as fallbacks. SFX are rendered once into AudioBuffers with `OfflineAudioContext`. The contract (`docs/CONTRACTS.md` §4.8) is implemented unchanged. Additions are listed below.

## Files

| File | Purpose |
|---|---|
| `index.js` | `install(ctx)`. Builds the `ctx.audio` API, the debug log, music switching, SFX playback, loop handles and the per-frame update (`ORDER.AUDIO`). |
| `mixer.js` | Lazy AudioContext, the bus graph, gain staging, settings, ducking and polyphony limiting. |
| `instruments.js` | About 30 synthesised instruments (see below). They take the same signature on live and offline contexts. |
| `sequencer.js` | `compile(def)` turns song data into a sorted event list. `TrackPlayer` handles lookahead scheduling, loops, intro/outro, layers, tempo rate and per-track FX. |
| `tracks.js` | The 12 compositions. |
| `sfx.js` | 45 SFX recipes and the pre-render bank (`createBank`). |
| `voice.js` | `voiceLine()` / `speak()`: pre-rendered clip lookup (manifest), browser voice ranking + casting, sentence-level speechSynthesis, voice modes, harvest recorder; soft fallback `blip()`. |
| `auto.js` | Event-driven automatic music and SFX, the tension computation, bullet-time treatment and declarative ambience "beds". |
| `theory.js`, `dsp.js` | Note/chord/melody parsing, JS biquads, a formant voice synth, IR generation, loop crossfades and buffer stats. |

## Signal graph

```
TrackPlayer(s) → musicIn → slowLP (bullet-time low-pass) → duck → musicVol ─┐
reverbIn → Convolver (generated IR) ──┘                                       ├→ master → Compressor(-14 dB, 3.5:1) → soft clipper (|y| ≤ 0.93) → Analyser → out
SFX / loops → sfxIn → sfxVol ─────────────────────────────────────────────────┤
blips → voiceIn → voiceVol (follows sfxVolume) ──────────────────────────────┘
```

- **Volume curve.** Each volume uses `v^1.5`. `masterVolume = 0`, `?mute=1` (`ctx.config.mute`) or a bus at 0 gives a hard digital zero. When a bus is silent, the module creates no nodes at all, so muted test runs cost almost no CPU. The AudioContext stays `running`.
- **Clipping.** The final soft clipper guarantees peaks stay below -0.6 dBFS. The offline renders below show no clipped samples.
- **Polyphony.** Music is capped at 40 voices and one-shot SFX at 24. When a cap is exceeded, the oldest voice fades out over 40 ms. Loops are not counted.

## Timing

- **Music.** `TrackPlayer.update(now)` runs from `engine.onUpdate(ORDER.AUDIO)`. It schedules every event up to `ctx.currentTime + 0.2 s`. There are no timers.
- **Tempo changes.** Bullet time re-anchors the beat→time map at the scheduling horizon, so already-scheduled notes stay put.
- **Stalls.** If the player falls behind by more than 0.5 s (hidden tab, stall), it re-syncs instead of bursting.
- **Read-aloud and ducks.** Both use the UI clock (`time.uiDt`).

## Unlock and the headless case

- **Before unlock.** Every method is a safe no-op until `unlock()`. `debug.recent` and `debug.music` are recorded anyway. `music()` called before unlock remembers the desired track and starts it on unlock.
- **Who unlocks.** `unlock()` is called by the UI. The module also listens (capture phase) for the first `pointerdown`, `keydown` or `touchend` on `window`.
- **SFX bank.** The bank pre-renders one recipe per frame, so the main thread never renders more than one recipe at a time. It starts at install time unless `?mute=1`, so it is ready by the time the player leaves the title screen. Under `?mute=1` it starts only once audio is unlocked *and* audible.
- **Early `sfx()` calls.** An `sfx()` that arrives before its buffer exists is queued and played if the buffer is ready within 0.5 s. Otherwise it is dropped.

## Additions to `ctx.audio` (beyond the contract)

| API | Purpose |
|---|---|
| `sfx(...)` return value | A `{stop(fade)}` handle, or `null` when silent or not unlocked. Extra options: `delay`, `fadeOut` (s). |
| `loop(...)` handle | `set({volume, rate, pos})`: `pos` (world Vector3) is re-spatialised every frame. Any SFX name can be looped. `heartbeat`, `clockTick`, `footstep` and `typewriter` are period-exact. |
| `debug.state` | `'none'` (never unlocked), `'suspended'` or `'running'`. |
| `debug.unlocked`, `debug.tension`, `debug.loops`, `debug.sfxReady`, `debug.voices`, `debug.blips`, `debug.gain` | Live status. |
| `debug.player` | `{id, state, mode, beat, ctxTime}` of the current track. |
| `debug.meter()` | Current master-output `{peakDb, rmsDb}` from the analyser (`null` before unlock). |
| `debug.recent[i]` | `{t, kind, name, auto?}`. `t` is game time. `auto: true` marks cues the module played by itself. Loops are logged when they start. `music` logs `'off'` for `null`. |
| `dev.renderTrack(id, sec, {tension})`, `dev.renderSfxStats(name, variant)`, `dev.setVoicesForTest(list)` | Offline renders with stats (`dev/audio/render.js`); voice-list simulation (`dev/audio/voices.js`). |
| `voiceQuality`, `voiceHint` | See *Voices* below. |
| `stopVoice()` / `cancelVoice()`, `voiceLine(...).cancel()`, `speak(...).cancel()` | Stop the current voice line / read-aloud (UI click-to-skip). The pending promises resolve. |

`setTension(v)` sets a *manual* floor. The effective tension is `max(manual, auto)`, and the manual value resets on `round:setup`.

## Automatic behaviour (nobody needs to call these)

Automatic cues are deferred by one frame and **skipped if another module requested the same SFX name within 0.3 s**. Automatic music changes are dropped if anyone called `music()` after the triggering event. As a result, hand-placed cutscene cues never double up.

| Trigger | Response |
|---|---|
| `phase` title / letter | `title` track (letter keeps title playing) |
| `phase` intro / aim | `classroom` |
| `phase` flight | `flight` (0.35 s crossfade) |
| `phase` ending | Fade out. If story calls no `music()` within 2.5 s, play the fallback track for the ending (`ENDING_TRACK` in `auto.js`). |
| `ending:shown` | If `victory` or `tragedy` is playing, finish it on the next bar line with its cadence outro, then stop. |
| `round:setup` | Stop **all** loops (anyone's), reset tension/manual tension, cancel speech, clear ducks and pending cues. |
| `teacher:state` | `warning`: `stingDanger` + `hmm` (spatialised at the teacher's head) + a tension kick. `fakeout`: `hmm`. `drinking`: `sip`. `alert`: `stingDanger`. |
| `suspicion`, teacher state, charge power | Drive the tension (smoothed: rises fast, falls slowly). |
| `teacher:caught` | `aim`: `recordScratch` and the music cuts. `ball`: `stingDanger`. |
| `aim:study {on}` | `pageFlip` |
| `ball:launched` | `whoosh` (rate and volume follow `power`) |
| `ball:hit` | Played at `pos`, volume from `speed`, rate-limited per name. desk/chair/book/podium/walls → `thudDesk`; head/teacher → `thudHead` (bonk); body/floor/prop → `bounceSoft`; glass → high `ding`; trash rim → low `ding`; fan → `pop`. |
| `ball:nearMiss` | `swoosh` at `pos` |
| `ball:willpower {on}` | Soft `gasp` (held breath) |
| `ball:landed` | trash → `swish`; fan → `shatter`; outside → slow fading `whoosh` + `windGust`; intercept → `pop` |
| `incident {kind:'wind'}` | `windGust` |
| `student:event` | sneeze → `sneeze`; standUp / turnAround → `chairScrape`; witness → `gasp` (spatialised) |
| `bell` | `bell` (Westminster chime on an electronic bell) |
| `say` | Music duck of 22 % for the line's duration |
| Bullet time (`engine.timeScale < 0.75` during flight) | `slowmoIn` / `slowmoOut` (paired). Music low-pass at 700–4200 Hz; the flight track's tempo drops to 0.6–1×; SFX pitch drops slightly. |

**Declarative beds.** These are recomputed every frame and started or stopped as needed. Any of them is skipped if another module already runs a loop with that name.

| Bed | When it plays |
|---|---|
| `chalkScratch` | The teacher is writing (spatialised at the teacher). |
| `footstep` | The teacher is patrolling (follows the teacher). |
| `heartbeat` | The player is charging. Rate is 1→2.3× and volume rises with power. |
| `fanHum` | Fans are spinning in the classroom. |
| `rain` | Classroom with `mood === 'rain'`, or the office stage. |
| `crickets` | Classroom with `mood === 'night'`. |
| `birds` | Rooftop, cherry path or schoolyard stage. |
| `murmur` | Court or canteen stage. |

Classroom chatter (`murmur`) during aim/flight belongs to the AI module, which calls `loop('murmur')` and `set({volume})` itself.

## Tracks

All tracks are 16-bar loops, except `broadcast` (2-bar chime intro + 16-bar loop) and `victory` (4-bar fanfare intro + 12-bar loop). Melodies are written as note strings in `tracks.js`.

| id | BPM / meter | Key | Instrumentation | Motif |
|---|---|---|---|---|
| title | 132, 4/4 | D major | Piano lead + glockenspiel doubling, piano broken chords, round bass, light kit (clap snare), strings in the B half; "royal road" IV–V–iii–vi | B4–D5–F#5 pickup into a held F#, answered by A5 on V |
| classroom | 76, 4/4, swung 16ths | F major | Lo-fi Rhodes (FM) sevenths played late with tape wow, soft swung kit, round bass, vinyl crackle, tick-tock clock on every beat. **Tension layers**: tremolo strings (0.15→0.5), low 8th pulse (0.35→0.7), heartbeat on the beat (0.5→0.8) doubling on off-beats (0.82→1), eerie high violin minor 2nd (0.7→1). The main layer dips 35 % and the kit drops out as tension peaks. | Yawning A–G–E…C descent over Fmaj7 |
| flight | 112, 4/4 | A major over an A pedal | Pizzicato (Karplus-Strong) rising 16th scales, harp, glockenspiel hover notes, high string swell, shaker, timpani lifts; suspended chords that never resolve; tremolo tension layer | A4→A5 scale stopping on a held B (sus2) — "the apex" |
| romance | 72, 4/4 | G major | Piano melody + LH 8th arpeggios, string pad from bar 5, cello-like violin countermelody, glockenspiel sparkle; I–V/7–vi–IV | B4–D5 then a rising sixth to a held G5 |
| comedy | 140, 4/4 | F major | Tuba oom-pah, pizzicato off-beat stabs, staccato bassoon, xylophone B section + glissando "boing", brushy snare and woodblock | C–D–E–F scamper up, then a hopping A–F |
| tragedy | 66, 4/4 | D minor | Sobbing solo violin (heavy vibrato), tremolo strings, doom piano octaves, sub bass, timpani rolls, cymbal swell. **Outro**: Gm–A7–Dm with a roll | D–F–A rising cry held on A5, sighing G–F–E–D |
| shame | 60, 4/4 | — | Two crickets out of phase, an awkward wall clock, a sad-trombone tuba (bar 8) and one low "bwomp" (bar 14) | D3–C#3–C3–B2 "wah-wah-wah-waaah" with wobble and wah mute |
| sports | 150, 4/4 | E minor | Four-on-the-floor kick, snare + claps, driving picked bass, brass stabs + fanfare lead, tom fills, crashes | E–E–G–B fanfare pickup, leap to E5 |
| broadcast | 108, 4/4 | C major | PA chime intro, school march (glockenspiel + piano, tuba oom-pah, march snare), all through a loudspeaker chain (HP 420 / LP 3.6 k / saturation / slap-back echo / hiss) | C5–E5–G5–C6 chime; E–G–C6 march tune |
| lonely | 84, 3/4 | A minor | Wobbly music box waltz (comb-tine partials, loose timing) over a dark pad, long echo and reverb | E6–C6–A5 falling triad |
| mystery | 92, 4/4 | A minor / harmonic minor | Open-fifth drone, celesta arpeggios on add9 / maj7#11 / 7b9 chords, walking pizzicato bass, theremin lead with portamento from bar 5, timpani "gong" | Chromatic creep F5–E5–D#5 into a lydian #11 |
| victory | 128, 4/4 | Bb major | Brass fanfare with triplet pickups, snare roll + cymbal (once), then a festive march (brass + glockenspiel, march kit, tuba, timpani). **Outro**: Eb–F–Bb with roll and crash | F–F–F triplet into a held Bb, repeated a third higher |

Instruments in `instruments.js`:

- Keys: `piano` (periodic-wave harmonics with a decaying low-pass), `epiano` (2-op FM Rhodes).
- Plucked strings: `pluck` / `pizz` / `harp` (Karplus-Strong computed in JS and cached per note).
- Bowed strings: `pad` (3 detuned saws, optional tremolo), `violin` (saw + body formants + delayed vibrato + glide).
- Bass and brass: `bass` (round / pick / sub), `tuba` (scoop, slide, wobble, wah), `bassoon` (reed wave + nasal formant), `brass` (opening filter "bwah").
- Tuned percussion: `bell` (glock / celesta / musicbox / chime / ding), `marimba` / `xylo`.
- Leads: `chip` (25 % pulse, arpeggio), `theremin`.
- Drums: `kick`, `snare`, `hat` / `ohat`, `shaker`, `clap`, `wood` / `tick`, `tom`, `timpani`, `crash`.
- Effects voices: `heart`, `cricket`.

## SFX

All 45 contract names exist. Each has 1–4 pre-rendered variants. Every playback adds ±3.5 % rate and ±8 % gain jitter. Loops marked `xf` are made seamless with an equal-power crossfade; `cut` loops are exact periods.

Crowd sounds (`laughCrowd`, `ooh`, `cheer`, `murmur`, `gasp`) and human sounds (`hmm`, `sneeze`, `cough`) use a JS formant-voice synth: a polyBLEP saw plus aspiration noise, fed through three formant band-passes with vowel trajectories. Paper sounds, claps, rain and chalk/pencil are granular (band-passed noise grains).

## Pre-rendered neural voices (`tools/voices/`, `assets/voices/`)

Only classroom dialogue is voiced, as specified in `docs/PLAYTEST-1.md` addendum 2. Ending dialogue and letter read-aloud remain text-only, including when the blip setting is selected.

- `node tools/voices/build.mjs --static`: harvest every teacher line, named call-on/scolding variant, student answer, intro ritual, and chatter fragment; generate missing clips and publish the manifest.
- Omit `--static` to also harvest intro/AI playthroughs. `--skip-harvest` reuses the catalog; `--dry` skips generation and leaves published assets untouched.
- Generation uses the existing `tools/voices/.venv` (`edge-tts`) plus `ffmpeg`/`ffprobe`. Casting is recorded in `tools/voices/casting.json`; rate/pitch adjustments are capped at ±10.
- Files are mono, 24 kHz, 32 kbps MP3. Keys are speaker + original text; filenames hash the cast and normalized spoken text. Bracketed stage directions are not spoken.
- Budget: **6 MB**. A failed/incomplete build exits non-zero and preserves the previous manifest and clips. The manifest is replaced atomically only once every harvested line exists.

The intro bell schedules “上课”, “起立”, an eight-voice classroom chorus, and “同学们好，坐”. Skipping the intro, resetting a round, or calling `stopVoice()` cancels the ritual and invalidates pending decodes. A missing manifest falls back to ordinary speech playback.

Classroom chatter uses filtered, panned speech fragments with at most six simultaneous fragments per loop. The AI controls density/volume; disabling ambient behaviour stops the loop. A new round starts a fresh loop. Outside classroom play, crowd effects use the procedural SFX bank.

`voiceLine()` and `speak()` return cancellable promises. Leaving classroom play cancels active speech; ending/card calls resolve silently. Muting stops browser speech as well as the WebAudio bus. Voiced bubbles wait for playback (with a finite timeout), so call-on questions and answers finish before the next speaker begins.

`debug.speech` includes `activeJobs`, `ritualActive`, `chatterBuffers`, and clip coverage/decode counters. Run `node tools/shot.mjs --script dev/audio/classroom.js --query "lowfx=1" --out dev/audio/shots` for playback, cancellation, text-only endings, chatter restart, and master-mute checks.

Microsoft voice service terms require review before distributing commercially.

## Voices: browser speech fallback (`voiceLine`, `speak`, blips)

`voiceLine(text, voice, {charId, mood?, gender?, role?}) → Promise` is the contract voice for one dialogue line; `ui.say` calls it and waits for it. `settings.voiceMode` picks the behaviour and is read on every call:

| `voiceMode` | Behaviour |
|---|---|
| `'speech'` (default) | Real Chinese speech via `speechSynthesis` when the audio is unlocked, audible and a zh voice exists. Otherwise it falls back to blips. |
| `'blips'` | Soft blips only. |
| `'off'` | Resolves immediately, silently. |

**How a line is spoken**
- **Sentence by sentence.** Each sentence (split at `。！？…；`) is a separate utterance; the next one is queued on the previous one's `onend`.
- **Cancellation.** A new `voiceLine` cancels the previous line and resolves its promise. The first utterance after a `cancel()` goes out on the next frame, because Chrome drops a `speak()` issued right after `cancel()`.
- **Ducking.** Music ducks 40 % while a line is spoken (15 % for blips). The duck is released as soon as the line ends.
- **Bounded time.** The promise resolves when the last sentence ends, or at a UI-clock deadline (`2.5 s + 0.3 s/char + 0.35 s/sentence`, max 28 s; local voices start from 1.2 s instead of 2.5 s).
- **Failure fallback.** If speech has not started after 3 s (online voices) or 1.5 s (local voices), or errors before starting, the line switches to blips.
- **Headless.** Headless or muted runs use the silent blip schedule: `0.06 s + 0.065 s/char`, plus 0.14 / 0.26 s pauses at short / long punctuation, capped at `1 + 0.12 s/char`.

**`speak(text, {pitch, rate, charId?, gender?})`** (the letter read-aloud) uses the same voice ranking and casting; the player is cast by `ctx.round.playerGender`. Its blip schedule is slower (`0.12 s/char`, capped at `2.5 + 0.25 s/char`), so it always stays within story's `3 + 0.3·len` cap.

**Blips** (fallback and `blip()`) are soft and round: sine + quiet triangle octave, low-passed at 1.8 kHz, peak gain 0.13, 12 ms attack, ~70 ms decay. Only every 2nd–3rd non-punctuation character sounds, with at least 70 ms between blips. Pitch is `260 Hz × √voice.pitch` on a per-character pentatonic offset.

### Voice ranking (realism tiers, best first)

Only zh voices are considered (`lang` starting `zh`/`cmn`/`yue`, or a Chinese name).

| Tier | Voices | How they are detected |
|---|---|---|
| 6 | Neural zh-CN Mandarin: Edge "Microsoft Xiaoxiao / Xiaoyi / Yunxi / Yunjian / Yunyang / Yunxia … Online (Natural)" | Name contains `Natural`/`Neural`/`Online`, or `localService === false` + Microsoft; lang zh-CN; not a dialect |
| 5 | Google online `Google 普通话（中国大陆）` | Name contains `Google`, lang zh-CN |
| 4.5 | Neural zh-TW Mandarin (HsiaoChen, HsiaoYu, YunJhe) | as tier 6, lang zh-TW |
| 4 | Other Google zh (`國語`, `粵語`) | |
| 3.5 | Neural zh-HK (Cantonese: HiuGaai, HiuMaan, WanLung) | |
| 3 | Neural dialect voices (Xiaobei / Liaoning, Xiaoni / Shaanxi) | |
| 2 | Legacy zh-CN OS voices (Microsoft Huihui / Kangkang / Yaoyao, macOS Tingting / Li-Mu) | |
| 1 / 0.5 | Other legacy zh / eSpeak | |

`ctx.audio.voiceQuality` reports `natural` when the bundled clip manifest is available; otherwise it reports the best browser voice present: `'natural'` (tiers ≥ 3), `'online'` (Google), `'legacy'`, or `'none'`. `ctx.audio.voiceHint` is `'推荐使用 Edge 浏览器以获得最自然的语音'` when the quality is `legacy` or `none`, and `null` otherwise. The UI can show it in settings.

### Casting

The role comes from `charId` and the cast spec:

| Role | Who | Voice preference (best first; the realism tier dominates) |
|---|---|---|
| teacher | `teacher` | Yunyang, Yunze, Yunjian, Yunfeng, Yunye, Kangkang |
| principal | `npc_principal` | Yunze, Yunye, Yunjian, Yunyang |
| coach | `npc_pe` | Yunjian, Yunfeng, Yunyang |
| dad | `npc_dad` | Yunye, Yunjian, Yunfeng, Yunyang |
| mom | `npc_mom` | Xiaoqiu, Xiaomo, Xiaoxiao, Xiaohan |
| elderF | `npc_janitor` | Xiaorui, Xiaoqiu, Xiaomo, Xiaoxiao |
| boy | male students, `player_m` | Yunxi, Yunhao, Yunxia, YunJhe (spread) |
| girl | female students, `player_f` | Xiaoyi, Xiaoxiao, Xiaomeng, Xiaochen, Xiaohan, Xiaoshuang (spread) |
| narrator | no `charId` and no voice | Xiaoxiao, Yunyang, Xiaohan |

**How a voice is chosen**
- **Gender first.** Gender-matching (or unknown-gender) voices are always preferred: a real male legacy voice beats a pitched-down female neural voice, which sounds uncanny. A cross-gender voice (pitch ×0.72 / ×1.3) is used only if that gender has no voice at all.
- **Classmates (spread).** Students are spread over up to 4 top-tier voices of their gender by a hash of `charId`.
- **Natural voices.** Pitch and rate offsets stay within ±8–10 % (hash jitter + a little of `voice.pitch` / `voice.speed`); characters differ mostly by voice choice. The teacher and principal speak 5 % slower.
- **Legacy voices.** Larger pitch offsets are allowed (0.6–1.5).
- **Mood.** `mood` (`shout`/`angry`/`whisper`/`sad`) nudges rate, pitch and volume slightly.

Resulting casts (from `dev/audio/voices.js`, which simulates the browsers' voice lists):

| Role | Edge on Windows (`natural`) | Chrome on Windows (`online`) | Safari on macOS (`legacy`, hint shown) |
|---|---|---|---|
| teacher | Yunyang | Kangkang | Li-Mu |
| principal | Yunjian | Kangkang | Li-Mu |
| coach / dad | Yunjian | Kangkang | Li-Mu |
| mom / janitor | Xiaoxiao | Google 普通话 | Tingting |
| boys | Yunxi / Yunxia | Kangkang | Li-Mu |
| girls | Xiaoyi / Xiaoxiao | Google 普通话 | Tingting |
| narrator | Xiaoxiao | Google 普通话 | Tingting |

**Debug:** `debug.castTable()`, `debug.voiceList()`, `debug.speech` (counts, quality, mode). `debug.recent` logs `{kind:'voice', name, mode:'tts'|'blips'|'off', v?, role?}` for every line.

### Crowd and voice SFX audit (playtest 1)

The formant voice synth now uses:
- a low-passed glottal source (natural spectral tilt);
- vibrato with slow pitch drift;
- smoothed amplitude;
- a separate `voiced` vs `breath` mix.

| SFX | Change |
|---|---|
| `laughCrowd` | 16 voices at lower level with rounder syllables, low-pass 3.2 kHz, room reverb |
| `ooh` | 14 voices, low-pass 2.4 kHz, reverb |
| `murmur` | 11 voices, low-pass 1.7 kHz, so no syllable stands out |
| `cheer` | Now mainly a crowd roar (swelling band-passed noise) with a quiet "耶" layer and whistles |
| `gasp` | Almost unvoiced breath |
| `hmm` | A warm closed-mouth hum, low-passed at 900 Hz |
| `sneeze`, `cough` | Mostly noise, low-passed |

Zero-crossing rate, a proxy for harshness, dropped 15–25 % on each of these.

## Self-test data (offline renders, 44.1 kHz, through the real master chain at default settings)

`node tools/shot.mjs --script dev/audio/render.js --out dev/audio/shots --w 1600 --h 900` writes the spectrogram contact sheets `tracks.png`, `sfx1.png` and `sfx2.png`. All items are non-silent, none has clipped samples, and the closest pair by average spectrum (pageFlip / sip) is still 3.4 dB RMS apart per band. Tracks: 8 s from bar 1. SFX: variant 0, peak-normalised to -1 dBFS before the per-SFX playback `level`.

| track | BPM | meter | bars | key | events/loop | peak dBFS | RMS dBFS | active | ZCR Hz |
|---|---|---|---|---|---|---|---|---|---|
| title | 132 | 4 | 16 | D major | 729 | -6.6 | -21.6 | 1 | 696 |
| classroom | 76 | 4 | 16 | F major | 834 | -11.5 | -25.2 | 0.99 | 336 |
| flight | 112 | 4 | 16 | A major (pedal A) | 582 | -13.2 | -24.8 | 1 | 293 |
| romance | 72 | 4 | 16 | G major | 258 | -9.8 | -25.3 | 1 | 615 |
| comedy | 140 | 4 | 16 | F major | 290 | -10.8 | -26.6 | 0.83 | 715 |
| tragedy | 66 | 4 | 16 | D minor | 185 | -8.8 | -21.9 | 1 | 569 |
| shame | 60 | 4 | 16 | — | 181 | -18.2 | -39.6 | 0.28 | 4363 |
| sports | 150 | 4 | 16 | E minor | 565 | -7.9 | -23 | 1 | 957 |
| broadcast | 108 | 4 | 18 | C major | 446 | -11.7 | -23 | 1 | 1057 |
| lonely | 84 | 3 | 16 | A minor | 139 | -13.4 | -26.1 | 1 | 951 |
| mystery | 92 | 4 | 16 | A harmonic minor | 297 | -12.4 | -26.6 | 1 | 582 |
| victory | 128 | 4 | 16 | Bb major | 376 | -9 | -25.8 | 1 | 1306 |
| classroom @ tension 1 | | | | | | -10.7 | -24.6 | 1 | 495 |

`shame` is intentionally near-silent (crickets and a clock). `active` is the fraction of 50 ms windows above -50 dBFS.

## Known limitations

- **Boot hitch.** The JS-synthesised SFX recipes (crowds, rain, murmur) take tens to a few hundred ms each on the main thread. They render one per frame during the title screen. On a slow machine this can cause a brief music stutter if the player clicks start within the first ~2 s of boot.
- **No pause handling for TTS.** While the game is paused (Esc), speechSynthesis keeps talking. The blip fallback pauses with the engine.
- **Casting is untested on real hardware.** It was tested against simulated voice lists only; headless Chromium has no voices. Edge's neural voices are network voices, so the first line may start 0.3–1 s late.
