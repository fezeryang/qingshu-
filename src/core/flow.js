// Game flow state machine (owner: lead). The single place that sequences a round.
// Modules react to `phase` events rather than calling each other's phase logic.
//
// Phases: boot → title → letter → intro → aim → flight → ending → card → (retry → letter|intro | title)
import { store } from './util.js';
import { ORDER } from './engine.js';

export function installFlow(ctx) {
  const { bus, time } = ctx;
  let pendingStart = null; // debug/test request that bypasses the title screen
  let pendingResolve = null;
  let roundIndex = 0;

  const flow = {
    phase: 'boot',
    setPhase(to, extra = {}) {
      const from = flow.phase;
      flow.phase = to;
      bus.emit('phase', { from, to, ...extra });
    },
    /** Debug/test entry: start a round with options, skipping UI screens that the options cover. */
    requestStart(opts) {
      pendingStart = opts;
      pendingResolve?.(opts);
    },
    run,
  };
  ctx.flow = flow;

  // Round timer (aim phase only).
  ctx.engine.onUpdate((dt) => {
    const r = ctx.round;
    if (flow.phase !== 'aim' || !r) return;
    const before = r.timeLeft;
    r.timeLeft = Math.max(0, r.timeLeft - dt);
    if (before > 0 && r.timeLeft <= 0) bus.emit('round:timeout', {});
  }, ORDER.STORY);

  /** Resolve with the key of whichever event fires first; unsubscribes the rest. */
  const firstOf = (map) => new Promise((resolve) => {
    const offs = Object.entries(map).map(([key, type]) => bus.on(type, (p) => { offs.forEach((o) => o()); resolve({ key, payload: p }); }));
  });

  const nextDebugStart = () => new Promise((resolve) => {
    if (pendingStart) { const o = pendingStart; pendingStart = null; resolve(o); return; }
    pendingResolve = (o) => { pendingStart = null; pendingResolve = null; resolve(o); };
  });

  async function run() {
    for (;;) {
      flow.setPhase('title');
      ctx.input.enabled = false;
      ctx.stage.show('classroom');
      let opts = await Promise.race([ctx.ui.title(), nextDebugStart()]);
      pendingResolve = null;
      ctx.ui.closeAll();
      if (opts.action === 'gallery') continue;
      let letter = opts.letter != null ? { text: opts.letter, presetId: null } : null;
      for (;;) {
        await setupRound(opts);
        if (!letter) {
          flow.setPhase('letter');
          letter = await ctx.ui.letterEditor({ presets: ctx.story.letters });
          await ctx.ui.crumple();
        }
        ctx.round.letter = letter;

        if (!opts.skipIntro) {
          flow.setPhase('intro');
          await ctx.story.playIntro();
        }

        flow.setPhase('aim');
        ctx.input.enabled = true;
        const aimEnd = (await firstOf({ launched: 'ball:launched', caught: 'teacher:caught', timeout: 'round:timeout' })).key;
        if (aimEnd === 'launched') {
          ctx.round.launched = true;
          flow.setPhase('flight');
          // gameplay must emit ball:landed within ~8 s; the race is only a safety net
          const landed = await Promise.race([firstOf({ landed: 'ball:landed' }), time.wait(14).then(() => null)]);
          ctx.round.landing = landed?.payload ?? { type: 'timeout', pos: null, hits: [], flightTime: 14 };
        } else if (aimEnd === 'caught') {
          ctx.round.caughtDuring = 'aim';
        } else {
          bus.emit('bell', {});
        }
        ctx.input.enabled = false;

        const endingId = ctx.story.resolve(ctx.round);
        ctx.round.endingId = endingId;
        flow.setPhase('ending', { endingId });
        await ctx.story.playEnding(endingId);

        const isNew = ctx.story.gallery.unlock(endingId);
        const ending = ctx.story.ENDINGS.find((e) => e.id === endingId);
        flow.setPhase('card', { endingId });
        bus.emit('ending:shown', { endingId, isNew });
        const choice = await Promise.race([
          ctx.ui.endingCard(ending, { isNew, unlocked: ctx.story.gallery.unlocked().length, total: ctx.story.ENDINGS.length }),
          nextDebugStart().then((o) => ({ debug: o })),
        ]);
        pendingResolve = null;
        ctx.ui.closeAll();
        if (choice?.debug) { opts = choice.debug; letter = opts.letter != null ? { text: opts.letter, presetId: null } : null; continue; }
        if (choice === 'retry') { opts = { ...opts, seed: undefined, skipIntro: false }; continue; }
        if (choice === 'rewrite') { opts = { ...opts, seed: undefined, skipIntro: false }; letter = null; continue; }
        break; // 'title'
      }
    }
  }

  async function setupRound(opts) {
    roundIndex++;
    const seed = opts.seed ?? (roundIndex === 1 && ctx.config.seed != null ? ctx.config.seed : Math.floor(Math.random() * 1e9));
    const playerGender = opts.playerGender || ctx.settings.playerGender || 'm';
    ctx.settings.playerGender = playerGender;
    store.set('qingshu.settings', ctx.settings);
    ctx.rng = ctx.makeRng(seed);
    const roster = ctx.story.makeRoster(ctx.rng.fork('roster'), playerGender, opts);
    ctx.round = {
      index: roundIndex, seed, playerGender,
      crushId: roster.crushId, roster, letter: null,
      duration: opts.roundSeconds ?? ctx.config.roundSeconds, timeLeft: opts.roundSeconds ?? ctx.config.roundSeconds,
      suspicion: 0, teacherSawBall: false, caughtDuring: null,
      launched: false, landing: null, incidents: [], endingId: null, flags: {},
    };
    ctx.stage.show('classroom');
    ctx.cast.setRoster(roster);
    ctx.cast.seatAll();
    ctx.engine.timeScale = 1;
    bus.emit('round:setup', { seed, index: roundIndex, crushId: roster.crushId, playerGender });
    await time.waitUI(0);
  }
}
