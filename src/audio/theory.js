// Music theory helpers for the procedural score: note names, chords, melody strings, drum patterns.
// Pure functions, no WebAudio.

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C4' → 60, 'F#5' → 78, 'Bb3' → 58. Numbers pass through. */
export function midi(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-Ga-g])([#b]*)(-?\d)$/.exec(String(n).trim());
  if (!m) throw new Error(`bad note ${n}`);
  let v = STEP[m[1].toUpperCase()] + 12 * (+m[3] + 1);
  for (const c of m[2]) v += c === '#' ? 1 : -1;
  return v;
}
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

const QUAL = {
  '': [0, 4, 7], maj: [0, 4, 7], m: [0, 3, 7], 5: [0, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
  7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 9: [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], sus2: [0, 2, 7], sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10], dim: [0, 3, 6], dim7: [0, 3, 6, 9], aug: [0, 4, 8], m7b5: [0, 3, 6, 10],
  '7b9': [0, 4, 7, 10, 13], 'maj7#11': [0, 4, 7, 11, 18], 'm(maj7)': [0, 3, 7, 11],
};

/**
 * Parse a chord symbol. 'Fmaj7' / 'D/F#' / 'Em7'.
 * @returns {{root:number, bass:number, tones:number[], sym:string}} root in octave 3 (C3 = 48..59)
 */
export function chord(sym) {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym.trim());
  if (!m) throw new Error(`bad chord ${sym}`);
  const root = midi(m[1] + '3');
  const ivs = QUAL[m[2]];
  if (!ivs) throw new Error(`unknown chord quality ${sym}`);
  const bass = midi((m[3] || m[1]) + '2'); // bass note in octave 2 (C2..B2)
  return { sym, root, bass, tones: ivs.map((i) => root + i) };
}

/** Fold chord tones into [lo, lo+12) and sort (close voicing). Extra tones above an octave fold too. */
export function voicing(tones, lo) {
  const out = tones.map((t) => { let v = t; while (v < lo) v += 12; while (v >= lo + 12) v -= 12; return v; });
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * Melody string → events. Tokens: NOTE[:beats][!|?], `r` = rest, `|` ignored.
 * Duration carries over from the previous token. `!` accent, `?` ghost.
 * @returns {{events: {b:number, d:number, m:number, v:number}[], beats:number}}
 */
export function parseMel(str, start = 0, vel = 0.8) {
  const events = [];
  let b = start, d = 1;
  for (const tok of str.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const m = /^([A-Ga-g][#b]*-?\d|r)(?::([\d.]+))?([!?]?)$/.exec(tok);
    if (!m) throw new Error(`bad melody token ${tok}`);
    if (m[2]) d = +m[2];
    if (m[1] !== 'r') events.push({ b, d, m: midi(m[1]), v: m[3] === '!' ? Math.min(1, vel * 1.25) : m[3] === '?' ? vel * 0.55 : vel });
    b += d;
  }
  return { events, beats: b - start };
}

/** Pattern string → hit list. 'X' accent, 'x' normal, '-' ghost, '.' rest. One char = `step` beats. */
export function parsePattern(pat, step = 0.25) {
  const out = [];
  [...pat.replace(/\s|\|/g, '')].forEach((c, i) => {
    const v = c === 'X' ? 1 : c === 'x' ? 0.75 : c === '-' ? 0.4 : 0;
    if (v) out.push({ b: i * step, v });
  });
  return out;
}
