import { verdict } from '../lib/common.mjs';

export default {
  id: 'D3', title: 'Studying lowers suspicion; charging with the teacher\'s back turned does not raise it', priority: 'P0',
  owners: ['ai', 'gameplay'], timeout: 300,
  method: 'Fresh round. (a) teacher forced watching, suspicion 0.6, simulated RMB (study) 1.5 s → must drop ≥ 0.15. (b) teacher forced writing, suspicion 0.2, simulated LMB charging 3 s → must not rise (≤ +0.005); then the charge is cancelled with Space so nothing is thrown.',
  async run(page, h) {
    const S = h.S;
    await S.fresh();
    await S.eval((o) => window.__qa.begin(o), { seed: 19, gender: 'f', ambient: false, roundSeconds: 300 });
    const r = await S.eval(async () => {
      const c = window.__qs.ctx; const qs = window.__qs; const out = {};
      qs.forceTeacher('watching', 999); qs.setSuspicion(0.6); await window.__qa.step(0.05);
      out.a0 = c.round.suspicion;
      c.input.simulate({ down: 'Mouse2' }); await window.__qa.step(1.5); out.a1 = c.round.suspicion; out.studying = c.gameplay.aim.studying;
      c.input.simulate({ up: 'Mouse2' }); await window.__qa.step(0.2);
      qs.forceTeacher('writing', 999); qs.setSuspicion(0.2); await window.__qa.step(0.05);
      out.b0 = c.round.suspicion;
      c.input.simulate({ down: 'Mouse0' }); let max = 0;
      for (let i = 0; i < 180; i++) { await window.__qa.tick(1); max = Math.max(max, c.round.suspicion); }
      out.b1 = c.round.suspicion; out.bMax = max; out.charging = c.gameplay.aim.charging;
      c.input.simulate({ down: 'Space' }); await window.__qa.step(0.1); c.input.simulate({ up: 'Mouse0' }); await window.__qa.step(0.1); c.input.simulate({ up: 'Space' }); await window.__qa.step(0.1);
      out.phase = c.flow.phase;
      return out;
    });
    const fails = [];
    if (!r.studying) fails.push('simulated Mouse2 did not set aim.studying');
    if (!(r.a0 - r.a1 >= 0.15)) fails.push(`studying: suspicion ${r.a0.toFixed(3)} → ${r.a1.toFixed(3)} (expected a drop ≥ 0.15)`);
    if (!r.charging) fails.push('simulated Mouse0 did not charge');
    if (r.bMax > r.b0 + 0.005) fails.push(`charging with the back turned raised suspicion ${r.b0.toFixed(3)} → max ${r.bMax.toFixed(3)}`);
    return { status: verdict(fails, []), details: `study ${r.a0.toFixed(2)}→${r.a1.toFixed(2)} in 1.5 s; back-turned charging ${r.b0.toFixed(3)}→max ${r.bMax.toFixed(3)} over 3 s. ${fails.join('; ')}`, data: r };
  },
};
