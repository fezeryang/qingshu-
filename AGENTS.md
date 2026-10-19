# Repository Guidelines

## Project Structure & Module Organization

情书抛物线 (Love Letter Parabola) is a browser-based, first-person classroom game built with Three.js and native JavaScript modules. `index.html` loads `src/main.js`; `src/core/` provides the engine, flow, configuration, and shared utilities. Feature folders include `world`, `characters`, `gameplay`, `ai`, `story`, `camera`, `audio`, and `ui`.

`assets/` holds game resources; `vendor/` contains browser dependencies. `tests/specs/` contains acceptance specs, `tests/lib/` provides harnesses, and `qa/` stores reports and evidence. Use `dev/` for development scenarios and `tools/` for shared automation. Read `docs/CONTRACTS.md`, `docs/ACCEPTANCE.md`, and the relevant `docs/modules/` document before changing behavior.

## Build, Test, and Development Commands

- `npm ci`: install dependencies from the lockfile.
- `npm start`: serve the game at `http://localhost:8080`; use `PORT=8081 npm start` to change ports. No bundling/build step is configured.
- `npm run check`: validate JavaScript syntax and architectural rules.
- `npm run check -- --smoke`: also boot headless Chromium and exercise scripted rounds.
- `npm test -- --quick`: run reduced acceptance scenarios.
- `npm test -- --strict`: run the full release gate, treating pending implementations as failures.
- `npm run shot`: capture the title screen under `qa/shots/`.

## Coding Style & Naming Conventions

Match existing two-space indentation, semicolons, single-quoted strings, and ES module imports. Use camelCase functions/variables and descriptive lowercase filenames. No dedicated formatter is configured.

Feature modules expose `install(ctx)` through `index.js`. Communicate across modules through `ctx` and the event bus; import only local module files, core utilities, and Three.js. Preserve documented API/event contracts. Use `ctx.time` for scheduling and `ctx.rng` for gameplay randomness. Take layout values from `src/core/layout.js`.

## Testing Guidelines

Tests use a custom Playwright runner; name specs `tests/specs/<A-J><n>-*.mjs` to match acceptance IDs. Run focused checks with `npm test -- --only E1,F`. Use fixed seeds and `tools/browser.mjs` for browser automation, respecting its shared two-browser limit. Update UI selectors when labels change. Review `qa/REPORT.md` and `qa/results.json`; no numeric coverage threshold is configured.

## Commit & Pull Request Guidelines

History uses descriptive, imperative subjects, often prefixed by subsystem, such as `Camera:` or `Audio:`. Keep commits focused. PRs should explain behavior changes, link relevant issues or acceptance IDs, list validation commands/results, and include screenshots for visual changes. Document additive APIs in `docs/modules/`. Review diffs before committing; never commit secrets or ignored screenshots.
