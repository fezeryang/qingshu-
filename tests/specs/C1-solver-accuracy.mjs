import { verdict, pct, join } from '../lib/common.mjs';

export default {
  id: 'C1', title: 'solveLaunch + launch lands on the target seat for ≥ 90 % of solvable seats (29 seats)', priority: 'P0',
  owners: ['gameplay', 'world', 'characters'], timeout: 1200, quickTimeout: 400,
  method: 'Physics sandbox (tests swallow ball:launched/landed so the round stays in aim): quiet class (`setAmbient(false)`), teacher forced writing, wind frozen. For every non-player seat: `solveLaunch(__qs.target(seat))` → `launch` → step until landed. Hit = Landing desk/chair with that seatId. Full run: seeds 11 and 23 (different occupants); quick: seed 11, every 3rd seat. Also reports unsolvable seats and solver-prediction mismatches.',
  async run(page, h) {
    const S = h.S;
    const seeds = h.quick ? [11] : [11, 23];
    const rows = [];
    for (const seed of seeds) {
      await S.fresh();
      const setup = await S.eval((o) => window.__qa.physSetup(o), { seed });
      const seats = await S.eval(() => window.__qs.ctx.layout.SEATS.filter((s) => !s.isPlayer).map((s) => s.id));
      const list = h.quick ? seats.filter((_, i) => i % 3 === 0) : seats;
      const probe = await S.eval(async () => { const c = window.__qs.ctx; const s = c.gameplay.solveLaunch(window.__qs.target('r3c1')); if (!s) return { ok: null }; const r = await window.__qa.physThrow(s); return { ok: r.moved, r }; });
      if (probe.ok === false) return { status: 'fail', details: 'physics sandbox unusable: the ball does not move unless the flow is in `flight` (test harness needs __qs support, see report)', data: { probe } };
      for (const seat of list) {
        const r = await S.eval(async (seatId) => {
          const c = window.__qs.ctx; const qs = window.__qs;
          const occupant = c.cast.occupant(seatId);
          const t0 = performance.now();
          let s = null, err = null;
          try { s = c.gameplay.solveLaunch(qs.target(seatId)); } catch (e) { err = String(e); }
          const ms = Math.round(performance.now() - t0);
          if (!s) return { seatId, occupant, solved: false, ms, err };
          const res = await window.__qa.physThrow(s, { maxT: 10 });
          return { seatId, occupant, solved: true, ms, sol: { yaw: +s.yaw.toFixed(4), pitch: +(s.pitch * 57.3).toFixed(1), power: +s.power.toFixed(3) }, robust: s.robust, expect: s.expect ? { type: s.expect.type, seatId: s.expect.seatId } : null, landing: res.landing, landedAfter: res.landedAfter, tunnels: res.tunnels };
        }, seat);
        r.seed = seed;
        r.hit = !!(r.landing && ['desk', 'chair'].includes(r.landing.type) && r.landing.seatId === seat);
        r.predicted = r.expect ? r.expect.seatId === seat : null;
        rows.push(r);
      }
      h.log(`  seed ${seed}: ${rows.filter((r) => r.seed === seed && r.hit).length}/${rows.filter((r) => r.seed === seed && r.solved).length} solved seats hit (${rows.filter((r) => r.seed === seed && !r.solved).length} unsolvable), thin colliders ${setup.thin}`);
    }
    const solved = rows.filter((r) => r.solved), hits = solved.filter((r) => r.hit);
    const unsolv = rows.filter((r) => !r.solved).map((r) => `${r.seatId}(s${r.seed})`);
    const misses = solved.filter((r) => !r.hit).map((r) => `${r.seatId}(s${r.seed})→${r.landing?.type}@${r.landing?.seatId ?? '-'}${r.expect && r.expect.seatId === r.seatId ? ' [solver predicted a hit]' : ''}`);
    const rate = pct(hits.length, solved.length);
    const fails = [], warns = [];
    if (rate < 90) fails.push(`hit rate ${rate} % < 90 %`);
    if (unsolv.length) warns.push(`unsolvable: ${unsolv.join(', ')}`);
    if (misses.length) warns.push(`misses: ${join(misses, 8)}`);
    const avgMs = Math.round(solved.reduce((a, r) => a + r.ms, 0) / Math.max(1, solved.length));
    return { status: verdict(fails, warns), partial: h.quick, details: `${hits.length}/${solved.length} solvable seats hit (${rate} %), ${unsolv.length}/${rows.length} unsolvable; solve time avg ${avgMs} ms, max ${Math.max(...rows.map((r) => r.ms))} ms. ${fails.concat(warns).join(' · ')}`, metrics: { rate, solved: solved.length, unsolvable: unsolv.length }, data: rows };
  },
};
