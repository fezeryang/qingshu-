import { click, SEL, sleep } from '../lib/session.mjs';
import { verdict } from '../lib/common.mjs';

export default {
  id: 'H3', title: 'Master volume 0 = total silence; settings persist', priority: 'P1',
  owners: ['audio', 'ui'], timeout: 400,
  method: 'Unmuted page. Every connection to the AudioContext destination is routed through a QA analyser (installed before boot). Title → 设置 → the 主音量 slider is set to 0 with a real fill → sfx("ding") + sfx("bell") + title music → peak at the destination must be < 1e-4 over 0.6 s. Sanity: at 0.8 the same sounds must be audible (peak > 1e-3), otherwise the measurement is inconclusive. Reload → `ctx.settings.masterVolume` and localStorage `qingshu.settings` keep 0. Also `?mute=1` boot must be silent and must not persist: reloading the same profile without mute=1 must restore audible volume.',
  async run(page, h) {
    const S = await h.S.newSession({ query: 'lowfx=1', manual: false });
    const fails = [], warns = [];
    await S.page.waitForFunction(() => window.__qs.ctx.flow.phase === 'title', null, { timeout: 60000 });
    await S.page.mouse.click(5, 5);
    const play = () => S.eval(async () => { const a = window.__qs.ctx.audio; a.sfx('ding'); a.sfx('bell'); const l = await window.__qa.audioLevel(600); return { ...l, mv: window.__qs.ctx.settings.masterVolume }; });
    const start = await S.eval(() => ({ mv: window.__qs.ctx.settings.masterVolume, raw: localStorage.getItem('qingshu.settings') }));
    await sleep(800);
    let loud = await play();
    for (let i = 0; i < 2 && !(loud.peak > 1e-3); i++) { await sleep(700); loud = await play(); }
    let via = await click(S, 'title.settings', SEL.settings, { timeout: 8000 });
    let setVia = 'ui slider';
    if (via) {
      await sleep(600);
      const slider = S.page.getByRole('slider', { name: /主音量/ });
      if (await slider.count()) { await slider.first().fill('0'); S.used('settings.master', 'role=slider name=/主音量/'); }
      else { const r = S.page.locator('input[type=range]').first(); if (await r.count()) { await r.fill('0'); S.used('settings.master', 'css=input[type=range]:first'); } else setVia = null; }
      await click(S, 'settings.done', SEL.settingsDone, { timeout: 3000 });
    }
    if (!via || !setVia) { setVia = 'applySettings()'; warns.push('settings UI/slider not found; used ctx.audio.applySettings'); await S.eval(() => { const c = window.__qs.ctx; c.settings.masterVolume = 0; c.audio.applySettings(c.settings); }); }
    await sleep(400);
    const silent = await play();
    const persisted = await S.eval(() => ({ mv: window.__qs.ctx.settings.masterVolume, raw: localStorage.getItem('qingshu.settings') }));
    await S.fresh({ query: 'lowfx=1', manual: false });
    const afterReload = await S.eval(() => ({ mv: window.__qs.ctx.settings.masterVolume, raw: localStorage.getItem('qingshu.settings') }));
    await S.page.mouse.click(5, 5);
    const silentAfterReload = await play();
    const M = await h.S.newSession({ query: 'lowfx=1&mute=1', manual: false });
    await M.page.mouse.click(5, 5);
    const muted = await M.eval(async () => { const a = window.__qs.ctx.audio; a.unlock?.(); a.sfx('ding'); a.music?.('title'); return window.__qa.audioLevel(600); });
    await sleep(500);
    await M.fresh({ query: 'lowfx=1', manual: false });
    const afterMute = await M.eval(() => ({ mv: window.__qs.ctx.settings.masterVolume, raw: localStorage.getItem('qingshu.settings') }));
    if (!loud.analysers) fails.push('no audio graph reached the destination (no AudioContext / nothing connected)');
    else if (!(loud.peak > 1e-3)) warns.push(`sanity check inconclusive: peak ${loud.peak} at default volume`);
    if (silent.peak > 1e-4) fails.push(`master 0 (via ${setVia}) still outputs peak ${silent.peak.toFixed(5)}`);
    if (afterReload.mv !== 0) fails.push(`after reload masterVolume = ${afterReload.mv} (stored: ${afterReload.raw})`);
    if (silentAfterReload.peak > 1e-4) fails.push(`after reload with master 0, peak ${silentAfterReload.peak.toFixed(5)}`);
    if (muted.peak > 1e-4) fails.push(`?mute=1 boot outputs peak ${muted.peak.toFixed(5)}`);
    if (afterMute.mv === 0) fails.push('?mute=1 is persisted: a later load without mute=1 in the same profile still has masterVolume 0 (BUG-002)');
    return { status: verdict(fails, warns), details: `start masterVolume ${start.mv}; peak default ${loud.peak?.toFixed?.(4)}, master 0 ${silent.peak?.toFixed?.(6)}, after reload ${silentAfterReload.peak?.toFixed?.(6)} (masterVolume ${afterReload.mv}), ?mute=1 ${muted.peak?.toFixed?.(6)}, masterVolume after a mute boot + normal reload ${afterMute.mv}; set via ${setVia}. ${fails.concat(warns).join('; ')}`, data: { start, loud, silent, persisted, afterReload, silentAfterReload, muted, afterMute, selectors: S.selectors } };
  },
};
