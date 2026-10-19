# UI module (`src/ui/`): implementation notes

Owner: qs-ui-designer. Contract: `docs/CONTRACTS.md` §4.7. The visual language is a high-schooler's notebook: lined paper, washi tape, sticky notes, highlighters and red pen.

## Files

| File | Contents |
|---|---|
| `index.js` | install, layers, the shared kit `U`, the single `onUpdate(ORDER.UI)` loop, Esc/pause wiring, `closeAll`, `ctx.ui` |
| `title.js` | title screen, settings panel, how-to panel |
| `letter.js` | `letterEditor`, `crumple` |
| `hud.js` | HUD (suspicion eye, crosshair and charge ring, timer, objective, hints, willpower bar, danger vignette, touch buttons) |
| `talk.js` | `say`, `bubble`, `caption`, `toast` |
| `reveal.js` | `letterReveal` (read / readAloud / grading / reply) |
| `card.js` | `endingCard`, `gallery`, `debugChoose` |
| `pause.js` | pause menu |
| `dom.js`, `icons.js` | DOM helpers and inline SVG doodles. There are no emoji, because headless and Linux browsers often have no emoji font. |
| `ui.css` | all styles; imports the bundled fonts |

Fonts are in `assets/fonts/` (4.2 MiB in total, SIL OFL 1.1; see `assets/fonts/SOURCES.txt`):
- `'QS KuaiLe'` (ZCOOL KuaiLe) for the logo, buttons, dialogue and HUD.
- `'QS Hand'` (Long Cang) for handwriting.

Both use unicode-range sliced WOFF2, so the browser downloads only the slices it needs. If the fonts are unavailable, text falls back to the system CJK stack (`PingFang SC`, `Microsoft YaHei`, `Noto Sans CJK SC`, `WenQuanYi Micro Hei`, `Droid Sans Fallback`).

## Stable button labels (QA locates these by visible text)

The text content of each button is exactly the label below. Each label is unique on its screen.

| Screen | Labels |
|---|---|
| Title | `我是男生`, `我是女生` (toggles, `aria-pressed`), `开始`, `结局图鉴` (the button also contains an `x/13` badge), `设置`, `玩法说明` |
| Settings panel | sliders `主音量` `音乐` `音效` `视角灵敏度` (aria-labels), 语音 choice `真人朗读` / `哔哔声` / `关闭` (`aria-pressed`), checkbox `减少晃动`, button `完成` |
| How-to panel | `知道了` |
| Letter editor | preset tabs use each preset's `title` (stub: `含蓄` `中二` `土味`), `自己写`, `写好了`. The custom text box is the only `<textarea>` (aria-label `自己写情书`, maxlength 60). |
| Crumple | no button. Hold the mouse anywhere on screen (a full-screen catcher `.qs-catcher`), or hold Space. Hint text: `按住鼠标（或空格）把它揉成一团` |
| Ending card | `再来一局` (`retry`), `改写情书` (`rewrite`), `回到标题` (`title`). The buttons fade in 0.45 s after the card appears (`visibility` animation), so Playwright waits for them automatically. |
| Gallery | `返回` |
| Pause menu | `继续`, `设置`, `结局图鉴` |
| Touch (width ≤ 768 px or coarse pointer) | `装认真` (aim, lower left) and `屏息` (flight, lower left) simulate holding Space. `左` / `右` (flight, lower right) simulate holding KeyA / KeyD for the nudge. All of them go through `ctx.input.simulate`. The hold buttons sit on the left because the first-person hand is at the lower right. |

## Behaviour that matters to other modules

- **Pointer events.** `#ui-root` and every layer use `pointer-events:none`. Only real controls get `auto`. During aim and flight there is no layer that intercepts the mouse; the only exception is the pause scrim, which appears while the game is paused. The crumple screen uses a full-screen catcher during the letter phase only. `#ui-root` gets `z-index:100` (from `ui.css`), so dialogue and captions draw above camera overlays such as fades and letterbox bars.
- **Timing.** Every flow-relevant wait runs on the ui clock through one `onUpdate(ORDER.UI)`. CSS animations are visual only. In manual mode, `__qs.advance()` fast-forwards typewriters, auto-advance, crumple progress and reveal durations.
- **`say(speaker, text, {charId, voice, mood, dur})`**
  - Typewriter speed is 0.045 s per character, with extra pauses after punctuation. It calls `ctx.audio.blip(voice, char)` for each non-punctuation character and emits `say`.
  - The line auto-advances at `max(0.9 + 0.06·len, typing + 0.6)` seconds (ui clock), or after `dur` if given. It never needs a click.
  - Click, Space or Enter first finishes the typing, then advances. These inputs are read from `ctx.input` and count only while `ctx.input.enabled === false`, so they never clash with charging or studying.
  - A new `say` replaces the current line, which resolves immediately.
  - Moods: `shout`, `angry`, `whisper`, `love`/`shy`/`blush`, `sad`. The speaker `旁白` or `''` uses the narrator style.
  - Name-plate colour: `spec.color` if present; the teacher is green; otherwise a hashed marker colour.
- **`bubble(target, text, {dur, style, mood, voice, silent})`**
  - `target` can be a char id, a `Vector3`, an `Object3D`, or a Character.
  - The bubble is projected every frame and clamped to the screen edges, with the tail pointing at the speaker. It is hidden while the character's root is invisible.
  - A new bubble on the same char id replaces the old one.
  - Default duration is about `1.2 + 0.09·len` seconds (ui clock).
  - `style`: `speech` | `shout` | `think`.
- **`caption(text, {style, dur, color})`**: default durations are impact 1.9 s, chapter 2.8 s and whisper 2.4 s, plus a 0.3 s exit. `\n` becomes a line break. A new caption of the same style replaces the old one.
- **`letterReveal(text, {mode, score, dur, rate, keep})`**
  - The UI does **not** call `ctx.audio.speak`. Story runs it in parallel.
  - `readAloud` estimates about 4.3 characters/s × `rate` per sentence. `grading` takes about 6.2 s, with the score stamp at 3.7 s.
  - A click after 0.8 s skips to the end.
  - **Addition:** `keep: true` resolves after the duration but leaves the sheet on screen until `ui.closeReveal()`, `closeAll()` or the next reveal.
- **HUD**
  - Visible in `aim` and `flight`. `hud.show(bool)` overrides this until the next phase change; `show(null)` returns to automatic.
  - Every frame it reads `ctx.round.suspicion/timeLeft`, `ctx.gameplay.aim.{charging,power,studying}`, `ctx.gameplay.willpower.{value,active}` and `ctx.ai.teacher.state`.
  - If nobody calls `setObjective` before aim starts, the objective falls back to `把情书扔到 <crush name> 的课桌上`. A leading `目标：` in the text is stripped, because the sticky note already shows that label.
  - `prompt(text)` stays until `prompt(null)` or the next phase change. The default phase hints fade after 6 s.
  - In aim, it calls `ctx.world.classroom.clock.set(min, sec)` once per remaining second.
- **Pause.**
  - Esc during aim or flight sets `ctx.engine.paused = true`. While paused, Esc again, `继续`, or `ui.pause.close()` resumes. Real key presses use a DOM listener (no ticks run while paused); `ctx.input.simulate({down:'Escape'})` works too, and the two are de-duplicated.
  - Hiding the tab during aim or flight also pauses, except in manual mode.
  - If something else has already paused the engine, the menu does not open.
- **`closeAll()`** closes the title, letter and crumple screens, the card, reveal, captions, bubbles, dialogue, toasts, modals and pause. Pending promises resolve, except title/card choices. On `round:setup` the UI runs the same reset, but it spares items created in that same tick by another `round:setup` handler.
- **Audio unlock.** The first `pointerdown` or `keydown` anywhere calls `ctx.audio.unlock()`, and so does every UI button click.

## Voiced dialogue (playtest 1)

- `say` calls `ctx.audio.voiceLine(text, voice, {charId, mood})`.
  - **Typewriter pacing:** matched to the estimated spoken length, about 4.6 syllables/s, capped at 0.11 s per character.
  - **Resolves** when the text is typed, the minimum display time has passed, and the voice Promise has resolved. A safety cap of max(6 s, 2× estimate + 3 s) means a stuck voice never blocks the flow.
  - **First click / Space:** finishes the text and cancels the voice, via `promise.cancel()`, then `ctx.audio.stopVoice()`, then `cancelVoice()` (see `docs/requests/ui-to-audio.md`).
  - **Second click / Space:** advances.
  - **Blips:** none per character while `voiceLine` exists. If `voiceLine` is missing, the old per-character blips are used.
- **Bubbles are silent by default**, so lecture bubbles never talk over dialogue. Opt in with `bubble(id, text, {voiced: true})` or an explicit `voice` object. That uses `voiceLine`, or soft blips if `voiceLine` is missing.
- **Setting 语音:** `真人朗读` / `哔哔声` / `关闭` writes `ctx.settings.voiceMode` ('speech' | 'blips' | 'off'), then calls `ctx.audio.applySettings`, and stores the result in `qingshu.settings`. When `ctx.audio.voiceQuality` is 'legacy' or 'none', the panel shows the note 推荐使用 Edge 浏览器以获得最自然的语音.
- Self-test: `dev/ui/voice.js`. It uses a fake 3 s `voiceLine`, checks that a short line waits for the voice, that the first Space cancels it and the second advances, and that no blips play while voiced.

## Touch / phone layout

When the pointer is coarse or the window is ≤ 768 px wide (checked at each phase change), the HUD shows touch hints instead of mouse and keyboard hints:
- aim: `按住屏幕蓄力，松手扔出 · 老师回头就按住「装认真」`
- flight: `按住「屏息」慢动作 · 按「左」「右」意念微调`

On touch layouts the willpower bar is raised above the touch buttons.

## Camera overlays and the PiP

- Camera effects (`#cam-fx`) sit under `#ui-root`. No UI element uses a negative z-index: the bubble tail is an inline SVG, and impact speed lines are ordered by DOM position.
- During flight, the HUD keeps the camera's top-right PiP rectangle clear. That rectangle is x ≥ W − 0.28·W − margin, y ≥ max(68 px, 0.14·H). In flight the alarm clock is hidden (`visibility:hidden`). The willpower bar and hints stay at the bottom centre, and the eye sticker stays at the top centre, above and left of the PiP.

## Latin text (BUG-009, design decision)

"LOVE LETTER PARABOLA" under the title logo is intentional: it is the logo's decorative subtitle. "Esc" in the pause hint is the name of the key as printed on keyboards. Both stay as they are.

## Additions to `ctx.ui` (beyond the contract)

- `ui.closeReveal()`
- `ui.settings()`: opens the settings panel.
- `ui.pause.open()`, `ui.pause.close()`, `ui.pause.isOpen`
- `ui.state` (debug snapshot): `{phase, hud, paused, modals[], say, screen[]}`

## Settings

Changing a setting writes `ctx.settings.{masterVolume, musicVolume, sfxVolume}` (0–1), `sensitivity` (0.5–2) and `reducedMotion`. It then calls `ctx.audio.applySettings(ctx.settings)` and stores the result under `qingshu.settings`. The gender toggle on the title screen persists `playerGender` the same way. `reducedMotion` (or the OS `prefers-reduced-motion` setting) disables shakes and jitters.

## Self-test scripts

```
node tools/shot.mjs --script dev/ui/screens1.js --out dev/ui/shots           # title, settings, letter, crumple, HUD states
node tools/shot.mjs --script dev/ui/screens2.js --out dev/ui/shots           # say+bubble, impact, reveals, card, gallery
node tools/shot.mjs --script dev/ui/flow.js --out dev/ui/shots               # DOM-click flow: title→letter→crumple→aim→pause→card→rewrite→title
# add --w 360 --h 640 --out dev/ui/shots/m for the phone layout
```
