// HUD (aim / flight): suspicion eye, heart crosshair + charge ring, alarm-clock timer, objective sticky
// note, control hints, willpower bar, danger vignette, touch buttons. Reads game state itself every frame.
import { h, esc, mix, clamp01 } from './dom.js';
import { ICON_CHALKBOARD, ICON_CLOCK, ICON_BOOK, ICON_BREATH, HEART_D, STATE_GLYPH } from './icons.js';

const PROMPTS = {
  aim: '按住 <kbd>左键</kbd> 蓄力 · <kbd>右键</kbd>/<kbd>空格</kbd> 装认真',
  flight: '按住 <kbd>空格</kbd> 屏息 · <kbd>A</kbd>/<kbd>D</kbd> 意念微调 · <kbd>C</kbd> 切换镜头',
};
const PROMPT_SECS = 6;
const FACING = new Set(['watching', 'suspicious', 'alert', 'patrol', 'fakeout']);

export function createHud(U) {
  const { ctx } = U;
  const ALMOND = 'M8 30Q50 -2 92 30Q50 62 8 30Z';

  const eyeSvg = `<svg class="qs-eye-svg" viewBox="0 0 100 60" aria-hidden="true">
    <defs><clipPath id="qsEyeClip"><path class="lidclip" d="${ALMOND}"/></clipPath></defs>
    <path class="brow" d="M18 6Q50 -2 82 6" fill="none" stroke="#2a3350" stroke-width="5" stroke-linecap="round"/>
    <path class="white" d="${ALMOND}" fill="#fffdf5"/>
    <g clip-path="url(#qsEyeClip)"><g class="iris-g"><circle class="iris" cx="50" cy="30" r="14" fill="#8a8f99"/><circle cx="50" cy="30" r="6.5" fill="#1d2033"/><circle cx="45" cy="25" r="3" fill="#fff"/></g></g>
    <path class="lid" d="${ALMOND}" fill="none" stroke="#2a3350" stroke-width="4.5" stroke-linejoin="round"/>
  </svg>`;

  const susArc = `<svg class="qs-eye-arc" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" pathLength="100" class="track"/><circle cx="50" cy="50" r="45" pathLength="100" class="fill"/></svg>`;
  const eye = h('div.qs-eye', {},
    h('div.qs-eye-sticker', { html: susArc + `<div class="qs-eye-face">${eyeSvg}</div><div class="qs-eye-chalk">${ICON_CHALKBOARD}</div><div class="qs-eye-bang">!</div>` }),
    h('div.qs-eye-label'));
  const objective = h('div.qs-objective.qs-sticky', {}, h('span.qs-tape'), h('b', {}, '目标'), h('span.qs-obj-text'));
  const timer = h('div.qs-timer', { html: ICON_CLOCK + '<span class="qs-timer-num">90</span>' });
  const cross = h('div.qs-cross', {
    html: `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="38" class="ring"/><circle cx="50" cy="50" r="38" pathLength="100" class="power"/>
      <g transform="translate(37 37) scale(.41)"><path class="heart" d="${HEART_D}"/></g></svg><div class="qs-cross-book">${ICON_BOOK}</div>`,
  });
  const will = h('div.qs-will', { html: `${ICON_BREATH}<div class="qs-will-bar"><i></i></div>` });
  const hint = h('div.qs-hint');
  const vignette = h('div.qs-vignette', {}, h('i'));
  const touchBtn = (label, code) => {
    const b = h('button.qs-touch-btn.qs-i', { type: 'button' }, label);
    const up = () => { if (b.classList.contains('is-down')) { b.classList.remove('is-down'); ctx.input?.simulate?.({ up: code }); } };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); U.unlock(); b.classList.add('is-down'); ctx.input?.simulate?.({ down: code }); try { b.setPointerCapture(e.pointerId); } catch { /* synthetic */ } });
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  };
  const touchStudy = touchBtn('装认真', 'Space');
  const touchBreath = touchBtn('屏息', 'Space');
  const touch = h('div.qs-touch', {}, touchStudy, touchBreath);
  const root = h('div.qs-hud', { hidden: true }, vignette, objective, eye, timer, cross, will, hint, touch);
  U.L.hud.appendChild(root);

  const q = (el, s) => el.querySelector(s);
  const E = {
    sticker: q(eye, '.qs-eye-sticker'), label: q(eye, '.qs-eye-label'), lidclip: q(eye, '.lidclip'), white: q(eye, '.white'), lid: q(eye, '.lid'),
    iris: q(eye, '.iris'), irisG: q(eye, '.iris-g'), brow: q(eye, '.brow'), arcFill: q(eye, '.fill'),
    objText: q(objective, '.qs-obj-text'), timerNum: q(timer, '.qs-timer-num'), power: q(cross, '.power'), willFill: q(will, 'i'),
  };

  const st = { phase: 'boot', forced: null, objective: null, promptText: null, promptCustom: false, promptUntil: 0, lastSec: -1, open: 0.3, willShown: 0, cache: {} };
  const set = (k, v, fn) => { if (st.cache[k] !== v) { st.cache[k] = v; fn(v); } };

  function visibleNow() { return st.forced ?? (st.phase === 'aim' || st.phase === 'flight'); }
  function applyVisible() { const v = visibleNow(); root.hidden = !v; root.dataset.phase = st.phase; }

  function showPrompt(html, custom) {
    st.promptCustom = custom;
    hint.innerHTML = html || '';
    hint.classList.toggle('is-on', !!html);
    st.promptUntil = custom ? Infinity : U.now + PROMPT_SECS;
  }

  function autoObjective() {
    if (st.objective) return;
    const id = ctx.round?.crushId;
    const name = id && (ctx.cast?.get?.(id)?.spec?.name || ctx.round?.roster?.students?.find?.((s) => s.id === id)?.name);
    if (name) setObjective(`把情书扔到 ${name} 的课桌上`, true);
  }
  function setObjective(text, auto = false) {
    if (!auto) st.objective = text || null;
    const t = String(text ?? '').replace(/^目标[：:]\s*/, '');
    E.objText.textContent = t;
    objective.classList.toggle('is-on', !!t);
    if (t && !auto) { objective.classList.remove('is-new'); void objective.offsetWidth; objective.classList.add('is-new'); }
  }

  const api = {
    show(on) { st.forced = on == null ? null : !!on; applyVisible(); },
    setObjective(text) { setObjective(text); },
    prompt(text) {
      if (text == null) { showPrompt('', true); st.promptCustom = false; st.promptUntil = 0; return; }
      showPrompt(esc(text), true);
    },
  };

  function onPhase(to) {
    st.phase = to;
    st.forced = null;
    applyVisible();
    if (PROMPTS[to]) showPrompt(PROMPTS[to], false); else showPrompt('', false);
    if (to === 'aim') autoObjective();
  }
  function reset() {
    st.objective = null; st.forced = null; st.lastSec = -1; st.willShown = 0; st.cache = {};
    setObjective('', true);
    showPrompt('', false);
    applyVisible();
  }

  U.frame((dt) => {
    if (root.hidden) return;
    const r = ctx.round || {};
    const aimSt = ctx.gameplay?.aim || {};
    const wp = ctx.gameplay?.willpower || {};
    const tState = ctx.ai?.teacher?.state || 'idle';
    const sus = clamp01(r.suspicion ?? 0);
    const aim = st.phase === 'aim';
    const flight = st.phase === 'flight';

    // suspicion eye
    const back = tState === 'writing' || tState === 'idle';
    const closed = tState === 'drinking';
    const facing = FACING.has(tState) || tState === 'warning';
    let target = closed ? 0.04 : facing ? 0.3 + 0.7 * sus : 0.15 + 0.5 * sus;
    if (tState === 'warning') target = Math.max(target, 0.45);
    st.open += (target - st.open) * Math.min(1, dt * 10);
    const o = st.open.toFixed(3);
    set('open', o, () => {
      const tr = `translate(0 30) scale(1 ${Math.max(0.03, st.open)}) translate(0 -30)`;
      E.lidclip.setAttribute('transform', tr); E.white.setAttribute('transform', tr); E.lid.setAttribute('transform', tr);
      E.brow.setAttribute('transform', `translate(0 ${(1 - st.open) * 14}) rotate(${sus * 8} 50 6)`);
    });
    set('sus', Math.round(sus * 100), (v) => {
      const c = sus < 0.5 ? mix('#8a8f99', '#f08a24', sus * 2) : mix('#f08a24', '#e23b3b', (sus - 0.5) * 2);
      E.iris.setAttribute('fill', c);
      E.arcFill.style.strokeDashoffset = String(100 - v);
      E.arcFill.style.stroke = c;
      vignette.style.opacity = sus > 0.7 ? String(Math.min(1, (sus - 0.7) / 0.25)) : '0';
    });
    set('tstate', tState, (v) => {
      eye.dataset.state = v;
      eye.classList.toggle('is-safe', back);
      eye.classList.toggle('is-warn', v === 'warning' || v === 'fakeout');
      eye.classList.toggle('is-closed', closed);
      const g = STATE_GLYPH[v] || { text: '', cls: '' };
      E.label.textContent = g.text;
      E.label.className = 'qs-eye-label ' + g.cls;
    });
    eye.classList.toggle('is-danger', sus > 0.7);
    const jitter = tState === 'warning' ? `translate(${(Math.random() - 0.5) * 4}px, ${(Math.random() - 0.5) * 2}px)` : '';
    E.irisG.style.transform = jitter;

    // timer
    const secs = Math.max(0, Math.ceil(r.timeLeft ?? 0));
    set('secs', secs, (v) => {
      E.timerNum.textContent = String(v);
      timer.classList.toggle('is-urgent', v <= 10);
      if (aim && v !== st.lastSec) { st.lastSec = v; try { ctx.world?.classroom?.clock?.set?.(Math.floor(v / 60), v % 60); } catch { /* optional */ } }
    });
    set('timerShow', aim, (v) => timer.classList.toggle('is-off', !v));

    // crosshair + charge ring
    const charging = aim && !!aimSt.charging;
    const power = charging ? clamp01(aimSt.power ?? 0) : 0;
    set('crossShow', aim, (v) => cross.classList.toggle('is-off', !v));
    set('power', Math.round(power * 100), (v) => {
      E.power.style.strokeDashoffset = String(100 - v);
      cross.style.setProperty('--p', (v / 100).toFixed(2));
      cross.classList.toggle('is-full', v >= 85);
    });
    set('charging', charging, (v) => cross.classList.toggle('is-charging', v));
    set('study', aim && !!aimSt.studying, (v) => cross.classList.toggle('is-study', v));
    set('exposed', charging && facing, (v) => cross.classList.toggle('is-exposed', v));

    // willpower
    if (flight && wp.active) st.willShown = 1.2; else st.willShown = Math.max(0, st.willShown - dt);
    set('willOn', flight && st.willShown > 0, (v) => will.classList.toggle('is-on', v));
    set('willActive', !!wp.active, (v) => will.classList.toggle('is-active', v));
    set('willVal', Math.round(clamp01(wp.value ?? 1) * 100), (v) => { E.willFill.style.width = v + '%'; });

    // prompt fade
    if (!st.promptCustom && hint.classList.contains('is-on') && U.now > st.promptUntil) hint.classList.remove('is-on');

    // touch buttons
    set('touch', st.phase, (v) => { touchStudy.hidden = v !== 'aim'; touchBreath.hidden = v !== 'flight'; });
  });

  return { api, onPhase, reset, get visible() { return !root.hidden; } };
}
