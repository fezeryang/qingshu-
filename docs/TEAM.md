# Team and Collaboration Rules (lead-owned)

## 1. Roles and directory ownership

| Agent | Responsibility | Exclusive write access | Preview / self-test scripts |
|---|---|---|---|
| **lead** (main session) | Director/architect: GDD, contracts, core, integration, merging, commits | `src/main.js` `src/core/**` `index.html` `tools/**` `docs/GDD.md` `docs/CONTRACTS.md` `docs/TEAM.md` `docs/ACCEPTANCE.md` `package.json` | — |
| `qs-env-artist` | Environment art: classroom, ending sets, lighting, particles, blackboard/clock/curtains/fans | `src/world/**` | `dev/world/**` |
| `qs-character-artist` | Character art & animation: chibi characters, faces, clips, emotes, first-person arms, props | `src/characters/**` | `dev/characters/**` |
| `qs-gameplay-engineer` | Gameplay & physics: charge-and-throw, ball physics, solver, trajectory preview, hold-breath nudge, landing classification | `src/gameplay/**` | `dev/gameplay/**` |
| `qs-ai-designer` | Behaviour AI: teacher state machine / vision / suspicion, classmate fidgets, in-flight accidents, lecture content | `src/ai/**` | `dev/ai/**` |
| `qs-camera-director` | Camera: first person, ball follow cam, bullet time, PiP, shot library, transitions | `src/camera/**` | `dev/camera/**` |
| `qs-narrative-director` | Story & endings: class roster, letter presets, ending resolution, intro and 13 ending cutscenes | `src/story/**` | `dev/story/**` |
| `qs-ui-designer` | UI: title, letter writing, crumpling, HUD, dialogue, bubbles, captions, ending card, gallery, pause/settings | `src/ui/**` (incl. `ui.css`), `assets/fonts/**` | `dev/ui/**` |
| `qs-audio-composer` | Music & sound: procedural score, adaptive tension, all SFX, voiced dialogue, read-aloud | `src/audio/**`, `tools/voices/**`, `assets/voices/**` | `dev/audio/**` |
| `qs-qa-lead` | Acceptance & testing: automated tests, ending reachability, visual review, performance, bug reports, release gate | `tests/**` `qa/**` | `qa/shots/**` |

Every agent may also write `docs/modules/<own module>.md` (implementation notes) and `docs/requests/<self>-to-<other>.md` (requests).

## 2. Hard rules

1. **Only touch your own directories.** Found a bug or missing capability in another module? File a request and list it in your delivery report; meanwhile keep your side working with optional chaining / fallbacks. Don't wait.
2. **Don't change the contract.** Names and signatures in `docs/CONTRACTS.md` are changed only by the lead. Additions go in `docs/modules/<module>.md`.
3. **No git commits, no edits to package.json, no new dependencies, no downloads of external resources** (exceptions: ui-designer may add open-source Chinese fonts under `assets/fonts/` with their license, ≤ 8 MB; audio-composer pre-renders dialogue with edge-tts into `assets/voices/`, ≤ 12 MB — see docs/PLAYTEST-1.md). All other art and audio are **procedural**.
4. **Never launch your own browser.** Use only `node tools/shot.mjs`, `node tools/check.mjs --smoke`, or `tests/` (they share a machine-wide limit of 2 browsers; this box has 6 GB RAM). Before screenshots call `qs.manual(true)` and fast-forward with `qs.advance()`; SwiftShader rendering is slow, so keep each script to ≤ 10 shots.
5. **Before every delivery** pass `node tools/check.mjs` (syntax + R1 timers + R2 cross-module imports + R3 randomness) and `node tools/check.mjs --smoke` (full round).
6. **Look at your own work.** Take screenshots with a shot script (output to `dev/<module>/shots/`, git-ignored) and open the PNGs with the Read tool. Visual agents attach at least 3 key screenshot paths to their delivery.
7. **All Markdown is English** (module notes, requests, reports). In-game text is Simplified Chinese; no placeholder strings ("TODO", "stub", "lorem", "测试") may reach the player.
8. Jokes in endings like `same_gender` come from the mix-up and the absurdity, never from mocking any group; the whole game stays PG and school-appropriate.

## 3. Workflow

```
Lead: GDD + contracts + core + gray-box stubs (the game already plays end-to-end)
  ↓ in parallel
8 builder agents replace their stubs → self-test → delivery report
qa-lead builds the test suite at the same time (against the contracts and __qs)
  ↓
Lead integrates (handles requests, fixes core) → qa-lead full acceptance run → bugs assigned to owning agents → fixes → re-verification
  ↓ until everything in docs/ACCEPTANCE.md passes
```

## 4. Delivery report format (each agent's final message)

```
## <agent> delivery
- Done: bullet list (tick off your P0/P1/P2 items one by one)
- Not done / downgraded: and why
- New APIs (documented in docs/modules/<module>.md): …
- Requests (to whom, what, why): …
- Self-test: check / smoke results; screenshot paths (dev/<module>/shots/...)
- Known issues / risks: …
```
