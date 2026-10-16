// Live engine check (run unmuted: node tools/shot.mjs --script dev/audio/live.js --out dev/audio/shots --query "lowfx=1")
// Unlocks the real AudioContext, plays through title → aim → charge → throw → ending while metering the
// master output, then checks speak() timing and that master volume 0 is digital silence.
qs.manual(true);
const A = qs.ctx.audio;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { phases: [] };
const before = { music: A.debug.music, recent: A.debug.recent.length, state: A.debug.state };
async function realtime(sec) {
  let pk = -120, rms = -120;
  for (let i = 0; i < Math.round(sec / 0.05); i++) {
    await qs.advance(0.05); await sleep(50);
    const m = A.debug.meter(); if (m) { pk = Math.max(pk, m.peakDb); rms = Math.max(rms, m.rmsDb); }
  }
  return { pk, rms };
}
A.unlock();
out.before = before;
out.title = { music: A.debug.music, state: A.debug.state, ...(await realtime(2)), sfxReady: A.debug.sfxReady };
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
out.aim = { music: A.debug.music, ...(await realtime(2)), loops: A.debug.loops };
qs.forceTeacher('warning', 0.8);
out.warning = { ...(await realtime(1.2)), tension: A.debug.tension };
qs.forceTeacher('writing', 30);
qs.ctx.input.simulate({ down: 'Mouse0' });
out.charge = { ...(await realtime(1.0)), loops: A.debug.loops, tension: A.debug.tension };
qs.ctx.input.simulate({ up: 'Mouse0' });
await realtime(0.6);
out.flight = { music: A.debug.music, phase: qs.state().phase, voices: A.debug.voices };
const id = await qs.runToEnding(90);
await realtime(1);
out.ending = { id, music: A.debug.music, ...(await realtime(1)) };
await shot('live-ending');
// speak timing (UI clock)
const t0 = qs.ctx.time.uiNow;
let done = false;
A.speak('其实……我注意你很久了。放学后能一起走吗？').then(() => { done = true; });
await qs.advanceUntil(() => done, 30);
out.speak = { resolved: done, uiSeconds: +(qs.ctx.time.uiNow - t0).toFixed(2), blips: A.debug.blips };
// mute
A.applySettings({ masterVolume: 0, musicVolume: 0.7, sfxVolume: 0.9 });
await realtime(0.6);
out.muted = await realtime(0.6);
A.applySettings({ masterVolume: 0.8, musicVolume: 0.7, sfxVolume: 0.9 });
out.recent = A.debug.recent.map((r) => `${r.t}:${r.kind}:${r.name}${r.auto ? '*' : ''}`).join(' ');
out.errors = qs.errors;
return out;
