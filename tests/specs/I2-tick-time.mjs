import { verdict } from '../lib/common.mjs';

export default {
  id: 'I2', title: 'lowfx: average tick time (no rendering) ≤ 4 ms', priority: 'P1',
  owners: ['ai', 'characters', 'gameplay', 'camera', 'world', 'ui', 'story', 'audio'], timeout: 400, quickTimeout: 200,
  method: 'lowfx page, manual mode. `engine.tick(1/60)` is timed with performance.now() (yields between ticks are not counted) over 10 s of aim with ambient classmates and the natural teacher, then a full flight, then 8 s of an ending. Reports avg / p95 / max per phase and the slowest update order slot is not measured (contract-level only). Machine-dependent: also compare with `node -e` CPU speed if it fails.',
  async run(page, h) {
    const S = h.S;
    await S.fresh();
    await S.eval((o) => window.__qa.begin(o), { seed: 31, gender: 'm', roundSeconds: 300 });
    const r = await S.eval(async (n) => {
      const c = window.__qs.ctx; const qa = window.__qa;
      const measure = async (ticks, stop) => { const ts = []; for (let i = 0; i < ticks; i++) { const t = performance.now(); c.engine.tick(1 / 60); ts.push(performance.now() - t); await qa.yield(); if (stop && stop()) break; } ts.sort((a, b) => a - b); const avg = ts.reduce((a, b) => a + b, 0) / ts.length; return { n: ts.length, avg: +avg.toFixed(3), p50: +ts[Math.floor(ts.length / 2)].toFixed(3), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(3), max: +ts.at(-1).toFixed(2) }; };
      await qa.step(0.5);
      const aim = await measure(n.aim);
      window.__qs.forceTeacher('writing', 999);
      const s = qa.solve({ pick: 'crush' }); c.gameplay.launch((s.sol || qa.solve({ name: 'r1c2' }).sol));
      const flight = await measure(900, () => c.flow.phase !== 'flight');
      const ending = await measure(n.ending);
      return { aim, flight, ending };
    }, { aim: h.quick ? 300 : 600, ending: h.quick ? 240 : 480 });
    const all = [r.aim, r.flight, r.ending];
    const avg = all.reduce((a, x) => a + x.avg * x.n, 0) / all.reduce((a, x) => a + x.n, 0);
    const fails = [], warns = [];
    if (avg > 4) fails.push(`average tick ${avg.toFixed(2)} ms > 4 ms`);
    for (const [k, v] of Object.entries(r)) if (v.avg > 4) warns.push(`${k} avg ${v.avg} ms`);
    return { status: verdict(fails, fails.length ? [] : warns), details: `overall avg ${avg.toFixed(2)} ms; ${Object.entries(r).map(([k, v]) => `${k}: avg ${v.avg} / p95 ${v.p95} / max ${v.max} ms (${v.n} ticks)`).join('; ')}. ${fails.concat(warns).join('; ')}`, metrics: { avg: +avg.toFixed(3) }, data: r };
  },
};
