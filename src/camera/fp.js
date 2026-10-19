// First-person seated view (mode 'fp'). Cursor position → limited yaw/pitch (no pointer lock),
// exponential smoothing, slight acceleration near the screen edges, breathing sway, look down at
// the book while pretending to study, FOV squeeze + lean + tremble while charging.
// (owner: qs-camera-director)
import * as THREE from 'three';
import { PLAYER_EYE } from '../core/layout.js';
import { clamp, damp, lerp, smoothstep } from '../core/util.js';
import { DEG } from './rig.js';

const LIM = { yaw: 75 * DEG, pitchUp: 45 * DEG, pitchDown: -35 * DEG };
const STUDY_PITCH = -50 * DEG;
const BASE_FOV = 60, CHARGE_FOV = 55;

/** Cursor mapping with a gentle push near the edges (|n| = 1 still maps to 1). */
const edge = (n) => { const a = Math.min(1, Math.abs(n)); return Math.sign(n) * (a * 0.8 + 0.2 * smoothstep(0.6, 1, a)); };

export function createFP(ctx) {
  const { input } = ctx;
  const eye = new THREE.Vector3(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);
  const st = { tYaw: 0, tPitch: 0, fov: BASE_FOV, charge: 0, studyK: 0, t: 0 };
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _fwd = new THREE.Vector3();

  const fp = {
    yaw: 0, pitch: 0, study: false, limits: LIM, eye,
    /** Aim ray from the eye along the current (smoothed) view yaw/pitch — no breathing/shake noise. */
    getAimRay() {
      const cp = Math.cos(fp.pitch);
      return { origin: eye.clone(), dir: new THREE.Vector3(-Math.sin(fp.yaw) * cp, Math.sin(fp.pitch), -Math.cos(fp.yaw) * cp) };
    },
  };

  function reset() {
    fp.yaw = 0; fp.pitch = 0; fp.study = false;
    st.tYaw = 0; st.tPitch = 0; st.fov = BASE_FOV; st.charge = 0; st.studyK = 0;
  }

  /** Writes the first-person pose into `out`. */
  function pose(dt, uiDt, out) {
    const aim = ctx.gameplay?.aim;
    const reduced = !!ctx.settings?.reducedMotion;
    st.t += uiDt;
    if (input.enabled && ctx.flow?.phase === 'aim') {
      const sens = clamp(+ctx.settings?.sensitivity || 1, 0.3, 2.5);
      st.tYaw = clamp(-edge(input.nx || 0) * LIM.yaw * sens, -LIM.yaw, LIM.yaw);
      const ny = edge(input.ny || 0) * sens;
      st.tPitch = ny >= 0 ? Math.min(LIM.pitchUp, ny * LIM.pitchUp) : Math.max(LIM.pitchDown, -ny * LIM.pitchDown);
      const studying = !!aim?.studying;
      st.studyK += ((studying ? 1 : 0) - st.studyK) * damp(studying ? 7 : 5, uiDt);
      const tPitch = lerp(st.tPitch, STUDY_PITCH, st.studyK);
      const tYaw = lerp(st.tYaw, st.tYaw * 0.15, st.studyK);
      fp.yaw += (tYaw - fp.yaw) * damp(8, uiDt);
      fp.pitch += (tPitch - fp.pitch) * damp(8, uiDt);
    } else {
      // input off (cutscene / flight / UI): hold the view; external writes to fp.yaw/pitch stick
      st.studyK += (0 - st.studyK) * damp(5, uiDt);
    }
    fp.study = st.studyK > 0.5;

    const charging = !!aim?.charging && ctx.flow?.phase === 'aim';
    const power = charging ? clamp(+aim.power || 0, 0, 1) : 0;
    st.charge += (power - st.charge) * damp(charging ? 7 : 9, uiDt);
    st.fov += (BASE_FOV - (BASE_FOV - CHARGE_FOV) * st.charge - st.fov) * damp(6, uiDt);

    // breathing (very small) + charge lean + full-charge tremble
    const bm = reduced ? 0 : 1;
    const by = Math.sin(st.t * 2 * Math.PI * 0.23) * 0.005 * bm;
    const bRoll = Math.sin(st.t * 2 * Math.PI * 0.11 + 1) * 0.12 * DEG * bm;
    const bPitch = Math.sin(st.t * 2 * Math.PI * 0.23 + 0.6) * 0.12 * DEG * bm;
    const trem = st.charge > 0.85 ? ((st.charge - 0.85) / 0.15) * (reduced ? 0 : 1) : 0;
    const tp = trem * 0.35 * DEG * (Math.sin(st.t * 107) * 0.6 + Math.sin(st.t * 151 + 2) * 0.4);
    const ty = trem * 0.3 * DEG * (Math.sin(st.t * 97 + 1) * 0.6 + Math.sin(st.t * 139) * 0.4);

    _fwd.set(-Math.sin(fp.yaw), 0, -Math.cos(fp.yaw));
    out.pos.copy(eye).addScaledVector(_fwd, 0.025 * st.charge);
    out.pos.y += by - 0.018 * st.charge - 0.03 * st.studyK;
    _e.set(fp.pitch + bPitch + tp - 1.5 * DEG * st.charge, fp.yaw + ty, bRoll);
    out.quat.setFromEuler(_e);
    out.fov = st.fov;
    return out;
  }

  return { fp, pose, reset, get charge() { return st.charge; } };
}
