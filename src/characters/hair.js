// Hair styles, glasses and head accessories (head-bone local). One merged mesh per style key plus
// optional swinging pieces (ponytail, twin tails, braid, long hair) driven by spring bones.
import * as THREE from 'three';
import { Builder, M, sphere, cone, torus, capsuleAB, lathe, cyl, box } from './geo.js';
import { shapePoint, HEAD, facePoint } from './head.js';
import { SLOT } from './toon.js';

export const HAIR_STYLES = ['short', 'buzz', 'messy', 'sidepart', 'curtain', 'bob', 'ponytail', 'twintails', 'long', 'bun', 'braid', 'combover', 'bald'];
const D2R = Math.PI / 180;
const C = new THREE.Vector3(...HEAD.C);

export function dirAE(az, el, out = new THREE.Vector3()) {
  const a = az * D2R, e = el * D2R;
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}
export function sp(az, el, extra = 0) { return shapePoint(dirAE(az, el), new THREE.Vector3(), extra); }

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
function interp(table, x) {
  x = Math.abs(x);
  for (let i = 1; i < table.length; i++) if (x <= table[i][0]) { const [x0, y0] = table[i - 1], [x1, y1] = table[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return table[table.length - 1][1];
}

/** Hair cap: a shell around the skull; outside the coverage it sinks under the scalp. */
function addCap(B, line, { thick = 0.024, slot = SLOT.hair, bald = null } = {}) {
  const g = new THREE.SphereGeometry(1, 44, 32);
  const P = g.attributes.position;
  const d = new THREE.Vector3(), out = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    d.fromBufferAttribute(P, i).normalize();
    const el = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) / D2R;
    const az = Math.atan2(d.x, -d.z) / D2R;
    const ln = line(az);
    let c = smooth(ln - 5, ln + 3, el);
    if (bald != null) c *= 1 - smooth(bald - 4, bald + 4, el);
    c = Math.max(0, Math.min(1, c));
    shapePoint(d, out, -0.03 + (0.03 + thick) * c);
    P.setXYZ(i, out.x, out.y, out.z);
  }
  g.computeVertexNormals();
  B.add(g, { slot, outline: 1 });
}

/** Flattened cone lock from surface point a (wide base) to b (tip). */
function lock(B, a, b, width, { thin = 0.42, bow = 0.25, slot = SLOT.hair, outline = 1, seg = 6 } = {}) {
  const A = sp(a[0], a[1], a[2] ?? 0.03), Bp = sp(b[0], b[1], b[2] ?? 0.014);
  const axis = new THREE.Vector3().subVectors(Bp, A);
  const len = axis.length();
  axis.normalize();
  const n = new THREE.Vector3().addVectors(A, Bp).multiplyScalar(0.5).sub(C).normalize();
  const z = n.clone().addScaledVector(axis, -n.dot(axis)).normalize();
  const x = new THREE.Vector3().crossVectors(axis, z).normalize();
  const basis = new THREE.Matrix4().makeBasis(x, axis, z);
  basis.setPosition(new THREE.Vector3().addVectors(A, Bp).multiplyScalar(0.5));
  const g = new THREE.ConeGeometry(1, 1, seg, 2);
  // the cone apex is +Y: base at -0.5 → A, apex at +0.5 → B
  const pre = M([0, 0, 0], [0, 0, 0], [width / 2, len, (width / 2) * thin]);
  B.add(g, {
    m: basis, pre, slot, outline,
    deform: (v) => { v.z += bow * (0.25 - v.y * v.y) * 2.2; },
  });
}

function glasses(B) {
  const ring = (fx) => {
    const p = facePoint(fx, 1, 0.03);
    const n = p.clone().sub(C).normalize();
    const g = new THREE.TorusGeometry(1, 0.075, 4, 20);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), n);
    const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(0.05, 0.043, 0.05));
    B.add(g, { m, slot: SLOT.frame, outline: 0, smooth: false });
    return p;
  };
  const pl = ring(-20), pr = ring(20);
  // bridge
  const br = facePoint(0, 5, 0.034);
  let c = capsuleAB([pl.x - 0.035, pl.y + 0.008, pl.z], [br.x, br.y, br.z], 0.0035, 2, 4);
  B.add(c.g, { m: c.m, slot: SLOT.frame, outline: 0 });
  c = capsuleAB([br.x, br.y, br.z], [pr.x + 0.035, pr.y + 0.008, pr.z], 0.0035, 2, 4);
  B.add(c.g, { m: c.m, slot: SLOT.frame, outline: 0 });
  // temples to the ears
  for (const [p, sx] of [[pl, 1], [pr, -1]]) {
    const s = new THREE.Vector3(p.x + sx * 0.045, p.y + 0.005, p.z + 0.01);
    c = capsuleAB([s.x, s.y, s.z], [sx * 0.2, 0.17, 0.03], 0.004, 2, 4);
    B.add(c.g, { m: c.m, slot: SLOT.frame, outline: 0 });
  }
}

const capLines = {
  boy: [[0, 30], [45, 24], [80, 4], [100, -12], [130, -30], [180, -42]],
  girl: [[0, 32], [45, 22], [80, -6], [110, -26], [140, -40], [180, -48]],
  buzz: [[0, 34], [50, 26], [85, 8], [110, -10], [140, -26], [180, -36]],
  bob: [[0, 32], [45, 18], [70, -20], [100, -50], [180, -60]],
  up: [[0, 32], [45, 24], [80, 4], [110, -14], [140, -26], [180, -32]],
};

const cache = new Map();
/**
 * @returns {{geo: THREE.BufferGeometry, swings: Array<{pos:number[], geo:THREE.BufferGeometry, stiff:number, rest:number[]}>}}
 */
export function hairGeometry(style, gender, { accessory = 'none', glasses: hasGlasses = false, cap = false } = {}) {
  if (!HAIR_STYLES.includes(style)) style = 'short';
  const key = `${style}|${gender}|${accessory}|${hasGlasses ? 1 : 0}|${cap ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const B = new Builder();
  const swings = [];
  const L = (t) => (az) => interp(t, az);

  const boyBangs = (n = 7, len = 26, spread = 50) => {
    for (let i = 0; i < n; i++) {
      const az = -spread + (2 * spread * i) / (n - 1);
      const tilt = (i % 2 ? 5 : -4) + az * 0.12;
      lock(B, [az * 0.85, 50, 0.03], [az + tilt, 50 - len - (i % 2 ? 5 : 0) + Math.abs(az) * 0.05, 0.012], 0.095, { bow: 0.35, thin: 0.5 });
    }
  };
  const girlBangs = (n = 9, len = 32, spread = 52) => {
    for (let i = 0; i < n; i++) {
      const az = -spread + (2 * spread * i) / (n - 1);
      lock(B, [az * 0.8, 52, 0.03], [az * 1.05, 52 - len - (i % 2 ? 4 : 0) + Math.abs(az) * 0.08, 0.012], 0.09, { bow: 0.4, thin: 0.5 });
    }
  };
  const sideLocks = (len = 40, w = 0.06) => {
    for (const sx of [-1, 1]) {
      lock(B, [sx * 60, 26, 0.03], [sx * 66, 26 - len, 0.03], w * 1.2, { bow: 0.35, thin: 0.55 });
      lock(B, [sx * 76, 18, 0.03], [sx * 82, 18 - len * 0.9, 0.032], w * 1.1, { bow: 0.3, thin: 0.55 });
    }
  };
  // crown volume: a few soft tufts so the silhouette is not a perfect sphere
  const crown = () => {
    for (const [az, el] of [[150, 40], [-150, 40], [180, 20], [120, 15], [-120, 15], [90, 45], [-90, 45]]) lock(B, [az, el + 14, 0.016], [az, el - 12, 0.026], 0.12, { bow: 0.4, thin: 0.45 });
  };

  switch (style) {
    case 'buzz':
      addCap(B, L(capLines.buzz), { thick: 0.01 });
      break;
    case 'bald':
      break;
    case 'combover': {
      addCap(B, (az) => (Math.abs(az) < 70 ? 60 : interp(capLines.boy, az)), { thick: 0.016, bald: 24 });
      // strands combed across the bald top
      for (let i = 0; i < 5; i++) {
        const z = -0.07 + i * 0.035;
        const r = Math.sqrt(Math.max(0.001, 0.203 * 0.203 - z * z));
        const g = new THREE.TorusGeometry(1, 0.03, 3, 20, Math.PI * 0.62);
        const m = M([0.0, HEAD.C[1] - 0.002, z], [0, 0, Math.PI * 0.2 + i * 0.05], [r, r * 0.95, 0.35]);
        B.add(g, { m, slot: SLOT.hair, outline: 0.5, smooth: false });
      }
      break;
    }
    case 'messy': {
      addCap(B, L(capLines.boy), { thick: 0.034 });
      boyBangs(8, 26, 52);
      const spikes = [[-120, 30], [-150, 20], [180, 35], [150, 18], [120, 32], [-80, 45], [80, 48], [-30, 70], [30, 66], [0, 80], [-170, 55], [100, 20]];
      for (const [az, el] of spikes) lock(B, [az, el, 0.0], [az + 12, el + 10, 0.07], 0.08, { bow: 0.1, thin: 0.6 });
      lock(B, [10, 85, 0.0], [-20, 82, 0.11], 0.035, { bow: 0.9, thin: 0.6 }); // ahoge
      sideLocks(22, 0.05);
      break;
    }
    case 'sidepart': {
      addCap(B, L(capLines.boy));
      crown();
      for (let i = 0; i < 6; i++) {
        const az = -40 + i * 15;
        lock(B, [az - 18, 52], [az + 22, 18 - (i % 2) * 3, 0.014], 0.1, { bow: 0.35 });
      }
      lock(B, [-35, 62, 0.01], [10, 50, 0.04], 0.12, { bow: 0.4, thin: 0.5 });
      sideLocks(gender === 'f' ? 50 : 20, 0.055);
      break;
    }
    case 'curtain': {
      addCap(B, L(gender === 'f' ? capLines.girl : capLines.boy));
      crown();
      for (const sx of [-1, 1]) {
        lock(B, [sx * 4, 54], [sx * 32, 12, 0.014], 0.09, { bow: 0.45 });
        lock(B, [sx * 16, 52], [sx * 46, 8, 0.016], 0.09, { bow: 0.45 });
        lock(B, [sx * 30, 50], [sx * 60, 4, 0.02], 0.085, { bow: 0.4 });
      }
      sideLocks(gender === 'f' ? 52 : 26, 0.055);
      break;
    }
    case 'bob': {
      addCap(B, L(capLines.bob));
      // blunt fringe
      for (let i = 0; i < 9; i++) { const az = -48 + i * 12; lock(B, [az, 50], [az, 13, 0.012], 0.085, { bow: 0.3, thin: 0.5 }); }
      // side/back curtain
      const g = lathe([[0.23, HEAD.C[1] + 0.03], [0.235, HEAD.C[1] - 0.06], [0.215, HEAD.C[1] - 0.15], [0.19, HEAD.C[1] - 0.17]], 26, Math.PI + 1.25, Math.PI * 2 - 2.5);
      B.add(g, { m: M([0, 0, 0.012], [0, 0, 0], [1, 1, 0.98]), slot: SLOT.hair, outline: 1 });
      for (const sx of [-1, 1]) lock(B, [sx * 66, 10, 0.02], [sx * 70, -40, 0.03], 0.07, { bow: 0.25 });
      break;
    }
    case 'long': case 'ponytail': case 'twintails': case 'bun': case 'braid': {
      const up = style !== 'long';
      addCap(B, L(up ? capLines.up : capLines.girl));
      if (!up) crown();
      girlBangs();
      sideLocks(style === 'long' ? 58 : style === 'braid' ? 40 : 46, 0.055);
      if (style === 'long') {
        const g = lathe([[0.205, 0.05], [0.2, -0.05], [0.19, -0.16], [0.2, -0.28], [0.175, -0.34]], 20, -Math.PI * 0.36, Math.PI * 0.72);
        const P = g.attributes.position;
        for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < -0.33) P.setY(i, y - ((i % 2) * 0.03)); }
        g.computeVertexNormals();
        swings.push({ pos: [0, HEAD.C[1] - 0.02, 0.0], geo: g, pre: M([0, 0, 0.01], [0, 0, 0], [1, 1, 0.82]), stiff: 22, rest: [0, -1, 0.05], range: 0.35 });
      } else if (style === 'ponytail') {
        const p = sp(180, 20, 0.0);
        B.add(torus(0.032, 0.012, 6, 12), { m: M([p.x, p.y, p.z + 0.012], [0.3, 0, 0]), slot: SLOT.acc, outline: 0.5 });
        const g = lathe([[0.001, 0.02], [0.04, 0.0], [0.058, -0.07], [0.05, -0.17], [0.025, -0.27], [0.001, -0.31]], 12);
        swings.push({ pos: [p.x, p.y, p.z + 0.02], geo: g, pre: M([0, 0, 0.02], [0, 0, 0], [1, 1, 0.8]), stiff: 16, rest: [0, -1, 0.35], range: 0.9 });
      } else if (style === 'twintails') {
        for (const sx of [-1, 1]) {
          const p = sp(sx * 112, 18, 0.0);
          B.add(torus(0.028, 0.011, 6, 12), { m: M([p.x + sx * 0.01, p.y, p.z], [0, 0, sx * 1.2]), slot: SLOT.acc, outline: 0.5 });
          const g = lathe([[0.001, 0.02], [0.035, 0.0], [0.052, -0.08], [0.045, -0.2], [0.02, -0.3], [0.001, -0.34]], 12);
          swings.push({ pos: [p.x + sx * 0.02, p.y, p.z], geo: g, pre: M([0, 0, 0], [0, 0, 0], [0.85, 1, 0.85]), stiff: 15, rest: [sx * 0.35, -1, 0.15], range: 0.9 });
        }
      } else if (style === 'bun') {
        const p = sp(180, 48, 0.03);
        B.add(sphere(14, 10), { m: M([p.x, p.y, p.z], [0, 0, 0], [0.072, 0.068, 0.068]), slot: SLOT.hair, outline: 1 });
        B.add(torus(0.05, 0.01, 6, 14), { m: M([p.x, p.y - 0.03, p.z - 0.02], [Math.PI / 2 + 0.6, 0, 0]), slot: SLOT.acc, outline: 0 });
      } else if (style === 'braid') {
        const p = sp(180, -10, 0.0);
        const g = new Builder();
        for (let i = 0; i < 6; i++) {
          const r = 0.034 - i * 0.003;
          g.add(sphere(10, 8), { m: M([(i % 2 ? 1 : -1) * 0.006, -0.025 - i * 0.042, 0], [0, 0, (i % 2 ? 1 : -1) * 0.3], [r, r * 1.3, r]), slot: SLOT.hair });
        }
        g.add(torus(0.016, 0.007, 5, 10), { m: M([0, -0.27, 0], [Math.PI / 2, 0, 0]), slot: SLOT.acc, outline: 0 });
        g.add(cone(0.022, 0.05, 7), { m: M([0, -0.3, 0], [Math.PI, 0, 0]), slot: SLOT.hair });
        swings.push({ pos: [p.x, p.y, p.z + 0.01], built: g.build(), stiff: 14, rest: [0, -1, 0.25], range: 0.9 });
      }
      break;
    }
    default: { // short
      addCap(B, L(gender === 'f' ? capLines.girl : capLines.boy));
      crown();
      if (gender === 'f') { girlBangs(); sideLocks(36, 0.055); } else { boyBangs(); sideLocks(20, 0.05); }
      lock(B, [170, 60, 0.0], [150, 66, 0.05], 0.05, { bow: 0.3, thin: 0.6 });
    }
  }

  // accessories
  if (accessory === 'hairclip') {
    const p = sp(-38, 30, 0.03);
    B.add(box(0.05, 0.014, 0.012), { m: M([p.x, p.y, p.z], [0, -0.6, 0.5]), slot: SLOT.acc, outline: 0 });
    B.add(sphere(8, 6), { m: M([p.x - 0.012, p.y + 0.012, p.z - 0.012], [0, 0, 0], 0.014), slot: SLOT.acc, outline: 0 });
  } else if (accessory === 'headband') {
    const g = new THREE.TorusGeometry(1, 0.06, 5, 26, Math.PI * 1.05);
    B.add(g, { m: M([0, HEAD.C[1] + 0.0, 0.0], [-0.35, 0, -Math.PI * 0.025], [0.224, 0.208, 0.22]), pre: M([0, 0, 0], [Math.PI / 2, 0, 0]), slot: SLOT.acc, outline: 0.4 });
  } else if (accessory === 'earbuds') {
    for (const sx of [-1, 1]) {
      B.add(sphere(8, 6), { m: M([sx * 0.205, 0.15, 0.0], [0, 0, 0], 0.017), slot: SLOT.white, outline: 0 });
      const c = capsuleAB([sx * 0.205, 0.14, 0.0], [sx * 0.07, -0.08, -0.04], 0.003, 2, 4);
      B.add(c.g, { m: c.m, slot: SLOT.white, outline: 0 });
    }
  }
  if (hasGlasses) glasses(B);
  if (cap) { // janitor cap
    B.add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), { m: M([0, HEAD.C[1] + 0.02, 0.01], [-0.12, 0, 0], [0.222, 0.2, 0.218]), slot: SLOT.acc, outline: 1 });
    B.add(cyl(1, 1, 1, 20), { m: M([0, HEAD.C[1] + 0.045, -0.19], [-0.25, 0, 0], [0.13, 0.008, 0.1]), slot: SLOT.acc, outline: 0.5 });
  }

  const res = {
    geo: B.pos.length ? B.build() : null,
    swings: swings.map((s) => {
      if (s.built) return { pos: s.pos, geo: s.built, stiff: s.stiff, rest: s.rest, range: s.range };
      const b = new Builder();
      b.add(s.geo, { m: s.pre || new THREE.Matrix4(), slot: SLOT.hair, outline: 1 });
      return { pos: s.pos, geo: b.build(), stiff: s.stiff, rest: s.rest, range: s.range };
    }),
  };
  cache.set(key, res);
  return res;
}
