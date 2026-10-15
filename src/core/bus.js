// Tiny synchronous event bus (owner: lead). Event names and payloads are listed in docs/CONTRACTS.md §3.
export function createBus() {
  const map = new Map();
  const log = []; // ring buffer of recent events, read by the debug API / QA
  const bus = {
    on(type, fn) { (map.get(type) || map.set(type, new Set()).get(type)).add(fn); return () => bus.off(type, fn); },
    off(type, fn) { map.get(type)?.delete(fn); },
    once(type, fn) { const off = bus.on(type, (p) => { off(); fn(p); }); return off; },
    /** Promise resolving with the next payload of `type` (optionally filtered). */
    next(type, filter) {
      return new Promise((resolve) => { const off = bus.on(type, (p) => { if (!filter || filter(p)) { off(); resolve(p); } }); });
    },
    emit(type, payload) {
      log.push({ type, t: bus.clock ? +bus.clock().toFixed(3) : 0, payload: summarize(payload) });
      if (log.length > 400) log.shift();
      for (const fn of [...(map.get(type) || [])]) {
        try { fn(payload); } catch (err) { console.error(`[bus] handler for "${type}" threw`, err); }
      }
      for (const fn of [...(map.get('*') || [])]) { try { fn(type, payload); } catch (err) { console.error(err); } }
    },
    log,
    clock: null,
  };
  return bus;
}

function summarize(p) {
  if (!p || typeof p !== 'object') return p;
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (v && typeof v === 'object' && 'x' in v && 'y' in v && 'z' in v) out[k] = [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    else if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) out[k] = v;
    else if (Array.isArray(v)) out[k] = `[${v.length}]`;
  }
  return out;
}
