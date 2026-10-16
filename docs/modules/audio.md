# Audio module (`src/audio/`) — qs-audio-composer

Fully procedural WebAudio: no audio files. Music is sequenced live from synthesised instruments, and SFX are rendered once into AudioBuffers with `OfflineAudioContext`. The contract (`docs/CONTRACTS.md` §4.8) is implemented unchanged. Additions are listed below.

## Files

| File | Purpose |
|---|---|
| `index.js` | `install(ctx)`. Builds the `ctx.audio` API, the debug log, music switching, SFX playback, loop handles and the per-frame update (`ORDER.AUDIO`). |
| `mixer.js` | Lazy AudioContext, the bus graph, gain staging, settings, ducking and polyphony limiting. |
| `instruments.js` | About 30 synthesised instruments (see below). They take the same signature on live and offline contexts. |
| `sequencer.js` | `compile(def)` turns song data into a sorted event list. `TrackPlayer` handles lookahead scheduling, loops, intro/outro, layers, tempo rate and per-track FX. |
| `tracks.js` | The 12 compositions. |
| `sfx.js` | 45 SFX recipes and the pre-render bank (`createBank`). |
| `voice.js` | `blip()` (dialogue syllables) and `speak()` (speechSynthesis with a blip fallback). |
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
| `dev.renderTrack(id, sec, {tension})`, `dev.renderSfxStats(name, variant)` | Offline renders with stats (used by `dev/audio/render.js`). |

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

## Speech

- **`blip(voice, ch)`.** A square-wave syllable through two vowel formants, 50–65 ms long. Pitch is `175 Hz × voice.pitch`, moved by a per-character pentatonic offset plus a little random jitter. Punctuation and whitespace are silent. Blips are rate-limited to one per 35 ms.
- **`speak(text, {pitch, rate})`.** Uses `speechSynthesis` only when all of these hold: audio is unlocked, it is audible, and a `zh*` voice exists. The text is split into sentences; the call resolves on the last utterance's `onend`, or at a UI-clock deadline (`2 + 0.3 s/char + 0.5 s/sentence`), whichever comes first. Otherwise it runs a blip sequence: 0.12 s per character, 0.2 s / 0.36 s pauses at short / long punctuation, capped at `2.5 + 0.25 s/char`, so it always finishes inside story's `3 + 0.3·len` cap. Music is ducked 45 % while speaking.

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
- **No pause handling for TTS.** While the game is paused (Esc), `speechSynthesis` keeps talking. The blip fallback pauses with the engine.
