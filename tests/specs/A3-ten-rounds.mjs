import { click, SEL, uiWriteLetter, uiCrumple, waitPhase } from '../lib/session.mjs';
import { verdict, join } from '../lib/common.mjs';

const TARGETS = [{ pick: 'crush' }, { name: 'floor' }, { name: 'trash' }];
const PLAN = ['start', 'retry', 'rewrite', 'title', 'retry', 'rewrite', 'title', 'retry', 'rewrite', 'title'];

async function choose(S, choice, key) {
  await S.eval(async (c) => { window.__qs.cardChoice(c); await window.__qa.step(0.25); }, choice);
  if ((await S.phase()) === 'card') { await click(S, `card.${choice}`, SEL[key], { timeout: 6000 }); await S.eval(() => window.__qa.step(0.25)); }
}

export default {
  id: 'A3', title: '10 consecutive rounds (retry / rewrite / title) without crash; GPU memory plateaus after round 3', priority: 'P0',
  owners: ['core', 'story', 'world', 'characters', 'ui', 'camera'], timeout: 1800, quickTimeout: 600,
  method: 'One page, 10 rounds: start → retry → rewrite (real UI: preset tab + 写好了 + hold-to-crumple) → title → … Each round throws at crush / floor / trash in turn (perfect, lost, three_pointer sets) and plays to the card. At every card: `renderer.info.memory`, JS heap, errors. Endings are rendered every 1.5 s so `renderer.info.memory` sees real uploads. Leak check: 4 of the rounds are then replayed twice with identical seed + target (content already uploaded); geometries/textures must not grow between the two replay passes (tolerance 2). First-use growth (new characters\' faces, lazily built sets) is reported but not a failure.',
  async run(page, h) {
    const S = h.S;
    const plan = h.quick ? PLAN.slice(0, 4) : PLAN;
    const rounds = [], fails = [], warns0 = [];
    let seed = 300;
    for (let i = 0; i < plan.length; i++) {
      const via = plan[i];
      const r = { round: i + 1, via };
      try {
        if (via === 'start') await S.eval((o) => window.__qa.begin(o), { seed: seed++, gender: i % 2 ? 'f' : 'm', ambient: false, roundSeconds: 300 });
        else if (via === 'retry') { await choose(S, 'retry', 'retry'); await S.eval(() => window.__qa.stepUntil(() => window.__qs.ctx.flow.phase === 'aim', 45)); }
        else if (via === 'rewrite') {
          await choose(S, 'rewrite', 'rewrite');
          await S.eval(() => window.__qa.stepUntil(() => window.__qs.ctx.flow.phase === 'letter', 10));
          await S.eval(() => window.__qa.pump(true));
          try {
            await uiWriteLetter(S, { presetIndex: i % 3 });
            await uiCrumple(S);
            await waitPhase(S, ['intro', 'aim'], 30000);
          } finally { await S.eval(() => window.__qa.pump(false)); }
          await S.eval(() => window.__qa.stepUntil(() => window.__qs.ctx.flow.phase === 'aim', 45));
        } else if (via === 'title') {
          await choose(S, 'title', 'title');
          await S.eval(() => window.__qa.stepUntil(() => window.__qs.ctx.flow.phase === 'title', 10));
          await S.eval((o) => window.__qa.begin(o), { seed: seed++, gender: 'm', ambient: false, roundSeconds: 300 });
        }
        r.phaseAtStart = await S.phase();
        if (r.phaseAtStart !== 'aim') throw new Error(`expected aim after ${via}, got ${r.phaseAtStart}`);
        await S.eval(() => { window.__qs.forceTeacher('writing', 999); window.__qs.setSuspicion(0); window.__qa.freezeWind(true); });
        let act = await S.eval((o) => window.__qa.act(o), { action: 'throw', target: TARGETS[i % 3] });
        if (act.error) { r.unsolvable = `${act.label}: ${act.error} (seed ${await S.eval(() => window.__qs.ctx.round.seed)})`; act = await S.eval((o) => window.__qa.act(o), { action: 'throw', target: { name: 'floor' } }); }
        const end = await S.eval(() => window.__qa.recordEnding({ timeout: 160, thumbEvery: 1.5 }));
        r.seed = await S.eval(() => window.__qs.ctx.round.seed);
        Object.assign(r, { target: act.label, landing: act.landing?.type, endingId: end.endingId, reachedCard: end.reachedCard, stages: end.stages, durGame: end.durGame, actError: act.error || null });
        const m = await S.eval(() => ({ mem: { ...window.__qs.ctx.engine.renderer.info.memory }, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, errors: window.__qs.errors.length, scene: (() => { let n = 0; window.__qs.ctx.engine.scene.traverse(() => n++); return n; })() }));
        Object.assign(r, m);
        if (!end.reachedCard) throw new Error('ending did not reach the card');
      } catch (e) { r.error = String(e.message || e).slice(0, 300); fails.push(`round ${i + 1} (${via}): ${r.error}`); rounds.push(r); h.log(`  round ${i + 1}: ${r.error}`); break; }
      rounds.push(r);
      h.log(`  round ${i + 1} ${via}: ${r.target} → ${r.endingId} · geo ${r.mem.geometries} tex ${r.mem.textures} heap ${r.heap} MB objs ${r.scene}`);
    }
    for (const r of rounds) if (r.unsolvable) warns0.push(`round ${r.round}: ${r.unsolvable} — fell back to the floor`);
    const errs = await S.errors();
    if (errs.length) fails.push(`${errs.length} __qs.errors: ${errs[0].slice(0, 160)}`);
    const warns = [...warns0];
    let memNote = '';
    const ok = rounds.filter((r) => r.mem);
    // Leak check: replay rounds whose content has already been rendered (same seed, same target). Lazily built sets and
    // per-character textures are legitimately uploaded on first use; replays of identical content must not allocate more.
    const replays = [];
    if (!h.quick && ok.length >= 6 && !fails.length) {
      const src = ok.slice(0, 4);
      for (let pass = 0; pass < 2; pass++) for (const r0 of src) {
        await S.eval(async () => { window.__qs.cardChoice('title'); await window.__qa.stepUntil(() => window.__qs.ctx.flow.phase === 'title', 10); });
        await S.eval((o) => window.__qa.begin(o), { seed: r0.seed, gender: 'm', ambient: false, roundSeconds: 300, teacher: 'writing' });
        await S.eval(() => window.__qa.freezeWind(true));
        await S.eval((o) => window.__qa.act(o), { action: 'throw', target: TARGETS[(r0.round - 1) % 3] });
        const end = await S.eval(() => window.__qa.recordEnding({ timeout: 160, thumbEvery: 1.5 }));
        const m = await S.eval(() => ({ ...window.__qs.ctx.engine.renderer.info.memory }));
        replays.push({ pass, seed: r0.seed, endingId: end.endingId, ...m });
      }
      const p0 = replays.filter((r) => r.pass === 0).at(-1), p1 = replays.filter((r) => r.pass === 1).at(-1);
      memNote = ` First-use growth over the 10 rounds: geometries ${ok.map((r) => r.mem.geometries).join('→')}, textures ${ok.map((r) => r.mem.textures).join('→')}. Replay of 4 identical rounds ×2: geometries ${replays.map((r) => r.geometries).join('→')}, textures ${replays.map((r) => r.textures).join('→')}.`;
      for (const k of ['geometries', 'textures']) if (p1[k] > p0[k] + 2) fails.push(`${k} grow when replaying identical rounds: ${p0[k]} → ${p1[k]} (leak)`);
      const maxFirst = Math.max(...ok.map((r) => r.mem.textures));
      if (p1.textures > maxFirst + 4) warns.push(`textures after replays (${p1.textures}) exceed the 10-round maximum (${maxFirst})`);
    } else if (!h.quick) warns.push('memory replay check skipped');
    return { status: verdict(fails, warns), partial: h.quick, details: `${ok.length}/${plan.length} rounds completed.${memNote} ${join([...fails, ...warns], 6)}`, data: { rounds, replays, selectors: S.selectors } };
  },
};
