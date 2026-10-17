// Shared helpers for specs (owner: qs-qa-lead).
import { runSweep, ENDING_IDS, QUICK_IDS } from './endings.mjs';

export const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
export const thumbDiff = (a, b) => { if (!a?.px || !b?.px || a.px.length !== b.px.length) return null; let s = 0; for (let i = 0; i < a.px.length; i++) s += Math.abs(a.px[i] - b.px[i]); return Math.round((100 * s) / a.px.length) / 100; };
export const verdict = (fails, warns) => (fails.length ? 'fail' : warns.length ? 'warn' : 'pass');
export const join = (arr, n = 6) => arr.slice(0, n).join('; ') + (arr.length > n ? `; … (+${arr.length - n})` : '');

/** The instrumented ending sweep, run once per test run and shared by A2, A4, E1–E3, F1, F2, F4, G1, J1, J2. */
export function getSweep(h) {
  return h.memo('sweep', (S) => {
    h.log(`  [sweep] running ${h.quick ? QUICK_IDS.length : ENDING_IDS.length} ending scenarios…`);
    return runSweep(S, { ids: h.quick ? QUICK_IDS : ENDING_IDS, quick: h.quick, shots: h.shots && !h.quick, a4: true, log: h.log });
  });
}
export const sweepEndings = (sw) => Object.values(sw.endings);
export const flights = (sw) => sweepEndings(sw).flatMap((e) => e.attempts.filter((a) => a.flight && a.flight.frames > 0).map((a) => ({ id: e.id, i: a.i, label: a.label, f: a.flight, cam: a.camFlight })));
