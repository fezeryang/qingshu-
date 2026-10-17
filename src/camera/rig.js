// Camera-local math helpers: poses, look rotations, target resolution, easing lookup.
// (owner: qs-camera-director)
import * as THREE from 'three';
import { ease as EASE, clamp } from '../core/util.js';

export const DEG = Math.PI / 180;
export const UP = new THREE.Vector3(0, 1, 0);
export const Z_AXIS = new THREE.Vector3(0, 0, 1);

const _m4 = new THREE.Matrix4();
const _qr = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _l = new THREE.Vector3();
const _d0 = new THREE.Vector3();
const _d1 = new THREE.Vector3();

/** @returns {{pos: THREE.Vector3, quat: THREE.Quaternion, fov: number}} */
export function makePose() { return { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 70, look: new THREE.Vector3(), hasLook: false }; }
export function copyPose(dst, src) { dst.pos.copy(src.pos); dst.quat.copy(src.quat); dst.fov = src.fov; return dst; }
export function blendPose(from, to, w, out) {
  out.pos.lerpVectors(from.pos, to.pos, w);
  out.quat.slerpQuaternions(from.quat, to.quat, w);
  out.fov = from.fov + (to.fov - from.fov) * w;
  return out;
}

/** Quaternion of a camera at `pos` looking at `look`, rolled by `rollRad` around the view axis. */
export function lookQuat(pos, look, rollRad = 0, out = new THREE.Quaternion()) {
  if (pos.distanceToSquared(look) > 1e-12) {
    _m4.lookAt(pos, look, UP);
    out.setFromRotationMatrix(_m4);
  }
  if (rollRad) out.multiply(_qr.setFromAxisAngle(Z_AXIS, rollRad));
  return out;
}

export function forwardOf(quat, out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(quat); }

/** Anything position-like → Vector3 (Vector3, [x,y,z], {x,y,z}, Object3D, {pos}). null if not resolvable. */
export function toVec(v, out = new THREE.Vector3()) {
  if (!v) return null;
  if (v.isVector3) return out.copy(v);
  if (Array.isArray(v)) return v.length >= 3 ? out.set(+v[0] || 0, +v[1] || 0, +v[2] || 0) : null;
  if (v.isObject3D) return v.getWorldPosition(out);
  if (typeof v.x === 'number' && typeof v.z === 'number') return out.set(v.x, +v.y || 0, v.z);
  if (v.pos) return toVec(v.pos, out);
  if (v.root?.isObject3D) return v.root.getWorldPosition(out);
  return null;
}

/** Character | char id | 'teacher' | 'crush' → Character (or null). */
export function asChar(ctx, t) {
  if (!t) return null;
  if (typeof t === 'string') {
    const cast = ctx.cast;
    if (!cast) return null;
    if (t === 'teacher') return cast.teacher || cast.get?.('teacher') || null;
    if (t === 'crush') return ctx.round?.crushId ? cast.get?.(ctx.round.crushId) || null : null;
    return cast.get?.(t) || null;
  }
  if (typeof t === 'object' && typeof t.headWorld === 'function' && t.root) return t;
  return null;
}

/** Head position of a character, or the position of any other target. */
export function headOf(ctx, t, out = new THREE.Vector3()) {
  const ch = asChar(ctx, t);
  if (ch) {
    try {
      const r = ch.headWorld(out);
      if (r && r.isVector3 && r !== out) out.copy(r);
      if (Number.isFinite(out.x + out.y + out.z)) return out;
    } catch { /* fall through */ }
    if (ch.root) { ch.root.getWorldPosition(out); out.y += 1.1; return out; }
    return null;
  }
  if (typeof t === 'string') return null;
  return toVec(t, out);
}

/** Horizontal facing vector of a character (from its root's world rotation). */
export function facingOf(ch, out = new THREE.Vector3()) {
  const root = ch?.root;
  if (!root) return out.set(0, 0, -1);
  root.getWorldQuaternion(_wq);
  out.set(0, 0, -1).applyQuaternion(_wq);
  out.y = 0;
  if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
  return out.normalize();
}

const _box = new THREE.Box3(), _bs = new THREE.Vector3();
/** Visual head radius (bounding box of parts.head incl. hair), falling back to the collider radius. */
export function visualHeadRadius(ch) {
  try {
    const h = ch?.parts?.head;
    if (h?.isObject3D) {
      _box.setFromObject(h);
      if (!_box.isEmpty()) {
        _box.getSize(_bs);
        const r = Math.max(_bs.x, _bs.y) / 2;
        if (r > 0.05 && r < 0.6) return r;
      }
    }
  } catch { /* ignore */ }
  return headRadius(ch);
}

/** Head collider radius of a character (falls back to 0.15). */
export function headRadius(ch) {
  try {
    const cs = ch?.getColliders?.() || [];
    const h = cs.find((c) => c.kind === 'sphere' && (c.tag === 'head' || c.tag === 'teacher'));
    if (h && h.radius > 0.03 && h.radius < 0.6) return h.radius;
  } catch { /* ignore */ }
  return 0.15;
}

export function easeFn(e, fallback = EASE.inOutCubic) {
  if (typeof e === 'function') return e;
  if (typeof e === 'string' && EASE[e]) return EASE[e];
  return fallback;
}

/**
 * Angle argument: degrees preferred; non-integer values within ±2π are read as radians
 * (so both `90` and `Math.PI / 2` work). Returns radians.
 */
export function angleArg(v, fallbackRad) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallbackRad;
  if (Math.abs(v) <= 2 * Math.PI + 1e-3 && !Number.isInteger(v)) return v;
  return v * DEG;
}

/** Shortest signed angle difference a → b. */
export function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

/** Rotate a horizontal vector around +Y by `a` radians (same sense as a character yaw). */
export function rotY(v, a, out = new THREE.Vector3()) {
  const c = Math.cos(a), s = Math.sin(a);
  return out.set(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

/**
 * Keep `target` inside |ndc| <= limit by rotating the pose minimally. Returns true if corrected.
 * Also reports the pre-correction NDC through `ndcOut` if given.
 */
export function frameTarget(pose, target, aspect, limit, ndcOut) {
  _l.subVectors(target, pose.pos).applyQuaternion(_qi.copy(pose.quat).invert());
  const tanV = Math.tan((pose.fov * DEG) / 2), tanH = tanV * aspect;
  if (_l.z > -0.03) {
    lookQuat(pose.pos, target, 0, pose.quat);
    if (ndcOut) ndcOut.set(9, 9);
    return true;
  }
  const nx = _l.x / -_l.z / tanH, ny = _l.y / -_l.z / tanV;
  if (ndcOut) ndcOut.set(nx, ny);
  if (Math.abs(nx) <= limit && Math.abs(ny) <= limit) return false;
  const cx = clamp(nx, -limit, limit), cy = clamp(ny, -limit, limit);
  _d1.set(cx * tanH, cy * tanV, -1).normalize();
  _d0.copy(_l).normalize();
  _qc.setFromUnitVectors(_d1, _d0);
  pose.quat.multiply(_qc);
  return true;
}

let warned = new Set();
export function warnOnce(key, ...args) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[cam]', ...args);
}
