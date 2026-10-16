// Camera director (owner: qs-camera-director). Contract: docs/CONTRACTS.md §4.5.
// Notes: docs/modules/camera.md.
//
// One main camera (ctx.engine.camera). Each tick (ORDER.CAMERA, after physics and characters):
//   mode pose (title | fp | follow | cinematic) → roll channel → transition blend →
//   framing constraint (follow) → additive motion (shake/kick/whip/flinch) → write camera.
// The camera module is the only writer of engine.timeScale (see slowmo.js).
import * as THREE from 'three';
import { WINDOWS, ROOM, FANS } from '../core/layout.js';
import { clamp, smoothstep, damp, ease as EASE } from '../core/util.js';
import { DEG, Z_AXIS, makePose, copyPose, blendPose, lookQuat, toVec, asChar, headOf, frameTarget, easeFn, warnOnce } from './rig.js';
import { createCollision } from './collide.js';
import { createMotion } from './motion.js';
import { createSlowMo } from './slowmo.js';
import { createFP } from './fp.js';
import { createTitle } from './title.js';
import { createFollow, FOLLOW_STYLES } from './follow.js';
import { createShots } from './shots.js';
import { createFx } from './fx.js';
import { createPip } from './pip.js';

const DANGER = new Set(['warning', 'watching', 'patrol', 'suspicious', 'alert', 'fakeout']);
const FRAME_LIMIT = 0.6;      // follow cam keeps the ball within |ndc| <= 0.6 (F1 checks 0.7)
const MIN_BALL_DIST = 0.3;    // follow cam never gets closer to the ball than this

export async function install(ctx) {
  const { engine, bus, time, input } = ctx;
  const camera = engine.camera;

  const D = {
    camera,
    mode: 'fp',
    base: makePose(),                                       // final pose before additive motion
    roll: 0,                                                // roll channel (radians), all modes
    blend: { active: false, t: 0, dur: 0.25, from: makePose(), ease: EASE.inOutSine },
  };
  const col = createCollision(ctx);
  const motion = createMotion();
  const slow = createSlowMo(ctx);
  const fpc = createFP(ctx);
  const title = createTitle(ctx);
  const follow = createFollow(ctx, D, col);
  const shots = createShots(ctx, D, col);
  const _sv = new THREE.Vector3();
  function screenOf(p) {
    const W = window.innerWidth || 960, H = window.innerHeight || 540;
    if (p && typeof p === 'object' && !Array.isArray(p) && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z !== 'number' && !p.isVector3) {
      return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 ? [p.x * W, p.y * H] : [p.x, p.y];
    }
    const v = p ? headOf(ctx, p, _sv) : null;
    if (v) {
      v.project(camera);
      if (v.z < 1) return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
    }
    return [W / 2, H * 0.45];
  }
  const fx = createFx(ctx, { screenOf });
  const pip = createPip(ctx, fx);

  let phase = 'boot';
  let lastStyle = 'chase';
  const reduced = () => !!ctx.settings?.reducedMotion;

  // ------------------------------------------------------------------ mode plumbing
  function startBlend(dur, ease = EASE.inOutSine) {
    copyPose(D.blend.from, D.base);
    D.blend.t = 0; D.blend.dur = Math.max(0.01, dur); D.blend.ease = ease; D.blend.active = true;
  }
  function setMode(m, blendDur = 0, extra) {
    if (blendDur > 0) startBlend(blendDur); else D.blend.active = false;
    const changed = D.mode !== m;
    if (changed && D.mode === 'cinematic' && m !== 'cinematic') shots.cancelAll();
    if (changed && m === 'title') title.start();
    D.mode = m;
    if (changed || extra) bus.emit('cam:mode', { mode: m, ...(m === 'follow' ? { style: follow.style } : {}), ...(extra || {}) });
    syncRenderFn();
  }
  let rollTok = 0;
  function rollTo(rad, dur = 0, ease, clock) {
    const tok = ++rollTok, from = D.roll;
    rad = Number.isFinite(rad) ? rad : 0;
    if (!(dur > 0) || Math.abs(rad - from) < 1e-6) { D.roll = rad; return Promise.resolve(); }
    return time.tween({ duration: dur, clock: clock === 'ui' ? 'ui' : 'game', ease: easeFn(ease, EASE.inOutCubic), onUpdate: (k) => { if (tok === rollTok) D.roll = from + (rad - from) * k; } });
  }
  Object.assign(D, { setMode, startBlend, rollTo, refresh: () => step(0, 0, false), kick: (a) => kick(a) });

  // ------------------------------------------------------------------ per-tick pose
  const _pose = makePose();
  const _qRoll = new THREE.Quaternion(), _qOff = new THREE.Quaternion(), _off = new THREE.Vector3();
  const _ndc = new THREE.Vector2();
  function step(dt, uiDt, full) {
    const pose = _pose;
    switch (D.mode) {
      case 'title': title.pose(uiDt, pose); break;
      case 'follow': follow.pose(dt, uiDt, pose); break;
      case 'cinematic': shots.pose(dt, uiDt, pose); break;
      default: fpc.pose(dt, uiDt, pose);
    }
    if (D.roll) pose.quat.multiply(_qRoll.setFromAxisAngle(Z_AXIS, D.roll));
    const blending = D.blend.active;
    if (D.blend.active) {
      D.blend.t += uiDt;
      const raw = Math.min(1, D.blend.t / D.blend.dur);
      blendPose(D.blend.from, pose, D.blend.ease(raw), pose);
      if (raw >= 1) D.blend.active = false;
    }
    const ball = ctx.gameplay?.ball;
    if (D.mode === 'follow' && ball?.pos) {
      // never closer than MIN_BALL_DIST (the launch pull-out blend would otherwise pass through the ball)
      _off.subVectors(pose.pos, ball.pos);
      const d = _off.length();
      if (blending && d < MIN_BALL_DIST) {
        if (d < 1e-4) _off.set(0, 0, 1).applyQuaternion(pose.quat); else _off.divideScalar(d);
        pose.pos.copy(ball.pos).addScaledVector(_off, MIN_BALL_DIST);
      }
      frameTarget(pose, ball.pos, camera.aspect || 1.7, FRAME_LIMIT);
    }
    copyPose(D.base, pose);
    camera.position.copy(pose.pos);
    camera.quaternion.copy(pose.quat);
    if (full && motion.out.active) {
      camera.position.add(_off.copy(motion.out.pos).applyQuaternion(pose.quat));
      camera.quaternion.multiply(_qOff.setFromEuler(motion.out.rot));
    }
    const fov = clamp(pose.fov, 5, 120);
    if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    if (!full) syncRenderFn();
  }

  // ------------------------------------------------------------------ render function (PiP / arm mask)
  let customRender = false;
  const foreignVisible = () => camera.children.some((c) => c.visible && !c.userData?.camKeep);
  function renderFrame() {
    const hidden = [];
    if (D.mode !== 'fp') for (const c of camera.children) if (c.visible && !c.userData?.camKeep) { c.visible = false; hidden.push(c); }
    try { pip.render(); } finally { for (const c of hidden) c.visible = true; }
  }
  function syncRenderFn() {
    const need = pip.on || (D.mode !== 'fp' && foreignVisible());
    if (need !== customRender) { customRender = need; engine.setRenderFn(need ? renderFrame : null); }
  }

  // ------------------------------------------------------------------ public: modes
  function toFP(opts = {}) {
    const instant = !!opts?.instant;
    if (D.mode === 'cinematic') shots.cancelAll();
    rollTo(0, 0);
    const wasFP = D.mode === 'fp';
    setMode('fp', instant || wasFP ? 0 : Number.isFinite(+opts?.dur) ? +opts.dur : 0.5);
    if (instant) step(0, 0, false);
    return Promise.resolve();
  }
  function followBall(style, opts = {}) {
    if (style && FOLLOW_STYLES.includes(style)) lastStyle = style;
    follow.begin(lastStyle);
    rollTo(0, 0);
    setMode('follow', Number.isFinite(+opts?.blend) ? +opts.blend : 0.3, { style: follow.style });
    return Promise.resolve();
  }
  function cycleFollowStyle() {
    if (D.mode !== 'follow') { lastStyle = FOLLOW_STYLES[(FOLLOW_STYLES.indexOf(lastStyle) + 1) % FOLLOW_STYLES.length]; return lastStyle; }
    startBlend(0.35, EASE.inOutCubic);
    lastStyle = follow.cycle();
    bus.emit('cam:mode', { mode: 'follow', style: lastStyle });
    return lastStyle;
  }

  // ------------------------------------------------------------------ public: effects
  function shake(amp = 0.3, dur = 0.4) { motion.shake(amp, dur); }
  function kick(amp = 0.3) { motion.impulse('kick', clamp(+amp || 0.3, -2, 2) * 9); }
  let slowSeq = 0;
  function slowMo(scale = 0.3, dur = 1, opts = {}) {
    try {
      const s = Number.isFinite(+scale) ? +scale : 1;
      const d = Number.isFinite(+dur) && +dur > 0 ? +dur : 1;
      if (Math.abs(s - 1) < 1e-3) { slow.releasePrefix('script'); return time.waitUI(Number.isFinite(+dur) && +dur > 0 ? +dur : 0); }
      return slow.request(`script#${++slowSeq}`, s, d, { snap: opts?.ease === 'snap', maxLife: d + 0.5 });
    } catch (e) { warnOnce('slowMo', 'slowMo failed', e?.message); return Promise.resolve(); }
  }
  const wrapFx = (name, fn) => (...a) => { try { return Promise.resolve(fn(...a)); } catch (e) { warnOnce(name, `${name} failed`, e?.message); return Promise.resolve(); } };

  // ------------------------------------------------------------------ flight automation
  const flight = { active: false, apexDone: false, approachDone: false, prevVy: 0 };
  let landingBeat = Promise.resolve();
  const metrics = { flights: [], current: null, get last() { return metrics.flights[metrics.flights.length - 1] || null; } };

  function onApex() {
    if (!flight.active || flight.apexDone) return;
    flight.apexDone = true;
    slow.request('apex', 0.4, 0.5);
  }

  bus.on('ball:launched', (p) => {
    if (phase === 'ending' || phase === 'card') return;
    Object.assign(flight, { active: true, apexDone: false, approachDone: false, prevVy: p?.vel?.y ?? 0 });
    metrics.current = { style: lastStyle, frames: 0, inside: 0, occluded: 0, maxAbs: 0, ratio: null };
    if (D.mode === 'fp') kick(0.35);
    slow.request('launch', 0.1, 0.15, { snap: true });
    if (D.mode === 'cinematic') shots.cancelAll();
    followBall(lastStyle, { blend: 0.25 });
    D.blend.ease = EASE.outCubic;
  });
  bus.on('ball:apex', () => onApex());
  bus.on('ball:nearMiss', (p) => {
    if (!flight.active || D.mode !== 'follow') return;
    const pos = toVec(p?.pos);
    let dir = 1;
    if (pos) { _off.subVectors(pos, camera.position); dir = _off.dot(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)) > 0 ? 1 : -1; }
    motion.impulse('whip', dir * (reduced() ? 0.2 : 0.55) * 9);
    slow.request('nearMiss', 0.5, 0.25);
  });
  bus.on('ball:willpower', (p) => {
    if (p?.on && flight.active) slow.request('willpower', 0.3, Infinity, { maxLife: 8 });
    else slow.release('willpower');
  });
  bus.on('ball:hit', (p) => {
    if (!flight.active || D.mode !== 'follow') return;
    const sp = +p?.speed || 0;
    if (sp > 0.8) shake(Math.min(0.25, sp * 0.035), 0.22);
  });
  bus.on('teacher:state', (p) => {
    const s = p?.state;
    const ballFlying = ctx.gameplay?.ball?.state === 'flying';
    if (DANGER.has(s)) {
      if (flight.active && ballFlying && D.mode === 'follow') {
        if (!pip.on) { pip.set(true, { auto: true }); slow.request('pip', 0.35, 0.55); syncRenderFn(); }
      } else if (D.mode === 'fp' && phase === 'aim' && s === 'warning') {
        motion.impulse('flinch', (reduced() ? 0.2 : 0.55) * 9);
      }
    } else if ((s === 'writing' || s === 'idle') && pip.on && pip.auto) {
      pip.set(false); syncRenderFn();
    }
  });
  bus.on('ball:landed', (L) => {
    if (!flight.active) return;
    flight.active = false;
    slow.release('willpower', 'pip', 'nearMiss');
    if (slow.has('approach')) slow.extend('approach', 0.3);
    if (pip.on) { pip.set(false); syncRenderFn(); }
    const m = metrics.current;
    if (m) { m.ratio = m.frames ? +(m.inside / m.frames).toFixed(4) : null; m.avgDist = m.frames ? +(m.distSum / m.frames).toFixed(3) : null; delete m.distSum; m.landing = L?.type ?? null; metrics.flights.push(m); if (metrics.flights.length > 40) metrics.flights.shift(); metrics.current = null; }
    if (D.mode === 'follow') { try { landingBeat = landingShot(L); } catch (e) { warnOnce('landing', 'landing shot failed', e?.message); landingBeat = Promise.resolve(); } }
  });

  /** Low-angle "freeze-frame" on the ball and its recipient (0.6 s, UI clock), then story takes over. */
  function landingShot(L) {
    const b = ctx.gameplay?.ball;
    const bp = toVec(L?.pos) || (b?.pos ? b.pos.clone() : null);
    if (!bp || !Number.isFinite(bp.x + bp.y + bp.z)) return Promise.resolve();
    const owner = L?.ownerId ? asChar(ctx, L.ownerId) : null;
    let p1, l1, fov = 42;
    if (L?.type === 'outside') {
      const w = WINDOWS.find((x) => x.open) || WINDOWS[1];
      p1 = new THREE.Vector3(ROOM.minX + 0.5, w.sillY + 0.7, w.z + 0.9);
      l1 = bp.clone(); fov = 48;
    } else if (L?.type === 'fan') {
      const f = FANS.reduce((a, c) => (Math.hypot(c.x - bp.x, c.z - bp.z) < Math.hypot(a.x - bp.x, a.z - bp.z) ? c : a), FANS[0]);
      const away = new THREE.Vector3(-f.x, 0, -f.z); if (away.lengthSq() < 1e-4) away.set(0, 0, 1); away.normalize();
      p1 = new THREE.Vector3(f.x, 1.45, f.z).addScaledVector(away, 1.7);
      l1 = new THREE.Vector3(f.x, f.bladeY - 0.1, f.z); fov = 55;
    } else {
      const head = owner && owner.root?.visible !== false ? headOf(ctx, owner, new THREE.Vector3()) : null;
      const dir = head ? new THREE.Vector3().subVectors(bp, head) : new THREE.Vector3().subVectors(camera.position, bp);
      dir.y = 0;
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
      dir.normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      p1 = bp.clone().addScaledVector(dir, 0.75).addScaledVector(side, 0.22);
      p1.y = bp.y + 0.1;
      l1 = head ? bp.clone().lerp(head, 0.5) : bp.clone();
      const list = col.all(true);
      col.pushOut(p1, 0.08, list, { charPad: 0.04 });
      col.clampRoom(p1, 0.12);
      if (col.segment(p1, bp, list, 0.01, { charPad: 0.02 }).t < 0.95) { p1.y += 0.3; col.pushOut(p1, 0.08, list); }
      // widen until both the ball and the face fit comfortably
      const fwd = new THREE.Vector3().subVectors(l1, p1).normalize();
      let maxA = 0;
      const headTop = head ? head.clone().setY(head.y + 0.22) : null;
      for (const q of head ? [bp, head, headTop] : [bp]) maxA = Math.max(maxA, fwd.angleTo(new THREE.Vector3().subVectors(q, p1)));
      fov = clamp((2 * maxA) / DEG / 0.62 + 6, 34, 72);
    }
    const p2 = p1.clone().lerp(bp, 0.1);
    kick(0.12);
    return shots.lerpMove(p2, l1, fov - 3, { dur: 0.6, clock: 'ui', ease: EASE.outQuad, from: { pos: p1, look: l1, fov } });
  }

  function flightTick() {
    const b = ctx.gameplay?.ball;
    if (!flight.active || !b?.pos) return;
    if (b.state !== 'flying') return;
    const vy = b.vel?.y ?? 0;
    if (!flight.apexDone && flight.prevVy > 0 && vy <= 0) onApex();
    flight.prevVy = vy;
    if (!flight.approachDone && vy < -0.2 && (b.t ?? 1) > 0.1 && col.nearestLanding(b.pos) < 1.2) {
      flight.approachDone = true;
      slow.request('approach', 0.25, Infinity, { maxLife: 2.2 });
    }
  }

  function metricsTick() {
    const m = metrics.current, b = ctx.gameplay?.ball;
    if (!m || !b?.pos || b.state !== 'flying' || D.mode !== 'follow') return;
    _sv.copy(b.pos).project(camera);
    const ax = Math.max(Math.abs(_sv.x), Math.abs(_sv.y));
    m.frames++;
    if (_sv.z < 1 && ax <= 0.7) m.inside++;
    m.maxAbs = Math.max(m.maxAbs, +ax.toFixed(3));
    const dist = camera.position.distanceTo(b.pos);
    m.distSum = (m.distSum || 0) + dist; if (dist < (m.minDist ?? 99)) m.minAt = { t: +(b.t ?? 0).toFixed(3), blend: D.blend.active, ball: b.pos.toArray().map((v) => +v.toFixed(2)), cam: camera.position.toArray().map((v) => +v.toFixed(2)) }; m.minDist = Math.min(m.minDist ?? 99, +dist.toFixed(3)); m.maxDist = Math.max(m.maxDist ?? 0, +dist.toFixed(3));
    const oc = col.segment(camera.position, b.pos, col.all(), 0, { charPad: 0 });
    if (oc.t < 0.97) { m.occluded++; const k = `${oc.hit?.tag}:${oc.hit?.ownerId ?? ''}`; (m.occBy ||= {})[k] = (m.occBy[k] || 0) + 1; m.occAt ||= { t: +(b.t ?? 0).toFixed(3), ball: b.pos.toArray().map((v) => +v.toFixed(2)), cam: camera.position.toArray().map((v) => +v.toFixed(2)), hitT: +oc.t.toFixed(2) }; }
  }

  let speedK = 0;
  function overlayTick(uiDt) {
    const b = ctx.gameplay?.ball;
    let want = 0, cx = 0.5, cy = 0.5;
    if (D.mode === 'follow' && flight.active && b?.state === 'flying' && !reduced()) {
      const sp = b.vel?.length?.() ?? 0;
      want = smoothstep(2.5, 9.5, sp) * (0.55 + 0.45 * clamp(engine.timeScale, 0, 1));
      _sv.copy(b.pos).project(camera);
      cx = (_sv.x + 1) / 2; cy = (1 - _sv.y) / 2;
    }
    speedK += (want - speedK) * damp(8, uiDt);
    if (speedK < 0.02 && want === 0) speedK = 0;
    fx.setSpeed(speedK, cx, cy);
    const slowK = D.mode === 'follow' || (D.mode === 'cinematic' && phase === 'flight') ? clamp((1 - engine.timeScale) / 0.7, 0, 1) : 0;
    fx.setVignette(+(slowK * 0.85).toFixed(3));
  }

  // ------------------------------------------------------------------ phases / round reset
  function hardReset() {
    shots.cancelAll();
    slow.clear();
    fx.resetAll();
    pip.set(false);
    motion.reset();
    rollTok++; D.roll = 0;
    D.blend.active = false;
    fpc.reset();
    flight.active = false;
    metrics.current = null;
    speedK = 0;
    landingBeat = Promise.resolve();
    D.mode = 'fp';
    setMode('fp', 0, { reset: true });
    step(0, 0, false);
  }
  bus.on('round:setup', () => hardReset());
  bus.on('phase', (p) => {
    phase = p?.to;
    switch (phase) {
      case 'title':
        slow.clear(); pip.set(false); fx.clearSoft(0.4); flight.active = false;
        rollTo(0, 0); setMode('title'); break;
      case 'letter':
        if (D.mode !== 'title') { rollTo(0, 0); setMode('title'); }
        break;
      case 'intro':
        toFP({ dur: 0.9 }); break;
      case 'aim':
        slow.clear(); pip.set(false); fx.clearSoft(0.3); flight.active = false;
        toFP({ instant: D.mode === 'fp', dur: 0.45 }); break;
      case 'ending':
        pip.set(false); slow.release('willpower', 'pip', 'nearMiss', 'launch'); break;
      case 'card':
        slow.clear(); pip.set(false); flight.active = false; break;
      default: break;
    }
    syncRenderFn();
  });

  // ------------------------------------------------------------------ main update
  engine.onUpdate((dt, t) => {
    const uiDt = t.uiDt;
    if (D.mode === 'follow' && input.enabled && input.pressed('KeyC')) cycleFollowStyle();
    flightTick();
    slow.update(uiDt);
    motion.update(uiDt, reduced());
    title.update(D.mode === 'title');
    step(dt, uiDt, true);
    pip.update(uiDt);
    metricsTick();
    overlayTick(uiDt);
    syncRenderFn();
  }, engine.ORDER.CAMERA);

  // ------------------------------------------------------------------ API (contract §4.5 + additions)
  const cam = {
    camera,
    get mode() { return D.mode; },
    set mode(m) {
      if (m === 'fp') toFP({ instant: true });
      else if (m === 'follow') followBall();
      else if (m === 'title') setMode('title');
      else if (m === 'cinematic') { shots.holdHere(); setMode('cinematic'); }
    },
    fp: fpc.fp,
    toFP, followBall, cycleFollowStyle,
    get followStyle() { return D.mode === 'follow' ? follow.style : lastStyle; },
    /** Addition: choose the follow style used by the next/current flight without switching mode. */
    setFollowStyle(s) { if (FOLLOW_STYLES.includes(s)) { lastStyle = s; if (D.mode === 'follow' && follow.style !== s) { startBlend(0.35, EASE.inOutCubic); follow.begin(s); bus.emit('cam:mode', { mode: 'follow', style: s }); } } return lastStyle; },
    shot: shots.shot, cut: shots.cut,
    sequence: (list) => shots.sequence(list, cam),
    closeUp: shots.closeUp, twoShot: shots.twoShot, overShoulder: shots.overShoulder, wide: shots.wide,
    orbit: shots.orbit, crashZoom: shots.crashZoom, dutch: shots.dutch, track: shots.track, lookAt: shots.lookAt,
    shake, kick, slowMo,
    letterbox: wrapFx('letterbox', fx.letterbox),
    fade: wrapFx('fade', fx.fade),
    flash: wrapFx('flash', fx.flash),
    irisHeart: wrapFx('irisHeart', fx.irisHeart),
    pip(on, opts = {}) { try { pip.set(!!on, opts || {}); syncRenderFn(); } catch (e) { warnOnce('pip', 'pip failed', e?.message); } return Promise.resolve(); },
    // --- additions (docs/modules/camera.md)
    afterLanding: () => landingBeat,
    clearEffects: (dur = 0.3) => fx.clearSoft(dur),
    setFxOverUI: (on) => fx.setOverUI(!!on),
    metrics,
    debug: () => ({
      mode: D.mode, followStyle: follow.style, phase, timeScale: +engine.timeScale.toFixed(3), slowTarget: slow.target, slowRequests: slow.ids(),
      roll: +(D.roll / DEG).toFixed(2), fov: +camera.fov.toFixed(2), pip: pip.on, customRender, ...fx.state(),
      pos: camera.position.toArray().map((v) => +v.toFixed(3)),
    }),
    _internals: { D, col, slow, follow, pip, fx, motion },
  };
  ctx.cam = cam;
  step(0, 0, false);
}
