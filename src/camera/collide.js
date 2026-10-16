// Camera collision queries against the physics colliders (contract §5): segment casts, push-out,
// room clamping. Used by the follow cam (spring arm) and the shot presets (anti-clipping).
// (owner: qs-camera-director)
import * as THREE from 'three';
import { ROOM, FANS } from '../core/layout.js';

const EMPTY = [];
const _d = new THREE.Vector3();
const _lo = new THREE.Vector3();
const _ld = new THREE.Vector3();
const _q = new THREE.Quaternion();
const CHAR_TAGS = new Set(['head', 'body', 'teacher']);
const LAND_TAGS = new Set(['desk', 'chair', 'teacherDesk', 'podium', 'trashRim', 'book']);

function segBox(o, d, min, max, pad) {
  if (o.x > min.x - pad && o.x < max.x + pad && o.y > min.y - pad && o.y < max.y + pad && o.z > min.z - pad && o.z < max.z + pad) return 1; // starts inside → ignore
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const k = i === 0 ? 'x' : i === 1 ? 'y' : 'z';
    const lo = min[k] - pad, hi = max[k] + pad, ok = o[k], dk = d[k];
    if (Math.abs(dk) < 1e-12) { if (ok < lo || ok > hi) return 1; continue; }
    let a = (lo - ok) / dk, b = (hi - ok) / dk;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return 1;
  }
  return t0;
}
function insideBox(o, min, max, pad) {
  return o.x > min.x - pad && o.x < max.x + pad && o.y > min.y - pad && o.y < max.y + pad && o.z > min.z - pad && o.z < max.z + pad;
}
function segSphere(o, d, c, r) {
  const fx = o.x - c.x, fy = o.y - c.y, fz = o.z - c.z;
  const C = fx * fx + fy * fy + fz * fz - r * r;
  if (C <= 0) return 1; // inside → ignore
  const A = d.x * d.x + d.y * d.y + d.z * d.z;
  if (A < 1e-12) return 1;
  const B = 2 * (fx * d.x + fy * d.y + fz * d.z);
  const disc = B * B - 4 * A * C;
  if (disc < 0) return 1;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : 1;
}
const _hmin = new THREE.Vector3(), _hmax = new THREE.Vector3();
function segObb(o, d, c, pad) {
  _q.copy(c.quaternion).invert();
  _lo.subVectors(o, c.center).applyQuaternion(_q);
  _ld.copy(d).applyQuaternion(_q);
  _hmax.copy(c.halfSize);
  _hmin.copy(c.halfSize).negate();
  return segBox(_lo, _ld, _hmin, _hmax, pad);
}

function pushBox(p, min, max, r) {
  const cx = Math.min(max.x, Math.max(min.x, p.x)), cy = Math.min(max.y, Math.max(min.y, p.y)), cz = Math.min(max.z, Math.max(min.z, p.z));
  const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2), s = (r - d) / d;
    p.x += dx * s; p.y += dy * s; p.z += dz * s;
    return true;
  }
  const pen = [p.x - min.x, max.x - p.x, p.y - min.y, max.y - p.y, p.z - min.z, max.z - p.z];
  let bi = 0;
  for (let i = 1; i < 6; i++) if (pen[i] < pen[bi]) bi = i;
  switch (bi) {
    case 0: p.x = min.x - r; break;
    case 1: p.x = max.x + r; break;
    case 2: p.y = min.y - r; break;
    case 3: p.y = max.y + r; break;
    case 4: p.z = min.z - r; break;
    default: p.z = max.z + r;
  }
  return true;
}

export function createCollision(ctx) {
  let charFrame = -1, charCache = EMPTY;
  let landKey = null, landCache = EMPTY;

  const inClassroom = () => (ctx.stage?.current ?? 'classroom') === 'classroom';
  const statics = () => {
    if (!inClassroom()) return EMPTY;
    const c = ctx.world?.classroom?.colliders;
    return Array.isArray(c) ? c : EMPTY;
  };
  /** Character colliders; cached per tick unless `fresh`. */
  const chars = (fresh = false) => {
    const f = ctx.time.frame;
    if (fresh || f !== charFrame) {
      try { const c = ctx.cast?.colliders?.(); charCache = Array.isArray(c) ? c : EMPTY; } catch { charCache = EMPTY; }
      charFrame = f;
    }
    return charCache;
  };
  const all = (fresh = false) => { const s = statics(), c = chars(fresh); return c.length ? s.concat(c) : s; };

  /**
   * First hit of segment a→b against colliders (inflated by pad; characters by pad + charPad).
   * Colliders that already contain `a` are ignored. Returns {t (0..1, 1 = clear), hit}.
   */
  function segment(a, b, list, pad = 0, { charPad = 0, skip } = {}) {
    _d.subVectors(b, a);
    let best = 1, hit = null;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c || c.kind === 'trigger') continue;
      if (skip && skip(c)) continue;
      const p = CHAR_TAGS.has(c.tag) ? pad + charPad : pad;
      let t = 1;
      // if the start is only inside the *inflated* shape (ball resting against a book stack / near a head),
      // fall back to the raw shape instead of ignoring the collider
      if (c.kind === 'box') { t = segBox(a, _d, c.min, c.max, p); if (t === 1 && p > 0 && insideBox(a, c.min, c.max, p)) t = segBox(a, _d, c.min, c.max, 0); }
      else if (c.kind === 'sphere') { t = segSphere(a, _d, c.center, c.radius + p); if (t === 1 && p > 0 && a.distanceTo(c.center) < c.radius + p) t = segSphere(a, _d, c.center, c.radius); }
      else if (c.kind === 'obb') { t = segObb(a, _d, c, p); if (t === 1 && p > 0) t = Math.min(t, segObb(a, _d, c, 0)); }
      if (t < best) { best = t; hit = c; }
    }
    return { t: best, hit };
  }

  /** Is p inside any collider (inflated by pad)? */
  function inside(p, list, pad = 0, skip) {
    for (const c of list) {
      if (!c || c.kind === 'trigger' || (skip && skip(c))) continue;
      if (c.kind === 'box') {
        if (p.x > c.min.x - pad && p.x < c.max.x + pad && p.y > c.min.y - pad && p.y < c.max.y + pad && p.z > c.min.z - pad && p.z < c.max.z + pad) return c;
      } else if (c.kind === 'sphere') {
        if (p.distanceTo(c.center) < c.radius + pad) return c;
      } else if (c.kind === 'obb') {
        _q.copy(c.quaternion).invert();
        _lo.subVectors(p, c.center).applyQuaternion(_q);
        if (Math.abs(_lo.x) < c.halfSize.x + pad && Math.abs(_lo.y) < c.halfSize.y + pad && Math.abs(_lo.z) < c.halfSize.z + pad) return c;
      }
    }
    return null;
  }

  /** Push a sphere (p, r) out of colliders. Mutates p. */
  function pushOut(p, r, list, { charPad = 0, skip, iterations = 3 } = {}) {
    for (let it = 0; it < iterations; it++) {
      let moved = false;
      for (const c of list) {
        if (!c || c.kind === 'trigger' || (skip && skip(c))) continue;
        const rr = CHAR_TAGS.has(c.tag) ? r + charPad : r;
        if (c.kind === 'box') moved = pushBox(p, c.min, c.max, rr) || moved;
        else if (c.kind === 'sphere') {
          _d.subVectors(p, c.center);
          const d = _d.length(), need = c.radius + rr;
          if (d < need) {
            if (d < 1e-6) _d.set(0, 1, 0); else _d.divideScalar(d);
            p.copy(c.center).addScaledVector(_d, need);
            moved = true;
          }
        } else if (c.kind === 'obb') {
          _q.copy(c.quaternion).invert();
          _lo.subVectors(p, c.center).applyQuaternion(_q);
          _hmax.copy(c.halfSize); _hmin.copy(c.halfSize).negate();
          if (pushBox(_lo, _hmin, _hmax, rr)) { p.copy(_lo.applyQuaternion(c.quaternion)).add(c.center); moved = true; }
        }
      }
      if (!moved) break;
    }
    return p;
  }

  /** Keep p inside the classroom box (only when the classroom set is showing). */
  function clampRoom(p, m = 0.12) {
    if (!inClassroom()) return p;
    p.x = Math.min(ROOM.maxX - m, Math.max(ROOM.minX + m, p.x));
    p.y = Math.min(ROOM.height - m, Math.max(m, p.y));
    p.z = Math.min(ROOM.maxZ - m, Math.max(ROOM.minZ + m, p.z));
    return p;
  }
  function insideRoom(p, m = 0.1) {
    if (!inClassroom()) return true;
    return p.x > ROOM.minX + m && p.x < ROOM.maxX - m && p.y > m && p.y < ROOM.height - m && p.z > ROOM.minZ + m && p.z < ROOM.maxZ - m;
  }
  /** Keep the camera out of the ceiling fans' blade disc. */
  function avoidFans(p) {
    if (!inClassroom()) return p;
    for (const f of FANS) {
      const h = Math.hypot(p.x - f.x, p.z - f.z);
      if (h < f.r + 0.3 && p.y > f.bladeY - 0.3) p.y = f.bladeY - 0.3;
    }
    return p;
  }

  /** Distance from p to the nearest landing surface (desk tops, chairs, podium, trash rim) or head. */
  function nearestLanding(p) {
    const s = statics();
    const key = s.length ? s : null;
    if (key !== landKey || (key && landCache.__n !== s.length)) {
      landKey = key;
      landCache = s.filter((c) => c && c.kind === 'box' && LAND_TAGS.has(c.tag));
      landCache.__n = s.length;
    }
    let best = Infinity;
    for (const c of landCache) {
      const dx = Math.max(c.min.x - p.x, 0, p.x - c.max.x), dy = Math.max(c.min.y - p.y, 0, p.y - c.max.y), dz = Math.max(c.min.z - p.z, 0, p.z - c.max.z);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) best = d;
    }
    for (const c of chars()) {
      if (c.kind !== 'sphere') continue;
      const d = p.distanceTo(c.center) - c.radius;
      if (d < best) best = d;
    }
    return best;
  }

  return { statics, chars, all, segment, inside, pushOut, clampRoom, insideRoom, avoidFans, nearestLanding, inClassroom, CHAR_TAGS };
}
