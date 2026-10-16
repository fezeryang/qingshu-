// Chalk blackboard (owner: env-artist). Contract: classroom.blackboard = { write, append, clear, text }.
//
// The board is 2048×560 logical pixels split across two 1024×560 canvas textures (≤ 1024² each).
// Glyphs are drawn one at a time onto a scratch canvas (with jitter + chalk grain) and stamped onto the
// halves, so append() can reveal characters one by one without redrawing the whole board.
//
// Inline markup (not drawn):  [[white]] [[yellow]] [[red]] [[pink]] [[blue]] [[green]]  — chalk colour
//                             [[big]] [[small]] [[normal]]                                 — glyph size
import * as THREE from 'three';
import { BLACKBOARD } from '../core/layout.js';
import { makeCanvas, canvasTexture, rngFor, FONT_KAI, toonGradient } from './kit.js';
import { grainify } from './textures.js';

const LW = 2048, LH = 560, HALF = 1024;
const MARGIN_L = 56, MARGIN_T = 46, WRITE_R = 1800;
const BASE = 60, LINE = 74;
const COLORS = {
  white: [244, 244, 234], yellow: [250, 226, 120], red: [246, 112, 96], pink: [248, 168, 190], blue: [150, 210, 245], green: [170, 235, 160],
};
const SIZES = { big: 1.7, small: 0.75, normal: 1 };
const TAG = /\[\[(\w+)\]\]/g;

function hash(i) { let h = (i + 1) * 2654435761; h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

export function createBlackboard(ctx, group) {
  const halves = [0, 1].map(() => makeCanvas(HALF, LH));
  const gs = halves.map((c) => c.getContext('2d'));
  const texs = halves.map((c) => { const t = canvasTexture(c, { anisotropy: 8 }); return t; });
  const scratch = makeCanvas(256, 256);
  const sg = scratch.getContext('2d');
  const measure = makeCanvas(8, 8).getContext('2d');

  // meshes: two planes side by side on the writable face
  const bb = BLACKBOARD;
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(bb.w / 2, bb.h), new THREE.MeshToonMaterial({ map: texs[i], gradientMap: toonGradient() }));
    m.position.set(bb.x - bb.w / 4 + i * bb.w / 2, bb.y, bb.z + 0.002);
    m.receiveShadow = true;
    m.name = `blackboard${i}`;
    group.add(m);
  }

  // persistent background (date + duty roster strip, old erased smudges)
  const bg = makeCanvas(LW, LH);
  {
    const g = bg.getContext('2d');
    const r = rngFor('board-bg');
    g.fillStyle = '#2f5a46'; g.fillRect(0, 0, LW, LH);
    const vg = g.createRadialGradient(LW / 2, LH / 2, 100, LW / 2, LH / 2, LW * 0.6);
    vg.addColorStop(0, 'rgba(70,120,95,0.25)'); vg.addColorStop(1, 'rgba(10,30,20,0.3)');
    g.fillStyle = vg; g.fillRect(0, 0, LW, LH);
    for (let i = 0; i < 26; i++) { // eraser swirls
      g.strokeStyle = `rgba(230,240,230,${r.range(0.025, 0.06).toFixed(3)})`;
      g.lineWidth = r.range(30, 70);
      g.beginPath();
      const x = r.range(0, LW), y = r.range(0, LH);
      g.arc(x, y, r.range(40, 140), r.range(0, 3), r.range(3, 6));
      g.stroke();
    }
    g.font = `40px ${FONT_KAI}`; g.fillStyle = 'rgba(240,240,230,0.05)';
    for (let i = 0; i < 6; i++) g.fillText(['y=kx+b', '∠ABC', '已知', 'x²', '解：', '∴'][i], r.range(80, 1700), r.range(80, 520));
    // right strip
    g.strokeStyle = 'rgba(240,240,230,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(1850, 30); g.lineTo(1852, LH - 30); g.stroke();
    const lay = makeCanvas(LW, LH), L = lay.getContext('2d');
    L.fillStyle = 'rgba(244,244,234,0.9)'; L.textAlign = 'center';
    L.font = `34px ${FONT_KAI}`;
    ['10月16日', '星期五'].forEach((s, i) => L.fillText(s, 1950, 80 + i * 46));
    L.fillStyle = 'rgba(250,226,120,0.9)'; L.font = `36px ${FONT_KAI}`; L.fillText('值日生', 1950, 220);
    L.fillStyle = 'rgba(244,244,234,0.85)'; L.font = `32px ${FONT_KAI}`;
    ['李一鸣', '周  雪'].forEach((s, i) => L.fillText(s, 1950, 270 + i * 44));
    L.fillStyle = 'rgba(248,168,190,0.9)'; L.font = `30px ${FONT_KAI}`; L.fillText('距期中考试', 1950, 420);
    L.font = `bold 46px ${FONT_KAI}`; L.fillText('23 天', 1950, 474);
    grainify(L, 1850, 0, 200, LH, 0.9);
    g.drawImage(lay, 0, 0);
  }

  // ------------------------------------------------------------------- text model
  let raw = '';
  let tokens = [];      // {ch, color, size}
  let layout = [];      // per token: {x, y, size, line} (null for newline)
  let scroll = 0;       // number of lines dropped from the top
  let drawn = 0;        // tokens drawn on the canvases
  let shown = 0;        // tokens that should be visible (float while typing)
  let target = 0;       // tokens to reveal
  const dirty = [false, false];

  function parse(str, state) {
    const out = [];
    let last = 0;
    const push = (s) => { for (const ch of s) out.push({ ch, color: state.color, size: state.size }); };
    str.replace(TAG, (m, name, idx) => {
      push(str.slice(last, idx));
      last = idx + m.length;
      if (COLORS[name]) state.color = name;
      else if (SIZES[name]) state.size = name;
      else push(m); // unknown tag: keep it literally
      return m;
    });
    push(str.slice(last));
    return out;
  }
  let parseState = { color: 'white', size: 'normal' };

  function relayout() {
    layout = [];
    let x = MARGIN_L, line = 0, lineMax = BASE;
    const lineSizes = [];
    // first pass: positions per line
    for (const t of tokens) {
      if (t.ch === '\n') { layout.push(null); lineSizes[line] = lineMax; line++; x = MARGIN_L; lineMax = BASE; continue; }
      const px = BASE * SIZES[t.size];
      measure.font = `${px}px ${FONT_KAI}`;
      const w = t.ch === ' ' ? px * 0.35 : Math.max(px * 0.3, measure.measureText(t.ch).width) + px * 0.04;
      if (x + w > WRITE_R && x > MARGIN_L) { lineSizes[line] = lineMax; line++; x = MARGIN_L; lineMax = BASE; }
      layout.push({ x, w, px, line });
      lineMax = Math.max(lineMax, px);
      x += w;
    }
    lineSizes[line] = lineMax;
    // line baselines (big lines take more room)
    const base = [];
    let y = MARGIN_T;
    for (let i = 0; i <= line; i++) { y += Math.max(LINE, (lineSizes[i] || BASE) * 1.18); base[i] = y - 14; }
    // scroll: drop whole lines from the top until the last line fits
    const bottom = LH - 26;
    let drop = 0;
    while (drop < line && base[line] - (drop > 0 ? base[drop - 1] + 14 - MARGIN_T : 0) > bottom) drop++;
    const shift = drop > 0 ? base[drop - 1] + 14 - MARGIN_T : 0;
    for (const l of layout) if (l) { l.y = base[l.line] - shift; l.hidden = l.line < drop; }
    const changed = drop !== scroll;
    scroll = drop;
    return changed;
  }

  function stampGlyph(i) {
    const t = tokens[i], l = layout[i];
    if (!l || l.hidden || t.ch === ' ') return;
    const px = l.px;
    const S = Math.ceil(px * 1.7);
    if (scratch.width < S) { scratch.width = scratch.height = S; }
    sg.clearRect(0, 0, S, S);
    const j1 = hash(i * 3), j2 = hash(i * 3 + 1), j3 = hash(i * 3 + 2);
    const [r, g, b] = COLORS[t.color];
    sg.save();
    sg.translate(S / 2, S / 2);
    sg.rotate((j1 - 0.5) * 0.09);
    sg.font = `${(px * (0.96 + j2 * 0.08)).toFixed(1)}px ${FONT_KAI}`;
    sg.textAlign = 'center'; sg.textBaseline = 'alphabetic';
    sg.fillStyle = `rgba(${r},${g},${b},${(0.82 + j3 * 0.16).toFixed(2)})`;
    sg.shadowColor = `rgba(${r},${g},${b},0.35)`; sg.shadowBlur = 2;
    sg.fillText(t.ch, 0, px * 0.36);
    sg.restore();
    grainify(sg, 0, 0, S, S, 0.85);
    const dx = l.x + l.w / 2 - S / 2, dy = l.y - px * 0.36 - S / 2 + (j2 - 0.5) * 4;
    for (let h = 0; h < 2; h++) {
      const ox = dx - h * HALF;
      if (ox + S < 0 || ox > HALF) continue;
      gs[h].drawImage(scratch, 0, 0, S, S, ox, dy, S, S);
      dirty[h] = true;
    }
  }

  function fullRedraw() {
    for (let h = 0; h < 2; h++) { gs[h].drawImage(bg, h * HALF, 0, HALF, LH, 0, 0, HALF, LH); dirty[h] = true; }
    for (let i = 0; i < drawn; i++) stampGlyph(i);
  }

  function flushDirty() {
    for (let h = 0; h < 2; h++) if (dirty[h]) { texs[h].needsUpdate = true; dirty[h] = false; }
  }

  function setText(str, reveal) {
    raw = str;
    parseState = { color: 'white', size: 'normal' };
    tokens = parse(str, parseState);
    relayout();
    target = tokens.length;
    shown = drawn = reveal ? tokens.length : 0;
    fullRedraw();
    flushDirty();
  }

  const api = {
    /** Replace the board text immediately. */
    write(text) { setText(String(text ?? ''), true); },
    /** Add text; it appears character by character (chalk writing) at `speed` chars per game second. */
    append(text) {
      const s = String(text ?? '');
      if (!s) return;
      raw += s;
      tokens.push(...parse(s, parseState));
      target = tokens.length;
      if (relayout()) { drawn = Math.min(drawn, target); fullRedraw(); flushDirty(); }
    },
    clear() { setText('', true); },
    get text() { return raw; },
    /** extra: characters per second for append() */
    speed: 14,
    /** extra: true while append() is still revealing characters */
    get isWriting() { return drawn < target; },
    /** extra: reveal everything that is pending right now */
    flush() { shown = target; api.update(0); },
    update(dt) {
      if (drawn >= target) return;
      shown = Math.min(target, Math.max(shown, drawn) + dt * api.speed);
      while (drawn < Math.floor(shown + 1e-6) || (drawn < target && /\s/.test(tokens[drawn].ch))) {
        stampGlyph(drawn);
        drawn++;
      }
      flushDirty();
    },
  };
  setText('', true);
  return api;
}
