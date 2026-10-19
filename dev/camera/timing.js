// Playtest-1: real (UI) time per flight incl. slow motion, game flight time, F1 — chase style.
qs.manual(true);
const cam = qs.ctx.cam, rows = [];
const targets = ['crush', 'r0c2', 'r0c5', 'r1c3', 'r2c4', 'r3c1', 'r3c5', 'trash', 'window', 'podium', 'floor', 'self'];
let seed = 300;
for (const t of targets) {
  await qs.start({ seed: seed++, playerGender: 'm', skipIntro: true });
  qs.forceTeacher('writing', 60);
  cam.setFollowStyle('chase');
  let land = null; const off = qs.ctx.bus.on('ball:landed', (L) => { land = { ui: qs.ctx.time.uiNow, type: L.type, ft: L.flightTime }; });
  const u0 = qs.ctx.time.uiNow;
  try { await qs.throwAt(t); } catch (e) { rows.push({ t, err: String(e.message || e).slice(0, 60) }); off(); continue; }
  await qs.advanceUntil(() => land, 20);
  off();
  const m = cam.metrics.last;
  rows.push({ t, landing: land?.type, flight: +(land?.ft ?? 0).toFixed(2), real: land ? +(land.ui - u0).toFixed(2) : null, ratio: m?.ratio, occl: m?.occluded, minDist: m?.minDist });
  await qs.advance(1.5);
}
const ok = rows.filter((r) => r.real);
return { maxReal: Math.max(...ok.map((r) => r.real)), avgReal: +(ok.reduce((a, r) => a + r.real, 0) / ok.length).toFixed(2), avgFlight: +(ok.reduce((a, r) => a + r.flight, 0) / ok.length).toFixed(2), minRatio: Math.min(...ok.map((r) => r.ratio)), occl: ok.reduce((a, r) => a + r.occl, 0), rows: rows.map((r) => JSON.stringify(r)), errors: qs.errors.slice(0, 3) };
