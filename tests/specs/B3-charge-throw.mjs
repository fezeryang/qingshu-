import { verdict } from '../lib/common.mjs';

export default {
  id: 'B3', title: 'Real input: hold LMB charges (power rises, arm lifts) → release throws, camera follows', priority: 'P0',
  owners: ['gameplay', 'camera', 'characters'], timeout: 300,
  method: 'Fresh aim round. `document.elementFromPoint` at the press point must be the game canvas. Real `mouse.down` → 0.7 s manual stepping: `aim.charging`, `aim.power` rising, mean camera-local Y of the meshes parented to the camera (FP arms) must rise > 1 cm. `mouse.up` → within 0.2 s ball `flying`, phase `flight`, `ball:launched`; within 0.5 s `cam.mode` = follow; launch heading within 10° of the view yaw.',
  async run(page, h) {
    const S = h.S;
    await S.fresh();
    await S.eval((o) => window.__qa.begin(o), { seed: 6, gender: 'm', ambient: false, roundSeconds: 300 });
    await S.eval(() => window.__qs.forceTeacher('writing', 999));
    const vp = page.viewportSize();
    const x = vp.width / 2, y = vp.height * 0.3;
    await page.mouse.move(x, y);
    const armsY = () => S.eval(() => {
      const ctx = window.__qs.ctx; const T = ctx.THREE; const cam = window.__qa.camObj(); cam.updateMatrixWorld(true);
      let s = 0, n = 0, maxY = -9; const v = new T.Vector3();
      cam.traverse((o) => { if (o === cam || !o.isMesh) return; let vis = true; for (let p = o; p && p !== cam; p = p.parent) if (!p.visible) vis = false; if (!vis) return; o.getWorldPosition(v); cam.worldToLocal(v); s += v.y; n++; maxY = Math.max(maxY, v.y); });
      return { n, meanY: n ? s / n : null, maxY };
    });
    const before = await S.eval(async () => { await window.__qa.step(1); const el = document.elementFromPoint(innerWidth / 2, innerHeight * 0.3); return { el: el && (el.id || el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]), isCanvas: el === window.__qs.ctx.engine.canvas }; });
    const a0 = await armsY();
    await page.mouse.down();
    const samples = [];
    for (let i = 0; i < 7; i++) samples.push(await S.eval(async () => { await window.__qa.step(0.1); const a = window.__qs.ctx.gameplay.aim; return { charging: a.charging, power: +a.power.toFixed(3) }; }));
    const a1 = await armsY();
    const shot = await S.shot('B3/charging');
    const pose = await S.eval(() => window.__qa.camPose());
    await page.mouse.up();
    const after = await S.eval(async () => {
      const ctx = window.__qs.ctx; const ev0 = window.__qa.events.length;
      await window.__qa.step(0.2);
      const launched = window.__qa.events.slice(ev0 - 5).find((e) => e.type === 'ball:launched');
      const r = { phase: ctx.flow.phase, ball: ctx.gameplay.ball.state, launched: launched ? launched.p : null, vel: ctx.gameplay.ball.vel.toArray() };
      await window.__qa.step(0.3);
      r.cam = ctx.cam.mode;
      return r;
    });
    const shot2 = await S.shot('B3/flight');
    const fails = [], warns = [];
    if (!before.isCanvas) fails.push(`element at the press point is ${before.el}, not the canvas (UI blocks input)`);
    if (!samples[2].charging) fails.push('aim.charging false while LMB held');
    const pw = samples.map((s) => s.power);
    if (!(pw[5] > pw[1] + 0.15)) fails.push(`power did not rise (${pw.join(', ')})`);
    if (a0.meanY == null || a1.meanY == null) warns.push('no visible meshes under the camera (FP arms?)');
    else if (!(a1.meanY - a0.meanY > 0.01 || a1.maxY - a0.maxY > 0.01)) fails.push(`arms did not lift (camera-local Y ${a0.meanY.toFixed(3)} → ${a1.meanY.toFixed(3)})`);
    if (after.ball !== 'flying' && after.phase !== 'flight') fails.push(`after release: ball ${after.ball}, phase ${after.phase}`);
    if (!after.launched) fails.push('no ball:launched event');
    if (after.cam !== 'follow') fails.push(`camera mode ${after.cam} 0.5 s after release (expected follow)`);
    const vy = Math.atan2(-after.vel[0], -after.vel[2]);
    let dyaw = Math.abs(((vy - pose.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 180 / Math.PI;
    if (after.ball === 'flying' && dyaw > 10) fails.push(`launch heading ${dyaw.toFixed(1)}° off the view direction`);
    return { status: verdict(fails, warns), details: `power ${pw.join('→')}; arms ΔY ${a1.meanY != null && a0.meanY != null ? ((a1.meanY - a0.meanY) * 100).toFixed(1) + ' cm' : 'n/a'}; after release ${after.phase}/${after.ball}/cam ${after.cam}; heading Δ ${dyaw.toFixed(1)}°. ${fails.concat(warns).join('; ')}`, evidence: [shot, shot2], data: { before, a0, a1, samples, after, pose } };
  },
};
