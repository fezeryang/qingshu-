import { verdict } from '../lib/common.mjs';

export default {
  id: 'B4', title: 'Real input: hold RMB / Space to pretend to study — suspicion drops, charging impossible', priority: 'P0',
  owners: ['gameplay', 'ai', 'camera'], timeout: 300,
  method: 'Fresh aim round, teacher forced `watching`, suspicion 0.6. (1) real right-button hold 1.5 s: `aim.studying`, suspicion falls ≥ 0.15, camera pitch drops (looks at the book). (2) real Space hold, then real LMB press 0.6 s: no charging, power 0; release: no launch. (3) LMB charge then Space mid-charge: `aim:cancel`, release does not throw.',
  async run(page, h) {
    const S = h.S;
    await S.fresh();
    await S.eval((o) => window.__qa.begin(o), { seed: 7, gender: 'f', ambient: false, roundSeconds: 300 });
    await S.eval(() => { window.__qs.forceTeacher('watching', 999); window.__qs.setSuspicion(0.6); });
    const vp = page.viewportSize();
    await page.mouse.move(vp.width / 2, vp.height / 2);
    const st = () => S.eval(() => { const c = window.__qs.ctx; return { studying: c.gameplay.aim.studying, charging: c.gameplay.aim.charging, power: +c.gameplay.aim.power.toFixed(3), susp: +(c.round.suspicion || 0).toFixed(3), phase: c.flow.phase, ball: c.gameplay.ball.state, pitch: window.__qa.camPose().pitch * 57.3 }; });
    const step = (s) => S.eval((x) => window.__qa.step(x), s);
    await step(0.5);
    const s0 = await st();
    await page.mouse.down({ button: 'right' });
    await step(1.5);
    const s1 = await st();
    const shot = await S.shot('B4/study');
    await page.mouse.up({ button: 'right' });
    await step(0.3);
    await page.keyboard.down('Space');
    await step(0.3);
    await page.mouse.down();
    await step(0.6);
    const s2 = await st();
    await page.mouse.up();
    await step(0.3);
    const s3 = await st();
    await page.keyboard.up('Space');
    await step(0.3);
    // cancel mid-charge
    await S.eval(() => window.__qs.forceTeacher('writing', 999));
    const ev0 = await S.eval(() => window.__qa.events.length);
    await page.mouse.down();
    await step(0.4);
    const s4 = await st();
    await page.keyboard.down('Space');
    await step(0.2);
    const s5 = await st();
    await page.mouse.up();
    await step(0.3);
    await page.keyboard.up('Space');
    await step(0.3);
    const s6 = await st();
    const cancelEv = await S.eval((i) => window.__qa.events.slice(i).filter((e) => e.type === 'aim:cancel' || e.type === 'aim:study').map((e) => e.type), ev0);
    const fails = [];
    if (!s1.studying) fails.push('RMB held but aim.studying false');
    if (!(s0.susp - s1.susp >= 0.15)) fails.push(`suspicion did not drop while studying (${s0.susp} → ${s1.susp})`);
    if (s2.charging || s2.power > 0.01) fails.push(`charging possible while studying (power ${s2.power})`);
    if (s3.ball === 'flying' || s3.phase !== 'aim') fails.push(`a throw happened while studying (phase ${s3.phase})`);
    if (!s4.charging) fails.push('LMB did not charge (cancel test)');
    if (s5.charging) fails.push('Space mid-charge did not cancel');
    if (!cancelEv.includes('aim:cancel')) fails.push('no aim:cancel event');
    if (s6.phase !== 'aim' || s6.ball === 'flying') fails.push(`release after cancel threw the ball (phase ${s6.phase})`);
    const warns = s1.pitch < s0.pitch - 10 ? [] : [`camera pitch did not drop much while studying (${s0.pitch.toFixed(0)}° → ${s1.pitch.toFixed(0)}°)`];
    return { status: verdict(fails, warns), details: `study: suspicion ${s0.susp}→${s1.susp}, pitch ${s0.pitch.toFixed(0)}°→${s1.pitch.toFixed(0)}°; Space+LMB power ${s2.power}; cancel events [${cancelEv.join(',')}]. ${fails.concat(warns).join('; ')}`, evidence: [shot], data: { s0, s1, s2, s3, s4, s5, s6, cancelEv } };
  },
};
