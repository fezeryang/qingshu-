// Body proportions, skeleton layout and the skinned body geometry (one draw call per character).
import * as THREE from 'three';
import { Builder, M, sphere, capsuleAB, lathe, cyl, cone, torus, box } from './geo.js';
import { SLOT } from './toon.js';

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'forearmL', 'handL', 'indexL',
  'shoulderR', 'upperArmR', 'forearmR', 'handR', 'indexR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
export const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
export const PARENT = {
  spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', upperArmL: 'shoulderL', forearmL: 'upperArmL', handL: 'forearmL', indexL: 'handL',
  shoulderR: 'chest', upperArmR: 'shoulderR', forearmR: 'upperArmR', handR: 'forearmR', indexR: 'handR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
};

const KID = {
  hipsY: 0.77, spine: 0.08, chest: 0.10, neck: 0.12, headOff: 0.035,
  shoulderX: 0.07, shoulderY: 0.115, armX: 0.065,
  upperArm: 0.175, forearm: 0.155, hand: 0.07,
  thighX: 0.08, thighY: -0.03, thigh: 0.27, shin: 0.40, ankle: 0.07,
  torsoW: 0.14, torsoD: 0.74, headR: 0.2, headScale: 1.1,
  rUpper: 0.044, rFore: 0.04, rThigh: 0.066, rShin: 0.055, handS: 1, pelvisDrop: 0.09,
};
const ADULT = {
  hipsY: 0.90, spine: 0.10, chest: 0.12, neck: 0.16, headOff: 0.04,
  shoulderX: 0.08, shoulderY: 0.13, armX: 0.08,
  upperArm: 0.22, forearm: 0.19, hand: 0.08,
  thighX: 0.09, thighY: -0.03, thigh: 0.33, shin: 0.47, ankle: 0.07,
  torsoW: 0.165, torsoD: 0.72, headR: 0.2, headScale: 1.08,
  rUpper: 0.05, rFore: 0.045, rThigh: 0.075, rShin: 0.062, handS: 1.12, pelvisDrop: 0.1,
};

/** Dimensions for a body variant. */
export function proportions(adult, build, gender) {
  const D = { ...(adult ? ADULT : KID), adult, build, gender };
  const bw = build === 'slim' ? 0.9 : build === 'sturdy' ? 1.2 : 1;
  const lw = build === 'slim' ? 0.9 : build === 'sturdy' ? 1.14 : 1;
  D.torsoW *= bw * (gender === 'f' ? 0.94 : 1);
  D.torsoD *= build === 'sturdy' ? 1.08 : 1;
  D.shoulderX += build === 'sturdy' ? 0.012 : build === 'slim' ? -0.006 : 0;
  if (gender === 'f') D.shoulderX -= 0.006;
  for (const k of ['rUpper', 'rFore', 'rThigh', 'rShin']) D[k] *= lw;
  D.offsets = {
    hips: [0, D.hipsY, 0], spine: [0, D.spine, 0], chest: [0, D.chest, 0], neck: [0, D.neck, 0], head: [0, D.headOff, 0],
    shoulderL: [-D.shoulderX, D.shoulderY, 0], upperArmL: [-D.armX, 0, 0], forearmL: [0, -D.upperArm, 0], handL: [0, -D.forearm, 0], indexL: [0, -0.052 * D.handS, -0.02 * D.handS],
    shoulderR: [D.shoulderX, D.shoulderY, 0], upperArmR: [D.armX, 0, 0], forearmR: [0, -D.upperArm, 0], handR: [0, -D.forearm, 0], indexR: [0, -0.052 * D.handS, -0.02 * D.handS],
    thighL: [-D.thighX, D.thighY, 0], shinL: [0, -D.thigh, 0], footL: [0, -D.shin, 0],
    thighR: [D.thighX, D.thighY, 0], shinR: [0, -D.thigh, 0], footR: [0, -D.shin, 0],
  };
  D.rest = {};
  for (const b of BONES) {
    const o = D.offsets[b];
    const p = PARENT[b] ? D.rest[PARENT[b]] : [0, 0, 0];
    D.rest[b] = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
  }
  D.armLen = D.upperArm + D.forearm;
  D.legLen = D.thigh + D.shin;
  return D;
}

// ---------------------------------------------------------------------------------------------
const cache = new Map();

/** shape: 'jacket'|'shirt'|'suit'|'sweater'|'coat'; bottom: 'pants'|'skirt'. */
export function bodyGeometry(D, shape, bottom, extras = {}) {
  const key = `${D.adult}|${D.build}|${D.gender}|${shape}|${bottom}|${extras.whistle ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const B = new Builder({ skinned: true });
  const R = D.rest;
  const at = (bone, pos = [0, 0, 0], rot = [0, 0, 0], s = 1) => M([R[bone][0] + pos[0], R[bone][1] + pos[1], R[bone][2] + pos[2]], rot, s);
  const W = D.torsoW, dz = D.torsoD;
  const hy = R.hips[1], sy = R.spine[1], cy = R.chest[1], ny = R.neck[1];

  // torso weights blend hips → spine → chest by height
  const torsoW = (v) => {
    const y = v.y;
    const a0 = hy + 0.03, a1 = sy + 0.03, b1 = cy + 0.04;
    if (y <= a0) return [BI.hips, 1];
    if (y <= a1) { const t = (y - a0) / (a1 - a0); return [BI.hips, 1 - t, BI.spine, t]; }
    if (y <= b1) { const t = (y - a1) / (b1 - a1); return [BI.spine, 1 - t, BI.chest, t]; }
    return [BI.chest, 1];
  };

  const longHem = shape === 'coat' ? 0.15 : shape === 'suit' ? 0.075 : 0.035;
  const flare = shape === 'coat' ? 1.18 : 1.06;
  const prof = [
    [W * 0.3, hy - longHem - 0.005], [W * flare, hy - longHem], [W * 1.04, hy + 0.03], [W * 0.97, hy + 0.1 * (D.adult ? 1.15 : 1)],
    [W * 1.07, cy + 0.02], [W * 1.02, cy + 0.085 * (D.adult ? 1.1 : 1)], [W * 0.66, ny - 0.006], [W * 0.4, ny + 0.012],
  ];
  // radius of the jacket at height y (for front details)
  const rAt = (y) => {
    for (let i = 1; i < prof.length; i++) {
      if (y <= prof[i][1]) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; return r0 + (r1 - r0) * ((y - y0) / (y1 - y0)); }
    }
    return prof[prof.length - 1][0];
  };
  B.add(lathe(prof.slice(1), 20), { m: M([0, 0, 0], [0, 0, 0], [1, 1, dz]), slot: SLOT.top, weights: torsoW });
  // pelvis / trousers seat
  const pelvisProf = [[0.0001, hy - D.pelvisDrop - 0.02], [W * 0.6, hy - D.pelvisDrop - 0.012], [W * 0.92, hy - D.pelvisDrop + 0.03], [W * 1.0, hy - 0.01], [W * 0.98, hy + 0.05]];
  B.add(lathe(pelvisProf, 16), { m: M([0, 0, 0.005], [0, 0, 0], [1, 1, dz * 1.08]), slot: SLOT.bottom, bone: BI.hips });

  // front line helper: thin capsules hugging the front of the torso from y0 to y1
  const frontStrip = (y0, y1, x, r, slot, n = 4, lift = 0.002) => {
    for (let i = 0; i < n; i++) {
      const ya = y0 + ((y1 - y0) * i) / n, yb = y0 + ((y1 - y0) * (i + 1)) / n;
      const za = -Math.sqrt(Math.max(0, rAt(ya) ** 2 - x * x)) * dz - lift, zb = -Math.sqrt(Math.max(0, rAt(yb) ** 2 - x * x)) * dz - lift;
      const { g, m } = capsuleAB([x, ya, za], [x, yb, zb], r, 2, 6);
      B.add(g, { m, slot, weights: torsoW, outline: 0 });
    }
  };

  if (shape === 'jacket') {
    B.add(torus(W * 0.5, 0.017, 6, 18), { m: M([0, ny - 0.004, 0], [Math.PI / 2, 0, 0], [1, 1 / dz * dz, 1]), pre: M([0, 0, 0], [0, 0, 0], [1, dz * 1.1, 1]), slot: SLOT.topAccent, bone: BI.chest, outline: 0.6 });
    frontStrip(hy - longHem + 0.005, ny - 0.02, 0, 0.006, SLOT.topAccent, 5);
    B.add(torus(W * flare * 0.99, 0.01, 4, 20), { m: M([0, hy - longHem + 0.012, 0], [Math.PI / 2, 0, 0], [1, dz, 1]), slot: SLOT.topAccent, bone: BI.hips, outline: 0 });
    if (extras.whistle) {
      B.add(torus(W * 0.62, 0.004, 4, 16, Math.PI), { m: M([0, ny - 0.01, -W * 0.15], [Math.PI * 0.62, 0, Math.PI], [1, 1, 1]), slot: SLOT.tie, bone: BI.chest, outline: 0 });
      B.add(cyl(0.012, 0.012, 0.035, 8), { m: M([0, cy + 0.0, -rAt(cy) * dz - 0.012], [0, 0, Math.PI / 2]), slot: SLOT.acc, bone: BI.chest, outline: 0 });
    }
  } else if (shape === 'shirt') {
    for (const sx of [-1, 1]) {
      B.add(cone(0.03, 0.06, 3), { m: M([sx * 0.03, ny - 0.03, -rAt(ny - 0.03) * dz - 0.006], [Math.PI * 0.95, 0, sx * 0.5], [1, 1, 0.3]), slot: SLOT.topAccent, bone: BI.chest, outline: 0 });
    }
    B.add(sphere(8, 6), { m: M([0, ny - 0.035, -rAt(ny - 0.035) * dz - 0.008], [0, 0, 0], [0.016, 0.016, 0.01]), slot: SLOT.tie, bone: BI.chest, outline: 0 });
    tieBlade(B, rAt, dz, ny - 0.045, hy + 0.04, torsoW);
    B.add(torus(W * 1.0, 0.012, 4, 20), { m: M([0, hy + 0.04, 0.005], [Math.PI / 2, 0, 0], [1, dz * 1.08, 1]), slot: SLOT.dark, bone: BI.hips, outline: 0 });
    B.add(box(0.045, 0.05, 0.006), { m: M([-W * 0.5, cy + 0.03, -rAt(cy + 0.03) * dz * 0.92], [0.12, 0.45, 0]), slot: SLOT.topAccent, bone: BI.chest, outline: 0 });
  } else if (shape === 'suit') {
    // shirt "V" bib + tie + buttons
    B.add(cone(W * 0.42, 0.17, 3), { m: M([0, ny - 0.09, -rAt(ny - 0.09) * dz + 0.004], [Math.PI, Math.PI, 0], [1, 1, 0.25]), slot: SLOT.shirt, bone: BI.chest, outline: 0 });
    B.add(sphere(8, 6), { m: M([0, ny - 0.03, -rAt(ny - 0.03) * dz - 0.006], [0, 0, 0], [0.014, 0.014, 0.01]), slot: SLOT.tie, bone: BI.chest, outline: 0 });
    tieBlade(B, rAt, dz, ny - 0.04, cy - 0.01, torsoW, 0.6);
    for (const y of [hy + 0.06, hy + 0.12]) B.add(sphere(6, 4), { m: M([0, y, -rAt(y) * dz - 0.002], [0, 0, 0], 0.009), slot: SLOT.dark, weights: torsoW, outline: 0 });
    B.add(torus(W * 0.48, 0.016, 6, 18), { m: M([0, ny - 0.002, 0.004], [Math.PI / 2, 0, 0], [1, dz * 1.1, 1]), slot: SLOT.top, bone: BI.chest, outline: 0.5 });
  } else if (shape === 'sweater') {
    B.add(torus(W * 0.48, 0.014, 6, 18), { m: M([0, ny - 0.002, 0], [Math.PI / 2, 0, 0], [1, dz * 1.1, 1]), slot: SLOT.shirt, bone: BI.chest, outline: 0.5 });
    B.add(torus(W * flare * 0.98, 0.016, 4, 20), { m: M([0, hy - longHem + 0.014, 0], [Math.PI / 2, 0, 0], [1, dz, 1]), slot: SLOT.topAccent, bone: BI.hips, outline: 0 });
  } else if (shape === 'coat') {
    B.add(torus(W * 0.5, 0.018, 6, 18), { m: M([0, ny - 0.004, 0], [Math.PI / 2, 0, 0], [1, dz * 1.1, 1]), slot: SLOT.topAccent, bone: BI.chest, outline: 0.5 });
    frontStrip(hy - longHem + 0.01, ny - 0.03, 0, 0.005, SLOT.topAccent, 5);
    for (const sx of [-1, 1]) B.add(box(0.06, 0.055, 0.008), { m: M([sx * W * 0.55, hy - 0.05, -rAt(hy - 0.05) * dz * 0.95], [0.1, -sx * 0.5, 0]), slot: SLOT.topAccent, bone: BI.hips, outline: 0 });
  }

  // ---- arms
  for (const side of ['L', 'R']) {
    const sx = side === 'R' ? 1 : -1;
    const ua = `upperArm${side}`, fa = `forearm${side}`, hd = `hand${side}`, ix = `index${side}`;
    B.add(sphere(12, 8), { m: at(ua, [0, -0.01, 0], [0, 0, 0], D.rUpper * 1.06), slot: SLOT.top, bone: BI[ua] });
    let c = capsuleAB([0, 0, 0], [0, -D.upperArm, 0], D.rUpper, 3, 10);
    B.add(c.g, { m: at(ua), pre: c.m, slot: SLOT.top, bone: BI[ua], outline: 0.7 });
    c = capsuleAB([0, 0.0, 0], [0, -D.forearm + 0.02, 0], D.rFore, 3, 10);
    B.add(c.g, { m: at(fa), pre: c.m, slot: SLOT.top, bone: BI[fa], outline: 0.7 });
    B.add(cyl(D.rFore * 1.1, D.rFore * 1.12, 0.026, 12), { m: at(fa, [0, -D.forearm + 0.022, 0]), slot: shape === 'suit' ? SLOT.shirt : SLOT.topAccent, bone: BI[fa], outline: 0.4 });
    if (shape === 'jacket') {
      for (const oz of [-0.011, 0.011]) {
        c = capsuleAB([sx * D.rUpper * 0.93, -0.01, oz], [sx * D.rUpper * 0.93, -D.upperArm, oz], 0.0045, 2, 5);
        B.add(c.g, { m: at(ua), pre: c.m, slot: SLOT.topAccent, bone: BI[ua], outline: 0 });
        c = capsuleAB([sx * D.rFore * 0.93, 0, oz], [sx * D.rFore * 0.93, -D.forearm + 0.01, oz], 0.0042, 2, 5);
        B.add(c.g, { m: at(fa), pre: c.m, slot: SLOT.topAccent, bone: BI[fa], outline: 0 });
      }
    }
    // mitten hand: palm faces the body, thumb forward (-Z)
    const hs = D.handS;
    B.add(sphere(12, 10), { m: at(hd, [0, -0.04 * hs, -0.002], [0, 0, 0], [0.026 * hs, 0.044 * hs, 0.037 * hs]), slot: SLOT.skin, bone: BI[hd], outline: 0.5 });
    c = capsuleAB([-sx * 0.006, -0.018 * hs, -0.026 * hs], [-sx * 0.012, -0.045 * hs, -0.04 * hs], 0.0115 * hs, 3, 6);
    B.add(c.g, { m: at(hd), pre: c.m, slot: SLOT.skin, bone: BI[hd], outline: 0.4 });
    c = capsuleAB([0, 0, 0], [0, -0.04 * hs, 0], 0.0105 * hs, 3, 6);
    B.add(c.g, { m: at(ix), pre: c.m, slot: SLOT.skin, bone: BI[ix], outline: 0.4 });
  }

  // ---- legs
  const skirt = bottom === 'skirt';
  for (const side of ['L', 'R']) {
    const sx = side === 'R' ? 1 : -1;
    const th = `thigh${side}`, sh = `shin${side}`, ft = `foot${side}`;
    let c = capsuleAB([0, 0.01, 0], [0, -D.thigh, 0], skirt ? D.rThigh * 0.82 : D.rThigh, 3, 10);
    B.add(c.g, { m: at(th), pre: c.m, slot: skirt ? SLOT.skin : SLOT.bottom, bone: BI[th], outline: 0.6 });
    if (skirt) {
      c = capsuleAB([0, 0, 0], [0, -D.shin * 0.42, 0], D.rShin * 0.86, 3, 10);
      B.add(c.g, { m: at(sh), pre: c.m, slot: SLOT.skin, bone: BI[sh], outline: 0.5 });
      c = capsuleAB([0, -D.shin * 0.4, 0], [0, -D.shin + 0.03, 0], D.rShin * 0.92, 3, 10);
      B.add(c.g, { m: at(sh), pre: c.m, slot: SLOT.sock, bone: BI[sh], outline: 0.5 });
    } else {
      c = capsuleAB([0, 0, 0], [0, -D.shin + 0.03, 0], D.rShin, 3, 10);
      B.add(c.g, { m: at(sh), pre: c.m, slot: SLOT.bottom, bone: BI[sh], outline: 0.5 });
      B.add(cyl(D.rShin * 1.08, D.rShin * 1.16, 0.05, 12), { m: at(sh, [0, -D.shin + 0.06, 0]), slot: SLOT.bottom, bone: BI[sh], outline: 0.4 });
      if (shape === 'jacket') {
        c = capsuleAB([sx * D.rThigh * 0.96, -0.02, 0], [sx * D.rThigh * 0.96, -D.thigh, 0], 0.0055, 2, 5);
        B.add(c.g, { m: at(th), pre: c.m, slot: SLOT.bottomAccent, bone: BI[th], outline: 0 });
        c = capsuleAB([sx * D.rShin * 0.97, 0, 0], [sx * D.rShin * 1.05, -D.shin + 0.05, 0], 0.005, 2, 5);
        B.add(c.g, { m: at(sh), pre: c.m, slot: SLOT.bottomAccent, bone: BI[sh], outline: 0 });
      }
    }
    // shoe (ankle is the foot bone origin; sole at -ankle)
    const a = D.ankle;
    B.add(sphere(14, 10), { m: at(ft, [0, -a * 0.45, -0.035], [0, 0, 0], [0.05, a * 0.62, 0.098]), slot: SLOT.shoe, bone: BI[ft], outline: 0.6 });
    B.add(cyl(1, 1, 1, 14), { m: at(ft, [0, -a + 0.008, -0.036], [0, 0, 0], [0.052, 0.018, 0.1]), slot: SLOT.sole, bone: BI[ft], outline: 0.3 });
  }

  if (skirt) {
    const top = hy + 0.05, bot = hy - (D.adult ? 0.3 : 0.22);
    const segs = 28;
    const prof2 = [[W * 0.98, top], [W * 1.12, hy - 0.02], [W * 1.42, bot]];
    const g = lathe(prof2, segs);
    // pleats: alternate radius on every other column
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const col = Math.floor(i / prof2.length);
      const k = col % 2 ? 1.05 : 0.97;
      const y = P.getY(i);
      const f = (top - y) / (top - bot);
      P.setX(i, P.getX(i) * (1 + (k - 1) * f)); P.setZ(i, P.getZ(i) * (1 + (k - 1) * f));
    }
    g.computeVertexNormals();
    const wts = (v) => {
      const low = Math.min(1, Math.max(0, (hy - 0.01 - v.y) / (hy - 0.01 - bot)));
      const front = THREE.MathUtils.smoothstep(-v.z, -0.04, 0.12);
      const f = low * (0.15 + 0.8 * front);
      const t = THREE.MathUtils.smoothstep(v.x, -0.06, 0.06);
      return [BI.hips, 1 - f, BI.thighL, f * (1 - t), BI.thighR, f * t];
    };
    B.add(g, { m: M([0, 0, 0.005], [0, 0, 0], [1, 1, dz * 1.12]), slot: SLOT.bottom, weights: wts, outline: 0.8 });
    B.add(torus(W * 1.4, 0.006, 4, 28), { m: M([0, bot + 0.008, 0.005], [Math.PI / 2, 0, 0], [1, dz * 1.12, 1]), slot: SLOT.bottomAccent, weights: wts, outline: 0 });
  }

  const geo = B.build();
  cache.set(key, geo);
  return geo;
}

function tieBlade(B, rAt, dz, y0, y1, torsoW, widthK = 1) {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const ya = y0 + ((y1 - y0) * i) / n, yb = y0 + ((y1 - y0) * (i + 1)) / n;
    const za = -rAt(ya) * dz - 0.006, zb = -rAt(yb) * dz - 0.006;
    const wa = (0.012 + (0.02 * i) / n) * widthK, wb = (0.012 + (0.02 * (i + 1)) / n) * widthK;
    const g = new THREE.CylinderGeometry(wa, wb, Math.hypot(yb - ya, zb - za) * 1.05, 4, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, yb - ya, zb - za).normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, (ya + yb) / 2, (za + zb) / 2), q, new THREE.Vector3(1, 1, 0.3));
    B.add(g, { m, pre: M([0, 0, 0], [0, Math.PI / 4, 0]), slot: SLOT.tie, weights: torsoW, outline: 0 });
  }
  // tip
  const g = new THREE.ConeGeometry(0.032 * widthK * 0.72, 0.03, 4);
  B.add(g, { m: M([0, y1 - 0.012, -rAt(y1) * dz - 0.006], [Math.PI, Math.PI / 4, 0], [1, 1, 0.3]), slot: SLOT.tie, weights: torsoW, outline: 0 });
}
