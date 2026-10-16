// letterReveal: the player's own words on an unfolded, wrinkled sheet.
//   read       – unfold and hold
//   readAloud  – sentence-by-sentence highlighter sweep (timed estimate, runs alongside ctx.audio.speak)
//   grading    – red pen: circles "typos", strikes a phrase, margin notes, then a big score stamp
//   reply      – a small pink note with the reply
import { h, hash, prng, isPunct } from './dom.js';
import { HEART_D } from './icons.js';

/** Split into sentences for read-aloud; very long single sentences are split on commas too. */
export function splitSentences(text) {
  const s = String(text ?? '');
  let parts = s.match(/[^。！？!?…\n]+[。！？!?…]*[」”"']?|\n/g)?.filter((p) => p.trim()) || [s];
  if (parts.length === 1 && [...s].length > 16) parts = s.match(/[^，,、；;]+[，,、；;]?/g)?.filter((p) => p.trim()) || parts;
  return parts;
}

const creases = (seed) => {
  const r = prng(seed);
  let d = '';
  for (let i = 0; i < 9; i++) {
    const x1 = r() * 100, y1 = r() * 100, x2 = x1 + (r() - 0.5) * 70, y2 = y1 + (r() - 0.5) * 70;
    d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${((x1 + x2) / 2 + (r() - 0.5) * 8).toFixed(1)} ${((y1 + y2) / 2 + (r() - 0.5) * 8).toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return `<svg class="qs-creases" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
};

export function createReveal(U) {
  const { ctx } = U;
  let cur = null;

  function close() { cur?.end(true); }

  function letterReveal(text, opts = {}) {
    opts = opts || {};
    const mode = ['read', 'readAloud', 'grading', 'reply'].includes(opts.mode) ? opts.mode : 'read';
    cur?.end(true);
    const str = String(text ?? '');
    const chars = [...str];
    const len = chars.length;
    const seed = hash(str + mode);

    const body = h('div.qs-reveal-text');
    const paper = h(`div.qs-reveal-paper.qs-paper${mode === 'reply' ? '.qs-note' : ''}`, { html: creases(seed) });
    paper.appendChild(body);
    const el = h(`div.qs-reveal.qs-reveal-${mode}`, {}, paper);
    U.L.reveal.appendChild(el);
    U.sfx('paperUnfold', { volume: 0.7 });

    // ---- content
    let sentences = null, sentDur = [], charSpans = [];
    if (mode === 'readAloud') {
      const rate = opts.rate ?? 1;
      const cps = 4.3 * rate;
      sentences = splitSentences(str).map((p) => {
        if (p === '\n') { body.appendChild(document.createElement('br')); return null; }
        const s = h('span.qs-sent', {}, p);
        body.appendChild(s);
        const n = [...p].filter((c) => !isPunct(c)).length;
        const d = 0.25 + n / cps + ([...p].length - n) * 0.08;
        s.style.setProperty('--d', d.toFixed(2) + 's');
        sentDur.push(d);
        return s;
      }).filter(Boolean);
    } else {
      for (const c of chars) {
        if (c === '\n') { body.appendChild(document.createElement('br')); charSpans.push(null); continue; }
        const s = h('span', {}, c);
        body.appendChild(s);
        charSpans.push(s);
      }
    }
    if (mode === 'reply') paper.appendChild(h('div.qs-note-heart', { html: `<svg viewBox="0 0 64 64"><path d="${HEART_D}"/></svg>` }));
    if (mode === 'read' || mode === 'readAloud') paper.appendChild(h('div.qs-reveal-sign', {}, '—— 后排靠窗的某人'));

    // ---- durations
    let hold;
    if (mode === 'readAloud') hold = sentDur.reduce((a, b) => a + b, 0) + 1.2;
    else if (mode === 'grading') hold = 6.2;
    else if (mode === 'reply') hold = Math.min(6, Math.max(3, 2.2 + 0.12 * len));
    else hold = Math.min(9, Math.max(3.5, 2 + 0.11 * len));
    if (opts.dur != null) hold = opts.dur;

    // ---- grading annotations (timed below)
    const marks = [];
    if (mode === 'grading') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'qs-redpen');
      paper.appendChild(svg);
      const stamp = h('div.qs-score', {}, h('b', {}, String(opts.score ?? 59)), h('small', {}, '分'));
      paper.appendChild(stamp);
      const notes = [];
      const r = prng(seed);
      const cjk = charSpans.map((s, i) => (s && /[一-鿿]/.test(s.textContent) ? i : -1)).filter((i) => i >= 0);
      const pick = (f) => cjk[Math.min(cjk.length - 1, Math.floor(cjk.length * f))];
      const circ = cjk.length >= 3 ? [...new Set([pick(0.12 + r() * 0.1), pick(0.45 + r() * 0.1), pick(0.78 + r() * 0.1)])] : cjk.slice(0, 1);
      // strike: a 4–6 char run of CJK not containing a circled char
      let strike = null;
      for (let tries = 0; tries < 20 && !strike && cjk.length > 8; tries++) {
        const a = cjk[Math.floor(r() * (cjk.length - 6))];
        const run = [];
        for (let i = a; i < charSpans.length && run.length < 4 + Math.floor(r() * 3); i++) { if (!charSpans[i] || isPunct(charSpans[i].textContent)) break; run.push(i); }
        if (run.length >= 3 && !run.some((i) => circ.includes(i))) strike = run;
      }
      const layout = () => {
        // layout coordinates (offset*), immune to the paper's intro transform
        const box = (i) => { const sp = charSpans[i]; return { x: body.offsetLeft + sp.offsetLeft, y: body.offsetTop + sp.offsetTop, w: sp.offsetWidth, h: sp.offsetHeight }; };
        svg.setAttribute('viewBox', `0 0 ${paper.offsetWidth} ${paper.offsetHeight}`);
        const out = [];
        circ.forEach((i, k) => {
          const b = box(i);
          const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w * 0.85, ry = b.h * 0.62;
          const p = document.createElementNS(svg.namespaceURI, 'path');
          p.setAttribute('d', `M${cx + rx} ${cy}C${cx + rx} ${cy - ry * 1.3} ${cx - rx * 1.2} ${cy - ry * 1.2} ${cx - rx} ${cy}S${cx + rx * 0.9} ${cy + ry * 1.4} ${cx + rx * 1.05} ${cy - ry * 0.3}`);
          p.setAttribute('pathLength', '100');
          svg.appendChild(p);
          out.push({ t: 0.7 + k * 0.4, el: p, sfx: 'pencil' });
          if (k === 0) notes.push({ t: 2.3, x: cx + rx + 6, y: cy - ry - 18, text: '错别字！' });
        });
        if (strike) {
          const a = box(strike[0]), b = box(strike[strike.length - 1]);
          const y = a.y + a.h * 0.55;
          const p = document.createElementNS(svg.namespaceURI, 'path');
          p.setAttribute('d', `M${a.x - 3} ${y + 2}L${b.x + b.w + 3} ${y - 3}M${a.x - 2} ${y + 6}L${b.x + b.w + 4} ${y + 1}`);
          p.setAttribute('pathLength', '100');
          svg.appendChild(p);
          out.push({ t: 1.95, el: p, sfx: 'pencil' });
          notes.push({ t: 2.6, x: Math.max(8, a.x), y: a.y + a.h + 2, text: '比喻不当' });
        }
        notes.push({ t: 3.0, x: paper.offsetWidth - 92, y: 14, text: '？？？' });
        for (const n of notes) {
          const ne = h('div.qs-pen-note', { style: { left: n.x + 'px', top: n.y + 'px' } }, n.text);
          paper.appendChild(ne);
          out.push({ t: n.t, el: ne });
        }
        out.push({ t: 3.7, el: stamp, sfx: 'thudDesk' });
        return out;
      };
      marks.push(...layout());
    }

    return new Promise((resolve) => {
      const t0 = U.now;
      let sent = -1;
      const self = {
        born: U.frameNo,
        end(now = false) {
          if (self.ended) return;
          self.ended = true;
          off();
          if (cur === self) cur = null;
          if (now || opts.keep) { if (now) el.remove(); resolve(); return; }
          el.classList.add('is-out');
          U.wait(0.32).then(() => { el.remove(); resolve(); });
        },
      };
      cur = self;
      if (opts.keep) { // stays on screen after resolving until closeReveal()/closeAll()/next reveal
        self.end = (now = false) => {
          if (self.closed) return; self.closed = true; off(); if (cur === self) cur = null; resolve();
          if (now) el.remove(); else { el.classList.add('is-out'); U.wait(0.32).then(() => el.remove()); }
        };
      }
      let resolvedKeep = false;
      const off = U.frame(() => {
        const t = U.now - t0;
        if (sentences) {
          let acc = 0, idx = sentences.length;
          for (let i = 0; i < sentDur.length; i++) { acc += sentDur[i]; if (t < acc + 0.35) { idx = i; break; } }
          if (t < 0.35) idx = -1;
          if (idx !== sent) {
            sent = idx;
            sentences.forEach((s, i) => { s.classList.toggle('on', i === idx); s.classList.toggle('done', i < idx); });
          }
        }
        for (const m of marks) if (!m.done && t >= m.t) { m.done = true; m.el.classList.add('on'); if (m.sfx) U.sfx(m.sfx, { volume: 0.6 }); }
        const skip = !resolvedKeep && t > 0.8 && U.takeClick();
        if (t >= hold || skip) {
          if (skip) for (const m of marks) m.el.classList.add('on');
          if (opts.keep) { if (!resolvedKeep) { resolvedKeep = true; resolve(); } return; }
          self.end();
        }
      });
    });
  }

  U.onClose(({ setup } = {}) => { if (cur && !(setup && cur.born === U.frameNo)) cur.end(true); });
  return { letterReveal, close };
}
