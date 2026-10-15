# Acceptance Criteria (written by the lead, executed and judged by qs-qa-lead)

Every item needs **reproducible evidence** (automated test output, screenshot path, or log). QA verdicts are: ✅ pass, ❌ fail (with a bug), ⚠️ conditional pass (with a risk note). **Any P0 item at ❌ blocks the release.**

## A. Boot and stability (P0)
- A1 Boots to the title in both normal mode and `?lowfx=1` with 0 console errors and 0 unhandled rejections.
- A2 All 13 endings run to completion (script-driven) with `__qs.errors` empty throughout.
- A3 10 consecutive rounds (mixing retry / rewrite / back to title) without a crash; `renderer.info.memory.geometries/textures` stop growing after round 3.
- A4 After any ending, "再来一局" returns to a correct aim view (no black screen, no leftover letterbox/fade/PiP, timeScale = 1, HUD correct).

## B. Core loop with real input (P0)
Using **real Playwright mouse/keyboard events** (not `__qs.throwAt`):
- B1 Title: pick gender → write a letter (once with a preset, once with custom text) → hold to crumple → intro → aim.
- B2 Moving the mouse during aim changes the view, within angle limits.
- B3 Holding LMB charges (power rises, arm lifts) → releasing throws the ball and the camera switches to follow it.
- B4 Holding RMB / Space pretends to study: suspicion drops and charging is impossible.
- B5 During flight C cycles camera styles; holding Space causes slow motion and A/D produce a measurable shift of the landing point.
- B6 Esc pauses: game time stops; resuming continues.
- B7 Timer reaching zero → `coward` ending.

## C. Physics (P0)
- C1 For each of the 29 non-player seats, `solveLaunch` + launch with the teacher frozen (never turning), classmate ambient events off and wind off: **≥ 90%** of solvable seats actually land on the target seat's desk or chair.
- C2 200 random throws: 0 NaN; 0 tunnelling through walls/desks (the ball ends inside the room or left through the open window); all emit `ball:landed` within 8 s.
- C3 Bounces, rolling and settling look plausible (screenshot sequence + position log); hitting a head bounces off and triggers a reaction.

## D. Teacher AI (P0)
- D1 The writing / warning / watching cycle is observable; warning has a visible/audible tell lasting 0.5–0.9 s.
- D2 Teacher facing the class + player in view + continuous charging → caught (`teacher:caught`) within 3 s.
- D3 Studying lowers suspicion; charging while the teacher's back is turned does not raise it.
- D4 A ball flying long enough inside the teacher's view cone → `teacherSawBall = true`.
- D5 At least 6 in-flight accidents can be triggered with `ai.students.trigger` and are visible on screen (screenshots).

## E. Endings (P0)
- E1 All 13 endings can be triggered by deterministic scripts (one scenario per ending in `tests/`), and `resolve()` matches the GDD §7 table.
- E2 Each ending lasts 8–45 s (game time), has its own camera work / dialogue / music, and ends on the ending card; the 13 key-frame screenshots are all different and match the ending's content.
- E3 `caught_read` reads out the player's own letter text verbatim (including custom input).
- E4 Gallery: unlocks persist across reloads; locked endings show hints; new unlocks show "NEW".

## F. Camera (P0/P1)
- F1 (P0) In follow mode the ball stays within the central 70% of the screen in ≥ 90% of flight frames and is never fully hidden by nearby geometry.
- F2 (P0) Every throw triggers bullet time at least once; afterwards timeScale returns to 1.
- F3 (P1) When the teacher turns mid-flight, the PiP window appears.
- F4 (P1) Transitions (heart iris, fades, white flash) leave no residue.

## G. Visuals (P0/P1; QA reviews by eye and scores 1–5, ≥ 3.5 passes)
- G1 Key-frame screenshots of: title, letter writing, aim, charging, flight, landing, each ending, ending card, gallery.
- Scoring dimensions: readability (characters and target are clear), consistent style (warm anime cartoon, outlines/faces), character expressiveness (emotions read from faces and poses), no clipping/flicker/missing textures, Chinese text renders correctly, UI does not cover key action.

## H. Audio (P1)
- H1 After the first click the AudioContext is running; the track switches correctly per phase (`ctx.audio.debug.music`).
- H2 Key events have sounds (crumple, launch whoosh, desk thud, bell, teacher-turn sting, heartbeat), visible in `ctx.audio.debug.recent`.
- H3 Master volume 0 means total silence; settings persist.

## I. Performance (P1)
- I1 Aim view draw calls ≤ 800 and triangles ≤ 800k (`__qs.state()`).
- I2 In lowfx, average tick time (excluding rendering) ≤ 4 ms.

## J. Content quality (P1)
- J1 No placeholder text; all player-facing text in Chinese; typo check.
- J2 QA can summarise each ending's joke or emotional beat in one sentence; if it can't be understood, it fails.
