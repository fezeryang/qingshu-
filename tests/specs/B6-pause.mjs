import { click, SEL, sleep } from '../lib/session.mjs';
import { verdict } from '../lib/common.mjs';

export default {
  id: 'B6', title: 'Real input: Esc pauses (game time stops), resuming continues', priority: 'P0',
  owners: ['ui', 'core'], timeout: 300,
  method: 'Aim: real `Escape` press, 1 s of stepping → `ctx.time.now` must not advance, pause menu text visible; resume by clicking 继续 → time advances again. Flight: Escape mid-flight → ball position frozen across 1 s of stepping; resume with Escape.',
  async run(page, h) {
    const S = h.S;
    await S.fresh();
    await S.eval((o) => window.__qa.begin(o), { seed: 10, gender: 'm', ambient: false, roundSeconds: 300 });
    await S.eval(() => window.__qs.forceTeacher('writing', 999));
    const now = () => S.eval(() => ({ t: window.__qs.ctx.time.now, paused: window.__qs.ctx.engine.paused, ball: window.__qs.ctx.gameplay.ball.pos.toArray(), text: window.__qa.uiText().slice(0, 400) }));
    const step = (s) => S.eval((x) => window.__qa.step(x), s);
    await step(0.3);
    await page.keyboard.press('Escape');
    await step(0.1);
    const p0 = await now();
    await step(1);
    const p1 = await now();
    const shot = await S.shot('B6/paused');
    const fails = [], warns = [];
    if (Math.abs(p1.t - p0.t) > 1e-6) fails.push(`game time advanced while paused (${(p1.t - p0.t).toFixed(3)} s)`);
    if (!/继续/.test(p1.text)) warns.push('no 继续 text visible while paused');
    const how = await click(S, 'pause.resume', SEL.resume, { timeout: 4000 });
    if (!how) { await page.keyboard.press('Escape'); warns.push('resumed with Escape (继续 button not found)'); }
    await sleep(100);
    await step(1);
    const p2 = await now();
    if (!(p2.t - p1.t > 0.5)) fails.push(`time did not resume (${(p2.t - p1.t).toFixed(3)} s in 1 s)`);
    // flight
    await S.eval(() => { const s = window.__qa.solve({ name: 'r0c2' }); if (s.sol) window.__qs.ctx.gameplay.launch(s.sol); });
    await step(0.2);
    await page.keyboard.press('Escape');
    await step(0.1);
    const f0 = await now();
    await step(1);
    const f1 = await now();
    const moved = Math.hypot(f1.ball[0] - f0.ball[0], f1.ball[1] - f0.ball[1], f1.ball[2] - f0.ball[2]);
    if (moved > 1e-4) fails.push(`ball moved ${moved.toFixed(3)} m while paused in flight`);
    if (!f0.paused) warns.push('engine.paused false in flight after Esc');
    await page.keyboard.press('Escape');
    await sleep(100);
    await step(0.5);
    const f2 = await now();
    if (Math.hypot(f2.ball[0] - f1.ball[0], f2.ball[1] - f1.ball[1], f2.ball[2] - f1.ball[2]) < 1e-3 && f2.t - f1.t < 0.1) fails.push('Escape did not resume during flight');
    return { status: verdict(fails, warns), details: `aim: Δt paused ${(p1.t - p0.t).toFixed(3)} s, after resume ${(p2.t - p1.t).toFixed(2)} s; flight: ball moved ${moved.toFixed(4)} m while paused. ${fails.concat(warns).join('; ')}`, evidence: [shot], data: { p0: { ...p0, text: undefined }, p1, p2: { ...p2, text: undefined }, f0, f1, f2 } };
  },
};
