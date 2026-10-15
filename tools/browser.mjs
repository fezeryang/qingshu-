// Shared headless-browser helper (owner: lead). Used by tools/shot.mjs, tools/check.mjs and tests/.
//
// - Starts a private static server on a random port (no port clashes between agents).
// - Limits concurrent Chromium instances machine-wide (MAX_BROWSERS lock slots) — this box has ~6 GB RAM,
//   so never launch browsers any other way.
// - Headless Chromium uses SwiftShader (software WebGL): rendering is SLOW. Drive the game with
//   __qs.manual(true) + __qs.advance() and only call __qs.render() right before a screenshot.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MAX_BROWSERS = 2;
const LOCK_DIR = path.join(os.tmpdir(), 'qingshu-browser-locks');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function acquire() {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  for (let waited = 0; ; waited += 500) {
    for (let i = 0; i < MAX_BROWSERS; i++) {
      const f = path.join(LOCK_DIR, `slot${i}.lock`);
      try {
        const fd = fs.openSync(f, 'wx'); fs.writeSync(fd, String(process.pid)); fs.closeSync(fd);
        return () => { try { fs.unlinkSync(f); } catch { /* gone */ } };
      } catch {
        const pid = +fs.readFileSync(f, 'utf8').trim() || 0;
        if (pid && !alive(pid)) { try { fs.unlinkSync(f); } catch { /* raced */ } }
      }
    }
    if (waited && waited % 10000 === 0) console.error(`[browser] waiting for a free browser slot (${waited / 1000}s)…`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Open the game in headless Chromium and run fn(page, info). info.logs collects console output.
 * @param {(page: import('playwright').Page, info: {logs: string[], url: string}) => Promise<any>} fn
 * @param {{width?: number, height?: number, query?: string, waitReady?: boolean}} opts
 */
export async function withGame(fn, opts = {}) {
  const { width = 960, height = 540, query = 'lowfx=1&mute=1', waitReady = true } = opts;
  const release = await acquire();
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/?${query}`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const logs = [];
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(120000);
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto(url);
    if (waitReady) await page.waitForFunction(() => window.__qs?.ready === true, null, { timeout: 120000 });
    return await fn(page, { logs, url });
  } finally {
    await browser.close().catch(() => {});
    server.close();
    release();
  }
}

/** Run an async script body inside the page with (qs, shot) in scope. shot(name) saves <outDir>/<name>.png. */
export async function runPageScript(page, src, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const saved = [];
  await page.exposeFunction('__shot', async (name) => {
    const p = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: p });
    saved.push(p);
    return p;
  });
  const result = await page.evaluate(async (body) => {
    const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFn('qs', 'shot', body);
    return await fn(window.__qs, async (name) => { window.__qs.render(); await new Promise((r) => requestAnimationFrame(() => r())); return window.__shot(name); });
  }, src);
  return { result, saved };
}
