// Pre-rendered neural dialogue voices (owner: qs-audio-composer). One re-runnable command:
//
//   node tools/voices/build.mjs                 harvest → casting → generate (incremental) → manifest → prune
//   node tools/voices/build.mjs --skip-harvest  reuse tools/voices/lines.json
//   node tools/voices/build.mjs --static        static harvest only (no headless runtime pass)
//   node tools/voices/build.mjs --quick         shorter runtime harvest
//   node tools/voices/build.mjs --dry           everything except calling edge-tts
// Scope (docs/PLAYTEST-1.md addendum 2): classroom only — intro ritual, the teacher during play, chatter
// fragments. Endings are text-only. Budget ≤ 6 MB.
//
// 1. Harvest: static classroom lines plus an optional headless intro/AI pass via tools/browser.mjs.
//    Includes teacher/name variants, student answers, ritual and chatter; endings stay text-only.
// 2. Casting: tools/voices/casting.json maps speaker keys (character ids, `role:*` fallbacks) to an
//    edge-tts voice + small rate/pitch offsets. New speakers are auto-cast and appended; manual edits
//    are preserved.
// 3. Generate: tools/voices/.venv (edge-tts) via gen.py → assets/voices/<hash>.mp3 (mono, 24 kHz,
//    32 kbps). hash = sha1(voice|rate|pitch|spokenText); existing files are reused.
// 4. Manifest: assets/voices/manifest.json {lines: {speakerKey: {text: {f, d}}}}; unreferenced mp3s
//    are deleted only after a complete build. Budget: 6 MB.
//
// Setup once: python3 -m venv tools/voices/.venv && tools/voices/.venv/bin/pip install edge-tts
// Requires ffmpeg/ffprobe on PATH.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { withGame, ROOT } from '../browser.mjs';
import { speechText } from '../../src/audio/voice.js';

const args = new Set(process.argv.slice(2));
const DIR = path.join(ROOT, 'tools', 'voices');
const OUT = path.join(ROOT, 'assets', 'voices');
const LINES = path.join(DIR, 'lines.json');
const CASTING = path.join(DIR, 'casting.json');
const MANIFEST = path.join(OUT, 'manifest.json');
const BUDGET_MB = 6;
const PY = path.join(DIR, '.venv', 'bin', 'python');
const log = (...a) => console.log('[voices]', ...a);

// ------------------------------------------------------------------ 1. harvest
// Playtest addendum 2: only the classroom is voiced (endings are text-only).
//  a) the teacher's lines from src/ai/lines.js (names / pronouns filled exactly like src/ai/students.js),
//  b) the intro ritual (src/story/intro.js) incl. the "老——师——好——" chorus in 8 classmate voices,
//  c) classmate chatter fragments for the 叽叽喳喳 bed,
//  d) the settings voice preview,
//  e) a short runtime harvest (intro + aim with the AI running) for any other voiced line.
export const CHATTER = ['作业写完没？', '好困啊……', '你看那个！', '嘻嘻。', '借我橡皮。', '第几题啊？', '等会儿去小卖部吗？', '他又睡着了。', '真的假的？', '笑死我了。',
  '下节什么课？', '嘘——小声点。', '老师看过来了。', '我也不会。', '你昨天看那个了吗？', '饿死了。', '哈哈哈。', '别闹。', '给我看看。', '啊？', '就是那个嘛。', '我跟你说……',
  '不是吧。', '好热啊。', '几点了？', '放学打球吗？', '这题选C。', '笔借我一下。', '哎呀。', '对对对。', '然后呢？', '你猜。', '说好的啊。', '明天考试？', '完了完了。',
  '她刚才看你了。', '嗯嗯。', '什么呀。', '好无聊啊。', '超好笑的。', '等一下。', '快抄快抄。', '你抄完了没？', '我看看。', '好好好。', '哇。', '谁啊？', '我就说嘛。'];
const CHATTER_VOICES = [['zh-CN-XiaoxiaoNeural', 8, 2], ['zh-CN-XiaoyiNeural', 10, 0], ['zh-TW-HsiaoChenNeural', 8, 3], ['zh-TW-HsiaoYuNeural', 10, -2],
  ['zh-CN-YunxiNeural', 8, 0], ['zh-CN-YunxiaNeural', 10, -2], ['zh-TW-YunJheNeural', 8, 2], ['zh-CN-YunjianNeural', 6, 4]];
const CHORUS_VOICES = [['zh-CN-XiaoyiNeural', -12, 2], ['zh-CN-YunxiNeural', -12, 0], ['zh-TW-HsiaoChenNeural', -10, 0], ['zh-CN-YunxiaNeural', -14, 3],
  ['zh-CN-XiaoxiaoNeural', -10, 4], ['zh-TW-YunJheNeural', -12, -2], ['zh-TW-HsiaoYuNeural', -14, -3], ['zh-CN-YunjianNeural', -10, 5]];
const RITUAL_CHORUS = '老——师——好——';

async function staticLines() {
  const L = await import('../../src/ai/lines.js');
  const { STUDENTS } = await import('../../src/story/roster.js');
  const speakable = (t) => typeof t === 'string' && !/[（(【\[]/.test(t) && /[一-鿿A-Za-z]/.test(t);
  const fill = (t, st) => t.replace('{name}', st?.name ?? '同学').replace('{pron}', st?.gender === 'f' ? '她' : '他');
  const out = [];
  const add = (key, text, kind = 'line') => { if (speakable(text)) out.push({ kind, key, text }); };
  const teacherLists = ['OPENING', 'WRITING_MUTTER', 'LECTURE', 'WARNING_TELL', 'HEARD_TELL', 'FAKEOUT_TELL', 'DRINK_TELL', 'PATROL_LINES', 'SUSPICIOUS_LINES', 'SUSPICIOUS_CLEAR', 'ALERT_AIM', 'ALERT_BALL', 'REPLY_BAD'];
  for (const k of teacherLists) for (const t of L[k] || []) add('teacher', t);
  for (const st of STUDENTS) {
    for (const t of [...L.ANSWER_GOOD, ...L.ANSWER_BAD]) add(st.id, t);
    for (const t of L.REPLY_GOOD || []) add('teacher', fill(t, st));
    for (const t of L.CALL_ON || []) add('teacher', fill(t, st));
    for (const t of (L.SCOLD?.[st.trait] || L.SCOLD?.default || [])) add('teacher', fill(t, st));
  }
  add('teacher', '上课！'); add('teacher', '同学们好，坐。');
  add('ritual:monitor_f', '起立！'); add('ritual:monitor_m', '起立！');
  CHORUS_VOICES.forEach((_, i) => add(`ritual:chorus${i}`, RITUAL_CHORUS));
  CHATTER.forEach((t, i) => add(`chatter:${i % CHATTER_VOICES.length}`, t));
  add('role:boy', '你好，这是语音试听。'); add('role:boy', '你好！'); add('role:girl', '你好，这是语音试听。'); add('role:narrator', '你好，这是语音试听。');
  return { lines: out, speakers: Object.fromEntries(STUDENTS.map((s) => [s.id, { name: s.name, gender: s.gender, role: 'student', trait: s.trait }])) };
}

async function harvest() {
  const t0 = Date.now();
  const st = await staticLines();
  const all = new Map(st.lines.map((l) => [`${l.key}\u0001${l.text}`, { ...l, n: 1, src: 'static' }]));
  const speakers = { ...st.speakers };
  if (!args.has('--static')) {
    const configs = args.has('--quick') ? [{ seed: 11, g: 'm' }] : [{ seed: 11, g: 'm' }, { seed: 12, g: 'f' }, { seed: 13, g: 'm' }];
    await withGame(async (page) => {
      await page.evaluate(() => { window.__qs.manual(true); window.__qs.ctx.audio.dev.harvestReset(); });
      for (const cfg of configs) {
        const r = await page.evaluate(async ({ seed, g }) => {
          const qs = window.__qs, ctx = qs.ctx;
          await qs.start({ seed, playerGender: g, skipIntro: false, roundSeconds: 120 });
          // let the AI run the class (turns, patrols, call-ons, scoldings) with the player idle
          await qs.advanceUntil(() => ctx.flow.phase !== 'aim', 110, 1 / 15);
          await qs.advanceUntil(() => ctx.flow.phase === 'card', 60, 1 / 15);
          return { phase: ctx.flow.phase, n: ctx.audio.dev.harvest().length };
        }, cfg);
        log(`runtime harvest seed ${cfg.seed}${cfg.g}: ${r.n} voiced calls so far (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      }
      const res = await page.evaluate(() => ({ lines: window.__qs.ctx.audio.dev.harvest(), errors: window.__qs.errors.slice(0, 10) }));
      for (const l of res.lines) if (!all.has(`${l.key}\u0001${l.text}`)) all.set(`${l.key}\u0001${l.text}`, { ...l, src: 'runtime' });
      if (res.errors.length) log('page errors during harvest:', res.errors);
    }, { query: 'lowfx=1&mute=1' });
  }
  const lines = [...all.values()].map((l) => ({ ...l, speech: speechText(l.text) })).sort((a, b) => (a.key + a.text).localeCompare(b.key + b.text));
  fs.writeFileSync(LINES, JSON.stringify({ generated: new Date().toISOString(), count: lines.length, speakers, lines }, null, 1));
  const rt = lines.filter((l) => l.src === 'runtime');
  log(`harvested ${lines.length} unique lines (${rt.length} only seen at runtime${rt.length ? ': ' + rt.slice(0, 6).map((l) => `${l.key}:${l.text}`).join(' | ') : ''}) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ------------------------------------------------------------------ 2. casting
const POOLS = {
  m: [['zh-CN-YunxiNeural', 0, 0], ['zh-CN-YunxiaNeural', 0, 0], ['zh-TW-YunJheNeural', 0, 0], ['zh-CN-YunxiNeural', 7, 3], ['zh-CN-YunxiaNeural', -6, -3], ['zh-TW-YunJheNeural', 6, 3],
    ['zh-CN-YunxiNeural', -7, -4], ['zh-CN-YunxiaNeural', 8, 4], ['zh-TW-YunJheNeural', -6, -4], ['zh-CN-YunxiNeural', 3, 6], ['zh-CN-YunxiaNeural', -3, 6], ['zh-TW-YunJheNeural', 3, -6]],
  f: [['zh-CN-XiaoyiNeural', 0, 0], ['zh-CN-XiaoxiaoNeural', 0, 0], ['zh-TW-HsiaoChenNeural', 0, 0], ['zh-TW-HsiaoYuNeural', 0, 0], ['zh-CN-XiaoyiNeural', 7, 4], ['zh-CN-XiaoxiaoNeural', -6, 4],
    ['zh-TW-HsiaoChenNeural', 6, -3], ['zh-TW-HsiaoYuNeural', -6, 3], ['zh-CN-XiaoyiNeural', -7, -4], ['zh-CN-XiaoxiaoNeural', 7, -3], ['zh-TW-HsiaoChenNeural', -4, 5], ['zh-TW-HsiaoYuNeural', 5, -4]],
};
const TRAIT_RATE = { shy: -6, sleeper: -8, clown: 6, gossip: 6, nerd: 4, jock: 4, chuuni: 0, monitor: 2, disciplinarian: -2 };
const DEFAULT_CASTING = {
  _doc: 'Speaker key → edge-tts voice + rate (%) and pitch (Hz) offsets (keep within ±10). Edit freely; build.mjs only adds missing keys. role:* keys are fallbacks for lines without a character id.',
  roles: {
    'role:narrator': { voice: 'zh-CN-XiaoxiaoNeural', rate: -4, pitch: 0 },
    'role:teacher': { voice: 'zh-CN-YunyangNeural', rate: -6, pitch: -4 },
    'role:boy': { voice: 'zh-CN-YunxiNeural', rate: 0, pitch: 0 },
    'role:girl': { voice: 'zh-CN-XiaoyiNeural', rate: 0, pitch: 0 },
    'role:adultM': { voice: 'zh-CN-YunjianNeural', rate: -4, pitch: -2 },
    'role:adultF': { voice: 'zh-CN-XiaoxiaoNeural', rate: 0, pitch: -3 },
    'role:principal': { voice: 'zh-CN-YunjianNeural', rate: -10, pitch: -6 },
    'role:coach': { voice: 'zh-CN-YunjianNeural', rate: 6, pitch: 2 },
    'role:dad': { voice: 'zh-CN-YunjianNeural', rate: -3, pitch: -2 },
    'role:mom': { voice: 'zh-CN-XiaoxiaoNeural', rate: 5, pitch: -4 },
    'role:elderF': { voice: 'zh-CN-XiaoxiaoNeural', rate: -9, pitch: -7 },
  },
  chars: {
    teacher: { voice: 'zh-CN-YunyangNeural', rate: -6, pitch: -4, note: 'math teacher: mature, measured' },
    npc_principal: { voice: 'zh-CN-YunjianNeural', rate: -10, pitch: -6, note: 'principal: older, slow, warm' },
    npc_pe: { voice: 'zh-CN-YunjianNeural', rate: 7, pitch: 3, note: 'PE coach: loud, fast' },
    npc_dad: { voice: 'zh-CN-YunjianNeural', rate: -3, pitch: -2, note: 'dad: adult, few words' },
    npc_mom: { voice: 'zh-CN-XiaoxiaoNeural', rate: 5, pitch: -4, note: 'mom: adult, brisk' },
    npc_janitor: { voice: 'zh-TW-HsiaoChenNeural', rate: -8, pitch: -6, note: 'janitor auntie' },
    player_m: { voice: 'zh-CN-YunxiNeural', rate: -2, pitch: 0, note: 'you (boy)' },
    player_f: { voice: 'zh-CN-XiaoyiNeural', rate: -2, pitch: 0, note: 'you (girl)' },
  },
};
function roleFallback(key) {
  if (/principal/.test(key)) return 'role:principal';
  if (/npc_pe|coach/.test(key)) return 'role:coach';
  if (/dad/.test(key)) return 'role:dad';
  if (/mom/.test(key)) return 'role:mom';
  if (/janitor/.test(key)) return 'role:elderF';
  return null;
}
function castFixed(C) {
  CHATTER_VOICES.forEach(([voice, rate, pitch], i) => { C.chars[`chatter:${i}`] ||= { voice, rate, pitch, note: 'chatter fragment voice' }; });
  CHORUS_VOICES.forEach(([voice, rate, pitch], i) => { C.chars[`ritual:chorus${i}`] ||= { voice, rate, pitch, note: '老师好 chorus' }; });
  C.chars['ritual:monitor_f'] ||= { voice: 'zh-CN-XiaoyiNeural', rate: 4, pitch: 2, note: 'class monitor (girl): 起立！' };
  C.chars['ritual:monitor_m'] ||= { voice: 'zh-CN-YunxiNeural', rate: 4, pitch: 2, note: 'class monitor (boy): 起立！' };
}
function castAll(lines, speakers) {
  const C = fs.existsSync(CASTING) ? JSON.parse(fs.readFileSync(CASTING, 'utf8')) : structuredClone(DEFAULT_CASTING);
  C.roles = { ...DEFAULT_CASTING.roles, ...C.roles };
  C.chars = C.chars || {};
  for (const [k, v] of Object.entries(DEFAULT_CASTING.chars)) if (!C.chars[k]) C.chars[k] = v;
  castFixed(C);
  // students (stable order by id) get pooled voices by gender
  const used = { m: 0, f: 0 };
  for (const v of Object.values(C.chars)) if (v.pool != null) used[v.pool[0]] = Math.max(used[v.pool[0]], v.pool[1] + 1);
  const keys = [...new Set(lines.map((l) => l.key))].sort();
  const studs = Object.entries(speakers).filter(([, s]) => s.role === 'student').map(([id]) => id).sort();
  for (const id of [...studs, ...keys]) {
    if (C.chars[id] || C.roles[id] || id.startsWith('role:')) continue;
    const sp = speakers[id];
    const fb = roleFallback(id);
    if (fb) { C.chars[id] = { ...C.roles[fb] }; continue; }
    if (sp?.role === 'student') {
      const g = sp.gender === 'f' ? 'f' : 'm';
      const pool = POOLS[g], i = used[g]++ % pool.length;
      const [voice, rate, pitch] = pool[i];
      C.chars[id] = { voice, rate: Math.max(-10, Math.min(10, rate + (TRAIT_RATE[sp.trait] ?? 0))), pitch, note: `${sp.name} (${sp.trait})`, pool: [g, i] };
      if (sp.trait === 'jock' && g === 'm') Object.assign(C.chars[id], { voice: 'zh-CN-YunjianNeural', rate: 8, pitch: 5 });
    } else if (sp) {
      C.chars[id] = { ...C.roles[sp.gender === 'f' ? 'role:adultF' : 'role:adultM'] };
    }
  }
  for (const v of [...Object.values(C.roles), ...Object.values(C.chars)]) { v.rate = Math.max(-10, Math.min(10, v.rate | 0)); v.pitch = Math.max(-10, Math.min(10, v.pitch | 0)); }
  fs.writeFileSync(CASTING, JSON.stringify(C, null, 1));
  return C;
}
const castFor = (C, key) => C.chars[key] || C.roles[key] || C.roles[roleFallback(key) || ''] || C.roles['role:narrator'];
const fmt = (n, unit) => `${n >= 0 ? '+' : ''}${n}${unit}`;

// ------------------------------------------------------------------ 3/4. generate + manifest
function runPy(jobs) {
  return new Promise((resolve, reject) => {
    const jf = path.join(DIR, '.jobs.json');
    fs.writeFileSync(jf, JSON.stringify(jobs));
    const p = spawn(PY, [path.join(DIR, 'gen.py'), jf, OUT], { stdio: ['ignore', 'pipe', 'inherit'] });
    const results = []; let buf = ''; let n = 0;
    p.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        try { const r = JSON.parse(line); results.push(r); n++; if (!r.ok) log('FAILED', r.hash, r.err); if (n % 25 === 0 || n === jobs.length) log(`  generated ${n}/${jobs.length}`); } catch { /* not json */ }
      }
    });
    p.on('error', reject);
    p.on('close', (code) => { fs.rmSync(jf, { force: true }); code === 0 ? resolve(results) : reject(new Error(`gen.py exited ${code}`)); });
  });
}

async function generate() {
  const { lines, speakers } = JSON.parse(fs.readFileSync(LINES, 'utf8'));
  const C = castAll(lines, speakers);
  fs.mkdirSync(OUT, { recursive: true });
  const prev = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { durations: {} };
  const durations = { ...(prev.durations || {}) };
  const entries = [];
  const jobs = new Map();
  let silent = 0;
  for (const l of lines) {
    if (!l.speech) { silent++; continue; }
    const c = castFor(C, l.key);
    const rate = fmt(c.rate, '%'), pitch = fmt(c.pitch, 'Hz');
    const hash = crypto.createHash('sha1').update(`${c.voice}|${rate}|${pitch}|${l.speech}`).digest('hex').slice(0, 16);
    entries.push({ key: l.key, text: l.text, hash, voice: c.voice });
    const clip = path.join(OUT, `${hash}.mp3`);
    if (fs.existsSync(clip) && durations[hash] == null) {
      try {
        const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
        if (duration > 0 && Number.isFinite(duration)) durations[hash] = duration;
      } catch { /* interrupted or invalid clip: regenerate it */ }
    }
    if (!fs.existsSync(clip) || durations[hash] == null) jobs.set(hash, { hash, text: l.speech, voice: c.voice, rate, pitch });
  }
  log(`${entries.length} voiced lines (${silent} silent beats), ${new Set(entries.map((e) => e.hash)).size} unique clips, ${jobs.size} to generate`);
  if (args.has('--dry')) return;
  if (jobs.size && !args.has('--dry')) {
    if (!fs.existsSync(PY)) throw new Error('missing tools/voices/.venv — python3 -m venv tools/voices/.venv && tools/voices/.venv/bin/pip install edge-tts');
    for (const r of await runPy([...jobs.values()])) if (r.ok) durations[r.hash] = r.dur;
  }
  // manifest (only clips that exist)
  const man = { version: 1, generated: new Date().toISOString(), lines: {}, durations: {} };
  let have = 0;
  for (const e of entries) {
    if (!fs.existsSync(path.join(OUT, `${e.hash}.mp3`)) || durations[e.hash] == null) continue;
    (man.lines[e.key] ||= {})[e.text] = { f: e.hash, d: durations[e.hash] };
    man.durations[e.hash] = durations[e.hash];
    have++;
  }
  if (have !== entries.length) {
    throw new Error(`Incomplete voice build (${have}/${entries.length}); existing manifest and clips preserved. Re-run to retry missing clips.`);
  }
  const packed = JSON.stringify(man);
  const candidateBytes = Buffer.byteLength(packed) + Object.keys(man.durations).reduce((sum, hash) => sum + fs.statSync(path.join(OUT, `${hash}.mp3`)).size, 0);
  if (candidateBytes > BUDGET_MB * 1048576) throw new Error(`Voice build exceeds ${BUDGET_MB} MB; previous manifest preserved.`);
  fs.writeFileSync(`${MANIFEST}.tmp`, packed);
  fs.renameSync(`${MANIFEST}.tmp`, MANIFEST);
  // prune
  const keep = new Set(Object.keys(man.durations));
  let pruned = 0;
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.mp3') && !keep.has(f.slice(0, -4))) { fs.rmSync(path.join(OUT, f)); pruned++; }
  const bytes = fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
  const secs = Object.values(man.durations).reduce((a, b) => a + b, 0);
  const perVoice = {};
  for (const e of entries) perVoice[e.voice] = (perVoice[e.voice] || 0) + 1;
  log(`manifest: ${have}/${entries.length} voiced lines covered (${((have / Math.max(1, entries.length)) * 100).toFixed(1)}%), ${keep.size} clips, ${(secs / 60).toFixed(1)} min, ${(bytes / 1048576).toFixed(2)} MB (budget ${BUDGET_MB} MB), pruned ${pruned}`);
  log('lines per voice:', perVoice);
  if (bytes > BUDGET_MB * 1048576) { log(`WARNING: over the ${BUDGET_MB} MB budget`); process.exitCode = 1; }
}

if (!args.has('--skip-harvest')) await harvest();
await generate();
