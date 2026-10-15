// STUB — to be replaced by the camera-director agent. Contract: docs/CONTRACTS.md §4.5
import * as THREE from 'three';
import { PLAYER_EYE } from '../core/layout.js';
import { damp } from '../core/util.js';

export async function install(ctx) {
  const { engine, bus, time, input } = ctx;
  const camera = engine.camera;
  const fp = {
    yaw: 0, pitch: 0, study: false,
    limits: { yaw: THREE.MathUtils.degToRad(75), pitchUp: THREE.MathUtils.degToRad(25), pitchDown: THREE.MathUtils.degToRad(-35) },
    getAimRay() {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      return { origin: camera.position.clone(), dir };
    },
  };
  const fade = document.createElement('div');
  fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:50';
  document.body.appendChild(fade);

  const cam = {
    camera, mode: 'fp', fp,
    toFP() { cam.mode = 'fp'; camera.fov = 70; camera.updateProjectionMatrix(); },
    followBall() { cam.mode = 'follow'; },
    async shot({ pos, look, fov = 50, dur = 1, ease = (t) => t }) {
      cam.mode = 'cinematic';
      const p0 = camera.position.clone();
      const l0 = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position);
      const f0 = camera.fov;
      await time.tween({ duration: dur, ease, onUpdate: (k) => {
        camera.position.lerpVectors(p0, pos, k);
        camera.lookAt(l0.clone().lerp(look, k));
        camera.fov = f0 + (fov - f0) * k; camera.updateProjectionMatrix();
      } });
    },
    async sequence(shots) { for (const s of shots) await cam.shot(s); },
    cut({ pos, look, fov = 50 }) { cam.mode = 'cinematic'; camera.position.copy(pos); camera.lookAt(look); camera.fov = fov; camera.updateProjectionMatrix(); },
    shake() {}, kick() {},
    cycleFollowStyle() {},
    closeUp(ch, { dist = 0.7, fov = 35, dur = 0.6 } = {}) {
      const head = ch.headWorld(new THREE.Vector3());
      const fwd = new THREE.Vector3(-Math.sin(ch.root.rotation.y), 0, -Math.cos(ch.root.rotation.y));
      return cam.shot({ pos: head.clone().addScaledVector(fwd, dist), look: head, fov, dur });
    },
    twoShot(a, b, { dur = 0.6, fov = 45 } = {}) {
      const pa = a.headWorld(new THREE.Vector3()), pb = b.headWorld(new THREE.Vector3());
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      const side = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3(0, 1, 0)).normalize();
      return cam.shot({ pos: mid.clone().addScaledVector(side, pa.distanceTo(pb) * 1.4 + 0.8), look: mid, fov, dur });
    },
    overShoulder(from, to, opts) { return cam.twoShot(from, to, opts); },
    wide(anchor, { dur = 0 } = {}) {
      const a = typeof anchor === 'string' ? ctx.stage.get(anchor).anchors.camWide : anchor;
      return cam.shot({ pos: a.pos, look: a.look, fov: 50, dur });
    },
    orbit(target, { radius = 2, height = 1.5, dur = 2 } = {}) {
      const c = target.isVector3 ? target : target.headWorld(new THREE.Vector3());
      return cam.shot({ pos: c.clone().add(new THREE.Vector3(radius, height - c.y, 0)), look: c, dur });
    },
    crashZoom(target, { dur = 0.25 } = {}) { return cam.closeUp(target, { dist: 0.5, fov: 25, dur }); },
    dutch() { return Promise.resolve(); },
    async track(obj, { dur = 1 } = {}) { cam.mode = 'cinematic'; await time.tween({ duration: dur, onUpdate: () => camera.lookAt(obj.getWorldPosition(new THREE.Vector3())) }); },
    async letterbox() {},
    async irisHeart(dir, dur = 0.6) { await cam.fade(dir === 'out' ? 1 : 0, dur, '#f7a1c4'); },
    async slowMo(scale, dur) { engine.timeScale = scale; await time.waitUI(dur); engine.timeScale = 1; },
    async fade(to, dur = 0.5, color = '#000') { fade.style.background = color; const f0 = +fade.style.opacity; await time.tween({ duration: dur, clock: 'ui', onUpdate: (k) => { fade.style.opacity = f0 + (to - f0) * k; } }); },
    async flash(color = '#fff', dur = 0.3) { await cam.fade(1, 0.05, color); await cam.fade(0, dur, color); },
    pip() {},
  };

  bus.on('phase', ({ to }) => { if (to === 'aim' || to === 'title' || to === 'letter') cam.toFP(); });
  bus.on('ball:launched', () => cam.followBall());

  const ballPrev = new THREE.Vector3();
  engine.onUpdate((dt) => {
    if (cam.mode === 'fp') {
      if (input.enabled) {
        fp.yaw += (-input.nx * fp.limits.yaw - fp.yaw) * damp(6, dt);
        const tp = input.ny > 0 ? input.ny * fp.limits.pitchUp : -input.ny * fp.limits.pitchDown;
        fp.pitch += (tp - fp.pitch) * damp(6, dt);
      }
      camera.position.set(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);
      camera.rotation.set(fp.pitch, fp.yaw, 0, 'YXZ');
    } else if (cam.mode === 'follow') {
      const b = ctx.gameplay.ball;
      const v = b.vel.lengthSq() > 0.01 ? b.vel.clone().setY(0).normalize() : new THREE.Vector3(0, 0, -1);
      const want = b.pos.clone().addScaledVector(v, -0.9).add(new THREE.Vector3(0, 0.35, 0));
      camera.position.lerp(want, damp(8, dt));
      camera.lookAt(b.pos);
      ballPrev.copy(b.pos);
    }
  }, engine.ORDER.CAMERA);

  ctx.cam = cam;
}
