// Offline validation of the published classroom voice pack.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as lines from '../../src/ai/lines.js';
import { STUDENTS } from '../../src/story/roster.js';

const root = new URL('../../', import.meta.url);
const dir = new URL('assets/voices/', root);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', dir), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(new URL('tools/voices/lines.json', root), 'utf8'));
const covered = (key, text) => assert.ok(manifest.lines[key]?.[text], `Missing ${key}: ${text}`);
for (const line of catalog.lines) if (line.speech) covered(line.key, line.text);
for (const student of STUDENTS) {
  for (const answer of [...lines.ANSWER_GOOD, ...lines.ANSWER_BAD]) covered(student.id, answer);
  for (const question of lines.CALL_ON) covered('teacher', question.replace('{name}', student.name));
}
for (let i = 0; i < 8; i++) covered(`ritual:chorus${i}`, '老——师——好——');
for (const [hash, duration] of Object.entries(manifest.durations)) {
  assert.match(hash, /^[a-f0-9]{16}$/);
  assert.ok(duration > 0 && Number.isFinite(duration), `Invalid duration: ${hash}`);
  assert.ok(fs.statSync(new URL(`${hash}.mp3`, dir)).size > 500, `Empty clip: ${hash}`);
}
const bytes = fs.readdirSync(dir).reduce((sum, name) => sum + fs.statSync(new URL(name, dir)).size, 0);
assert.ok(bytes <= 6 * 1024 * 1024, `Voice pack exceeds 6 MB: ${bytes}`);
console.log(JSON.stringify({ pass: true, lines: catalog.lines.length, clips: Object.keys(manifest.durations).length,
  bytes, manifest: fileURLToPath(new URL('manifest.json', dir)) }));
