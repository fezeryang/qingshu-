import { sleep } from '../lib/session.mjs';
import { verdict } from '../lib/common.mjs';

const D = 180 / Math.PI;
export default {
  id: 'B2', title: 'Real input: moving the mouse in aim changes the view within angle limits', priority: 'P0',
  owners: ['camera'], timeout: 300,
  method: 'Fresh round at aim (teacher forced writing). Playwright `mouse.move` to centre / left / right / top / bottom edges, 1.5 s of game time each (manual stepping). Camera yaw/pitch are read from the rendered camera\'s world direction. Pass: left > centre > right yaw, top > bottom pitch, yaw range ≥ 40°, pitch range ≥ 20°, |yaw| ≤ 90°, pitch within [−60°, 60°].',
  async run(page, h) {
    const S = h.S;
    await S.fresh();
    await S.eval((o) => window.__qa.begin(o), { seed: 5, gender: 'm', ambient: false, roundSeconds: 300, teacher: 'writing' });
    await S.eval(() => window.__qs.forceTeacher('writing', 999));
    const vp = page.viewportSize();
    const pts = { centre: [vp.width / 2, vp.height / 2], left: [1, vp.height / 2], right: [vp.width - 2, vp.height / 2], top: [vp.width / 2, 1], bottom: [vp.width / 2, vp.height - 2], topLeft: [1, 1] };
    const res = {};
    for (const [k, [x, y]] of Object.entries(pts)) {
      await page.mouse.move(x, y, { steps: 4 });
      await sleep(50);
      res[k] = await S.eval(async () => { await window.__qa.step(1.5); const p = window.__qa.camPose(); return { yaw: p.yaw, pitch: p.pitch, nx: window.__qs.ctx.input.nx, ny: window.__qs.ctx.input.ny }; });
    }
    const shot = await S.shot('B2/look-top-left');
    const y = (k) => res[k].yaw * D, p = (k) => res[k].pitch * D;
    const fails = [];
    if (!(y('left') > y('centre') + 5 && y('centre') > y('right') + 5)) fails.push(`yaw not monotonic: L ${y('left').toFixed(1)} C ${y('centre').toFixed(1)} R ${y('right').toFixed(1)}`);
    if (!(p('top') > p('centre') + 3 && p('centre') > p('bottom') + 3)) fails.push(`pitch not monotonic: T ${p('top').toFixed(1)} C ${p('centre').toFixed(1)} B ${p('bottom').toFixed(1)}`);
    if (y('left') - y('right') < 40) fails.push(`yaw range only ${(y('left') - y('right')).toFixed(1)}°`);
    if (p('top') - p('bottom') < 20) fails.push(`pitch range only ${(p('top') - p('bottom')).toFixed(1)}°`);
    for (const k of Object.keys(res)) { if (Math.abs(y(k)) > 90) fails.push(`${k}: yaw ${y(k).toFixed(1)}° beyond ±90°`); if (p(k) > 60 || p(k) < -60) fails.push(`${k}: pitch ${p(k).toFixed(1)}° beyond ±60°`); }
    const details = `yaw L/C/R ${y('left').toFixed(0)}°/${y('centre').toFixed(0)}°/${y('right').toFixed(0)}°, pitch T/C/B ${p('top').toFixed(0)}°/${p('centre').toFixed(0)}°/${p('bottom').toFixed(0)}°`;
    return { status: verdict(fails, []), details: `${details}. ${fails.join('; ')}`, evidence: [shot], data: res };
  },
};
