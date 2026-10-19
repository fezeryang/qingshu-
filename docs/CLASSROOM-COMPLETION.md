# Classroom AI, Audio and Environment Completion

## Delivered behavior

- Teacher questions, student answers and teacher replies wait for the preceding voiced bubble. Ambient lectures respect active speech; explicit catch and witness events produce visible reactions even during deterministic QA.
- The classroom voice pack contains 368 Mandarin clips (2,175,880 bytes), including named questions, student answers, eight chorus voices and background chatter. Playback uses bundled clips first, with browser speech/blips as fallback. Ending dialogue and read-aloud remain text-only, as required by PLAYTEST-1 addendum 2.
- Skipping/restarting the intro invalidates pending audio decodes. Leaving classroom phases, muting or changing voice mode cancels ongoing speech. Ambient chatter stops and restarts with its owning loop. Intro timing lets the class greeting finish before the teacher responds.
- Voice generation resumes existing files, recovers duration metadata, validates size before publication, and preserves the prior manifest when a generation run fails. A dry run does not publish or prune assets.
- Classroom architecture and all six ending sets use rough physically lit surfaces. The classroom adds terrazzo, desk varnish, contact shade and subtler light shafts. Campus trees root at ground level, with open sightlines toward paths, track markings and dimensional facade bands.
- Seated camera FOV is 60 degrees (55 at full charge), with smaller breathing and lean; reduced motion removes breathing/tremble. Collision layout and aim-ray origin are unchanged. Characters retain their existing stylized models.

## Reproducible verification

```sh
node --test dev/audio/assets.test.mjs dev/audio/voice.test.mjs
node tools/shot.mjs --script dev/audio/classroom.js --query lowfx=1 --out dev/audio/shots
npm test -- --only D,H --quick --no-shots
npm test -- --only D5 --quick --no-shots
npm test -- --only B2,B3,H3,I1 --quick --no-shots
node tools/shot.mjs --script dev/world/realism.js --query mute=1 --out dev/world/shots/realism-hq
npm run check -- --smoke
```

Asset coverage and asynchronous cancellation tests pass. The classroom browser regression passes all 14 checks. Teacher behavior D1–D4 and music/SFX H1–H2 pass; D5 passes all six reaction scenarios after fixing the catch/witness poses. H3 passes on final retest: default-volume peak 0.5133, muted peak 0, settings preserved after reload, and URL mute does not persist. B2/B3 pass real mouse-look and charge/release input checks. I1 passes lowfx rendering budgets across four view directions (maximum 115 draw calls and approximately 290k triangles, below 800/800k). The final B2/B3/H3/I1 run reports four passes with no warnings or failures.

Screenshots: final classroom close-up/overview are `dev/world/shots/final/hq-player.png` and `dev/world/shots/final/hq-overview.png`. Six-set review: `dev/world/shots/realism-hq/classroom-fp.png`, `campus-window.png`, and `set-{rooftop,office,schoolyard,court,cherryPath,canteen}.png` in the same directory. Run the command above to regenerate ignored PNGs.

## Scope limits

This is an environment realism pass, retaining procedural geometry and stylized people. It does not replace character models or rewrite each ending's cinematography. Browser waveform tests establish playback and cancellation, not a subjective listening review on real speakers. Browser TTS fallback quality still depends on installed voices.

Final static checks pass (99 files), and the full-round smoke completes with no runtime errors. The smoke browser loaded before the final bottle-material cleanup and logged a toon-gradient warning; the subsequent final HQ browser run has no console warnings or runtime errors. Its classroom environment-only measurement is 65 draw calls / 67,714 triangles with shadows. Dust now samples texture alpha and uses smaller points, avoiding bright oversized specks.
