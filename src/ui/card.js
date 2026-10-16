// Ending card (polaroid / certificate) and the ending gallery.
import { h, esc } from './dom.js';
import { ENDING_ICONS, ICON_LETTER, ICON_LOCK } from './icons.js';

const RARITY = {
  common: { label: '普通结局', color: '#5b8fd6' },
  rare: { label: '稀有结局', color: '#e0a526' },
  secret: { label: '隐藏结局', color: '#8a5cd0' },
};
const iconFor = (e) => ENDING_ICONS[e?.id] || (e?.icon && !/[\u{1F000}-\u{1FFFF}☀-➿]/u.test(e.icon) ? `<span class="qs-icon-text">${esc(e.icon)}</span>` : ICON_LETTER);
/** "隐藏 · 三分球" → {tag:'隐藏', main:'三分球'} */
const splitTitle = (t) => { const m = String(t ?? '').split(/\s*[·・]\s*/); return m.length > 1 ? { tag: m[0], main: m.slice(1).join(' · ') } : { tag: '', main: String(t ?? '') }; };

export function createCards(U) {
  const { ctx } = U;
  let chooser = null;
  let cardEl = null;

  function confetti(n) {
    const box = h('div.qs-confetti');
    const cols = ['#ff7aa8', '#ffd36b', '#7fd1a8', '#7fb8e8', '#c59bf0', '#ff9e6b'];
    for (let i = 0; i < n; i++) {
      const p = h('i');
      const heart = Math.random() < 0.35;
      p.className = heart ? 'h' : '';
      p.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;--c:${cols[i % cols.length]};--dx:${((Math.random() - 0.5) * 160).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(Math.random() * 0.9).toFixed(2)}s;animation-duration:${(2.2 + Math.random() * 1.6).toFixed(2)}s`;
      box.appendChild(p);
    }
    return box;
  }

  function endingCard(ending, info = {}) {
    ending = ending || { id: '?', title: '结局', rarity: 'common' };
    closeCard();
    const unlocked = info.unlocked ?? ctx.story?.gallery?.unlocked?.()?.length ?? 0;
    const total = info.total ?? ctx.story?.ENDINGS?.length ?? 13;
    const rar = RARITY[ending.rarity] || RARITY.common;
    const accent = ending.color || rar.color;
    const { tag, main } = splitTitle(ending.title);
    const dots = h('div.qs-dots');
    for (let i = 0; i < total; i++) dots.appendChild(h(`i${i < unlocked ? '.on' : ''}`));

    return new Promise((resolve) => {
      const choose = (c) => { if (!chooser) return; chooser = null; card.classList.add('is-chosen'); resolve(c); };
      chooser = choose;
      const btns = h('div.qs-card-btns', {},
        U.button('再来一局', 'qs-primary', () => choose('retry')),
        U.button('改写情书', '', () => choose('rewrite')),
        U.button('回到标题', '', () => choose('title')));
      const card = h('div.qs-card.qs-i', { style: { '--accent': accent }, 'data-rarity': ending.rarity || 'common' },
        h('span.qs-tape.qs-tape-l'), h('span.qs-tape.qs-tape-r'),
        h('div.qs-card-photo', { html: iconFor(ending) }, h('div.qs-card-ribbon', {}, rar.label)),
        h('div.qs-card-body', {},
          tag ? h('div.qs-card-tag', {}, tag) : null,
          h('h2.qs-card-title', {}, main),
          ending.subtitle ? h('p.qs-card-sub', {}, ending.subtitle) : null,
          h('div.qs-card-progress', {}, h('span', {}, '结局收集 '), h('b', {}, String(unlocked)), h('span', {}, ` / ${total}`), dots)),
        info.isNew ? h('div.qs-new-stamp', {}, 'NEW!') : null);
      cardEl = h('div.qs-screen.qs-card-screen', { 'data-kind': 'card' },
        h('div.qs-scrim'),
        info.isNew || ending.rarity !== 'common' ? confetti(info.isNew ? 46 : 24) : null,
        card, btns);
      U.L.screen.appendChild(cardEl);
      U.sfx('ding', { volume: 0.7 });
      if (info.isNew) U.wait(0.75).then(() => { if (cardEl?.contains(card)) { U.sfx('thudDesk', { volume: 0.6 }); U.sfx('sparkle', { volume: 0.6 }); } });
    });
  }

  function closeCard() { cardEl?.remove(); cardEl = null; chooser = null; }
  function debugChoose(c) { chooser?.(c); }

  // ---------------------------------------------------------------- gallery
  let galleryEntry = null;
  function gallery() {
    if (galleryEntry) return galleryEntry.promise;
    const list = ctx.story?.ENDINGS || [];
    const got = new Set(ctx.story?.gallery?.unlocked?.() || []);
    const n = list.filter((e) => got.has(e.id)).length;
    const grid = h('div.qs-gal-grid');
    for (const e of list) {
      const on = got.has(e.id);
      const rar = RARITY[e.rarity] || RARITY.common;
      const { tag, main } = splitTitle(e.title);
      grid.appendChild(h(`div.qs-gal-item${on ? '.is-on' : '.is-locked'}`, { style: { '--accent': e.color || rar.color }, 'data-id': e.id },
        h('span.qs-gal-tape'),
        h('div.qs-gal-icon', { html: on ? iconFor(e) : ICON_LOCK }),
        on ? h('div.qs-gal-tag', {}, tag || rar.label) : h('div.qs-gal-tag', {}, rar.label),
        h('div.qs-gal-title', {}, on ? main : '？？？'),
        h('div.qs-gal-sub', {}, on ? (e.subtitle || '') : (e.hint || '……'))));
    }
    const panel = h('div.qs-gallery.qs-paper.qs-i', {},
      h('div.qs-gal-head', {},
        h('h2', {}, '结局图鉴'),
        h('div.qs-gal-count', {}, h('b', {}, String(n)), ` / ${list.length}`),
        h('div.qs-gal-bar', {}, h('i', { style: { width: `${list.length ? (n / list.length) * 100 : 0}%` } }))),
      grid,
      h('div.qs-panel-foot', {}, U.button('返回', '', () => galleryEntry?.close(), { sound: 'pageFlip' })));
    let res;
    const promise = new Promise((r) => { res = r; });
    const entry = U.modal(panel, { onClose: () => { galleryEntry = null; res(); } });
    entry.el.dataset.kind = 'gallery';
    entry.promise = promise;
    galleryEntry = entry;
    U.sfx('pageFlip', { volume: 0.6 });
    return promise;
  }

  U.onClose(() => { closeCard(); });
  return { endingCard, gallery, debugChoose, closeCard };
}
