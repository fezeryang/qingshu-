// window.__qs — deterministic test/debug API (owner: lead). Used by tests/ and by every agent's
// self-checks. Typical headless use:
//
//   await __qs.manual(true);                      // stop the RAF loop; tests drive time
//   await __qs.start({ seed: 7, playerGender: 'm', letter: '……', skipIntro: true });   // → phase 'aim'
//   __qs.forceTeacher('writing', 10);
//   await __qs.throwAt('crush');                  // solve + launch toward the crush's desk
//   const id = await __qs.runToEnding();          // advance until the ending card → ending id
//   __qs.render();                                // draw one frame before a screenshot
import * as THREE from 'three';
import { SEAT_BY_ID, TRASH, WINDOWS, TEACHER_DESK, FANS, AISLES_X, ROWS_Z, BALL_RADIUS } from './layout.js';

export function installDebug(ctx) {
  const { engine, bus } = ctx;
  const errors = [];
  const origError = console.error.bind(console);
  console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 500)); origError(...a); };
  window.addEventListener('error', (e) => errors.push(String(e.message || e)));
  window.addEventListener('unhandledrejection', (e) => errors.push('unhandledrejection: ' + String(e.reason?.stack || e.reason)));
  engine.onError = (err) => errors.push(String(err?.stack || err));

  const mc = new MessageChannel();
  const yieldTask = () => new Promise((r) => { mc.port1.onmessage = () => r(); mc.port2.postMessage(0); });

  async function advance(sec, step = 1 / 60) {
    const n = Math.max(1, Math.round(sec / step));
    for (let i = 0; i < n; i++) { engine.tick(step); await yieldTask(); }
  }
  async function advanceUntil(pred, timeoutSec = 60, step = 1 / 60) {
    const n = Math.round(timeoutSec / step);
    for (let i = 0; i < n; i++) { if (pred()) return true; engine.tick(step); await yieldTask(); }
    return !!pred();
  }
  const phase = () => ctx.flow.phase;
  const auto = () => engine.manual; // in manual mode we must drive time ourselves

  /** Named world-space targets for throwAt(). */
  function target(name) {
    const r = ctx.round;
    if (typeof name === 'object' && name) return new THREE.Vector3(name.x, name.y, name.z);
    if (name === 'crush') return target(ctx.cast.seatOf(r.crushId));
    if (SEAT_BY_ID[name]) { const s = SEAT_BY_ID[name]; return new THREE.Vector3(s.x, s.deskTopY + BALL_RADIUS, s.deskZ); }
    if (ctx.cast.get(name)) return target(ctx.cast.seatOf(name));
    switch (name) {
      case 'trash': return new THREE.Vector3(TRASH.x, TRASH.h * 0.6, TRASH.z);
      case 'window': { const w = WINDOWS.find((x) => x.open); return new THREE.Vector3(w.x - 0.6, w.sillY + 0.5, w.z); }
      case 'podium': return new THREE.Vector3(TEACHER_DESK.x, TEACHER_DESK.topY + BALL_RADIUS, TEACHER_DESK.z);
      case 'fan': { const f = FANS[0]; return new THREE.Vector3(f.x + f.r * 0.6, f.bladeY, f.z); }
      case 'teacher': { const t = ctx.cast.teacher; const p = new THREE.Vector3(); t.headWorld(p); return p; }
      case 'floor': return new THREE.Vector3(AISLES_X[1], BALL_RADIUS, (ROWS_Z[2] + ROWS_Z[3]) / 2);
      case 'self': return target(ctx.layout.PLAYER_SEAT);
      default: throw new Error(`unknown target ${name}`);
    }
  }

  const qs = {
    ctx,
    errors,
    get events() { return bus.log; },
    manual(on = true) { engine.setManual(on); },
    advance,
    advanceUntil,
    render() { engine.render(); },
    target,
    state() {
      const r = ctx.round || {};
      const ball = ctx.gameplay?.ball;
      return {
        phase: phase(), seed: r.seed, crushId: r.crushId, playerGender: r.playerGender,
        timeLeft: r.timeLeft, suspicion: r.suspicion, teacherSawBall: r.teacherSawBall, caughtDuring: r.caughtDuring,
        teacher: ctx.ai?.teacher?.state, ball: ball ? { state: ball.state, pos: ball.pos?.toArray?.().map((v) => +v.toFixed(3)) } : null,
        landing: r.landing ? { type: r.landing.type, seatId: r.landing.seatId, ownerId: r.landing.ownerId } : null,
        endingId: r.endingId, stage: ctx.stage.current, cam: ctx.cam?.mode, timeScale: engine.timeScale,
        unlocked: ctx.story?.gallery?.unlocked?.() ?? [],
        drawCalls: engine.renderer.info.render.calls, triangles: engine.renderer.info.render.triangles,
      };
    },
    /** Start a round, bypassing the screens the options cover. Resolves when phase === 'aim'. */
    async start(opts = {}) {
      const o = { seed: 1, playerGender: 'm', letter: '其实……我注意你很久了。', skipIntro: true, ...opts };
      ctx.flow.requestStart(o);
      if (auto()) await advanceUntil(() => phase() === 'aim', 60);
      else await ctx.time.until(() => phase() === 'aim', 60, 'ui');
      return qs.state();
    },
    /** Solve a launch that reaches `name` and throw it. Returns the solution. */
    async throwAt(name, opts = {}) {
      const p = target(name);
      const sol = ctx.gameplay.solveLaunch(p, opts);
      if (!sol) throw new Error(`no launch solution for ${JSON.stringify(name)}`);
      ctx.gameplay.launch(sol);
      if (auto()) await advance(1 / 30);
      return sol;
    },
    throwRaw(sol) { ctx.gameplay.launch(sol); },
    forceTeacher(state, dur = 999) { ctx.ai.teacher.force(state, dur); },
    setSuspicion(v) { ctx.ai.teacher.setSuspicion(v); },
    async runUntilPhase(name, timeoutSec = 60) { return advanceUntil(() => phase() === name, timeoutSec); },
    /** Advance until the ending card is up. Returns the ending id (or null on timeout). */
    async runToEnding(timeoutSec = 120) {
      const ok = await advanceUntil(() => phase() === 'card', timeoutSec);
      return ok ? ctx.round.endingId : null;
    },
    /** Pick an option on the ending card ('retry' | 'rewrite' | 'title') without clicking. */
    cardChoice(choice) { ctx.ui.debugChoose?.(choice); },
  };
  window.__qs = qs;
  bus.on('*', (type, p) => { if (ctx.config.debug && type !== 'input') console.debug('[bus]', type, p); });
  return qs;
}
