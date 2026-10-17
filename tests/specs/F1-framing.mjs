import { getSweep, flights, verdict, pct, join } from '../lib/common.mjs';

export default {
  id: 'F1', title: 'Follow cam keeps the ball in the central 70 % in ≥ 90 % of flight frames; never hidden by nearby geometry', priority: 'P0',
  owners: ['camera'], timeout: 2400, quickTimeout: 900,
  method: 'Every throw of the ending sweep (≈ 11 flights, different targets) is sampled each tick while phase = flight, ball flying and `cam.mode` = follow: the ball centre is projected with the render camera; in-centre = in front and |ndc x|,|y| ≤ 0.7. Every 3rd frame 5 rays (centre ± ball radius) are cast from the camera against visible opaque meshes: all 5 blocked by something < 1 m from the camera = "hidden by nearby geometry". Also flags the camera inside a static collider box. The camera module\'s own `cam.metrics` ratio is shown for comparison.',
  async run(page, h) {
    const sw = await getSweep(h);
    const fl = flights(sw);
    if (!fl.length) return { status: 'fail', details: 'no flights recorded in the sweep' };
    let follow = 0, inC = 0;
    const rows = fl.map((x) => { follow += x.f.follow; inC += x.f.inCenter; return { id: x.id, label: x.label, frames: x.f.frames, follow: x.f.follow, ratio: pct(x.f.inCenter, x.f.follow), behind: x.f.behind, maxNdc: x.f.maxAbsNdc && +x.f.maxAbsNdc.toFixed(2), hiddenNear: x.f.hiddenNear, hiddenNearWhat: x.f.hiddenNearWhat, hiddenFar: x.f.hiddenFar, occChecks: x.f.occChecks, camInside: x.f.camInside, camInsideWhat: x.f.camInsideWhat, modes: x.f.camModes, camMetric: x.cam ? { ratio: x.cam.ratio, frames: x.cam.frames, occluded: x.cam.occluded } : null }; });
    const agg = pct(inC, follow);
    const fails = [], warns = [];
    if (!follow) fails.push('the camera never entered follow mode during a flight');
    else if (agg < 90) fails.push(`ball in central 70 % for only ${agg} % of follow frames`);
    const low = rows.filter((r) => r.follow && r.ratio < 80);
    if (low.length) warns.push(`flights below 80 %: ${low.map((r) => `${r.id} ${r.ratio}%`).join(', ')}`);
    const hid = rows.filter((r) => r.hiddenNear);
    if (hid.length) fails.push(`ball fully hidden by geometry < 1 m from the lens: ${hid.map((r) => `${r.id} ×${r.hiddenNear} (${r.hiddenNearWhat})`).join(', ')}`);
    const ins = rows.filter((r) => r.camInside);
    if (ins.length) fails.push(`camera inside a collider: ${ins.map((r) => `${r.id} (${r.camInsideWhat})`).join(', ')}`);
    const nf = rows.filter((r) => r.frames && !r.follow);
    if (nf.length) warns.push(`flights with no follow frames: ${nf.map((r) => `${r.id} ${JSON.stringify(r.modes)}`).join(', ')}`);
    return { status: verdict(fails, warns), partial: h.quick, details: `${rows.length} flights, ${follow} follow frames: ${agg} % in the central 70 %; per flight ${rows.map((r) => `${r.id} ${r.ratio}%`).join(', ')}. ${join(fails.concat(warns), 6)}`, metrics: { ratio: agg, frames: follow }, data: rows };
  },
};
