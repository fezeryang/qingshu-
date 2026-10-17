// Node-side test session (owner: qs-qa-lead). Wraps one Playwright page from tools/browser.mjs withGame():
// injects tests/lib/harness.page.js, exposes __qaShot(name) for screenshots, collects console output,
// and offers fresh()/eval()/shot()/analyze() helpers. Extra pages are opened as new contexts in the SAME
// browser, so the whole run uses one slot of the machine-wide browser lock.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/browser.mjs';

export const QA_DIR = path.join(ROOT, 'qa');
export const SHOTS_DIR = path.join(QA_DIR, 'shots');
const HARNESS = path.join(ROOT, 'tests', 'lib', 'harness.page.js');
export const DEFAULT_QUERY = 'lowfx=1&mute=1';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rel = (p) => path.relative(ROOT, p);

export class Session {
  constructor(page, baseUrl, { owned = false } = {}) {
    this.page = page;
    this.base = baseUrl.split('?')[0];
    this.logs = [];
    this.logMark = 0;
    this.shots = [];
    this.selectors = {};
    this.owned = owned;
    this.children = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') this.logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
    page.on('pageerror', (e) => this.logs.push(`[pageerror] ${String(e.message).slice(0, 400)}`));
  }

  async setup() {
    await this.page.addInitScript({ path: HARNESS });
    await this.page.exposeFunction('__qaShot', (name) => this._shot(name));
  }

  /** Navigate (or reload) to a fresh game. Returns boot time in ms (navigation → __qs.ready). */
  async fresh({ query = DEFAULT_QUERY, manual = true, clearStorage = false } = {}) {
    const url = `${this.base}?${query}`;
    if (clearStorage) {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await this.page.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });
    }
    const t0 = Date.now();
    await this.page.goto(url);
    await this.page.waitForFunction(() => window.__qs?.ready === true, null, { timeout: 180000 });
    const bootMs = Date.now() - t0;
    await this.page.evaluate((m) => { window.__qa.init(); if (m) window.__qs.manual(true); }, manual);
    this.logMark = this.logs.length;
    return bootMs;
  }

  eval(fn, arg) { return this.page.evaluate(fn, arg); }
  phase() { return this.page.evaluate(() => window.__qs.ctx.flow.phase); }
  state() { return this.page.evaluate(() => window.__qs.state()); }
  errors() { return this.page.evaluate(() => window.__qs.errors.slice()); }
  logsSince(mark = this.logMark) { return this.logs.slice(mark); }
  errorLogs(mark = this.logMark) { return this.logs.slice(mark).filter((l) => !l.startsWith('[warning]')); }

  async _shot(name) {
    const p = path.join(SHOTS_DIR, `${name}.png`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await this.page.screenshot({ path: p });
    this.shots.push(rel(p));
    return rel(p);
  }
  /** Render one frame (manual mode) and screenshot it. */
  async shot(name) {
    await this.page.evaluate(async () => { window.__qs.render(); await new Promise((r) => requestAnimationFrame(() => r())); });
    return this._shot(name);
  }
  /** Screenshot (composited, DOM included) and analyse it in the page. Saves it when `name` is given. */
  async analyze(name = null, { render = true } = {}) {
    if (render) await this.page.evaluate(async () => { window.__qs.render(); await new Promise((r) => requestAnimationFrame(() => r())); });
    let buf;
    if (name) { const p = path.join(SHOTS_DIR, `${name}.png`); fs.mkdirSync(path.dirname(p), { recursive: true }); buf = await this.page.screenshot({ path: p }); this.shots.push(rel(p)); }
    else buf = await this.page.screenshot();
    const stats = await this.page.evaluate((b64) => window.__qa.analyzePng(b64), buf.toString('base64'));
    if (name) stats.file = rel(path.join(SHOTS_DIR, `${name}.png`));
    return stats;
  }

  /** A second page in its own browser context (isolated storage), same browser and server. */
  async newSession({ width = 960, height = 540, query = DEFAULT_QUERY, manual = true, hasTouch = false } = {}) {
    const browser = this.page.context().browser();
    const context = await browser.newContext({ viewport: { width, height }, hasTouch });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    const s = new Session(page, this.base, { owned: true });
    s.context = context;
    await s.setup();
    s.bootMs = await s.fresh({ query, manual });
    this.children.push(s);
    return s;
  }
  async closeChildren() {
    for (const c of this.children) await c.context?.close().catch(() => {});
    this.children = [];
  }
  used(key, how) { this.selectors[key] = how; }
}

// ------------------------------------------------------------------ UI drivers (real input)
/** Visible-text selectors, most specific first. Documented in tests/README.md. */
export const SEL = {
  male: [/^我是男生$/, /我是\s*男生/, /男生/],
  female: [/^我是女生$/, /我是\s*女生/, /女生/],
  start: [/^开始$/, /开始游戏/, /^开始/],
  confirmLetter: [/^写好了$/, /写好了/, /^完成$/, /确定/],
  customTab: [/^自己写$/, /自己写/],
  crumpleHint: [/按住鼠标/, /揉成一团/],
  retry: [/^再来一局$/, /再来一局/],
  rewrite: [/^改写情书$/, /改写情书/],
  title: [/^回到标题$/, /回到标题/],
  gallery: [/^结局图鉴/, /结局图鉴/, /图鉴/],
  galleryBack: [/^返回$/],
  settings: [/^设置$/],
  settingsDone: [/^完成$/],
  resume: [/^继续$/, /继续/],
};

async function firstVisible(loc) {
  const n = Math.min(await loc.count().catch(() => 0), 8);
  for (let i = 0; i < n; i++) { const l = loc.nth(i); if (await l.isVisible().catch(() => false)) return l; }
  return null;
}
/** Find the first visible element matching one of the patterns (button role first, then text, then css). */
export async function findVisible(page, patterns, { timeout = 8000, css = [] } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const re of patterns) {
      let l = await firstVisible(page.getByRole('button', { name: re }));
      if (l) return { loc: l, how: `role=button name=${re}` };
      l = await firstVisible(page.getByText(re));
      if (l) return { loc: l, how: `text=${re}` };
    }
    for (const sel of css) { const l = await firstVisible(page.locator(sel)); if (l) return { loc: l, how: `css=${sel}` }; }
    if (Date.now() > deadline) return null;
    await sleep(200);
  }
}
export async function click(S, key, patterns, opts = {}) {
  const f = await findVisible(S.page, patterns, opts);
  if (!f) return null;
  await f.loc.click({ timeout: opts.clickTimeout ?? 15000 });
  S.used(key, f.how);
  return f.how;
}
export async function waitPhase(S, phases, timeoutMs = 60000) {
  const list = [].concat(phases);
  await S.page.waitForFunction((l) => l.includes(window.__qs.ctx.flow.phase), list, { timeout: timeoutMs, polling: 100 });
  return S.phase();
}
/** Title → (gender) → 开始 → letter phase. Game must be ticking (natural mode or __qa.pump). */
export async function uiStart(S, gender = 'm') {
  const how = await click(S, `title.${gender === 'f' ? 'female' : 'male'}`, gender === 'f' ? SEL.female : SEL.male, { timeout: 15000 });
  if (!how) throw new Error('title: gender button not found');
  await sleep(300);
  if ((await S.phase()) === 'title') {
    const st = await click(S, 'title.start', SEL.start, { timeout: 8000 });
    if (!st) throw new Error('title: start button not found');
  }
  return waitPhase(S, ['letter', 'intro', 'aim'], 30000);
}
/** Letter editor: preset (by preset title) or custom text in the textarea, then 写好了. */
export async function uiWriteLetter(S, { custom = null, presetIndex = 0 } = {}) {
  const letters = await S.eval(() => window.__qs.ctx.story.letters.map((l) => ({ id: l.id, title: l.title, text: l.text })));
  const page = S.page;
  if (custom != null) {
    let box = await findVisible(page, [], { css: ['textarea', '[contenteditable="true"]', 'input[type="text"]'], timeout: 1500 });
    if (!box) { await click(S, 'letter.customTab', SEL.customTab, { timeout: 5000 }); box = await findVisible(page, [], { css: ['textarea', '[contenteditable="true"]', 'input[type="text"]'], timeout: 5000 }); }
    if (!box) throw new Error('letter: no text box for a custom letter');
    S.used('letter.textbox', box.how);
    await box.loc.click();
    await box.loc.fill('');
    await page.keyboard.type(custom, { delay: 5 });
  } else {
    const p = letters[presetIndex];
    const esc = p.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const how = await click(S, 'letter.preset', [new RegExp(`^${esc}$`), new RegExp(esc)], { timeout: 15000 });
    if (!how) throw new Error(`letter: preset "${p.title}" not found`);
  }
  await sleep(200);
  if ((await S.phase()) === 'letter') await click(S, 'letter.confirm', SEL.confirmLetter, { timeout: 5000 });
  return { letters, preset: custom == null ? letters[presetIndex] : null };
}
/** Crumple: hold the mouse (centre of the screen first, then the hint) until the phase leaves `letter`. */
export async function uiCrumple(S, { maxMs = 30000, onHold = null } = {}) {
  const page = S.page;
  const vp = page.viewportSize();
  const t0 = Date.now();
  const tries = [{ x: vp.width / 2, y: vp.height / 2, how: 'hold@centre' }];
  const hint = await findVisible(page, SEL.crumpleHint, { timeout: 1500 });
  if (hint) { const b = await hint.loc.boundingBox(); if (b) tries.push({ x: b.x + b.width / 2, y: b.y + b.height / 2, how: `hold@${hint.how}` }); }
  for (const t of tries) {
    await page.mouse.move(t.x, t.y);
    await page.mouse.down();
    if (onHold) await onHold();
    const end = Date.now() + maxMs / tries.length;
    let ph = await S.phase();
    while (ph === 'letter' && Date.now() < end) { await sleep(150); ph = await S.phase(); }
    await page.mouse.up();
    if (ph !== 'letter') { S.used('crumple', t.how); return { phase: ph, heldMs: Date.now() - t0, how: t.how }; }
  }
  throw new Error('crumple: phase never left `letter` while holding the mouse');
}
