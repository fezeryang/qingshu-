// STUB — to be replaced by the gameplay-engineer agent. Contract: docs/CONTRACTS.md §4.3
import * as THREE from 'three';
import { BALL_RADIUS, PLAYER_EYE, PLAYER_SEAT } from '../core/layout.js';

const G = 9.8;
const R = BALL_RADIUS;
const SPEED_MIN = 2.2, SPEED_MAX = 9;
const LOB = THREE.MathUtils.degToRad(10);

export async function install(ctx) {
  const { bus, engine, input } = ctx;
  const ball = {
    state: 'hidden', pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0,
    hits: [], bounces: 0, restTime: 0, mesh: ctx.characters.createProp('letterBall'), contact: null,
  };
  ball.mesh.visible = false;
  engine.scene.add(ball.mesh);
  const aim = { enabled: false, charging: false, power: 0, studying: false };
  let arms = null;

  const origin = () => new THREE.Vector3(PLAYER_EYE.x + 0.18, PLAYER_EYE.y - 0.08, PLAYER_EYE.z - 0.25);
  const dirFrom = (yaw, pitch) => new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

  function launch({ yaw, pitch, power, dir }) {
    const speed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * THREE.MathUtils.clamp(power, 0, 1);
    ball.pos.copy(origin());
    ball.vel.copy(dir ? dir.clone().normalize() : dirFrom(yaw, pitch)).multiplyScalar(speed);
    Object.assign(ball, { state: 'flying', t: 0, hits: [], bounces: 0, restTime: 0, contact: null });
    ball.mesh.visible = true;
    aim.charging = false;
    arms?.setState('throw');
    bus.emit('ball:launched', { pos: ball.pos.clone(), vel: ball.vel.clone(), power });
  }

  /** Ballistic solve (no drag) from the launch origin to `target`. */
  function solveLaunch(target, opts = {}) {
    const o = origin();
    const dx = target.x - o.x, dz = target.z - o.z, dy = target.y - o.y;
    const d = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    const prefer = THREE.MathUtils.degToRad(opts.pitchDeg ?? 35);
    let best = null;
    for (let deg = 5; deg <= 75; deg += 0.5) {
      const th = THREE.MathUtils.degToRad(deg);
      const denom = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - dy);
      if (denom <= 0) continue;
      const v = Math.sqrt((G * d * d) / denom);
      const power = (v - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);
      if (power < 0 || power > 1) continue;
      const score = Math.abs(th - prefer);
      if (!best || score < best.score) best = { yaw, pitch: th, power, score };
    }
    return best && { yaw: best.yaw, pitch: best.pitch, power: best.power };
  }

  const _c = new THREE.Vector3(), _n = new THREE.Vector3(), _l = new THREE.Vector3(), _q = new THREE.Quaternion();
  function collide(c) {
    if (c.kind === 'trigger') {
      if (ball.pos.x > c.min.x && ball.pos.x < c.max.x && ball.pos.y > c.min.y && ball.pos.y < c.max.y && ball.pos.z > c.min.z && ball.pos.z < c.max.z) return land(c.tag === 'trash' ? 'trash' : 'outside');
      return;
    }
    if (c.kind === 'sphere') {
      _n.subVectors(ball.pos, c.center);
      const dist = _n.length();
      if (dist >= c.radius + R || dist === 0) return;
      _n.divideScalar(dist);
      ball.pos.copy(c.center).addScaledVector(_n, c.radius + R);
      return respond(c, 0.55);
    }
    if (c.kind === 'obb') {
      _q.copy(c.quaternion).invert();
      _l.subVectors(ball.pos, c.center).applyQuaternion(_q);
      _c.set(THREE.MathUtils.clamp(_l.x, -c.halfSize.x, c.halfSize.x), THREE.MathUtils.clamp(_l.y, -c.halfSize.y, c.halfSize.y), THREE.MathUtils.clamp(_l.z, -c.halfSize.z, c.halfSize.z));
      if (_l.distanceToSquared(_c) >= R * R) return;
      if (c.tag === 'fan') return land('fan');
      _n.subVectors(_l, _c).normalize().applyQuaternion(c.quaternion);
      return respond(c, 0.4);
    }
    // box
    _c.set(THREE.MathUtils.clamp(ball.pos.x, c.min.x, c.max.x), THREE.MathUtils.clamp(ball.pos.y, c.min.y, c.max.y), THREE.MathUtils.clamp(ball.pos.z, c.min.z, c.max.z));
    const d2 = ball.pos.distanceToSquared(_c);
    if (d2 >= R * R) return;
    if (d2 > 1e-12) { _n.subVectors(ball.pos, _c).normalize(); ball.pos.copy(_c).addScaledVector(_n, R); } else { _n.set(0, 1, 0); ball.pos.y = c.max.y + R; }
    return respond(c, c.tag === 'floor' ? 0.3 : 0.32);
  }
  function respond(c, e) {
    const vn = ball.vel.dot(_n);
    if (vn < 0) {
      ball.vel.addScaledVector(_n, -(1 + e) * vn);
      const vt = ball.vel.clone().addScaledVector(_n, -ball.vel.dot(_n));
      ball.vel.addScaledVector(vt, -0.35);
      if (-vn > 0.4) { ball.bounces++; ball.hits.push({ tag: c.tag, ownerId: c.ownerId ?? null, t: +ball.t.toFixed(3), speed: +(-vn).toFixed(2) }); bus.emit('ball:hit', { tag: c.tag, ownerId: c.ownerId ?? null, speed: -vn, pos: ball.pos.clone() }); }
    }
    if (_n.y > 0.6) ball.contact = c;
  }

  function land(type) {
    if (ball.state !== 'flying') return;
    ball.state = type === 'fan' || type === 'outside' ? 'gone' : 'rest';
    const c = ball.contact;
    let landing = { type, seatId: null, ownerId: null, pos: ball.pos.clone(), hits: ball.hits, flightTime: ball.t, bounces: ball.bounces };
    if (type === 'rest' || type === 'timeout') {
      const tag = c?.tag;
      if (ball.hits.some((h) => h.tag === 'teacher')) landing.type = 'teacher';
      else if (tag === 'desk' || tag === 'chair') {
        landing.seatId = c.ownerId;
        landing.ownerId = ctx.cast.occupant(c.ownerId);
        landing.type = c.ownerId === PLAYER_SEAT ? 'self' : tag;
      } else if (tag === 'podium' || tag === 'teacherDesk') landing.type = 'podium';
      else landing.type = 'floor';
    }
    bus.emit('ball:landed', landing);
  }

  function step(dt) {
    const colliders = [...ctx.world.classroom.colliders, ...ctx.world.classroom.dynamicColliders(), ...ctx.cast.colliders()];
    const n = Math.ceil(dt / (1 / 240));
    const h = dt / n;
    for (let i = 0; i < n && ball.state === 'flying'; i++) {
      ball.t += h;
      ball.vel.y -= G * h;
      ball.vel.multiplyScalar(1 - 0.08 * h);
      ball.pos.addScaledVector(ball.vel, h);
      ball.contact = null;
      for (const c of colliders) { collide(c); if (ball.state !== 'flying') return; }
      if (ball.contact && ball.vel.length() < 0.12) ball.restTime += h; else ball.restTime = 0;
      if (ball.restTime > 0.25) return land('rest');
      if (ball.t > 7) return land('timeout');
    }
  }

  bus.on('phase', ({ to }) => {
    aim.enabled = to === 'aim';
    if (to === 'aim') {
      if (!arms) { arms = ctx.characters.createArms(); engine.camera.add(arms.group); }
      arms.setGender(ctx.round.playerGender);
      arms.setState('holdBall');
      ball.state = 'held'; ball.mesh.visible = false; aim.power = 0; aim.charging = false;
    } else if (to === 'title' || to === 'letter' || to === 'intro') {
      arms?.setState('hidden'); ball.state = 'hidden'; ball.mesh.visible = false;
    }
  });

  engine.onUpdate((dt) => {
    if (aim.enabled && input.enabled) {
      aim.studying = input.isDown('Mouse2') || input.isDown('Space');
      if (input.pressed('Mouse0') && !aim.studying) { aim.charging = true; aim.power = 0; bus.emit('aim:charge', { power: 0 }); }
      if (aim.charging) {
        aim.power = Math.min(1, aim.power + dt / 1.1);
        arms?.setCharge(aim.power);
        if (input.released('Mouse0')) {
          const { yaw, pitch } = ctx.cam.fp;
          launch({ yaw, pitch: pitch + LOB, power: aim.power });
        }
      }
      arms?.setState(aim.studying ? 'study' : aim.charging ? 'charge' : 'holdBall');
    }
    if (ball.state === 'flying') step(dt);
    ball.mesh.position.copy(ball.pos);
    arms?.update(dt);
  }, engine.ORDER.GAMEPLAY);

  async function scriptedThrow({ mesh, from, to, height = 0.6, duration = 0.8 }) {
    if (!mesh.parent) engine.scene.add(mesh);
    mesh.visible = true;
    await ctx.time.tween({ duration, onUpdate: (k) => {
      mesh.position.lerpVectors(from, to, k);
      mesh.position.y += Math.sin(Math.PI * k) * height;
    } });
  }
  function intercept(charId) {
    if (ball.state !== 'flying') return;
    const ch = ctx.cast.get(charId);
    if (ch) ch.handWorld('R', ball.pos);
    ball.state = 'rest';
    bus.emit('ball:landed', { type: 'intercept', seatId: ctx.cast.seatOf(charId), ownerId: charId, pos: ball.pos.clone(), hits: ball.hits, flightTime: ball.t, bounces: ball.bounces, nearMisses: [] });
  }
  ctx.gameplay = { intercept, ball, aim, willpower: { value: 1, active: false }, launch, launchOrigin: origin, solveLaunch, predict: () => [], nudge() {}, scriptedThrow };
}
