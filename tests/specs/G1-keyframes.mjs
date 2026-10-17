import { uiStart, uiWriteLetter, waitPhase, click, SEL, sleep } from '../lib/session.mjs';
import { getSweep, sweepEndings, verdict } from '../lib/common.mjs';

export default {
  id: 'G1', title: 'Key-frame screenshots for visual review (title … gallery, endings, phone, normal mode)', priority: 'P0',
  owners: ['world', 'characters', 'ui', 'camera', 'story'], quick: false, timeout: 1500,
  method: 'Drives one round with real UI input and manual time, saving qa/shots/keyframes/*.png: title, letter editor, crumple (mouse held), intro, aim, charging, flight ×3 (launch / apex / descent), landing, settings, gallery, pause; phone 360×640 title/aim/card; normal (non-lowfx) title/aim. Ending frames (+1.5 s, +5 s, card) come from the sweep (qa/shots/endings/). Automatic check: no blank frame (luminance/contrast); the 1–5 scoring per ACCEPTANCE G is done by eye in mode 2.',
  async run(page, h) {
    const S = h.S;
    const shots = [];
    const snap = async (s, name) => { await sleep(1000); const a = await s.analyze(`keyframes/${name}`); shots.push({ name, file: a.file, lum: a.lum, stdev: a.stdev }); return a; };
    const step = (s, t) => s.eval((x) => window.__qa.step(x), t);
    await S.fresh();
    await step(S, 1.5);
    await snap(S, '01-title');
    await S.eval(() => window.__qa.pump(true));
    await uiStart(S, 'f');
    await uiWriteLetter(S, { presetIndex: 1 }).catch(() => {});
    await S.eval(() => window.__qa.pump(false));
    await step(S, 0.3);
    await snap(S, '02-letter');
    // crumple with the mouse held; screenshot mid-hold
    const vp = page.viewportSize();
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.down();
    await step(S, 0.5);
    await snap(S, '03-crumple');
    await S.eval(() => window.__qa.stepUntil(() => window.__qs.ctx.flow.phase !== 'letter', 10));
    await page.mouse.up();
    if ((await S.phase()) === 'intro') { await step(S, 1.8); await snap(S, '04-intro'); }
    await S.eval(() => window.__qa.stepUntil(() => window.__qs.ctx.flow.phase === 'aim', 20));
    await S.eval(() => { window.__qs.forceTeacher('writing', 999); window.__qa.freezeWind(true); window.__qs.ctx.ai.students.setAmbient(true); });
    await step(S, 1);
    await snap(S, '05-aim');
    await page.mouse.move(vp.width / 2, vp.height * 0.25);
    await page.mouse.down();
    await step(S, 0.8);
    await snap(S, '06-charge');
    await page.keyboard.down('Space');
    await step(S, 0.1);
    await page.mouse.up();
    await page.keyboard.up('Space');
    await step(S, 0.2);
    await S.eval(() => { const s = window.__qa.solve({ pick: 'crush' }); if (s.sol) window.__qs.ctx.gameplay.launch(s.sol); else { const t = window.__qa.solve({ name: 'r1c2' }); window.__qs.ctx.gameplay.launch(t.sol); } });
    await step(S, 0.12);
    await snap(S, '07-flight-launch');
    await S.eval(() => { const b = window.__qs.ctx.gameplay.ball; return window.__qa.stepUntil(() => b.vel.y < 0 || b.state !== 'flying', 4); });
    await snap(S, '08-flight-apex');
    await S.eval(() => { const b = window.__qs.ctx.gameplay.ball; return window.__qa.stepUntil(() => b.pos.y < 1.3 || b.state !== 'flying', 6); });
    await snap(S, '09-flight-descent');
    await S.eval(() => window.__qa.stepUntil(() => window.__qs.ctx.flow.phase !== 'flight', 10));
    await step(S, 0.3);
    await snap(S, '10-landing');
    await S.eval(() => window.__qa.recordEnding({ timeout: 160 }));
    await S.eval(async () => { window.__qs.cardChoice('title'); await window.__qa.stepUntil(() => window.__qs.ctx.flow.phase === 'title', 10); await window.__qa.step(0.5); });
    if (await click(S, 'title.settings', SEL.settings, { timeout: 5000 })) { await step(S, 0.6); await snap(S, '11-settings'); await click(S, 'settings.done', SEL.settingsDone, { timeout: 3000 }); await step(S, 0.4); }
    if (await click(S, 'title.gallery', SEL.gallery, { timeout: 5000 })) { await step(S, 0.8); await snap(S, '12-gallery'); await click(S, 'gallery.back', SEL.galleryBack, { timeout: 3000 }); }
    await S.eval((o) => window.__qa.begin(o), { seed: 77, gender: 'm', teacher: 'writing' });
    await page.keyboard.press('Escape');
    await sleep(300);
    await snap(S, '13-pause');
    // phone
    const M = await h.S.newSession({ width: 360, height: 640, hasTouch: true });
    await M.eval(() => window.__qa.step(1.5));
    await snap(M, '14-phone-title');
    await M.eval((o) => window.__qa.begin(o), { seed: 78, gender: 'f', teacher: 'writing' });
    await M.eval(() => window.__qa.step(1));
    await snap(M, '15-phone-aim');
    await M.eval(() => window.__qa.act({ action: 'throw', target: { pick: 'crush' } }));
    await M.eval(() => window.__qa.recordEnding({ timeout: 160 }));
    await snap(M, '16-phone-card');
    await M.context.close();
    // normal quality
    const N = await h.S.newSession({ query: 'mute=1' });
    await N.eval(() => window.__qa.step(1.5));
    await snap(N, '17-normal-title');
    await N.eval((o) => window.__qa.begin(o), { seed: 79, gender: 'm', teacher: 'writing' });
    await N.eval(() => window.__qa.step(1));
    await snap(N, '18-normal-aim');
    await N.context.close();
    // ending frames from the sweep
    const sw = await getSweep(h);
    const endingShots = sweepEndings(sw).flatMap((e) => [...(e.ending?.shots || []), e.ending?.cardShot].filter(Boolean));
    const blank = shots.filter((s) => s.lum < 8 || s.stdev < 3);
    const fails = blank.map((s) => `${s.name} looks blank (lum ${s.lum}, stdev ${s.stdev})`);
    const missingEnd = sweepEndings(sw).filter((e) => !e.ending?.shots?.length).map((e) => e.id);
    const warns = [`${shots.length} key frames + ${endingShots.length} ending frames saved — awaiting visual scoring (mode 2)`];
    if (missingEnd.length) warns.push(`no ending frames for: ${missingEnd.join(', ')}`);
    return { status: verdict(fails, warns), details: `${fails.concat(warns).join('; ')}`, evidence: shots.map((s) => s.file).slice(0, 18), data: { shots, endingShots, selectors: S.selectors } };
  },
};
