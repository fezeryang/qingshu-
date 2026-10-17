import { verdict } from '../lib/common.mjs';

export default {
  id: 'D4', title: 'A ball flying long enough inside the teacher\'s view cone → teacherSawBall', priority: 'P0',
  owners: ['ai'], timeout: 300,
  method: 'Fresh round, teacher forced watching, suspicion 0; high lob to a front-row desk / the podium. Counts flight time with `teacher.canSee(ball.pos)`; after landing `ctx.round.teacherSawBall` must be true (and `teacher:caught {reason:"ball"}` emitted). Control: same throw with the teacher forced writing → teacherSawBall false.',
  async run(page, h) {
    const S = h.S;
    const run = async (teacher, target) => {
      await S.fresh();
      await S.eval((o) => window.__qa.begin(o), { seed: 20, gender: 'm', ambient: false, roundSeconds: 300 });
      return S.eval(async ([tch, tg]) => {
        const c = window.__qs.ctx;
        window.__qs.forceTeacher(tch, 999); window.__qs.setSuspicion(0);
        const s = window.__qa.solve(tg, {});
        if (!s.sol) return { error: s.error };
        const ev0 = window.__qa.events.length;
        c.gameplay.launch(s.sol);
        let inView = 0;
        while (c.flow.phase === 'aim' || c.flow.phase === 'flight') { await window.__qa.tick(1); if (c.gameplay.ball.state === 'flying' && c.ai.teacher.canSee(c.gameplay.ball.pos)) inView += c.time.dt; if (c.time.now > 400) break; }
        return { target: s.label, inView: +inView.toFixed(2), saw: c.round.teacherSawBall, caught: window.__qa.events.slice(ev0).filter((e) => e.type === 'teacher:caught').map((e) => e.p.reason), landing: c.round.landing && c.round.landing.type, endingId: c.round.endingId };
      }, [teacher, target]);
    };
    const seen = await run('watching', { name: 'r0c2' });
    const ctrl = await run('writing', { name: 'r0c2' });
    const fails = [];
    if (seen.error) fails.push(seen.error);
    else {
      if (!seen.saw) fails.push(`teacherSawBall false after ${seen.inView} s in view`);
      if (seen.saw && !seen.caught.includes('ball')) fails.push('no teacher:caught {reason:"ball"}');
      if (seen.inView < 0.2) fails.push(`ball was only ${seen.inView} s in view — setup did not test the cone`);
    }
    if (ctrl.saw) fails.push('control (teacher writing) also set teacherSawBall');
    return { status: verdict(fails, []), details: `watching: ${seen.inView}s in view → saw ${seen.saw} (${seen.endingId}); writing control → saw ${ctrl.saw} (${ctrl.endingId}). ${fails.join('; ')}`, data: { seen, ctrl } };
  },
};
