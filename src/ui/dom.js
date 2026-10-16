// Tiny DOM helpers for the UI layer (owner: ui-designer). No framework.

/** Escape text for innerHTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * h('div.qs-foo.qs-bar', {style, attrs..., onclick}, ...children) → HTMLElement
 * children: strings (text), nodes, arrays, null/false (skipped). `html:` sets innerHTML.
 */
export function h(sel, props = {}, ...children) {
  const [tag, ...classes] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

/** Parse an SVG/HTML string into a single element. */
export function frag(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Linear blend of two #rrggbb colours → css rgb(). */
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * clamp01(t));
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

/** Stable small hash of a string (for colours, deterministic doodles). */
export function hash(s) {
  let x = 2166136261;
  for (const c of String(s)) { x ^= c.codePointAt(0); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

/** Seeded pseudo-random generator for cosmetic, repeatable doodles (UI only). */
export function prng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Is this character punctuation / whitespace (no blip, typewriter pause)? */
export const isPunct = (c) => /[\s，。！？、；：,.!?;:…—\-~～「」『』“”"'（）()《》·]/.test(c);
export const pauseAfter = (c) => (/[。！？!?…]/.test(c) ? 0.2 : /[，、；：,;:—~～]/.test(c) ? 0.09 : 0);

/** Character colour palette for name plates (marker colours). */
export const MARKERS = ['#e8505b', '#f08a24', '#2f9e6e', '#2e7dd1', '#8a5cd0', '#d6457f', '#1d9aa8', '#b8862b', '#5a6fd6', '#c2482f'];
