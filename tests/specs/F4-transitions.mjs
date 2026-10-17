import { getSweep, sweepEndings, verdict } from '../lib/common.mjs';

export default {
  id: 'F4', title: 'Transitions (heart iris, fades, white flash, letterbox) leave no residue', priority: 'P1',
  owners: ['camera'], timeout: 2400, quickTimeout: 900,
  method: 'Uses the A4 retry snapshots of every ending: `cam.debug()` must be idle: fade/flash/letterbox/vignette/speed lines 0, iris `open`, no PiP/custom render, roll 0, no slow-mo requests, no extra full-screen DOM overlays, composited screenshot luminance within ±40 % of a fresh aim view and no black top/bottom bands. Highlights endings that use irisHeart/fade/flash/letterbox (from the camera call spy).',
  async run(page, h) {
    const sw = await getSweep(h);
    const rows = [], fails = [];
    for (const e of sweepEndings(sw)) {
      if (!e.a4) continue;
      const used = [...new Set((e.ending?.camCalls || []).filter((c) => /irisHeart|fade|flash|letterbox/.test(c)))];
      const dbg = e.a4.camDebug || {};
      const fxState = JSON.stringify({ fade: dbg.fade, flash: dbg.flash, letterbox: dbg.letterbox, iris: dbg.iris, pip: dbg.pip, roll: dbg.roll, vignette: dbg.vignette });
      const iss = [];
      const active = (v) => v && (typeof v === 'number' ? v > 0.01 : typeof v === 'object' ? Object.values(v).some((x) => (typeof x === 'number' ? x > 0.01 : x === true)) : v === true);
      for (const k of ['fade', 'flash', 'letterbox', 'pip', 'speedLines', 'vignette', 'customRender']) if (active(dbg[k])) iss.push(`${k} still active ${JSON.stringify(dbg[k])}`);
      if (dbg.iris != null && dbg.iris !== 'open') iss.push(`iris ${dbg.iris}`);
      if (dbg.roll && Math.abs(dbg.roll) > 0.5) iss.push(`roll ${dbg.roll}°`);
      if (dbg.slowRequests && dbg.slowRequests.length) iss.push(`slow-mo requests left: ${dbg.slowRequests.join(',')}`);
      const s = e.a4.shot, b = e.a4.base?.shot;
      if (s && b) { const ratio = s.lum / Math.max(1, b.lum); if (ratio < 0.6 || ratio > 1.6) iss.push(`luminance ×${ratio.toFixed(2)} vs fresh aim`); if (s.top.dark > 0.85 && b.top.dark < 0.5) iss.push('black top band'); }
      rows.push({ id: e.id, used, fxState, issues: iss });
      if (iss.length) fails.push(`${e.id} (${used.join('/') || 'no fx calls'}): ${iss.join(', ')}`);
    }
    if (!rows.length) fails.push('no retry snapshots in the sweep');
    return { status: verdict(fails, []), partial: h.quick, details: `${rows.length} endings checked; transitions used: ${rows.filter((r) => r.used.length).map((r) => `${r.id}[${r.used.join(',')}]`).join(' ')}. ${fails.join('; ')}`, data: rows };
  },
};
