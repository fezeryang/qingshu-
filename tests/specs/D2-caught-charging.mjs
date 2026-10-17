import { verdict } from '../lib/common.mjs';

export default {
  id: 'D2', title: 'Teacher facing class + player in view + continuous charging → teacher:caught within 3 s', priority: 'P0',
  owners: ['ai'], timeout: 300,
  method: 'Fresh round, teacher forced `watching`, suspicion 0, `ctx.input.simulate({down:"Mouse0"})` held. Measure game time from the first tick where `teacher.canSee(PLAYER_EYE)` (or charging visibility) is true to `teacher:caught`. Repeated for 3 seeds; all must be ≤ 3 s.',
  async run(page, h) {
    const S = h.S;
    const rows = [];
    for (const seed of h.quick ? [16] : [16, 17, 18]) {
      await S.fresh();
      await S.eval((o) => window.__qa.begin(o), { seed, gender: 'm', ambient: false, roundSeconds: 300 });
      rows.push(await S.eval(async () => {
        const c = window.__qs.ctx; const T = c.THREE; const L = c.layout;
        window.__qs.forceTeacher('watching', 999); window.__qs.setSuspicion(0);
        const eye = new T.Vector3(L.PLAYER_EYE.x, L.PLAYER_EYE.y, L.PLAYER_EYE.z);
        const ev0 = window.__qa.events.length;
        c.input.simulate({ down: 'Mouse0' });
        const t0 = c.time.now; let seenAt = null, caughtAt = null;
        while (c.time.now - t0 < 8) {
          await window.__qa.tick(1);
          const vis = c.ai.teacher.playerVisibility ? c.ai.teacher.playerVisibility() : null;
          if (seenAt == null && (c.ai.teacher.canSee(eye) || vis > 0.25)) seenAt = c.time.now - t0;
          const ev = window.__qa.events.slice(ev0).find((e) => e.type === 'teacher:caught');
          if (ev) { caughtAt = ev.t - t0; break; }
        }
        c.input.simulate({ up: 'Mouse0' });
        return { seenAt, caughtAt, charging: c.gameplay.aim.charging, suspicion: c.round.suspicion, caughtDuring: c.round.caughtDuring, phase: c.flow.phase };
      }));
      rows.at(-1).seed = seed;
    }
    const fails = [];
    for (const r of rows) {
      if (r.seenAt == null) fails.push(`seed ${r.seed}: teacher never saw the player while watching`);
      if (r.caughtAt == null) fails.push(`seed ${r.seed}: not caught within 8 s (suspicion ${r.suspicion?.toFixed(2)})`);
      else if (r.caughtAt - (r.seenAt ?? 0) > 3) fails.push(`seed ${r.seed}: caught after ${(r.caughtAt - (r.seenAt ?? 0)).toFixed(2)} s in view`);
    }
    return { status: verdict(fails, []), details: rows.map((r) => `seed ${r.seed}: in view at ${r.seenAt?.toFixed(2)} s, caught at ${r.caughtAt?.toFixed(2)} s`).join('; ') + (fails.length ? '. ' + fails.join('; ') : ''), data: rows };
  },
};
