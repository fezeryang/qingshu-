// Letter writing (sticky-note presets or free text ≤ 60 chars) and the hold-to-crumple interaction.
import { h } from './dom.js';
import { BALL_SVG } from './icons.js';

const MAX = 60;
const HOLD_SECS = 1.2;
const CRUMPLE_HINT = '按住鼠标（或空格）把它揉成一团';

export function createLetter(U) {
  const { ctx } = U;
  let screen = null;          // the letter screen (kept alive between editor() and crumple())
  let last = { presetId: undefined, text: '', custom: '' };

  function buildPaper(text) {
    const body = h('div.qs-letter-text', {}, text || '');
    const input = h('textarea.qs-letter-input.qs-i', { maxlength: String(MAX), rows: '4', placeholder: '写下你想说的话……（最多 60 字）', spellcheck: 'false', 'aria-label': '自己写情书' });
    const count = h('div.qs-letter-count', {}, `0/${MAX}`);
    const paper = h('div.qs-letterpaper.qs-paper', {},
      h('div.qs-crease-svg'), body, input, count,
      h('div.qs-letter-sign', {}, '—— 后排靠窗的某人'));
    const wrap = h('div.qs-paper-wrap', {}, paper);
    return { wrap, paper, body, input, count };
  }

  // ---------------------------------------------------------------- editor
  function editor({ presets } = {}) {
    closeScreen();
    const list = (presets && presets.length ? presets : ctx.story?.letters || []).slice(0, 8);
    return new Promise((resolve) => {
      const P = buildPaper('');
      const tabs = h('div.qs-tabs');
      let sel = list.some((p) => p.id === last.presetId) ? last.presetId : last.presetId === null ? null : list[0]?.id ?? null;
      P.input.value = last.custom || '';
      const refreshCount = () => {
        const n = [...P.input.value].length;
        P.count.textContent = `${n}/${MAX}`;
        P.count.classList.toggle('is-full', n >= MAX);
      };
      P.input.addEventListener('input', () => {
        const arr = [...P.input.value];
        if (arr.length > MAX) P.input.value = arr.slice(0, MAX).join('');
        refreshCount();
        P.paper.classList.remove('is-empty');
      });
      const select = (id) => {
        sel = id;
        for (const t of tabs.children) t.setAttribute('aria-pressed', String(t.dataset.id === String(id)));
        const p = list.find((x) => x.id === id);
        P.paper.classList.toggle('is-custom', id === null);
        P.body.textContent = p ? p.text : '';
        if (id === null) { refreshCount(); P.input.focus({ preventScroll: true }); }
      };
      const colors = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple', 'yellow', 'pink'];
      list.forEach((p, i) => {
        const t = U.button(p.title || `第${i + 1}封`, `qs-tab qs-tab-${colors[i % colors.length]}`, () => select(p.id), { sound: 'pageFlip' });
        t.dataset.id = String(p.id);
        tabs.appendChild(t);
      });
      const mine = U.button('自己写', 'qs-tab qs-tab-mine', () => select(null), { sound: 'pencil' });
      mine.dataset.id = 'null';
      tabs.appendChild(mine);

      const done = U.button('写好了', 'qs-btn-done', () => {
        let text, presetId;
        if (sel === null) {
          text = [...P.input.value.trim()].slice(0, MAX).join('');
          if (!text) {
            P.paper.classList.remove('is-empty'); void P.paper.offsetWidth; P.paper.classList.add('is-empty');
            P.input.focus({ preventScroll: true });
            return;
          }
          presetId = null;
          last.custom = P.input.value;
        } else {
          const p = list.find((x) => x.id === sel);
          text = p?.text ?? '';
          presetId = p?.id ?? null;
        }
        last.presetId = presetId; last.text = text;
        P.input.blur();
        P.body.textContent = text;
        P.paper.classList.remove('is-custom');
        screen.el.classList.add('is-done');
        U.blurFocus();
        resolve({ text, presetId });
      }, { sound: 'ding' });

      const el = h('div.qs-screen.qs-letter', { 'data-kind': 'letter' },
        h('div.qs-letter-head', {}, '写一封情书', h('small', {}, '选一张便利贴，或者自己写')),
        h('div.qs-letter-stage', {}, tabs, P.wrap, done));
      U.L.screen.appendChild(el);
      screen = { el, P };
      select(sel);
      if (sel !== null) P.input.blur();
    });
  }

  // ---------------------------------------------------------------- crumple
  function crumple() {
    let P;
    if (screen && screen.el.isConnected) {
      P = screen.P;
      screen.el.classList.add('is-done');
    } else {
      closeScreen();
      P = buildPaper(ctx.round?.letter?.text || last.text || '');
      const el = h('div.qs-screen.qs-letter.is-done', { 'data-kind': 'letter' }, h('div.qs-letter-stage', {}, P.wrap));
      U.L.screen.appendChild(el);
      screen = { el, P };
    }
    const el = screen.el;
    el.classList.add('is-crumple');
    el.dataset.kind = 'crumple';
    U.blurFocus();

    // Full-screen catcher (only during this screen — never during aim).
    const ring = h('div.qs-crumple-ring', { html: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="track"/><circle cx="50" cy="50" r="42" pathLength="100" class="fill"/></svg>' });
    const hint = h('div.qs-crumple-hint', {}, ring, h('span', {}, CRUMPLE_HINT));
    const catcher = h('div.qs-catcher.qs-i');
    el.append(catcher, hint);
    const ringFill = ring.querySelector('.fill');

    // creases (random lines that fade in with progress)
    const N = 22;
    const jit = Array.from({ length: N }, () => 0.35 + Math.random() * 0.65);
    let creaseD = '';
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * 100, y = Math.random() * 100, a = Math.random() * Math.PI, l = 20 + Math.random() * 40;
      creaseD += `M${(x - Math.cos(a) * l / 2).toFixed(1)} ${(y - Math.sin(a) * l / 2).toFixed(1)}L${(x + (Math.random() - 0.5) * 10).toFixed(1)} ${(y + (Math.random() - 0.5) * 10).toFixed(1)}L${(x + Math.cos(a) * l / 2).toFixed(1)} ${(y + Math.sin(a) * l / 2).toFixed(1)}`;
    }
    const creaseBox = P.paper.querySelector('.qs-crease-svg');
    creaseBox.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${creaseD}"/></svg>`;

    let domHold = false;
    const down = (e) => { if (e.button === 2) return; domHold = true; U.unlock(); };
    const up = () => { domHold = false; };
    catcher.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    catcher.addEventListener('contextmenu', (e) => e.preventDefault());

    return new Promise((resolve) => {
      let p = 0, shown = 0, floor = 0, wasHeld = false, nextSfx = 0, finishing = false;
      const apply = (k, t) => {
        // k: displayed progress 0..1
        const pts = [];
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2 + Math.PI / 4;
          // rectangle perimeter point in % (square-ish mapping via clamp of cos/sin)
          const cx = Math.max(-1, Math.min(1, Math.cos(a) * 1.42)), cy = Math.max(-1, Math.min(1, Math.sin(a) * 1.42));
          const pull = k * jit[i] * 0.55 + (k > 0.05 && wasHeld ? Math.sin(t * 40 + i * 1.7) * 0.02 * k : 0);
          pts.push(`${(50 + cx * 50 * (1 - pull)).toFixed(1)}% ${(50 + cy * 50 * (1 - pull)).toFixed(1)}%`);
        }
        P.paper.style.clipPath = k > 0.002 ? `polygon(${pts.join(',')})` : '';
        const s = 1 - 0.7 * k;
        const rot = k * 18 + (wasHeld ? Math.sin(t * 31) * 2.2 * k : 0);
        P.wrap.style.transform = `scale(${s.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
        P.paper.style.setProperty('--k', k.toFixed(3));
        ringFill.style.strokeDashoffset = String(100 - Math.round(p * 100));
      };
      const off = U.frame((dt) => {
        if (finishing) return;
        const inp = ctx.input;
        const held = domHold || inp?.isDown?.('Mouse0') || inp?.isDown?.('Space');
        if (held) {
          if (!wasHeld) { nextSfx = 0; el.classList.add('is-holding'); }
          p = Math.min(1, p + dt / HOLD_SECS);
          floor = Math.max(0, p - 0.15);
          if (U.now >= nextSfx) { U.sfx('paperCrumple', { volume: 0.8, rate: 0.85 + Math.random() * 0.35 }); nextSfx = U.now + 0.26 + Math.random() * 0.1; }
        } else {
          if (wasHeld) el.classList.remove('is-holding');
          p = Math.max(floor, p - dt * 0.6);
        }
        wasHeld = held;
        shown += (p - shown) * Math.min(1, dt * (held ? 14 : 6));
        apply(Math.max(0, shown), U.now);
        if (p >= 1) { finishing = true; off(); finish(); }
      });
      async function finish() {
        catcher.remove();
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        hint.classList.add('is-out');
        apply(1, U.now);
        // swap the crumpled sheet for a paper ball, then toss it to the bottom-right (the FP hand)
        const ball = h('div.qs-crumple-ball', { html: BALL_SVG });
        el.appendChild(ball);
        P.wrap.classList.add('is-gone');
        U.sfx('swoosh', { volume: 0.6 });
        await U.tween({ duration: 0.18, onUpdate: (k) => { ball.style.transform = `translate(-50%, -50%) scale(${(0.6 + 0.4 * k).toFixed(3)})`; } });
        await U.wait(0.12);
        const W = window.innerWidth, H = window.innerHeight;
        await U.tween({
          duration: 0.5,
          ease: (x) => x * x,
          onUpdate: (k) => {
            const x = k * W * 0.36, y = k * H * 0.36 - Math.sin(k * Math.PI) * H * 0.12;
            ball.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) scale(${(1 - 0.55 * k).toFixed(3)}) rotate(${(k * 300).toFixed(0)}deg)`;
            ball.style.opacity = String(1 - Math.max(0, k - 0.8) * 5);
          },
        });
        closeScreen();
        resolve();
      }
      screen.cancel = () => { off(); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); resolve(); };
    });
  }

  function closeScreen() {
    if (!screen) return;
    const s = screen; screen = null;
    s.el.remove();
    s.cancel?.();
  }

  U.onClose(({ setup } = {}) => { if (!setup) closeScreen(); else if (screen && !screen.el.classList.contains('is-crumple')) closeScreen(); });
  return { editor, crumple };
}
