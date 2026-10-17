import { getSweep, sweepEndings, verdict, join } from '../lib/common.mjs';
import { resolveCases, ENDING_IDS } from '../lib/endings.mjs';

export default {
  id: 'E1', title: 'All 13 endings reachable by deterministic scripts; resolve() matches the GDD §7 table', priority: 'P0',
  owners: ['story', 'gameplay', 'ai'], timeout: 2400, quickTimeout: 900,
  method: '(1) Ending sweep: one scenario per ending (tests/lib/endings.mjs) with fixed seeds; each attempt checks the physical precondition (e.g. landed on the crush\'s desk, unseen) and then that `ctx.round.endingId` is the expected ending. >1 attempt needed = unstable (warn). (2) `ctx.story.resolve()` is called on 24 synthetic rounds built from the live roster (all GDD §7 rows + priority edges); strict rows must match, interpretation rows only warn.',
  async run(page, h) {
    const S = h.S;
    // (2) resolve table
    await S.fresh();
    await S.eval((o) => window.__qa.begin(o), { seed: 11, gender: 'm', ambient: false, roundSeconds: 300 });
    const rs = await S.eval(() => {
      const r = window.__qs.ctx.round; const ro = window.__qa.roster(); const pg = r.playerGender; const sn = (t) => t === 'monitor' || t === 'disciplinarian';
      const seated = ro.filter((s) => s.seatId);
      const occupied = new Set(seated.map((s) => s.seatId));
      const f = (fn) => seated.find(fn) || null;
      return { crush: f((s) => s.isCrush), same: f((s) => s.gender === pg && !s.isCrush && !sn(s.trait)), sameSnitch: f((s) => s.gender === pg && !s.isCrush && sn(s.trait)), oppSnitch: f((s) => s.gender !== pg && !s.isCrush && sn(s.trait)), oppNormal: f((s) => s.gender !== pg && !s.isCrush && !sn(s.trait)), emptySeat: window.__qs.ctx.layout.SEATS.find((s) => !s.isPlayer && !occupied.has(s.id))?.id };
    });
    const cases = resolveCases(rs);
    const table = await S.eval((cs) => cs.map((c) => { let got; try { got = window.__qs.ctx.story.resolve({ ...window.__qs.ctx.round, teacherSawBall: false, caughtDuring: null, landing: null, ...c.round }); } catch (e) { got = 'THROW ' + e.message; } return { ...c, round: undefined, got }; }), cases);
    // (1) sweep
    const sw = await getSweep(h);
    const fails = [], warns = [];
    for (const t of table.filter((t) => t.got !== t.expect)) (t.strict ? fails : warns).push(`resolve(${t.name}) = ${t.got}, expected ${t.expect}`);
    const rows = sweepEndings(sw).map((e) => ({ id: e.id, status: e.status, attempts: e.attempts.length, used: e.used, got: e.ending?.endingId ?? null,
      tries: e.attempts.map((a) => a.crash ? `crash: ${a.crash.slice(0, 80)}` : `${a.label}${a.variant ? ` [${a.variant}]` : ''} → ${a.error || `${a.landing?.type}${a.landing?.seatId ? '@' + a.landing.seatId : ''}${a.teacherSawBall ? ' (seen)' : ''} → ${a.endingId}`}${a.via === 'ballistic' ? ' (solver null, ballistic fallback)' : ''}`) }));
    for (const r of rows) {
      if (r.status === 'mismatch') fails.push(`${r.id}: precondition met but ending was ${r.got}`);
      else if (r.status === 'unreached') fails.push(`${r.id}: unreachable by script in ${r.attempts} attempts (${join(r.tries, 3)})`);
      else if (r.status === 'noCard') fails.push(`${r.id}: never reached the card`);
      else if (r.used > 0) warns.push(`${r.id}: unstable — needed attempt #${r.used + 1} (${join(r.tries.slice(0, r.used), 2)})`);
    }
    const ok = rows.filter((r) => r.status === 'ok').length;
    const missing = ENDING_IDS.filter((id) => !rows.find((r) => r.id === id));
    return { status: verdict(fails, warns), partial: h.quick || missing.length > 0, details: `${ok}/${rows.length} scripted endings OK${missing.length ? ` (${missing.length} not run in quick mode)` : ''}; resolve table ${table.filter((t) => t.got === t.expect).length}/${table.length}. ${join([...fails, ...warns], 10)}`, data: { table, rows, rs } };
  },
};
