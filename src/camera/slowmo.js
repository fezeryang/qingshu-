// Time-scale manager — the ONLY writer of ctx.engine.timeScale (contract §1).
// Several sources request slow motion at once (launch freeze, apex, approach, near miss, PiP,
// hold-breath, cutscene scripts). The effective target is the minimum requested scale; the actual
// scale ramps toward it on the UI clock. Every request has a hard max lifetime, and clear() snaps
// back to 1, so slow motion can never get stuck. (owner: qs-camera-director)
import { damp } from '../core/util.js';

const MAX_LIFE = 30; // seconds of real (UI) time, absolute safety net

export function createSlowMo(ctx) {
  const { engine, bus, time } = ctx;
  const reqs = new Map();
  let cur = 1, target = 1, emitted = 1;

  function emitIfChanged() {
    if (Math.abs(target - emitted) > 1e-3) { emitted = target; bus.emit('slowmo', { scale: +target.toFixed(3) }); }
  }
  function computeTarget() {
    if (!reqs.size) return 1;
    let lo = Infinity, hi = -Infinity;
    for (const r of reqs.values()) { lo = Math.min(lo, r.scale); hi = Math.max(hi, r.scale); }
    return lo < 1 ? lo : hi;
  }

  const api = {
    get scale() { return cur; },
    get target() { return target; },
    ids() { return [...reqs.keys()]; },
    has(id) { return reqs.has(id); },
    /**
     * Request a scale for `dur` real seconds (Infinity = until released; still capped by maxLife).
     * opts.snap: jump instantly instead of ramping. Resolves when the request ends (any reason).
     */
    request(id, scale, dur = Infinity, opts = {}) {
      const prev = reqs.get(id);
      if (prev) { reqs.delete(id); prev.resolve(); }
      const s = Math.min(4, Math.max(0.05, Number.isFinite(+scale) ? +scale : 1));
      const d = Number.isFinite(+dur) && +dur > 0 ? +dur : (dur === Infinity ? Infinity : 0);
      const r = { id, scale: s, until: time.uiNow + d, born: time.uiNow, maxLife: Math.min(MAX_LIFE, opts.maxLife ?? MAX_LIFE), snap: !!opts.snap, resolve: null };
      const p = new Promise((res) => { r.resolve = res; });
      if (d === 0) { r.resolve(); return p; }
      reqs.set(id, r);
      target = computeTarget();
      if (r.snap && target < cur) { cur = target; engine.timeScale = cur; }
      emitIfChanged();
      return p;
    },
    release(...ids) {
      for (const id of ids) { const r = reqs.get(id); if (r) { reqs.delete(id); r.resolve(); } }
      target = computeTarget();
      emitIfChanged();
    },
    releasePrefix(prefix) { api.release(...[...reqs.keys()].filter((k) => k.startsWith(prefix))); },
    /** Extend (or shorten) a running request so it ends `sec` real seconds from now. */
    extend(id, sec) { const r = reqs.get(id); if (r) { r.until = time.uiNow + sec; r.maxLife = Math.max(r.maxLife, time.uiNow - r.born + sec); } },
    /** Drop everything and snap to 1 immediately. */
    clear() {
      for (const r of reqs.values()) r.resolve();
      reqs.clear();
      cur = target = 1;
      engine.timeScale = 1;
      emitIfChanged();
    },
    update(uiDt) {
      const now = time.uiNow;
      for (const [id, r] of reqs) if (now >= r.until || now - r.born >= r.maxLife) { reqs.delete(id); r.resolve(); }
      target = computeTarget();
      emitIfChanged();
      if (Math.abs(cur - target) < 0.004) cur = target;
      else {
        // ramp in log space: slowing down is quick, speeding back up a touch gentler
        const rate = target < cur ? 16 : 9;
        cur = Math.exp(Math.log(cur) + (Math.log(target) - Math.log(cur)) * damp(rate, uiDt));
      }
      if (Math.abs(engine.timeScale - cur) > 1e-5) engine.timeScale = cur;
    },
  };
  return api;
}
