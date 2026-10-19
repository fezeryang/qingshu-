// Pre-rendered voice clip check (run unmuted: --query "lowfx=1"): manifest lookup → decode → voice bus,
// music ducking, promise.cancel() and stopVoice().
qs.manual(true);
const A = qs.ctx.audio;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
A.unlock();
for (let i = 0; i < 20; i++) { await qs.advance(0.05); await sleep(50); }
const out = { manifestLines: A.debug.speech.clips.manifestLines };
async function play(text, voice, o, cancelAfter) {
  let done = false; const t0 = performance.now(); let pk = -120;
  const p = A.voiceLine(text, voice, o); p.then(() => (done = true));
  for (let i = 0; i < 200 && !done; i++) {
    await qs.advance(0.05); await sleep(50);
    const m = A.debug.meter(); if (m) pk = Math.max(pk, m.peakDb);
    if (cancelAfter && performance.now() - t0 > cancelAfter * 1000) { p.cancel(); }
  }
  await qs.advance(0.05);
  return { text, done, realS: +((performance.now() - t0) / 1000).toFixed(2), peakDb: pk, duckLevel: +A.debug.gain.master.toFixed(2), mode: A.debug.recent.filter((r) => r.kind === 'voice').slice(-1)[0]?.mode };
}
A.music(null, { fade: 0.1 });
out.teacher = await play('上课时间，空中飞行物？', { pitch: 0.6 }, { charId: 'teacher' });
out.principalRead = await (async () => { let done = false; const t0 = performance.now(); const p = A.speak('你知道我的缺点是什么吗？\n是缺点你。\n你知道我想喝什么吗？\n呵护你。', { charId: 'npc_principal' }); p.then(() => (done = true)); for (let i = 0; i < 300 && !done; i++) { await qs.advance(0.05); await sleep(50); } return { done, realS: +((performance.now() - t0) / 1000).toFixed(2) }; })();
out.cancelled = await play('其实，我早就发现你上课一直在看我了。', { pitch: 1.2 }, { charId: 'xia_mo' }, 0.6);
let sv = false; A.voiceLine('上来。大声念出来。', null, { charId: 'teacher' }).then(() => (sv = true));
await qs.advance(0.2); A.stopVoice(); await qs.advance(0.05); out.stopVoice = sv;
out.miss = await play('这句话不在清单里。', { pitch: 1 }, { charId: 'teacher' });
out.clips = A.debug.speech.clips;
out.errors = qs.errors;
return out;
