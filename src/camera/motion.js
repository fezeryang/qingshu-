// Additive camera motion: shake (decaying noise), kick / flinch / whip (damped springs).
// Produces a local position offset + Euler rotation applied on top of the base pose every tick.
// Runs on the UI clock so impacts stay snappy during slow motion. (owner: qs-camera-director)
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { DEG } from './rig.js';

const K = 210;                          // spring stiffness
const C = 2 * Math.sqrt(K) * 0.42;      // damping (underdamped → a little overshoot)

export function createMotion() {
  const springs = { kick: { x: 0, v: 0 }, flinch: { x: 0, v: 0 }, whip: { x: 0, v: 0 } };
  let amp = 0, decay = 0, t = 0;
  const ph = Array.from({ length: 6 }, () => Math.random() * 100); // cosmetic
  const out = { pos: new THREE.Vector3(), rot: new THREE.Euler(0, 0, 0, 'YXZ'), active: false };
  const nz = (i, f) => Math.sin(t * f + ph[i]) * 0.6 + Math.sin(t * f * 1.73 + ph[i] * 1.3) * 0.4;

  return {
    out,
    /** amp ~0..1 (0.1 subtle, 0.3 noticeable, 1 violent); dur seconds (UI clock). */
    shake(a = 0.3, dur = 0.4) {
      a = clamp(+a || 0, 0, 1.5);
      dur = Math.max(0.05, +dur || 0.4);
      if (a >= amp) { amp = a; decay = a / dur; }
    },
    impulse(name, v) { if (springs[name] && Number.isFinite(v)) springs[name].v += v; },
    reset() { for (const s of Object.values(springs)) { s.x = 0; s.v = 0; } amp = 0; decay = 0; out.pos.set(0, 0, 0); out.rot.set(0, 0, 0); },
    update(uiDt, reduced) {
      t += uiDt;
      amp = Math.max(0, amp - decay * uiDt);
      const n = Math.max(1, Math.ceil(uiDt / (1 / 120)));
      const h = uiDt / n;
      for (const s of Object.values(springs)) {
        for (let i = 0; i < n; i++) { s.v += (-K * s.x - C * s.v) * h; s.x += s.v * h; }
        if (Math.abs(s.x) < 1e-5 && Math.abs(s.v) < 1e-4) { s.x = 0; s.v = 0; }
      }
      const m = reduced ? 0.25 : 1;
      const a = amp * m;
      const kx = springs.kick.x * m, fl = springs.flinch.x * m, wh = springs.whip.x * m;
      out.pos.set(nz(0, 31) * 0.03 * a, nz(1, 27) * 0.03 * a - fl * 0.05, kx * 0.12 + fl * 0.035);
      out.rot.set(
        nz(2, 29) * 2.2 * DEG * a + kx * 15 * DEG - fl * 9 * DEG,
        nz(3, 33) * 2.2 * DEG * a + wh * 12 * DEG,
        nz(4, 23) * 1.4 * DEG * a + wh * 3 * DEG,
      );
      out.active = a > 1e-4 || kx !== 0 || fl !== 0 || wh !== 0;
    },
  };
}
