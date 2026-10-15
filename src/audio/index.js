// STUB (silent) — to be replaced by the audio-composer agent. Contract: docs/CONTRACTS.md §4.8
export async function install(ctx) {
  const noop = () => {};
  ctx.audio = {
    unlock: noop,
    music: noop,
    setTension: noop,
    sfx: noop,
    loop: () => ({ stop: noop, set: noop }),
    blip: noop,
    speak: async () => {},
    duck: noop,
    applySettings: noop,
    debug: { music: null, recent: [] },
  };
}
