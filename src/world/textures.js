// Procedural canvas textures for the classroom (owner: env-artist). Every texture ≤ 1024².
// All randomness here is cosmetic and seeded (rngFor) so screenshots are stable.
import { drawTexture, makeCanvas, canvasTexture, rngFor, FONT_KAI, FONT_HEI } from './kit.js';

// ---------------------------------------------------------------------------------------------
// Shared bits
let _grain = null;
/** 256² speckle canvas used to erase pixels from chalk strokes (destination-out). */
export function chalkGrain() {
  if (_grain) return _grain;
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  const r = rngFor('chalk-grain');
  for (let i = 0; i < 5200; i++) {
    g.fillStyle = `rgba(0,0,0,${r.range(0.25, 0.95).toFixed(2)})`;
    const s = r.range(0.6, 2.4);
    g.fillRect(r.range(0, 256), r.range(0, 256), s, s * r.range(0.5, 1.6));
  }
  _grain = c;
  return c;
}

/** Apply chalk grain to whatever was just drawn in rect (x, y, w, h) of a transparent layer. */
export function grainify(g, x, y, w, h, strength = 1) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 0.55 * strength;
  const pat = g.createPattern(chalkGrain(), 'repeat');
  g.fillStyle = pat;
  g.translate((x * 7.3) % 256, (y * 3.1) % 256);
  g.fillRect(x - (x * 7.3) % 256, y - (y * 3.1) % 256, w, h);
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
export { roundRect };

// ---------------------------------------------------------------------------------------------
/** Wood floor planks, tileable, 1024² covers 2 m × 2 m. */
export function woodFloorTexture() {
  return drawTexture(1024, 1024, (g, W, H) => {
    const r = rngFor('floor');
    const N = 8, pw = W / N;
    const bases = ['#cf9b62', '#c48d55', '#d6a46c', '#c08a52', '#cb975e', '#d2a068'];
    g.fillStyle = '#5a3a20'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < N; i++) {
      const x0 = i * pw;
      let y = r.range(0, H);
      const start = y;
      while (y < start + H) {
        const len = Math.min(r.range(360, 760), start + H - y);
        const seg = { col: r.pick(bases), grains: [], knot: r.chance(0.25) ? { x: r.range(12, pw - 12), y: r.range(20, len - 20), s: r.range(4, 9) } : null };
        for (let k = 0; k < 16; k++) seg.grains.push({ x: r.range(3, pw - 3), a: r.range(0.04, 0.15), w: r.range(0.7, 2.0), amp: r.range(0.6, 4), ph: r.range(0, 6), fr: r.range(0.004, 0.02) });
        for (const dy of [0, -H]) drawPlank(g, x0 + 1, y + dy, pw - 2, len, seg);
        y += len;
      }
    }
  }, { repeat: true, anisotropy: 8 });
}
function drawPlank(g, x, y, w, len, seg) {
  g.save();
  g.beginPath(); g.rect(x, y, w, len - 2); g.clip();
  g.fillStyle = seg.col; g.fillRect(x, y, w, len);
  for (const gr of seg.grains) {
    g.strokeStyle = `rgba(105,58,24,${gr.a})`; g.lineWidth = gr.w;
    g.beginPath();
    for (let yy = y; yy <= y + len; yy += 10) {
      const xx = x + gr.x + Math.sin(yy * gr.fr + gr.ph) * gr.amp;
      if (yy === y) g.moveTo(xx, yy); else g.lineTo(xx, yy);
    }
    g.stroke();
  }
  if (seg.knot) {
    const k = seg.knot;
    for (let j = 3; j > 0; j--) {
      g.strokeStyle = `rgba(95,50,20,${0.12 + 0.06 * j})`; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(x + k.x, y + k.y, k.s * j * 0.6, k.s * j * 1.6, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  const sh = g.createLinearGradient(x, 0, x + w, 0);
  sh.addColorStop(0, 'rgba(255,240,215,0.14)'); sh.addColorStop(0.45, 'rgba(255,240,215,0)'); sh.addColorStop(1, 'rgba(70,35,10,0.10)');
  g.fillStyle = sh; g.fillRect(x, y, w, len);
  g.restore();
}

// ---------------------------------------------------------------------------------------------
/**
 * Desk-top atlas: 4×4 cells of 256². Each cell: top face in the upper 256×192, edge colour band below.
 * Variant 0 is the player's desk (carved 早, heart doodle). Returns {texture, top(i), side(i), count}.
 */
export function deskAtlas() {
  const S = 256, TOP = 192;
  const tex = drawTexture(1024, 1024, (g) => {
    const r = rngFor('desks-atlas');
    for (let i = 0; i < 16; i++) {
      const cx = (i % 4) * S, cy = Math.floor(i / 4) * S;
      g.save();
      g.translate(cx, cy);
      // edge band
      g.fillStyle = '#c99c62'; g.fillRect(0, TOP, S, S - TOP);
      g.fillStyle = 'rgba(80,45,15,0.25)'; for (let k = 0; k < 6; k++) g.fillRect(0, TOP + 8 + k * 9, S, 1.5);
      // wood top
      g.beginPath(); g.rect(0, 0, S, TOP); g.clip();
      g.fillStyle = r.pick(['#ecca97', '#e8c48f', '#efcf9e', '#e6c18a']); g.fillRect(0, 0, S, TOP);
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = `rgba(150,95,45,${r.range(0.05, 0.16).toFixed(2)})`; g.lineWidth = r.range(0.6, 1.8);
        const y0 = r.range(0, TOP), amp = r.range(0.5, 3.5), fr = r.range(0.01, 0.04), ph = r.range(0, 6);
        g.beginPath();
        for (let x = 0; x <= S; x += 8) { const y = y0 + Math.sin(x * fr + ph) * amp; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
      }
      const vg = g.createRadialGradient(S / 2, TOP / 2, 30, S / 2, TOP / 2, 170);
      vg.addColorStop(0, 'rgba(255,250,235,0.18)'); vg.addColorStop(1, 'rgba(120,70,30,0.16)');
      g.fillStyle = vg; g.fillRect(0, 0, S, TOP);
      g.strokeStyle = 'rgba(120,75,35,0.45)'; g.lineWidth = 4; g.strokeRect(2, 2, S - 4, TOP - 4);
      DOODLES[i]?.(g, S, TOP, r);
      g.restore();
    }
  }, { anisotropy: 8 });
  const top = (i) => { const c = i % 4, row = Math.floor(i / 4); return [c / 4 + 0.002, 1 - (row * S + TOP) / 1024 + 0.002, (c + 1) / 4 - 0.002, 1 - row * S / 1024 - 0.002]; };
  const side = (i) => { const c = i % 4, row = Math.floor(i / 4); return [c / 4 + 0.01, 1 - (row + 1) * S / 1024 + 0.01, (c + 1) / 4 - 0.01, 1 - (row * S + TOP) / 1024 - 0.01]; };
  return { texture: tex, top, side, count: 16 };
}

const pencil = (a = 0.55) => `rgba(70,70,85,${a})`;
const pen = (a = 0.8) => `rgba(40,70,160,${a})`;
function text(g, s, x, y, size, color, font = FONT_KAI, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.font = `${size}px ${font}`; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(s, 0, 0); g.restore();
}
function carve(g, s, x, y, size) {
  g.save(); g.translate(x, y); g.rotate(-0.08);
  g.font = `bold ${size}px ${FONT_KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,240,210,0.7)'; g.fillText(s, 1.5, 1.5);
  g.fillStyle = 'rgba(95,52,20,0.85)'; g.fillText(s, 0, 0);
  g.restore();
}
function heart(g, x, y, s, fill, stroke) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s, y - s * 0.35, x - s * 0.45, y - s * 1.0, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.45, y - s * 1.0, x + s, y - s * 0.35, x, y + s * 0.35);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); }
}
function star(g, x, y, R, fill) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.45 : R; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = fill; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.stroke();
}
const DOODLES = [
  // 0 — player's desk
  (g, S, T) => { carve(g, '早', 206, 46, 44); heart(g, 52, 150, 16, null, pencil(0.7)); text(g, '加油！', 112, 154, 20, pencil(0.65), FONT_KAI, -0.05); g.strokeStyle = pencil(0.4); g.lineWidth = 1.5; g.beginPath(); g.moveTo(20, 30); g.lineTo(90, 26); g.stroke(); },
  () => {},
  (g, S, T) => { g.strokeStyle = pen(0.75); g.lineWidth = 3; g.beginPath(); g.moveTo(236, 6); g.lineTo(238, T - 6); g.stroke(); text(g, '楚河汉界', 210, 96, 16, pen(0.7), FONT_KAI, Math.PI / 2); },
  (g) => { star(g, 60, 60, 20, '#ffd34d'); heart(g, 190, 140, 18, '#ff8fb1'); },
  (g) => { g.strokeStyle = pencil(0.7); g.lineWidth = 2; g.beginPath(); g.arc(180, 90, 26, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(158, 76); g.lineTo(162, 52); g.lineTo(174, 66); g.moveTo(186, 66); g.lineTo(198, 52); g.lineTo(202, 76); g.stroke(); g.beginPath(); g.arc(171, 88, 3, 0, 7); g.arc(189, 88, 3, 0, 7); g.fillStyle = pencil(0.8); g.fill(); g.beginPath(); g.moveTo(150, 98); g.lineTo(130, 94); g.moveTo(150, 102); g.lineTo(130, 104); g.moveTo(210, 98); g.lineTo(230, 94); g.moveTo(210, 102); g.lineTo(230, 104); g.stroke(); },
  (g) => { text(g, 'sin²α+cos²α=1', 120, 60, 22, pencil(0.7), FONT_KAI, -0.04); text(g, 'Δ=b²−4ac', 90, 120, 20, pencil(0.55), FONT_KAI, 0.03); },
  (g) => { g.strokeStyle = 'rgba(140,90,40,0.35)'; g.lineWidth = 5; g.beginPath(); g.arc(70, 70, 26, 0.3, 5.9); g.stroke(); text(g, '好困 zzz', 170, 140, 22, pencil(0.6), FONT_KAI, -0.08); },
  (g) => { g.strokeStyle = pencil(0.6); g.lineWidth = 2; for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(40 + k * 30, 40); g.lineTo(40 + k * 30, 130); g.stroke(); g.beginPath(); g.moveTo(40, 40 + k * 30); g.lineTo(130, 40 + k * 30); g.stroke(); } text(g, '○', 55, 55, 22, pencil(0.7)); text(g, '×', 85, 85, 26, pen(0.8)); text(g, '○', 115, 55, 22, pencil(0.7)); text(g, '×', 55, 115, 26, pen(0.8)); },
  (g) => { g.strokeStyle = pen(0.7); g.lineWidth = 2; g.beginPath(); g.arc(200, 50, 16, 0, Math.PI * 2); g.stroke(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(200 + Math.cos(a) * 22, 50 + Math.sin(a) * 22); g.lineTo(200 + Math.cos(a) * 30, 50 + Math.sin(a) * 30); g.stroke(); } text(g, '晴', 60, 140, 26, pen(0.6)); },
  (g) => { text(g, '必胜！', 80, 70, 34, 'rgba(200,40,40,0.75)', FONT_KAI, -0.1); g.strokeStyle = 'rgba(200,40,40,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(150, 40); g.lineTo(150, 110); g.stroke(); g.fillStyle = 'rgba(220,50,50,0.7)'; g.fillRect(150, 40, 34, 22); },
  (g) => { carve(g, '静', 60, 60, 38); },
  (g) => { g.strokeStyle = pen(0.7); g.lineWidth = 2; g.beginPath(); g.arc(190, 110, 24, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(190, 114, 13, 0.2, Math.PI - 0.2); g.stroke(); g.fillStyle = pen(0.8); g.fillRect(180, 100, 4, 6); g.fillRect(197, 100, 4, 6); text(g, '^_^', 70, 50, 24, pencil(0.6)); },
  (g) => { text(g, '正正正丅', 90, 60, 28, pencil(0.7), FONT_KAI, -0.03); text(g, '还有几天放假', 120, 120, 18, pencil(0.5)); },
  (g) => { g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(70, 60, 30, 16, 0, 0, 7); g.ellipse(95, 52, 22, 14, 0, 0, 7); g.fill(); g.strokeStyle = pen(0.6); g.lineWidth = 1.5; g.stroke(); for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(55 + k * 14, 82); g.lineTo(50 + k * 14, 96); g.stroke(); } },
  (g) => { g.fillStyle = 'rgba(80,80,90,0.15)'; g.beginPath(); g.ellipse(160, 80, 50, 18, -0.3, 0, 7); g.fill(); },
  (g) => { g.fillStyle = '#fffdf5'; g.fillRect(150, 18, 90, 34); g.strokeStyle = '#d24'; g.lineWidth = 2; g.strokeRect(150, 18, 90, 34); text(g, '加油鸭', 195, 36, 18, '#d24'); },
];

// ---------------------------------------------------------------------------------------------
/** Red banners above the blackboard: top half 好好学习, bottom half 天天向上 (1024×256). */
export function bannerTexture(lines = ['好好学习', '天天向上']) {
  return drawTexture(1024, 256, (g, W, H) => {
    lines.forEach((s, i) => {
      const y0 = i * 128;
      const grd = g.createLinearGradient(0, y0, 0, y0 + 128);
      grd.addColorStop(0, '#d8463c'); grd.addColorStop(0.5, '#c8322d'); grd.addColorStop(1, '#a8241f');
      g.fillStyle = grd; g.fillRect(0, y0, W, 128);
      for (let k = 0; k < 9; k++) { // cloth folds
        const x = (k + 0.5) * W / 9;
        const fg = g.createLinearGradient(x - 50, 0, x + 50, 0);
        fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, 'rgba(255,200,180,0.10)'); fg.addColorStop(1, 'rgba(0,0,0,0.08)');
        g.fillStyle = fg; g.fillRect(x - 50, y0, 100, 128);
      }
      g.fillStyle = '#f2c94c'; g.fillRect(0, y0 + 6, W, 4); g.fillRect(0, y0 + 118, W, 4);
      g.font = `bold 92px ${FONT_KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const chars = [...s];
      chars.forEach((ch, k) => {
        const x = (k + 0.5) * W / chars.length;
        g.fillStyle = 'rgba(90,10,10,0.6)'; g.fillText(ch, x + 3, y0 + 68);
        g.fillStyle = '#ffe07a'; g.fillText(ch, x, y0 + 65);
      });
    });
  });
}

/** Wall clock face (256²). */
export function clockFaceTexture() {
  return drawTexture(256, 256, (g) => {
    const c = 128;
    const bg = g.createRadialGradient(c, c - 20, 10, c, c, 128);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#ece6da');
    g.fillStyle = bg; g.beginPath(); g.arc(c, c, 128, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 60; i++) {
      const a = i * Math.PI / 30, big = i % 5 === 0;
      g.strokeStyle = big ? '#333' : '#888'; g.lineWidth = big ? 5 : 2;
      g.beginPath(); g.moveTo(c + Math.sin(a) * (big ? 100 : 108), c - Math.cos(a) * (big ? 100 : 108)); g.lineTo(c + Math.sin(a) * 118, c - Math.cos(a) * 118); g.stroke();
    }
    g.fillStyle = '#2b2b33'; g.font = `bold 26px ${FONT_HEI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let h = 1; h <= 12; h++) { const a = h * Math.PI / 6; g.fillText(String(h), c + Math.sin(a) * 82, c - Math.cos(a) * 82 + 1); }
    g.fillStyle = '#c8322d'; g.font = `14px ${FONT_HEI}`; g.fillText('育才中学', c, c + 40);
  }, { anisotropy: 4 });
}

// ---------------------------------------------------------------------------------------------
/**
 * Poster atlas (1024²) — schedule, certificates, rules, duty roster, calligraphy. Returns {texture, rects}.
 * rects[name] = [u0, v0, u1, v1] in UV space.
 */
export function posterAtlas() {
  const R = {};
  const reg = (name, x, y, w, h) => { R[name] = [x / 1024, 1 - (y + h) / 1024, (x + w) / 1024, 1 - y / 1024]; return [x, y, w, h]; };
  const tex = drawTexture(1024, 1024, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 1024);
    // 课程表 (512×384)
    {
      const [x, y, w, h] = reg('schedule', 0, 0, 512, 384);
      g.fillStyle = '#fff8e6'; g.fillRect(x, y, w, h);
      g.fillStyle = '#ff9f7a'; g.fillRect(x, y, w, 56);
      g.fillStyle = '#fff'; g.font = `bold 36px ${FONT_HEI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('课  程  表', x + w / 2, y + 30);
      const days = ['', '一', '二', '三', '四', '五'];
      const subj = [['语文', '数学', '英语', '物理', '化学'], ['数学', '语文', '数学', '英语', '语文'], ['英语', '物理', '语文', '数学', '数学'], ['化学', '英语', '生物', '语文', '英语'], ['体育', '历史', '数学', '地理', '物理'], ['生物', '政治', '体育', '化学', '美术'], ['自习', '音乐', '班会', '自习', '自习']];
      const cw = w / 6, ch = (h - 64) / 8;
      const tint = { 语文: '#ffe1e1', 数学: '#dcecff', 英语: '#e5f8de', 物理: '#f3e3ff', 化学: '#fff1cf', 体育: '#d8f5f2', 生物: '#e9f6d6', 自习: '#f0f0f0', 班会: '#ffe6f2' };
      for (let rI = 0; rI < 8; rI++) for (let cI = 0; cI < 6; cI++) {
        const cx = x + cI * cw, cy = y + 60 + rI * ch;
        let s = '', bg = '#fffdf6';
        if (rI === 0) { s = cI ? `周${days[cI]}` : '节次'; bg = '#ffe9c7'; } else if (cI === 0) { s = String(rI); bg = '#ffe9c7'; } else { s = subj[rI - 1][cI - 1]; bg = tint[s] || '#fffdf6'; }
        g.fillStyle = bg; g.fillRect(cx + 1, cy + 1, cw - 2, ch - 2);
        g.fillStyle = '#4a3a2a'; g.font = `${rI === 0 || cI === 0 ? 'bold ' : ''}22px ${FONT_HEI}`; g.fillText(s, cx + cw / 2, cy + ch / 2 + 1);
      }
      g.strokeStyle = '#d98b5f'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    }
    // 奖状 ×3 (256×192)
    const cert = (name, px, py, line) => {
      const [x, y, w, h] = reg(name, px, py, 256, 192);
      g.fillStyle = '#fff6e0'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#d4322c'; g.lineWidth = 10; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
      g.strokeStyle = '#e6b84a'; g.lineWidth = 3; g.strokeRect(x + 15, y + 15, w - 30, h - 30);
      g.fillStyle = '#d4322c'; g.font = `bold 40px ${FONT_KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('奖  状', x + w / 2, y + 52);
      g.fillStyle = '#5a3a20'; g.font = `18px ${FONT_KAI}`; g.fillText(line, x + w / 2, y + 102);
      g.font = `14px ${FONT_KAI}`; g.fillText('特发此状，以资鼓励。', x + w / 2, y + 130);
      g.fillStyle = 'rgba(214,40,40,0.85)'; g.beginPath(); g.arc(x + w - 62, y + h - 46, 22, 0, 7); g.fill();
      g.fillStyle = '#fff6e0'; g.font = `bold 12px ${FONT_KAI}`; g.fillText('育才中学', x + w - 62, y + h - 46);
    };
    cert('cert1', 512, 0, '高二(3)班 荣获 文明班级');
    cert('cert2', 768, 0, '校运会 4×100 米接力 第一名');
    cert('cert3', 512, 192, '合唱比赛 一等奖');
    // 中学生守则 (256×384)
    {
      const [x, y, w, h] = reg('rules', 768, 192, 256, 384);
      g.fillStyle = '#f3f8ff'; g.fillRect(x, y, w, h);
      g.fillStyle = '#3d6fb6'; g.fillRect(x, y, w, 60);
      g.fillStyle = '#fff'; g.font = `bold 26px ${FONT_HEI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('中学生守则', x + w / 2, y + 31);
      const lines = ['一、爱党爱国爱人民', '二、好学多问肯钻研', '三、勤劳笃行乐奉献', '四、明礼守法讲美德', '五、孝亲尊师善待人', '六、诚实守信有担当', '七、自强自律健身心', '八、珍爱生命保安全', '九、勤俭节约护家园'];
      g.fillStyle = '#2b3a55'; g.font = `18px ${FONT_HEI}`; g.textAlign = 'left';
      lines.forEach((s, i) => g.fillText(s, x + 22, y + 92 + i * 32));
      g.strokeStyle = '#3d6fb6'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    }
    // 值日表 (384×256)
    {
      const [x, y, w, h] = reg('duty', 0, 384, 384, 256);
      g.fillStyle = '#f0fff4'; g.fillRect(x, y, w, h);
      g.fillStyle = '#48a868'; g.fillRect(x, y, w, 50);
      g.fillStyle = '#fff'; g.font = `bold 28px ${FONT_HEI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('卫生值日表', x + w / 2, y + 26);
      const names = ['周一  扫地 · 拖地', '周二  擦黑板 · 倒垃圾', '周三  擦窗户 · 摆桌椅', '周四  扫地 · 倒垃圾', '周五  大扫除'];
      g.fillStyle = '#2d4a36'; g.font = `20px ${FONT_HEI}`; g.textAlign = 'left';
      names.forEach((s, i) => { g.fillText(s, x + 24, y + 80 + i * 36); g.fillStyle = 'rgba(72,168,104,0.25)'; g.fillRect(x + 18, y + 96 + i * 36, w - 36, 2); g.fillStyle = '#2d4a36'; });
      g.strokeStyle = '#48a868'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    }
    // calligraphy scroll 天道酬勤 (128×448, vertical)
    {
      const [x, y, w, h] = reg('scroll', 384, 384, 128, 448);
      g.fillStyle = '#f6eed8'; g.fillRect(x, y, w, h);
      g.fillStyle = '#7b5a3a'; g.fillRect(x, y, w, 18); g.fillRect(x, y + h - 18, w, 18);
      g.fillStyle = '#1e1a16'; g.font = `bold 78px ${FONT_KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      [...'天道酬勤'].forEach((ch, i) => g.fillText(ch, x + w / 2, y + 70 + i * 98));
      g.fillStyle = '#c8322d'; g.fillRect(x + w / 2 - 12, y + h - 52, 24, 24);
    }
    // speaker grille / exit sign / small labels
    {
      const [x, y, w, h] = reg('speaker', 512, 384, 128, 128);
      g.fillStyle = '#e8e2d4'; g.fillRect(x, y, w, h);
      g.fillStyle = '#5a5248';
      for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { g.beginPath(); g.arc(x + 16 + i * 12, y + 16 + j * 12, 3.2, 0, 7); g.fill(); }
    }
    {
      const [x, y, w, h] = reg('sign', 640, 384, 128, 64);
      g.fillStyle = '#2f9e5b'; g.fillRect(x, y, w, h);
      g.fillStyle = '#fff'; g.font = `bold 30px ${FONT_HEI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('高二(3)班', x + w / 2, y + h / 2 + 1);
    }
    {
      const [x, y, w, h] = reg('notice', 640, 448, 128, 64);
      g.fillStyle = '#fff3c4'; g.fillRect(x, y, w, h);
      g.fillStyle = '#7a5a10'; g.font = `bold 22px ${FONT_HEI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('节约用水', x + w / 2, y + h / 2 + 1);
    }
    // locker door labels strip (512×64): numbers 1..18
    {
      const [x, y, w, h] = reg('lockerNums', 0, 640, 512, 64);
      g.fillStyle = '#a9cfe0'; g.fillRect(x, y, w, h);
    }
    // world map-ish poster (384×256) — 世界地图 abstract
    {
      const [x, y, w, h] = reg('map', 0, 704, 384, 256);
      g.fillStyle = '#bfe2f2'; g.fillRect(x, y, w, h);
      const r = rngFor('map');
      g.fillStyle = '#9bd18b';
      const blobs = [[70, 70, 50, 34], [110, 160, 26, 50], [190, 70, 40, 28], [215, 140, 32, 46], [290, 80, 70, 40], [320, 180, 30, 22]];
      for (const [bx, by, rx, ry] of blobs) { g.beginPath(); for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, rr = 0.75 + r.range(0, 0.4); g.lineTo(x + bx + Math.cos(a) * rx * rr, y + by + Math.sin(a) * ry * rr); } g.closePath(); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1;
      for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(x, y + k * h / 6); g.lineTo(x + w, y + k * h / 6); g.stroke(); g.beginPath(); g.moveTo(x + k * w / 6, y); g.lineTo(x + k * w / 6, y + h); g.stroke(); }
      g.fillStyle = '#2b4a66'; g.font = `bold 22px ${FONT_HEI}`; g.textAlign = 'center'; g.fillText('世界地图', x + w / 2, y + h - 18);
      g.strokeStyle = '#6b8fa6'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    }
  });
  return { texture: tex, rects: R };
}

// ---------------------------------------------------------------------------------------------
/** Back-wall 黑板报 (blackboard newspaper), 1024×384. `variant` picks the theme (P2 random per round). */
export function newspaperTexture(variant = 0) {
  const c = makeCanvas(1024, 384);
  const g = c.getContext('2d');
  paintNewspaper(g, variant);
  return { texture: canvasTexture(c), canvas: c, repaint(v) { paintNewspaper(g, v); this.texture.needsUpdate = true; } };
}
const THEMES = [
  { title: '青春飞扬', sub: ['学习园地', '心灵驿站', '名人名言'], color: '#ffb3c7' },
  { title: '追梦少年', sub: ['考试技巧', '班级风采', '每周一句'], color: '#ffe17a' },
  { title: '秋日私语', sub: ['读书分享', '运动健将', '温馨提示'], color: '#a8e6ff' },
];
const QUOTES = ['书山有路勤为径', '学海无涯苦作舟', '少年强则国强', '不积跬步无以至千里', '宝剑锋从磨砺出', '天生我材必有用', '长风破浪会有时', '莫等闲白了少年头'];
function paintNewspaper(g, variant) {
  const r = rngFor(`news-${variant}`);
  const th = THEMES[variant % THEMES.length];
  const W = 1024, H = 384;
  g.fillStyle = '#2c4f40'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${r.range(0.01, 0.04).toFixed(3)})`; g.beginPath(); g.ellipse(r.range(0, W), r.range(0, H), r.range(20, 90), r.range(8, 30), r.range(0, 3), 0, 7); g.fill(); }
  const layer = makeCanvas(W, H);
  const L = layer.getContext('2d');
  // dashed colourful border
  const cols = ['#ffb3c7', '#ffe17a', '#a8e6ff', '#b8f2a6', '#e0c3ff'];
  L.lineWidth = 6; L.setLineDash([18, 10]);
  L.strokeStyle = cols[variant % cols.length]; L.strokeRect(12, 12, W - 24, H - 24);
  L.setLineDash([]);
  // title bubble letters
  L.font = `bold 84px ${FONT_KAI}`; L.textAlign = 'center'; L.textBaseline = 'middle';
  [...th.title].forEach((ch, i) => {
    const x = 250 + i * 128, y = 82 + Math.sin(i * 1.3) * 8;
    L.lineWidth = 10; L.strokeStyle = 'rgba(255,255,255,0.9)'; L.strokeText(ch, x, y);
    L.fillStyle = cols[(i + variant) % cols.length]; L.fillText(ch, x, y);
  });
  // sun
  L.strokeStyle = '#ffd34d'; L.fillStyle = 'rgba(255,211,77,0.85)'; L.lineWidth = 4;
  L.beginPath(); L.arc(88, 86, 38, 0, 7); L.fill();
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; L.beginPath(); L.moveTo(88 + Math.cos(a) * 48, 86 + Math.sin(a) * 48); L.lineTo(88 + Math.cos(a) * 64, 86 + Math.sin(a) * 64); L.stroke(); }
  // paper plane / rocket
  L.strokeStyle = '#ffffff'; L.lineWidth = 4;
  L.beginPath(); L.moveTo(880, 70); L.lineTo(980, 40); L.lineTo(915, 110); L.closePath(); L.stroke();
  L.beginPath(); L.moveTo(915, 110); L.lineTo(925, 75); L.lineTo(980, 40); L.stroke();
  L.setLineDash([8, 10]); L.beginPath(); L.moveTo(870, 80); L.quadraticCurveTo(800, 120, 760, 60); L.stroke(); L.setLineDash([]);
  // three columns
  for (let col = 0; col < 3; col++) {
    const x0 = 40 + col * 330, y0 = 150;
    L.fillStyle = cols[(col + 1 + variant) % cols.length];
    L.font = `bold 34px ${FONT_KAI}`; L.textAlign = 'left'; L.fillText(th.sub[col], x0 + 10, y0 + 18);
    L.strokeStyle = L.fillStyle; L.lineWidth = 3; L.beginPath(); L.moveTo(x0 + 6, y0 + 42); L.lineTo(x0 + 190, y0 + 44); L.stroke();
    L.font = `20px ${FONT_KAI}`; L.fillStyle = 'rgba(245,245,235,0.85)';
    for (let line = 0; line < 6; line++) {
      const q = r.pick(QUOTES);
      L.fillText(line === 0 ? `“${q}”` : q.slice(0, r.int(4, q.length)) + '，' + r.pick(QUOTES).slice(0, r.int(3, 6)) + '。', x0 + 12, y0 + 74 + line * 30);
    }
    if (col < 2) { L.strokeStyle = 'rgba(255,255,255,0.35)'; L.lineWidth = 2; L.setLineDash([6, 8]); L.beginPath(); L.moveTo(x0 + 318, y0); L.lineTo(x0 + 318, H - 30); L.stroke(); L.setLineDash([]); }
  }
  // flowers at the bottom corners
  for (const [fx, fy] of [[960, 330], [990, 300], [60, 335]]) {
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; L.fillStyle = cols[(k + variant) % 5]; L.beginPath(); L.arc(fx + Math.cos(a) * 11, fy + Math.sin(a) * 11, 8, 0, 7); L.fill(); }
    L.fillStyle = '#ffd34d'; L.beginPath(); L.arc(fx, fy, 6, 0, 7); L.fill();
  }
  grainify(L, 0, 0, W, H, 0.8);
  g.drawImage(layer, 0, 0);
}

// ---------------------------------------------------------------------------------------------
/** Opposite school building façade, 512² (one tile = one 3.6 m bay × 2 floors). night=true → lit windows. */
export function facadeTexture(night = false) {
  return drawTexture(512, 512, (g, W, H) => {
    const r = rngFor(`facade-${night}`);
    g.fillStyle = night ? '#3a4058' : '#f1ece0'; g.fillRect(0, 0, W, H);
    for (let f = 0; f < 2; f++) {
      const y0 = f * 256;
      g.fillStyle = night ? '#2c3146' : '#d8684e'; g.fillRect(0, y0 + 216, W, 14);   // floor slab stripe
      g.fillStyle = night ? '#4a5068' : '#e4ded0'; g.fillRect(0, y0 + 230, W, 26);
      for (let k = 0; k < 2; k++) {
        const x0 = 40 + k * 240;
        const lit = night && r.chance(0.45);
        g.fillStyle = night ? (lit ? '#ffd98a' : '#1d2236') : '#8fbcd9';
        g.fillRect(x0, y0 + 60, 190, 130);
        if (!night) { const gl = g.createLinearGradient(x0, y0 + 60, x0 + 190, y0 + 190); gl.addColorStop(0, 'rgba(255,255,255,0.45)'); gl.addColorStop(0.4, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(40,80,120,0.25)'); g.fillStyle = gl; g.fillRect(x0, y0 + 60, 190, 130); }
        g.fillStyle = night ? '#5a6078' : '#ffffff';
        g.fillRect(x0 - 6, y0 + 54, 202, 8); g.fillRect(x0 - 6, y0 + 188, 202, 8); g.fillRect(x0 + 92, y0 + 60, 6, 130);
        g.fillRect(x0 - 6, y0 + 54, 8, 142); g.fillRect(x0 + 188, y0 + 54, 8, 142);
      }
    }
  }, { repeat: true });
}

/** Faint diagonal streaks for window glass (128²). */
export function glassTexture() {
  return drawTexture(128, 128, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.globalAlpha = 1;
    const gr = g.createLinearGradient(0, 0, 128, 128);
    gr.addColorStop(0, '#d8eeff'); gr.addColorStop(1, '#ffffff');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#ffffff'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(20, 128); g.lineTo(128, 20); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(48, 128); g.lineTo(128, 48); g.stroke();
  });
}

/** Soft round sprite (dust motes, petals glow, stars). */
export function softDotTexture() {
  return drawTexture(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }, { srgb: false });
}

/** Window-shaped soft light patch (lowfx fake sun patches): bright pane rectangles with soft edges. */
export function lightPatchTexture() {
  return drawTexture(256, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    g.filter = 'blur(6px)';
    g.fillStyle = '#fff';
    g.fillRect(18, 18, 105, 220); g.fillRect(133, 18, 105, 220);
    g.filter = 'none';
  }, { srgb: false });
}

/** Petal sprite (cherry blossom). */
export function petalTexture() {
  return drawTexture(64, 64, (g) => {
    g.translate(32, 32);
    g.fillStyle = '#ffd1df';
    g.beginPath(); g.moveTo(0, -26); g.bezierCurveTo(22, -18, 20, 14, 0, 26); g.bezierCurveTo(-20, 14, -22, -18, 0, -26); g.fill();
    g.fillStyle = 'rgba(255,150,180,0.8)'; g.beginPath(); g.moveTo(0, -26); g.lineTo(-5, -18); g.lineTo(5, -18); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(-5, 2, 4, 12, 0.2, 0, 7); g.fill();
  });
}
