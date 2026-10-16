// Story hand-off check: bell event (intro + coward) and speak() in caught_read, headless muted.
qs.manual(true);
const A = qs.ctx.audio;
const pick = () => A.debug.recent.filter((r) => /bell|speak|music/.test(r.kind + r.name)).map((r) => `${r.kind}:${r.name}${r.auto ? '*' : ''}`);
await qs.start({ seed: 11, playerGender: 'm', skipIntro: false, roundSeconds: 2 });
const intro = pick();
const coward = await qs.runToEnding(90);
const afterCoward = pick();
await qs.start({ seed: 12, playerGender: 'f', skipIntro: true });
qs.forceTeacher('watching', 30); qs.setSuspicion(0.99); qs.ctx.gameplay.aim.charging = true;
const t0 = qs.ctx.time.now;
const caught = await qs.runToEnding(90);
return { intro, coward, afterCoward, caught, caughtSeconds: +(qs.ctx.time.now - t0).toFixed(1), tail: pick().slice(-6), errors: qs.errors };
