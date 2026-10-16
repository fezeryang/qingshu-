// Sweep every non-player seat: throwAt(seat) → landing seat must match.
qs.manual(true);
const seats = qs.ctx.layout.SEATS.filter((s) => !s.isPlayer).map((s) => s.id);
const bad = {}; let ok = 0;
for (const id of seats) {
  await qs.start({ seed: 21, playerGender: 'm', skipIntro: true });
  qs.forceTeacher('writing', 60);
  try {
    await qs.throwAt(id);
    await qs.advanceUntil(() => qs.ctx.round.landing, 12);
    const L = qs.ctx.round.landing;
    if (L?.seatId === id && (L.type === 'desk' || L.type === 'chair')) ok++; else bad[id] = [L?.type, L?.seatId, (L?.hits || []).map((h) => h.tag + ':' + (h.ownerId || '')).join(',')];
  } catch (e) { bad[id] = 'ERR ' + e.message; }
}
return { ok, total: seats.length, bad, errors: qs.errors.slice(0, 5) };
