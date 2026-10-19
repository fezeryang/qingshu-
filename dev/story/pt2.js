// Ending verification + key-frame screenshots (generated from dev/story/_template.js by gen.sh).
// For each case: start a deterministic round, trigger the ending (real throw, or an injected landing),
// check resolve() picked the expected id, screenshot the 'climax' beat (+ optional extra beat / final frame),
// and record game-time duration, recipient/delivery and errors.
qs.manual(true);
const V = (x, y, z) => new qs.ctx.THREE.Vector3(x, y, z);
const CASES = [
 {expect:'wrong_caught', target:'lin_xiaoyu', shotFinal: false},
 {expect:'caught_read', mode:'caught', shotFinal: false},
 {expect:'chalk_counter', target:'teacher', shotFinal: false},
 {expect:'graded', target:'podium', shotFinal: false},
 {expect:'three_pointer', target:'trash', shotFinal: false},
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
      if (!c.forceSynthetic) r.sol = await qs.throwAt(tgt, { budgetMs: 600, ...(c.opts || {}) }).then((s) => s && { pitch: +(s.pitch * 57.3).toFixed(1), power: +s.power.toFixed(3) }).catch((e) => String(e.message || e));
      if (c.forceSynthetic || (typeof r.sol === 'string' && c.synthetic)) {
        // inject the landing directly (tests the cutscene and resolve(), not the solver)
        const syn = { ...c.synthetic };
        if (syn.nearOf) {
          const seat = qs.ctx.layout.SEAT_BY_ID[qs.ctx.cast.seatOf(syn.nearOf)];
          syn.pos = V(seat.x + 0.1, 0.04, seat.chairZ + 0.4); delete syn.nearOf;
        }
        if (syn.bonk) { syn.hits = [{ tag: 'head', ownerId: syn.bonk === 'crush' ? qs.ctx.round.crushId : syn.bonk, t: 0.6, speed: 3 }]; delete syn.bonk; }
        if (!syn.pos) syn.pos = V(1.4, 0.04, -4.3);
        qs.ctx.bus.emit('ball:launched', { pos: V(-3, 1, 2), vel: V(0, 1, -1), power: 0.5 });
        await qs.advance(0.1);
        qs.ctx.bus.emit('ball:landed', { hits: [], flightTime: 1, bounces: 0, nearMisses: [], seatId: null, ownerId: null, ...syn });
        r.synthetic = true;
      }
      if (c.seen) await qs.advanceUntil(() => { qs.ctx.round.teacherSawBall = true; return qs.ctx.flow.phase !== 'flight'; }, 15);
    }
    await qs.advanceUntil(() => qs.ctx.flow.phase === 'ending' || qs.ctx.flow.phase === 'card', 60);
    r.got = qs.ctx.round.endingId;
    r.landing = qs.state().landing;
    r.recipient = [qs.ctx.round.recipientId, qs.ctx.round.delivery];
    if (c.extraBeat) {
      await qs.advanceUntil(() => qs.ctx.story.debug.beat === c.extraBeat || qs.ctx.flow.phase === 'card', 50);
      await qs.advance(c.extraDelay ?? 2.2);
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
    r.cuts = qs.ctx.story.debug.cuts?.[r.got];
    r.ok = got === c.expect;
  } catch (e) { r.err = String(e.stack || e); }
  qs.ctx.ai?.students?.setAmbient?.(true);
  r.errors = qs.errors.slice(errBefore);
  out.push(r);
}
return out;
