// Procedural animation clips: each clip is fn(P, t, c) writing joint rotations / IK targets for
// time t (seconds). Conventions (root space, character faces -Z, its right hand is +X):
//   spine/chest/neck/head  x<0 bend forward / look down, y>0 turn left, z>0 tilt toward own left
//   arms: x>0 raise forward, `out` = abduction (mirrored), elbow>0 bends; legs: lift>0 forward, knee>0 bends
import { DESK } from '../core/layout.js';

const { sin, cos, PI, min, max, abs } = Math;
const TAU = PI * 2;
const cl = (x, a = 0, b = 1) => min(b, max(a, x));
const ss = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const oB = (t) => { t = cl(t); const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const inQ = (t) => cl(t) ** 2;
const outQ = (t) => 1 - (1 - cl(t)) ** 2;
/** envelope: 0 → 1 between a0..a1 (ease `ei`), 1 → 0 between r0..r1 */
const env = (t, a0, a1, r0, r1, ei = null) => {
  if (t < a0) return 0;
  if (t < a1) { const u = (t - a0) / (a1 - a0); return ei ? ei(u) : u * u * (3 - 2 * u); }
  if (t < r0 || r1 == null) return 1;
  if (t < r1) { const u = (t - r0) / (r1 - r0); return 1 - u * u * (3 - 2 * u); }
  return 0;
};
/** keyframes [[t, v, ease?], ...] */
const kf = (t, keys) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t <= t1) { const [t0, v0] = keys[i - 1]; const u = (t - t0) / (t1 - t0); const k = e ? e(u) : u * u * (3 - 2 * u); return v0 + (v1 - v0) * k; }
  }
  return keys[keys.length - 1][1];
};
const lerp = (a, b, k) => a + (b - a) * k;
const SIDES = ['L', 'R'];
const sg = (side) => (side === 'R' ? 1 : -1);
const DESK_Y = DESK.topY;

// ------------------------------------------------------------------ base postures
export function basePose(P, c) {
  P.noIK();
  for (let i = 0; i < P.p.rot.length; i++) P.p.rot[i] = 0;
  P.tilt(0, 0, 0, 0);
  P.face(null).talk(false).glint(false);
  P.point('L', 0).point('R', 0);
  if (c.seated) {
    P.hips(0, c.seatHips, 0.03);
    P.r('spine', -0.1, 0, 0).r('chest', -0.06, 0, 0).r('neck', 0.08, 0, 0).r('head', 0.03, 0, 0);
    for (const s of SIDES) {
      P.leg(s, 1.45, 0.06, 1.45);
      P.ikS(s, 'foot', 0.095 * c.s, c.D.ankle * c.s, -0.29 * c.s + 0.03, 1);
      P.arm(s, 0.9, 0.25, 1.2);
      P.ikS(s, 'hand', 0.11 * c.s, DESK_Y + 0.05, -0.245 - 0.02 * c.s, 1);
      P.hand(s, 0.15, 1.35, 0);
    }
  } else {
    P.hips(c.off[0], c.lm.hipsY, c.off[1]);
    for (const s of SIDES) { P.arm(s, 0.06, 0.13, 0.16); P.hand(s, 0, 0.2, 0); }
  }
}

// landmarks in root space for a posture
export function landmarks(D, s, seated) {
  const hipsY = seated ? 0.44 + D.pelvisDrop * s : D.hipsY * s;
  const chestY = hipsY + (D.spine + D.chest) * s;
  return {
    hipsY, chestY,
    shY: chestY + D.shoulderY * s,
    shX: (D.shoulderX + D.armX) * s,
    headY: chestY + (D.neck + D.headOff + 0.18 * D.headScale) * s,
    armLen: (D.upperArm + D.forearm) * s,
  };
}

// helpers for common gestures --------------------------------------------------------------
const handsOnDesk = (P, c, w = 1) => { for (const s of SIDES) P.ikS(s, 'hand', 0.11 * c.s, DESK_Y + 0.05, -0.265, w); };
const lookTarget = (c, side) => {
  // unit direction (root space) from the shoulder to the look target, defaults to forward
  if (!c.look) return [0, 0.05, -1];
  const sx = sg(side) * c.lm.shX;
  let x = c.look.x - sx, y = c.look.y - c.lm.shY, z = c.look.z;
  const l = Math.hypot(x, y, z) || 1;
  x /= l; y /= l; z /= l;
  if (z > -0.15) { z = -0.15; }
  return [x, y, z];
};
const reachToward = (P, c, side, k = 0.98, w = 1) => {
  const d = lookTarget(c, side);
  const L = c.lm.armLen * k;
  P.ikS(side, 'hand', 0, 0, 0, 0); // reset pole defaults
  P.ik(`hand${side}`, sg(side) * c.lm.shX + d[0] * L, c.lm.shY + d[1] * L, d[2] * L, w, [sg(side) * 0.6, -0.8, 0.2]);
};

// ------------------------------------------------------------------ clip table
export const CLIPS = {
  idle: {
    dur: 8, loop: true,
    fn(P, t, c) {
      const sw = sin((t * TAU) / 8);
      P.hipsA(sw * 0.01, 0, 0).a('spine', 0, 0, sw * 0.02).a('chest', sin((t * TAU) / 4) * 0.012, 0, -sw * 0.012);
      P.a('head', sin((t * TAU) / 5) * 0.02, sin((t * TAU) / 8 + 1) * 0.06, sw * 0.015);
      for (const s of SIDES) P.armA(s, sin((t * TAU) / 4 + (s === 'L' ? 0 : 0.5)) * 0.02, 0, 0);
      if (c.teacher) {
        for (const s of SIDES) P.ikS(s, 'hand', 0.06 * c.s, c.lm.hipsY + 0.04, 0.14 * c.s, 1, [1, -0.2, 0.3]);
        P.a('chest', 0.04, 0, 0);
      }
      P.leg('L', 0, 0.03, 0); P.leg('R', 0.02, 0.05, 0.03);
    },
  },
  sitIdle: {
    dur: 6, loop: true, posture: 'sit',
    fn(P, t, c) {
      const sw = sin((t * TAU) / 6);
      P.a('spine', 0, 0, sw * 0.02).a('chest', sin((t * TAU) / 3) * 0.012, sw * 0.03, 0);
      P.a('head', sin((t * TAU) / 6 + 2) * 0.03, sin((t * TAU) / 12) * 0.08, 0);
      handsOnDesk(P, c);
      P.ik('handR', 0.13 * c.s + sin(t * 1.3) * 0.01, DESK_Y + 0.05, -0.27);
    },
  },
  write: {
    dur: 2.4, loop: true, posture: 'sit', prop: { name: 'pencil', hand: 'R' },
    fn(P, t, c) {
      const u = (t % 2.4) / 2.4;
      P.hipsA(0, 0, -0.01).a('spine', -0.1, 0.05, 0).a('chest', -0.1, 0.06, 0).a('neck', -0.15).a('head', -0.32, 0.12, 0.08);
      const x = 0.0 + 0.08 * u + sin(t * 26) * 0.006;
      P.ik('handR', x, DESK_Y + 0.045 + abs(sin(t * 13)) * 0.008, -0.33 + sin(t * 4) * 0.008);
      P.ik('handL', -0.12, DESK_Y + 0.045, -0.3);
      P.hand('R', 0.4, 1.0, 0.2);
    },
  },
  sleep: {
    dur: 4.5, loop: true, posture: 'sit', face: 'sleep',
    fn(P, t, c) {
      const br = sin((t * TAU) / 4.5);
      P.hipsA(0, 0, 0.05);
      P.r('spine', -0.22 + br * 0.015, 0, 0).r('chest', -0.26 + br * 0.03, 0, 0).r('neck', -0.08, 0, 0).r('head', -0.42, 0.55, 0.35);
      P.ik('handR', -0.08, DESK_Y + 0.07, -0.36, 1, [1, -0.3, 0.2]);
      P.ik('handL', 0.1, DESK_Y + 0.085, -0.33, 1, [-1, -0.3, 0.2]);
      P.hand('R', 0.3, 1.5, 0).hand('L', 0.3, 1.5, 0);
      P.sh('L', 0.1 + br * 0.03).sh('R', 0.1 + br * 0.03);
    },
  },
  yawn: {
    dur: 2.6, face: (t) => (t > 0.3 && t < 1.7 ? 'yawn' : t >= 1.7 && t < 2.4 ? 'sleepy' : null),
    fn(P, t, c) {
      const k = env(t, 0.3, 0.9, 1.6, 2.3);
      const a = env(t, 0, 0.3, 0.3, 0.6);
      P.a('spine', -0.06 * a + 0.12 * k).a('chest', 0.1 * k).a('head', 0.32 * k + sin(t * 2) * 0.03 * k, 0, 0.1 * k);
      P.sh('L', 0.15 * k).sh('R', 0.15 * k);
      P.ik('handR', 0.03, c.lm.headY - 0.17, -0.24, k, [1, -0.6, 0.3]);
      P.hand('R', -0.3 * k, 1.2, 0);
      P.armA('L', 1.4 * k, 0.6 * k, -0.2 * k); P.ikW('handL', 1 - k);
    },
  },
  stretch: {
    dur: 2.7, seg: [0.8, 1.9], face: (t) => (t > 0.35 && t < 2.1 ? 'content' : null),
    fn(P, t, c) {
      const a = env(t, 0, 0.25, 0.25, 0.45);
      const k = env(t, 0.22, 0.6, 2.0, 2.6, oB);
      const sway = sin(((t - 0.6) * TAU) / 1.6) * env(t, 0.6, 0.9, 1.8, 2.1);
      P.a('spine', -0.1 * a + 0.12 * k, 0, 0.08 * sway).a('chest', -0.06 * a + 0.1 * k, 0, 0.06 * sway).a('head', 0.32 * k);
      for (const s of SIDES) { P.ikW(`hand${s}`, 1 - k); P.arm(s, lerp(P.get(`upperArm${s}`), 2.5, k), lerp(0.25, 0.62, k), lerp(1.2, 0.45, k)); P.sh(s, 0.18 * k - 0.08 * a); P.hand(s, 0, 1.4 * k, 0); }
      if (!c.seated) P.hipsA(0, 0.015 * k, 0);
    },
  },
  raiseHand: {
    dur: 2.5, seg: [0.5, 1.9],
    fn(P, t, c) {
      const k = env(t, 0.12, 0.4, 1.95, 2.4, oB);
      const wig = sin(t * 9) * env(t, 0.5, 0.7, 1.7, 1.9);
      P.ikW('handR', 1 - k);
      P.arm('R', lerp(0.9, 2.45, k), lerp(0.25, 0.68 + wig * 0.06, k), lerp(1.2, 0.12, k));
      P.hand('R', 0, 1.2 * k, 0).sh('R', 0.16 * k);
      P.a('spine', 0.03 * k, 0, 0.08 * k).a('chest', 0.04 * k, 0, 0.04 * k).a('head', 0.12 * k, 0, -0.06 * k);
      P.hipsA(0, 0.012 * abs(wig), 0);
    },
  },
  sneeze: {
    dur: 1.8, face: (t) => (t < 0.85 ? 'sneezeUp' : t < 1.3 ? 'sneeze' : null),
    fn(P, t, c) {
      const up = ss(0, 0.82, t) * (1 - ss(0.82, 0.9, t));
      const snap = env(t, 0.82, 0.9, 1.0, 1.7, outQ);
      const wob = sin((t - 0.9) * 24) * env(t, 0.9, 0.95, 1.1, 1.5) * 0.06;
      P.a('spine', 0.05 * up - 0.18 * snap).a('chest', 0.14 * up - 0.3 * snap).a('neck', 0.1 * up - 0.15 * snap).a('head', 0.38 * up - 0.42 * snap + wob, 0, 0.05 * up);
      for (const s of SIDES) P.sh(s, 0.14 * up - 0.06 * snap);
      P.ik('handR', 0.04, c.lm.headY - 0.2 - 0.06 * snap, -0.25 - 0.04 * snap, env(t, 0.7, 0.88, 1.2, 1.6), [1, -0.6, 0.3]);
      if (!c.seated) P.hipsA(0, 0, -0.03 * snap);
    },
  },
  turnBack: {
    dur: 2.8, seg: [0.7, 2.0],
    fn(P, t, c) {
      const k = env(t, 0.1, 0.65, 2.05, 2.7, oB);
      const dir = -c.side; // turn toward the aisle
      P.a('spine', 0.05 * k, dir * 0.5 * k, 0).a('chest', 0.04 * k, dir * 0.55 * k, -dir * 0.05 * k).a('neck', 0, dir * 0.55 * k, 0).a('head', 0.06 * k, dir * 0.6 * k, 0);
      const s = dir > 0 ? 'L' : 'R';
      P.ikW(`hand${s}`, 1 - k);
      P.arm(s, lerp(0.9, -0.35, k), lerp(0.25, 0.55, k), lerp(1.2, 1.0, k));
      if (c.seated) P.hipsA(0, 0, 0.01 * k);
    },
  },
  chatLeft: { dur: 2.4, loop: true, fn: (P, t, c) => chat(P, t, c, 1) },
  chatRight: { dur: 2.4, loop: true, fn: (P, t, c) => chat(P, t, c, -1) },
  eat: {
    dur: 3, loop: true, prop: { name: 'snack', hand: 'L' },
    fn(P, t, c) {
      const u = t % 3;
      const toMouth = env(u, 0.5, 0.95, 1.5, 2.0);
      P.a('spine', -0.06).a('head', -0.18 + 0.1 * toMouth, sin(t * 1.7) * 0.25 * (1 - toMouth), 0);
      P.ik('handL', -0.08, (c.seated ? DESK_Y : c.lm.chestY - 0.1) + 0.01, -0.2, 1);
      P.hand('L', 0.2, 1.4, 0);
      const mx = 0.03, my = c.lm.headY - 0.17, mz = -0.25;
      const bx = -0.05, by = (c.seated ? DESK_Y : c.lm.chestY - 0.1) + 0.06, bz = -0.22;
      P.ik('handR', lerp(bx, mx, toMouth), lerp(by, my, toMouth), lerp(bz, mz, toMouth), 1, [1, -0.6, 0.3]);
      P.talk(u > 1.4 && u < 2.8 && Math.floor(u * 7) % 2 === 0);
    },
  },
  phone: {
    dur: 3, loop: true, prop: { name: 'phone', hand: 'R' },
    fn(P, t, c) {
      P.a('spine', -0.1).a('chest', -0.06).a('neck', -0.2).a('head', -0.45, sin(t * 0.7) * 0.05, 0);
      const y = c.seated ? DESK_Y - 0.06 : c.lm.chestY - 0.05;
      P.ik('handR', 0.04, y + abs(sin(t * 11)) * 0.006, -0.17, 1, [1, -0.6, 0.2]);
      P.ik('handL', -0.04, y - 0.01, -0.16, 1, [-1, -0.6, 0.2]);
      P.hand('R', 0.9, 0.2, 0).hand('L', 0.9, -0.2, 0);
    },
  },
  standUp: {
    dur: 1.0, endPosture: 'stand',
    fn(P, t, c) {
      const a = env(t, 0, 0.28, 0.28, 0.75);
      const k = ss(0.22, 0.78, t);
      const ov = sin(ss(0.6, 1.0, t) * PI) * 0.05;
      const hx = c.standOff[0] * k, hz = lerp(0.03, c.standOff[1], k);
      P.hips(hx, lerp(c.seatHips, c.lmStand.hipsY, oB(ss(0.22, 0.8, t))), hz - 0.04 * a);
      P.r('spine', lerp(-0.05, 0, k) - 0.35 * a + ov, 0, 0).r('chest', lerp(-0.03, 0, k) - 0.15 * a, 0, 0).r('neck', 0.15 * a, 0, 0);
      for (const s of SIDES) {
        const sx = sg(s);
        P.ik(`foot${s}`, lerp(sx * 0.095 * c.s, hx + sx * c.D.thighX * c.s, k), c.D.ankle * c.s, lerp(-0.26 * c.s, hz, ss(0.3, 0.75, t)), 1 - ss(0.85, 1, t));
        P.leg(s, 1.45 * (1 - k), 0.06 * (1 - k), 1.45 * (1 - k));
        P.ikS(s, 'hand', 0.12 * c.s, DESK_Y + 0.05, -0.26, 1 - ss(0.35, 0.75, t));
        P.arm(s, lerp(0.9, 0.06, k), lerp(0.25, 0.13, k), lerp(1.2, 0.16, k));
        P.hand(s, 0, 0.2, 0);
      }
    },
  },
  sitDown: {
    dur: 1.0, endPosture: 'sit',
    fn(P, t, c) {
      const k = ss(0.1, 0.8, t);
      const a = env(t, 0.1, 0.4, 0.55, 0.95);
      const hx = c.off[0] * (1 - k), hz = lerp(c.off[1], 0.03, k);
      P.hips(hx, lerp(c.lmStand.hipsY, c.seatHips, ss(0.15, 0.85, t)) - 0.01 * sin(ss(0.8, 1, t) * PI), hz + 0.03 * a);
      P.r('spine', -0.3 * a - 0.05 * k, 0, 0).r('chest', -0.12 * a - 0.03 * k, 0, 0).r('neck', 0.12 * a + 0.04 * k, 0, 0);
      for (const s of SIDES) {
        const sx = sg(s);
        P.ik(`foot${s}`, lerp(hx + sx * c.D.thighX * c.s, sx * 0.095 * c.s, ss(0.2, 0.7, t)), c.D.ankle * c.s, lerp(hz, -0.29 * c.s + 0.03, ss(0.2, 0.7, t)), 1);
        P.arm(s, lerp(0.06, 0.9, k), lerp(0.13, 0.25, k), lerp(0.16, 1.2, k));
        P.ikS(s, 'hand', 0.11 * c.s, DESK_Y + 0.05, -0.265, ss(0.6, 1, t));
        P.hand(s, 0.15 * k, lerp(0.2, 1.35, k), 0);
      }
    },
  },
  pickUp: {
    dur: 1.6, events: { grab: 0.7 },
    fn(P, t, c) {
      const k = env(t, 0.1, 0.6, 0.8, 1.3);
      const lift = ss(0.75, 1.3, t);
      const chest = [0.05, c.lm.chestY + 0.03, -0.19];
      let grab;
      if (c.seated) {
        P.a('spine', -0.12 * k).a('chest', -0.1 * k).a('head', -0.25 * k);
        grab = [0.04, DESK_Y + 0.05, -0.4];
      } else {
        P.hipsA(0, -0.2 * k, 0.07 * k);
        P.a('spine', -0.55 * k).a('chest', -0.35 * k).a('head', 0.15 * k);
        for (const s of SIDES) P.leg(s, 0.75 * k, 0.12 * k, 1.25 * k, 0.5 * k);
        grab = [0.08, 0.07, -0.3];
      }
      const base = c.seated ? [0.11, DESK_Y + 0.05, -0.27] : chest;
      const tx = lerp(lerp(base[0], grab[0], k), chest[0], lift * (1 - k));
      const ty = lerp(lerp(base[1], grab[1], k), chest[1], lift * (1 - k));
      const tz = lerp(lerp(base[2], grab[2], k), chest[2], lift * (1 - k));
      P.ik('handR', tx, ty, tz, c.seated ? 1 : Math.max(k, lift), [1, -0.4, 0.5]);
      P.hand('R', 0.3, 1.0, 0);
    },
  },
  unfold: {
    dur: 1.9, hold: true, prop: { name: 'letterBall', hand: 'R' }, events: { open: 0.75 },
    fn(P, t, c) {
      const pull = ss(0.35, 0.6, t) * 0.5 + ss(0.75, 1.15, t) * 0.5;
      const up = ss(1.0, 1.6, t);
      const y = lerp(c.lm.chestY + 0.02, c.lm.headY - 0.13, up), z = lerp(-0.19, -0.27, up);
      for (const s of SIDES) {
        P.ikS(s, 'hand', lerp(0.035, 0.085, pull), y + sin(t * 30) * 0.004 * (1 - up), z, 1, [0.8, -0.6, 0.2]);
        P.hand(s, 0.3 - 0.4 * up, 0.3, 0);
      }
      P.a('head', lerp(-0.35, -0.12, up)).a('neck', -0.1).sh('L', 0.06).sh('R', 0.06);
    },
  },
  read: {
    dur: 4, loop: true, prop: { name: 'letterOpen', hand: 'both' },
    fn(P, t, c) {
      const u = (t % 4) / 4;
      for (const s of SIDES) { P.ikS(s, 'hand', 0.085, c.lm.headY - 0.13, -0.27, 1, [0.8, -0.6, 0.2]); P.hand(s, -0.1, 0.3, 0); }
      P.a('head', -0.1 - 0.12 * u, sin(t * 3) * 0.06, 0).a('neck', -0.08);
    },
  },
  blushShy: {
    dur: 2.8, seg: [0.6, 2.2], face: 'blush',
    fn(P, t, c) {
      const k = env(t, 0.05, 0.45, 2.2, 2.75, oB);
      const sway = sin(t * 3.2) * k;
      P.a('spine', -0.04 * k, 0, 0.06 * sway).a('chest', -0.03 * k, 0, 0.04 * sway).a('head', -0.28 * k, 0.15 * sway, 0.22 * k);
      P.sh('L', 0.2 * k).sh('R', 0.2 * k);
      if (c.holdingBoth) {
        for (const s of SIDES) P.ikS(s, 'hand', 0.085, c.lm.headY - 0.13 + 0.02 * k, -0.27 + 0.02 * k, 1, [0.8, -0.6, 0.2]);
      } else {
        for (const s of SIDES) { P.ikS(s, 'hand', 0.11, c.lm.headY - 0.2, -0.17, k, [0.6, -1, 0.1]); P.hand(s, -0.4 * k, 0.3, 0); }
      }
    },
  },
  nod: {
    dur: 1.0,
    fn(P, t) {
      const v = kf(t, [[0, 0], [0.15, -0.36, outQ], [0.32, 0.06], [0.48, -0.3, outQ], [0.66, 0.03], [0.85, 0]]);
      P.a('head', v, 0, 0).a('neck', v * 0.4);
    },
  },
  shakeHead: {
    dur: 1.2,
    fn(P, t) {
      const d = env(t, 0, 0.1, 0.8, 1.2);
      P.a('head', -0.06 * d, sin(t * TAU * 2.4) * 0.42 * d, 0).a('neck', 0, sin(t * TAU * 2.4 - 0.4) * 0.12 * d, 0);
    },
  },
  cheer: {
    dur: 1.9, seg: [0.4, 1.4], face: 'happy',
    fn(P, t, c) {
      const k = env(t, 0.05, 0.3, 1.5, 1.85, oB);
      const pump = sin((t - 0.3) * TAU * 1.6);
      for (const s of SIDES) { P.ikW(`hand${s}`, 1 - k); P.arm(s, lerp(0.5, 2.45 + 0.15 * pump, k), lerp(0.2, 0.85, k), lerp(0.8, 0.35 + 0.2 * pump, k)); P.sh(s, 0.15 * k); }
      P.a('spine', 0.08 * k).a('head', 0.18 * k);
      if (c.seated) P.hipsA(0, 0.015 * max(0, pump) * k, 0);
      else {
        const jump = max(0, sin((t - 0.3) * TAU * 1.6)) * k;
        P.hipsA(0, 0.09 * jump, 0);
        for (const s of SIDES) P.leg(s, 0.4 * jump, 0.05, 0.8 * jump, -0.3 * jump);
      }
    },
  },
  clap: {
    dur: 1.6, loop: true,
    fn(P, t, c) {
      const sep = 0.02 + 0.075 * (0.5 + 0.5 * cos(t * TAU * 3.5));
      for (const s of SIDES) { P.ikS(s, 'hand', sep / 2 + 0.02, c.lm.chestY + 0.06, -0.21, 1, [1, -0.5, 0.3]); P.hand(s, -0.2, 0, 0); }
      P.a('head', 0.06, 0, 0).a('chest', 0.02 * sin(t * TAU * 3.5));
    },
  },
  laugh: {
    dur: 2.3, seg: [0.4, 1.8], face: 'laugh',
    fn(P, t, c) {
      const k = env(t, 0, 0.25, 1.9, 2.3);
      const shake = sin(t * TAU * 6) * k;
      const fold = env(t, 0.9, 1.2, 1.6, 1.9);
      P.a('spine', 0.12 * k - 0.32 * fold).a('chest', 0.05 * k + 0.04 * shake - 0.1 * fold).a('head', 0.3 * k - 0.35 * fold + 0.05 * shake);
      P.sh('L', 0.1 * k + 0.05 * shake).sh('R', 0.1 * k + 0.05 * shake);
      P.ik('handL', -0.04, c.lm.hipsY + 0.14, -0.15, k, [-1, -0.5, 0.2]);
      if (c.seated) P.ik('handR', 0.14, DESK_Y + 0.05 + abs(sin(t * TAU * 3)) * 0.06 * k, -0.3, 1);
      else { P.noIK('handR'); P.arm('R', lerp(0.06, 1.35, k), 0.15, 0.1); P.point('R', k); }
    },
  },
  gasp: {
    dur: 1.5, seg: [0.3, 1.0], face: 'gasp',
    fn(P, t, c) {
      const k = env(t, 0, 0.14, 1.05, 1.45, oB);
      P.a('spine', 0.1 * k).a('chest', 0.06 * k).a('head', 0.22 * k);
      for (const s of SIDES) { P.sh(s, 0.25 * k); P.ikS(s, 'hand', 0.05, c.lm.headY - 0.2, -0.22, k, [0.8, -0.8, 0.2]); P.hand(s, -0.4 * k, 0.4, 0); }
      if (!c.seated) P.hipsA(0, 0, 0.03 * k);
    },
  },
  facepalm: {
    dur: 2.5, seg: [0.8, 1.8], face: (t) => (t > 0.35 && t < 2.2 ? 'closed' : null),
    fn(P, t, c) {
      const k = env(t, 0.1, 0.5, 1.9, 2.4);
      const drop = env(t, 0.4, 0.75, 1.9, 2.3);
      const shake = sin(t * 9) * env(t, 0.9, 1.1, 1.5, 1.7) * 0.12;
      P.a('head', -0.32 * drop, shake, 0).a('neck', -0.1 * drop).a('chest', -0.05 * drop);
      P.ik('handR', 0.02, c.lm.headY - 0.1 - 0.04 * drop, -0.25, k, [1, -0.8, 0.2]);
      P.hand('R', -0.6 * k, 1.4, 0);
      const sigh = env(t, 1.55, 1.75, 1.9, 2.3);
      P.sh('L', -0.08 * sigh).sh('R', -0.08 * sigh);
    },
  },
  point: {
    dur: 1.7, seg: [0.5, 1.3],
    fn(P, t, c) {
      const a = env(t, 0, 0.2, 0.2, 0.35);
      const k = env(t, 0.18, 0.4, 1.35, 1.7, oB);
      P.ikW('handR', 1 - max(a, k));
      P.arm('R', lerp(0.4, 0.5, a), 0.3, 1.8 * a + 0.1 * (1 - a), 0);
      if (k > 0) reachToward(P, c, 'R', 0.97, k);
      P.point('R', ss(0.15, 0.3, t)).hand('R', 0, 0, 0);
      P.a('spine', -0.05 * k + 0.05 * a, 0, 0).a('chest', -0.05 * k, -0.15 * k, 0).a('head', 0.05 * k);
    },
  },
  wave: {
    dur: 1.9, seg: [0.4, 1.4],
    fn(P, t, c) {
      const k = env(t, 0.05, 0.35, 1.5, 1.85, oB);
      const w = sin((t - 0.35) * TAU * 2.6) * env(t, 0.3, 0.45, 1.35, 1.5);
      P.noIK('handR');
      P.arm('R', 0.06, 0.13, 0.16);
      P.ik('handR', c.lm.shX + 0.17 + 0.07 * w, c.lm.shY + 0.17 - 0.02 * abs(w), -0.08, k, [1, -1, 0.4]);
      P.hand('R', 0, -1.2 * k, 0.25 * w).sh('R', 0.08 * k);
      P.a('head', 0.06 * k, 0, -0.08 * k).a('chest', 0, 0, 0.04 * k);
    },
  },
  bow: {
    dur: 1.9,
    fn(P, t, c) {
      const k = env(t, 0.1, 0.5, 1.2, 1.75);
      if (c.seated) { P.a('spine', -0.15 * k).a('chest', -0.12 * k).a('head', -0.25 * k); return; }
      P.noIK('handL').noIK('handR');
      P.hipsA(0, -0.01 * k, 0.06 * k);
      P.a('spine', -0.45 * k).a('chest', -0.32 * k).a('neck', -0.12 * k).a('head', -0.12 * k);
      for (const s of SIDES) P.arm(s, 0.45 * k + 0.06, 0.02, 0.3 * k + 0.1);
    },
  },
  walk: {
    dur: 0.64, loop: true,
    fn(P, t, c) {
      const ph = (t / 0.64) * TAU;
      for (const s of SIDES) {
        const p = ph + (s === 'L' ? 0 : PI);
        P.leg(s, 0.42 * sin(p), 0.03, 0.12 + 0.75 * max(0, sin(p - 1.1)), 0.15 * max(0, cos(p)));
        if (c.teacher) P.ikS(s, 'hand', 0.06 * c.s, c.lm.hipsY + 0.04, 0.14 * c.s, 1, [1, -0.2, 0.3]);
        else { P.noIK(`hand${s}`); P.arm(s, -0.38 * sin(p), 0.1, 0.35 + 0.2 * max(0, -sin(p))); }
      }
      P.hipsA(0, -0.014 * cos(2 * ph) - 0.008, 0).a('spine', -0.04, 0.06 * sin(ph), 0.02 * sin(ph)).a('chest', 0, -0.1 * sin(ph), 0).a('head', 0.03 * cos(2 * ph), -0.04 * sin(ph), 0);
    },
  },
  run: {
    dur: 0.44, loop: true,
    fn(P, t, c) {
      const ph = (t / 0.44) * TAU;
      for (const s of SIDES) {
        const p = ph + (s === 'L' ? 0 : PI);
        P.leg(s, 0.15 + 0.75 * sin(p), 0.04, 0.4 + 1.1 * max(0, sin(p - 1.0)), 0.2 * max(0, cos(p)));
        P.noIK(`hand${s}`); P.arm(s, -0.8 * sin(p), 0.18, 1.5);
      }
      P.hipsA(0, -0.03 * cos(2 * ph) - 0.02, 0).a('spine', -0.2, 0.1 * sin(ph), 0).a('chest', -0.05, -0.16 * sin(ph), 0).a('head', 0.12, 0, 0);
    },
  },
  dance: {
    dur: 2.0, loop: true, face: 'happy',
    fn(P, t, c) {
      const beat = (t * 2) % 4; // 4 beats per 2 s
      const b = sin(t * TAU * 2);
      const sideA = Math.floor(t) % 2 === 0;
      const up = sideA ? 'R' : 'L', hip = sideA ? 'L' : 'R';
      const k = ss(0, 0.25, t % 1) * (1 - ss(0.8, 1, t % 1)) * 0.7 + 0.3;
      for (const s of SIDES) P.ikW(`hand${s}`, 0);
      P.arm(up, 2.4 * k, 0.7, 0.2); P.point(up, 1);
      P.arm(hip, -0.25, 0.55, 1.7); P.hand(hip, 0, 0, 0.5);
      P.hipsA(sin(t * TAU) * 0.035, 0.02 * abs(b), 0).a('spine', 0, sin(t * TAU) * 0.1, -sin(t * TAU) * 0.08).a('head', 0.05 * b, 0, sin(t * TAU) * 0.15);
      if (!c.seated) for (const s of SIDES) P.leg(s, 0.15 * max(0, s === up ? b : -b), 0.08, 0.3 * max(0, s === up ? b : -b));
      void beat;
    },
  },
  cry: {
    dur: 1.6, loop: true, face: 'cry',
    fn(P, t, c) {
      const sob = sin(t * TAU * 2.5);
      P.a('spine', 0.04).a('head', 0.22 + 0.04 * sob, 0, 0).a('chest', 0.03 * sob);
      for (const s of SIDES) {
        P.sh(s, 0.12 + 0.05 * sob);
        P.ikS(s, 'hand', 0.07, c.lm.headY - 0.04 + sin(t * TAU * 2.5 + (s === 'L' ? 0 : PI)) * 0.012, -0.2, 1, [0.8, -0.8, 0.1]);
        P.hand(s, -0.9, 0.5, 0);
      }
    },
  },
  faint: {
    dur: 1.7, hold: true, face: 'faint',
    fn(P, t, c) {
      const wob = sin(t * 18) * env(t, 0, 0.1, 0.25, 0.4);
      if (c.seated) {
        const k = env(t, 0.2, 0.9, 9, 10);
        P.a('spine', 0.25 * k).a('chest', 0.1 * k).a('head', 0.55 * k, 0, 0.35 * k + wob * 0.1);
        P.hipsA(0, -0.02 * k, -0.06 * k);
        for (const s of SIDES) { P.ikW(`hand${s}`, 1 - k); P.arm(s, -0.15 * k, 0.15, 0.1); P.ikS(s, 'foot', 0.12 * c.s, c.D.ankle * c.s, -0.42 * c.s, 1); }
        return;
      }
      const f = t < 0.35 ? 0 : t < 1.1 ? inQ((t - 0.35) / 0.75) : 1 - 0.07 * sin(ss(1.1, 1.45, t) * PI);
      P.tilt((PI / 2) * f, 0, 0.04 * wob, 0.07 * c.s * f);
      P.a('spine', 0.04 * wob, 0, 0.05 * wob).a('head', 0.1 * f, 0, 0.2 * wob);
      for (const s of SIDES) { P.noIK(`hand${s}`).noIK(`foot${s}`); P.arm(s, -0.05, 0.08 + 0.15 * f, 0.05); P.leg(s, 0, 0.03, 0, 0.3 * f); }
    },
  },
  shiver: {
    dur: 0.8, loop: true, face: 'shiver',
    fn(P, t, c) {
      const j = sin(t * 77) * 0.5 + sin(t * 53) * 0.5;
      P.hipsA(j * 0.003, 0, 0).a('chest', -0.06, 0, j * 0.025).a('head', -0.1, j * 0.04, 0);
      P.sh('L', 0.2).sh('R', 0.2);
      P.ik('handR', -0.1, c.lm.shY - 0.06, -0.09, 1, [1, -0.6, -0.5]);
      P.ik('handL', 0.1, c.lm.shY - 0.09, -0.11, 1, [-1, -0.6, -0.5]);
    },
  },
  catch: {
    dur: 1.4, events: { grab: 0.2 }, face: (t) => (t < 0.9 ? 'determined' : 'smug'),
    fn(P, t, c) {
      const w = env(t, 0, 0.16, 1.15, 1.4, outQ);
      const down = ss(0.8, 1.15, t);
      const d = c.look ? lookTarget(c, 'R') : [0.15, 0.85, -0.5];
      const L = c.lm.armLen * 0.96;
      const up = [c.lm.shX + d[0] * L, c.lm.shY + max(0.05, d[1]) * L, d[2] * L];
      P.ik('handR', lerp(up[0], 0.06, down), lerp(up[1], c.lm.chestY + 0.05, down), lerp(up[2], -0.2, down), w, [1, -0.7, 0.4]);
      P.hand('R', -0.3, 1.4, 0);
      const k = w * (1 - down);
      P.a('spine', 0.06 * k, 0, 0.1 * k).a('head', 0.25 * k, -0.1 * k, 0).sh('R', 0.15 * k);
    },
  },
  throw: {
    dur: 1.0, events: { release: 0.45 },
    fn(P, t, c) {
      const wind = env(t, 0, 0.32, 0.36, 0.48);
      const snap = env(t, 0.36, 0.5, 0.6, 1.0, oB);
      P.ikW('handR', 0);
      P.arm('R', 2.5 * wind + 1.35 * snap + 0.06, 0.45 * wind + 0.1, 1.9 * wind + 0.1);
      P.a('chest', 0.06 * wind - 0.08 * snap, 0.4 * wind - 0.35 * snap, 0).a('spine', 0.05 * wind - 0.15 * snap, 0.15 * wind - 0.1 * snap, 0).a('head', 0, -0.3 * wind + 0.25 * snap, 0);
      P.arm('L', 0.6 * wind + 0.06, 0.2, 0.5);
      P.ikW('handL', 1 - max(wind, snap));
    },
  },
  teacherWrite: {
    dur: 2.0, loop: true, prop: { name: 'chalk', hand: 'R' },
    fn(P, t, c) {
      const u = (t % 2) / 2;
      const x = 0.0 + 0.24 * u + sin(t * 31) * 0.008;
      const y = c.lm.shY + 0.12 + sin(t * 9) * 0.03 - 0.06 * Math.floor((t % 6) / 2);
      P.ik('handR', x, y, -0.4 * c.s, 1, [1, -0.8, 0.5]);
      P.hand('R', -0.6, 1.0, 0);
      P.ik('handL', -0.16, c.lm.hipsY + 0.12, -0.08, 1, [-1, -0.5, 0.5]);
      P.a('spine', 0.02, -0.08 * u, 0.03).a('chest', 0.03, -0.06 * u, 0).a('head', 0.12, -0.1 - 0.15 * u, 0);
      P.hipsA(0.01 * sin(t * 0.8), 0, 0);
    },
  },
  teacherLecture: {
    dur: 4.0, loop: true, prop: { name: 'book', hand: 'L' },
    fn(P, t, c) {
      const u = t % 4;
      const ph = sin(t * TAU * 0.9);
      P.ik('handL', -0.1, c.lm.chestY - 0.02, -0.22, 1);
      P.hand('L', 0.5, -0.5, 0);
      const fingerUp = env(u, 2.0, 2.25, 2.9, 3.2, oB);
      P.noIK('handR');
      P.arm('R', lerp(0.75 + 0.15 * ph, 0.65, fingerUp), lerp(0.35, 0.45, fingerUp), lerp(1.0 + 0.25 * ph, 2.3, fingerUp), lerp(0.4, 0.9, fingerUp));
      P.point('R', fingerUp).hand('R', 0, lerp(-1.0, 0, fingerUp), 0);
      P.a('head', 0.04 + 0.03 * ph, sin((t * TAU) / 4) * 0.45, 0).a('chest', 0, sin((t * TAU) / 4) * 0.1, 0);
      P.talk(Math.floor(t * 7.5) % 3 !== 0 && u < 3.6);
    },
  },
  teacherTurn: {
    dur: 1.2, face: (t) => (t > 0.25 ? 'suspicious' : null),
    fn(P, t, c) {
      const h = env(t, 0.0, 0.55, 1.0, 1.2, (x) => x * x * (3 - 2 * x));
      const b = env(t, 0.3, 0.85, 1.0, 1.2);
      P.a('head', 0.05 * h, -0.9 * h, 0.08 * h).a('neck', 0, -0.35 * h, 0).a('chest', 0, -0.35 * b, 0).a('spine', 0, -0.2 * b, 0);
      P.glint(t > 0.62 && t < 1.05);
    },
  },
  teacherDrink: {
    dur: 2.9, prop: { name: 'thermos', hand: 'R' }, face: (t) => (t > 0.6 && t < 1.9 ? 'closed' : t >= 1.9 && t < 2.8 ? 'content' : null),
    fn(P, t, c) {
      const up = env(t, 0.05, 0.6, 1.8, 2.3);
      const sip = env(t, 0.55, 0.85, 1.6, 1.9);
      P.ik('handR', 0.04, lerp(c.lm.chestY - 0.05, c.lm.headY - 0.17 + 0.02 * sip, up), lerp(-0.18, -0.21, up), 1, [1, -0.6, 0.3]);
      P.hand('R', 0.5 * sip - 0.3 * up, 1.4, 0);
      P.a('head', 0.32 * sip).a('chest', 0.05 * sip);
      const ahh = env(t, 2.0, 2.2, 2.5, 2.85);
      P.sh('L', -0.05 * ahh).sh('R', -0.05 * ahh).a('head', -0.08 * ahh);
    },
  },
  teacherPointAt: {
    dur: 1.9, seg: [0.55, 1.4], face: (t) => (t > 0.2 ? 'angry' : null),
    fn(P, t, c) {
      const a = env(t, 0, 0.22, 0.22, 0.35);
      const k = env(t, 0.22, 0.42, 1.45, 1.85, oB);
      P.ikW('handR', 1 - max(a, k));
      P.arm('R', 0.3, 0.2, 1.9 * a + 0.1);
      if (k > 0) reachToward(P, c, 'R', 0.98, k);
      P.point('R', ss(0.2, 0.32, t)).hand('R', 0, 0, 0);
      P.a('spine', 0.06 * a - 0.12 * k).a('chest', 0.05 * a - 0.06 * k, -0.25 * k, 0).a('head', -0.05 * k);
      if (!c.seated) P.hipsA(0, 0, -0.04 * k + 0.03 * a);
      P.glint(t > 0.42 && t < 1.25);
    },
  },
  teacherThrowChalk: {
    dur: 1.4, prop: { name: 'chalk', hand: 'R' }, events: { release: 0.52 }, face: (t) => (t < 0.55 ? 'suspicious' : 'smug'),
    fn(P, t, c) {
      const wind = env(t, 0, 0.42, 0.45, 0.56);
      const snap = env(t, 0.45, 0.56, 1.0, 1.35, oB);
      P.ik('handR', 0.13, c.lm.headY + 0.04, 0.03, wind, [1, -0.4, 0.6]);
      if (snap > 0) reachToward(P, c, 'R', 0.97, snap);
      P.a('chest', 0.04 * wind, 0.35 * wind - 0.3 * snap, 0).a('spine', 0.03 * wind - 0.12 * snap, 0.1 * wind - 0.1 * snap, 0).a('head', -0.05 * wind, -0.25 * wind + 0.15 * snap, 0);
      P.noIK('handL').arm('L', 0.4 * wind + 0.1, 0.25, 0.4);
      P.glint(t > 0.3 && t < 0.5);
    },
  },
  teacherAdjustGlasses: {
    dur: 1.6, face: (t) => (t > 0.3 && t < 1.4 ? 'smug' : null),
    fn(P, t, c) {
      const k = env(t, 0.05, 0.4, 1.05, 1.5);
      const push = env(t, 0.45, 0.55, 0.65, 0.8);
      P.ik('handR', 0.025, c.lm.headY - 0.11 + 0.02 * push, -0.25, k, [1, -0.9, 0.2]);
      P.point('R', k).hand('R', -0.9 * k, 1.5 * k, 0);
      P.a('head', -0.12 * k + 0.08 * push, 0, 0);
      P.glint(t > 0.5 && t < 1.0);
    },
  },
  // internal: small stepping while turning on the spot
  shuffle: {
    dur: 0.5, loop: true,
    fn(P, t) {
      const ph = (t / 0.5) * TAU;
      for (const s of SIDES) { const p = ph + (s === 'L' ? 0 : PI); P.leg(s, 0.18 * max(0, sin(p)), 0.04, 0.35 * max(0, sin(p))); }
      P.hipsA(0, -0.006 * abs(sin(ph)), 0);
    },
  },
};

function chat(P, t, c, dir) {
  const g = sin(t * TAU * 0.8);
  P.a('spine', 0, dir * 0.15, dir * 0.06).a('chest', 0, dir * 0.25, 0).a('neck', 0, dir * 0.25, 0).a('head', 0.05 + 0.04 * sin(t * 5), dir * 0.35, dir * 0.1);
  const far = dir > 0 ? 'R' : 'L';
  P.ikW(`hand${far}`, 0.3);
  P.arm(far, 0.95 + 0.15 * g, 0.2, 1.5 + 0.2 * g, 0.5);
  P.hand(far, 0.2 * g, 0, 0);
  P.talk(Math.floor(t * 7) % 3 !== 2 && (t % 2.4) < 1.9);
}
