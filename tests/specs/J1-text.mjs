import { click, SEL, uiStart, sleep } from '../lib/session.mjs';
import { getSweep, sweepEndings, verdict, join } from '../lib/common.mjs';

const PLACEHOLDER = /TODO|FIXME|TBD|stub|lorem|placeholder|测试|undefined|NaN|\[object|null\b|xxx/i;
const ALLOWED_LATIN = /^(NEW|OK|PE|QQ|PS|P\.S\.|BGM|LV|HP|VS|CP|ID|Q|A|x|X|AI)$/;
export default {
  id: 'J1', title: 'No placeholder text; all player-facing text in Chinese (typos: manual)', priority: 'P1',
  owners: ['ui', 'story', 'ai', 'world'], timeout: 2400, quickTimeout: 900,
  method: 'Collects player-facing text: DOM text on title, settings, how-to, letter editor, HUD, pause, gallery; every DOM line, `say` line, caption and reveal seen during the ending sweep; ENDINGS titles/subtitles/hints, letter presets, roster names, blackboard text. Flags placeholder patterns (TODO, stub, lorem, 测试, undefined, NaN, [object …], null) and lines with ≥ 3 consecutive Latin letters that are not whitelisted (NEW, P.S., …). Typos need a human read of qa/data/J1.json.',
  async run(page, h) {
    const S = h.S;
    const texts = new Map();
    const add = (src, t) => { for (const l of String(t || '').split('\n')) { const s = l.trim(); if (s) texts.set(s, texts.get(s) || src); } };
    await S.fresh();
    await S.eval(() => window.__qa.step(1));
    add('title', await S.eval(() => window.__qa.uiText()));
    for (const [k, sel, back] of [['settings', SEL.settings, SEL.settingsDone], ['howto', [/^玩法说明$/], [/^知道了$/]], ['gallery', SEL.gallery, SEL.galleryBack]]) {
      if (await click(S, `title.${k}`, sel, { timeout: 4000 })) { await S.eval(() => window.__qa.step(0.6)); add(k, await S.eval(() => window.__qa.uiText())); await click(S, `${k}.back`, back, { timeout: 3000 }); await S.eval(() => window.__qa.step(0.4)); }
    }
    await S.eval(() => window.__qa.pump(true));
    try { await uiStart(S, 'm'); await sleep(800); add('letter', await S.eval(() => window.__qa.uiText())); } catch (e) { add('letter', ''); }
    await S.eval(() => window.__qa.pump(false));
    await S.fresh();
    await S.eval((o) => window.__qa.begin(o), { seed: 33, gender: 'f' });
    await S.eval(() => window.__qa.step(2));
    add('hud', await S.eval(() => window.__qa.uiText()));
    await page.keyboard.press('Escape'); await sleep(300);
    add('pause', await S.eval(() => window.__qa.uiText()));
    await page.keyboard.press('Escape');
    const data = await S.eval(() => { const c = window.__qs.ctx; return { endings: c.story.ENDINGS.flatMap((e) => [e.title, e.subtitle, e.hint]), letters: c.story.letters.flatMap((l) => [l.title, l.text]), names: [...(c.round.roster.students || []).map((s) => s.name), c.round.roster.teacher.name], board: c.world.classroom.blackboard.text }; });
    data.endings.forEach((t) => add('ENDINGS', t)); data.letters.forEach((t) => add('letters', t)); data.names.forEach((t) => add('roster', t)); add('blackboard', String(data.board).replace(/\[\[\w+\]\]/g, ''));
    const sw = await getSweep(h);
    for (const e of sweepEndings(sw)) { const en = e.ending; if (!en) continue; en.lines.forEach((l) => add(`ending:${e.id}`, l)); en.says.forEach((s) => add(`say:${e.id}`, s.text)); en.captions.forEach((c) => add(`caption:${e.id}`, c)); }
    const flagged = [], latin = [];
    for (const [t, src] of texts) {
      if (t.includes('<3') || t.includes('教室第四排')) continue; // the QA custom letter
      if (PLACEHOLDER.test(t)) flagged.push(`[${src}] ${t.slice(0, 60)}`);
      const words = (t.match(/[A-Za-z][A-Za-z.]{2,}/g) || []).filter((w) => !ALLOWED_LATIN.test(w));
      if (words.length) latin.push(`[${src}] ${t.slice(0, 50)} (${words.slice(0, 3).join(',')})`);
    }
    const fails = flagged.length ? [`placeholder-like text: ${join(flagged, 6)}`] : [];
    const warns = latin.length ? [`non-Chinese words: ${join(latin, 6)}`] : [];
    warns.push('typo check needs a human read of qa/data/J1.json');
    return { status: verdict(fails, warns), partial: h.quick, details: `${texts.size} distinct text lines scanned. ${fails.concat(warns).join(' · ')}`, data: { flagged, latin, texts: [...texts].map(([t, s]) => `${s}: ${t}`) } };
  },
};
