// Global switches (owner: lead). Module-specific tuning lives in each module's own folder.
const params = new URLSearchParams(location.search);

export const config = {
  /** class period length in seconds of game time during the aim phase */
  roundSeconds: +(params.get('round') || 90),
  /** fixed seed for the first round (otherwise random) */
  seed: params.get('seed'),
  /** ?lowfx=1 — headless tests / weak GPUs: no shadows, pixel ratio 1, fewer particles. Every module must respect it. */
  lowfx: params.has('lowfx'),
  /** ?debug=1 — show debug overlays (colliders, AI cones) if modules implement them */
  debug: params.has('debug'),
  /** ?mute=1 — start muted */
  mute: params.has('mute'),
};
