// Screenshot helper (owner: lead).
//   node tools/shot.mjs                                   → title screen → qa/shots/title.png
//   node tools/shot.mjs --script dev/env/look.js --out qa/shots/env   (script body runs in the page with `qs`, `shot`)
//   options: --w 960 --h 540 --query "lowfx=1&mute=1" --wait 3
// The script may `return` a JSON-able value; it is printed. Console errors and __qs.errors are printed too.
import fs from 'node:fs';
import path from 'node:path';
import { withGame, runPageScript, ROOT } from './browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]?.startsWith('--') ? true : arr[i + 1] ?? true]] : acc), []));
const out = path.resolve(ROOT, args.out || 'qa/shots');
const src = args.script ? fs.readFileSync(path.resolve(ROOT, args.script), 'utf8') : `await new Promise(r => setTimeout(r, ${(+args.wait || 3) * 1000})); await shot('title');`;

const t0 = Date.now();
await withGame(async (page, { logs }) => {
  const { result, saved } = await runPageScript(page, src, out);
  const errors = await page.evaluate(() => window.__qs.errors);
  for (const s of saved) console.log('shot:', path.relative(ROOT, s));
  if (result !== undefined) console.log('result:', JSON.stringify(result, null, 1));
  if (errors.length || logs.length) console.log('console/errors:\n  ' + [...new Set([...errors, ...logs])].join('\n  '));
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}, { width: +args.w || 960, height: +args.h || 540, query: args.query || 'lowfx=1&mute=1' });
