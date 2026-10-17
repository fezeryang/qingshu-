import { verdict } from '../lib/common.mjs';

export default {
  id: 'F3', title: 'Teacher turning mid-flight opens the PiP window', priority: 'P1',
  owners: ['camera', 'ai'], timeout: 300,
  method: 'Fresh round, quiet class, teacher forced writing; long lob to the podium; 0.3 s into the flight (a) `ai.students.trigger("teacherTurn")`, (b) in a second run `forceTeacher("watching")`. Within 0.6 s the PiP must be detectable: > 1 renderer.render call per frame, or `cam.debug().pip`, or a `cam.pip(true)` call. Screenshot of the PiP.',
  async run(page, h) {
    const S = h.S;
    const one = async (how) => {
      await S.fresh();
      await S.eval((o) => window.__qa.begin(o), { seed: 25, gender: 'm', ambient: false, roundSeconds: 300 });
      const r = await S.eval(async (hw) => {
        const c = window.__qs.ctx; const qa = window.__qa;
        window.__qs.forceTeacher('writing', 999);
        const s = qa.solve({ name: 'podium' }, {});
        if (!s.sol) return { error: s.error };
        c.gameplay.launch(s.sol);
        await qa.step(0.3);
        const rc = () => { const a = qa.renderCalls; window.__qs.render(); return qa.renderCalls - a; };
        const before = rc();
        const call0 = qa.calls.length;
        if (hw === 'trigger') c.ai.students.trigger('teacherTurn'); else window.__qs.forceTeacher('watching', 999);
        let best = { calls: 0 };
        for (let i = 0; i < 6; i++) { await qa.step(0.1); const n = rc(); const dbg = c.cam.debug ? c.cam.debug() : {}; if (n > best.calls || dbg.pip) best = { calls: n, pip: !!dbg.pip, t: i * 0.1 + 0.1, flying: c.gameplay.ball.state }; if (n > 1 || dbg.pip) break; }
        const pipCalls = qa.calls.slice(call0).filter((x) => x.api === 'cam.pip').map((x) => x.args[0]);
        return { before, best, pipCalls, teacher: c.ai.teacher.state, phase: c.flow.phase };
      }, how);
      r.shot = await S._shot(`F3/pip-${how}`);
      return r;
    };
    const a = await one('trigger');
    const b = await one('force');
    const fails = [];
    const ok = (r) => !r.error && (r.best.calls > 1 || r.best.pip || r.pipCalls.includes(true));
    if (!ok(a)) fails.push(`trigger('teacherTurn'): no PiP (render calls ${a.before}→${a.best?.calls}, teacher ${a.teacher}, ${a.error || ''})`);
    if (!ok(b)) fails.push(`forceTeacher('watching') mid-flight: no PiP (render calls ${b.before}→${b.best?.calls}, teacher ${b.teacher})`);
    return { status: verdict(fails, []), details: `trigger: ${a.best?.calls} render calls/frame, pip=${a.best?.pip} after ${a.best?.t}s; force: ${b.best?.calls}, pip=${b.best?.pip}. ${fails.join('; ')}`, evidence: [a.shot, b.shot], data: { a, b } };
  },
};
