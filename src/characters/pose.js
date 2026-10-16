// Pose buffers, layer blending and the clip-writing API, plus an analytic two-bone IK solver.
import * as THREE from 'three';
import { BONES, BI } from './body.js';

export const NB = BONES.length;
export const LIMBS = ['handL', 'handR', 'footL', 'footR'];
export const LI = { handL: 0, handR: 1, footL: 2, footR: 3 };

export class Pose {
  constructor() {
    this.rot = new Float32Array(NB * 3);
    this.hips = new Float32Array(3);
    this.tilt = new Float32Array(4); // rig rotation x,y,z + lift
    this.ik = new Float32Array(4 * 7); // x,y,z,w, px,py,pz
    this.face = null; this.talk = 0; this.glint = 0;
  }
  copy(o) {
    this.rot.set(o.rot); this.hips.set(o.hips); this.tilt.set(o.tilt); this.ik.set(o.ik);
    this.face = o.face; this.talk = o.talk; this.glint = o.glint;
    return this;
  }
  /** this = lerp(this, o, w) */
  blend(o, w) {
    if (w >= 0.999) return this.copy(o);
    if (w <= 0.001) return this;
    const a = this.rot, b = o.rot;
    for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * w;
    for (let i = 0; i < 3; i++) this.hips[i] += (o.hips[i] - this.hips[i]) * w;
    for (let i = 0; i < 4; i++) this.tilt[i] += (o.tilt[i] - this.tilt[i]) * w;
    for (let l = 0; l < 4; l++) {
      const k = l * 7, wa = this.ik[k + 3], wb = o.ik[k + 3];
      if (wa <= 0.001) { for (let j = 0; j < 7; j++) if (j !== 3) this.ik[k + j] = o.ik[k + j]; }
      else if (wb > 0.001) { for (let j = 0; j < 7; j++) if (j !== 3) this.ik[k + j] += (o.ik[k + j] - this.ik[k + j]) * w; }
      this.ik[k + 3] = wa + (wb - wa) * w;
    }
    if (w > 0.5) { this.face = o.face; this.glint = o.glint; this.talk = o.talk; }
    return this;
  }
}

/** API given to clip functions: writes into a Pose that starts as a copy of everything below it. */
export class Writer {
  constructor() { this.p = null; }
  bind(p) { this.p = p; return this; }
  r(b, x, y, z) { const i = BI[b] * 3, R = this.p.rot; R[i] = x; R[i + 1] = y; R[i + 2] = z; return this; }
  a(b, x = 0, y = 0, z = 0) { const i = BI[b] * 3, R = this.p.rot; R[i] += x; R[i + 1] += y; R[i + 2] += z; return this; }
  get(b, axis = 0) { return this.p.rot[BI[b] * 3 + axis]; }
  /** upper arm pitch (forward raise), out (abduction, mirrored), elbow bend, twist (mirrored) */
  arm(side, x, out, elbow, twist = 0) {
    const s = side === 'R' ? 1 : -1;
    this.r(`upperArm${side}`, x, s * twist, s * out);
    this.r(`forearm${side}`, elbow, 0, 0);
    return this;
  }
  armA(side, x, out, elbow, twist = 0) {
    const s = side === 'R' ? 1 : -1;
    this.a(`upperArm${side}`, x, s * twist, s * out);
    this.a(`forearm${side}`, elbow, 0, 0);
    return this;
  }
  sh(side, up, fwd = 0) { const s = side === 'R' ? 1 : -1; return this.r(`shoulder${side}`, 0, -s * fwd, s * up); }
  shA(side, up, fwd = 0) { const s = side === 'R' ? 1 : -1; return this.a(`shoulder${side}`, 0, -s * fwd, s * up); }
  hand(side, x, y = 0, z = 0) { const s = side === 'R' ? 1 : -1; return this.r(`hand${side}`, x, s * y, s * z); }
  point(side, on = 1) { return this.r(`index${side}`, -1.57 * (1 - on), 0, 0); }
  leg(side, lift, out, knee, foot = 0) {
    const s = side === 'R' ? 1 : -1;
    this.r(`thigh${side}`, lift, 0, s * out);
    this.r(`shin${side}`, -knee, 0, 0);
    this.r(`foot${side}`, foot, 0, 0);
    return this;
  }
  hips(x, y, z) { const H = this.p.hips; H[0] = x; H[1] = y; H[2] = z; return this; }
  hipsA(x = 0, y = 0, z = 0) { const H = this.p.hips; H[0] += x; H[1] += y; H[2] += z; return this; }
  tilt(x = 0, y = 0, z = 0, lift = 0) { const T = this.p.tilt; T[0] = x; T[1] = y; T[2] = z; T[3] = lift; return this; }
  /** IK target for a limb in root space (metres). pole = [x,y,z] root-space hint direction. */
  ik(limb, x, y, z, w = 1, pole = null) {
    const k = LI[limb] * 7, I = this.p.ik;
    I[k] = x; I[k + 1] = y; I[k + 2] = z; I[k + 3] = w;
    if (pole) { I[k + 4] = pole[0]; I[k + 5] = pole[1]; I[k + 6] = pole[2]; }
    else if (limb[0] === 'h') { const s = limb === 'handR' ? 1 : -1; I[k + 4] = s * 0.7; I[k + 5] = -0.55; I[k + 6] = 0.45; }
    else { const s = limb === 'footR' ? 1 : -1; I[k + 4] = s * 0.12; I[k + 5] = 0; I[k + 6] = -1; }
    return this;
  }
  /** mirrored IK helper: x is multiplied by the side sign */
  ikS(side, part, x, y, z, w = 1, pole = null) {
    const s = side === 'R' ? 1 : -1;
    return this.ik(`${part}${side}`, s * x, y, z, w, pole && [s * pole[0], pole[1], pole[2]]);
  }
  ikW(limb, w) { this.p.ik[LI[limb] * 7 + 3] *= w; return this; }
  noIK(limb) { if (limb) this.p.ik[LI[limb] * 7 + 3] = 0; else for (let l = 0; l < 4; l++) this.p.ik[l * 7 + 3] = 0; return this; }
  face(name) { this.p.face = name; return this; }
  talk(on = true) { this.p.talk = on ? 1 : 0; return this; }
  glint(on = true) { this.p.glint = on ? 1 : 0; return this; }
}

// ---------------------------------------------------------------- IK
const _A = new THREE.Vector3(), _T = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3();
const _u = new THREE.Vector3(), _E = new THREE.Vector3(), _v = new THREE.Vector3(), _ax = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

/**
 * Solve a two-bone chain in the upper bone's parent space.
 * @param upper bone, lower bone; T target, P pole (both in parent space); l1, l2 lengths; knee: true for legs
 * Writes the slerped result into upper.quaternion / lower.quaternion.
 */
export function solveTwoBone(upper, lower, T, P, l1, l2, w, knee) {
  _A.copy(upper.position);
  _T.copy(T).sub(_A);
  let d = _T.length();
  if (d < 1e-5) return;
  _n.copy(_T).divideScalar(d);
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.9995);
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const a1 = Math.acos(cosA);
  const cosE = THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1);
  const bend = Math.PI - Math.acos(cosE);
  _p.copy(P).addScaledVector(_n, -P.dot(_n));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1).addScaledVector(_n, -_n.z);
  _p.normalize();
  _u.copy(_n).multiplyScalar(Math.cos(a1)).addScaledVector(_p, Math.sin(a1)).normalize();
  _E.copy(_u).multiplyScalar(l1);
  _v.copy(_n).multiplyScalar(d).sub(_E).normalize();
  _ax.crossVectors(_u, _v);
  if (_ax.lengthSq() < 1e-8) { _v.copy(_n).addScaledVector(_p, -0.3); _ax.crossVectors(_u, _v); }
  _ax.normalize();
  if (knee) _ax.negate();
  _x.copy(_ax); _y.copy(_u).negate(); _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  _qa.setFromRotationMatrix(_m);
  _qb.setFromAxisAngle(_x.set(1, 0, 0), knee ? -bend : bend);
  if (w >= 0.999) { upper.quaternion.copy(_qa); lower.quaternion.copy(_qb); }
  else { upper.quaternion.slerp(_qa, w); lower.quaternion.slerp(_qb, w); }
}
