import { verdict, join } from '../lib/common.mjs';

export default {
  id: 'C2', title: '200 random throws: 0 NaN, 0 tunnelling, all land within 8 s', priority: 'P0',
  owners: ['gameplay', 'world'], timeout: 1500, quickTimeout: 400,
  method: 'Physics sandbox, quiet class, teacher frozen, wind frozen. Seeded random yaw ∈ [−85°, 85°], pitch ∈ [−15°, 75°], power ∈ [0, 1] via `gameplay.launch`. Every tick: finite pos/vel; centre never leaves the room except through the open window w1 (crossing point checked); never crosses a thin desk/chair/podium/book slab from above its top to below its bottom inside its footprint. `ball:landed` must arrive within 8 s of game time. A fresh round every 50 throws.',
  async run(page, h) {
    const S = h.S;
    const N = h.quick ? 40 : 200;
    const rows = [];
    for (let i = 0; i < N; i++) {
      if (i % 50 === 0) { await S.fresh(); await S.eval((o) => window.__qa.physSetup(o), { seed: 400 + i }); }
      const r = await S.eval(async (k) => {
        let s = (k * 2654435761) >>> 0;
        const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const sol = { yaw: (rnd() * 170 - 85) / 57.2958, pitch: (rnd() * 90 - 15) / 57.2958, power: rnd() };
        const res = await window.__qa.physThrow(sol, { maxT: 9 });
        return { k, sol: { yaw: +(sol.yaw * 57.3).toFixed(1), pitch: +(sol.pitch * 57.3).toFixed(1), power: +sol.power.toFixed(3) }, type: res.landing?.type ?? null, seatId: res.landing?.seatId ?? null, t: res.landedAfter, nan: res.nan, tunnels: res.tunnels, exitedWindow: res.exitedWindow, end: res.end };
      }, i);
      rows.push(r);
    }
    const nan = rows.filter((r) => r.nan), tun = rows.filter((r) => r.tunnels.length), late = rows.filter((r) => r.t == null || r.t > 8);
    const fails = [];
    if (nan.length) fails.push(`${nan.length} NaN (e.g. #${nan[0].k} ${JSON.stringify(nan[0].sol)})`);
    if (tun.length) fails.push(`${tun.length} tunnelling: ${join(tun.map((r) => `#${r.k} ${JSON.stringify(r.sol)} ${r.tunnels[0]}`), 4)}`);
    if (late.length) fails.push(`${late.length} no ball:landed within 8 s: ${join(late.map((r) => `#${r.k} ${JSON.stringify(r.sol)} t=${r.t}`), 4)}`);
    const types = rows.reduce((a, r) => { a[r.type] = (a[r.type] || 0) + 1; return a; }, {});
    const maxT = Math.max(...rows.map((r) => r.t || 0));
    return { status: verdict(fails, []), partial: h.quick, details: `${N} throws; landings ${JSON.stringify(types)}; slowest landing ${maxT.toFixed(2)} s. ${fails.join(' · ')}`, metrics: { n: N, nan: nan.length, tunnels: tun.length, late: late.length }, data: rows };
  },
};
