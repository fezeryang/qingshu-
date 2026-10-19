// Aim-assist + floaty-flight check:  node tools/shot.mjs --script dev/gameplay/assist.js --out dev/gameplay/shots
qs.manual(true);
const ctx = qs.ctx, g = ctx.gameplay;
await qs.start({ seed: 31, playerGender: 'm', skipIntro: true, roundSeconds: 300 });
qs.forceTeacher('writing', 999);
ctx.ai?.students?.setAmbient?.(false);
await qs.advance(0.3);
const rows = [];
let rescued = 0, near = 0;
for (const id of ['r1c1', 'r1c3', 'r2c2', 'r2c4', 'r3c3', 'r0c2', 'r2c0', 'r3c1']) {
  const sol = g.solveLaunch(qs.target(id));
  for (const dp of [-0.03, 0.03]) {
    for (const dyaw of [-0.02, 0.02]) {
      const raw = { yaw: sol.yaw + dyaw, pitch: sol.pitch, power: sol.power + dp };
      const out = g.assistAim(raw);
      const a = g.lastAssist;
      if (a) near++;
      if (a?.applied) rescued++;
      rows.push(`${id} dp${dp} dy${dyaw}: ${a ? `${a.seatId} applied=${a.applied}${a.applied ? ` dYaw ${a.dYawDeg}° dPow ${a.dPower} shift ${a.shift} m` : ''}` : 'no desk within 0.3 m'}`);
    }
  }
}
// real player release (mouse) → assist runs on the release path; flight time measured
ctx.input.simulate({ nx: 0.25, ny: 0.5 });
await qs.advance(1);
ctx.input.simulate({ down: 'Mouse0' });
await qs.advance(0.7);
await shot('assist-charge-dots');
ctx.input.simulate({ up: 'Mouse0' });
await qs.advance(1 / 60);
const t0 = ctx.time.now;
const assistOnRelease = g.lastAssist;
let firstHit = null;
const off = ctx.bus.on('ball:hit', () => { if (firstHit == null) firstHit = ctx.time.now - t0; });
await qs.advanceUntil(() => g.ball.state !== 'flying', 30);
off();
const L = g.ball.landing;
return {
  nearDesk: near, assisted: rescued, rows,
  release: { assist: assistOnRelease, airborneGameSec: firstHit && +firstHit.toFixed(2), landing: `${L.type}/${L.seatId}`, near: `${L.nearSeatId} ${L.nearSeatDist} m`, hits: L.hits.map((h) => `${h.tag}:${h.ownerId ?? ''}`) },
  errors: qs.errors.slice(0, 5),
};
