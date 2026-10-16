// Title-screen music check (unmuted): unlock, then meter the first seconds of the title track.
qs.manual(true);
const A = qs.ctx.audio;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
A.unlock();
const log = [];
for (let i = 0; i < 40; i++) {
  await qs.advance(0.05); await sleep(50);
  if (i % 5 === 4) log.push({ m: A.debug.meter(), p: A.debug.player, v: A.debug.voices, ready: A.debug.sfxReady });
}
A.applySettings({ masterVolume: 0, musicVolume: 0.7, sfxVolume: 0.9 });
for (let i = 0; i < 12; i++) { await qs.advance(0.05); await sleep(50); }
log.push({ muted: A.debug.meter() });
return { log, errors: qs.errors };
