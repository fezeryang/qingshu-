// Small shared helpers (owner: lead). Add-only: ask the lead before changing an existing signature.
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => { const t = clamp(invLerp(a, b, v), 0, 1); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential approach: x += (target - x) * damp(rate, dt) */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const deg = (d) => (d * Math.PI) / 180;

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Yaw (radians) that makes an object whose forward is -Z face from `from` toward `to` (XZ plane). */
export function yawTo(from, to) { return Math.atan2(-(to.x - from.x), -(to.z - from.z)); }

/** Remove an object and free its GPU resources. */
export function disposeObject(obj) {
  obj.removeFromParent();
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose?.(); }
  });
}

/** Local-storage JSON that never throws (private mode, blocked storage, previews). */
export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
};
