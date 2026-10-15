// Static checks + optional headless smoke test (owner: lead).
//   node tools/check.mjs            syntax + rules for all of src/
//   node tools/check.mjs --smoke    also boot the game headless and play one scripted round
// Rules (see docs/TEAM.md):
//   R1  no setTimeout / setInterval / requestAnimationFrame in src/ (use ctx.time) — except src/core/engine.js
//   R2  modules import only from src/core/, three, their own folder (talk to other modules through ctx)
//   R3  no Math.random in src/gameplay, src/ai, src/story unless the line says "// cosmetic"
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, withGame } from './browser.mjs';

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
const files = walk(path.join(ROOT, 'src'));
const problems = [];
for (const f of files) {
  const rel = path.relative(ROOT, f);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { problems.push(`${rel}: syntax error\n${e.stderr}`); continue; }
  const mod = rel.split(path.sep)[1];
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    const code = line.replace(/\/\/.*$/, '');
    if (rel !== path.join('src', 'core', 'engine.js') && /\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/.test(code) && !/allow-timer/.test(line)) problems.push(`${at}: R1 timer — use ctx.time.wait/waitUI/tween/until`);
    if (['gameplay', 'ai', 'story'].includes(mod) && /Math\.random\s*\(/.test(code) && !/cosmetic/.test(line)) problems.push(`${at}: R3 Math.random in gameplay-affecting code — use ctx.rng`);
    const m = code.match(/^\s*import\b.*?from\s+['"]([^'"]+)['"]/) || code.match(/^\s*import\s+['"]([^'"]+)['"]/) || code.match(/import\(\s*['"]([^'"]+)['"]\s*\)/);
    if (m && m[1].startsWith('.')) {
      const target = path.relative(path.join(ROOT, 'src'), path.resolve(path.dirname(f), m[1]));
      const tmod = target.split(path.sep)[0];
      if (rel !== path.join('src', 'main.js') && tmod !== 'core' && tmod !== mod) problems.push(`${at}: R2 cross-module import of ${m[1]} — use ctx instead`);
    }
  });
}
if (problems.length) { console.log(problems.join('\n')); console.log(`\n✗ ${problems.length} problem(s)`); }
else console.log(`✓ static checks passed (${files.length} files)`);

if (process.argv.includes('--smoke')) {
  const t0 = Date.now();
  await withGame(async (page, { logs }) => {
    const res = await page.evaluate(async () => {
      const qs = window.__qs;
      qs.manual(true);
      const out = {};
      await qs.start({ seed: 7, playerGender: 'm', skipIntro: true });
      out.aim = qs.state().phase;
      qs.forceTeacher('writing', 30);
      await qs.throwAt('crush');
      out.ending1 = await qs.runToEnding(90);
      out.landing1 = qs.state().landing;
      await qs.start({ seed: 8, playerGender: 'f', skipIntro: true });
      qs.forceTeacher('watching', 30);
      qs.setSuspicion(0.99);
      qs.ctx.gameplay.aim.charging = true;
      out.ending2 = await qs.runToEnding(60);
      qs.render();
      out.state = qs.state();
      out.errors = qs.errors;
      return out;
    });
    console.log(JSON.stringify(res, null, 1));
    if (logs.length) console.log('console:\n  ' + logs.join('\n  '));
    const ok = res.aim === 'aim' && res.ending1 && res.ending2 && !res.errors.length;
    console.log(ok ? `✓ smoke passed in ${((Date.now() - t0) / 1000).toFixed(0)}s` : '✗ smoke FAILED');
    if (!ok) process.exitCode = 1;
  });
}
if (problems.length) process.exitCode = 1;
