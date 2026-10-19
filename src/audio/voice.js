// Voices: dialogue lines (voiceLine), letter read-aloud (speak) and fallback blips.
//
// Real Chinese speech via speechSynthesis whenever a zh voice exists and settings.voiceMode is
// 'speech' (default). Voices are ranked by realism (neural/Natural/Online → Google 普通话 → legacy),
// and every character is *cast* a voice by role (teacher, principal, parents, boys, girls,
// narrator) — distinct voices when several exist, small (±8 %) pitch/rate offsets on top.
// Lines are spoken one sentence at a time; a new line cancels the previous one. Everything is driven
// by the UI clock in update(uiDt) and always resolves within a bounded time (headless-safe).
import { clamp, hashStr } from './dsp.js';

const PUNCT = /[\s，。！？、…—“”‘’,.!?;:：；（）()《》\-~·「」『』～]/;
const LONG = /[。！？!?…\n]/;
const SHORT = /[，、,;；:：—]/;
export const VOICE_HINT = '推荐使用 Edge 浏览器以获得最自然的语音';
/** intro ritual lines (src/story/intro.js); the chorus is rendered by several classmate voices */
export const RITUAL_CHORUS = '老——师——好——';
const RITUAL_TEXTS = new Set(['上课！', '起立！', RITUAL_CHORUS, '同学们好，坐。']);

// ------------------------------------------------------------------ voice knowledge
// Known zh voice names → gender + age class. Names are matched case-insensitively as substrings.
const KNOWN = [
  // Microsoft neural (Edge "Online (Natural)") zh-CN
  ['xiaoxiao', 'f', 'adult'], ['xiaoyi', 'f', 'young'], ['xiaohan', 'f', 'adult'], ['xiaomeng', 'f', 'young'], ['xiaochen', 'f', 'young'],
  ['xiaomo', 'f', 'adult'], ['xiaoqiu', 'f', 'mature'], ['xiaorui', 'f', 'elder'], ['xiaoshuang', 'f', 'child'], ['xiaoxuan', 'f', 'adult'],
  ['xiaoyan', 'f', 'adult'], ['xiaoyou', 'f', 'child'], ['xiaozhen', 'f', 'adult'],
  ['yunxi', 'm', 'young'], ['yunxia', 'm', 'child'], ['yunhao', 'm', 'young'], ['yunjian', 'm', 'mature'], ['yunyang', 'm', 'mature'],
  ['yunfeng', 'm', 'mature'], ['yunye', 'm', 'mature'], ['yunze', 'm', 'elder'],
  // zh-TW / zh-HK neural
  ['hsiaochen', 'f', 'young'], ['hsiaoyu', 'f', 'young'], ['yunjhe', 'm', 'young'], ['hiugaai', 'f', 'adult'], ['hiumaan', 'f', 'adult'], ['wanlung', 'm', 'mature'],
  // legacy / OS voices
  ['huihui', 'f', 'adult'], ['yaoyao', 'f', 'young'], ['kangkang', 'm', 'mature'], ['tingting', 'f', 'adult'], ['ting-ting', 'f', 'adult'],
  ['meijia', 'f', 'adult'], ['mei-jia', 'f', 'adult'], ['sinji', 'f', 'adult'], ['sin-ji', 'f', 'adult'], ['lili', 'f', 'adult'], ['hanhan', 'f', 'adult'],
  ['zhiwei', 'm', 'mature'], ['danny', 'm', 'mature'], ['li-mu', 'm', 'mature'], ['limu', 'm', 'mature'],
  ['google', 'f', 'adult'], // Google 普通话 / 國語 / 粵語 are female
];
const DIALECT = /liaoning|shaanxi|sichuan|henan|shandong|xiaobei|xiaoni|wuu/i;

/** Casting: role → wanted gender, preferred voice names (best first), wanted ages. */
const ROLES = {
  teacher: { g: 'm', prefer: ['yunyang', 'yunze', 'yunjian', 'yunfeng', 'yunye', 'kangkang', 'zhiwei'], ages: ['mature', 'elder'] },
  principal: { g: 'm', prefer: ['yunze', 'yunye', 'yunjian', 'yunyang', 'kangkang'], ages: ['elder', 'mature'] },
  coach: { g: 'm', prefer: ['yunjian', 'yunfeng', 'yunyang', 'yunye', 'kangkang'], ages: ['mature'] },
  dad: { g: 'm', prefer: ['yunye', 'yunjian', 'yunfeng', 'yunyang', 'kangkang'], ages: ['mature'] },
  adultM: { g: 'm', prefer: ['yunfeng', 'yunye', 'yunjian', 'yunyang'], ages: ['mature'] },
  mom: { g: 'f', prefer: ['xiaoqiu', 'xiaomo', 'xiaoxiao', 'xiaohan', 'xiaoyan', 'huihui'], ages: ['mature', 'adult'] },
  elderF: { g: 'f', prefer: ['xiaorui', 'xiaoqiu', 'xiaomo', 'xiaoxiao', 'huihui'], ages: ['elder', 'mature'] },
  adultF: { g: 'f', prefer: ['xiaohan', 'xiaoxiao', 'xiaomo', 'huihui'], ages: ['adult'] },
  boy: { g: 'm', prefer: ['yunxi', 'yunhao', 'yunxia', 'yunjhe', 'yunjian', 'kangkang'], ages: ['young', 'child'], spread: true },
  girl: { g: 'f', prefer: ['xiaoyi', 'xiaoxiao', 'xiaomeng', 'xiaochen', 'xiaohan', 'xiaoshuang', 'hsiaoyu', 'hsiaochen', 'yaoyao', 'huihui'], ages: ['young', 'adult'], spread: true },
  narrator: { g: null, prefer: ['xiaoxiao', 'yunyang', 'xiaohan', 'yunxi', 'huihui'], ages: ['adult', 'mature'] },
};

function describe(v) {
  const name = String(v.name || ''), lname = name.toLowerCase(), lang = String(v.lang || '').replace('_', '-');
  const k = KNOWN.find(([n]) => lname.includes(n));
  const natural = /natural|neural|online/i.test(name) || (v.localService === false && /microsoft/i.test(name));
  const google = /google/i.test(name);
  const cn = /^zh-CN$/i.test(lang) || /^zh-Hans/i.test(lang) || /^cmn/i.test(lang);
  const tw = /^zh-TW|^zh-Hant/i.test(lang);
  const hk = /^zh-HK|^yue/i.test(lang);
  const dialect = DIALECT.test(name) || /zh-CN-\w+/i.test(lang);
  // realism tier: higher is better
  let tier;
  if (natural && cn && !dialect) tier = 6;
  else if (google && cn) tier = 5;
  else if (natural && tw) tier = 4.5;
  else if (google) tier = 4;
  else if (natural && hk) tier = 3.5;
  else if (natural) tier = 3;            // dialect neural voices
  else if (cn) tier = 2;                 // legacy zh-CN (Huihui, Kangkang, Yaoyao, Ting-Ting…)
  else tier = 1;                         // other legacy zh (eSpeak etc.)
  if (/espeak/i.test(name)) tier = 0.5;
  const kind = tier >= 4.5 && !google ? 'natural' : google ? 'online' : tier >= 3 ? 'natural' : 'legacy';
  return { v, name, key: k?.[0] || lname, gender: k?.[1] || null, age: k?.[2] || 'adult', tier, kind, natural: natural && !google };
}

export function createVoice(M, ctx, rec, hooks = {}) {
  let lastBlip = -1, blipSkip = 1, blipAlt = false;
  const jobs = [];
  let ttsJob = null;
  const stats = { blips: 0, spoken: 0, lines: 0, tts: 0 };
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let pool = [];          // described zh voices, best first
  let castCache = new Map();
  const loadVoices = () => {
    let all = [];
    try { all = synth?.getVoices?.() || []; } catch { all = []; }
    pool = all.filter((v) => /^(zh|cmn|yue)/i.test(String(v.lang || '')) || /chinese|普通话|國語|粤語|粵語|中文/i.test(v.name || '')).map(describe).sort((a, b) => b.tier - a.tier);
    castCache = new Map();
  };
  if (synth) { loadVoices(); try { synth.addEventListener?.('voiceschanged', loadVoices); } catch { /* old API */ } if (synth.onvoiceschanged === null) synth.onvoiceschanged = loadVoices; }
  if (synth && !pool.length) { try { synth.getVoices(); } catch { /* ok */ } }

  const quality = () => (manifest && Object.keys(manifest.lines).length ? 'natural' : !pool.length ? 'none' : pool[0].tier >= 6 || pool[0].kind === 'natural' ? 'natural' : pool[0].kind === 'online' ? 'online' : 'legacy');

  // ---------------------------------------------------------------- casting
  function roleOf(charId, voice, o) {
    const id = String(charId || '');
    const spec = id && ctx.cast?.get?.(id)?.spec;
    if (o?.role && ROLES[o.role]) return o.role;
    if (id === 'teacher' || spec?.role === 'teacher') return 'teacher';
    if (/principal/.test(id)) return 'principal';
    if (/(^|_)pe($|_)|coach/.test(id)) return 'coach';
    if (/dad|father/.test(id)) return 'dad';
    if (/mom|mother/.test(id)) return 'mom';
    if (/janitor|auntie/.test(id)) return 'elderF';
    const g = o?.gender || spec?.gender || (voice?.pitch ? (voice.pitch >= 1.12 ? 'f' : 'm') : null);
    if (!id && !voice?.pitch && !o?.gender) return 'narrator';
    if (spec?.role === 'npc' && !/^player_/.test(id)) return g === 'f' ? 'adultF' : 'adultM';
    return g === 'f' ? 'girl' : 'boy';
  }
  /** → {d: described voice, pitch, rate, role} or null when no voice exists */
  function cast(charId, voice, o = {}) {
    if (!pool.length) return null;
    const role = roleOf(charId, voice, o);
    const key = `${charId || ''}|${role}|${voice?.pitch ?? ''}|${voice?.speed ?? ''}`;
    if (castCache.has(key)) return castCache.get(key);
    const R = ROLES[role];
    const best = pool[0].tier;
    // within the chosen gender, realism tier dominates the score (×10), then role preference / age
    const score = (d) => {
      let s = d.tier * 10;
      const pi = R.prefer.indexOf(d.key);
      if (pi >= 0) s += 6 - pi * 0.5;
      if (R.ages.includes(d.age)) s += 2;
      return s;
    };
    // right gender first (a real male legacy voice beats a pitched-down female neural one, which
    // sounds uncanny); unknown-gender voices count as a match; cross-gender only as a last resort
    let cands = pool.filter((d) => !R.g || d.gender === R.g || !d.gender);
    let cross = false;
    if (!cands.length) { cands = pool.filter((d) => d.tier >= best - 0.6); cross = !!R.g; }
    cands = cands.sort((a, b) => score(b) - score(a));
    const h = hashStr(String(charId || role));
    let pick = cands[0];
    if (R.spread) { // spread classmates over the top voices of the best tier present
      const top = cands.filter((d) => d.tier >= cands[0].tier - 0.01 && (R.ages.includes(d.age) || d.key === cands[0].key)).slice(0, 4);
      pick = top[h % top.length];
    }
    const j1 = ((h >>> 8) % 1000) / 1000 - 0.5, j2 = ((h >>> 18) % 1000) / 1000 - 0.5;
    const natural = pick.tier >= 3;
    const vp = clamp(+voice?.pitch || 1, 0.4, 2.2);
    let pitch, rate;
    const speed = clamp(+voice?.speed || 1, 0.6, 1.6);
    if (natural) { // neural voices: keep tweaks small, vary by voice choice
      pitch = 1 + j1 * 0.12 + clamp((vp - (R.g === 'f' ? 1.25 : 0.9)) * 0.08, -0.04, 0.04);
      rate = 1 + j2 * 0.1 + (speed - 1) * 0.3;
      pitch = clamp(pitch, 0.9, 1.1); rate = clamp(rate, 0.88, 1.15);
    } else {
      pitch = clamp(1 + (vp - 1) * 0.35 + j1 * 0.2, 0.6, 1.5);
      rate = clamp(1 + (speed - 1) * 0.5 + j2 * 0.14, 0.8, 1.25);
    }
    if (cross) pitch = clamp(pitch * (R.g === 'm' ? 0.72 : 1.3), 0.5, 1.8); // only when that gender has no voice at all
    if (role === 'teacher' || role === 'principal') rate *= 0.95;
    const c = { d: pick, pitch: +pitch.toFixed(3), rate: +rate.toFixed(3), role, cross };
    castCache.set(key, c);
    return c;
  }

  // ---------------------------------------------------------------- blips (soft fallback)
  /** Soft, round blip; only every 2nd–3rd character makes a sound. */
  function blip(voice, ch) {
    if (['ending', 'card'].includes(ctx.flow?.phase) || ctx.settings?.voiceMode === 'off') return;
    if (ch != null && ch !== '' && PUNCT.test(ch)) return;
    stats.blips++;
    if (--blipSkip > 0) return;
    blipSkip = (blipAlt = !blipAlt) ? 2 : 3;
    if (!M.running || M.silent('voice')) return;
    const ac = M.ac, now = ac.currentTime;
    if (now - lastBlip < 0.07) return;
    lastBlip = now;
    const code = ch ? ch.codePointAt(0) : Math.floor(Math.random() * 997);
    const pitch = clamp(+voice?.pitch || 1, 0.4, 2.5);
    const semis = [0, 2, 4, 7, 9][code % 5] - 4 + (Math.random() - 0.5) * 0.5;
    const f = 260 * Math.sqrt(pitch) * 2 ** (semis / 12);
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.97, now); o.frequency.exponentialRampToValueAtTime(f, now + 0.025);
    const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
    const g2 = ac.createGain(); g2.gain.value = 0.18;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.Q.value = 0.4;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.13, now + 0.012); g.gain.setTargetAtTime(0, now + 0.03, 0.03);
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(M.bus.voiceIn);
    o.start(now); o2.start(now); o.stop(now + 0.2); o2.stop(now + 0.2);
  }

  /** timed blip script: [{t, ch}], total seconds */
  function blipScript(text, rate, step, cap) {
    const evs = [];
    let t = 0.06;
    for (const ch of [...text]) {
      if (LONG.test(ch)) t += 0.26 / rate;
      else if (SHORT.test(ch)) t += 0.14 / rate;
      else if (/\s/.test(ch)) t += 0.04;
      else { evs.push({ t, ch }); t += step / rate; }
    }
    let total = t + 0.12;
    if (total > cap) { const k = cap / total; for (const e of evs) e.t *= k; total = cap; }
    return { evs, total };
  }

  // ---------------------------------------------------------------- pre-rendered neural clips (assets/voices)
  // manifest.json: { lines: { [speakerKey]: { [text]: { f: hash, d: seconds } } } }  (built by tools/voices/build.mjs)
  let manifest = null;
  const bufCache = new Map(); // hash → Promise<AudioBuffer|null>
  const clipStats = { hits: 0, misses: 0, loaded: 0, covered: 0, uncovered: 0 };
  if (typeof fetch === 'function' && !ctx.config?.noVoiceClips) {
    fetch('assets/voices/manifest.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((m) => { if (m?.lines) manifest = m; }).catch(() => {});
  }
  const lookup = (key, text) => manifest?.lines?.[key]?.[text] || null;
  function loadClip(hash) {
    if (!bufCache.has(hash)) {
      bufCache.set(hash, fetch(`assets/voices/${hash}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => (ab && M.ac ? M.ac.decodeAudioData(ab) : null)).then((b) => { if (b) clipStats.loaded++; return b; }).catch(() => null));
      if (bufCache.size > 60) bufCache.delete(bufCache.keys().next().value);
    }
    return bufCache.get(hash);
  }
  /** Stable speaker key shared with the harvest: character id, else a role key. */
  function speakerKey(kind, charId, voice, o) {
    if (charId) return String(charId);
    if (kind === 'read') {
      if (ctx.stage?.current === 'schoolyard') return 'npc_principal'; // out_window: the principal reads it over the PA
      return `player_${o?.gender || ctx.round?.playerGender || 'm'}`;
    }
    return `role:${roleOf(null, voice, o)}`;
  }

  // ---------------------------------------------------------------- intro ritual (上课！/ 起立！/ 老师好 chorus / 坐)
  // Played by audio itself on the intro's 'bell', at the same UI-clock offsets as src/story/intro.js.
  const ritual = { active: false, generation: 0, t: 0, steps: [], srcs: [] };
  function clipSource(entry, { gain = 1, pan = 0, rate = 1, delay = 0 } = {}) {
    const generation = ritual.generation;
    return loadClip(entry.f).then((b) => {
      if (!b || !M.running || M.silent('voice') || !ritual.active || generation !== ritual.generation || mode() !== 'speech') return null;
      const ac = M.ac, s = ac.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
      const g = ac.createGain(); g.gain.value = gain;
      s.connect(g);
      let head = g;
      if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); head = p; }
      head.connect(M.bus.voiceIn);
      s.start(ac.currentTime + delay);
      ritual.srcs.push({ s, g });
      return s;
    });
  }
  function startRitual() {
    stopRitual();
    if (mode() !== 'speech') return;
    const monitor = ctx.cast?.students?.().find((c) => c.spec?.trait === 'monitor');
    const mkey = `ritual:monitor_${monitor?.spec?.gender === 'm' ? 'm' : 'f'}`;
    ritual.active = true; ritual.t = 0; ritual.srcs = [];
    ritual.steps = [
      { at: 0.55, play: () => one('teacher', '上课！') },
      { at: 1.2, play: () => one(mkey, '起立！') },
      { at: 2.0, play: chorus },
      { at: 3.9, play: () => one('teacher', '同学们好，坐。') },
    ];
    rec('voice', 'intro-ritual', { mode: 'clip' });
    if (M.ac) ritual.duck = M.duck(0.35, 6, ctx.time.uiNow);
  }
  function one(key, text) {
    const e = lookup(key, text);
    if (e && M.running && !M.silent('voice')) { clipStats.hits++; clipSource(e); }
    else voiceLine(text, null, { charId: key, ritual: true, role: key === 'teacher' ? 'teacher' : 'boy' });
  }
  function chorus() {
    const keys = Object.keys(manifest?.lines || {}).filter((k) => k.startsWith('ritual:chorus'));
    if (!keys.length) { one('role:boy', RITUAL_CHORUS); return; }
    keys.forEach((k, i) => {
      const e = manifest.lines[k][RITUAL_CHORUS]; if (!e) return;
      clipSource(e, { gain: 0.42, pan: ((i / Math.max(1, keys.length - 1)) * 2 - 1) * 0.7, rate: 0.97 + Math.random() * 0.06, delay: Math.random() * 0.14 });
    });
  }
  function stopRitual() {
    ritual.generation++;
    for (const job of [...jobs]) if (job.o.ritual) cancelJob(job);
    ritual.active = false; ritual.steps = [];
    if (ritual.duck) ritual.duck.until = 0;
    for (const { s, g } of ritual.srcs) { try { const n = M.ac.currentTime; g.gain.setTargetAtTime(0, n, 0.05); s.stop(n + 0.3); } catch { /* ended */ } }
    ritual.srcs = [];
  }
  ctx.bus?.on?.('bell', () => { if (ctx.flow?.phase === 'intro') startRitual(); });
  ctx.bus?.on?.('phase', ({ to }) => {
    if (to !== 'intro') stopRitual();
    if (!['intro', 'aim', 'flight'].includes(to)) cancelAll();
  });

  // ---------------------------------------------------------------- chatter fragments (叽叽喳喳 bed)
  const chatter = { bufs: [], loading: false };
  function loadChatter() {
    if (chatter.loading || !manifest || !M.ac) return;
    chatter.loading = true;
    const es = Object.entries(manifest.lines).filter(([k]) => k.startsWith('chatter:')).flatMap(([, m]) => Object.values(m));
    for (const e of es) loadClip(e.f).then((b) => { if (b) chatter.bufs.push(b); });
  }

  // ---------------------------------------------------------------- harvest (tools/voices/build.mjs)
  const harvest = new Map();
  function record(kind, key, text, voice, o) {
    const k = `${key}\u0001${text}`;
    if (harvest.has(k)) { harvest.get(k).n++; return; }
    const spec = !key.startsWith('role:') ? ctx.cast?.get?.(key)?.spec : null;
    harvest.set(k, { kind, key, text, n: 1, gender: spec?.gender ?? o?.gender ?? null, trait: spec?.trait ?? null, role: spec?.role ?? null,
      name: spec?.name ?? null, pitch: +voice?.pitch || null, speed: +voice?.speed || null, phase: ctx.flow?.phase ?? null, ending: ctx.round?.endingId ?? null });
  }

  // ---------------------------------------------------------------- jobs
  const mode = () => { const m = ctx.settings?.voiceMode; return m === 'blips' || m === 'off' ? m : 'speech'; };
  const canTTS = () => !!synth && pool.length > 0 && M.running && !M.silent('voice');
  const sentences = (text) => text.split(/(?<=[。！？!?…\n；;])/).map((s) => s.trim()).filter((s) => s && !/^[\s。！？!?…；;，,、—]+$/.test(s));

  function startClip(job, entry) {
    job.mode = 'clip'; job.entry = entry; job.buffer = null; job.src = null;
    job.deadline = (entry.d || 3) + 3;
    loadClip(entry.f).then((b) => { if (!job.done) { job.buffer = b; if (!b) job.loadFailed = true; } });
    clipStats.hits++;
  }
  function playClip(job) {
    const ac = M.ac, now = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = job.buffer;
    const g = ac.createGain(); g.gain.value = job.o.mood === 'whisper' ? 0.6 : 1;
    s.connect(g); g.connect(M.bus.voiceIn);
    s.onended = () => { job.ended = true; };
    s.start(now + 0.02);
    job.src = s; job.srcGain = g; job.started = true;
    job.deadline = job.t + job.buffer.duration + 1.5;
  }
  function stopClip(job) {
    if (!job.src) return;
    try { const n = M.ac.currentTime; job.srcGain.gain.setTargetAtTime(0, n, 0.02); job.src.stop(n + 0.1); } catch { /* ended */ }
    job.src = null;
  }
  /** clip unavailable → best browser voice → blips */
  function fallback(job) {
    stopClip(job);
    const c = mode() === 'speech' && canTTS() && job.speech ? cast(job.charId, job.voice, job.o) : null;
    if (c && job.mode !== 'tts') { job.mode = 'blips'; job.t = 0; startTTS(job, c); rec('voice', `${job.kind}:tts-fallback`); }
    else { job.mode = 'blips'; job.t = 0; job.idx = 0; }
  }

  function startTTS(job, c) {
    job.mode = 'tts'; job.parts = sentences(job.speech); job.si = 0; job.started = false; job.ended = false; job.utts = [];
    job.cast = c;
    const chars = [...job.speech].length;
    job.deadline = Math.min(28, (c.d.natural || c.d.kind === 'online' ? 2.5 : 1.2) + chars * 0.3 / c.rate + job.parts.length * 0.35);
    job.startBy = c.d.natural || c.d.kind === 'online' ? 3 : 1.5;
    job.needStart = true; // first utterance goes out next frame (Chrome drops speak() right after cancel())
    if (ttsJob && ttsJob !== job) cancelJob(ttsJob);
    if (synth.speaking || synth.pending) { try { synth.cancel(); } catch { /* ok */ } }
    ttsJob = job;
    stats.tts++;
  }
  function speakNext(job) {
    if (job.cancelled || job.done) return;
    if (job.si >= job.parts.length) { job.ended = true; return; }
    const c = job.cast;
    const u = new SpeechSynthesisUtterance(job.parts[job.si++]);
    try { u.voice = c.d.v; } catch { /* ok */ }
    u.lang = c.d.v.lang || 'zh-CN';
    const mood = job.o.mood;
    u.pitch = clamp(c.pitch * (mood === 'sad' ? 0.97 : mood === 'shout' || mood === 'angry' ? 1.03 : 1), 0.1, 2);
    u.rate = clamp(c.rate * job.rateMul * (mood === 'shout' || mood === 'angry' ? 1.06 : mood === 'whisper' || mood === 'sad' ? 0.92 : 1), 0.5, 2);
    u.volume = clamp(M.vol.master * Math.max(0.2, M.vol.sfx) * (mood === 'whisper' ? 0.6 : 1), 0, 1);
    u.onstart = () => { job.started = true; };
    u.onend = () => { if (!job.cancelled) speakNext(job); };
    u.onerror = (e) => {
      if (job.cancelled) return;
      if (!job.started && job.si <= 1 && e?.error !== 'interrupted' && e?.error !== 'canceled') toBlips(job); else speakNext(job);
    };
    job.utts.push(u);
    try { synth.speak(u); } catch { toBlips(job); }
  }
  function toBlips(job) {
    if (job.mode !== 'tts') return;
    job.mode = 'blips'; job.t = 0; job.idx = 0;
    if (ttsJob === job) ttsJob = null;
    rec('voice', `${job.kind}:blips-fallback`);
  }
  function cancelJob(job) {
    if (job.done) return;
    job.cancelled = true;
    if (job.mode === 'tts') { try { synth.cancel(); } catch { /* ok */ } }
    stopClip(job);
    finish(job);
  }
  function finish(job) {
    if (job.done) return;
    job.done = true;
    const i = jobs.indexOf(job); if (i >= 0) jobs.splice(i, 1);
    if (ttsJob === job) ttsJob = null;
    if (job.duckRef) job.duckRef.until = 0;
    job.resolve();
  }

  function makeJob(kind, text, voice, o, resolve) {
    const job = { kind, text, speech: speechText(text), voice: voice || null, charId: o.charId ?? null, o, resolve, t: 0, idx: 0, mode: 'blips', rateMul: kind === 'read' ? clamp(+o.rate || 1, 0.5, 2) : 1 };
    job.blipVoice = { pitch: +voice?.pitch || 1 };
    const len = [...text].length;
    // blip schedule (also the silent timing when muted / headless)
    const s = kind === 'read' ? blipScript(text, job.rateMul, 0.12, Math.min(30, 2.5 + 0.25 * len)) : blipScript(text, 1, 0.065, Math.min(14, 1 + 0.12 * len));
    job.evs = s.evs; job.total = s.total;
    return job;
  }
  /** Start a line/read job. Returns a Promise with .cancel(). */
  function run(kind, text, voice, o) {
    text = String(text ?? '');
    let job = null;
    const p = new Promise((resolve) => {
      const m = mode();
      for (const j of [...jobs]) if (j.kind === kind || kind === 'read') cancelJob(j); // a new line replaces the previous one
      const key = speakerKey(kind, o.charId, voice, o);
      const ph = ctx.flow?.phase;
      // Endings are text-only (playtest addendum 2): no speech, no blips; resolve at once.
      // The intro ritual (上课/起立/老师好/坐) is voiced by ritual playback, so matching calls stay silent.
      if (ph === 'ending' || ph === 'card' || (ph === 'intro' && ritual.active && !o.ritual && RITUAL_TEXTS.has(text))) {
        rec(kind === 'read' ? 'speak' : 'voice', text.slice(0, 24), { mode: 'text-only', key });
        resolve(); return;
      }
      if (text.trim()) record(kind, key, text, voice, o);
      job = makeJob(kind, text, voice, { ...o, charId: o.charId ?? (key.startsWith('role:') ? null : key) }, resolve);
      const logKind = kind === 'read' ? 'speak' : 'voice';
      if (m === 'off' || !text.trim()) { rec(logKind, text.slice(0, 24), { mode: 'off' }); job.silent = true; if (kind === 'line') { finish(job); return; } }
      else if (!job.speech) { job.silent = true; job.total = Math.min(job.total, 0.8); } // "……" — a silent beat
      else if (m === 'speech') {
        const entry = lookup(key, text);
        if (entry) clipStats.covered++; else clipStats.uncovered++;
        if (M.running && !M.silent('voice')) {
          if (entry) { startClip(job, entry); hooks.onVoiced?.(key, text); }
          else { clipStats.misses++; const c = canTTS() ? cast(job.o.charId, voice, job.o) : null; if (c) { startTTS(job, c); hooks.onVoiced?.(key, text); } }
        } else if (entry) { job.silent = true; job.evs = []; job.total = (entry.d || 1) + 0.15; } // muted / headless: real speech timing
      }
      if (m !== 'off') rec(logKind, text.slice(0, 24), { mode: job.silent ? 'silent' : job.mode, key, ...(job.cast ? { v: job.cast.d.name } : {}) });
      if (M.ac && !job.silent) job.duckRef = M.duck(job.mode === 'blips' ? 0.15 : kind === 'read' ? 0.45 : 0.4, job.mode === 'blips' ? job.total : 30, ctx.time.uiNow);
      if (!job.done) jobs.push(job);
    });
    p.cancel = () => { if (job) cancelJob(job); };
    return p;
  }

  /** Dialogue line. voice = spec.voice ({pitch, speed}); o = {charId, mood, gender, role} */
  function voiceLine(text, voice, o = {}) { stats.lines++; return run('line', text, voice, o || {}); }
  /** Read-aloud (the letter). Same voices as dialogue; o = {pitch, rate, charId, gender} */
  function speak(text, o = {}) {
    stats.spoken++;
    o = o || {};
    const g = o.gender || ctx.round?.playerGender || 'm';
    return run('read', text, { pitch: +o.pitch || (g === 'f' ? 1.3 : 0.95) }, { ...o, gender: g });
  }

  function update(uiDt) {
    if (mode() !== 'speech' || (M.ac && M.silent('voice'))) {
      for (const job of [...jobs]) if (mode() === 'off' || job.mode === 'clip' || job.mode === 'tts') cancelJob(job);
      if (ritual.active) stopRitual();
    }
    if (ritual.active) {
      ritual.t += uiDt;
      while (ritual.steps.length && ritual.steps[0].at <= ritual.t) ritual.steps.shift().play();
      if (ritual.t > 6) stopRitual();
    }
    if (!chatter.loading && manifest && M.running && !M.silent('voice')) loadChatter();
    for (const job of [...jobs]) {
      job.t += uiDt;
      if (job.mode === 'clip') {
        if (job.loadFailed || (!job.buffer && job.t > 1.5)) { fallback(job); continue; }
        if (job.buffer && !job.src && !job.started) { if (M.running) playClip(job); else { fallback(job); continue; } }
        if (job.ended || job.t > job.deadline) { stopClip(job); finish(job); }
        continue;
      }
      if (job.mode === 'tts') {
        if (job.needStart) { job.needStart = false; speakNext(job); }
        if (!job.started && !job.ended && job.t > job.startBy) { try { synth.cancel(); } catch { /* ok */ } toBlips(job); continue; }
        if (job.ended || job.t > job.deadline) { if (!job.ended) { job.cancelled = true; try { synth.cancel(); } catch { /* ok */ } } finish(job); }
        continue;
      }
      while (job.idx < job.evs.length && job.evs[job.idx].t <= job.t) {
        const e = job.evs[job.idx++];
        if (!job.silent && job.t - e.t < 0.1) blip(job.blipVoice, e.ch);
      }
      if (job.t >= job.total) finish(job);
    }
  }

  function cancelAll() { for (const j of [...jobs]) cancelJob(j); }

  return {
    blip, speak, voiceLine, update, cancelAll, stats, clipStats,
    stopVoice: () => { cancelAll(); stopRitual(); },
    chatterBuffers: () => chatter.bufs,
    get ritualActive() { return ritual.active; },
    get busy() { return jobs.length > 0; },
    get activeJobs() { return jobs.length; },
    get manifestLines() { return manifest ? Object.values(manifest.lines).reduce((a, m) => a + Object.keys(m).length, 0) : 0; },
    harvest: () => [...harvest.values()],
    harvestReset: () => harvest.clear(),
    harvestAdd: (kind, key, text) => record(kind, key, String(text), null, {}),
    quality,
    hint: () => (quality() === 'legacy' || quality() === 'none' ? VOICE_HINT : null),
    /** casting table for debug / docs: role → voice name */
    castTable: () => Object.fromEntries(Object.keys(ROLES).map((r) => { const c = cast(`__${r}`, null, { role: r }); return [r, c ? `${c.d.name}${c.cross ? ' (cross-gender)' : ''} p${c.pitch} r${c.rate}` : null]; })),
    voiceList: () => pool.map((d) => ({ name: d.name, lang: d.v.lang, tier: d.tier, gender: d.gender, local: d.v.localService })),
    _describe: describe, _setVoicesForTest(list) { pool = list.map(describe).sort((a, b) => b.tier - a.tier); castCache = new Map(); },
  };
}

/** Text actually spoken: stage directions （…）/(…)/【…】/[…]/*…* removed, dashes and ellipses tidied.
 *  Empty string → nothing to say (a silent beat). Shared with tools/voices/build.mjs. */
export function speechText(text) {
  let s = String(text ?? '')
    .replace(/（[^）]*）|\([^)]*\)|【[^】]*】|\[[^\]]*\]|\*[^*]*\*/g, '')
    .replace(/……+/g, '…').replace(/\.{3,}/g, '…').replace(/——+|—/g, '，').replace(/~+|～+/g, '')
    .replace(/\s+/g, ' ').trim();
  s = s.replace(/^[，、,。…\s]+/, '');
  return /[\p{L}\p{N}]/u.test(s) ? s : '';
}
