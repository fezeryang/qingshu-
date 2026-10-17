// Cinematic shot library (mode 'cinematic'): shot/cut/sequence and the presets of contract §4.5.
// Each call creates a "move" that is evaluated every tick by the director (so live targets such as
// orbit/track follow moving characters). A new move supersedes the previous one, whose Promise then
// resolves immediately. Every public function catches its own errors and always resolves.
// (owner: qs-camera-director)
import * as THREE from 'three';
import { ROOM } from '../core/layout.js';
import { clamp, damp, ease as EASE } from '../core/util.js';
import {
  DEG, UP, lookQuat, toVec, asChar, headOf, facingOf, headRadius, visualHeadRadius, easeFn, angleArg, rotY, forwardOf, copyPose, warnOnce,
} from './rig.js';

// Built-in classroom framings (used when the world doesn't provide classroom anchors).
const CLASSROOM = {
  camWide: { pos: [3.7, 2.45, 4.1], look: [-1.2, 0.9, -3.2] },
  camBack: { pos: [0, 2.3, 4.2], look: [0, 1.1, -4] },
  camFront: { pos: [0.6, 2.2, -4.9], look: [-0.4, 0.95, 1.5] },
  camWindow: { pos: [-4.55, 2.1, 3.6], look: [0.5, 0.9, -2.5] },
  camHigh: { pos: [4.4, 2.95, 4.2], look: [-1.5, 0.4, -1.5] },
};

export function createShots(ctx, D, col) {
  const { time } = ctx;
  let cur = null;
  const _f = new THREE.Vector3(), _l = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

  function safe(name, fn) {
    return (...args) => {
      try { const r = fn(...args); return r && typeof r.then === 'function' ? r.catch((e) => { warnOnce(name + e, name, e); }) : Promise.resolve(r); }
      catch (e) { warnOnce(name + e?.message, `${name} failed:`, e?.message || e); return Promise.resolve(); }
    };
  }

  const setLook = (out, l) => { if (out.look) { out.look.copy(l); out.hasLook = true; } };
  function finish(m) { if (m && !m.done) { m.done = true; m.resolve(); } }
  function mkMove(evalFn) {
    const m = { k: 0, done: false, eval: evalFn, resolve: null };
    m.promise = new Promise((r) => { m.resolve = r; });
    return m;
  }
  function begin(m, blend = 0) {
    if (cur && cur !== m) finish(cur);
    cur = m;
    D.setMode('cinematic', blend);
    return m;
  }
  function cancelAll() { finish(cur); cur = null; }

  /** Director hook: evaluate the current move. */
  function pose(dt, uiDt, out) {
    if (!cur) { holdHere(); }
    out.hasLook = false;
    cur.eval(out, dt, uiDt);
    return out;
  }
  function holdHere() {
    const p = D.base.pos.clone(), l = p.clone().add(forwardOf(D.base.quat, _f).multiplyScalar(3)), fov = D.base.fov;
    const m = mkMove((out) => { out.pos.copy(p); lookQuat(p, l, 0, out.quat); out.fov = fov; setLook(out, l); });
    m.k = 1; finish(m); cur = m;
  }

  /**
   * Core interpolated move. p1/l1/f1 are the end pose; start = current camera (or opts.from).
   * opts: {dur, ease, clock, from:{pos, look, fov}, blend}
   */
  function lerpMove(p1, l1, f1, opts = {}) {
    const dur = Number.isFinite(+opts.dur) ? Math.max(0, +opts.dur) : 0;
    let p0, l0, f0;
    if (opts.from) {
      p0 = toVec(opts.from.pos) || p1.clone();
      l0 = toVec(opts.from.look) || l1.clone();
      f0 = Number.isFinite(opts.from.fov) ? opts.from.fov : f1;
    } else {
      p0 = D.base.pos.clone();
      f0 = D.base.fov;
      const focus = Math.max(0.5, p1.distanceTo(l1));
      l0 = p0.clone().add(forwardOf(D.base.quat, _f).multiplyScalar(focus));
    }
    const P1 = p1.clone(), L1 = l1.clone();
    const m = mkMove((out) => {
      const k = m.k;
      out.pos.lerpVectors(p0, P1, k);
      _l.lerpVectors(l0, L1, k);
      lookQuat(out.pos, _l, 0, out.quat);
      setLook(out, _l);
      out.fov = f0 + (f1 - f0) * k;
    });
    m.k = dur > 0 ? 0 : 1;
    m.end = { pos: P1, look: L1, fov: f1 };
    begin(m, opts.blend || 0);
    if (dur > 0) {
      time.tween({ duration: dur, clock: opts.clock === 'ui' ? 'ui' : 'game', ease: easeFn(opts.ease, EASE.inOutCubic), onUpdate: (k) => { m.k = k; } })
        .then(() => finish(m));
    } else { finish(m); D.refresh(); }
    return m.promise;
  }

  const numOr = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);

  // ---------------------------------------------------------------- basic shots
  function shot(o = {}) {
    const p1 = toVec(o.pos) || D.base.pos.clone();
    let l1 = toVec(o.look);
    if (!l1) l1 = p1.clone().add(forwardOf(D.base.quat, _f).multiplyScalar(3));
    const dur = numOr(o.dur, 0);
    D.rollTo(numOr(o.roll, 0) * DEG, dur, o.ease, o.clock);
    return lerpMove(p1, l1, clamp(numOr(o.fov, 50), 5, 120), { dur, ease: o.ease, clock: o.clock });
  }
  function cut(o = {}) { return shot({ ...o, dur: 0 }); }

  async function sequence(list = [], cam) {
    for (const s of Array.isArray(list) ? list : []) {
      try {
        if (typeof s === 'function') await s(cam);
        else if (s && typeof s.preset === 'string' && typeof cam[s.preset] === 'function') await cam[s.preset](...(Array.isArray(s.args) ? s.args : []));
        else if (s && (s.pos || s.look)) await shot(s);
        else if (s && s.wait > 0) await time.wait(+s.wait);
        if (s && s.hold > 0) await time.wait(+s.hold);
      } catch (e) { warnOnce('seq' + e?.message, 'sequence step failed:', e?.message || e); }
    }
  }

  // ---------------------------------------------------------------- framing helpers
  const others = (ids) => (c) => ids.includes(c.ownerId);
  /** Is a camera position usable (in room, not inside geometry, clear line to all `targets`)? */
  const _cq = new THREE.Quaternion(), _cv = new THREE.Vector3();
  /** Another head close to the lens and inside the frame (looking at `look` with `fov`)? */
  function cluttered(pos, look, fov, list, exclude) {
    lookQuat(pos, look, 0, _cq).invert();
    const tanV = Math.tan(((fov || 40) * DEG) / 2), tanH = tanV * (D.camera.aspect || 1.7);
    for (const c of list) {
      if (c.kind !== 'sphere' || !(c.tag === 'head' || c.tag === 'teacher') || (exclude && exclude(c))) continue;
      if (pos.distanceTo(c.center) > 1.5) continue;
      _cv.subVectors(c.center, pos).applyQuaternion(_cq);
      if (_cv.z > -0.05) continue;
      const vr = c.radius * 1.8; // chibi hair/head is much bigger than the head collider
      const nx = (Math.abs(_cv.x) - vr) / -_cv.z / tanH, ny = (Math.abs(_cv.y) - vr) / -_cv.z / tanV;
      if (nx < 0.92 && ny < 0.92) return true;
    }
    return false;
  }
  function clearPos(pos, targets, exclude, list, fov) {
    if (fov && targets.length && cluttered(pos, targets[0], fov, list, exclude)) return false;
    if (!col.insideRoom(pos, 0.12)) return false;
    if (col.inside(pos, list, 0.1, exclude)) return false;
    // no third person's head right in front of the lens
    for (const c of list) if (c.kind === 'sphere' && (c.tag === 'head' || c.tag === 'teacher') && !(exclude && exclude(c)) && pos.distanceTo(c.center) < c.radius + 0.32) return false;
    for (const t of targets) if (col.segment(pos, t, list, 0.02, { charPad: 0.05, skip: exclude }).t < 0.97) return false;
    return true;
  }
  /** Look point with headroom / thirds for a head at `head` seen from `pos`. */
  function composeLook(pos, head, r, fov, facing, lead = 0.18) {
    const dist = pos.distanceTo(head);
    const H = dist * Math.tan((fov * DEG) / 2);
    const eyes = head.y - r * 0.1, top = head.y + r * 1.05;
    const lookY = Math.min(eyes, Math.max(eyes - 0.33 * H, top - 0.9 * H));
    const look = new THREE.Vector3(head.x, lookY, head.z);
    if (facing) {
      _a.subVectors(head, pos).setY(0).normalize();
      const right = _b.crossVectors(_a, UP).normalize();
      const s = facing.dot(right);
      look.addScaledVector(right, s * lead * H * (D.camera.aspect || 1.7));
    }
    return look;
  }

  // ---------------------------------------------------------------- presets
  function closeUp(target, o = {}) {
    const ch = asChar(ctx, target);
    const head = headOf(ctx, target, new THREE.Vector3());
    if (!head) { warnOnce('closeUp-target', 'closeUp: unknown target', target); return Promise.resolve(); }
    const fov = clamp(numOr(o.fov, 35), 8, 90), dur = numOr(o.dur, 0.6);
    const r = ch ? visualHeadRadius(ch) : 0.12;
    // default distance: 0.7 m, pulled back so the whole (chibi) head fits with headroom; explicit dist wins
    const fit = (r * 1.45) / Math.tan((fov * DEG) / 2);
    const dist = clamp(Number.isFinite(+o.dist) && o.dist !== null ? +o.dist : Math.max(0.7, fit), 0.2, 6);
    const facing = ch ? facingOf(ch, new THREE.Vector3()) : _f.subVectors(D.base.pos, head).setY(0).normalize().clone();
    const sideA = o.side === 'left' ? 65 * DEG : o.side === 'right' ? -65 * DEG : 0;
    const h = numOr(o.height, 0.03);
    const list = col.all(true);
    const ex = ch ? others([ch.id]) : null;
    let pos = null;
    for (const da of [0, 22, -22, 42, -42, 65, -65]) {
      for (const dh of [0, 0.15, -0.08]) {
        const dir = rotY(facing, sideA + da * DEG, new THREE.Vector3());
        const p = head.clone().addScaledVector(dir, dist); p.y += h + dh;
        if (clearPos(p, [head], ex, list, fov)) { pos = p; break; }
      }
      if (pos) break;
    }
    if (!pos) {
      pos = head.clone().addScaledVector(rotY(facing, sideA, new THREE.Vector3()), Math.min(dist, 0.5)); pos.y += h;
      col.clampRoom(pos, 0.1);
    }
    const look = composeLook(pos, head, r, fov, ch ? facing : null);
    D.rollTo(numOr(o.roll, 0) * DEG, dur, o.ease);
    return lerpMove(pos, look, fov, { dur, ease: o.ease || EASE.inOutCubic });
  }

  function twoShot(a, b, o = {}) {
    const ca = asChar(ctx, a), cb = asChar(ctx, b);
    const ha = headOf(ctx, a, new THREE.Vector3()), hb = headOf(ctx, b, new THREE.Vector3());
    if (!ha || !hb) return ha ? closeUp(a, o) : hb ? closeUp(b, o) : Promise.resolve();
    const dur = numOr(o.dur, 0.6);
    let fov = clamp(numOr(o.fov, 40), 15, 90);
    const mid = ha.clone().add(hb).multiplyScalar(0.5);
    const axis = _a.subVectors(hb, ha).setY(0);
    const sep = axis.length();
    if (sep < 0.05) axis.set(1, 0, 0); else axis.divideScalar(sep);
    const n = new THREE.Vector3(-axis.z, 0, axis.x);
    const fs = new THREE.Vector3();
    if (ca) fs.add(facingOf(ca, _f));
    if (cb) fs.add(facingOf(cb, _f));
    let s = fs.dot(n);
    if (Math.abs(s) < 0.25) s = _b.subVectors(D.base.pos, mid).dot(n) || 1; // facing each other: keep the current side
    if (s < 0) n.negate();
    // both looking the same way (e.g. seated in a column): swing toward their faces for a 3/4 view
    if (fs.length() > 1.2 && Math.abs(fs.dot(n)) < 0.5 * fs.length()) n.addScaledVector(fs.normalize(), 0.9).setY(0).normalize();
    const aspect = D.camera.aspect || 1.7;
    const fitDist = (fv) => {
      const tanV = Math.tan((fv * DEG) / 2), tanH = tanV * aspect;
      const across = sep * Math.abs(axis.x * n.z - axis.z * n.x); // separation as seen from the camera side
      return Math.max((across / 2 / 0.5 + 0.2) / tanH, (across / 2 + 0.38) / tanH, (0.42 + Math.abs(ha.y - hb.y) / 2) / tanV, 0.9);
    };
    const dist = fitDist(fov);
    const list = col.all(true);
    const ids = [ca?.id, cb?.id].filter(Boolean);
    const ex = ids.length ? others(ids) : null;
    let pos = null;
    for (const da of [0, 20, -20, 38, -38]) {
      for (const dh of [0.05, 0.3, 0.6]) {
        const dir = rotY(n, da * DEG, new THREE.Vector3());
        let d = dist;
        let p = mid.clone().addScaledVector(dir, d); p.y += dh;
        if (!col.insideRoom(p, 0.15)) { // pull in to fit the room, widen the lens
          for (d = dist * 0.85; d > 0.8; d *= 0.85) { p = mid.clone().addScaledVector(dir, d); p.y += dh; if (col.insideRoom(p, 0.15)) break; }
        }
        if (clearPos(p, [mid, ha, hb], ex, list, fov)) { pos = p; if (d < dist) fov = clamp(fov * (dist / d), fov, 80); break; }
      }
      if (pos) break;
    }
    if (!pos) { pos = mid.clone().addScaledVector(n, dist); pos.y += 0.1; col.clampRoom(pos, 0.12); }
    const look = mid.clone(); look.y -= 0.06;
    D.rollTo(numOr(o.roll, 0) * DEG, dur, o.ease);
    return lerpMove(pos, look, fov, { dur, ease: o.ease });
  }

  function overShoulder(from, to, o = {}) {
    const cf = asChar(ctx, from), ct = asChar(ctx, to);
    const hf = headOf(ctx, from, new THREE.Vector3()), ht = headOf(ctx, to, new THREE.Vector3());
    if (!hf || !ht) return ht ? closeUp(to, o) : Promise.resolve();
    const dur = numOr(o.dur, 0.6), fov = clamp(numOr(o.fov, 38), 10, 90);
    const d = _a.subVectors(ht, hf).setY(0);
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize();
    const dir = d.clone();
    const right = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const pref = o.side === 'left' ? -1 : 1;
    const list = col.all(true);
    const ids = [cf?.id, ct?.id].filter(Boolean);
    const exTo = ids.length ? others(ids) : null;
    let pos = null;
    for (const sgn of [pref, -pref]) {
      for (const back of [0.7, 0.55, 0.9]) {
        const p = hf.clone().addScaledVector(dir, -back).addScaledVector(right, 0.4 * sgn); p.y += 0.16;
        if (clearPos(p, [ht], exTo, list, fov) && p.distanceTo(hf) > 0.3) { pos = p; break; }
      }
      if (pos) break;
    }
    if (!pos) { pos = hf.clone().addScaledVector(dir, -0.6).addScaledVector(right, 0.3 * pref); pos.y += 0.14; col.clampRoom(pos, 0.1); }
    const look = ht.clone().lerp(hf, 0.08); look.y -= 0.05;
    D.rollTo(numOr(o.roll, 0) * DEG, dur, o.ease);
    const pr = lerpMove(pos, look, fov, { dur, ease: o.ease });
    if (cur && cf) cur.keep = [cf.id];
    return pr;
  }

  function resolveAnchor(arg) {
    if (typeof arg === 'string') {
      const [setName, key = 'camWide'] = arg.split('.');
      if (setName === 'classroom') return ctx.world?.classroom?.anchors?.[key] || CLASSROOM[key] || CLASSROOM.camWide;
      const set = ctx.stage?.get?.(setName);
      return set?.anchors?.[key] || null;
    }
    if (arg && arg.anchors) return arg.anchors.camWide || null;
    return arg || null;
  }
  function wide(arg, o = {}) {
    const a = resolveAnchor(arg ?? ctx.stage?.current ?? 'classroom');
    const pos = toVec(a?.pos ?? a);
    if (!pos) { warnOnce('wide' + arg, 'wide: no camera anchor for', arg); return Promise.resolve(); }
    let look = toVec(a?.look);
    if (!look) {
      const yaw = Number.isFinite(a?.yaw) ? a.yaw : null;
      look = yaw !== null ? pos.clone().add(new THREE.Vector3(-Math.sin(yaw), -0.15, -Math.cos(yaw)).multiplyScalar(4)) : pos.clone().add(new THREE.Vector3(0, -0.4, -4));
    }
    return shot({ pos, look, fov: numOr(o.fov, numOr(a?.fov, 50)), dur: numOr(o.dur, 0), ease: o.ease, roll: o.roll });
  }

  function orbit(target, o = {}) {
    const getC = (out) => headOf(ctx, target, out);
    const c0 = getC(new THREE.Vector3());
    if (!c0) { warnOnce('orbit-target', 'orbit: unknown target'); return Promise.resolve(); }
    const radius = clamp(numOr(o.radius, 2), 0.3, 30);
    const dur = numOr(o.dur, 3);
    const cur0 = _a.subVectors(D.base.pos, c0);
    const az = Math.atan2(-cur0.x, -cur0.z);
    const from = angleArg(o.fromYaw, az);
    const to = angleArg(o.toYaw, from + 60 * DEG);
    const hAbs = Number.isFinite(+o.height) && o.height !== null ? +o.height : null;
    const fov = clamp(numOr(o.fov, 45), 10, 90);
    const c = new THREE.Vector3();
    const m = mkMove((out) => {
      if (!getC(c)) c.copy(c0);
      const ang = from + (to - from) * m.k;
      out.pos.set(c.x - Math.sin(ang) * radius, hAbs ?? c.y + 0.3, c.z - Math.cos(ang) * radius);
      lookQuat(out.pos, c, 0, out.quat);
      setLook(out, c);
      out.fov = fov;
    });
    begin(m, numOr(o.blend, 0.35));
    D.rollTo(numOr(o.roll, 0) * DEG, 0);
    if (dur > 0) time.tween({ duration: dur, ease: easeFn(o.ease, EASE.inOutSine), onUpdate: (k) => { m.k = k; } }).then(() => finish(m));
    else { m.k = 1; finish(m); D.refresh(); }
    return m.promise;
  }

  function crashZoom(target, o = {}) {
    const ch = asChar(ctx, target);
    const t = headOf(ctx, target, new THREE.Vector3());
    if (!t) return Promise.resolve();
    const p0 = D.base.pos.clone();
    const push = clamp(numOr(o.push, 0.35), 0, 0.85);
    const p1 = p0.clone().lerp(t, push);
    const dist1 = Math.max(0.2, p1.distanceTo(t));
    const r = ch ? visualHeadRadius(ch) : 0.15;
    const fov = clamp(numOr(o.fov, ((2 * Math.atan(r / 0.5 / dist1)) / DEG)), 6, 60);
    const look = t.clone(); look.y -= r * 0.15;
    D.rollTo(numOr(o.roll, 0) * DEG, numOr(o.dur, 0.25));
    return lerpMove(p1, look, fov, { dur: numOr(o.dur, 0.25), ease: o.ease || EASE.outCubic }).then(() => { D.kick(0.25); });
  }

  function dutch(angleDeg = 12, dur = 0.4) {
    const a = typeof angleDeg === 'object' && angleDeg ? numOr(angleDeg.angle, 12) : numOr(angleDeg, 12);
    return D.rollTo(a * DEG, numOr(dur, 0.4));
  }

  function track(obj, o = {}) {
    const getP = (out) => (asChar(ctx, obj) ? headOf(ctx, obj, out) : toVec(obj, out));
    const p0 = getP(new THREE.Vector3());
    if (!p0) { warnOnce('track-target', 'track: unknown target'); return Promise.resolve(); }
    const offset = toVec(o.offset);
    const lookOff = toVec(o.lookOffset) || new THREE.Vector3();
    const local = !!o.local && obj?.isObject3D;
    const dur = numOr(o.dur, 1.5), lag = numOr(o.lag, 14), fov = clamp(numOr(o.fov, 50), 10, 90);
    const st = { init: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), prev: p0.clone(), dir: new THREE.Vector3(), want: new THREE.Vector3() };
    // initial chase direction: from the current camera toward the object
    st.dir.subVectors(p0, D.base.pos).setY(0);
    if (st.dir.lengthSq() < 1e-6) st.dir.set(0, 0, -1);
    st.dir.normalize();
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    const m = mkMove((out, dt, uiDt) => {
      if (!getP(p)) p.copy(st.prev);
      if (offset) {
        st.want.copy(offset);
        if (local) st.want.applyQuaternion(obj.getWorldQuaternion(q));
        st.want.add(p);
      } else {
        if (dt > 0) {
          _a.subVectors(p, st.prev).setY(0);
          if (_a.lengthSq() > 1e-8) st.dir.lerp(_a.normalize(), damp(6, dt)).normalize();
        }
        st.want.copy(p).addScaledVector(st.dir, -0.7); st.want.y += 0.25;
      }
      st.prev.copy(p);
      const k = st.init ? damp(lag, dt > 0 ? dt : uiDt) : 1;
      st.pos.lerp(st.want, k);
      st.look.lerp(_b.copy(p).add(lookOff), st.init ? damp(lag * 1.5, dt > 0 ? dt : uiDt) : 1);
      if (!st.init) { st.pos.copy(st.want); st.look.copy(p).add(lookOff); }
      st.init = true;
      out.pos.copy(st.pos);
      if (col.inClassroom()) col.clampRoom(out.pos, 0.08);
      lookQuat(out.pos, st.look, 0, out.quat);
      setLook(out, st.look);
      out.fov = fov;
    });
    begin(m, numOr(o.blend, 0));
    D.rollTo(numOr(o.roll, 0) * DEG, 0);
    D.refresh();
    if (dur > 0) time.wait(dur).then(() => finish(m)); else finish(m);
    return m.promise;
  }

  /** Extra: pan/zoom to look at a target from where the camera is. */
  function lookAt(target, o = {}) {
    const t = headOf(ctx, target, new THREE.Vector3());
    if (!t) return Promise.resolve();
    return lerpMove(D.base.pos.clone(), t, clamp(numOr(o.fov, D.base.fov), 5, 120), { dur: numOr(o.dur, 0.5), ease: o.ease });
  }

  return {
    pose, cancelAll, lerpMove, holdHere,
    get current() { return cur; },
    get keepIds() { return cur?.keep || null; },
    shot: safe('shot', shot), cut: safe('cut', cut), sequence: (list, cam) => sequence(list, cam).catch(() => {}),
    closeUp: safe('closeUp', closeUp), twoShot: safe('twoShot', twoShot), overShoulder: safe('overShoulder', overShoulder),
    wide: safe('wide', wide), orbit: safe('orbit', orbit), crashZoom: safe('crashZoom', crashZoom), dutch: safe('dutch', dutch),
    track: safe('track', track), lookAt: safe('lookAt', lookAt),
    CLASSROOM, copyPose,
  };
}
