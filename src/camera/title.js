// Title establishing shot (mode 'title'): a slow dolly across the back of the empty-feeling
// classroom toward the sunlit windows, with warm dust motes drifting in the light.
// (owner: qs-camera-director)
import * as THREE from 'three';
import { lookQuat } from './rig.js';

const PERIOD = 44; // seconds for one back-and-forth

export function createTitle(ctx) {
  const A = new THREE.Vector3(3.7, 2.15, 4.05), B = new THREE.Vector3(0.3, 1.9, 3.95);
  const LA = new THREE.Vector3(-2.4, 1.15, -3.4), LB = new THREE.Vector3(-4.0, 1.35, -1.0);
  const _look = new THREE.Vector3();
  const st = { t: 0 };

  // dust motes
  const N = ctx.config.lowfx ? 90 : 260;
  const base = new Float32Array(N * 3), pos = new Float32Array(N * 3), ph = new Float32Array(N), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    base[i * 3] = -4.9 + Math.random() * 4.4;       // cosmetic
    base[i * 3 + 1] = 0.5 + Math.random() * 2.3;    // cosmetic
    base[i * 3 + 2] = -5 + Math.random() * 8.5;     // cosmetic
    ph[i] = Math.random() * 100;                    // cosmetic
    spd[i] = 0.4 + Math.random();                   // cosmetic
  }
  pos.set(base);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,245,220,0.55)');
  grd.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.PointsMaterial({ size: 0.028, map: tex, color: 0xffe8c0, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const dust = new THREE.Points(geo, mat);
  dust.name = 'cam-title-dust';
  dust.frustumCulled = false;
  dust.visible = false;
  dust.renderOrder = 5;
  ctx.engine.scene.add(dust);

  function start() { st.t = 0; }
  function pose(uiDt, out) {
    st.t += uiDt;
    const k = 0.5 - 0.5 * Math.cos((st.t / PERIOD) * 2 * Math.PI);
    out.pos.lerpVectors(A, B, k);
    out.pos.y += Math.sin(st.t * 0.37) * 0.03;
    _look.lerpVectors(LA, LB, k);
    lookQuat(out.pos, _look, Math.sin(st.t * 0.21) * 0.006, out.quat);
    out.fov = 52;
    return out;
  }
  function update(active) {
    const show = active && (ctx.stage?.current ?? 'classroom') === 'classroom';
    dust.visible = show;
    if (!show) return;
    const t = st.t;
    for (let i = 0; i < N; i++) {
      const b = i * 3;
      pos[b] = base[b] + Math.sin(t * 0.21 * spd[i] + ph[i]) * 0.14;
      const y = base[b + 1] - 0.5 + t * 0.03 * spd[i];
      pos[b + 1] = 0.5 + (((y % 2.3) + 2.3) % 2.3);
      pos[b + 2] = base[b + 2] + Math.cos(t * 0.17 * spd[i] + ph[i] * 1.7) * 0.14;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { pose, start, update, dust };
}
