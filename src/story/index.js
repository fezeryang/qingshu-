// Story module (owner: narrative-director). Contract: docs/CONTRACTS.md §4.6
//   roster.js   class roster, teacher, ending NPCs, makeRoster()
//   letters.js  love-letter presets
//   endings.js  ENDINGS metadata + resolve() (pure)
//   direct.js   cutscene director toolkit (safe wrappers around every other module)
//   intro.js    class-start intro
//   cutscenes/  one file per ending
import { store } from '../core/util.js';
import { ENDINGS, ENDING_IDS, resolve } from './endings.js';
import { LETTERS } from './letters.js';
import { makeRoster, STUDENTS, TEACHER, NPCS } from './roster.js';
import { createDirector, CANCEL } from './direct.js';
import { intro, introCleanup } from './intro.js';
import { begin } from './cutscenes/common.js';
import perfect from './cutscenes/perfect.js';
import caughtRead from './cutscenes/caught_read.js';
import chalkCounter from './cutscenes/chalk_counter.js';
import graded from './cutscenes/graded.js';
import threePointer from './cutscenes/three_pointer.js';
import outWindow from './cutscenes/out_window.js';
import confetti from './cutscenes/confetti.js';
import selfLove from './cutscenes/self_love.js';
import wrongCaught from './cutscenes/wrong_caught.js';
import sameGender from './cutscenes/same_gender.js';
import wrongAccept from './cutscenes/wrong_accept.js';
import lost from './cutscenes/lost.js';
import coward from './cutscenes/coward.js';
import loveBonk from './cutscenes/love_bonk.js';
import passedAround from './cutscenes/passed_around.js';

const SCRIPTS = {
  perfect, caught_read: caughtRead, chalk_counter: chalkCounter, graded, three_pointer: threePointer, out_window: outWindow,
  confetti, self_love: selfLove, love_bonk: loveBonk, passed_around: passedAround, wrong_caught: wrongCaught, same_gender: sameGender, wrong_accept: wrongAccept, lost, coward,
};
const GALLERY_KEY = 'qingshu.endings';
const INTRO_MAX = 6.5;   // ui seconds
const ENDING_MAX = 44;   // game seconds — hard cap, the scripts are written for 15–38 s

export async function install(ctx) {
  const { time, bus } = ctx;
  const shared = {
    props: new Map(),
    loops: [],
    debug: { beat: null, beats: [], endingId: null, durations: {}, running: null, lastError: null },
  };

  /** Run a script with a cap; returns 'ok' | 'cancel' | 'error'. The director is cancelled afterwards. */
  async function runScript(d, fn, capSec, clock) {
    const main = (async () => {
      try { await fn(d); return 'ok'; } catch (err) {
        if (err === CANCEL) return 'cancel';
        shared.debug.lastError = String(err?.stack || err);
        console.error(`[story] ${d.label} failed:`, err);
        return 'error';
      }
    })();
    const cap = (clock === 'ui' ? time.waitUI(capSec) : time.wait(capSec)).then(() => 'timeout');
    const res = await Promise.race([main, cap]);
    d.cancel();
    return res;
  }

  async function playIntro() {
    const d = createDirector(ctx, shared, 'intro');
    shared.debug.beats = [];
    shared.debug.running = 'intro';
    let skipped = false;
    d.bg(time.until(() => d.cancelled || ctx.input?.pressed?.('Mouse0') || ctx.input?.pressed?.('Space'), INTRO_MAX + 1, 'ui').then((hit) => {
      if (hit && !d.cancelled) { skipped = true; d.cancel(); }
    }));
    await runScript(d, intro, INTRO_MAX, 'ui');
    shared.debug.introSkipped = skipped;
    introCleanup(ctx, d);
    shared.debug.running = null;
  }

  async function playEnding(id) {
    const fn = SCRIPTS[id] || SCRIPTS.lost;
    const d = createDirector(ctx, shared, id);
    Object.assign(shared.debug, { beat: 'start', beats: [], endingId: id, running: id, shots: 0 });
    const t0 = time.now, u0 = time.uiNow;
    if (ctx.round) ctx.round.flags = { ...(ctx.round.flags || {}), ending: id };
    const res = await runScript(d, fn, ENDING_MAX, 'game');
    if (res === 'error') {
      // Never strand the player: a minimal but readable fallback ending.
      const f = createDirector(ctx, shared, `${id}/fallback`);
      const e = ENDINGS.find((x) => x.id === id);
      await runScript(f, async (g) => {
        begin(g, { music: 'comedy' });
        await g.caption(e?.title || '……', 'impact', 2);
        await g.say('旁白', e?.subtitle || '……');
        await g.wait(1);
      }, 12, 'game');
    }
    shared.debug.durations[id] = { game: +(time.now - t0).toFixed(2), ui: +(time.uiNow - u0).toFixed(2), result: res };
    (shared.debug.cuts ||= {})[id] = shared.debug.shots; // camera moves/cuts issued by the script
    shared.debug.running = null;
  }

  const gallery = {
    unlocked() {
      const v = store.get(GALLERY_KEY, []);
      return Array.isArray(v) ? v.filter((x) => ENDING_IDS.includes(x)) : [];
    },
    unlock(id) {
      if (!ENDING_IDS.includes(id)) return false;
      const u = gallery.unlocked();
      if (u.includes(id)) return false;
      store.set(GALLERY_KEY, [...u, id]);
      return true;
    },
    reset() { store.set(GALLERY_KEY, []); },
  };

  // Per-round reset: loose props back out of the scene, loops stopped, beat markers cleared.
  bus.on('round:setup', () => {
    for (const p of shared.props.values()) { p.visible = false; p.removeFromParent(); p.scale.setScalar(1); }
    for (const l of shared.loops.splice(0)) l.stop(0.2);
    Object.assign(shared.debug, { beat: null, beats: [], endingId: null, running: null });
  });
  // The objective is set even when the intro is skipped (tests / retry with skipIntro).
  bus.on('phase', ({ to }) => {
    if (to !== 'aim' || !ctx.round) return;
    const crush = ctx.cast?.get?.(ctx.round.crushId);
    if (crush) { try { ctx.ui?.hud?.setObjective?.(`把情书扔到 ${crush.spec.name} 的桌上`); } catch { /* ui not ready */ } }
  });

  ctx.story = {
    ENDINGS,
    letters: LETTERS,
    makeRoster,
    resolve,
    playIntro,
    playEnding,
    gallery,
    // additions (docs/modules/story.md)
    STUDENTS, TEACHER, NPCS,
    debug: shared.debug,
  };
}
