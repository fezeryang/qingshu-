// Pause menu (Esc during aim / flight): stops the engine (ctx.engine.paused) — everything here is
// plain DOM because no ticks run while paused.
import { h } from './dom.js';

export function createPause(U, { cards, titleScr }) {
  const { ctx } = U;
  let entry = null;

  function open() {
    if (entry) return;
    if (ctx.engine.paused) return; // someone else paused the engine; don't fight over it
    ctx.engine.paused = true;
    const panel = h('div.qs-panel.qs-pause.qs-sticky.qs-i', {},
      h('span.qs-tape'),
      h('h2', {}, '暂停中'),
      h('p.qs-pause-sub', {}, '（老师应该没发现……吧？）'),
      h('div.qs-pause-btns', {},
        U.button('继续', 'qs-primary', () => close()),
        U.button('设置', '', () => titleScr.openSettings()),
        U.button('结局图鉴', '', () => cards.gallery(), { sound: 'pageFlip' })),
      h('div.qs-pause-hint', {}, '也可以再按一次 Esc'));
    entry = U.modal(panel, { onClose: () => { entry = null; ctx.engine.paused = false; } });
    entry.el.dataset.kind = 'pause';
    entry.dismissable = false;
    U.sfx('pop', { volume: 0.5 });
  }

  function close() {
    if (!entry) return;
    // close panels opened from the pause menu too
    while (U.topModal && U.topModal !== entry) U.topModal.close();
    entry.close();
  }

  return { open, close, isOpen: () => !!entry };
}
