# QA Bug List — 情书抛物线

Severity: P0 blocker · P1 major · P2 normal · P3 suggestion. Fixed bugs stay here, marked `FIXED (verified in round N)`.
Owners follow docs/TEAM.md directory ownership.
- Repro scripts: run with `node tools/shot.mjs --script <file> --out qa/repro/shots`, unless the file says otherwise.
- Test names refer to `node tests/run.mjs --only <id>`.

Acceptance round 1 = full run on git `53f0edd` (all nine modules committed), 2026-10-17.

| Bug | Sev | Owner | Title | Status |
|---|---|---|---|---|
| BUG-001 | P1 | qs-gameplay-engineer | `solveLaunch` gives up on front-row seat r0c1 (null, or a fragile head-grazing solution) | open |
| BUG-002 | P2 | lead (+ qs-ui-designer) | `?mute=1` is persisted, so later normal loads are silent | open |
| BUG-003 | P2 | qs-gameplay-engineer | `solveLaunch` is wall-clock budgeted, so results depend on CPU load (trash returned null under load) | open |
| BUG-004 | P2 | qs-camera-director (+ qs-env-artist) | Follow cam: the ball is fully hidden behind the cloth curtains when flying out of the window | open |
| BUG-005 | P2 | qs-camera-director (+ qs-narrative-director) | Ending close-ups: classmates' heads block a third to half of the frame right in front of the lens | open |
| BUG-006 | P2 | qs-narrative-director / qs-ui-designer | Letter-reveal sheet covers the reader's face at the emotional beat (perfect, same_gender, self_love) | open |
| BUG-007 | P2 | lead (+ qs-character-artist) | Aim view: the classmate directly in front (r3c0) fills ~30 % of the screen (~50 % on a phone) | open |
| BUG-008 | P2 | qs-ui-designer | Phone layout: mouse/keyboard hint bar on touch devices; 装认真 button overlaps the hand and ball | open |
| BUG-009 | P3 | qs-ui-designer | J1: Latin text on screen ("LOVE LETTER PARABOLA", "Esc") | open (design call) |

---

## BUG-001 — `solveLaunch` for front-row seat r0c1: no solution, or a fragile head-grazing solution whose live result differs from the prediction

- **Severity:** P1. C1 still passes (56/57 = 98.2 %). But r0c1 is the crush's seat with seed 11, so `throwAt('crush')` throws "no launch solution", and E1's `perfect` scenario needs a second attempt ("unstable").
- **Owner:** qs-gameplay-engineer (`src/gameplay/solver.js`). **Collaborators:** qs-character-artist (head collider motion), qs-ai-designer (gaze tracking turns heads toward the ball in flight).
- **Repro:** `qa/repro/BUG-001-r0c1.js` (normal flow, quiet class, teacher forced to `writing`). Test: C1.
- **Expected (CONTRACTS §4.3):** a verified solution that comes to rest on r0c1's desk.
- **Actual (reproduced in 4 runs):**
  - **Seed 11, m:** occupant xia_mo. `solveLaunch` returns `null` after ~148 ms, i.e. its whole 140 ms budget.
  - **Seed 23, m:** occupant yan_zheng. It returns `{pitch 50°, power 0.62, robust: 1, expect: desk r0c1}`. The path grazes the occupant's head:
    - in the normal flow it bounces off the head onto the desk (a lucky hit);
    - in the QA physics sandbox (flow stays in `aim`, so no gaze tracking) the same solution ends on the floor.
  - r0c3 (the AI agent's report) solves and hits for both seeds (robust 4).
- **Likely cause:** front-row desks sit right in front of the occupant's head, and the budget runs out before a clean lob is found (see BUG-003). The "best within budget" fallback accepts character contacts, and those depend on animation and gaze at flight time.
- **Suggestions:**
  - Try steeper pitches (above 66°) for z < −2.5 targets first.
  - Reject solutions with head contacts.
  - Inflate head colliders during verification.
  - Use a deterministic iteration budget instead of milliseconds.
- **Evidence:** `qa/data/C1.json` (rows r0c1), `qa/repro/shots/bug001-seed23-landing.png`, `qa/data/E1.json`.

## BUG-002 — `?mute=1` is written to `localStorage`, so every later normal load in that browser is silent

- **Severity:** P2. Players never use `?mute=1`, but every agent tool boots with it. Anyone who once opened the game with `?mute=1` then gets a silent game with the 主音量 slider at 0.
- **Owner:** lead (`src/main.js` writes `ctx.settings.masterVolume = 0`; `src/core/flow.js` `setupRound` stores `ctx.settings`). **Collaborator:** qs-ui-designer (`src/ui/index.js` `saveSettings()` stores `ctx.settings` wholesale, already on the title screen).
- **Repro:** `node qa/repro/BUG-002-mute-persist.mjs`. Test: H3.
- **Expected:** mute is a session override.
- **Actual:** `localStorage['qingshu.settings'].masterVolume === 0` right after a `?mute=1` boot reaches the title, and a reload without the flag stays at 0.
- **Suggestion:** apply mute as `audio.applySettings({...settings, masterVolume: 0})` without mutating `ctx.settings`, or strip it before `store.set`.
- **Evidence:** `qa/data/H3.json` (`afterMute`).

## BUG-003 — `solveLaunch` depends on wall-clock time: under CPU load it returns `null` for targets it normally solves

- **Severity:** P2. Tests become non-deterministic (A3 round 9 had to fall back). For players it only affects debug/test helpers, but `ai` also calls `predict`/the solver at launch.
- **Owner:** qs-gameplay-engineer.
- **Repro:**
  - A3 round 9 (rewrite → random seed 205479616): `solveLaunch(__qs.target('trash'))` returned `null` while the page was rendering ending frames.
  - `qa/repro/BUG-003-trash-unsolvable.js` solves the same seed on an idle page in 158 ms (robust 4).
  - All hard solves in C1 take 115–158 ms against the documented 140 ms budget.
- **Expected:** a seed plus a target gives the same answer on any machine and under any load.
- **Suggestion:** budget by simulation count (e.g. `opts.maxSims`), not by `performance.now()`. Keep `budgetMs` only as a safety cap far above typical cost.
- **Evidence:** `qa/data/A3.json` (round 9, earlier run), repro output in this file's history.

## BUG-004 — Follow cam: the ball is fully hidden behind the curtains as it exits the open window

- **Severity:** P2. F1 is a P0 item and fails on this alone: 2 of 35 occlusion samples (~0.1 s) in `out_window`. Every other flight is 100 % framed with zero occlusion.
- **Owner:** qs-camera-director (the spring arm / occlusion only considers colliders). **Collaborator:** qs-env-artist (curtains are visual cloth with no collider).
- **Repro:** `node tests/run.mjs --only F1` (scenario `out_window`: seed 91, `throwAt('window')`). F1 casts 5 rays from the camera to the ball every 3rd follow frame; all 5 hit the mesh `curtains<classroom` less than 1 m from the lens.
- **Expected (F1):** never fully hidden by nearby geometry.
- **Suggestion:** treat the curtain cloth bounds as a soft occluder for the arm, or fade the curtains near the camera.
- **Evidence:** `qa/data/F1.json` (`out_window.hiddenNear`). `cam.metrics` reports `occluded: 0` because it only tests colliders.

## BUG-005 — Ending close-ups: classmates' heads fill the foreground right in front of the lens

- **Severity:** P2 (visual readability; ACCEPTANCE G).
- **Owner:** qs-camera-director (`closeUp`/`overShoulder` claim "no third person's head in front of the lens"). **Collaborator:** qs-narrative-director (shot choice).
- **Repro:** `node tests/run.mjs --only E2` and look at `qa/shots/endings/confetti-5s.png` (冷月's hair covers the left half), `caught_read-5s.png` (dark shapes on both sides), `perfect-5s.png`, `same_gender-5s.png` (out-of-focus hair blobs at the frame edges).
- **Expected:** the subject is clear and foreground heads stay small or out of frame.
- **Evidence:** the screenshots above.

## BUG-006 — Letter-reveal sheet covers the reader's face at the emotional beat

- **Severity:** P2. The heart-flutter beat of `perfect` ("read and blush") cannot be seen.
- **Owner:** qs-narrative-director (shot/reveal staging). **Collaborator:** qs-ui-designer (`letterReveal` sheet size and position).
- **Repro:** `qa/shots/endings/perfect-5s.png`, `same_gender-5s.png`, `self_love-5s.png`. The sheet sits over the recipient's face, so the blush/cry expressions are hidden. In `caught_read` story already keeps the head low in frame for this reason.
- **Suggestion:** place the sheet beside the face, shrink it during `read`, or frame the reader in the lower third.

## BUG-007 — Aim view: the classmate directly in front fills a large part of the screen

- **Severity:** P2 (readability and fun). The crush's desk is often hidden behind the r3c0 head until the player looks up/aside.
- **Owner:** lead (layout / `PLAYER_EYE` height, now 1.18 m). **Collaborators:** qs-character-artist (head size), qs-camera-director (resting pitch).
- **Repro:** `qa/shots/keyframes/05-aim.png`, `18-normal-aim.png`, `15-phone-aim.png` (about half of a 360×640 screen).
- **Suggestion:** raise the eye height or add a slight resting up-pitch, or make the near head slightly transparent. The camera already fades it in some frames, e.g. `qa/shots/a4/caught_read-retry.png`.

## BUG-008 — Phone layout: wrong control hints, and a touch button over the hand

- **Severity:** P2.
- **Owner:** qs-ui-designer.
- **Repro:** `qa/shots/keyframes/15-phone-aim.png` (360×640, `hasTouch`).
  - The hint bar says "按住 左键 蓄力 · 右键/空格 装认真" on a touch device.
  - The 装认真 button covers the hand holding the ball.
  - There is no visible hint for how to charge by touch.
- **Expected:** touch hints (e.g. 按住屏幕蓄力) when `pointer: coarse` or the width is ≤ 768 px, and the button clear of the hand.

## BUG-009 — Latin text on screen

- **Severity:** P3, a design call.
- **Owner:** qs-ui-designer.
- **Detail:** J1 flags "LOVE LETTER PARABOLA" under the title logo, and "也可以再按一次 Esc" in the pause menu. Both are probably intentional (logo subtitle, key name). Confirm with the lead, or use "Esc 键".
- **Evidence:** `qa/data/J1.json`.
