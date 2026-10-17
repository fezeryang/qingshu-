import { uiStart, uiWriteLetter, uiCrumple, waitPhase, click, SEL, sleep } from '../lib/session.mjs';
import { verdict, join } from '../lib/common.mjs';

const CUSTOM = '放学后的走廊很长，我想和你一起走完它。';

async function toAim(S, h, label, evidence, intro) {
  const ph = await waitPhase(S, ['intro', 'aim'], 60000);
  if (ph === 'intro') {
    evidence.push(await S._shot(`B1/${label}-intro`));
    await sleep(1500);
    const vp = S.page.viewportSize();
    const t0 = Date.now();
    await S.page.mouse.click(vp.width / 2, vp.height / 2);
    await waitPhase(S, 'aim', 90000);
    intro.push({ label, skipMs: Date.now() - t0 });
  }
  await sleep(800);
  evidence.push(await S._shot(`B1/${label}-aim`));
}

export default {
  id: 'B1', title: 'Real input: title → gender → letter (preset + custom) → hold to crumple → intro → aim', priority: 'P0',
  owners: ['ui', 'story', 'core'], timeout: 900, quickTimeout: 500,
  method: 'Natural real-time mode (rAF loop + SwiftShader rendering), Playwright clicks on visible labels (我是男生/开始/preset title/自己写/写好了), keyboard typing into the textarea, `mouse.down` held until the phase leaves `letter`, one click to skip the intro. Pass 1 uses a preset; then the round is finished (manual fast-forward) and 改写情书 is clicked for pass 2 with custom text. Checks `ctx.round.letter` = exactly what was chosen/typed and phase `aim` with `cam.mode` fp.',
  async run(page, h) {
    const S = await h.S.newSession({ manual: false });
    const fails = [], warns = [], evidence = [], intro = [], passes = [];
    evidence.push(await S._shot('B1/1-title'));
    // pass 1: preset
    await uiStart(S, 'm');
    evidence.push(await S._shot('B1/2-letter'));
    const { preset } = await uiWriteLetter(S, { presetIndex: 0 });
    await uiCrumple(S, { onHold: async () => { await sleep(500); evidence.push(await S._shot('B1/3-crumple')); } });
    await toAim(S, h, 'p1', evidence, intro);
    let st = await S.eval(() => ({ phase: window.__qs.ctx.flow.phase, letter: window.__qs.ctx.round.letter, cam: window.__qs.ctx.cam.mode, gender: window.__qs.ctx.round.playerGender }));
    passes.push({ pass: 'preset', ...st });
    if (st.letter?.text !== preset.text) fails.push(`preset letter mismatch: got "${st.letter?.text}"`);
    if (st.letter?.presetId !== preset.id) warns.push(`presetId ${st.letter?.presetId} ≠ ${preset.id}`);
    if (st.cam !== 'fp') fails.push(`cam ${st.cam} at aim`);
    if (st.gender !== 'm') fails.push(`playerGender ${st.gender} (picked 我是男生)`);
    if (!h.quick) {
      // finish the round fast, then 改写情书 for real
      await S.eval(async () => { window.__qs.manual(true); window.__qs.forceTeacher('writing', 999); window.__qa.freezeWind(true); });
      await S.eval(() => window.__qa.act({ action: 'throw', target: { name: 'floor' } }));
      await S.eval(() => window.__qa.recordEnding({ timeout: 160 }));
      await S.eval(() => window.__qs.manual(false));
      const how = await click(S, 'card.rewrite', SEL.rewrite, { timeout: 15000 });
      if (!how) fails.push('ending card: 改写情书 not found');
      else {
        await waitPhase(S, 'letter', 30000);
        await uiWriteLetter(S, { custom: CUSTOM });
        await uiCrumple(S);
        await toAim(S, h, 'p2', evidence, intro);
        st = await S.eval(() => ({ phase: window.__qs.ctx.flow.phase, letter: window.__qs.ctx.round.letter, cam: window.__qs.ctx.cam.mode }));
        passes.push({ pass: 'custom', ...st });
        if (st.letter?.text !== CUSTOM) fails.push(`custom letter mismatch: got "${st.letter?.text}"`);
      }
    }
    const errs = await S.errors();
    if (errs.length) fails.push(`${errs.length} errors: ${errs[0].slice(0, 150)}`);
    return { status: verdict(fails, warns), partial: h.quick, details: `${passes.map((p) => `${p.pass}: phase ${p.phase}, letter "${String(p.letter?.text).slice(0, 18)}…"`).join('; ')}. Intro skip: ${intro.map((i) => `${i.skipMs} ms`).join(', ') || 'n/a'}. ${join([...fails, ...warns])}`, evidence: evidence.filter(Boolean), data: { passes, intro, selectors: S.selectors } };
  },
};
