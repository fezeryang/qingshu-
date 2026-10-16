// Procedural props. Geometry and materials are shared between instances (clone a material before
// mutating it). Each prop carries userData.prop (name) and userData.grip (hand offset).
import * as THREE from 'three';
import { BALL_RADIUS } from '../core/layout.js';
import { toonMaterial } from './toon.js';
import { heartPath } from './face.js';

export const PROPS = ['letterBall', 'letterOpen', 'replyNote', 'chalk', 'thermos', 'book', 'phone', 'snack', 'confetti', 'redChalk', 'dustpan', 'broom', 'basketball', 'megaphone', 'pencil'];
const shared = new Map();
const once = (key, fn) => { if (!shared.has(key)) shared.set(key, fn()); return shared.get(key); };
const tex = (w, h, draw) => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
};
const mat = (key, opts) => once(`mat:${key}`, () => toonMaterial(opts));
const RX = -Math.PI / 2;

function paperTexture(lines = true) {
  return once(`paperTex:${lines}`, () => tex(256, 320, (g, w, h) => {
    g.fillStyle = '#fffaf2'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,214,226,0.35)'; g.fillRect(0, 0, w, 26);
    if (lines) {
      g.strokeStyle = 'rgba(120,160,220,0.45)'; g.lineWidth = 1.5;
      for (let y = 48; y < h - 10; y += 22) { g.beginPath(); g.moveTo(12, y); g.lineTo(w - 12, y); g.stroke(); }
      g.strokeStyle = 'rgba(230,110,140,0.85)'; g.lineWidth = 2.2;
      for (let row = 0; row < 9; row++) {
        const y = 44 + row * 22; const len = row === 8 ? 90 : 170 + ((row * 37) % 50);
        g.beginPath(); g.moveTo(22, y);
        for (let x = 22; x < 22 + len; x += 6) g.lineTo(x, y - 4 - Math.sin(x * 0.7 + row) * 4 - ((x * 13 + row * 7) % 5));
        g.stroke();
      }
    }
    g.save(); g.translate(w - 40, h - 40); g.scale(1.2, 1.2); heartPath(g); g.fillStyle = '#ff4f7a'; g.fill(); g.restore();
  }));
}

function crumpledGeometry() {
  return once('geo:ball', () => {
    const g = new THREE.IcosahedronGeometry(BALL_RADIUS, 2);
    const P = g.attributes.position;
    const dirs = [[0.3, 0.8, 0.5, 9.1, 0.2], [-0.7, 0.2, 0.68, 13.7, 1.3], [0.5, -0.6, 0.6, 7.3, 2.1], [0.9, 0.1, -0.4, 17.9, 0.7], [-0.2, -0.9, -0.3, 11.3, 2.9], [0.1, 0.3, -0.95, 21.1, 0.4]];
    const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).normalize();
      let n = 0;
      for (const [x, y, z, f, ph] of dirs) n += Math.sin((v.x * x + v.y * y + v.z * z) * f + ph);
      const r = BALL_RADIUS * (1 + 0.075 * n);
      P.setXYZ(i, v.x * r, v.y * r, v.z * r);
    }
    g.computeVertexNormals();
    return g;
  });
}

function letterGeometry() {
  return once('geo:letter', () => {
    const g = new THREE.PlaneGeometry(0.17, 0.22, 10, 12);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i);
      const fold = Math.abs(((y + 0.11) / 0.0733) % 2 - 1) - 0.5; // two horizontal folds (tri-fold)
      const vfold = Math.abs(x) < 0.001 ? 0 : -Math.abs(x) * 0.04;
      const crumple = Math.sin(x * 140 + y * 60) * 0.0012 + Math.sin(x * 47 - y * 133) * 0.0012;
      P.setZ(i, fold * 0.008 + vfold + crumple);
    }
    g.computeVertexNormals();
    return g;
  });
}

function heartShapeGeometry(size) {
  return once(`geo:heart:${size}`, () => {
    const s = new THREE.Shape();
    const k = size / 32;
    s.moveTo(0, -12 * k);
    s.bezierCurveTo(-4 * k, -8 * k, -16 * k, -2 * k, -16 * k, 6 * k);
    s.bezierCurveTo(-16 * k, 13 * k, -8 * k, 16 * k, 0, 9 * k);
    s.bezierCurveTo(8 * k, 16 * k, 16 * k, 13 * k, 16 * k, 6 * k);
    s.bezierCurveTo(16 * k, -2 * k, 4 * k, -8 * k, 0, -12 * k);
    return new THREE.ShapeGeometry(s, 6);
  });
}

function group(name, ...children) { const g = new THREE.Group(); g.add(...children); return g; }
const mesh = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; return o; };

export function createProp(name, opts = {}) {
  let o;
  let grip = null;
  switch (name) {
    case 'letterBall':
      o = mesh(crumpledGeometry(), once('mat:ball', () => { return toonMaterial({ map: paperTexture(true) }); }));
      grip = { pos: [-0.03, -0.035, -0.008], rot: [0, 0, 0] };
      break;
    case 'letterOpen': {
      o = mesh(letterGeometry(), mat('letter', { map: paperTexture(true), side: THREE.DoubleSide }));
      grip = { pos: [-0.02, -0.06, -0.02], rot: [0, -Math.PI / 2, 0], both: { pos: [0, 0.07, -0.01], rot: [0, 0, 0] } };
      break;
    }
    case 'replyNote': {
      const t = once('tex:reply', () => tex(128, 96, (g, w, h) => {
        g.fillStyle = '#ffd3e0'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(220,90,130,0.6)'; g.lineWidth = 2; g.strokeRect(4, 4, w - 8, h - 8);
        g.save(); g.translate(w / 2, h / 2); g.scale(1.3, 1.3); heartPath(g); g.fillStyle = '#ff3d6e'; g.fill(); g.restore();
      }));
      const geo = once('geo:reply', () => {
        const g = new THREE.PlaneGeometry(0.075, 0.055, 4, 2);
        const P = g.attributes.position;
        for (let i = 0; i < P.count; i++) P.setZ(i, -Math.abs(P.getX(i)) * 0.25);
        g.computeVertexNormals();
        return g;
      });
      o = mesh(geo, mat('reply', { map: t, side: THREE.DoubleSide }));
      grip = { pos: [0, -0.055, -0.012], rot: [0, -Math.PI / 2, 0] };
      break;
    }
    case 'chalk': case 'redChalk': {
      const geo = once('geo:chalk', () => new THREE.CylinderGeometry(0.0055, 0.0058, 0.065, 8));
      o = mesh(geo, mat(name, { color: name === 'chalk' ? 0xf7f7f2 : 0xe8434b }));
      grip = { pos: [0, -0.045, -0.014], rot: [0.2, 0, 0] };
      break;
    }
    case 'pencil': {
      const body = mesh(once('geo:pencil', () => new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6)), mat('pencil', { color: 0xf2c230 }));
      const tip = mesh(once('geo:pencilTip', () => new THREE.ConeGeometry(0.004, 0.016, 6)), mat('pencilTip', { color: 0xe8c9a0 }));
      tip.position.y = -0.068; tip.rotation.x = Math.PI;
      o = group('pencil', body, tip);
      grip = { pos: [0, -0.03, -0.015], rot: [-0.9, 0, 0] };
      break;
    }
    case 'thermos': {
      const body = mesh(once('geo:thermos', () => new THREE.LatheGeometry([[0.001, 0], [0.033, 0.002], [0.035, 0.02], [0.035, 0.17], [0.03, 0.185], [0.001, 0.186]].map(([x, y]) => new THREE.Vector2(x, y)), 18)), mat('thermos', { color: 0x9fb4bf }));
      const cap = mesh(once('geo:thermosCap', () => new THREE.CylinderGeometry(0.031, 0.033, 0.045, 18)), mat('thermosCap', { color: 0x2f5f4f }));
      cap.position.y = 0.205;
      const band = mesh(once('geo:thermosBand', () => new THREE.CylinderGeometry(0.0365, 0.0365, 0.02, 18)), mat('thermosBand', { color: 0x2f5f4f }));
      band.position.y = 0.05;
      o = group('thermos', body, cap, band);
      o.children.forEach((c) => { c.position.y -= 0.1; });
      grip = { pos: [-0.036, -0.012, 0], rot: [RX, 0, 0] };
      break;
    }
    case 'book': {
      const cover = once('tex:book', () => tex(256, 320, (g, w, h) => {
        g.fillStyle = '#3a72c4'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#f4f0e4'; g.fillRect(28, 60, w - 56, 110);
        g.fillStyle = '#2a3d66'; g.font = 'bold 64px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('数学', w / 2, 116);
        g.fillStyle = '#f2c94c'; g.beginPath(); g.arc(w / 2, 240, 34, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#2a3d66'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2 - 50, 280); g.quadraticCurveTo(w / 2, 180, w / 2 + 50, 280); g.stroke();
      }));
      const ms = [mat('bookPages', { color: 0xf3eedd }), mat('bookPages', { color: 0xf3eedd }), mat('bookCover', { map: cover }), mat('bookBack', { color: 0x3a72c4 }), mat('bookPages', { color: 0xf3eedd }), mat('bookSpine', { color: 0x2d5ea8 })];
      o = new THREE.Mesh(once('geo:book', () => new THREE.BoxGeometry(0.17, 0.022, 0.23)), ms);
      o.castShadow = true;
      grip = { pos: [-0.028, -0.05, 0], rot: [0, 0, Math.PI / 2] };
      break;
    }
    case 'phone': {
      const screen = once('tex:phone', () => tex(128, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd1e3'); gr.addColorStop(1, '#c9e2ff');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) { const left = i % 2 === 0; g.fillStyle = left ? '#ffffff' : '#7ee07a'; const bw = 50 + ((i * 23) % 30); g.fillRect(left ? 10 : w - 10 - bw, 30 + i * 36, bw, 22); }
      }));
      const body = mesh(once('geo:phone', () => new THREE.BoxGeometry(0.068, 0.008, 0.14)), mat('phoneBody', { color: 0x2a2c34 }));
      const scr = new THREE.Mesh(once('geo:phoneScreen', () => new THREE.PlaneGeometry(0.06, 0.128)), once('mat:phoneScreen', () => new THREE.MeshBasicMaterial({ map: screen })));
      scr.rotation.x = RX; scr.position.y = 0.0045;
      o = group('phone', body, scr);
      grip = { pos: [-0.02, -0.035, -0.01], rot: [0, 0, Math.PI / 2] };
      break;
    }
    case 'snack': {
      const t = once('tex:snack', () => tex(128, 160, (g, w, h) => {
        g.fillStyle = '#ff8a2a'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(w / 2, h * 0.62, 34, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c0281f'; g.fillRect(0, 0, w, 22); g.fillRect(0, h - 22, w, 22);
        g.fillStyle = '#ffffff'; g.font = 'bold 34px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('薯片', w / 2, h * 0.32);
      }));
      const geo = once('geo:snack', () => {
        const g = new THREE.BoxGeometry(0.1, 0.14, 0.03, 4, 6, 2);
        const P = g.attributes.position;
        for (let i = 0; i < P.count; i++) { const y = P.getY(i) / 0.07; P.setZ(i, P.getZ(i) * (1 - 0.85 * y * y)); P.setX(i, P.getX(i) * (1 + 0.06 * Math.cos(y * 3))); }
        g.computeVertexNormals();
        return g;
      });
      o = mesh(geo, mat('snack', { map: t }));
      grip = { pos: [0, -0.08, 0], rot: [0, Math.PI / 2, 0] };
      break;
    }
    case 'confetti': {
      const n = Math.max(4, Math.min(200, opts.count ?? 70));
      const im = new THREE.InstancedMesh(heartShapeGeometry(0.03), once('mat:confetti', () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff })), n);
      const cols = [0xff4f7a, 0xff8fb0, 0xffffff, 0xffc2d4, 0xf7f0e6];
      const pieces = [];
      const spread = opts.spread ?? 0.35;
      for (let i = 0; i < n; i++) {
        im.setColorAt(i, new THREE.Color(cols[i % cols.length]));
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
        pieces.push({
          p: new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 0.15, Math.sin(a) * r),
          p0: null, vy: -(0.25 + Math.random() * 0.25), ph: Math.random() * 6.28, sw: 0.15 + Math.random() * 0.2,
          rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin: (Math.random() - 0.5) * 8,
        });
      }
      pieces.forEach((pc) => { pc.p0 = pc.p.clone(); });
      im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      o = im;
      o.userData.confetti = { pieces, floorY: opts.floorY ?? 0.005, t: 0, falling: opts.fall !== false };
      o.userData.reset = () => { o.userData.confetti.t = 0; pieces.forEach((pc) => pc.p.copy(pc.p0)); };
      updateConfetti(o, 0);
      break;
    }
    case 'dustpan': {
      const m = mat('dustpan', { color: 0x3d8fc9, side: THREE.DoubleSide });
      const tray = mesh(once('geo:dpTray', () => new THREE.BoxGeometry(0.25, 0.008, 0.2)), m);
      const back = mesh(once('geo:dpBack', () => new THREE.BoxGeometry(0.25, 0.07, 0.008)), m); back.position.set(0, 0.035, 0.1);
      const sideG = once('geo:dpSide', () => new THREE.BoxGeometry(0.008, 0.07, 0.2));
      const l = mesh(sideG, m); l.position.set(-0.125, 0.035, 0); const r = mesh(sideG, m); r.position.set(0.125, 0.035, 0);
      const handle = mesh(once('geo:dpHandle', () => new THREE.CylinderGeometry(0.01, 0.01, 0.6, 8)), mat('handle', { color: 0x2f5f8a })); handle.position.set(0, 0.32, 0.12);
      o = group('dustpan', tray, back, l, r, handle);
      grip = { pos: [0, 0, 0.5], rot: [RX, 0, 0] };
      break;
    }
    case 'broom': {
      const handle = mesh(once('geo:broomHandle', () => new THREE.CylinderGeometry(0.012, 0.012, 1.0, 8)), mat('broomHandle', { color: 0x9a6b3a })); handle.position.y = 0.7;
      const geo = once('geo:broomHead', () => { const g = new THREE.ConeGeometry(0.15, 0.32, 10, 1, false); g.scale(1, 1, 0.35); return g; });
      const head = mesh(geo, mat('broomHead', { color: 0xc8a14a })); head.position.y = 0.16; head.rotation.x = Math.PI;
      const tie = mesh(once('geo:broomTie', () => new THREE.CylinderGeometry(0.03, 0.035, 0.04, 10)), mat('broomTie', { color: 0xb03a2a })); tie.position.y = 0.32;
      o = group('broom', handle, head, tie);
      grip = { pos: [0, -0.02, 0.85], rot: [RX, 0, 0] };
      break;
    }
    case 'basketball': {
      const t = once('tex:bball', () => tex(256, 128, (g, w, h) => {
        g.fillStyle = '#e8762c'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#2a1a12'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
        for (const x of [w / 4, (3 * w) / 4]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.12, h * 0.5, 0, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.ellipse(0, h / 2, w * 0.12, h * 0.5, 0, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.ellipse(w, h / 2, w * 0.12, h * 0.5, 0, 0, Math.PI * 2); g.stroke();
      }));
      o = mesh(once('geo:bball', () => new THREE.SphereGeometry(0.12, 24, 16)), mat('bball', { map: t }));
      grip = { pos: [-0.13, -0.04, 0], rot: [0, 0, 0] };
      break;
    }
    case 'megaphone': {
      const horn = mesh(once('geo:megaHorn', () => new THREE.CylinderGeometry(0.11, 0.035, 0.28, 18, 1, true)), mat('megaHorn', { color: 0xf3f3f0, side: THREE.DoubleSide }));
      horn.rotation.x = Math.PI; horn.position.y = 0.14;
      const band = mesh(once('geo:megaBand', () => new THREE.CylinderGeometry(0.112, 0.105, 0.03, 18, 1, true)), mat('megaBand', { color: 0xd8343e, side: THREE.DoubleSide }));
      band.position.y = 0.27;
      const handle = mesh(once('geo:megaHandle', () => new THREE.BoxGeometry(0.03, 0.1, 0.04)), mat('megaHandle', { color: 0x333338 }));
      handle.position.set(0, 0.08, 0.06);
      o = group('megaphone', horn, band, handle);
      grip = { pos: [0, -0.05, 0.07], rot: [RX, 0, 0] };
      break;
    }
    default: {
      if (name !== 'card') console.warn(`[characters] unknown prop "${name}"`);
      o = mesh(once('geo:card', () => new THREE.BoxGeometry(0.1, 0.004, 0.14)), mat('card', { color: 0xf5f2ea }));
    }
  }
  o.name = name;
  o.userData.prop = name;
  if (grip) o.userData.grip = grip;
  return o;
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _w = new THREE.Vector3();
/** Flutter confetti pieces down toward floorY (world). Called by the module updater with game dt. */
export function updateConfetti(o, dt) {
  const C = o.userData.confetti;
  if (!C) return;
  C.t += dt;
  o.updateWorldMatrix(true, false);
  const baseY = o.matrixWorld.elements[13];
  const sy = Math.hypot(o.matrixWorld.elements[4], o.matrixWorld.elements[5], o.matrixWorld.elements[6]) || 1;
  C.pieces.forEach((pc, i) => {
    const landed = baseY + pc.p.y * sy <= C.floorY;
    if (C.falling && !landed && dt > 0) {
      pc.p.y += pc.vy * dt;
      pc.p.x += Math.sin(C.t * 2.2 + pc.ph) * pc.sw * dt;
      pc.p.z += Math.cos(C.t * 1.7 + pc.ph) * pc.sw * 0.6 * dt;
      pc.rot.x += pc.spin * dt; pc.rot.y += pc.spin * 0.7 * dt;
      if (baseY + pc.p.y * sy < C.floorY) pc.p.y = (C.floorY - baseY) / sy;
    } else if (landed) { pc.rot.x = -Math.PI / 2; }
    _q.setFromEuler(pc.rot);
    _m4.compose(_p.copy(pc.p), _q, _s);
    o.setMatrixAt(i, _m4);
  });
  void _w;
  o.instanceMatrix.needsUpdate = true;
}
