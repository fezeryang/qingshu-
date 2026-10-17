import { verdict } from '../lib/common.mjs';

export default {
  id: 'B7', title: 'Timer reaching zero → coward ending', priority: 'P0',
  owners: ['core', 'story', 'ui'], timeout: 300,
  method: 'Fresh round with `roundSeconds: 6`, teacher forced writing, no input. HUD text is sampled at t = 1 s and 3 s (the timer should be visible and change). Step until the ending phase: expect `round:timeout`, `bell`, `endingId` = coward.',
  async run(page, h) {
    const S = h.S;
    await S.fresh();
    await S.eval((o) => window.__qa.begin(o), { seed: 12, gender: 'm', ambient: false, roundSeconds: 6 });
    await S.eval(() => window.__qs.forceTeacher('writing', 999));
    const r = await S.eval(async () => {
      const c = window.__qs.ctx; const ev0 = window.__qa.events.length;
      await window.__qa.step(1); const hud1 = window.__qa.uiText(); const t1 = c.round.timeLeft;
      await window.__qa.step(2); const hud2 = window.__qa.uiText(); const t2 = c.round.timeLeft;
      await window.__qa.stepUntil(() => c.flow.phase !== 'aim', 15);
      return { phase: c.flow.phase, endingId: c.round.endingId, t1, t2, hud1: hud1.slice(0, 300), hud2: hud2.slice(0, 300), events: window.__qa.events.slice(ev0).map((e) => e.type).filter((t) => ['round:timeout', 'bell', 'phase'].includes(t)) };
    });
    const fails = [], warns = [];
    if (r.endingId !== 'coward') fails.push(`ending ${r.endingId} (phase ${r.phase}), expected coward`);
    if (!r.events.includes('round:timeout')) fails.push('no round:timeout event');
    if (!r.events.includes('bell')) warns.push('no bell event');
    if (r.hud1 === r.hud2) warns.push('HUD text did not change between t=1 s and t=3 s (timer not visible?)');
    return { status: verdict(fails, warns), details: `timeLeft ${r.t1?.toFixed(1)} → ${r.t2?.toFixed(1)}; events ${r.events.join(',')}; ending ${r.endingId}. ${fails.concat(warns).join('; ')}`, data: r };
  },
};
