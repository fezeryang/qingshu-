// UI layer (owner: ui-designer). Contract: docs/CONTRACTS.md §4.7. Notes: docs/modules/ui.md
//
// Visual language: a high-schooler's notebook — lined paper, handwriting, highlighters, washi tape,
// sticky notes, red-pen corrections. Pure DOM + CSS under #ui-root.
//
// Rules this file enforces for the whole UI:
//  - #ui-root and every layer are pointer-events:none; only real controls (.qs-i) take the mouse,
//    so the canvas always receives presses during aim.
//  - Every wait the flow depends on (typewriter, auto-advance, crumple progress, durations) runs on
//    ctx.time (ui clock) through one onUpdate(ORDER.UI) loop — tests can fast-forward everything.
import { h } from './dom.js';
import { store } from '../core/util.js';
import { createTitle } from './title.js';
import { createLetter } from './letter.js';
import { createHud } from './hud.js';
import { createTalk } from './talk.js';
import { createReveal } from './reveal.js';
import { createCards } from './card.js';
import { createPause } from './pause.js';

export async function install(ctx) {
  const { engine, time, bus, input } = ctx;
  const root = document.getElementById('ui-root');
  root.textContent = '';
  root.classList.add('qs-ui');

  const layer = (name) => root.appendChild(h(`div.qs-layer.qs-layer-${name}`));
  const L = {
    hud: layer('hud'), world: layer('world'), reveal: layer('reveal'), talk: layer('talk'),
    caption: layer('caption'), screen: layer('screen'), modal: layer('modal'), toast: layer('toast'),
  };

  const frameFns = new Set();
  const closers = new Set();
  const modals = []; // stack of {el, close}
  let clickTaken = false;
  const warned = new Set();
  const warnOnce = (k, e) => { if (!warned.has(k)) { warned.add(k); console.warn(`[ui] ${k}`, e); } };

  /** Shared kit handed to every UI part. */
  const U = {
    ctx, root, L, phase: 'boot',
    get now() { return time.uiNow; },
    get frameNo() { return time.frame; },
    wait: (s) => time.waitUI(s),
    tween: (o) => time.tween({ clock: 'ui', ...o }),
    /** per-tick callback on the ui clock: fn(uiDt). Returns an unsubscribe fn. */
    frame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    /** register a function run by closeAll({setup}) */
    onClose(fn) { closers.add(fn); return () => closers.delete(fn); },
    sfx(name, opts) { try { ctx.audio?.sfx?.(name, opts); } catch (e) { warnOnce('audio.sfx failed', e); } },
    blip(voice, ch) { try { ctx.audio?.blip?.(voice, ch); } catch (e) { warnOnce('audio.blip failed', e); } },
    unlock() { try { ctx.audio?.unlock?.(); } catch (e) { warnOnce('audio.unlock failed', e); } },
    /** A click/Space/Enter meant for "advance" (only while the game ignores the player). One consumer per tick. */
    takeClick() {
      if (clickTaken || input.enabled) return false;
      if (input.pressed('Mouse0') || input.pressed('Space') || input.pressed('Enter') || input.pressed('NumpadEnter')) { clickTaken = true; return true; }
      return false;
    },
    /** Notebook-style button. Text content is exactly `label` (QA finds buttons by their text). */
    button(label, cls = '', onClick, { sound = 'pop', extra = null } = {}) {
      const b = h(`button.qs-btn.qs-i${cls ? '.' + cls.split(' ').join('.') : ''}`, { type: 'button' }, label, extra);
      b.addEventListener('click', (e) => {
        U.unlock();
        if (sound) U.sfx(sound, { volume: 0.45 });
        b.blur();
        onClick?.(e);
      });
      return b;
    },
    /** Open a modal panel (settings / gallery / how-to / pause). Returns close(). */
    modal(panel, { onClose, cls = '' } = {}) {
      const scrim = h(`div.qs-modal.qs-i${cls ? '.' + cls : ''}`, {}, panel);
      scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim && entry.dismissable) entry.close(); });
      L.modal.appendChild(scrim);
      const entry = {
        el: scrim, dismissable: true,
        close() {
          const i = modals.indexOf(entry);
          if (i < 0) return;
          modals.splice(i, 1);
          scrim.classList.add('is-out');
          scrim.remove();
          onClose?.();
        },
      };
      modals.push(entry);
      return entry;
    },
    get topModal() { return modals[modals.length - 1] || null; },
    saveSettings() {
      store.set('qingshu.settings', ctx.settings);
      try { ctx.audio?.applySettings?.(ctx.settings); } catch (e) { warnOnce('audio.applySettings failed', e); }
      U.applyMotion();
    },
    applyMotion() { root.classList.toggle('qs-calm', !!ctx.settings.reducedMotion); },
    /** Speaker colour for name plates / bubbles. */
    blurFocus() { const a = document.activeElement; if (a && a !== document.body && root.contains(a)) a.blur(); },
  };
  U.applyMotion();

  // Parts (each returns its slice of the API).
  const hud = createHud(U);
  const talk = createTalk(U);
  const reveal = createReveal(U);
  const cards = createCards(U);
  const titleScr = createTitle(U, cards);
  const letter = createLetter(U);
  const pause = createPause(U, { cards, titleScr });

  function closeAll(opts = {}) {
    for (const fn of [...closers]) { try { fn(opts); } catch (e) { console.error('[ui] closeAll', e); } }
    while (modals.length) modals[modals.length - 1].close();
    if (pause.isOpen()) pause.close();
    U.blurFocus();
  }

  // ---- one loop for everything time-based in the UI ----
  engine.onUpdate(() => {
    clickTaken = false;
    for (const fn of [...frameFns]) {
      try { fn(time.uiDt); } catch (e) { console.error('[ui] frame', e); frameFns.delete(fn); }
    }
  }, engine.ORDER.UI);

  // ---- phases / rounds ----
  bus.on('phase', ({ to }) => {
    U.phase = to;
    hud.onPhase(to);
    if (to !== 'aim' && to !== 'flight' && pause.isOpen()) pause.close();
  });
  bus.on('round:setup', () => { closeAll({ setup: true }); hud.reset(); });

  // ---- Esc: pause during aim/flight, closes panels elsewhere ----
  // Real key presses are handled on the DOM event (ticks stop while paused, so ctx.input can't
  // resume us); synthetic presses (input.simulate) arrive only on the bus — `domEsc` de-duplicates.
  let domEsc = 0;
  const typing = (t) => /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) && t.type !== 'range' && t.type !== 'checkbox';
  const handleEsc = () => {
    const top = U.topModal;
    if (top && top.el.dataset.kind !== 'pause') { top.close(); return; }
    if (pause.isOpen()) { pause.close(); return; }
    if (U.phase === 'aim' || U.phase === 'flight') pause.open();
  };
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.repeat || typing(e.target)) return;
    domEsc++;
    handleEsc();
  });
  bus.on('input', ({ code, down }) => {
    if (code !== 'Escape' || !down) return;
    if (domEsc > 0) { domEsc--; return; }
    handleEsc();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (U.phase === 'aim' || U.phase === 'flight') && !engine.paused && !engine.manual) pause.open();
  });

  // First user gesture anywhere unlocks audio (AudioContext needs a gesture).
  const firstGesture = () => { U.unlock(); window.removeEventListener('pointerdown', firstGesture, true); window.removeEventListener('keydown', firstGesture, true); };
  window.addEventListener('pointerdown', firstGesture, true);
  window.addEventListener('keydown', firstGesture, true);

  // Warm up the bundled fonts (non-blocking; text falls back to system fonts until they arrive).
  try {
    document.fonts?.load?.('32px "QS KuaiLe"', '情书抛物线我是男生女生开始写好了再来一局改写回到标题目标的课桌').catch(() => {});
    document.fonts?.load?.('32px "QS Hand"', '今天的夕阳很好看和你一样放学后能一起走吗').catch(() => {});
  } catch { /* old browsers */ }

  ctx.ui = {
    title: titleScr.title,
    letterEditor: letter.editor,
    crumple: letter.crumple,
    hud: hud.api,
    say: talk.say,
    bubble: talk.bubble,
    caption: talk.caption,
    letterReveal: reveal.letterReveal,
    endingCard: cards.endingCard,
    gallery: cards.gallery,
    toast: talk.toast,
    closeAll: () => closeAll({}),
    debugChoose: cards.debugChoose,
    // ---- additions (documented in docs/modules/ui.md) ----
    closeReveal: reveal.close,
    settings: () => titleScr.openSettings(),
    pause: { open: () => pause.open(), close: () => pause.close(), get isOpen() { return pause.isOpen(); } },
    get state() {
      return {
        phase: U.phase, hud: hud.visible, paused: pause.isOpen(), modals: modals.map((m) => m.el.dataset.kind || ''),
        say: talk.current(), screen: [...L.screen.children].map((c) => c.dataset.kind || c.className),
      };
    },
  };
}
