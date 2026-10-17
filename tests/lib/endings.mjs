// The 13 deterministic ending scenarios + the instrumented "ending sweep" (owner: qs-qa-lead).
//
// Every scenario is a list of attempts. An attempt = fresh page → __qa.begin (qs.start with a fixed
// seed, quiet class, wind frozen, teacher forced) → __qa.act (throw / charge / idle) → precondition on the
// *physical* outcome (e.g. "landed on the crush's desk, unseen"). The first attempt whose precondition holds
// is played to the ending card while recording E2 metrics. Needing more than one attempt is reported as
// instability; never meeting the precondition is reported as "unreachable by script".
import { sleep, click, SEL } from './session.mjs';

export const CUSTOM_LETTER = '教室第四排的风都知道，我偷看了你一百零八次<3';
export const ENDING_IDS = ['perfect', 'same_gender', 'wrong_caught', 'wrong_accept', 'caught_read', 'chalk_counter', 'graded', 'three_pointer', 'out_window', 'confetti', 'self_love', 'lost', 'coward'];
export const QUICK_IDS = ['perfect', 'caught_read', 'three_pointer', 'coward'];

const Q = { teacher: 'writing', suspicion: 0, ambient: false, roundSeconds: 300 };
const desk = (r) => ['desk', 'chair'].includes(r.landing?.type);
const ownerIs = (r, f) => r.landing?.owner && f(r.landing.owner);
const unseen = (r) => !r.teacherSawBall && r.caughtDuring !== 'flight';
const SN = (t) => t === 'monitor' || t === 'disciplinarian';

export const SCENARIOS = {
  perfect: {
    pre: (r) => r.launched && desk(r) && r.landing.ownerId === r.crushId && unseen(r),
    attempts: [
      { ...Q, seed: 11, gender: 'm', action: 'throw', target: { pick: 'crush' } },
      { ...Q, seed: 12, gender: 'm', action: 'throw', target: { pick: 'crush' } },
      { ...Q, seed: 13, gender: 'f', action: 'throw', target: { pick: 'crush' } },
      { ...Q, seed: 14, gender: 'm', action: 'throw', target: { pick: 'crush' }, throwOpts: { pitchDeg: 50 } },
    ],
  },
  same_gender: {
    pre: (r) => r.launched && desk(r) && ownerIs(r, (o) => o.gender === r.playerGender && !o.isCrush) && unseen(r),
    attempts: [
      { ...Q, seed: 21, gender: 'm', action: 'throw', target: { pick: 'sameGender', index: 0 } },
      { ...Q, seed: 21, gender: 'm', action: 'throw', target: { pick: 'sameGender', index: 1 } },
      { ...Q, seed: 22, gender: 'f', action: 'throw', target: { pick: 'sameGender', index: 0 } },
      { ...Q, seed: 23, gender: 'm', action: 'throw', target: { pick: 'sameGender', index: 2 } },
    ],
  },
  wrong_caught: {
    pre: (r) => r.launched && desk(r) && ownerIs(r, (o) => o.gender !== r.playerGender && !o.isCrush && (SN(o.trait) || r.teacherSawBall)),
    attempts: [
      { ...Q, seed: 31, gender: 'm', action: 'throw', target: { pick: 'oppSnitch', index: 0 }, variant: 'snitch recipient' },
      { ...Q, seed: 32, gender: 'f', action: 'throw', target: { pick: 'oppSnitch', index: 0 }, variant: 'snitch recipient' },
      { ...Q, seed: 33, gender: 'm', action: 'throw', target: { pick: 'oppNormal', index: 0 }, seenFlight: true, variant: 'teacherSawBall (set during flight)' },
      { ...Q, seed: 34, gender: 'm', action: 'throw', target: { pick: 'oppSnitch', index: 0 }, variant: 'snitch recipient' },
    ],
  },
  wrong_accept: {
    pre: (r) => r.launched && desk(r) && ownerIs(r, (o) => o.gender !== r.playerGender && !o.isCrush && !SN(o.trait)) && unseen(r),
    attempts: [
      { ...Q, seed: 41, gender: 'm', action: 'throw', target: { pick: 'oppNormal', index: 0 } },
      { ...Q, seed: 41, gender: 'm', action: 'throw', target: { pick: 'oppNormal', index: 1 } },
      { ...Q, seed: 42, gender: 'f', action: 'throw', target: { pick: 'oppNormal', index: 0 } },
      { ...Q, seed: 43, gender: 'm', action: 'throw', target: { pick: 'oppNormal', index: 2 } },
    ],
  },
  caught_read: {
    pre: (r) => (!r.launched && r.caughtDuring === 'aim') || (r.launched && r.teacherSawBall && desk(r) && r.landing.ownerId === r.crushId),
    attempts: [
      { seed: 51, gender: 'm', teacher: 'watching', suspicion: 0.9, ambient: false, roundSeconds: 300, action: 'charge', letter: CUSTOM_LETTER, timeout: 15, variant: 'caught while charging (aim)' },
      { seed: 52, gender: 'f', teacher: 'watching', suspicion: 0.9, ambient: false, roundSeconds: 300, action: 'charge', letter: CUSTOM_LETTER, timeout: 15, variant: 'caught while charging (aim)' },
      { ...Q, seed: 53, gender: 'm', action: 'throw', target: { pick: 'crush' }, seenFlight: true, letter: CUSTOM_LETTER, variant: 'teacher saw the ball, landed on the crush' },
    ],
  },
  chalk_counter: {
    pre: (r) => r.launched && (r.landing?.type === 'teacher' || (r.landing?.hits || []).some((h) => h.tag === 'teacher')),
    attempts: [
      { ...Q, seed: 61, gender: 'm', action: 'throw', target: { name: 'teacher' } },
      { ...Q, seed: 61, gender: 'm', action: 'throw', target: { teacherHead: true }, throwOpts: { fallbackPitch: 30 } },
      { ...Q, seed: 62, gender: 'f', action: 'throw', target: { name: 'teacher' }, throwOpts: { mode: 'flat', fallbackPitch: 25 } },
    ],
  },
  graded: {
    pre: (r) => r.launched && r.landing?.type === 'podium',
    attempts: [
      { ...Q, seed: 71, gender: 'm', action: 'throw', target: { name: 'podium' } },
      { ...Q, seed: 72, gender: 'f', action: 'throw', target: { name: 'podium' }, throwOpts: { pitchDeg: 45 } },
      { ...Q, seed: 73, gender: 'm', action: 'throw', target: { point: [0.3, 1.2, -4.95] } },
    ],
  },
  three_pointer: {
    pre: (r) => r.launched && r.landing?.type === 'trash',
    attempts: [
      { ...Q, seed: 81, gender: 'm', action: 'throw', target: { name: 'trash' } },
      { ...Q, seed: 82, gender: 'f', action: 'throw', target: { name: 'trash' }, throwOpts: { pitchDeg: 60 } },
      { ...Q, seed: 83, gender: 'm', action: 'throw', target: { name: 'trash' } },
    ],
  },
  out_window: {
    pre: (r) => r.launched && r.landing?.type === 'outside',
    attempts: [
      { ...Q, seed: 91, gender: 'm', action: 'throw', target: { name: 'window' } },
      { ...Q, seed: 92, gender: 'f', action: 'throw', target: { point: [-5.8, 1.5, -0.7] } },
      { ...Q, seed: 93, gender: 'm', action: 'throw', target: { name: 'window' }, throwOpts: { pitchDeg: 30 } },
    ],
  },
  confetti: {
    pre: (r) => r.launched && r.landing?.type === 'fan',
    attempts: [
      { ...Q, seed: 101, gender: 'm', action: 'throw', target: { name: 'fan' } },
      { ...Q, seed: 101, gender: 'm', action: 'throw', target: { fan: 0, angle: 90 } },
      { ...Q, seed: 102, gender: 'f', action: 'throw', target: { fan: 1, angle: 180 } },
      { ...Q, seed: 103, gender: 'm', action: 'throw', target: { fan: 0, angle: 270, radius: 0.75 } },
    ],
  },
  self_love: {
    pre: (r) => r.launched && r.landing?.type === 'self',
    attempts: [
      { ...Q, seed: 111, gender: 'm', action: 'throw', target: { name: 'self' } },
      { ...Q, seed: 112, gender: 'f', action: 'throw', target: { name: 'self' }, throwOpts: { pitchDeg: 75 } },
      { ...Q, seed: 113, gender: 'm', action: 'throw', target: { name: 'self' }, throwOpts: { pitchDeg: 80 } },
    ],
  },
  lost: {
    pre: (r) => r.launched && r.landing?.type === 'floor' && unseen(r),
    attempts: [
      { ...Q, seed: 121, gender: 'm', action: 'throw', target: { name: 'floor' } },
      { ...Q, seed: 122, gender: 'f', action: 'throw', target: { point: [1.4, 0.04, 0.0] } },
      { ...Q, seed: 123, gender: 'm', action: 'throw', target: { point: [-1.4, 0.04, -1.3] } },
    ],
  },
  coward: {
    pre: (r) => !r.launched && !r.caughtDuring,
    attempts: [
      { seed: 131, gender: 'm', teacher: 'writing', suspicion: 0, ambient: false, roundSeconds: 3, action: 'idle', timeout: 20 },
      { seed: 132, gender: 'f', teacher: 'writing', suspicion: 0, ambient: false, roundSeconds: 3, action: 'idle', timeout: 20 },
    ],
  },
};

/** "再来一局" after an ending → back in aim; snapshot for A4/F4. */
async function retryCheck(S, id, base, shots) {
  await S.eval(async () => { window.__qs.cardChoice('retry'); await window.__qa.step(0.25); });
  let via = 'cardChoice';
  if ((await S.phase()) === 'card') { via = (await click(S, 'card.retry', SEL.retry, { timeout: 5000 })) || 'none'; await S.eval(() => window.__qa.step(0.2)); }
  const snap = await S.eval(async () => {
    const ok = await window.__qa.stepUntil(() => window.__qs.ctx.flow.phase === 'aim', 45);
    await window.__qa.step(0.8);
    return { ok, ...window.__qa.aimSnapshot() };
  });
  snap.via = via;
  snap.shot = await S.analyze(shots ? `a4/${id}-retry` : null);
  snap.base = base;
  return snap;
}

export async function runSweep(S, { ids = ENDING_IDS, quick = false, shots = true, a4 = true, log = () => {} } = {}) {
  const out = { startedAt: new Date().toISOString(), quick, ids, endings: {} };
  for (const id of ids) {
    const sc = SCENARIOS[id];
    const rec = { id, attempts: [], status: 'unreached' };
    out.endings[id] = rec;
    const attempts = quick ? sc.attempts.slice(0, 2) : sc.attempts;
    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i];
      const t0 = Date.now();
      let att;
      try {
        await S.fresh();
        const begin = await S.eval((o) => window.__qa.begin(o), a);
        const base = a4 ? { ...(await S.eval(() => window.__qa.aimSnapshot())), shot: await S.analyze(null) } : null;
        if (base) { delete base.shot.thumb; base.hud = base.hud.slice(0, 600); }
        const act = await S.eval((o) => window.__qa.act(o), a);
        const pre = !act.error && !!sc.pre(act);
        att = { i, seed: a.seed, gender: a.gender, variant: a.variant || null, label: act.label || a.action, via: act.via, solveMs: act.solveMs, error: act.error || null,
          expect: act.expect || null, landing: act.landing, endingId: act.endingId, teacherSawBall: act.teacherSawBall, caughtDuring: act.caughtDuring,
          crushId: begin.crushId, pre, flight: act.launched ? act.flight : null, camFlight: act.camFlight, errors: act.errors, timedOut: act.timedOut };
        rec.attempts.push(att);
        log(`  ${id} #${i}: ${act.error || `landing=${act.landing?.type}${act.landing?.seatId ? '@' + act.landing.seatId : ''} → ${act.endingId}`} ${pre ? '(precondition met)' : ''}`);
        if (!pre) continue;
        const ending = await S.eval((o) => window.__qa.recordEnding(o), { shotAt: shots ? [1.5, 5] : [], prefix: shots ? `endings/${id}` : null, thumbEvery: quick ? 0 : 2, letter: a.letter || null, timeout: 160 });
        rec.ending = ending;
        rec.used = i;
        rec.status = ending.endingId === id ? (ending.reachedCard ? 'ok' : 'noCard') : 'mismatch';
        if (a4 && ending.reachedCard) rec.a4 = await retryCheck(S, id, base, shots);
        rec.errors = await S.errors();
        rec.consoleErrors = S.errorLogs();
        rec.consoleWarnings = S.logsSince().filter((l) => l.startsWith('[warning]')).slice(0, 30);
        rec.ms = Date.now() - t0;
        break;
      } catch (e) {
        rec.attempts.push({ i, seed: a.seed, crash: String(e.message || e).slice(0, 600) });
        log(`  ${id} #${i}: exception ${String(e.message || e).slice(0, 200)}`);
        await sleep(200);
      }
    }
    if (rec.status === 'unreached') { rec.errors = await S.errors().catch(() => []); rec.consoleErrors = S.errorLogs(); }
  }
  out.finishedAt = new Date().toISOString();
  return out;
}

/** GDD §7 resolve() table, built from the live roster. strict rows are P0; derived rows are interpretations. */
export function resolveCases(rs) {
  const L = (type, owner, extra = {}) => ({ type, seatId: owner?.seatId ?? null, ownerId: owner?.id ?? null, pos: null, hits: [], flightTime: 1, bounces: 0, nearMisses: [], ...extra });
  const rows = [
    ['coward: timer ran out, never threw', { launched: false, caughtDuring: null }, 'coward', true],
    ['caught during aim', { launched: false, caughtDuring: 'aim' }, 'caught_read', true],
    ['ball hit the teacher (unseen)', { launched: true, landing: L('teacher', null, { hits: [{ tag: 'teacher', ownerId: 'teacher', t: 0.5, speed: 3 }] }) }, 'chalk_counter', true],
    ['ball hit the teacher (seen)', { launched: true, teacherSawBall: true, landing: L('teacher', null, { hits: [{ tag: 'teacher', ownerId: 'teacher', t: 0.5, speed: 3 }] }) }, 'chalk_counter', true],
    ['podium', { launched: true, landing: L('podium') }, 'graded', true],
    ['podium (seen)', { launched: true, teacherSawBall: true, landing: L('podium') }, 'graded', true],
    ['trash', { launched: true, landing: L('trash') }, 'three_pointer', true],
    ['outside', { launched: true, landing: L('outside') }, 'out_window', true],
    ['fan', { launched: true, landing: L('fan') }, 'confetti', true],
    ['own desk (self)', { launched: true, landing: L('self', null, { seatId: 'r4c0' }) }, 'self_love', true],
    ['crush desk, unseen', { launched: true, landing: L('desk', rs.crush) }, 'perfect', true],
    ['crush chair, unseen', { launched: true, landing: L('chair', rs.crush) }, 'perfect', true],
    ['crush desk, seen', { launched: true, teacherSawBall: true, landing: L('desk', rs.crush) }, 'caught_read', true],
    ['same-gender desk, unseen', { launched: true, landing: L('desk', rs.same) }, 'same_gender', true],
    ['same-gender desk, seen', { launched: true, teacherSawBall: true, landing: L('desk', rs.same) }, 'caught_read', true],
    ['opposite snitch desk, unseen', { launched: true, landing: L('desk', rs.oppSnitch) }, 'wrong_caught', true],
    ['opposite normal desk, seen', { launched: true, teacherSawBall: true, landing: L('desk', rs.oppNormal) }, 'wrong_caught', true],
    ['opposite normal desk, unseen', { launched: true, landing: L('desk', rs.oppNormal) }, 'wrong_accept', true],
    ['floor, unseen', { launched: true, landing: L('floor') }, 'lost', true],
    ['floor, seen', { launched: true, teacherSawBall: true, landing: L('floor') }, 'caught_read', true],
    ['self, seen (GDD: self_love is above the caught_read floor/crush rule)', { launched: true, teacherSawBall: true, landing: L('self', null, { seatId: 'r4c0' }) }, 'self_love', false],
    ['intercept by opposite non-snitch (PE-rep catch = their desk)', { launched: true, landing: L('intercept', rs.oppNormal) }, 'wrong_accept', false],
    ['same-gender snitch, unseen (same_gender outranks?)', { launched: true, landing: L('desk', rs.sameSnitch) }, 'same_gender', false],
    ['empty desk, unseen', { launched: true, landing: L('desk', { seatId: rs.emptySeat, id: null }) }, 'lost', false],
  ];
  return rows.filter(([, r]) => !r.landing || r.landing.type !== 'desk' || r.landing.ownerId || r.landing.seatId).map(([name, round, expect, strict]) => ({ name, round, expect, strict }));
}
