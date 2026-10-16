// F1 metric: fraction of follow-cam flight ticks with the ball inside the central 70 % (|ndc| <= 0.7),
// plus collider occlusion count, over many targets and all three follow styles. No screenshots.
qs.manual(true);
const targets = ['crush', 'r0c2', 'r0c5', 'r1c3', 'r2c0', 'r2c4', 'r3c1', 'r3c5', 'r4c3', 'trash', 'window', 'podium', 'fan', 'floor', 'self', 'teacher'];
const styles = ['chase', 'side', 'fpStay'];
const rows = [];
let seed = 100;
for (const style of styles) {
  for (const t of targets) {
    await qs.start({ seed: seed++, playerGender: seed % 2 ? 'm' : 'f', skipIntro: true });
    qs.forceTeacher('writing', 60);
    qs.ctx.cam.setFollowStyle(style);
    try { await qs.throwAt(t); } catch (e) { rows.push({ style, t, err: String(e.message || e) }); continue; }
    const ok = await qs.advanceUntil(() => qs.ctx.flow.phase !== 'flight' && qs.ctx.flow.phase !== 'aim', 30);
    const m = qs.ctx.cam.metrics.last;
    rows.push({ style, t, ok, frames: m?.frames, ratio: m?.ratio, maxAbs: m?.maxAbs, occl: m?.occluded, minDist: m?.minDist, avgDist: m?.avgDist, landing: m?.landing, ts: qs.ctx.engine.timeScale });
    await qs.advance(2);
    rows[rows.length - 1].tsAfter = +qs.ctx.engine.timeScale.toFixed(3);
  }
}
const agg = {};
for (const s of styles) {
  const r = rows.filter((x) => x.style === s && x.frames);
  const fr = r.reduce((a, x) => a + x.frames, 0), ins = r.reduce((a, x) => a + Math.round(x.frames * x.ratio), 0), occ = r.reduce((a, x) => a + x.occl, 0);
  agg[s] = { minDist: Math.min(...r.map((x) => x.minDist)), avgDist: +(r.reduce((a, x) => a + x.avgDist, 0) / r.length).toFixed(3), slowMoBackTo1: r.every((x) => x.tsAfter === 1), throws: r.length, frames: fr, insideRatio: +(ins / fr).toFixed(4), minThrowRatio: Math.min(...r.map((x) => x.ratio)), occludedFrames: occ, occludedRatio: +(occ / fr).toFixed(4) };
}
return { agg, rows: rows.map((r) => JSON.stringify(r)), errors: qs.errors.slice(0, 5) };
