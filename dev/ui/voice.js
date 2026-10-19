// Playtest-1 check: voiced say() (waits for voiceLine, click cancels it) + 语音 setting.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = qs.ctx.audio, T = qs.ctx.time;
const out = { realVoiceLine: typeof A.voiceLine === 'function', voiceQuality: A.voiceQuality };
qs.manual(true);
await qs.advance(0.2);
// settings panel (force the browser note if audio reports no natural voice / isn't there yet)
if (A.voiceQuality == null) { try { A.voiceQuality = 'none'; } catch { /* getter */ } }
[...document.querySelectorAll('#ui-root button')].find((b) => b.textContent === '设置').click();
await document.fonts.load('30px "QS KuaiLe"', '语音真人朗读哔哔声关闭推荐使用浏览器以获得最自然的'); await document.fonts.load('30px "QS Hand"', '推荐使用 Edge 浏览器以获得最自然的语音'); await sleep(500);
await shot('40-settings-voice');
const blipsBtn = [...document.querySelectorAll('#ui-root button')].find((b) => b.textContent === '哔哔声');
blipsBtn.click();
out.voiceModeAfterClick = qs.ctx.settings.voiceMode;
out.stored = JSON.parse(localStorage.getItem('qingshu.settings')).voiceMode;
[...document.querySelectorAll('#ui-root button')].find((b) => b.textContent === '真人朗读').click();
qs.ctx.ui.closeAll();
// fake voiceLine with a known 3 s length (always, so timing is deterministic)
const orig = A.voiceLine;
let calls = 0, cancelled = 0;
A.voiceLine = (text, voice, o) => { calls++; let done; const p = new Promise((r) => { done = r; }); T.waitUI(3).then(done); p.cancel = () => { cancelled++; done(); }; return p; };
let blips = 0; const ob = A.blip; A.blip = (...a) => { blips++; return ob?.(...a); };
let ok = false; qs.ctx.ui.say('王老师', '上课。', { charId: 'teacher' }).then(() => { ok = true; });
const t0 = T.uiNow; await qs.advanceUntil(() => ok, 10);
out.shortLineWaitsForVoice = +(T.uiNow - t0).toFixed(2);   // expect ≈ 3 (voice) rather than ≈ 1.1 (text)
ok = false; qs.ctx.ui.say('林晓雨', '其实……我一直都知道是你写的。', {}).then(() => { ok = true; });
await qs.advance(0.3);
qs.ctx.input.simulate({ down: 'Space' }); await qs.advance(1 / 60); qs.ctx.input.simulate({ up: 'Space' }); await qs.advance(1 / 60);
out.afterSkip = { typed: qs.ctx.ui.state.say?.typed, cancelled };
qs.ctx.input.simulate({ down: 'Space' }); await qs.advance(1 / 60); qs.ctx.input.simulate({ up: 'Space' }); await qs.advance(1 / 60);
out.secondClickAdvances = ok;
out.calls = calls; out.blipsWhileVoiced = blips;
A.voiceLine = orig; A.blip = ob;
out.errors = qs.errors;
return out;
