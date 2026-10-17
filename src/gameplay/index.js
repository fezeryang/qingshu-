// Gameplay: charge-and-throw, ball physics, launch solver, preview, hold-breath nudge, landing.
// Contract: docs/CONTRACTS.md §4.3 (ctx.gameplay) and §5 (Collider, Landing). Notes: docs/modules/gameplay.md
//
//   physics.js  deterministic sphere-vs-collider stepping (shared by live ball, predict, solver)
//   landing.js  physics result → Landing
//   solver.js   simulation-verified solveLaunch
//   fx.js       ball view (tumble/squash/wobble), trajectory dots, paper bits
//   debugdraw.js  ?debug=1 collider wireframes + predicted path
import * as THREE from 'three';
import { FANS, PLAYER_SEAT } from '../core/layout.js';
import { clamp } from '../core/util.js';
import * as P from './physics.js';
import { classifyLanding } from './landing.js';
import { solveLaunch as solve, fanZones } from './solver.js';
import { BallView, TrajectoryDots, PaperBits } from './fx.js';
import { DebugDraw } from './debugdraw.js';

const LOB = (P.PHYS.LOB_DEG * Math.PI) / 180;
const CHARGE_TIME = 1.1;
const WILLPOWER_TIME = 1.5;
const PREVIEW_TIME = 0.35;

export async function install(ctx) {
  const { bus, engine, input } = ctx;
  const cls = () => ctx.world?.classroom;
  const phase = () => ctx.flow?.phase;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ---------------------------------------------------------------- collision scenes
  const staticGrid = new P.Grid();
  let staticSrc = null, staticLen = -1;
  let debug = null;
  function syncStatic(force = false) {
    const list = cls()?.colliders || [];
    if (force || list !== staticSrc || list.length !== staticLen) {
      staticGrid.setColliders(list, (c, i) => `s${i}`);
      staticSrc = list; staticLen = list.length;
      debug?.setStatic(staticGrid.all);
    }
  }
  const live = new P.Scene(staticGrid, new P.Grid());
  const snap = new P.Scene(staticGrid, new P.Grid());
  const prevCenters = new Map();

  function gatherDynamic(withFans) {
    const out = [];
    try { for (const c of cls()?.dynamicColliders?.() || []) if (withFans || c?.tag !== 'fan') out.push(c); } catch (e) { warnOnce('dynamicColliders', e); }
    try { const cc = ctx.cast?.colliders?.(); if (cc) for (const c of cc) out.push(c); } catch (e) { warnOnce('cast.colliders', e); }
    return out;
  }
  /** Live dynamic colliders; colliders without a velocity get one estimated from the last frame. */
  function syncDynamic(dt) {
    live.setDynamic(gatherDynamic(true), P.dynamicKeyFn());
    for (const o of live.dynamic.all) {
      let prev = prevCenters.get(o.key);
      if (!prev) { prev = { x: o.cx, y: o.cy, z: o.cz, ok: false }; prevCenters.set(o.key, prev); }
      if (!o.src?.velocity && prev.ok && dt > 1e-5) {
        let vx = (o.cx - prev.x) / dt, vy = (o.cy - prev.y) / dt, vz = (o.cz - prev.z) / dt;
        const s = Math.hypot(vx, vy, vz);
        if (s > 3) { const f = 3 / s; vx *= f; vy *= f; vz *= f; }
        o.vx = vx; o.vy = vy; o.vz = vz;
      }
      prev.x = o.cx; prev.y = o.cy; prev.z = o.cz; prev.ok = true;
    }
  }
  function snapshot() {
    syncStatic();
    snap.setDynamic(gatherDynamic(false), P.dynamicKeyFn());
    snap.zones = [];
    return snap;
  }
  const warned = new Set();
  function warnOnce(k, e) { if (!warned.has(k)) { warned.add(k); console.warn(`[gameplay] ${k} failed`, e); } }

  const lookups = {
    occupant: (seatId) => ctx.cast?.occupant?.(seatId) ?? null,
    seatOf: (id) => ctx.cast?.seatOf?.(id) ?? null,
    playerSeat: PLAYER_SEAT,
  };
  const fans = () => fanZones(cls()?.fans?.length ? cls().fans : FANS);
  const openings = () => P.defaultOpenings(cls()?.windows?.length ? cls().windows : undefined);

  // ---------------------------------------------------------------- state
  let prop = null;
  try { prop = ctx.characters?.createProp?.('letterBall'); } catch (e) { warnOnce('createProp', e); }
  if (!prop) prop = new THREE.Mesh(new THREE.IcosahedronGeometry(P.PHYS.R, 1), new THREE.MeshStandardMaterial({ color: 0xfff6ee, flatShading: true }));
  const view = new BallView(prop);
  engine.scene.add(view.mesh);
  const dots = new TrajectoryDots(14);
  engine.scene.add(dots.points);
  const bits = new PaperBits(ctx.config?.lowfx ? 24 : 48);
  engine.scene.add(bits.mesh);
  if (ctx.config?.debug) { debug = new DebugDraw(engine.scene); syncStatic(true); }

  const ball = {
    state: 'hidden', pos: V(), vel: V(), t: 0, mesh: view.mesh, hits: [], bounces: 0,
    nearMisses: [], power: 0, landing: null, support: null,
  };
  const aim = { enabled: false, charging: false, power: 0, studying: false };
  const willpower = { value: 1, active: false };
  const sim = P.newBall();
  const prevPos = V(), renderPos = V();
  let acc = 0;
  let rng = ctx.rng?.fork?.('gameplay');
  let jit = { f1: 2.7, f2: 6.2 };
  let chargeT = 0, wasCharging = false;
  let arms = null, armsState = null, throwTimer = 0;
  let nudgeApi = 0, holdApi = false;
  let follow = null;
  let flight = { wind: false };
  let goneT = 0;
  let lastSolve = null;
  let debugFrame = 0;

  // ---------------------------------------------------------------- launch
  function currentView() {
    const fp = ctx.cam?.fp;
    return { yaw: Number.isFinite(fp?.yaw) ? fp.yaw : 0, pitch: Number.isFinite(fp?.pitch) ? fp.pitch : 0 };
  }
  /** The exact origin launch() uses: seat + current view yaw/pitch (never the arm animation). */
  function launchOrigin(v = currentView()) { return P.launchOriginFor(v.yaw, v.pitch); }

  const physEvents = {
    hit(b, h) {
      const rec = { tag: h.tag, ownerId: h.ownerId ?? null, t: h.t, speed: h.speed };
      ball.hits.push(rec);
      ball.bounces = b.bounces;
      const pos = V(h.x, h.y, h.z), n = V(h.nx, h.ny, h.nz);
      view.impact(h.speed, n);
      if (h.speed > 1.4 && h.tag !== 'fan') bits.burst(pos, n, ctx.config?.lowfx ? 2 : 4, Math.min(2, h.speed * 0.3));
      bus.emit('ball:hit', { tag: h.tag, ownerId: h.ownerId ?? null, speed: h.speed, pos });
    },
    apex(b) { bus.emit('ball:apex', { pos: V(b.px, b.py, b.pz) }); },
    nearMiss(b, info) {
      ball.nearMisses.push({ ownerId: info.ownerId, dist: info.dist });
      bus.emit('ball:nearMiss', { ownerId: info.ownerId, dist: info.dist, pos: V(info.x, info.y, info.z) });
    },
  };

  function launch(spec = {}) {
    syncStatic();
    const origin = launchOrigin();
    const vel = P.launchVelocity(spec, V());
    if (!Number.isFinite(vel.x + vel.y + vel.z)) vel.set(0, 2, -3);
    const power = Number.isFinite(spec.power) ? clamp(spec.power, 0, 1) : P.powerFromSpeed(vel.length());
    P.resetBall(sim, origin, vel);
    acc = 0;
    if (view.mesh.parent !== engine.scene) engine.scene.add(view.mesh);
    view.mesh.scale.set(1, 1, 1);
    let hand = null;
    try { hand = arms?.handWorld?.(V()) || null; } catch { hand = null; }
    view.launch(vel, hand, origin);
    Object.assign(ball, { state: 'flying', t: 0, hits: [], bounces: 0, nearMisses: [], power, landing: null, support: null });
    ball.pos.copy(origin); ball.vel.copy(vel); prevPos.copy(origin);
    aim.charging = false; aim.power = 0; wasCharging = false;
    willpower.value = 1; willpower.active = false; holdApi = false; nudgeApi = 0;
    follow = null; flight = { wind: false }; goneT = 0;
    throwTimer = 0.35;
    dots.hide();
    prevCenters.clear();
    syncDynamic(0);
    if (debug) debug.setPath(predictPath({ vel }, 4));
    bus.emit('ball:launched', { pos: origin.clone(), vel: vel.clone(), power });
  }

  function finish() {
    const s = sim.reason === 'rest' ? (sim.lastSupport || sim.support) : (sim.support || (sim.reason === 'timeout' ? sim.lastSupport : null));
    const res = {
      reason: sim.reason, triggerTag: sim.triggerTag, fanOwner: sim.fanOwner, support: P.supportInfo(s),
      pos: { x: sim.px, y: sim.py, z: sim.pz }, t: sim.t, hits: sim.hits, bounces: sim.bounces, nearMisses: ball.nearMisses,
    };
    const landing = classifyLanding(res, lookups);
    landing.pos = V(sim.px, sim.py, sim.pz);
    ball.pos.copy(landing.pos);
    ball.landing = landing;
    ball.support = res.support;
    ball.bounces = sim.bounces;
    if (sim.reason === 'fan') {
      ball.state = 'gone';
      view.mesh.visible = false;
      bits.burst(landing.pos, null, ctx.config?.lowfx ? 14 : 28, 2.2);
      pushIncident({ kind: 'fanHit', id: sim.fanOwner ?? null, pos: landing.pos.clone() });
    } else if (sim.reason === 'trigger' && sim.triggerTag !== 'trash') {
      ball.state = 'gone'; goneT = 0;
    } else {
      ball.state = 'rest';
      ball.vel.set(0, 0, 0);
      view.settle();
    }
    renderPos.copy(ball.pos);
    view.update(0, renderPos, false);
    bus.emit('ball:landed', landing);
  }

  function pushIncident(inc) {
    const r = ctx.round;
    if (r && Array.isArray(r.incidents)) r.incidents.push({ ...inc, t: +ball.t.toFixed(2), by: 'gameplay' });
    bus.emit('incident', inc);
  }

  // ---------------------------------------------------------------- per-frame flight
  const _cf = V(), _env = { wind: null, nudge: null, near: true, openings: null };
  const _wind = { x: 0, y: 0, z: 0, strength: 0 }, _nudge = { x: 0, y: 0, z: 0 };

  function flightEnv() {
    _env.openings = openings();
    const w = cls()?.wind;
    _env.wind = null;
    if (w && w.strength > 0 && w.dir) {
      const l = Math.hypot(w.dir.x, w.dir.y, w.dir.z) || 1;
      _wind.x = w.dir.x / l; _wind.y = w.dir.y / l; _wind.z = w.dir.z / l; _wind.strength = clamp(w.strength, 0, 2);
      _env.wind = _wind;
    }
    _env.nudge = null;
    const axis = clamp((input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0) + nudgeApi, -1, 1);
    if (willpower.active && axis) {
      let fx = sim.vx, fz = sim.vz;
      const l = Math.hypot(fx, fz);
      if (l > 1e-3) {
        fx /= l; fz /= l;
        let rx = -fz, rz = fx;                       // right of the flight direction
        engine.camera.getWorldDirection(_cf);
        if (_cf.x * fx + _cf.z * fz < -0.3) { rx = -rx; rz = -rz; } // looking back at the ball: screen right flips
        _nudge.x = rx * axis * P.PHYS.NUDGE_ACC; _nudge.y = 0; _nudge.z = rz * axis * P.PHYS.NUDGE_ACC;
        _env.nudge = _nudge;
      }
    }
    return _env;
  }

  function stepFlight(dt) {
    syncStatic();
    syncDynamic(dt);
    const env = flightEnv();
    acc += dt;
    let n = 0;
    while (acc >= P.PHYS.H && ball.state === 'flying' && n < 96) {
      prevPos.set(sim.px, sim.py, sim.pz);
      P.stepBall(sim, live, env, P.PHYS.H, physEvents);
      acc -= P.PHYS.H; n++;
      if (ball.state !== 'flying') return; // intercepted from an event handler
      if (sim.done) { finish(); return; }
    }
    ball.pos.set(sim.px, sim.py, sim.pz);
    ball.vel.set(sim.vx, sim.vy, sim.vz);
    ball.t = sim.t;
    ball.bounces = sim.bounces;
    if (!flight.wind && sim.windDrift > 0.1) {
      flight.wind = true;
      pushIncident({ kind: 'wind', pos: ball.pos.clone(), drift: +sim.windDrift.toFixed(2) });
    }
    renderPos.lerpVectors(prevPos, ball.pos, clamp(acc / P.PHYS.H, 0, 1));
    const s = sim.support;
    if (s && sim.sny > 0.5) view.roll(ball.vel, V(sim.snx, sim.sny, sim.snz), dt);
    view.update(dt, renderPos, !(s && sim.sny > 0.5));
    if (debug && (debugFrame++ % 3 === 0)) debug.setDynamic(live.dynamic.all);
  }

  // ---------------------------------------------------------------- aim input
  function chargeCurve(t) {
    if (t < CHARGE_TIME) { const k = t / CHARGE_TIME; return 1 - (1 - k) * (1 - k); }
    const u = t - CHARGE_TIME;
    const j = 0.5 - 0.5 * (0.6 * Math.cos(2 * Math.PI * jit.f1 * u) + 0.4 * Math.cos(2 * Math.PI * jit.f2 * u));
    return 1 - 0.15 * j;
  }
  function cancelCharge(emit = true) {
    if (!aim.charging) return;
    aim.charging = false; aim.power = 0; wasCharging = false;
    dots.hide();
    if (emit) bus.emit('aim:cancel', {});
  }
  function updateAim(dt) {
    const active = aim.enabled && ball.state === 'held' && phase() === 'aim';
    if (!active) { if (aim.charging && phase() !== 'aim') cancelCharge(false); dots.hide(); return; }
    if (input.enabled) {
      const study = input.isDown('Mouse2') || input.isDown('Space');
      if (study !== aim.studying) {
        aim.studying = study;
        bus.emit('aim:study', { on: study });
        if (study) cancelCharge(true);
      }
      if (input.pressed('Mouse0') && !aim.studying && !aim.charging) {
        aim.charging = true; aim.power = 0; chargeT = 0; wasCharging = true;
        bus.emit('aim:charge', { power: 0 });
      }
    }
    if (aim.charging) {
      if (!wasCharging) { chargeT = 0; wasCharging = true; } // charging set from outside (tests)
      chargeT += dt;
      aim.power = chargeCurve(chargeT);
      try { arms?.setCharge?.(aim.power); } catch (e) { warnOnce('arms.setCharge', e); }
      const v = currentView();
      const spec = { yaw: v.yaw, pitch: v.pitch + LOB, power: aim.power };
      if (input.enabled && input.released('Mouse0')) { launch(spec); return; }
      const pts = predictPoints(spec, PREVIEW_TIME + 0.05, 0.025).filter((p) => p.t > 0.05);
      dots.set(pts, engine.renderer);
      if (debug && (debugFrame++ % 4 === 0)) debug.setPath(predictPath(spec, 3));
    } else { wasCharging = false; dots.hide(); }
  }

  // ---------------------------------------------------------------- willpower (hold breath)
  function setWillpower(on) {
    if (on === willpower.active) return;
    willpower.active = on;
    bus.emit('ball:willpower', { on });
  }
  function updateWillpower(dt) {
    if (ball.state !== 'flying') { setWillpower(false); return; }
    const want = holdApi || (input.enabled && input.isDown('Space'));
    if (want && !willpower.active && willpower.value > 0) setWillpower(true);
    if (willpower.active) {
      willpower.value = Math.max(0, willpower.value - dt / WILLPOWER_TIME);
      if (!want || willpower.value <= 0) setWillpower(false);
    }
  }

  // ---------------------------------------------------------------- first-person arms
  function ensureArms() {
    if (arms || !ctx.characters?.createArms) return arms;
    try {
      arms = ctx.characters.createArms();
      if (arms?.group) engine.camera.add(arms.group);
      armsState = null;
    } catch (e) { warnOnce('createArms', e); arms = null; }
    return arms;
  }
  function updateArms(dt) {
    if (!arms) return;
    const ph = phase();
    // visible only in the aim phase (camera request): hidden in letter/intro/flight/ending/card/title
    let want = 'hidden';
    if (ph === 'aim' && ball.state === 'held') want = aim.studying ? 'study' : aim.charging ? 'charge' : 'holdBall';
    else if (ph === 'aim' && throwTimer > 0) want = 'throw'; // follow-through until the flow switches to flight
    const camMode = ctx.cam?.mode;
    if (camMode && camMode !== 'fp') want = 'hidden';
    if (want !== armsState) {
      armsState = want;
      try { arms.setState?.(want); } catch (e) { warnOnce('arms.setState', e); }
    }
    throwTimer = Math.max(0, throwTimer - dt);
    try { arms.update?.(dt); } catch (e) { warnOnce('arms.update', e); }
  }

  // ---------------------------------------------------------------- frame update
  engine.onUpdate((dt) => {
    updateAim(dt);
    if (ball.state === 'flying') { updateWillpower(dt); stepFlight(dt); }
    else {
      updateWillpower(dt);
      if (ball.state === 'gone' && view.mesh.visible) {
        // out of the window: keep falling outside for the camera, then stop on the ground
        goneT += dt;
        ball.vel.y -= P.PHYS.G * dt;
        ball.pos.addScaledVector(ball.vel, dt);
        if (ball.pos.y < P.PHYS.R) { ball.pos.y = P.PHYS.R; ball.vel.set(0, 0, 0); }
        if (goneT < 3) view.update(dt, ball.pos, true);
      } else if (ball.state === 'rest' && view.mesh.parent === engine.scene) {
        if (follow) {
          const ch = follow.ch;
          try { ch?.handWorld?.('R', ball.pos); } catch { /* keep last */ }
          follow.t += dt;
          if (follow.t > 6 || !view.mesh.visible) follow = null;
        }
        if (view.sq.amt > 0 || view.wobble.amt > 0 || follow) view.update(dt, ball.pos, false);
      }
    }
    bits.update(dt);
    updateArms(dt);
  }, engine.ORDER.GAMEPLAY);

  // ---------------------------------------------------------------- phases / rounds
  function resetBallView() {
    if (view.mesh.parent !== engine.scene) engine.scene.add(view.mesh);
    view.mesh.visible = false;
    view.mesh.scale.set(1, 1, 1);
    view.mesh.rotation.set(0, 0, 0);
    view.sq.amt = 0; view.wobble.amt = 0;
  }
  bus.on('round:setup', () => {
    rng = ctx.rng?.fork?.('gameplay');
    jit = { f1: rng ? rng.range(2.2, 3.2) : 2.7, f2: rng ? rng.range(5, 7.5) : 6.2 };
    Object.assign(ball, { state: 'hidden', t: 0, hits: [], bounces: 0, nearMisses: [], power: 0, landing: null, support: null });
    ball.pos.set(0, -10, 0); ball.vel.set(0, 0, 0);
    sim.done = true;
    Object.assign(aim, { charging: false, power: 0, studying: false });
    willpower.value = 1; willpower.active = false; holdApi = false; nudgeApi = 0;
    follow = null; throwTimer = 0; wasCharging = false;
    prevCenters.clear();
    bits.clear(); dots.hide(); resetBallView();
    syncStatic(true);
  });
  bus.on('phase', ({ to }) => {
    aim.enabled = to === 'aim';
    if (to === 'aim') {
      ensureArms();
      try { arms?.setGender?.(ctx.round?.playerGender || ctx.settings?.playerGender || 'm'); } catch (e) { warnOnce('arms.setGender', e); }
      if (ball.state !== 'flying') {
        ball.state = 'held';
        resetBallView();
        Object.assign(aim, { charging: false, power: 0, studying: false });
        willpower.value = 1; willpower.active = false;
      }
    } else if (to === 'letter') {
      if (ball.state !== 'flying') { ball.state = 'hidden'; resetBallView(); }
    } else if (to === 'title' || to === 'intro') {
      if (ball.state !== 'flying') { ball.state = 'hidden'; resetBallView(); }
    }
    if (to !== 'aim') {
      cancelCharge(false);
      if (aim.studying) { aim.studying = false; }
      // hide the FP arms right away on every non-aim phase (incl. caught_read / coward with no throw)
      if (arms && armsState !== 'hidden') { armsState = 'hidden'; try { arms.setState?.('hidden'); } catch (e) { warnOnce('arms.setState', e); } }
    }
  });

  // ---------------------------------------------------------------- prediction / solving
  function predictPoints(spec, seconds = 1, every = 1 / 60) {
    const scene = snapshot();
    const origin = spec.origin || launchOrigin();
    const vel = spec.vel || P.launchVelocity(spec, V());
    const r = P.simulate(scene, origin, vel, { env: { openings: openings() }, record: every, stopAt: seconds });
    return r.path;
  }
  function predictPath(spec, seconds) { return predictPoints(spec, seconds, 1 / 60); }
  /** Trajectory preview (contract): positions every 1/60 s for `seconds` (stops at landing). */
  function predict(spec = {}, seconds = 1) {
    return predictPoints(spec, seconds, 1 / 60).map((p) => V(p.x, p.y, p.z));
  }

  function solveLaunch(target, opts = {}) {
    if (!target || !Number.isFinite(target.x + target.y + target.z)) return null;
    const scene = snapshot();
    const sol = solve({
      origin: launchOrigin(), target: V(target.x, target.y, target.z), scene, fans: fans(), lookups,
      env: { openings: openings() }, opts,
    });
    lastSolve = sol;
    if (!sol) return null;
    return sol;
  }

  // ---------------------------------------------------------------- scripted / intercept
  async function scriptedThrow({ mesh, from, to, height = 0.6, duration = 0.8, spin = true } = {}) {
    if (!mesh || !from || !to) return;
    if (!mesh.parent) engine.scene.add(mesh);
    mesh.visible = true;
    const a = from.clone ? from.clone() : V(from.x, from.y, from.z);
    const b = to.clone ? to.clone() : V(to.x, to.y, to.z);
    const axis = V(b.z - a.z, 0, -(b.x - a.x)).normalize();
    if (axis.lengthSq() < 0.5) axis.set(1, 0, 0);
    const q0 = mesh.quaternion.clone(), q = new THREE.Quaternion();
    await ctx.time.tween({
      duration: Math.max(0.01, duration),
      onUpdate: (k) => {
        mesh.position.lerpVectors(a, b, k);
        mesh.position.y += 4 * height * k * (1 - k);
        if (spin) { q.setFromAxisAngle(axis, -k * duration * 14); mesh.quaternion.copy(q0).premultiply(q); }
      },
    });
    mesh.position.copy(b);
  }

  function intercept(charId) {
    if (ball.state !== 'flying') return false;
    const ch = ctx.cast?.get?.(charId) || (charId === 'teacher' ? ctx.cast?.teacher : null);
    sim.done = true; sim.reason = 'intercept';
    ball.state = 'rest';
    try { ch?.handWorld?.('R', ball.pos); } catch { /* keep the flight position */ }
    ball.vel.set(0, 0, 0);
    follow = ch ? { ch, t: 0 } : null;
    view.update(0, ball.pos, false);
    const landing = {
      type: 'intercept', seatId: ctx.cast?.seatOf?.(charId) ?? null, ownerId: charId, pos: ball.pos.clone(),
      hits: ball.hits.map((h) => ({ ...h })), flightTime: +sim.t.toFixed(3), bounces: sim.bounces,
      nearMisses: ball.nearMisses.map((n) => ({ ...n })), support: null, reason: 'intercept',
    };
    ball.landing = landing;
    bus.emit('ball:landed', landing);
    return true;
  }

  ctx.gameplay = {
    ball, aim, willpower,
    launch,
    launchOrigin: () => launchOrigin(),
    solveLaunch,
    predict,
    nudge(x) { nudgeApi = clamp(Number.isFinite(x) ? x : 0, -1, 1); },
    scriptedThrow,
    intercept,
    // additions (docs/modules/gameplay.md)
    holdBreath(on = true) { holdApi = !!on; },
    release() { follow = null; },
    get lastSolve() { return lastSolve; },
    PHYS: P.PHYS,
    debug: { sim, live, staticGrid, fans, predictPoints },
  };
}
