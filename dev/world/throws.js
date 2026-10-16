// Collider validation: throw at key targets and record the landing classification.
qs.manual(true);
const targets = window.__targets || ['trash', 'window', 'r2c3', 'podium', 'r0c0', 'r0c5', 'r3c2', 'self', 'r4c5', 'r1c1'];
const out = {};
for (const t of targets) {
  await qs.start({ seed: 11, playerGender: 'm', skipIntro: true });
  qs.forceTeacher('writing', 60);
  try {
    await qs.throwAt(t);
    await qs.advanceUntil(() => qs.ctx.round.landing, 12);
    const L = qs.ctx.round.landing;
    out[t] = { type: L?.type, seat: L?.seatId, pos: L?.pos?.toArray?.().map((v) => +v.toFixed(2)), hits: (L?.hits || []).map((h) => h.tag + (h.ownerId ? ':' + h.ownerId : '')).join(',') };
  } catch (e) { out[t] = 'ERR ' + e.message; }
  if (t === 'trash') { await qs.advance(0.05); await shot('throw-trash'); }
}
return { out, errors: qs.errors.slice(0, 5) };
