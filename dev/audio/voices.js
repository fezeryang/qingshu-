// Voice ranking / casting / voiceLine check (headless). Simulates the zh voice lists of common
// browsers, prints the casting table per browser, then checks voiceLine timing + cue log.
qs.manual(true);
const A = qs.ctx.audio;
const V = (name, lang, local = true) => ({ name, lang, localService: local });
const MS = (n, lang = 'zh-CN', desc = 'Chinese (Mainland)') => V(`Microsoft ${n} Online (Natural) - ${desc}`, lang, false);
const lists = {
  edgeWindows: [V('Microsoft Huihui - Chinese (Simplified, PRC)', 'zh-CN'), V('Microsoft Kangkang - Chinese (Simplified, PRC)', 'zh-CN'), V('Microsoft Yaoyao - Chinese (Simplified, PRC)', 'zh-CN'),
    MS('Xiaoxiao'), MS('Xiaoyi'), MS('Yunjian'), MS('Yunxi'), MS('Yunxia'), MS('Yunyang'), MS('Xiaobei', 'zh-CN-liaoning', 'Chinese (Northeastern Mandarin)'), MS('Xiaoni', 'zh-CN-shaanxi', 'Chinese (Zhongyuan Mandarin Shaanxi)'),
    MS('HiuGaai', 'zh-HK', 'Chinese (Cantonese Traditional)'), MS('HiuMaan', 'zh-HK'), MS('WanLung', 'zh-HK'), MS('HsiaoChen', 'zh-TW', 'Chinese (Taiwanese Mandarin)'), MS('HsiaoYu', 'zh-TW'), MS('YunJhe', 'zh-TW')],
  chromeWindows: [V('Microsoft Huihui - Chinese (Simplified, PRC)', 'zh-CN'), V('Microsoft Kangkang - Chinese (Simplified, PRC)', 'zh-CN'), V('Microsoft Yaoyao - Chinese (Simplified, PRC)', 'zh-CN'),
    V('Google 普通话（中国大陆）', 'zh-CN', false), V('Google 粤語（香港）', 'zh-HK', false), V('Google 國語（臺灣）', 'zh-TW', false)],
  safariMac: [V('Tingting', 'zh-CN'), V('Sinji', 'zh-HK'), V('Meijia', 'zh-TW'), V('Li-Mu', 'zh-CN')],
  linuxEspeak: [V('Chinese (Mandarin) eSpeak', 'cmn')],
  none: [],
};
const out = {};
for (const [k, l] of Object.entries(lists)) {
  A.dev.setVoicesForTest(l);
  out[k] = { quality: A.voiceQuality, hint: A.voiceHint, cast: A.debug.castTable() };
}
A.dev.setVoicesForTest(window.speechSynthesis ? speechSynthesis.getVoices() : []);
out.realHeadless = { quality: A.voiceQuality, voices: A.debug.voiceList().length };
// voiceLine timing (headless: no voices → silent soft-blip schedule)
await qs.start({ seed: 4, playerGender: 'm', skipIntro: true });
const lines = ['喂！', '王老师说今天要小测验，你复习了吗？', '……我愿意。'];
out.lines = [];
for (const t of lines) { const t0 = qs.ctx.time.uiNow; let done = false; A.voiceLine(t, { pitch: 1.2 }, { charId: qs.ctx.round.crushId }).then(() => (done = true)); await qs.advanceUntil(() => done, 20); out.lines.push({ t, s: +(qs.ctx.time.uiNow - t0).toFixed(2) }); }
// cancel: a new line resolves the previous one immediately
let first = false; A.voiceLine('这是一句很长很长很长很长很长很长的话。', null, {}).then(() => (first = true));
let second = false; A.voiceLine('打断！', null, {}).then(() => (second = true));
await qs.advance(0.05); out.cancelFirst = first;
await qs.advanceUntil(() => second, 10); out.second = second;
// modes
qs.ctx.settings.voiceMode = 'off'; let off = false; A.voiceLine('静音模式', null, {}).then(() => (off = true)); await qs.advance(0.05); out.offResolvedImmediately = off;
qs.ctx.settings.voiceMode = 'speech';
const t0 = qs.ctx.time.uiNow; let rd = false; A.speak('今天的夕阳很好看，和你一样。放学后能一起走吗？').then(() => (rd = true)); await qs.advanceUntil(() => rd, 30);
out.readAloud = +(qs.ctx.time.uiNow - t0).toFixed(2);
out.recent = A.debug.recent.filter((r) => r.kind === 'voice' || r.kind === 'speak').map((r) => `${r.kind}:${r.mode}:${r.name}`);
out.errors = qs.errors;
return out;
