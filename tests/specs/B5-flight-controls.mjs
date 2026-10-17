import { verdict } from '../lib/common.mjs';

const SETUP = { seed: 9, gender: 'm', ambient: false, roundSeconds: 300 };
const TARGETS = [{ name: 'r0c3' }, { name: 'r0c2' }, { name: 'r1c3' }, { name: 'r0c4' }, { name: 'podium' }];

/** One deterministic flight: fresh page, same seed and solution; `during` runs real key presses 0.15 s after launch. */
async function flight(S, page, during) {
  await S.fresh();
  await S.eval((o) => window.__qa.begin(o), SETUP);
  const sol = await S.eval((ts) => { window.__qs.forceTeacher('writing', 999); let s; for (const t of ts) { s = window.__qa.solve(t); if (s.sol) break; } if (s.sol) window.__qs.ctx.gameplay.launch(s.sol); return s; }, TARGETS);
  if (!sol.sol) return { error: sol.error };
  await S.eval(() => window.__qa.step(0.15));
  const ev0 = await S.eval(() => window.__qa.events.length);
  const extra = during ? await during() : null;
  const r = await S.eval(async (i) => {
    const c = window.__qs.ctx; let minScale = 1;
    window.__qa.samplers.set('b5', () => { minScale = Math.min(minScale, c.engine.timeScale); });
    await window.__qa.stepUntil(() => c.flow.phase !== 'flight', 20);
    window.__qa.samplers.delete('b5');
    const L = c.round.landing;
    return { phase: c.flow.phase, pos: L && L.pos ? [L.pos.x, L.pos.y, L.pos.z] : null, type: L && L.type, seatId: L && L.seatId, minScale, events: window.__qa.events.slice(i).filter((e) => /willpower|cam:mode|slowmo/.test(e.type)).map((e) => ({ type: e.type, p: e.p, t: e.t })) };
  }, ev0);
  return { sol: sol.sol, target: sol.label, extra, ...r };
}
const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[2] - b[2]) : null);

export default {
  id: 'B5', title: 'Real input in flight: C cycles camera styles; Space = slow motion; A/D shift the landing point', priority: 'P0',
  owners: ['gameplay', 'camera'], timeout: 600, quickTimeout: 400,
  method: 'Same seed + same solved throw (first solvable of r0c3 / r0c2 / r1c3 / r0c4 / podium) replayed on fresh pages. Baseline twice (determinism), then real Space+D held from 0.15 s after launch, then Space+A, then KeyC presses. Pass: baselines identical (< 1 cm), Space → timeScale < 0.9 and `ball:willpower {on:true}`, D and A each move the landing ≥ 0.15 m and to opposite sides, each C press changes the follow style (cam:mode event with a different style or camera→ball offset change > 25°).',
  async run(page, h) {
    const S = h.S;
    const keysHold = (keys) => async () => { for (const k of keys) await page.keyboard.down(k); await S.eval(() => window.__qa.step(1.2)); const w = await S.eval(() => ({ active: window.__qs.ctx.gameplay.willpower.active, value: window.__qs.ctx.gameplay.willpower.value, scale: window.__qs.ctx.engine.timeScale })); for (const k of keys) await page.keyboard.up(k); return w; };
    const b1 = await flight(S, page, null);
    const b2 = h.quick ? b1 : await flight(S, page, null);
    const right = await flight(S, page, keysHold(['Space', 'KeyD']));
    const left = h.quick ? null : await flight(S, page, keysHold(['Space', 'KeyA']));
    const cyc = await flight(S, page, async () => {
      const out = [];
      const off = () => S.eval(() => { const c = window.__qs.ctx; const cp = window.__qa.camPose().pos; const b = c.gameplay.ball.pos; const v = [cp[0] - b.x, cp[1] - b.y, cp[2] - b.z]; const n = Math.hypot(...v) || 1; return { v: v.map((x) => x / n), d: n, style: c.cam.followStyle ?? null }; });
      let prev = await off();
      for (let i = 0; i < 2; i++) {
        await page.keyboard.press('KeyC');
        await S.eval(() => window.__qa.step(0.45));
        const cur = await off();
        const ang = Math.acos(Math.max(-1, Math.min(1, prev.v[0] * cur.v[0] + prev.v[1] * cur.v[1] + prev.v[2] * cur.v[2]))) * 57.3;
        out.push({ ang: +ang.toFixed(1), dRatio: +(cur.d / prev.d).toFixed(2), style: cur.style });
        prev = cur;
      }
      return out;
    });
    const shot = await S.shot('B5/after-c');
    const fails = [], warns = [];
    if (b1.error) return { status: 'fail', details: `could not solve the reference throw: ${b1.error}` };
    const det = dist(b1.pos, b2.pos);
    if (!h.quick && det > 0.01) fails.push(`same seed + same throw landed ${det.toFixed(3)} m apart (non-deterministic)`);
    const willOn = right.events.some((e) => e.type === 'ball:willpower' && e.p?.on);
    if (!willOn) fails.push('no ball:willpower {on:true} while Space held in flight');
    if (!(right.extra?.scale < 0.9 || right.minScale < 0.9)) fails.push(`no slow motion while holding Space (timeScale ${right.extra?.scale})`);
    const dR = dist(b1.pos, right.pos), dL = left ? dist(b1.pos, left.pos) : null;
    if (!(dR >= 0.15)) fails.push(`Space+D moved the landing only ${dR?.toFixed(3)} m`);
    if (left && !(dL >= 0.15)) fails.push(`Space+A moved the landing only ${dL?.toFixed(3)} m`);
    if (left && right.pos && left.pos && b1.pos) {
      const side = (p) => { const dir = [b1.pos[0] + 3.12, b1.pos[2] - 2.22]; return (p[0] - b1.pos[0]) * -dir[1] + (p[2] - b1.pos[2]) * dir[0]; };
      if (Math.sign(side(right.pos)) === Math.sign(side(left.pos))) fails.push('A and D pushed the ball to the same side');
    }
    const camEv = cyc.events.filter((e) => e.type === 'cam:mode').map((e) => e.p?.style || e.p?.mode);
    const styleChanges = (cyc.extra || []).filter((c) => c.ang > 25 || Math.abs(c.dRatio - 1) > 0.4 || c.style).length;
    if (!(new Set(camEv).size >= 2 || styleChanges >= 2)) fails.push(`C did not visibly cycle styles (cam:mode ${JSON.stringify(camEv)}, offset changes ${JSON.stringify(cyc.extra)})`);
    if (cyc.phase !== 'ending' && cyc.phase !== 'card') warns.push(`C-cycle flight ended in phase ${cyc.phase}`);
    return { status: verdict(fails, warns), partial: h.quick,
      details: `baseline ${b1.type}@${b1.seatId}; determinism Δ ${det?.toFixed(3)} m; Space+D Δ ${dR?.toFixed(2)} m (timeScale ${right.extra?.scale?.toFixed?.(2)}, willpower ${right.extra?.active}); Space+A Δ ${dL?.toFixed?.(2) ?? 'n/a'} m; C styles ${JSON.stringify(camEv)}. ${fails.concat(warns).join('; ')}`,
      evidence: [shot], data: { b1, b2, right, left, cyc } };
  },
};
