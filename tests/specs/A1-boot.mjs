import { sleep } from '../lib/session.mjs';
import { verdict, join } from '../lib/common.mjs';

export default {
  id: 'A1', title: 'Boots to the title (normal + lowfx) with 0 console errors / unhandled rejections', priority: 'P0',
  owners: ['core', 'world', 'ui', 'camera', 'characters', 'audio'], timeout: 400, quickTimeout: 200,
  method: 'Fresh browser context per mode (`?lowfx=1&mute=1`, and `?mute=1` in full runs), real-time loop running; wait for phase `title` + 3 s; read `__qs.errors` and page console errors/pageerrors; composited screenshot must not be blank. Boot time vs the 3 s budget is reported (warn only, SwiftShader).',
  async run(page, h) {
    const modes = h.quick ? ['lowfx=1&mute=1'] : ['lowfx=1&mute=1', 'mute=1'];
    const rows = [], fails = [], warns = [], evidence = [];
    for (const q of modes) {
      const name = q.includes('lowfx') ? 'lowfx' : 'normal';
      const s = await h.S.newSession({ query: q, manual: false });
      await s.page.waitForFunction(() => window.__qs.ctx.flow.phase === 'title', null, { timeout: 60000 });
      await sleep(3000);
      const errors = await s.errors();
      const consoleErrors = s.errorLogs(0);
      const warnings = s.logsSince(0).filter((l) => l.startsWith('[warning]'));
      const shot = await s.analyze(`A1/title-${name}`, { render: false });
      evidence.push(shot.file);
      const titleText = (await s.eval(() => window.__qa.uiText())).slice(0, 200);
      rows.push({ mode: name, bootMs: s.bootMs, errors, consoleErrors, warnings: warnings.slice(0, 20), lum: shot.lum, stdev: shot.stdev, titleText });
      if (errors.length || consoleErrors.length) fails.push(`${name}: ${errors.length} __qs.errors, ${consoleErrors.length} console errors (${join([...errors, ...consoleErrors].map((e) => e.slice(0, 120)), 3)})`);
      if (shot.lum < 8 || shot.stdev < 4) fails.push(`${name}: title screen looks blank (lum ${shot.lum}, stdev ${shot.stdev})`);
      if (s.bootMs > 3000) warns.push(`${name}: boot ${s.bootMs} ms > 3 s budget (headless SwiftShader)`);
      if (warnings.length) warns.push(`${name}: ${warnings.length} console warnings`);
      await s.context.close();
    }
    const details = rows.map((r) => `${r.mode}: boot ${r.bootMs} ms, ${r.errors.length + r.consoleErrors.length} errors, ${r.warnings.length} warnings`).join('; ');
    return { status: verdict(fails, warns), details: [details, ...fails, ...warns].join(' · '), evidence, data: rows, metrics: { bootMs: rows.map((r) => r.bootMs) } };
  },
};
