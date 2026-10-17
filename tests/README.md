# QA test suite — 情书抛物线

Owner: qs-qa-lead. The suite covers every item of `docs/ACCEPTANCE.md` (A1–J2) and depends only on `docs/CONTRACTS.md`, the debug API `window.__qs` (`src/core/debug.js`), and a few documented module additions (`docs/modules/*.md`), all read with optional chaining.

## Running

```
node tests/run.mjs                 # full suite: ~35 specs, all 13 endings, screenshots
node tests/run.mjs --quick         # cheap pass: reduced scales, 4 endings, no PNG key frames (G1 skipped)
node tests/run.mjs --only E1,F     # ids or category letters; results merge into qa/results.json
node tests/run.mjs --strict        # "pending implementation" counts as failure (release gate)
node tests/run.mjs --list          # inventory
node tests/run.mjs --no-shots      # skip ending PNGs
```

The whole run uses **one** browser from `tools/browser.mjs` `withGame()`, which holds one slot of the machine-wide 2-slot lock. Isolated pages are opened as new contexts inside that browser. Nothing else launches Chromium.

### Outputs

| Path | Contents |
|---|---|
| `qa/results.json` | machine-readable results (`results.prev.json` = previous full run) |
| `qa/REPORT.md` | generated report. The `<!-- manual:start -->…<!-- manual:end -->` block is preserved across runs. |
| `qa/data/<id>.json` | per-spec raw data (per-seat tables, per-throw logs, ending scripts, …) |
| `qa/shots/**` | screenshots (git-ignored) |
| `qa/BUGS.md` | bug list |
| `qa/repro/*.js` | repro scripts |

## Layout

| File | Role |
|---|---|
| `run.mjs` | runner: spec loading, timeouts, memoised shared sessions, results merge, report |
| `lib/harness.page.js` | page-side harness `window.__qa`, injected with `addInitScript` before the game boots. See below. |
| `lib/session.mjs` | node-side `Session` (fresh page, eval, screenshots, composited-image analysis, extra contexts) + real-input UI drivers |
| `lib/endings.mjs` | the 13 ending scenarios, the instrumented **ending sweep**, the `resolve()` table |
| `lib/audio.mjs` | shared unmuted audio round for H1/H2 |
| `lib/common.mjs` | small helpers, sweep memo |
| `lib/report.mjs` | `qa/REPORT.md` generator |
| `specs/<A-J><n>-*.mjs` | one spec per acceptance item: `{id, title, priority, owners, method, run(page, h)}` → `{status: pass/warn/fail, details, evidence[], data, pending?}` |

### What `window.__qa` provides

- **Instrumentation installed before boot:**
  - AudioContext instances are tracked.
  - Every connection to the destination is routed through an analyser (`audioLevel(ms)` → peak/RMS).
  - `speechSynthesis.speak` is spied.
- **Spies after boot:**
  - bus `*` events, with time stamps;
  - calls to `ctx.audio/cam/ui/story/ai` contract methods;
  - a `renderer.render` call counter (detects PiP);
  - a per-tick diff of `ctx.audio.debug.recent`.
- **Deterministic stepping** (`tick`, `step`, `stepUntil`): 1/60 s per `engine.tick`, a macrotask yield between ticks, and per-tick samplers. `pump(on)` gives real-time ticking without rendering, for DOM-driven UI phases.
- **Scenario helpers:**
  - `begin`: `qs.start` + quiet class + frozen wind + forced teacher + suspicion;
  - `act`: throw / charge / idle, run to `ending`, with flight metrics;
  - `recordEnding`: the E2 metrics plus shots up to the card;
  - `aimSnapshot`: A4 checks.
- **Physics sandbox** (`sandbox`, `physSetup`, `physThrow`):
  - `ball:launched` / `ball:landed` are swallowed so the flow stays in `aim`, which lets C1/C2 make many throws in one round;
  - every tick checks for NaN, room containment (except through window w1) and thin-slab tunnelling.
- **Camera metrics:** NDC projection of the ball, a 5-ray occlusion test against visible opaque meshes, camera-inside-collider detection.
- **Images:** canvas thumbnails (`thumb`), renders from a fixed QA camera (`thumbWith` / `shotWith`), analysis of composited screenshots (`analyzePng`: luminance, black/white bands).

## Selectors the tests depend on (visible text; from docs/modules/ui.md)

Real-input specs (B1, A3, E4, G1, H1–H3, J1) locate UI by visible text, trying `role=button name=<re>` first, then `getByText(<re>)`, then CSS. The selector that actually matched in a run is recorded in that spec's `qa/data/<id>.json` (`selectors`).

| Key | Patterns (first match wins) | Used by |
|---|---|---|
| title.male / female | `^我是男生$`, `我是\s*男生`, `男生` / same for 女生 | B1, G1, H1, J1 |
| title.start | `^开始$`, `开始游戏`, `^开始` | B1, G1, H1 |
| title.gallery | `^结局图鉴`, `结局图鉴`, `图鉴` | E4, G1, J1 |
| title.settings | `^设置$` | G1, H3, J1 |
| settings master volume | `getByRole('slider', {name: /主音量/})`, fallback first `input[type=range]` | H3 |
| settings.done | `^完成$` | G1, H3, J1 |
| how-to | `^玩法说明$` / `^知道了$` | J1 |
| letter preset | `^<preset title>$` (titles read from `ctx.story.letters`) | B1, A3, G1, H1 |
| letter custom | `textarea` (then `[contenteditable]`, `input[type=text]`); tab `^自己写$` if hidden | B1 |
| letter confirm | `^写好了$`, `写好了`, `^完成$`, `确定` | B1, A3, G1, H1 |
| crumple | `mouse.down` at the screen centre (full-screen `.qs-catcher`), fallback the hint `按住鼠标` / `揉成一团`; held until phase ≠ `letter` | B1, A3, G1, H1 |
| intro skip | one click at the centre | B1 |
| card | `^再来一局$`, `^改写情书$`, `^回到标题$` (fallback when `__qs.cardChoice` does nothing) | B1, A3, A4 |
| gallery back | `^返回$` | G1, J1 |
| pause | real `Escape`; resume `^继续$` | B6, G1, J1 |

If a label changes, update `SEL` in `tests/lib/session.mjs` and this table.

## Determinism and flakiness

- Scenarios use fixed seeds and a quiet class (`ai.students.setAmbient(false)`, which is sticky). The teacher is forced **after** `__qs.start()`, because `force()` is cleared on `round:setup`. Wind is frozen by stubbing `classroom.gust` and zeroing `wind.strength` around the AI/gameplay update slots.
- Every ending scenario has 2–4 attempts. Needing more than one attempt is reported as "unstable" (E1 warning). Never meeting the physical precondition is reported as "unreachable" (E1 failure).
- B5 replays the same seed + solution on fresh pages and requires identical landings (determinism), which validates the A/D measurement.
- Timeouts are in ui seconds (`stepUntil`). SwiftShader renders take ~0.2 s/frame, so renders are only done for screenshots/thumbnails.
