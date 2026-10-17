import { click, SEL, sleep } from '../lib/session.mjs';
import { verdict, join } from '../lib/common.mjs';

export default {
  id: 'E4', title: 'Gallery: unlocks persist across reloads; locked endings show hints; new unlocks show NEW', priority: 'P0',
  owners: ['ui', 'story'], timeout: 600,
  method: 'Fresh browser context (empty localStorage). Play coward (roundSeconds 3) twice: first card must say NEW and `ending:shown.isNew` true, second must not. Reload: `story.gallery.unlocked()` and localStorage `qingshu.endings` still contain it. On the title screen click 结局图鉴 (fallback `ui.gallery()`): the unlocked title is listed and ≥ 90 % of locked endings show their `hint` text; screenshot.',
  async run(page, h) {
    const S = await h.S.newSession({});
    await S.fresh({ clearStorage: true });
    const fails = [], warns = [], evidence = [];
    const play = async (seed) => {
      await S.eval((o) => window.__qa.begin(o), { seed, gender: 'm', ambient: false, roundSeconds: 3, teacher: 'writing' });
      await S.eval(() => window.__qa.act({ action: 'idle', timeout: 20 }));
      const ev0 = await S.eval(() => window.__qa.events.length);
      const end = await S.eval(() => window.__qa.recordEnding({ timeout: 160 }));
      const shown = await S.eval((i) => (window.__qa.events.slice(i).filter((e) => e.type === 'ending:shown').at(-1) || {}).p, ev0);
      return { endingId: end.endingId, card: end.cardText || '', shown };
    };
    const g0 = await S.eval(() => window.__qs.ctx.story.gallery.unlocked());
    const r1 = await play(140);
    evidence.push(await S.shot('E4/card-new'));
    const r2 = await play(141);
    evidence.push(await S.shot('E4/card-repeat'));
    if (g0.length) warns.push(`gallery not empty in a fresh context: ${g0.join(',')}`);
    if (!r1.shown?.isNew) fails.push('first unlock: ending:shown.isNew not true');
    if (!/NEW/i.test(r1.card)) fails.push('first unlock: card shows no "NEW"');
    if (r2.shown?.isNew) fails.push('second time: isNew still true');
    if (/NEW/i.test(r2.card)) fails.push('second time: card still shows NEW');
    // reload → persistence
    await S.fresh({ manual: false });
    const after = await S.eval(() => ({ unlocked: window.__qs.ctx.story.gallery.unlocked(), raw: localStorage.getItem('qingshu.endings'), endings: window.__qs.ctx.story.ENDINGS.map((e) => ({ id: e.id, title: e.title, hint: e.hint })) }));
    if (!after.unlocked.includes(r1.endingId)) fails.push(`after reload, unlocked() = ${JSON.stringify(after.unlocked)} (lost ${r1.endingId})`);
    if (!after.raw || !after.raw.includes(r1.endingId)) warns.push(`localStorage qingshu.endings = ${after.raw}`);
    await S.page.waitForFunction(() => window.__qs.ctx.flow.phase === 'title', null, { timeout: 30000 });
    let via = await click(S, 'title.gallery', SEL.gallery, { timeout: 8000 });
    if (!via) { via = 'ui.gallery()'; await S.eval(() => { window.__qs.ctx.ui.gallery(); }); }
    await sleep(1500);
    const text = await S.eval(() => window.__qa.uiText());
    evidence.push(await S._shot('E4/gallery'));
    const norm = (s) => String(s || '').replace(/\s/g, '');
    const nt = norm(text);
    const locked = after.endings.filter((e) => !after.unlocked.includes(e.id));
    const hintsShown = locked.filter((e) => nt.includes(norm(e.hint)));
    const titleShown = after.endings.filter((e) => after.unlocked.includes(e.id)).every((e) => nt.includes(norm(e.title)) || nt.includes(norm(e.title.split('·').pop())));
    if (!titleShown) fails.push('gallery does not show the unlocked ending\'s title');
    if (hintsShown.length < Math.ceil(locked.length * 0.9)) fails.push(`only ${hintsShown.length}/${locked.length} locked hints shown (missing: ${join(locked.filter((e) => !hintsShown.includes(e)).map((e) => e.hint), 3)})`);
    const lockedTitles = locked.filter((e) => nt.includes(norm(e.title)));
    if (lockedTitles.length) warns.push(`locked endings reveal their titles: ${lockedTitles.map((e) => e.id).join(', ')}`);
    await S.page.keyboard.press('Escape').catch(() => {});
    return { status: verdict(fails, warns), details: `first card isNew=${r1.shown?.isNew} NEW-text=${/NEW/i.test(r1.card)}; repeat isNew=${r2.shown?.isNew}; after reload unlocked=${JSON.stringify(after.unlocked)}; gallery via ${via}: ${hintsShown.length}/${locked.length} hints. ${fails.concat(warns).join('; ')}`, evidence: evidence.filter(Boolean), data: { r1, r2, after, selectors: S.selectors } };
  },
};
