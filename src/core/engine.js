// Renderer, main loop and the two game clocks (owner: lead).
//
// Every piece of game logic runs inside engine.tick(); nothing in src/ may use setTimeout,
// setInterval or its own requestAnimationFrame. Use ctx.time.wait / waitUI / tween / until —
// they are driven by tick(), so the debug API can fast-forward the whole game deterministically.
import * as THREE from 'three';

/** Update order slots. Lower runs first. */
export const ORDER = { INPUT: -100, AI: 10, WORLD: 15, CHARACTERS: 20, GAMEPLAY: 30, STORY: 35, CAMERA: 40, UI: 50, AUDIO: 60 };

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.03, 300);
  scene.add(camera); // camera-attached objects (first-person arms) become visible

  const updates = [];
  const time = createClock();
  let manual = false;
  let paused = false;
  let last = performance.now();
  let renderFn = () => renderer.render(scene, camera);

  const engine = {
    THREE, renderer, scene, camera, canvas, time, ORDER,
    /** game-clock speed (slow motion). Owned by the camera director at runtime. */
    get timeScale() { return time.scale; },
    set timeScale(v) { time.scale = Math.max(0, v); },
    get paused() { return paused; },
    set paused(v) { paused = !!v; },
    get manual() { return manual; },
    /** In manual mode the RAF loop stops ticking; tests drive tick() themselves. */
    setManual(v) { manual = !!v; last = performance.now(); },
    /** Register a per-tick update: fn(dt, time). dt is the scaled game dt. Returns an unsubscribe fn. */
    onUpdate(fn, order = 0) {
      const u = { fn, order };
      updates.push(u);
      updates.sort((a, b) => a.order - b.order);
      return () => { const i = updates.indexOf(u); if (i >= 0) updates.splice(i, 1); };
    },
    /** Replace how a frame is drawn (camera module uses it for picture-in-picture). */
    setRenderFn(fn) { renderFn = fn || (() => renderer.render(scene, camera)); },
    tick(realDt) {
      const uiDt = Math.min(Math.max(realDt, 0), 1 / 15);
      if (paused) return;
      time._advance(uiDt);
      for (let i = 0; i < updates.length; i++) {
        try { updates[i].fn(time.dt, time); } catch (err) { reportError(err); }
      }
    },
    render() { renderFn(); },
    resize() {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    start() {
      const loop = (now) => {
        requestAnimationFrame(loop);
        const realDt = (now - last) / 1000;
        last = now;
        if (!manual) { engine.tick(realDt); renderFn(); }
      };
      requestAnimationFrame(loop);
    },
    onError: null,
  };
  const reportError = (err) => { console.error(err); engine.onError?.(err); };
  window.addEventListener('resize', () => engine.resize());
  engine.resize();
  return engine;
}

/** Two clocks driven by tick(): `now` (game, scaled by timeScale) and `uiNow` (unscaled). */
function createClock() {
  const waiters = []; // {clock, at, resolve} | {pred, resolve, deadline, clock}
  const tweens = [];
  const time = {
    now: 0, uiNow: 0, dt: 0, uiDt: 0, scale: 1, frame: 0,
    /** Resolve after `sec` seconds of game time (affected by slow motion and pause). */
    wait(sec) { return new Promise((resolve) => waiters.push({ clock: 'game', at: time.now + Math.max(0, sec), resolve })); },
    /** Resolve after `sec` seconds of unscaled time (ignores slow motion, stops while paused). */
    waitUI(sec) { return new Promise((resolve) => waiters.push({ clock: 'ui', at: time.uiNow + Math.max(0, sec), resolve })); },
    /** Resolve once pred() is truthy (checked every tick). Resolves false on timeout (game seconds). */
    until(pred, timeout = Infinity, clock = 'game') {
      return new Promise((resolve) => waiters.push({ pred, resolve, clock, deadline: (clock === 'ui' ? time.uiNow : time.now) + timeout }));
    },
    /**
     * Tween helper. onUpdate(k, raw) gets eased k in [0,1]. Resolves when done.
     * @param {{duration:number, ease?:(t:number)=>number, clock?:'game'|'ui', onUpdate:(k:number,raw:number)=>void}} o
     */
    tween(o) {
      return new Promise((resolve) => {
        const tw = { ...o, clock: o.clock || 'game', t0: null, resolve };
        tweens.push(tw);
        if (!(o.duration > 0)) { o.onUpdate?.(1, 1); tweens.splice(tweens.indexOf(tw), 1); resolve(); }
      });
    },
    _advance(uiDt) {
      time.uiDt = uiDt;
      time.dt = uiDt * time.scale;
      time.uiNow += uiDt;
      time.now += time.dt;
      time.frame++;
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        const clockNow = tw.clock === 'ui' ? time.uiNow : time.now;
        if (tw.t0 === null) tw.t0 = clockNow - (tw.clock === 'ui' ? uiDt : time.dt);
        const raw = Math.min(1, (clockNow - tw.t0) / tw.duration);
        try { tw.onUpdate?.((tw.ease || ((x) => x))(raw), raw); } catch (e) { console.error(e); }
        if (raw >= 1) { tweens.splice(i, 1); tw.resolve(); }
      }
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        const clockNow = w.clock === 'ui' ? time.uiNow : time.now;
        if (w.pred) {
          let ok = false;
          try { ok = w.pred(); } catch (e) { console.error(e); }
          if (ok) { waiters.splice(i, 1); w.resolve(ok); } else if (clockNow >= w.deadline) { waiters.splice(i, 1); w.resolve(false); }
        } else if (clockNow >= w.at) { waiters.splice(i, 1); w.resolve(); }
      }
    },
  };
  return time;
}
