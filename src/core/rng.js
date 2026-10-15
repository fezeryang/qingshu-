// Seeded RNG (owner: lead). Gameplay-affecting randomness must come from ctx.rng (or a fork of it),
// never Math.random, so a seed reproduces a round exactly. Purely cosmetic jitter may use Math.random.
export function createRng(seed = 1) {
  let s = hash(String(seed)) >>> 0;
  const rng = {
    seed,
    next() { // mulberry32
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(a, b) { return a + (b - a) * rng.next(); },
    int(a, b) { return Math.floor(rng.range(a, b + 1)); },          // inclusive
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    chance(p) { return rng.next() < p; },
    shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    /** Independent stream derived from this seed + label (stable regardless of call order elsewhere). */
    fork(label) { return createRng(`${seed}/${label}`); },
  };
  return rng;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h;
}
