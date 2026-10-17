import { getSweep, flights, sweepEndings, verdict } from '../lib/common.mjs';

export default {
  id: 'F2', title: 'Every throw triggers bullet time at least once; timeScale returns to 1 afterwards', priority: 'P0',
  owners: ['camera'], timeout: 2400, quickTimeout: 900,
  method: 'Sweep flights: minimum `engine.timeScale` while the ball flies must be < 0.85. Afterwards: timeScale must be exactly 1 when the ending card is up, and 1 again in the aim phase after 再来一局.',
  async run(page, h) {
    const sw = await getSweep(h);
    const fl = flights(sw);
    const fails = [];
    const rows = fl.map((x) => ({ id: x.id, minScale: +x.f.minScale.toFixed(3) }));
    const none = rows.filter((r) => !(r.minScale < 0.85));
    if (!rows.length) fails.push('no flights recorded');
    if (none.length) fails.push(`no bullet time in: ${none.map((r) => `${r.id} (min ${r.minScale})`).join(', ')}`);
    const card = sweepEndings(sw).filter((e) => e.ending?.reachedCard && e.ending.timeScaleAtCard !== 1).map((e) => `${e.id}: ${e.ending.timeScaleAtCard}`);
    if (card.length) fails.push(`timeScale ≠ 1 at the card: ${card.join(', ')}`);
    const retry = sweepEndings(sw).filter((e) => e.a4 && e.a4.timeScale !== 1).map((e) => `${e.id}: ${e.a4.timeScale}`);
    if (retry.length) fails.push(`timeScale ≠ 1 after retry: ${retry.join(', ')}`);
    return { status: verdict(fails, []), partial: h.quick, details: `${rows.length} flights, min timeScale ${rows.map((r) => `${r.id} ${r.minScale}`).join(', ')}. ${fails.join('; ')}`, data: rows };
  },
};
