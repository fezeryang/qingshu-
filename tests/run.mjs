// QA test runner (owner: qs-qa-lead).
//
//   node tests/run.mjs                    full suite (all of docs/ACCEPTANCE.md A1–J2)
//   node tests/run.mjs --quick            cheap subset/scales of every spec (see tests/README.md)
//   node tests/run.mjs --only E1,F        run only these ids / letters (results are merged into qa/results.json)
//   node tests/run.mjs --strict           treat "pending implementation" as a plain failure (release gate)
//   node tests/run.mjs --list             print the inventory and exit
//   node tests/run.mjs --no-shots         skip PNG screenshots where possible
//
// The whole run uses ONE browser from tools/browser.mjs withGame() (machine-wide lock, 6 GB RAM box);
// isolated pages are opened as new contexts inside it. Output: qa/results.json, qa/data/<id>.json,
// qa/shots/**, qa/REPORT.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withGame, ROOT } from '../tools/browser.mjs';
import { Session, QA_DIR } from './lib/session.mjs';
import { writeReport } from './lib/report.mjs';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const quick = flag('--quick');
const strict = flag('--strict');
const noShots = flag('--no-shots');
const only = (opt('--only') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

const specDir = path.join(ROOT, 'tests', 'specs');
const files = fs.readdirSync(specDir).filter((f) => f.endsWith('.mjs')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const specs = [];
for (const f of files) { const m = await import(path.join(specDir, f)); specs.push({ file: f, ...m.default }); }
const selected = specs.filter((s) => !only.length || only.some((o) => s.id === o || s.id.startsWith(o) && /^[A-J]$/.test(o)));

if (flag('--list')) {
  for (const s of specs) console.log(`${s.id.padEnd(4)} ${s.priority.padEnd(3)} ${s.title}  [${s.owners.join(', ')}]${s.quick === false ? '  (skipped in --quick)' : ''}`);
  process.exit(0);
}

// Which modules are still gray-box stubs / uncommitted (context for "pending implementation").
const MODULES = ['world', 'characters', 'story', 'ai', 'gameplay', 'camera', 'audio', 'ui'];
const stubs = MODULES.filter((m) => { try { return /^\s*\/\/\s*STUB\b/.test(fs.readFileSync(path.join(ROOT, 'src', m, 'index.js'), 'utf8').split('\n').slice(0, 3).join('\n')); } catch { return true; } });
const srcHash = (() => {
  const h = crypto.createHash('sha1');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|css|html)$/.test(e.name)) h.update(e.name).update(fs.readFileSync(p)); });
  walk(path.join(ROOT, 'src'));
  return h.digest('hex').slice(0, 10);
})();
let gitHead = null, dirty = [];
try {
  const { execFileSync } = await import('node:child_process');
  gitHead = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
  dirty = [...new Set(execFileSync('git', ['status', '--porcelain', 'src'], { cwd: ROOT }).toString().split('\n').filter(Boolean).map((l) => l.slice(3).split('/')[1]).filter(Boolean))];
} catch { /* not a git checkout */ }

fs.mkdirSync(path.join(QA_DIR, 'data'), { recursive: true });
const memo = new Map();
const store = {};
const log = (...a) => console.log(...a);
const t0 = Date.now();
const results = [];

const runOne = async (spec, S) => {
  const h = {
    S, quick, strict, shots: !noShots, log, store, stubs,
    isStub: (m) => stubs.includes(m),
    memo: (key, fn) => { if (!memo.has(key)) memo.set(key, fn(S)); return memo.get(key); },
    saveData: (id, data) => { const p = path.join(QA_DIR, 'data', `${id}.json`); fs.writeFileSync(p, JSON.stringify(data, null, 1)); return path.relative(QA_DIR, p); },
  };
  if (quick && spec.quick === false) return { status: 'skip', details: 'not run in --quick' };
  const timeout = (quick ? spec.quickTimeout ?? spec.timeout : spec.timeout) ?? 600;
  let timer;
  try {
    const res = await Promise.race([
      spec.run(S.page, h),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`spec timeout after ${timeout}s`)), timeout * 1000); }),
    ]);
    return res || { status: 'fail', details: 'spec returned nothing' };
  } catch (e) {
    return { status: 'fail', details: `exception: ${String(e.message || e).split('\n').slice(0, 4).join(' | ')}`, exception: true };
  } finally {
    clearTimeout(timer);
    await S.closeChildren().catch(() => {});
  }
};

await withGame(async (page, info) => {
  const S = new Session(page, info.url);
  await S.setup();
  S.bootMs = await S.fresh();
  log(`booted in ${S.bootMs} ms — running ${selected.length} spec(s)${quick ? ' (quick)' : ''}; stub modules: ${stubs.join(', ') || 'none'}`);
  for (const spec of selected) {
    const ts = Date.now();
    log(`\n▶ ${spec.id} ${spec.title}`);
    const res = await runOne(spec, S);
    const durationSec = +((Date.now() - ts) / 1000).toFixed(1);
    // A failure counts as "pending implementation" when the spec says so, or when its primary owner is still a stub.
    let pending = res.pending ?? null;
    if (pending == null && (res.status === 'fail' || res.status === 'warn') && stubs.includes(spec.owners[0])) pending = `${spec.owners[0]} module is still the gray-box stub`;
    const r = { id: spec.id, title: spec.title, priority: spec.priority, owners: spec.owners, method: spec.method, status: res.status, pending: pending || null,
      details: res.details || '', evidence: res.evidence || [], metrics: res.metrics || null, exception: !!res.exception, partial: !!res.partial,
      durationSec, ranAt: new Date().toISOString(), quick };
    if (res.data !== undefined) r.data = h_save(spec.id, res.data);
    results.push(r);
    const icon = { pass: 'PASS', warn: 'WARN', fail: pending ? 'PEND' : 'FAIL', skip: 'SKIP' }[r.status] || r.status;
    log(`  ${icon} (${durationSec}s) ${String(r.details).slice(0, 300)}`);
    // a spec may have left the page in a weird state; start the next one clean
    try { await S.fresh(); } catch (e) { log('  (page reset failed, reopening)', e.message); }
  }
}, { waitReady: false });

function h_save(id, data) { const p = path.join(QA_DIR, 'data', `${id}.json`); fs.writeFileSync(p, JSON.stringify(data, null, 1)); return path.relative(QA_DIR, p); }

// merge with previous results
const resPath = path.join(QA_DIR, 'results.json');
let prev = null;
try { prev = JSON.parse(fs.readFileSync(resPath, 'utf8')); } catch { /* first run */ }
if (prev && !only.length) fs.writeFileSync(path.join(QA_DIR, 'results.prev.json'), JSON.stringify(prev, null, 1));
const byId = new Map((prev?.specs || []).map((s) => [s.id, s]));
for (const r of results) byId.set(r.id, r);
const order = specs.map((s) => s.id);
const merged = {
  generatedAt: new Date().toISOString(), mode: quick ? 'quick' : 'full', strict, srcHash, gitHead, dirtyModules: dirty, stubs,
  durationSec: Math.round((Date.now() - t0) / 1000), ranIds: results.map((r) => r.id),
  specs: order.map((id) => byId.get(id)).filter(Boolean),
};
fs.writeFileSync(resPath, JSON.stringify(merged, null, 1));
writeReport(merged, only.length ? null : prev, { strict });
const c = (st) => results.filter((r) => r.status === st && !(st === 'fail' && r.pending)).length;
log(`\nDone in ${merged.durationSec}s: ${c('pass')} pass, ${c('warn')} warn, ${c('fail')} fail, ${results.filter((r) => r.pending && r.status === 'fail').length} pending, ${c('skip')} skip → qa/REPORT.md`);
