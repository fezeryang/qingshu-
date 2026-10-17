// Shared audio session for H1/H2 (owner: qs-qa-lead): one unmuted round played through the real UI.
import { uiStart, uiWriteLetter, uiCrumple, waitPhase, sleep } from './session.mjs';

export function getAudioSession(h) {
  return h.memo('audio', async (S0) => {
    const S = await S0.newSession({ query: 'lowfx=1', manual: false });
    const out = { steps: [] };
    try {
      await S.page.waitForFunction(() => window.__qs.ctx.flow.phase === 'title', null, { timeout: 60000 });
      await sleep(1500);
      out.beforeClick = await S.eval(() => ({ contexts: window.__qa.audioContexts.map((c) => c.state), music: window.__qs.ctx.audio.debug.music }));
      await S.eval(() => {
        const c = window.__qs.ctx; window.__qa.musicByPhase = []; let last = '';
        window.__qa.samplers.set('music', () => { const k = `${c.flow.phase}:${c.audio.debug.music}`; if (k !== last) { last = k; window.__qa.musicByPhase.push({ phase: c.flow.phase, music: c.audio.debug.music, t: c.time.uiNow }); } });
      });
      await S.eval(() => window.__qa.pump(true));
      await uiStart(S, 'm');
      await sleep(400);
      out.afterClick = await S.eval(() => ({ contexts: window.__qa.audioContexts.map((c) => c.state), music: window.__qs.ctx.audio.debug.music }));
      await uiWriteLetter(S, { presetIndex: 2 });
      await uiCrumple(S);
      await waitPhase(S, ['intro', 'aim'], 30000);
      await S.eval(() => window.__qa.pump(false));
      out.levelIntro = await S.eval(() => window.__qa.audioLevel(300));
      await S.eval(async () => {
        const c = window.__qs.ctx; const qs = window.__qs; const qa = window.__qa;
        await qa.stepUntil(() => c.flow.phase === 'aim', 30);
        await qa.step(1.5);
        qa.freezeWind(true);
        qs.forceTeacher('writing', 999); await qa.step(1);
        qs.forceTeacher('warning', 0.7); await qa.step(0.8);
        qs.forceTeacher('watching', 999); await qa.step(1);
        qs.forceTeacher('writing', 999); await qa.step(0.5);
        c.input.simulate({ down: 'Mouse0' }); await qa.step(1.2);
        const s = qa.solve({ pick: 'crush' });
        c.gameplay.launch(s.sol || qa.solve({ name: 'r2c2' }).sol);
        c.input.simulate({ up: 'Mouse0' });
        await qa.stepUntil(() => c.flow.phase !== 'flight', 15);
        await qa.step(0.5);
      });
      out.levelEnding = await S.eval(() => window.__qa.audioLevel(300));
      await S.eval(() => window.__qa.stepUntil(() => window.__qs.ctx.flow.phase === 'card', 80));
      out.final = await S.eval(() => ({ musicByPhase: window.__qa.musicByPhase, audioLog: window.__qa.audioLog.map((a) => a.e), sfxCalls: window.__qa.calls.filter((c) => c.api === 'audio.sfx' || c.api === 'audio.loop').map((c) => c.args[0]), musicCalls: window.__qa.calls.filter((c) => c.api === 'audio.music').map((c) => c.args[0]), endingId: window.__qs.ctx.round.endingId, recentSample: (window.__qs.ctx.audio.debug.recent || []).slice(-5).map((e) => window.__qa.str(e)), errors: window.__qs.errors.slice() }));
    } catch (e) { out.error = String(e.message || e); }
    await S.context.close();
    return out;
  });
}
