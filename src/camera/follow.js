// Paper-ball follow cam (mode 'follow'). Styles:
//   chase  — behind and above the ball (0.6–1.0 m), looks slightly ahead; orbits a little in bullet time
//   side   — parallel side tracking shot that shows the parabola
//   fpStay — stays at the seat and turns/zooms to watch the ball (half-stands if a head is in the way)
// Every style uses a spring arm against the physics colliders (never inside heads/desks/walls) and the
// director applies a hard framing constraint afterwards (ball within the central 60 %).
// (owner: qs-camera-director)
import * as THREE from 'three';
import { PLAYER_EYE, ROOM, WINDOWS } from '../core/layout.js';
import { clamp, damp } from '../core/util.js';
import { DEG, lookQuat, wrapAngle, forwardOf } from './rig.js';

export const FOLLOW_STYLES = ['chase', 'side', 'fpStay'];
const ZERO = new THREE.Vector3();
const OPEN_WIN = WINDOWS.find((w) => w.open) || null;

export function createFollow(ctx, D, col) {
  const eye = new THREE.Vector3(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);
  const st = {
    style: 'chase', backYaw: 0, orbit: 0, orbitSign: 1, offset: new THREE.Vector3(), arm: 0.8, rise: 0,
    look: new THREE.Vector3(), sideN: new THREE.Vector3(1, 0, 0), sideY: 1.4, fov: 62, init: false,
    lean: 0, leanT: 0, riseT: 0, elev: 0, winK: 0, outside: false, outPos: new THREE.Vector3(),
  };
  const _ideal = new THREE.Vector3(), _want = new THREE.Vector3(), _off = new THREE.Vector3(), _dir = new THREE.Vector3();
  const _lt = new THREE.Vector3(), _vh = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Vector3();

  const ballOf = () => ctx.gameplay?.ball;
  const roomMargin = (p) => Math.min(p.x - ROOM.minX, ROOM.maxX - p.x, p.z - ROOM.minZ, ROOM.maxZ - p.z);

  function chooseSide(p, v) {
    _vh.set(v.x, 0, v.z);
    if (_vh.lengthSq() < 1e-4) { forwardOf(D.base.quat, _vh); _vh.y = 0; }
    if (_vh.lengthSq() < 1e-6) _vh.set(0, 0, -1);
    _vh.normalize();
    const n = _f.set(-_vh.z, 0, _vh.x);
    const a = roomMargin(_q.copy(p).addScaledVector(_vh, 2.2).addScaledVector(n, 2.0));
    const b = roomMargin(_q.copy(p).addScaledVector(_vh, 2.2).addScaledVector(n, -2.0));
    st.sideN.copy(n).multiplyScalar(a >= b ? 1 : -1);
    st.orbitSign = a >= b ? -1 : 1; // orbit toward the roomier side
  }

  /** (Re)initialise for the current ball state; style optional. */
  function begin(style) {
    if (style && FOLLOW_STYLES.includes(style)) st.style = style;
    const b = ballOf();
    const p = b?.pos || D.base.pos, v = b?.vel || ZERO;
    if (Math.hypot(v.x, v.z) > 0.05) st.backYaw = Math.atan2(-v.x, -v.z);
    else { forwardOf(D.base.quat, _f); st.backYaw = Math.atan2(-_f.x, -_f.z); }
    chooseSide(p, v);
    st.orbit = 0; st.winK = 0; st.outside = false; st.elev = 0; st.rise = 0; st.riseT = 0; st.lean = 0; st.leanT = 0; st.init = false;
    st.sideY = p.y + 0.2;
    st.look.copy(p);
  }

  const _e = new THREE.Vector3();
  const ELEV_TRIES = [0, 0.3, 0.6, -0.3, 0.9, -0.6, 1.2, -0.9, -1.2];
  /** Offset swung upward by `e` radians of extra elevation (keeps its length and heading). */
  function elevate(offset, e, out) {
    const len = offset.length();
    const h = Math.hypot(offset.x, offset.z);
    const phi = Math.max(-1.2, Math.min(1.45, Math.atan2(offset.y, h) + e));
    const hx = h > 1e-6 ? offset.x / h : 0, hz = h > 1e-6 ? offset.z / h : 1;
    return out.set(hx * Math.cos(phi) * len, Math.sin(phi) * len, hz * Math.cos(phi) * len);
  }
  /**
   * Spring arm from the ball toward `offset`. If the arm would collapse below `minArm`, swing it upward
   * (same frame) until it is clear; the extra elevation then relaxes slowly. Returns the unit direction.
   */
  function springArm(p, offset, minArm, uiDt, list) {
    const cast = (off) => {
      _want.addVectors(p, off);
      const { t } = col.segment(p, _want, list, 0.09, { charPad: 0.07 });
      return Math.max(0.05, off.length() * t - 0.05);
    };
    // keep the current extra elevation while needed; search up first, then down (ceiling!), else longest arm
    let need = 0;
    if (cast(elevate(offset, st.elev, _e)) < minArm || cast(offset) < minArm) {
      let best = -1, bestE = 0;
      need = null;
      for (const e of ELEV_TRIES) {
        const a = cast(elevate(offset, e, _e));
        if (a >= minArm) { need = e; break; }
        if (a > best) { best = a; bestE = e; }
      }
      if (need === null) need = bestE;
    }
    const snap = !st.init || Math.abs(need) > Math.abs(st.elev) || need * st.elev < 0;
    if (snap) st.elev = need;
    else st.elev += (need - st.elev) * damp(1.6, uiDt);
    elevate(offset, st.elev, _e);
    const arm = cast(_e);
    if (!st.init || arm < st.arm) st.arm = arm;
    else st.arm += (arm - st.arm) * damp(3, uiDt);
    return _dir.copy(_e).normalize();
  }

  const _cand = new THREE.Vector3(), _bestP = new THREE.Vector3();
  function settle(p) {
    col.pushOut(p, 0.1, curList, { charPad: 0.06 });
    col.clampRoom(p, 0.12);
    col.avoidFans(p);
    return p;
  }
  let curList = null;
  /** Push-out / clamp; if that lands the camera on top of the ball (ball touching a head/desk), re-place it. */
  function finishPos(out, list, ball, offset, minD = 0.3) {
    curList = list;
    settle(out.pos);
    if (!ball || out.pos.distanceTo(ball) >= minD * 0.8) return;
    let best = -1;
    for (const e of ELEV_TRIES) {
      elevate(offset, e, _cand).normalize().multiplyScalar(Math.max(minD + 0.08, 0.4)).add(ball);
      settle(_cand);
      const d = _cand.distanceTo(ball);
      const clear = col.segment(ball, _cand, list, 0, { charPad: 0 }).t >= 0.97;
      const score = (clear ? 10 : 0) + Math.min(d, minD);
      if (score > best) { best = score; _bestP.copy(_cand); }
      if (clear && d >= minD) break;
    }
    out.pos.copy(_bestP);
    st.arm = out.pos.distanceTo(ball);
  }

  /**
   * BUG-004: near the open window the cloth curtains (no physics collider; camera-only soft volumes in
   * collide.js) can hide the ball from inside the room. If the inside view is blocked, film from OUTSIDE
   * the window (fixed camera, set once) as long as that line is clear; stay out there once used.
   */
  function windowGuard(out, p, v, list) {
    if (!OPEN_WIN) return;
    const near = p.x < ROOM.minX + 1.0 && Math.abs(p.z - OPEN_WIN.z) < OPEN_WIN.w / 2 + 0.6;
    if (!near && !st.outside) return;
    const clear = (from, skip) => col.segment(from, p, list, 0, { charPad: 0, skip }).t >= 0.97;
    // the cloth hangs ~0.15 m inside the wall: once the ball is past that plane, an outside camera sees it in front of the cloth
    const pastCloth = p.x < ROOM.minX + 0.14;
    const skipCurtain = pastCloth ? (c) => c.camOnly : null;
    if (!st.outside) {
      if (clear(out.pos)) return;
      const sz = Math.abs(v.z) > 0.2 ? Math.sign(v.z) : 1;
      _q.set(ROOM.minX - 1.15, p.y + 0.3, p.z + 0.45 * sz);
      if (!pastCloth || !clear(_q, skipCurtain)) return;
      st.outside = true;
      st.outPos.copy(_q);
      D.blend.active = false; // hard cut through the wall
    } else if (!clear(st.outPos, skipCurtain)) { return; }
    out.pos.copy(st.outPos);
    st.look.copy(p);
    lookQuat(out.pos, p, 0, out.quat);
    out.fov = 55;
  }

  function chase(dt, uiDt, out, b) {
    const p = b.pos, v = b.vel || ZERO;
    const speed = v.length(), hs = Math.hypot(v.x, v.z);
    if (b.state === 'flying' && hs > 0.3) {
      const tgt = Math.atan2(-v.x, -v.z);
      st.backYaw += wrapAngle(tgt - st.backYaw) * (st.init ? damp(3.2, uiDt) : 1);
    }
    const steep = speed > 0.01 ? clamp(-v.y / speed, 0, 1) : 0.5;
    const slowAmt = clamp((1 - ctx.engine.timeScale) / 0.6, 0, 1);
    st.orbit += (st.orbitSign * 26 * DEG * slowAmt - st.orbit) * damp(2.2, uiDt);
    // window exit (BUG-004): near the open window look straight out along the wall normal, through the
    // clear middle of the opening, instead of past the curtains beside it
    const nearWin = !!OPEN_WIN && p.x < ROOM.minX + 1.5 && Math.abs(p.z - OPEN_WIN.z) < OPEN_WIN.w / 2 + 0.6 && v.x < -0.2;
    st.winK += ((nearWin ? 1 : 0) - st.winK) * (st.init ? damp(nearWin ? 9 : 3, uiDt) : nearWin ? 1 : 0);
    st.orbit *= 1 - st.winK;
    const back = 0.84 - 0.16 * steep, up = 0.36 + 0.32 * steep;
    const yaw = st.backYaw + st.orbit + wrapAngle(Math.PI / 2 - (st.backYaw + st.orbit)) * st.winK;
    _ideal.set(Math.sin(yaw) * back, up, Math.cos(yaw) * back);
    if (!st.init) st.offset.copy(_ideal); else st.offset.lerp(_ideal, damp(7, uiDt));
    const list = col.all();
    _off.copy(st.offset);
    const dir = springArm(p, _off, 0.34, uiDt, list);
    out.pos.copy(p).addScaledVector(dir, st.arm);
    finishPos(out, list, p, _off, 0.3);
    _lt.copy(p);
    if (speed > 0.01) _lt.addScaledVector(v, Math.min(0.45, speed * 0.05) / speed);
    if (!st.init) st.look.copy(_lt); else st.look.lerp(_lt, damp(12, uiDt));
    lookQuat(out.pos, st.look, 0, out.quat);
    const fovT = clamp(60 + speed * 0.8, 58, 69) - 7 * slowAmt;
    st.fov = st.init ? st.fov + (fovT - st.fov) * damp(4, uiDt) : fovT;
    out.fov = st.fov;
    windowGuard(out, p, v, list);
  }

  function side(dt, uiDt, out, b) {
    const p = b.pos, v = b.vel || ZERO;
    const slowAmt = clamp((1 - ctx.engine.timeScale) / 0.6, 0, 1);
    st.sideY = st.init ? st.sideY + (p.y + 0.18 - st.sideY) * damp(3.5, uiDt) : p.y + 0.18;
    _ideal.copy(st.sideN).multiplyScalar(1.9);
    _ideal.y = st.sideY - p.y;
    const hs = Math.hypot(v.x, v.z);
    if (hs > 0.1) { _ideal.x -= (v.x / hs) * 0.35; _ideal.z -= (v.z / hs) * 0.35; }
    if (!st.init) st.offset.copy(_ideal); else st.offset.lerp(_ideal, damp(6, uiDt));
    const list = col.all();
    _off.copy(st.offset);
    const dir = springArm(p, _off, 0.6, uiDt, list);
    out.pos.copy(p).addScaledVector(dir, st.arm);
    finishPos(out, list, p, _off, 0.5);
    _lt.copy(p);
    if (hs > 0.01) { _lt.x += v.x * 0.1; _lt.z += v.z * 0.1; }
    if (!st.init) st.look.copy(_lt); else st.look.lerp(_lt, damp(10, uiDt));
    lookQuat(out.pos, st.look, 0, out.quat);
    const fovT = 50 - 5 * slowAmt;
    st.fov = st.init ? st.fov + (fovT - st.fov) * damp(4, uiDt) : fovT;
    out.fov = st.fov;
  }

  function stay(dt, uiDt, out, b) {
    const p = b.pos;
    // stay in the seat; half-stand / lean toward the aisle when a head or desk hides the ball
    const list = col.all();
    _want.copy(eye); _want.y += st.rise; _want.x += st.lean;
    const blocked = col.segment(_want, p, list, 0.02, { charPad: 0.05 }).t < 0.98;
    if (blocked) {
      // probe: would standing up more (or leaning into the aisle) clear the view?
      _q.copy(eye); _q.y += 0.62; _q.x += 0.25;
      const clearUp = col.segment(_q, p, list, 0.02, { charPad: 0.05 }).t >= 0.98;
      st.riseT = clearUp ? 0.62 : 0.45;
      st.leanT = 0.25;
    } else if (st.rise > 0.01) {
      // only sit back down once the lower position also sees the ball
      _q.copy(eye); _q.y += st.rise * 0.5; _q.x += st.lean * 0.5;
      if (col.segment(_q, p, list, 0.02, { charPad: 0.05 }).t >= 0.98) { st.riseT = 0; st.leanT = 0; }
    }
    st.rise += (st.riseT - st.rise) * damp(st.riseT > st.rise ? 9 : 1.5, uiDt);
    st.lean += (st.leanT - st.lean) * damp(st.leanT > st.lean ? 7 : 1.5, uiDt);
    out.pos.copy(eye); out.pos.y += st.rise; out.pos.x += st.lean;
    if (!st.init) st.look.copy(p); else st.look.lerp(p, damp(14, uiDt));
    lookQuat(out.pos, st.look, 0, out.quat);
    const fovT = clamp(66 - out.pos.distanceTo(p) * 5.5, 30, 66);
    st.fov = st.init ? st.fov + (fovT - st.fov) * damp(5, uiDt) : fovT;
    out.fov = st.fov;
  }

  function pose(dt, uiDt, out) {
    const b = ballOf();
    if (!b?.pos) { out.pos.copy(D.base.pos); out.quat.copy(D.base.quat); out.fov = D.base.fov; return out; }
    if (st.style === 'side') side(dt, uiDt, out, b);
    else if (st.style === 'fpStay') stay(dt, uiDt, out, b);
    else chase(dt, uiDt, out, b);
    st.init = true;
    return out;
  }

  function cycle() {
    const i = FOLLOW_STYLES.indexOf(st.style);
    st.style = FOLLOW_STYLES[(i + 1) % FOLLOW_STYLES.length];
    begin();
    return st.style;
  }

  return { begin, pose, cycle, get style() { return st.style; }, set style(s) { if (FOLLOW_STYLES.includes(s)) st.style = s; } };
}
