// Dialogue box (typewriter + blips + auto-advance), world-anchored speech bubbles, manga captions, toasts.
import { h, esc, hash, isPunct, pauseAfter, MARKERS } from './dom.js';

const TYPE_SEC = 0.045;     // per character
const NARRATORS = new Set(['', '旁白', 'narrator']);

export function createTalk(U) {
  const { ctx } = U;
  const T = ctx.THREE;

  // ---------------------------------------------------------------- helpers
  function charOf(id) { return id ? ctx.cast?.get?.(id) || (id === 'teacher' ? ctx.cast?.teacher : null) : null; }
  function colorFor(speaker, charId) {
    const ch = charOf(charId);
    if (ch?.spec?.color) return ch.spec.color;
    if (charId === 'teacher' || ch?.spec?.role === 'teacher' || /老师/.test(speaker || '')) return '#2f6b4f';
    if (speaker === '我') return '#1d9aa8';
    return MARKERS[hash(charId || speaker || '?') % MARKERS.length];
  }
  function voiceFor(opts, speaker) {
    if (opts.voice) return opts.voice;
    const ch = charOf(opts.charId);
    if (ch?.spec?.voice) return ch.spec.voice;
    if (/老师/.test(speaker || '')) return { pitch: 0.65 };
    return { pitch: 1 };
  }
  /** Build char spans so layout never reflows while typing (unrevealed chars are just transparent). */
  function typeSpans(container, text) {
    container.textContent = '';
    const chars = [...String(text ?? '')];
    const spans = chars.map((c) => {
      if (c === '\n') { container.appendChild(document.createElement('br')); return null; }
      const s = h('span.qs-ch', {}, c);
      container.appendChild(s);
      return s;
    });
    return { chars, spans };
  }
  /** Typewriter state machine driven by the ui clock. Returns {step(dt) → done, finish()} */
  function typewriter(container, text, { speed = TYPE_SEC, voice = null, blipEvery = 1 } = {}) {
    const { chars, spans } = typeSpans(container, text);
    let i = 0, t = 0, n = 0;
    const tw = {
      done: chars.length === 0,
      duration: chars.reduce((a, c) => a + speed + pauseAfter(c), 0),
      step(dt) {
        if (tw.done) return true;
        t += dt;
        while (i < chars.length && t >= 0) {
          const c = chars[i];
          spans[i]?.classList.add('on');
          if (voice && !isPunct(c) && n++ % blipEvery === 0) U.blip(voice, c);
          t -= speed + pauseAfter(c);
          i++;
        }
        if (i >= chars.length) tw.done = true;
        return tw.done;
      },
      finish() { for (const s of spans) s?.classList.add('on'); i = chars.length; tw.done = true; },
    };
    return tw;
  }

  // ---------------------------------------------------------------- say()
  const box = h('div.qs-say', { hidden: true }, h('div.qs-say-name'), h('div.qs-say-text'), h('div.qs-say-next', {}, '▼'));
  const boxName = box.querySelector('.qs-say-name');
  const boxText = box.querySelector('.qs-say-text');
  U.L.talk.appendChild(box);
  let line = null;      // active line
  let hideAt = -1;

  function endLine(l) {
    if (!l || l.ended) return;
    l.ended = true;
    if (line === l) { line = null; hideAt = U.now + 0.12; box.classList.remove('is-done'); }
    l.resolve();
  }

  function say(speaker, text, opts = {}) {
    opts = opts || {};
    if (line) endLine(line);
    return new Promise((resolve) => {
      const voice = voiceFor(opts, speaker);
      const narr = NARRATORS.has(speaker ?? '');
      box.hidden = false;
      box.className = 'qs-say is-in';
      box.dataset.mood = opts.mood || '';
      box.classList.toggle('is-narrator', narr);
      boxName.textContent = narr ? '' : String(speaker);
      boxName.hidden = narr;
      box.style.setProperty('--c', colorFor(speaker, opts.charId));
      const tw = typewriter(boxText, text, { voice, speed: opts.mood === 'whisper' ? TYPE_SEC * 1.3 : TYPE_SEC });
      const len = [...String(text ?? '')].length;
      const start = U.now;
      const autoAt = opts.dur != null ? start + opts.dur : start + Math.max(0.9 + 0.06 * len, tw.duration + 0.6);
      line = { speaker, text, start, autoAt, tw, resolve, ended: false, born: U.frameNo };
      hideAt = -1;
      try { ctx.bus.emit('say', { speaker, text, voice, charId: opts.charId ?? null }); } catch { /* bus handlers */ }
    });
  }

  U.frame((dt) => {
    if (line) {
      const l = line;
      const clicked = U.now - l.start > 0.08 && U.takeClick();
      if (!l.tw.done) {
        if (clicked) l.tw.finish(); else l.tw.step(dt);
        if (l.tw.done) box.classList.add('is-done');
      } else if (clicked || U.now >= l.autoAt) {
        endLine(l);
      }
    } else if (hideAt > 0 && U.now >= hideAt) {
      box.hidden = true; hideAt = -1;
    }
  });

  // ---------------------------------------------------------------- bubble()
  const bubbles = new Set();
  const _v = new T.Vector3();

  function anchorOf(target) {
    if (target && target.isVector3) return (out) => out.copy(target);
    if (target && target.isObject3D) return (out) => target.getWorldPosition(out).add(new T.Vector3(0, 0.25, 0));
    if (target && typeof target.headWorld === 'function') return (out) => { target.headWorld(out); out.y += 0.32; return out; };
    if (typeof target === 'string') {
      return (out) => {
        const ch = charOf(target);
        if (!ch) return null;
        if (ch.root && ch.root.visible === false) return null;
        ch.headWorld(out); out.y += 0.32; return out;
      };
    }
    return () => null;
  }

  function bubble(target, text, opts = {}) {
    opts = opts || {};
    const key = typeof target === 'string' ? target : null;
    if (key) for (const b of bubbles) if (b.key === key) b.end();
    return new Promise((resolve) => {
      const style = opts.style || (opts.mood === 'shout' ? 'shout' : opts.mood === 'think' ? 'think' : 'speech');
      const txt = h('div.qs-bubble-text');
      const tail = h('div.qs-bubble-tail', { html: '<svg viewBox="0 0 24 18" aria-hidden="true"><path class="f" d="M0 0H24L7 17Z"/><path class="s" d="M1 0L7 17L23 0"/></svg>' });
      const el = h(`div.qs-bubble.qs-bubble-${style}`, {}, txt, tail);
      U.L.world.appendChild(el);
      const len = [...String(text ?? '')].length;
      const ch = typeof target === 'string' ? charOf(target) : null;
      const voice = opts.voice || ch?.spec?.voice || null;
      const tw = typewriter(txt, text, { speed: 0.03, voice: opts.silent ? null : voice, blipEvery: 2 });
      const dur = opts.dur ?? Math.max(1.4, 1.2 + 0.09 * len + tw.duration * 0.5);
      const b = {
        key, el, born: U.frameNo, until: U.now + dur, anchor: anchorOf(target), w: 0, hgt: 0,
        end() {
          if (b.ended) return;
          b.ended = true; bubbles.delete(b); el.classList.add('is-out');
          U.wait(0.18).then(() => el.remove());
          resolve();
        },
      };
      bubbles.add(b);
      b.tw = tw;
    });
  }

  function placeBubble(b) {
    const cam = ctx.cam?.camera || ctx.engine.camera;
    const p = b.anchor(_v);
    if (!p) { b.el.style.visibility = 'hidden'; return; }
    p.project(cam);
    const W = window.innerWidth, H = window.innerHeight;
    let behind = p.z > 1;
    let x = (p.x + 1) / 2 * W, y = (1 - p.y) / 2 * H;
    if (behind) { x = W - x; y = H; }
    if (!b.w) { b.w = b.el.offsetWidth; b.hgt = b.el.offsetHeight; }
    const m = 10;
    const bx = Math.min(W - b.w - m, Math.max(m, x - b.w / 2));
    const by = Math.min(H - b.hgt - m - 14, Math.max(m, y - b.hgt - 14));
    const edge = bx !== x - b.w / 2 || by !== y - b.hgt - 14 || behind;
    b.el.style.visibility = '';
    b.el.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;
    b.el.classList.toggle('is-edge', edge);
    const tx = Math.min(b.w - 18, Math.max(18, x - bx));
    b.el.style.setProperty('--tail', `${tx.toFixed(1)}px`);
  }

  U.frame((dt) => {
    for (const b of [...bubbles]) {
      if (!b.tw.done) { b.tw.step(dt); if (b.tw.done) b.w = 0; } // re-measure once fully typed
      if (U.now >= b.until) { b.end(); continue; }
      placeBubble(b);
    }
  });

  // ---------------------------------------------------------------- caption()
  const captions = new Map(); // style → cap
  const CAP_DUR = { impact: 1.9, chapter: 2.8, whisper: 2.4 };
  function caption(text, opts = {}) {
    opts = opts || {};
    const style = CAP_DUR[opts.style] ? opts.style : 'impact';
    captions.get(style)?.end(true);
    return new Promise((resolve) => {
      const inner = style === 'impact'
        ? h('div.qs-cap-inner', {}, h('div.qs-cap-lines'), h('div.qs-cap-text', { html: esc(text).replace(/\n/g, '<br>') }))
        : style === 'chapter'
          ? h('div.qs-cap-inner', {}, h('i.qs-cap-rule'), h('div.qs-cap-text', { html: esc(text).replace(/\n/g, '<br>') }), h('i.qs-cap-rule'))
          : h('div.qs-cap-inner', {}, h('div.qs-cap-text', { html: esc(text).replace(/\n/g, '<br>') }));
      const el = h(`div.qs-caption.qs-cap-${style}`, {}, inner);
      if (style === 'impact') {
        const n = [...String(text)].filter((c) => !/\s/.test(c)).length;
        el.style.setProperty('--fs', n <= 2 ? '1' : n <= 4 ? '.82' : n <= 7 ? '.6' : '.42');
        if (opts.color) el.style.setProperty('--cap', opts.color);
      }
      U.L.caption.appendChild(el);
      const cap = {
        born: U.frameNo,
        end(now = false) {
          if (cap.ended) return;
          cap.ended = true;
          if (captions.get(style) === cap) captions.delete(style);
          el.classList.add('is-out');
          if (now) { el.remove(); resolve(); return; }
          U.wait(0.3).then(() => { el.remove(); resolve(); });
        },
      };
      captions.set(style, cap);
      U.wait(opts.dur ?? CAP_DUR[style]).then(() => cap.end());
    });
  }

  // ---------------------------------------------------------------- toast()
  const toasts = [];
  function toast(text, opts = {}) {
    const el = h('div.qs-toast.qs-sticky', {}, h('span.qs-tape'), String(text ?? ''));
    U.L.toast.appendChild(el);
    toasts.push(el);
    while (toasts.length > 3) toasts.shift().remove();
    U.wait(opts?.dur ?? 2.2).then(() => {
      el.classList.add('is-out');
      return U.wait(0.25);
    }).then(() => { el.remove(); const i = toasts.indexOf(el); if (i >= 0) toasts.splice(i, 1); });
  }

  // ---------------------------------------------------------------- reset
  U.onClose(({ setup } = {}) => {
    const fresh = (x) => setup && x.born === U.frameNo; // created during this very tick (e.g. by another round:setup handler)
    if (line && !fresh(line)) { endLine(line); box.hidden = true; hideAt = -1; }
    for (const b of [...bubbles]) if (!fresh(b)) { b.end(); b.el.remove(); }
    for (const c of [...captions.values()]) if (!fresh(c)) c.end(true);
    for (const t of toasts.splice(0)) t.remove();
  });

  return {
    say, bubble, caption, toast,
    current: () => (line ? { speaker: line.speaker, text: line.text, typed: line.tw.done } : null),
  };
}
