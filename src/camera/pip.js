// Picture-in-picture danger window: a second camera framing a face (default: the teacher), drawn
// into the top-right corner with scissor/viewport after the main pass, plus a red DOM frame with
// a "！" badge. Only active while on — the director restores the default single render when off.
// (owner: qs-camera-director)
import * as THREE from 'three';
import { PLAYER_EYE, ROOM } from '../core/layout.js';
import { damp } from '../core/util.js';
import { asChar, headOf, facingOf, lookQuat } from './rig.js';

export function createPip(ctx, fx) {
  const { renderer, scene, camera } = ctx.engine;
  const pipCam = new THREE.PerspectiveCamera(30, 1.6, 0.05, 80);
  pipCam.name = 'cam-pip';
  const st = { on: false, auto: false, target: null, init: false, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const _size = new THREE.Vector2();
  const _h = new THREE.Vector3(), _f = new THREE.Vector3(), _tp = new THREE.Vector3(), _want = new THREE.Vector3(), _lk = new THREE.Vector3();
  const eye = new THREE.Vector3(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);

  /** PiP rectangle in CSS px (top-left origin) of the drawing area. */
  function rect() {
    renderer.getSize(_size);
    const W = _size.x || window.innerWidth, H = _size.y || window.innerHeight;
    const w = Math.round(W * 0.28), h = Math.round(w * 0.625), m = Math.round(Math.max(12, W * 0.02));
    return { x: W - w - m, y: Math.round(Math.max(m + 56, H * 0.14)), w, h, W, H };
  }

  const defaultTarget = () => ctx.ai?.teacher?.character || ctx.cast?.teacher || 'teacher';

  function set(on, opts = {}) {
    if (on) {
      st.target = opts?.target ?? defaultTarget();
      st.auto = !!opts?.auto;
      st.init = false;
      st.on = true;
      update(0);
      if (!st.on) return; // target unresolvable
      fx.setPip(rect());
    } else {
      st.on = false; st.auto = false; st.target = null;
      fx.setPip(null);
    }
  }

  function update(uiDt) {
    if (!st.on) return;
    const ch = asChar(ctx, st.target);
    const head = headOf(ctx, st.target, _h);
    if (!head) { set(false); return; }
    if (ch) {
      facingOf(ch, _f);
      _tp.subVectors(eye, head).setY(0);
      if (_tp.lengthSq() < 1e-4) _tp.copy(_f);
      _tp.normalize();
      // 3/4 view from the class side: profile while the teacher faces the board, full face once turned
      _want.copy(_f).multiplyScalar(0.55).addScaledVector(_tp, 0.75);
      _want.x += 0.18;
      _want.y = 0;
      if (_want.lengthSq() < 1e-4) _want.copy(_tp);
      _want.normalize().multiplyScalar(0.95).add(head);
      _want.y += 0.06;
    } else {
      _want.copy(head).add(_tp.set(0, 0.3, 1.2));
    }
    if ((ctx.stage?.current ?? 'classroom') === 'classroom') {
      _want.x = Math.min(ROOM.maxX - 0.1, Math.max(ROOM.minX + 0.1, _want.x));
      _want.z = Math.min(ROOM.maxZ - 0.1, Math.max(ROOM.minZ + 0.12, _want.z));
    }
    _lk.copy(head); _lk.y -= 0.03;
    if (!st.init) { st.pos.copy(_want); st.look.copy(_lk); st.init = true; }
    else { st.pos.lerp(_want, damp(9, uiDt)); st.look.lerp(_lk, damp(12, uiDt)); }
    pipCam.position.copy(st.pos);
    lookQuat(st.pos, st.look, 0, pipCam.quaternion);
    pipCam.updateMatrixWorld();
    if (uiDt > 0) fx.setPip(rect());
  }

  /** Main render + PiP pass. */
  function render() {
    renderer.render(scene, camera);
    if (!st.on) return;
    const r = rect();
    const a = r.w / r.h;
    if (Math.abs(pipCam.aspect - a) > 1e-3) { pipCam.aspect = a; pipCam.updateProjectionMatrix(); }
    const y = r.H - r.y - r.h;
    const au = renderer.shadowMap.autoUpdate;
    renderer.setScissorTest(true);
    renderer.setScissor(r.x, y, r.w, r.h);
    renderer.setViewport(r.x, y, r.w, r.h);
    renderer.shadowMap.autoUpdate = false;
    try { renderer.render(scene, pipCam); } finally {
      renderer.shadowMap.autoUpdate = au;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, r.W, r.H);
      renderer.setScissor(0, 0, r.W, r.H);
    }
  }

  return { set, update, render, rect, camera: pipCam, get on() { return st.on; }, get auto() { return st.auto; } };
}
