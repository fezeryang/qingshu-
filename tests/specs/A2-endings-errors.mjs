import { getSweep, sweepEndings, verdict, join } from '../lib/common.mjs';

export default {
  id: 'A2', title: 'All 13 endings run to completion (script-driven) with __qs.errors empty', priority: 'P0',
  owners: ['story', 'camera', 'characters', 'ui', 'audio', 'world'], timeout: 2400, quickTimeout: 900,
  method: 'Ending sweep (tests/lib/endings.mjs): each scenario on a freshly loaded page, played from `qs.start` to the ending card with `__qa.tick`; `__qs.errors` and console errors are collected per scenario (all attempts).',
  async run(page, h) {
    const sw = await getSweep(h);
    const fails = [], warns = [];
    const rows = sweepEndings(sw).map((e) => {
      const crashes = e.attempts.filter((a) => a.crash).map((a) => a.crash);
      const errs = [...new Set([...(e.errors || []), ...(e.consoleErrors || []), ...e.attempts.flatMap((a) => a.errors || [])])];
      return { id: e.id, status: e.status, card: !!e.ending?.reachedCard, errors: errs.slice(0, 10), crashes, warnings: (e.consoleWarnings || []).length };
    });
    for (const r of rows) {
      if (r.errors.length) fails.push(`${r.id}: ${r.errors.length} error(s) — ${r.errors[0].slice(0, 160)}`);
      if (r.crashes.length) fails.push(`${r.id}: harness exception ${r.crashes[0].slice(0, 120)}`);
      if (r.status === 'noCard') fails.push(`${r.id}: ending never reached the card`);
      if (r.status === 'unreached') warns.push(`${r.id}: not exercised (scenario precondition never met, see E1)`);
    }
    const done = rows.filter((r) => r.card).length;
    return { status: verdict(fails, warns), partial: h.quick, details: `${done}/${rows.length} endings reached the card; ${rows.filter((r) => r.errors.length).length} with errors. ${join([...fails, ...warns], 8)}`, data: rows };
  },
};
