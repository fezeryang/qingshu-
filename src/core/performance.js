// A bounded 3D pixel budget. DOM text/HUD stay at the display's native resolution.
const MAX_PIXELS = 1920 * 1080;
export function renderPixelRatio(width, height, deviceRatio = 1, scale = 1, lowfx = false) {
  if (lowfx) return 1;
  return Math.min(deviceRatio || 1, 1.5, Math.sqrt(MAX_PIXELS / Math.max(1, width * height))) * scale;
}

/** Real-time frame pacing only; never feed deterministic/manual ticks or hidden-tab delays. */
export function createFrameBudget() {
  let scale = 1, count = 0, elapsed = 0, healthy = 0, frameMs = 0;
  const reset = () => { count = 0; elapsed = 0; healthy = 0; };
  return {
    get scale() { return scale; },
    get frameMs() { return frameMs; },
    reset,
    sample(ms) {
      if (!Number.isFinite(ms) || ms <= 0 || ms > 250) { reset(); return false; }
      count++; elapsed += ms;
      if (count < 30 || elapsed < 1000) return false;
      frameMs = elapsed / count;
      const before = scale;
      if (frameMs > 20) {
        scale = Math.max(0.6, Math.round((scale - 0.1) * 10) / 10);
        healthy = 0;
      } else if (frameMs < 17.5) {
        healthy += elapsed;
        // Recover cautiously so resolution does not oscillate around the GPU's limit.
        if (healthy >= 8000) { scale = Math.min(1, Math.round((scale + 0.1) * 10) / 10); healthy = 0; }
      } else healthy = 0;
      count = 0; elapsed = 0;
      return scale !== before;
    },
  };
}
