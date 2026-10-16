// First-person hands (children of the camera). Each hand is driven by a damped spring toward a
// per-state target (camera space). 'study'/'write' targets are anchored to the player's desk in
// world space so the hands really rest on the book when the camera looks down.
import * as THREE from 'three';
import { SEAT_BY_ID, PLAYER_SEAT, DESK, PLAYER_EYE } from '../core/layout.js';
import { toonMaterial } from './toon.js';

const STATES = ['idle', 'holdBall', 'charge', 'throw', 'study', 'hidden', 'write'];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const E = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));

export function createArms(ctx, makeProp) {
  const group = new THREE.Group();
  group.name = 'fpArms';
  const seat = SEAT_BY_ID[PLAYER_SEAT];
  const skin = toonMaterial({ color: 0xfbd9c0 });
  const sleeveM = toonMaterial({ color: 0x3565ba });
  const whiteM = toonMaterial({ color: 0xf4f6fa });
  const scrunchM = toonMaterial({ color: 0xff7aa2 });
  const geos = {
    sleeve: new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0),
    cuff: new THREE.CylinderGeometry(1, 1, 0.03, 14, 1, false),
    stripe: new THREE.CylinderGeometry(0.0045, 0.0045, 1, 5).translate(0, 0.5, 0),
    palm: new THREE.SphereGeometry(1, 14, 10),
    finger: new THREE.CapsuleGeometry(0.0095, 0.03, 3, 6),
    thumb: new THREE.CapsuleGeometry(0.011, 0.028, 3, 6),
    ring: new THREE.TorusGeometry(0.04, 0.011, 6, 14),
  };

  function makeHand(side) {
    const sx = side === 'R' ? 1 : -1;
    const arm = { side, sx };
    arm.sleeve = new THREE.Mesh(geos.sleeve, sleeveM);
    arm.stripes = [0, 1].map((i) => { const m = new THREE.Mesh(geos.stripe, whiteM); return m; });
    arm.forearm = new THREE.Group();
    arm.forearm.add(arm.sleeve, ...arm.stripes);
    arm.stripes.forEach((m, i) => { m.position.set(sx * 0.044, 0, i ? 0.012 : -0.012); });
    arm.cuff = new THREE.Mesh(geos.cuff, whiteM);
    arm.scrunchie = new THREE.Mesh(geos.ring, scrunchM);
    arm.scrunchie.rotation.x = Math.PI / 2; arm.scrunchie.position.y = -0.04; arm.scrunchie.visible = false;
    arm.cuff.add(arm.scrunchie);
    // hand: wrist at origin, fingers toward -Z, palm normal +Y (palm up), thumb toward +X*sx
    arm.hand = new THREE.Group();
    const palm = new THREE.Mesh(geos.palm, skin);
    palm.scale.set(0.04, 0.017, 0.048); palm.position.set(0, 0, -0.045);
    arm.hand.add(palm);
    arm.fingers = [];
    for (let i = 0; i < 4; i++) {
      const base = new THREE.Group();
      base.position.set(sx * (0.026 - i * 0.017), 0.002, -0.085);
      const f = new THREE.Mesh(geos.finger, skin);
      f.rotation.x = -Math.PI / 2; f.position.z = -0.02;
      base.add(f);
      arm.hand.add(base);
      arm.fingers.push(base);
    }
    arm.thumbBase = new THREE.Group();
    arm.thumbBase.position.set(sx * 0.038, 0.004, -0.03);
    const th = new THREE.Mesh(geos.thumb, skin);
    th.rotation.set(-Math.PI / 2, 0, 0); th.position.z = -0.022;
    arm.thumbBase.add(th);
    arm.thumbBase.rotation.y = sx * -0.6;
    arm.hand.add(arm.thumbBase);
    arm.ballAnchor = new THREE.Object3D();
    arm.ballAnchor.position.set(0, 0.04, -0.06);
    arm.hand.add(arm.ballAnchor);
    group.add(arm.forearm, arm.cuff, arm.hand);
    // spring state
    arm.w = V(sx * 0.25, -0.45, -0.4); arm.wv = V(0, 0, 0);
    arm.e = V(sx * 0.4, -0.7, -0.2);
    arm.q = new THREE.Quaternion();
    arm.curl = 0.4;
    return arm;
  }
  const R = makeHand('R'), L = makeHand('L');
  const ball = makeProp('letterBall');
  R.ballAnchor.add(ball);
  const pencil = makeProp('pencil');
  pencil.position.set(0.0, 0.01, -0.07); pencil.rotation.set(0.5, 0, 0.3);
  pencil.visible = false;
  R.hand.add(pencil);

  let state = 'idle', charge = 0, stateT = 0, t = 0, gender = 'm';
  const tgt = { R: { w: V(0, 0, 0), e: V(0, 0, 0), q: new THREE.Quaternion(), curl: 0.4, k: 160 }, L: { w: V(0, 0, 0), e: V(0, 0, 0), q: new THREE.Quaternion(), curl: 0.4, k: 160 } };
  const _wv = new THREE.Vector3(), _d = new THREE.Vector3(), _qq = new THREE.Quaternion();
  const camera = ctx.engine.camera;

  /** world point → group-local (camera space); false if the camera is far from the player's seat */
  function deskPoint(x, y, z, out) {
    const cam = group.parent;
    if (!cam) return false;
    cam.updateMatrixWorld(true);
    _wv.set(x, y, z);
    if (cam.position.distanceTo(_d.set(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z)) > 1.2) return false;
    out.copy(cam.worldToLocal(_wv));
    return true;
  }
  /** a camera-space orientation that makes the palm face down in world space with fingers forward */
  function palmDownWorld(yawOff, out) {
    const cam = group.parent;
    _qq.setFromEuler(new THREE.Euler(0, yawOff, Math.PI, 'YXZ'));
    if (!cam) return out.copy(_qq);
    cam.getWorldQuaternion(out).invert();
    return out.multiply(_qq);
  }

  function computeTargets() {
    const p = charge;
    const tr = tgt.R, tl = tgt.L;
    tr.k = 170; tl.k = 140;
    switch (state) {
      case 'holdBall': {
        const bob = Math.sin(t * 1.6) * 0.006;
        tr.w.set(0.14, -0.21 + bob, -0.36); tr.e.set(0.3, -0.5, -0.14); tr.q.copy(E(0.38, 0.5, -0.15)); tr.curl = 0.55;
        tl.w.set(-0.24, -0.33, -0.4); tl.e.set(-0.4, -0.6, -0.2); tl.q.copy(E(Math.PI - 0.2, -0.3, 0)); tl.curl = 0.35;
        break;
      }
      case 'charge': {
        const tremble = p > 0.85 ? (Math.sin(t * 61) + Math.sin(t * 43)) * 0.0035 * (p - 0.7) / 0.3 : 0;
        tr.w.set(0.14 + 0.07 * p + tremble, -0.21 + 0.1 * p + tremble, -0.36 + 0.06 * p); tr.e.set(0.3 + 0.08 * p, -0.5 + 0.08 * p, -0.14 + 0.06 * p);
        tr.q.copy(E(0.38 + 0.8 * p, 0.5 - 0.25 * p, -0.15 - 0.3 * p)); tr.curl = 0.6;
        tl.w.set(-0.25, -0.36, -0.4); tl.e.set(-0.4, -0.62, -0.2); tl.q.copy(E(Math.PI - 0.2, -0.3, 0)); tl.curl = 0.35;
        tr.k = 260;
        break;
      }
      case 'throw': {
        if (stateT < 0.3) { tr.w.set(0.06, -0.1, -0.62); tr.e.set(0.26, -0.32, -0.34); tr.q.copy(E(-0.5, 0.25, 0.4)); tr.curl = 0.05; tr.k = 900; }
        else { tr.w.set(0.3, -0.62, -0.38); tr.e.set(0.42, -0.85, -0.18); tr.q.copy(E(0.2, 0.3, 0)); tr.curl = 0.3; tr.k = 120; }
        tl.w.set(-0.32, -0.42, -0.42); tl.e.set(-0.45, -0.66, -0.2); tl.q.copy(E(Math.PI - 0.2, -0.3, 0)); tl.curl = 0.35;
        break;
      }
      case 'study': case 'write': {
        const write = state === 'write';
        const ok = deskPoint(seat.x + 0.1 + (write ? Math.sin(t * 9) * 0.01 + ((t * 0.05) % 0.08) : 0), DESK.topY + 0.03, seat.deskZ + 0.1 + (write ? Math.sin(t * 23) * 0.004 : 0), tr.w)
          && deskPoint(seat.x - 0.11, DESK.topY + 0.03, seat.deskZ + 0.11, tl.w)
          && deskPoint(seat.x + 0.3, DESK.topY + 0.04, seat.chairZ - 0.14, tr.e)
          && deskPoint(seat.x - 0.3, DESK.topY + 0.04, seat.chairZ - 0.14, tl.e);
        if (!ok) { tr.w.set(0.13, -0.3, -0.38); tl.w.set(-0.13, -0.3, -0.38); tr.e.set(0.3, -0.5, -0.12); tl.e.set(-0.3, -0.5, -0.12); }
        palmDownWorld(write ? 0.25 : 0.15, tr.q); palmDownWorld(-0.15, tl.q);
        tr.curl = write ? 0.7 : 0.15; tl.curl = 0.15;
        break;
      }
      default: { // idle / hidden
        tr.w.set(0.26, -0.44, -0.4); tr.e.set(0.4, -0.7, -0.2); tr.q.copy(E(Math.PI - 0.2, 0.3, 0)); tr.curl = 0.35;
        tl.w.set(-0.3, -0.44, -0.4); tl.e.set(-0.45, -0.7, -0.2); tl.q.copy(E(Math.PI - 0.2, -0.3, 0)); tl.curl = 0.35;
      }
    }
  }

  function step(arm, T, dt, snap) {
    if (snap) { arm.w.copy(T.w); arm.wv.set(0, 0, 0); arm.e.copy(T.e); arm.q.copy(T.q); arm.curl = T.curl; }
    else {
      const k = T.k, c = 2 * Math.sqrt(k) * 0.72;
      arm.wv.x += ((T.w.x - arm.w.x) * k - arm.wv.x * c) * dt;
      arm.wv.y += ((T.w.y - arm.w.y) * k - arm.wv.y * c) * dt;
      arm.wv.z += ((T.w.z - arm.w.z) * k - arm.wv.z * c) * dt;
      arm.w.addScaledVector(arm.wv, dt);
      arm.e.lerp(T.e, 1 - Math.exp(-10 * dt));
      arm.q.slerp(T.q, 1 - Math.exp(-(T.k > 500 ? 30 : 12) * dt));
      arm.curl += (T.curl - arm.curl) * (1 - Math.exp(-14 * dt));
    }
    // forearm from elbow to wrist
    _d.subVectors(arm.w, arm.e);
    const len = _d.length();
    _d.normalize();
    arm.forearm.position.copy(arm.e);
    arm.forearm.quaternion.setFromUnitVectors(V(0, 1, 0), _d);
    const r = gender === 'f' ? 0.04 : 0.046;
    arm.sleeve.scale.set(r, Math.max(0.01, len - 0.015), r);
    arm.stripes.forEach((m) => { m.scale.set(1, Math.max(0.01, len - 0.02), 1); m.position.x = arm.sx * r * 0.97; });
    arm.cuff.position.copy(arm.w).addScaledVector(_d, -0.02);
    arm.cuff.quaternion.copy(arm.forearm.quaternion);
    arm.cuff.scale.set(r * 1.08, 1, r * 1.08);
    arm.scrunchie.visible = gender === 'f' && arm.side === 'R';
    arm.scrunchie.scale.setScalar(1 / (r * 1.08) * 0.04);
    arm.hand.position.copy(arm.w);
    arm.hand.quaternion.copy(arm.q);
    const hs = gender === 'f' ? 0.92 : 1;
    arm.hand.scale.setScalar(hs);
    arm.fingers.forEach((f, i) => { f.rotation.x = arm.curl * (1.5 + i * 0.12); });
    arm.thumbBase.rotation.x = arm.curl * 0.6;
  }

  let first = true;
  const api = {
    group,
    get state() { return state; },
    get charge() { return charge; },
    setGender(g) { gender = g === 'f' ? 'f' : 'm'; },
    setState(s) {
      if (!STATES.includes(s)) s = 'idle';
      if (s === state) return;
      state = s; stateT = 0;
      group.visible = s !== 'hidden';
      ball.visible = s === 'holdBall' || s === 'charge';
      pencil.visible = s === 'write';
      if (s !== 'charge') charge = 0;
    },
    setCharge(p) { charge = THREE.MathUtils.clamp(Number(p) || 0, 0, 1); },
    handWorld(target = new THREE.Vector3()) {
      group.parent?.updateMatrixWorld(true);
      R.hand.updateMatrixWorld(true);
      return ball.getWorldPosition(target);
    },
    update(dt) {
      dt = Math.min(Math.max(dt || 0, 0), 0.05);
      t += dt; stateT += dt;
      if (state === 'hidden') return;
      computeTargets();
      step(R, tgt.R, dt, first); step(L, tgt.L, dt, first);
      first = false;
    },
  };
  api.setState('hidden');
  group.userData.api = api;
  void camera;
  return api;
}
