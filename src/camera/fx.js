// Screen-space effects (DOM overlay, pointer-events:none): fade, flash, letterbox, heart iris,
// speed lines, slow-motion vignette and the PiP danger frame. All timed transitions run on the UI
// clock through ctx.time.tween (never stretched by slow motion) and always resolve.
//
// Layering: by default the layer sits between the game canvas and #ui-root, so dialogue, captions
// and the ending card always draw ON TOP of fades/irises (a fade can never hide the card).
// setOverUI(true) moves it above #ui-root. (owner: qs-camera-director)
import { clamp, ease as EASE } from '../core/util.js';

// Unit heart, half-width 1, y down (SVG), visual centre ≈ (0, 0).
const HEART = 'M0,0.8 C-0.12,0.68 -1,0.15 -1,-0.3 C-1,-0.72 -0.55,-0.92 -0.27,-0.84 C-0.12,-0.79 -0.03,-0.68 0,-0.58 C0.03,-0.68 0.12,-0.79 0.27,-0.84 C0.55,-0.92 1,-0.72 1,-0.3 C1,0.15 0.12,0.68 0,0.8 Z';
const HEART_INNER = 0.45; // radius of the circle (around the visual centre) the unit heart always contains

const CSS = `
#cam-fx{position:fixed;inset:0;pointer-events:none;overflow:hidden}
#cam-fx.over{z-index:40}
#cam-fx>*{position:absolute;pointer-events:none}
#cam-fx .cam-full{left:0;top:0;width:100%;height:100%}
#cam-fx .cam-fade,#cam-fx .cam-flash{opacity:0;display:none;background:#000}
#cam-fx .cam-flash{background:#fff}
#cam-fx .cam-vig{opacity:0;display:none;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 52%,rgba(24,10,34,.38) 78%,rgba(14,6,22,.72) 100%)}
#cam-fx .cam-speed{opacity:0;display:none}
#cam-fx .cam-lb{left:0;width:100%;height:12%;background:#07040a;display:none}
#cam-fx .cam-lb-top{top:0;transform:translateY(-100%)}
#cam-fx .cam-lb-bot{bottom:0;transform:translateY(100%)}
#cam-fx .cam-iris{display:none}
#cam-fx .cam-pip{display:none;box-sizing:border-box;border:3px solid #ff3b3b;border-radius:6px;
  box-shadow:0 0 0 2px rgba(0,0,0,.35),0 0 18px rgba(255,40,40,.55);animation:cam-pip-pulse .55s ease-in-out infinite alternate}
#cam-fx .cam-pip-badge{position:absolute;left:-15px;top:-15px;width:36px;height:36px;border-radius:50%;background:#ff3b3b;color:#fff;
  font:900 24px/36px "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.45);
  animation:cam-pip-badge .32s ease-in-out infinite alternate}
@keyframes cam-pip-pulse{from{box-shadow:0 0 0 2px rgba(0,0,0,.35),0 0 10px rgba(255,40,40,.35)}to{box-shadow:0 0 0 2px rgba(0,0,0,.35),0 0 26px rgba(255,40,40,.9)}}
@keyframes cam-pip-badge{from{transform:scale(1) rotate(-6deg)}to{transform:scale(1.15) rotate(6deg)}}
`;

export function createFx(ctx, { screenOf }) {
  const { time } = ctx;
  const reduced = () => !!ctx.settings?.reducedMotion;
  if (!document.getElementById('cam-fx-style')) {
    const st = document.createElement('style');
    st.id = 'cam-fx-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  document.getElementById('cam-fx')?.remove();
  const layer = document.createElement('div');
  layer.id = 'cam-fx';
  const place = (over) => {
    const ui = document.getElementById('ui-root');
    layer.classList.toggle('over', !!over);
    if (!over && ui?.parentNode) ui.parentNode.insertBefore(layer, ui);
    else if (ui?.parentNode) ui.parentNode.insertBefore(layer, ui.nextSibling);
    else document.body.appendChild(layer);
  };
  place(false);

  const mk = (cls, tag = 'div') => { const e = document.createElement(tag); e.className = cls; layer.appendChild(e); return e; };
  // bottom → top
  const vig = mk('cam-vig cam-full');
  const speed = mk('cam-speed cam-full', 'canvas');
  const lbTop = mk('cam-lb cam-lb-top'), lbBot = mk('cam-lb cam-lb-bot');
  const pipEl = mk('cam-pip');
  pipEl.innerHTML = '<div class="cam-pip-badge">！</div>';
  const irisCv = mk('cam-iris cam-full', 'canvas');
  const fadeEl = mk('cam-fade cam-full'), flashEl = mk('cam-flash cam-full');
  const heartPath = typeof Path2D === 'function' ? new Path2D(HEART) : null;

  const S = { fade: 0, fadeColor: '#000', flash: 0, lb: 0, iris: 'open', irisS: 0, speed: 0, vig: 0, pip: null };
  let fadeTok = 0, flashTok = 0, lbTok = 0, irisTok = 0;

  const show = (el, on) => { const d = on ? 'block' : 'none'; if (el.style.display !== d) el.style.display = d; };

  // ---------------------------------------------------------------- fade / flash
  function setFade(v) { S.fade = v; fadeEl.style.opacity = String(v); show(fadeEl, v > 0.001); }
  function fade(opacity = 1, dur = 0.5, color = '#000') {
    const to = clamp(Number.isFinite(+opacity) ? +opacity : 1, 0, 1);
    const tok = ++fadeTok, from = S.fade;
    if (color) { S.fadeColor = color; fadeEl.style.background = color; }
    return time.tween({ duration: Math.max(0, +dur || 0), clock: 'ui', ease: EASE.inOutSine, onUpdate: (k) => { if (tok === fadeTok) setFade(from + (to - from) * k); } });
  }
  function setFlash(v) { S.flash = v; flashEl.style.opacity = String(v); show(flashEl, v > 0.001); }
  function flash(color = '#fff', dur = 0.3) {
    const tok = ++flashTok;
    flashEl.style.background = color || '#fff';
    const peak = reduced() ? 0.45 : 0.92;
    setFlash(peak);
    return time.tween({ duration: Math.max(0.05, +dur || 0.3), clock: 'ui', ease: EASE.outQuad, onUpdate: (k) => { if (tok === flashTok) setFlash(peak * (1 - k)); } });
  }

  // ---------------------------------------------------------------- letterbox
  function setLb(k) {
    S.lb = k;
    lbTop.style.transform = `translateY(${(k - 1) * 100}%)`;
    lbBot.style.transform = `translateY(${(1 - k) * 100}%)`;
    show(lbTop, k > 0.001); show(lbBot, k > 0.001);
  }
  function letterbox(on = true, dur = 0.5) {
    const to = typeof on === 'number' ? clamp(on, 0, 1) : on ? 1 : 0;
    const tok = ++lbTok, from = S.lb;
    return time.tween({ duration: Math.max(0, Number.isFinite(+dur) ? +dur : 0.5), clock: 'ui', ease: EASE.inOutCubic, onUpdate: (k) => { if (tok === lbTok) setLb(from + (to - from) * k); } });
  }

  // ---------------------------------------------------------------- heart iris (2D canvas)
  const ig = irisCv.getContext('2d');
  let irisColor = '#16080f';
  function sizeIris() {
    const W = window.innerWidth || 960, H = window.innerHeight || 540;
    if (irisCv.width !== W || irisCv.height !== H) { irisCv.width = W; irisCv.height = H; }
    return [W, H];
  }
  function setHeart(cx, cy, s) {
    S.irisS = s;
    if (!ig) return;
    const W = irisCv.width, H = irisCv.height;
    ig.setTransform(1, 0, 0, 1, 0, 0);
    ig.globalCompositeOperation = 'source-over';
    ig.clearRect(0, 0, W, H);
    ig.fillStyle = irisColor;
    ig.fillRect(0, 0, W, H);
    if (s <= 0.01) return;
    ig.setTransform(s, 0, 0, s, cx, cy);
    ig.globalCompositeOperation = 'destination-out';
    if (heartPath) ig.fill(heartPath); else { ig.beginPath(); ig.arc(0, 0, 0.7, 0, Math.PI * 2); ig.fill(); }
    ig.globalCompositeOperation = 'source-over';
    if (s > 2 && heartPath) { ig.lineWidth = 4 / s; ig.strokeStyle = '#ff9ec6'; ig.stroke(heartPath); }
    ig.setTransform(1, 0, 0, 1, 0, 0);
  }
  // closing curve, u: 0 → 1 means full → closed (with a heartbeat while small)
  function irisCurve(u, sFull, sSmall) {
    if (u < 0.6) return sFull + (sSmall - sFull) * EASE.inOutCubic(u / 0.6);
    if (u < 0.8) return sSmall * (1 + 0.14 * Math.sin(Math.PI * ((u - 0.6) / 0.2)));
    return sSmall * (1 - EASE.inCubic((u - 0.8) / 0.2));
  }
  function irisHeart(dir = 'out', dur = 1, screenPos, color = '#16080f') {
    const tok = ++irisTok;
    const [W, H] = sizeIris();
    let [cx, cy] = screenOf(screenPos);
    cx = clamp(cx, 0, W); cy = clamp(cy, 0, H);
    const D = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
    const sFull = D / HEART_INNER + 8, sSmall = Math.min(W, H) * 0.19;
    irisColor = color || '#16080f';
    irisCv.style.opacity = '1';
    show(irisCv, true);
    const closing = dir !== 'in';
    S.iris = closing ? 'closing' : 'opening';
    setHeart(cx, cy, closing ? sFull : 0);
    return time.tween({ duration: Math.max(0, Number.isFinite(+dur) ? +dur : 1), clock: 'ui', onUpdate: (_k, u) => {
      if (tok !== irisTok) return;
      setHeart(cx, cy, irisCurve(closing ? u : 1 - u, sFull, sSmall));
    } }).then(() => {
      if (tok !== irisTok) return;
      if (closing) { S.iris = 'closed'; setHeart(cx, cy, 0); } else { S.iris = 'open'; show(irisCv, false); }
    });
  }
  function hideIris() { irisTok++; S.iris = 'open'; S.irisS = 0; show(irisCv, false); irisCv.style.opacity = '1'; }

  // ---------------------------------------------------------------- speed lines / vignette
  const g = speed.getContext('2d');
  let speedFrame = 0;
  function setSpeed(k, cx = 0.5, cy = 0.5) {
    S.speed = k;
    if (k < 0.02) { if (speed.style.display !== 'none') { show(speed, false); g?.clearRect(0, 0, speed.width, speed.height); } return; }
    show(speed, true);
    speed.style.opacity = String(Math.min(1, k * 1.2));
    if ((speedFrame++ & 1) || !g) return;
    const w = Math.max(64, Math.round((window.innerWidth || 960) / 2)), h = Math.max(36, Math.round((window.innerHeight || 540) / 2));
    if (speed.width !== w || speed.height !== h) { speed.width = w; speed.height = h; }
    g.clearRect(0, 0, w, h);
    const ox = clamp(cx, 0.15, 0.85) * w, oy = clamp(cy, 0.15, 0.85) * h;
    const R = Math.hypot(w, h) * 0.75;
    const n = Math.round(22 + 46 * k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = R * (0.38 + Math.random() * 0.32) * (1.15 - 0.35 * k);
      const half = (0.5 + Math.random() * 2.2 * k) / R * 6;
      const ca = Math.cos(a), sa = Math.sin(a);
      g.fillStyle = `rgba(255,255,255,${(0.25 + Math.random() * 0.45) * k})`;
      g.beginPath();
      g.moveTo(ox + ca * r0, oy + sa * r0);
      g.lineTo(ox + Math.cos(a + half) * R, oy + Math.sin(a + half) * R);
      g.lineTo(ox + Math.cos(a - half) * R, oy + Math.sin(a - half) * R);
      g.closePath();
      g.fill();
    }
  }
  function setVignette(v) {
    if (Math.abs(v - S.vig) < 0.005 && !(v === 0 && S.vig !== 0)) return;
    S.vig = v; vig.style.opacity = String(v); show(vig, v > 0.005);
  }

  // ---------------------------------------------------------------- PiP frame
  function setPip(rect) {
    S.pip = rect || null;
    if (!rect) { show(pipEl, false); return; }
    const css = `${rect.x}px|${rect.y}px|${rect.w}px|${rect.h}px`;
    if (pipEl.dataset.r !== css) {
      pipEl.dataset.r = css;
      Object.assign(pipEl.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
    }
    show(pipEl, true);
  }

  // ---------------------------------------------------------------- resets
  /** Hard reset: everything off right now (round:setup). */
  function resetAll() {
    fadeTok++; flashTok++; lbTok++;
    setFade(0); setFlash(0); setLb(0); hideIris(); setSpeed(0); setVignette(0); setPip(null);
  }
  /** Soft clear: fade out whatever is up over `dur` (title / aim). */
  function clearSoft(dur = 0.35) {
    const ps = [];
    if (S.fade > 0) ps.push(fade(0, dur));
    if (S.lb > 0) ps.push(letterbox(false, dur));
    if (S.flash > 0) { flashTok++; setFlash(0); }
    if (S.iris !== 'open') {
      const tok = ++irisTok;
      ps.push(time.tween({ duration: dur, clock: 'ui', onUpdate: (k) => { if (tok === irisTok) irisCv.style.opacity = String(1 - k); } }).then(() => { if (tok === irisTok) hideIris(); }));
    }
    setSpeed(0); setVignette(0);
    return Promise.all(ps);
  }

  return {
    layer, fade, flash, letterbox, irisHeart, setSpeed, setVignette, setPip, resetAll, clearSoft,
    setOverUI: place,
    state: () => ({ fade: +S.fade.toFixed(3), fadeColor: S.fadeColor, flash: +S.flash.toFixed(3), letterbox: +S.lb.toFixed(3), iris: S.iris, speedLines: +S.speed.toFixed(2), vignette: +S.vig.toFixed(2), pip: !!S.pip }),
  };
}
