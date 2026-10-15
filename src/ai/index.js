// STUB — to be replaced by the ai-designer agent. Contract: docs/CONTRACTS.md §4.4
import * as THREE from 'three';
import { PLAYER_EYE } from '../core/layout.js';

export async function install(ctx) {
  const { bus, engine } = ctx;
  const t = {
    state: 'idle', timer: 0, forced: null, enabled: false,
    get character() { return ctx.cast.teacher; },
    get suspicion() { return ctx.round?.suspicion ?? 0; },
    get facingClass() { return ['watching', 'suspicious', 'alert'].includes(t.state); },
    force(state, dur = 999) { t.forced = { state, until: ctx.time.now + dur }; set(state); },
    setSuspicion(v) { if (ctx.round) { ctx.round.suspicion = v; bus.emit('suspicion', { value: v }); } },
    canSee(pos) {
      if (!t.facingClass || !t.character) return false;
      const head = t.character.headWorld(new THREE.Vector3());
      const fwd = new THREE.Vector3(0, 0, 1);
      return fwd.dot(pos.clone().sub(head).normalize()) > Math.cos(THREE.MathUtils.degToRad(50));
    },
  };
  function set(state) {
    if (state === t.state) return;
    const prev = t.state;
    t.state = state;
    t.timer = { writing: 5, warning: 0.7, watching: 4 }[state] ?? 3;
    const ch = t.character;
    if (ch) ch.root.rotation.y = state === 'writing' || state === 'warning' ? 0 : Math.PI;
    bus.emit('teacher:state', { state, prev });
  }
  bus.on('phase', ({ to }) => {
    t.enabled = to === 'aim' || to === 'flight';
    if (to === 'aim') { t.forced = null; set('writing'); }
  });
  engine.onUpdate((dt) => {
    const r = ctx.round;
    if (!t.enabled || !r) return;
    if (t.forced && ctx.time.now < t.forced.until) { /* hold forced state */ } else {
      t.forced = null;
      t.timer -= dt;
      if (t.timer <= 0) set({ writing: 'warning', warning: 'watching', watching: 'writing' }[t.state] || 'writing');
    }
    const charging = ctx.gameplay?.aim?.charging;
    const seesPlayer = t.canSee(new THREE.Vector3(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z));
    let s = r.suspicion;
    if (ctx.flow.phase === 'aim') s += (seesPlayer && charging ? 0.7 : -0.15) * dt;
    const ball = ctx.gameplay?.ball;
    if (ctx.flow.phase === 'flight' && ball?.state === 'flying' && t.canSee(ball.pos)) {
      s += 1.5 * dt;
      if (s >= 1 && !r.teacherSawBall) { r.teacherSawBall = true; r.caughtDuring = 'flight'; bus.emit('teacher:caught', { reason: 'ball' }); }
    }
    s = Math.min(1, Math.max(0, s));
    if (s !== r.suspicion) { r.suspicion = s; bus.emit('suspicion', { value: s }); }
    if (ctx.flow.phase === 'aim' && s >= 1) { r.caughtDuring = 'aim'; bus.emit('teacher:caught', { reason: 'aim' }); t.enabled = false; }
  }, ctx.engine.ORDER.AI);

  t.setEnabled = (on) => { t.enabled = on; if (!on) t.state = 'cutscene'; };
  t.say = (text) => ctx.ui.bubble('teacher', text);
  ctx.ai = {
    teacher: t,
    students: { setAmbient() {}, trigger() { return false; }, react() {} },
    playerExposure: () => (ctx.gameplay?.aim?.charging ? 1 : 0),
  };
}
