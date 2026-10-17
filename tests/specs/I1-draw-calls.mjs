import { verdict } from '../lib/common.mjs';

export default {
  id: 'I1', title: 'Aim view ≤ 800 draw calls and ≤ 800k triangles', priority: 'P1',
  owners: ['world', 'characters', 'ui'], timeout: 400, quickTimeout: 200,
  method: 'Fresh aim round (ambient on) in lowfx and in normal mode (shadows on); the camera is turned left / centre / right / up with real mouse moves; `__qs.render()` then `__qs.state().drawCalls/triangles` (renderer.info of the last render, shadow passes included). Max over views must be within budget.',
  async run(page, h) {
    const modes = h.quick ? ['lowfx=1&mute=1'] : ['lowfx=1&mute=1', 'mute=1'];
    const rows = [];
    for (const q of modes) {
      const s = await h.S.newSession({ query: q });
      await s.eval((o) => window.__qa.begin(o), { seed: 30, gender: 'm', teacher: 'writing' });
      const vp = s.page.viewportSize();
      for (const [name, x, y] of [['centre', 0.5, 0.5], ['left', 0.02, 0.5], ['right', 0.98, 0.5], ['up', 0.5, 0.05]]) {
        await s.page.mouse.move(vp.width * x, vp.height * y);
        const st = await s.eval(async () => { await window.__qa.step(1.2); window.__qs.render(); const r = window.__qs.state(); return { drawCalls: r.drawCalls, triangles: r.triangles, mem: { ...window.__qs.ctx.engine.renderer.info.memory } }; });
        rows.push({ mode: q.includes('lowfx') ? 'lowfx' : 'normal', view: name, ...st });
      }
      await s.context.close();
    }
    const maxDC = Math.max(...rows.map((r) => r.drawCalls)), maxTri = Math.max(...rows.map((r) => r.triangles));
    const fails = [];
    if (maxDC > 800) fails.push(`draw calls ${maxDC} > 800`);
    if (maxTri > 800000) fails.push(`triangles ${maxTri} > 800k`);
    return { status: verdict(fails, []), details: rows.map((r) => `${r.mode}/${r.view}: ${r.drawCalls} dc, ${Math.round(r.triangles / 1000)}k tri`).join('; ') + (fails.length ? '. ' + fails.join('; ') : ''), metrics: { maxDC, maxTri }, data: rows };
  },
};
