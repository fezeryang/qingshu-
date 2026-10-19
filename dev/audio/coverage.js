// Voice clip coverage + real-speech ending durations (headless, muted: lines with a clip wait their real
// duration). Part 1: "random playthroughs" — unseen seeds, both genders, real physics throws at random
// targets with the teacher AI running. Part 2: perfect / same_gender durations (synthetic landings).
qs.manual(true);
const ctx = qs.ctx, A = ctx.audio, V3 = ctx.THREE.Vector3, L = ctx.layout;
const out = { plays: [], long: [] };
const c0 = { ...A.debug.speech.clips };
const targets = ['crush', 'crush', 'trash', 'window', 'podium', 'floor', 'self', 'student', 'student', 'student'];
for (let i = 0; i < 10; i++) {
  const seed = 300 + i, g = i % 2 ? 'f' : 'm';
  await qs.start({ seed, playerGender: g, skipIntro: i % 3 !== 0 });
  qs.forceTeacher('writing', 3);
  let t = targets[i % targets.length];
  if (t === 'student') { const s = ctx.cast.students().filter((c) => ctx.cast.seatOf(c.id)); t = s[(seed * 7) % s.length].id; }
  const before = { ...A.debug.speech.clips };
  try { await qs.throwAt(t, { budgetMs: 600 }); } catch { /* no solution → coward via timeout */ }
  await qs.advanceUntil(() => ctx.flow.phase === 'card', 150, 1 / 15);
  const a = A.debug.speech.clips;
  out.plays.push({ seed, g, target: t, ending: ctx.round.endingId, covered: a.covered - before.covered, uncovered: a.uncovered - before.uncovered });
}
const c1 = A.debug.speech.clips;
out.coverage = { covered: c1.covered - c0.covered, uncovered: c1.uncovered - c0.uncovered };
out.coverage.fraction = +(out.coverage.covered / Math.max(1, out.coverage.covered + out.coverage.uncovered)).toFixed(3);
for (const [seed, g] of [[11, 'm'], [12, 'f'], [21, 'm'], [22, 'f']]) {
  for (const kind of ['perfect', 'same_gender']) {
    await qs.start({ seed, playerGender: g, skipIntro: true });
    qs.forceTeacher('writing', 999);
    const R = ctx.round;
    const who = kind === 'perfect' ? R.crushId : ctx.cast.students().find((c) => c.spec.gender === g && c.id !== R.crushId && c.spec.trait !== 'gossip' && ctx.cast.seatOf(c.id))?.id;
    const s = L.SEAT_BY_ID[ctx.cast.seatOf(who)];
    await qs.advance(0.3);
    ctx.bus.emit('ball:launched', { pos: new V3(-3, 1.1, 2.2), vel: new V3(0, 2, -3), power: 0.5 });
    await qs.advance(0.1);
    ctx.bus.emit('ball:landed', { type: 'desk', seatId: s.id, ownerId: who, pos: new V3(s.x, L.DESK.topY + 0.04, s.deskZ), hits: [], flightTime: 1.6, bounces: 1, nearMisses: [] });
    await qs.advanceUntil(() => ctx.flow.phase === 'card', 90, 1 / 15);
    const d = ctx.story.debug?.durations?.[ctx.round.endingId];
    out.long.push({ seed, g, ending: ctx.round.endingId, game: d?.game != null ? +d.game.toFixed(1) : null, result: d?.result });
  }
}
out.errors = qs.errors;
return out;
