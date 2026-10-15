// Normalised input state (owner: lead). Modules read ctx.input inside their update; edges
// (pressed/released) are valid for exactly one tick. Tests can drive it with input.simulate().
//
//   input.nx, input.ny        pointer position in [-1, 1] (x right, y up), relative to the window
//   input.isDown(code)        'Mouse0' (primary / touch), 'Mouse2' (secondary), or a KeyboardEvent.code
//   input.pressed(code)       went down this tick
//   input.released(code)      went up this tick
//   input.enabled             false → game ignores the player (UI screens, cutscenes)
import { ORDER } from './engine.js';

export function createInput(engine, bus) {
  const down = new Set();
  const queue = [];
  let pressedNow = new Set();
  let releasedNow = new Set();

  const input = {
    nx: 0, ny: 0,
    enabled: true,
    isDown: (code) => down.has(code),
    pressed: (code) => pressedNow.has(code),
    released: (code) => releasedNow.has(code),
    /** Synthetic input for tests: {nx, ny, down: 'Mouse0', up: 'KeyC'} */
    simulate(ev) {
      if ('nx' in ev) input.nx = ev.nx;
      if ('ny' in ev) input.ny = ev.ny;
      if (ev.down) queue.push({ code: ev.down, down: true });
      if (ev.up) queue.push({ code: ev.up, down: false });
    },
  };

  const canvas = engine.canvas;
  const setPointer = (e) => {
    input.nx = (e.clientX / window.innerWidth) * 2 - 1;
    input.ny = -((e.clientY / window.innerHeight) * 2 - 1);
  };
  window.addEventListener('pointermove', setPointer, { passive: true });
  canvas.addEventListener('pointerdown', (e) => {
    setPointer(e);
    queue.push({ code: e.button === 2 ? 'Mouse2' : 'Mouse0', down: true });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
  });
  window.addEventListener('pointerup', (e) => queue.push({ code: e.button === 2 ? 'Mouse2' : 'Mouse0', down: false }));
  window.addEventListener('pointercancel', () => queue.push({ code: 'Mouse0', down: false }));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.repeat) return;
    if (e.code === 'Space') e.preventDefault();
    queue.push({ code: e.code, down: true });
  });
  window.addEventListener('keyup', (e) => { if (!typing(e)) queue.push({ code: e.code, down: false }); });
  window.addEventListener('blur', () => { for (const c of down) queue.push({ code: c, down: false }); });

  engine.onUpdate(() => {
    pressedNow = new Set();
    releasedNow = new Set();
    while (queue.length) {
      const { code, down: isDown } = queue.shift();
      if (isDown && !down.has(code)) { down.add(code); pressedNow.add(code); bus.emit('input', { code, down: true }); }
      if (!isDown && down.has(code)) { down.delete(code); releasedNow.add(code); bus.emit('input', { code, down: false }); }
    }
  }, ORDER.INPUT);

  return input;
}
