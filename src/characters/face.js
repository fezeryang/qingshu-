// Face canvas painter. Each character owns one 256² canvas; it is redrawn only when the visible
// state (expression, blink, mouth frame, gaze, glint, tear frame) changes.
import * as THREE from 'three';
import { pxPerDeg } from './head.js';

const S = 256;
const K = pxPerDeg(S);
const X = (fx) => S / 2 + fx * K;
const Y = (fy) => S / 2 - fy * K;
const LINE = '#2b1a17';

export const EXPR = {
  neutral: { eyes: 'normal', brows: 'neutral', mouth: 'small' },
  happy: { eyes: 'happy', brows: 'up', mouth: 'grin', blush: 0.35 },
  smile: { eyes: 'normal', lower: 0.18, brows: 'neutral', mouth: 'smile', blush: 0.18 },
  blush: { eyes: 'shy', brows: 'worried', mouth: 'wavy', blush: 1, hatch: true },
  love: { eyes: 'heart', brows: 'up', mouth: 'grin', blush: 0.75 },
  shock: { eyes: 'shock', brows: 'high', mouth: 'O', gloom: true, sweat: true },
  angry: { eyes: 'angry', brows: 'angry', mouth: 'teeth', vein: true },
  sad: { eyes: 'sad', brows: 'sad', mouth: 'frown', tear: true },
  cry: { eyes: 'squeeze', brows: 'sad', mouth: 'wail', tears: true, blush: 0.3 },
  smug: { eyes: 'half', brows: 'smug', mouth: 'smirk', gaze: [0.35, 0] },
  sleepy: { eyes: 'sleepy', brows: 'relaxed', mouth: 'smallO' },
  sweat: { eyes: 'normal', brows: 'worried', mouth: 'nervous', sweat: true },
  suspicious: { eyes: 'narrow', brows: 'suspicious', mouth: 'flatSlant', gaze: [0.55, 0] },
  determined: { eyes: 'determined', brows: 'determined', mouth: 'firm', sparkle: true },
  dizzy: { eyes: 'spiral', brows: 'worried', mouth: 'wavyOpen', blush: 0.2 },
  embarrassed: { eyes: 'squeeze', brows: 'worried', mouth: 'wavy', blush: 0.9, hatch: true, sweat: true },
  // internal faces used by clips
  sleep: { eyes: 'closed', brows: 'relaxed', mouth: 'smallO' },
  closed: { eyes: 'closed', brows: 'neutral', mouth: 'small' },
  content: { eyes: 'happy', brows: 'relaxed', mouth: 'smile', blush: 0.2 },
  yawn: { eyes: 'squeeze', brows: 'relaxed', mouth: 'yawn', tear: true },
  sneezeUp: { eyes: 'sleepy', brows: 'up', mouth: 'smallO' },
  sneeze: { eyes: 'squeeze', brows: 'angry', mouth: 'wail' },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'wail', blush: 0.4 },
  gasp: { eyes: 'shock', brows: 'high', mouth: 'O', sweat: false },
  pain: { eyes: 'squeeze', brows: 'worried', mouth: 'teeth' },
  talk: { eyes: 'normal', brows: 'neutral', mouth: 'talk' },
  faint: { eyes: 'spiral', brows: 'worried', mouth: 'O' },
  shiver: { eyes: 'sad', brows: 'worried', mouth: 'wavy', sweat: true },
  proud: { eyes: 'closed', brows: 'smug', mouth: 'smile' },
};
export const EXPRESSIONS = ['neutral', 'happy', 'smile', 'blush', 'love', 'shock', 'angry', 'sad', 'cry', 'smug', 'sleepy', 'sweat', 'suspicious', 'determined', 'dizzy', 'embarrassed'];
const BLINKABLE = new Set(['normal', 'shy', 'angry', 'sad', 'narrow', 'determined', 'half', 'sleepy']);
const TALK_MOUTH = { small: 'talk', smile: 'talkSmile', flat: 'talk', flatSlant: 'talk', firm: 'talk', nervous: 'talk', smirk: 'talkSmile', frown: 'talk', wavy: 'wavyOpen', smallO: 'O', teeth: 'grin', grin: 'grinBig' };

export class Face {
  constructor(look) {
    this.look = look;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = S;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.key = '';
  }
  /** st: {expr, blink, talk, gx, gy, glint, tear} */
  render(st) {
    const expr = EXPR[st.expr] || EXPR.neutral;
    // Invisible animation channels must not repaint/upload every character's face.
    const blink = st.blink && BLINKABLE.has(expr.eyes);
    const talk = st.talk && !!TALK_MOUTH[expr.mouth];
    const key = `${st.expr}|${blink ? 1 : 0}|${talk ? 1 : 0}|${st.gx}|${st.gy}|${st.glint && this.look.glasses ? 1 : 0}|${expr.tears ? st.tear : 0}`;
    if (key === this.key) return false;
    this.key = key;
    draw(this.g, this.look, st);
    this.texture.needsUpdate = true;
    return true;
  }
  dispose() { this.texture.dispose(); }
}

function draw(g, look, st) {
  g.canvas.__skin = look.skinCss;
  const E = EXPR[st.expr] || EXPR.neutral;
  const fem = look.gender === 'f';
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = look.skinCss;
  g.fillRect(0, 0, S, S);
  g.lineCap = 'round'; g.lineJoin = 'round';

  const ew = 19 * K, eh = (fem ? 24 : 22.5) * K;
  const eyes = [{ cx: X(-20), cy: Y(1), side: -1 }, { cx: X(20), cy: Y(1), side: 1 }];
  let gx = st.gx, gy = st.gy;
  if (E.gaze) { gx = gx * 0.5 + E.gaze[0]; gy = gy * 0.5 + E.gaze[1]; }

  // gloom (under everything else on the upper face)
  if (E.gloom) {
    const gr = g.createLinearGradient(0, Y(34), 0, Y(4));
    gr.addColorStop(0, 'rgba(70,70,190,0.55)'); gr.addColorStop(1, 'rgba(70,70,190,0)');
    g.fillStyle = gr; g.fillRect(X(-42), Y(36), X(42) - X(-42), Y(4) - Y(36));
    g.strokeStyle = 'rgba(60,60,170,0.7)'; g.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(X(i * 9), Y(34)); g.lineTo(X(i * 9), Y(22 - Math.abs(i) * 2)); g.stroke(); }
  }
  // blush
  const blush = E.blush || 0;
  if (blush > 0) {
    for (const sx of [-1, 1]) {
      const cx = X(sx * 27), cy = Y(-11);
      const gr = g.createRadialGradient(cx, cy, 1, cx, cy, 15 * K * 0.9);
      gr.addColorStop(0, `rgba(255,100,125,${0.75 * blush})`); gr.addColorStop(1, 'rgba(255,100,125,0)');
      g.fillStyle = gr;
      g.save(); g.translate(cx, cy); g.scale(1.45, 0.75); g.beginPath(); g.arc(0, 0, 15 * K * 0.9, 0, Math.PI * 2); g.fill(); g.restore();
      if (E.hatch) {
        g.strokeStyle = 'rgba(225,70,95,0.85)'; g.lineWidth = 1.8;
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(cx + i * 7 - 3, cy + 4); g.lineTo(cx + i * 7 + 3, cy - 4); g.stroke(); }
      }
    }
  }
  // accessories drawn on skin
  if (look.accessory === 'freckles') {
    g.fillStyle = 'rgba(176,112,80,0.75)';
    for (const sx of [-1, 1]) for (const [ox, oy] of [[-4, 0], [2, -3], [5, 3], [-1, 4]]) { g.beginPath(); g.arc(X(sx * 26) + ox, Y(-9) + oy, 1.4, 0, Math.PI * 2); g.fill(); }
  }
  if (look.accessory === 'mole') { g.fillStyle = '#4a2a20'; g.beginPath(); g.arc(X(-27), Y(-8), 1.8, 0, Math.PI * 2); g.fill(); }
  if (look.accessory === 'bandaid') {
    g.save(); g.translate(X(28), Y(-13)); g.rotate(-0.45);
    g.fillStyle = '#f0c494'; roundRect(g, -13, -5, 26, 10, 4); g.fill();
    g.fillStyle = '#e6ad7c'; roundRect(g, -4, -4, 8, 8, 2); g.fill();
    g.strokeStyle = 'rgba(150,100,70,0.6)'; g.lineWidth = 1; roundRect(g, -13, -5, 26, 10, 4); g.stroke();
    g.restore();
  }
  // nose
  g.fillStyle = 'rgba(205,120,105,0.7)';
  g.beginPath(); g.ellipse(X(0), Y(-9), 2, 1.4, 0, 0, Math.PI * 2); g.fill();

  // eyes
  const iris = look.eyeCss;
  for (const e of eyes) {
    let type = E.eyes;
    if (st.blink && BLINKABLE.has(type)) type = 'closed';
    drawEye(g, type, e.cx, e.cy, ew, eh, e.side, iris, gx, gy, E, fem);
  }
  // brows
  for (const e of eyes) drawBrow(g, E.brows, e.cx, e.cy - eh * 0.5 - 13 * K * 0.55, ew, e.side, look.browCss);

  // tears (streams) on top of cheeks
  if (E.tears) {
    for (const e of eyes) {
      const x0 = e.cx, y0 = e.cy + eh * 0.25, w = ew * 0.5;
      const gr = g.createLinearGradient(0, y0, 0, Y(-60));
      gr.addColorStop(0, 'rgba(140,210,255,0.95)'); gr.addColorStop(1, 'rgba(140,210,255,0.75)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x0 - w / 2, y0);
      for (let y = y0; y <= Y(-62); y += 6) g.lineTo(x0 - w / 2 + Math.sin(y * 0.18 + st.tear * 1.6) * 2, y);
      for (let y = Y(-62); y >= y0; y -= 6) g.lineTo(x0 + w / 2 + Math.sin(y * 0.18 + st.tear * 1.6 + 1) * 2, y);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const yy = y0 + ((k * 22 + st.tear * 7) % 66) + 6;
        g.beginPath(); g.moveTo(x0 - w * 0.15, yy); g.lineTo(x0 - w * 0.15, yy + 8); g.stroke();
      }
      g.strokeStyle = 'rgba(60,140,210,0.8)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x0 - w / 2, y0); g.lineTo(x0 - w / 2, Y(-62)); g.moveTo(x0 + w / 2, y0); g.lineTo(x0 + w / 2, Y(-62)); g.stroke();
    }
  }
  if (E.tear) drawDrop(g, eyes[0].cx - ew * 0.45, eyes[0].cy + eh * 0.35, 4.5);

  // mouth
  let mouth = E.mouth;
  if (st.talk) mouth = TALK_MOUTH[mouth] || mouth;
  drawMouth(g, mouth, X(0), Y(-21));

  if (E.sweat) drawDrop(g, X(37), Y(16), 7.5);
  if (E.vein) drawVein(g, X(-33), Y(24));
  if (look.glasses) drawGlasses(g, eyes, ew, eh, st.glint);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  return `#${c.multiplyScalar(k).getHexString()}`;
}

function drawEye(g, type, cx, cy, w, h, side, iris, gx, gy, E, fem) {
  g.strokeStyle = LINE; g.fillStyle = LINE;
  const lw = fem ? 4.2 : 3.6;
  switch (type) {
    case 'closed': {
      g.lineWidth = lw * 0.85;
      g.beginPath(); g.moveTo(cx - w / 2, cy + h * 0.05); g.quadraticCurveTo(cx, cy + h * 0.32, cx + w / 2, cy + h * 0.05); g.stroke();
      if (fem) { g.lineWidth = 2; g.beginPath(); const ox = cx + side * w / 2; g.moveTo(ox, cy + h * 0.05); g.lineTo(ox + side * 4, cy - 2); g.stroke(); }
      return;
    }
    case 'happy': {
      g.lineWidth = lw * 1.05;
      g.beginPath(); g.moveTo(cx - w / 2, cy + h * 0.15); g.quadraticCurveTo(cx, cy - h * 0.48, cx + w / 2, cy + h * 0.15); g.stroke();
      return;
    }
    case 'squeeze': {
      g.lineWidth = lw;
      const s = -side; // viewer-left eye shows '>' , viewer-right '<'
      g.beginPath(); g.moveTo(cx - s * w * 0.45, cy - h * 0.3); g.lineTo(cx + s * w * 0.35, cy + h * 0.02); g.lineTo(cx - s * w * 0.45, cy + h * 0.32); g.stroke();
      return;
    }
    case 'spiral': {
      g.lineWidth = 2.6;
      g.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.2) { const r = (a / (Math.PI * 5)) * w * 0.5; const x = cx + Math.cos(a * side) * r, y = cy + Math.sin(a * side) * r * 1.1; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      return;
    }
    case 'shock': {
      g.fillStyle = '#ffffff'; g.lineWidth = 2.6;
      g.beginPath(); g.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = LINE; g.beginPath(); g.arc(cx + gx * 2, cy - gy * 2, 2.8, 0, Math.PI * 2); g.fill();
      return;
    }
    case 'heart': {
      g.save(); g.translate(cx, cy + 1); g.scale(w / 34, w / 34);
      heartPath(g); g.fillStyle = '#ff4a78'; g.fill(); g.lineWidth = 2.6; g.strokeStyle = '#8a1d36'; g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(-7, -5, 3.5, 2.5, -0.6, 0, Math.PI * 2); g.fill();
      g.restore();
      return;
    }
    default: break;
  }
  // open eye variants
  let lidIn = -0.06, lidOut = -0.1, lidC = -0.98, lower = E.lower || 0, dx = gx, dy = gy, sparkle = !!E.sparkle;
  if (type === 'half') { lidIn = -0.02; lidOut = 0.02; lidC = -0.14; }
  else if (type === 'sleepy') { lidIn = 0.1; lidOut = 0.14; lidC = 0.02; dy -= 0.5; }
  else if (type === 'angry') { lidIn = 0.12; lidOut = -0.3; lidC = -0.62; }
  else if (type === 'sad') { lidIn = -0.42; lidOut = 0.06; lidC = -0.72; }
  else if (type === 'narrow') { lidIn = -0.04; lidOut = -0.08; lidC = -0.22; lower = 0.28; }
  else if (type === 'determined') { lidIn = 0.02; lidOut = -0.26; lidC = -0.8; }
  else if (type === 'shy') { dx = gx * 0.4 - 0.45 * side * 0; dy = -0.7; lower = 0.12; sparkle = true; }
  const inner = -side; // direction toward the nose in canvas x
  const xIn = cx + inner * w / 2, xOut = cx - inner * w / 2;
  const yIn = cy + lidIn * h, yOut = cy + lidOut * h, yC = cy + lidC * h;

  g.save();
  g.beginPath(); g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#fffdfb'; g.fillRect(cx - w, cy - h, w * 2, h * 2);
  // iris
  const ix = cx + dx * w * 0.17, iy = cy + h * 0.06 - dy * h * 0.1;
  const rx = w * 0.37, ry = h * 0.43;
  const gr = g.createLinearGradient(0, iy - ry, 0, iy + ry);
  gr.addColorStop(0, shade(iris, 0.35)); gr.addColorStop(0.55, iris); gr.addColorStop(1, shade(iris, 1.7));
  g.fillStyle = gr; g.beginPath(); g.ellipse(ix, iy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = shade(iris, 0.25); g.beginPath(); g.ellipse(ix, iy - ry * 0.05, rx * 0.5, ry * 0.55, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = shade(iris, 0.3); g.lineWidth = 1.4; g.beginPath(); g.ellipse(ix, iy, rx, ry, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(ix - rx * 0.32, iy - ry * 0.4, rx * 0.42, ry * 0.3, -0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(ix + rx * 0.35, iy + ry * 0.38, rx * 0.17, 0, Math.PI * 2); g.fill();
  if (sparkle) star(g, ix + rx * 0.1, iy - ry * 0.05, 3.2);
  // upper lid: cover above the lid curve with skin
  g.fillStyle = g.canvas.__skin || '#ffe3cf';
  g.beginPath(); g.moveTo(xIn, yIn); g.quadraticCurveTo(cx, yC, xOut, yOut); g.lineTo(xOut, cy - h); g.lineTo(xIn, cy - h); g.closePath(); g.fill();
  if (lower > 0) { g.beginPath(); g.moveTo(cx - w / 2, cy + h * 0.5); g.quadraticCurveTo(cx, cy + h * (0.5 - lower * 2.2), cx + w / 2, cy + h * 0.5); g.lineTo(cx + w / 2, cy + h); g.lineTo(cx - w / 2, cy + h); g.closePath(); g.fill(); }
  g.restore();
  // lash line along the lid
  g.strokeStyle = LINE; g.lineWidth = fem ? 4.6 : 3.8;
  g.beginPath(); g.moveTo(xIn, yIn); g.quadraticCurveTo(cx, yC, xOut, yOut); g.stroke();
  if (fem) { g.lineWidth = 2.6; g.beginPath(); g.moveTo(xOut, yOut); g.lineTo(xOut - inner * 4.5, yOut - 4); g.stroke(); }
  // lower lash
  g.lineWidth = 1.6; g.strokeStyle = 'rgba(60,35,30,0.7)';
  g.beginPath(); g.moveTo(cx - w * 0.22, cy + h * 0.47); g.quadraticCurveTo(cx, cy + h * 0.53, cx + w * 0.22, cy + h * 0.47); g.stroke();
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; const rr = i % 2 ? r * 0.35 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
export function heartPath(g) {
  g.beginPath();
  g.moveTo(0, 12);
  g.bezierCurveTo(-4, 8, -16, 2, -16, -6);
  g.bezierCurveTo(-16, -13, -8, -16, 0, -9);
  g.bezierCurveTo(8, -16, 16, -13, 16, -6);
  g.bezierCurveTo(16, 2, 4, 8, 0, 12);
  g.closePath();
}

function drawBrow(g, type, cx, by, w, side, color) {
  // side: -1 = viewer-left eye. inner end is toward the centre.
  const inner = -side;
  const half = w * 0.42;
  let yIn = 0, yOut = 0, arch = -3, dyAll = 0;
  switch (type) {
    case 'up': dyAll = -3; arch = -4; break;
    case 'high': dyAll = -7; arch = -5; break;
    case 'angry': yIn = 6; yOut = -4; arch = -1; break;
    case 'determined': yIn = 4; yOut = -3; arch = -1; break;
    case 'sad': case 'worried': yIn = -5; yOut = 3; arch = -1; break;
    case 'relaxed': dyAll = 2; arch = -1.5; break;
    case 'smug': if (side > 0) { dyAll = -5; arch = -4; } else { yIn = 2; } break;
    case 'suspicious': if (side < 0) { yIn = 5; yOut = 0; dyAll = 2; arch = 0; } else { dyAll = -4; arch = -3; } break;
    default: break;
  }
  const x1 = cx + inner * half * 0.9, x2 = cx - inner * half;
  g.strokeStyle = color; g.lineWidth = 3.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, by + yIn + dyAll); g.quadraticCurveTo(cx, by + arch + dyAll + (yIn + yOut) / 2, x2, by + yOut + dyAll); g.stroke();
}

function drawMouth(g, type, mx, my) {
  g.strokeStyle = LINE; g.lineWidth = 2.6; g.lineCap = 'round';
  const fillOpen = (path, tongue = true) => {
    g.fillStyle = '#7a2630'; path(); g.fill();
    if (tongue) { g.save(); path(); g.clip(); g.fillStyle = '#f27a8a'; g.beginPath(); g.ellipse(mx, my + 9, 8, 5, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    path(); g.stroke();
  };
  switch (type) {
    case 'small': g.beginPath(); g.moveTo(mx - 5, my); g.quadraticCurveTo(mx, my + 2.5, mx + 5, my); g.stroke(); break;
    case 'smile': g.beginPath(); g.moveTo(mx - 9, my - 2); g.quadraticCurveTo(mx, my + 7, mx + 9, my - 2); g.stroke(); break;
    case 'talkSmile': fillOpen(() => { g.beginPath(); g.moveTo(mx - 8, my - 2); g.quadraticCurveTo(mx, my - 1, mx + 8, my - 2); g.quadraticCurveTo(mx, my + 10, mx - 8, my - 2); g.closePath(); }); break;
    case 'grin': fillOpen(() => { g.beginPath(); g.moveTo(mx - 11, my - 3); g.lineTo(mx + 11, my - 3); g.quadraticCurveTo(mx + 10, my + 11, mx, my + 11); g.quadraticCurveTo(mx - 10, my + 11, mx - 11, my - 3); g.closePath(); }); break;
    case 'grinBig': fillOpen(() => { g.beginPath(); g.moveTo(mx - 12, my - 4); g.lineTo(mx + 12, my - 4); g.quadraticCurveTo(mx + 11, my + 14, mx, my + 14); g.quadraticCurveTo(mx - 11, my + 14, mx - 12, my - 4); g.closePath(); }); break;
    case 'O': fillOpen(() => { g.beginPath(); g.ellipse(mx, my + 2, 6, 8, 0, 0, Math.PI * 2); }, false); break;
    case 'smallO': fillOpen(() => { g.beginPath(); g.ellipse(mx, my + 1, 3.4, 4, 0, 0, Math.PI * 2); }, false); break;
    case 'yawn': fillOpen(() => { g.beginPath(); g.ellipse(mx, my + 4, 9, 13, 0, 0, Math.PI * 2); }); break;
    case 'wail': fillOpen(() => { g.beginPath(); g.moveTo(mx - 13, my - 5); g.quadraticCurveTo(mx, my - 9, mx + 13, my - 5); g.quadraticCurveTo(mx + 9, my + 15, mx, my + 15); g.quadraticCurveTo(mx - 9, my + 15, mx - 13, my - 5); g.closePath(); }); break;
    case 'talk': fillOpen(() => { g.beginPath(); g.ellipse(mx, my + 1.5, 5.5, 4.5, 0, 0, Math.PI * 2); }); break;
    case 'frown': g.beginPath(); g.moveTo(mx - 8, my + 3); g.quadraticCurveTo(mx, my - 5, mx + 8, my + 3); g.stroke(); break;
    case 'flat': g.beginPath(); g.moveTo(mx - 7, my); g.lineTo(mx + 7, my); g.stroke(); break;
    case 'flatSlant': g.beginPath(); g.moveTo(mx - 7, my + 1.5); g.lineTo(mx + 6, my - 2); g.stroke(); break;
    case 'firm': g.beginPath(); g.moveTo(mx - 8, my + 1); g.quadraticCurveTo(mx, my - 1.5, mx + 8, my + 1); g.stroke(); break;
    case 'smirk': g.beginPath(); g.moveTo(mx - 8, my + 1); g.quadraticCurveTo(mx + 1, my + 4, mx + 9, my - 4); g.stroke(); break;
    case 'nervous': case 'wavy': {
      g.beginPath(); g.moveTo(mx - 10, my);
      for (let i = 1; i <= 6; i++) g.lineTo(mx - 10 + i * (20 / 6), my + (i % 2 ? -2.6 : 2.2));
      g.stroke(); break;
    }
    case 'wavyOpen': fillOpen(() => { g.beginPath(); g.moveTo(mx - 9, my - 1); for (let i = 1; i <= 6; i++) g.lineTo(mx - 9 + i * 3, my - 1 + (i % 2 ? -2.2 : 1.8)); g.quadraticCurveTo(mx, my + 10, mx - 9, my - 1); g.closePath(); }, false); break;
    case 'teeth': {
      g.fillStyle = '#ffffff'; roundRect(g, mx - 11, my - 5, 22, 10, 3); g.fill(); g.stroke();
      g.lineWidth = 1.4; g.beginPath(); g.moveTo(mx - 10, my); g.lineTo(mx + 10, my);
      for (const ox of [-5, 0, 5]) { g.moveTo(mx + ox, my - 5); g.lineTo(mx + ox, my + 5); }
      g.stroke(); break;
    }
    case 'cat': g.beginPath(); g.moveTo(mx - 8, my - 1); g.quadraticCurveTo(mx - 4, my + 5, mx, my); g.quadraticCurveTo(mx + 4, my + 5, mx + 8, my - 1); g.stroke(); break;
    default: g.beginPath(); g.moveTo(mx - 5, my); g.lineTo(mx + 5, my); g.stroke();
  }
}

function drawDrop(g, x, y, r) {
  g.save(); g.translate(x, y);
  g.beginPath(); g.moveTo(0, -r * 1.8); g.quadraticCurveTo(r * 1.1, -r * 0.2, r, r * 0.4); g.arc(0, r * 0.4, r, 0, Math.PI); g.quadraticCurveTo(-r * 1.1, -r * 0.2, 0, -r * 1.8); g.closePath();
  g.fillStyle = '#a8dcff'; g.fill(); g.strokeStyle = '#3d7fc4'; g.lineWidth = 1.8; g.stroke();
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(-r * 0.35, r * 0.2, r * 0.22, r * 0.4, 0.3, 0, Math.PI * 2); g.fill();
  g.restore();
}
function drawVein(g, x, y) {
  g.strokeStyle = '#e0303a'; g.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const ox = Math.cos(a) * 6, oy = Math.sin(a) * 6;
    g.beginPath(); g.moveTo(x + ox + Math.cos(a + 1.2) * 5, y + oy + Math.sin(a + 1.2) * 5); g.quadraticCurveTo(x + ox * 0.4, y + oy * 0.4, x + ox + Math.cos(a - 1.2) * 5, y + oy + Math.sin(a - 1.2) * 5); g.stroke();
  }
}
function drawGlasses(g, eyes, ew, eh, glint) {
  for (const e of eyes) {
    const w = ew * 1.32, h = eh * 0.98;
    if (glint) {
      const gr = g.createLinearGradient(e.cx - w / 2, e.cy - h / 2, e.cx + w / 2, e.cy + h / 2);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#cfe8ff');
      g.fillStyle = gr; roundRect(g, e.cx - w / 2, e.cy - h / 2, w, h, 6); g.fill();
      g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 3;
      g.save(); roundRect(g, e.cx - w / 2, e.cy - h / 2, w, h, 6); g.clip();
      g.strokeStyle = 'rgba(170,205,240,0.9)'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(e.cx - w * 0.5, e.cy + h * 0.1); g.lineTo(e.cx + w * 0.1, e.cy - h * 0.6); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.moveTo(e.cx - w * 0.1, e.cy + h * 0.5); g.lineTo(e.cx + w * 0.5, e.cy - h * 0.2); g.stroke();
      g.restore();
    } else {
      g.save(); roundRect(g, e.cx - w / 2, e.cy - h / 2, w, h, 6); g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(e.cx + w * 0.15, e.cy - h * 0.55); g.lineTo(e.cx + w * 0.55, e.cy - h * 0.05); g.stroke();
      g.restore();
    }
  }
}
