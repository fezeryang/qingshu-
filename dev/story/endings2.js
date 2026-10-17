// Ending verification + key-frame screenshots (generated from dev/story/_template.js by gen.sh).
// For each case: start a deterministic round, trigger the ending, check resolve() picked the expected id,
// screenshot the 'climax' beat and the final frame, and record game-time duration + errors.
qs.manual(true);
const V = (x, y, z) => new qs.ctx.THREE.Vector3(x, y, z);
const CASES = [
 {expect:'chalk_counter', target:'teacher'},
 {expect:'graded', target:'podium'},
 {expect:'three_pointer', target:'trash'},
 {expect:'out_window', target:'window'},
];
const out = [];
for (const c of CASES) {
  const errBefore = qs.errors.length;
  await qs.start({ seed: c.seed ?? 11, playerGender: c.g ?? 'm', crushId: c.crush ?? 'su_nian', letter: c.letter ?? '已知：我每天看你 n 次，且 n→∞。\n求证：我喜欢你。\n证明：显然。', skipIntro: true, roundSeconds: c.roundSeconds });
  const r = { id: c.expect };
  try {
    if (c.mode === 'caught') { qs.forceTeacher('watching', 30); qs.setSuspicion(0.99); qs.ctx.gameplay.aim.charging = true; }
    else if (c.mode === 'timeout') { /* wait for the bell */ }
    else {
      qs.forceTeacher(c.teacher ?? 'writing', 999);
      qs.ctx.ai?.students?.setAmbient?.(false); // no fidget/catch accidents: deterministic landing (sticky; reset below)
      if (c.seen) qs.ctx.round.teacherSawBall = true;
      const tgt = c.target === 'teacher' ? (() => { const p = new qs.ctx.THREE.Vector3(); qs.ctx.cast.teacher.headWorld(p); return { x: p.x, y: p.y, z: p.z }; })() : c.target;
      r.sol = await qs.throwAt(tgt, { budgetMs: 600, ...(c.opts || {}) }).then((s) => s && { pitch: +(s.pitch * 57.3).toFixed(1), power: +s.power.toFixed(3) }).catch((e) => String(e.message || e));
      if (typeof r.sol === 'string' && c.synthetic) {
        // physics could not reach the target: inject the landing directly (tests the cutscene, not the solver)
        const bus = qs.ctx.bus;
        bus.emit('ball:launched', { pos: V(-3, 1, 2), vel: V(0, 1, -1), power: 0.5 });
        await qs.advance(0.1);
        bus.emit('ball:landed', { pos: V(0, 0, 0), hits: [], flightTime: 1, bounces: 0, nearMisses: [], ...c.synthetic });
        r.synthetic = true;
      }
      if (c.seen) await qs.advanceUntil(() => { qs.ctx.round.teacherSawBall = true; return qs.ctx.flow.phase !== 'flight'; }, 15);
    }
    await qs.advanceUntil(() => qs.ctx.flow.phase === 'ending' || qs.ctx.flow.phase === 'card', 60);
    r.got = qs.ctx.round.endingId;
    r.landing = qs.state().landing;
    const t0 = qs.ctx.time.now;
    if (c.extraBeat) {
      await qs.advanceUntil(() => qs.ctx.story.debug.beat === c.extraBeat || qs.ctx.flow.phase === 'card', 50);
      await qs.advance(0.5);
      if (qs.ctx.flow.phase !== 'card') await shot(`${c.expect}_${c.extraBeat}`);
    }
    await qs.advanceUntil(() => qs.ctx.story.debug.beat === 'climax' || qs.ctx.flow.phase === 'card', 50);
    await qs.advance(c.climaxDelay ?? 0.6);
    if (qs.ctx.flow.phase !== 'card') await shot(`${c.expect}_climax`);
    await qs.advanceUntil(() => qs.ctx.story.debug.beat === 'final' || qs.ctx.flow.phase === 'card', 50);
    await qs.advance(c.finalDelay ?? 1.0);
    if (c.shotFinal !== false && qs.ctx.flow.phase !== 'card') await shot(`${c.expect}_final`);
    const got = await qs.runToEnding(60);
    r.dur = qs.ctx.story.debug.durations[r.got];
    r.beats = qs.ctx.story.debug.beats.map((b) => `${b.name}@${b.t}`).join(' ');
    r.ok = got === c.expect;
  } catch (e) { r.err = String(e.stack || e); }
  qs.ctx.ai?.students?.setAmbient?.(true);
  r.errors = qs.errors.slice(errBefore);
  out.push(r);
}
return out;
