// The 12 procedural tracks (ids per docs/CONTRACTS.md §4.8). Each track is data: tempo, meter,
// parts (instrument + gain + layer), and a build(S) function that writes note events in beats.
// See docs/modules/audio.md for the per-track motif / key / orchestration notes.
import { voicing } from './theory.js';
import { smooth } from './dsp.js';

// ---------------------------------------------------------------- helpers
const tone = (v, i) => v[((i % v.length) + v.length) % v.length] + 12 * Math.floor(i / v.length);
/** Broken chord: idx list into the close voicing starting at `lo`, one per `step`. */
function arp(S, part, b, ch, idx, step, lo, vel = 0.6, d = step * 2) {
  const v = voicing(ch.tones, lo);
  idx.forEach((i, k) => { if (i != null) S.note(part, b + k * step, d, tone(v, i), vel); });
}
function block(S, part, b, d, ch, lo, vel = 0.6, o) {
  for (const m of voicing(ch.tones, lo)) S.note(part, b, d, m, vel, o);
}
/** Each bar's chord list (one or two chords per bar) → [{ch, b, d}] */
function eachChord(S, prog, fn) {
  prog.forEach((cs, bar) => cs.forEach((ch, k) => { const d = S.meter / cs.length; fn(ch, S.bar(bar) + k * d, d, bar, k); }));
}
const drums4 = (S, bars, { kick = 'X...x.....x.....', snare = '....X.......X...', hat = 'x.x.x.x.x.x.x.x.', from = 0 } = {}) => {
  for (let bar = from; bar < bars; bar++) {
    const b = S.bar(bar);
    if (kick) S.pat('kick', b, kick, 0.25);
    if (snare) S.pat('snare', b, snare, 0.25);
    if (hat) S.pat('hat', b, hat, 0.25);
  }
};

export const TRACKS = {
  // ------------------------------------------------------------ title
  title: {
    bpm: 132, meter: 4, bars: 16, key: 'D major', reverb: 0.22,
    desc: 'Bright J-pop "royal road" progression (IV–V–iii–vi). Piano broken chords + glockenspiel doubling the melody, light kit, round bass, strings in the B half.',
    motif: 'B4–D5–F#5 rising pickup into a held F#, answered by A5 on the V chord.',
    parts: {
      lead: { inst: 'piano', gain: 1.0 }, glock: { inst: 'glock', gain: 0.75, oct: 1 },
      keys: { inst: 'piano', gain: 0.55 }, bass: { inst: 'bass', gain: 0.85 }, str: { inst: 'pad', gain: 0.9 },
      kick: { inst: 'kick', gain: 0.75 }, snare: { inst: 'clap', gain: 0.55 }, hat: { inst: 'hat', gain: 0.6 }, crash: { inst: 'crash', gain: 0.6 },
    },
    build(S) {
      const P = S.prog(['G', 'A', 'F#m', 'Bm', 'G', 'A', 'D', 'D', 'Em7', 'A7sus4 A7', 'F#m7', 'Bm7', 'G', 'A', 'Bm', 'A']);
      const mel = [
        'B4:.5 D5:.5 F#5:1 E5:.5 D5:.5 E5:1', 'C#5:.5 E5:.5 A5:1.5 G5:.5 F#5:.5 E5:.5', 'F#5:1 E5:.5 C#5:.5 A4:1 C#5:1', 'D5:1.5 C#5:.5 B4:2',
        'B4:.5 D5:.5 F#5:1 E5:.5 D5:.5 E5:1', 'C#5:.5 E5:.5 A5:1.5 B5:.5 A5:.5 G5:.5', 'F#5:1.5 E5:.5 D5:1 E5:.5 F#5:.5', 'D5:3 r:1',
        'G5:.5 G5:.5 F#5:.5 G5:1 A5:.5 B5:1', 'A5:1.5 G5:.5 E5:1 C#5:1', 'F#5:.5 F#5:.5 E5:.5 F#5:1 G5:.5 A5:1', 'B5:2 A5:1 F#5:1',
        'G5:1 F#5:.5 E5:.5 D5:1 B4:1', 'C#5:1 D5:.5 E5:.5 A5:2', 'F#5:1.5 E5:.5 D5:1 C#5:1', 'E5:2 C#5:1 A4:1',
      ];
      mel.forEach((m, i) => { S.mel('lead', S.bar(i), m, 0.75); if (i < 8 || i >= 12) S.mel('glock', S.bar(i), m, 0.5); });
      eachChord(S, P, (ch, b, d, bar) => {
        arp(S, 'keys', b, ch, [0, 1, 2, 3, 4, 3, 2, 1].slice(0, d * 2), 0.5, 55, 0.45, 1);
        S.note('bass', b, 1.5, ch.bass, 0.8); S.note('bass', b + 1.5, 0.5, ch.bass + 12, 0.5); S.note('bass', b + 2, 1, ch.bass, 0.7); S.note('bass', b + 3, 1, ch.bass + 7, 0.6);
        if (bar >= 8) block(S, 'str', b, d, ch, 62, 0.55);
        if (bar >= 8) S.pat('glock', b, '..x...x...x...x.', 0.25, ch.tones[2] + 12, 0.25);
      });
      drums4(S, 16, { kick: 'X.......X.x.....', snare: '....x.......x...', hat: 'x-x-x-x-x-x-x-x-' });
      for (const bar of [0, 8]) S.note('crash', S.bar(bar), 2, null, 0.7);
    },
  },

  // ------------------------------------------------------------ classroom (+ tension layers)
  classroom: {
    bpm: 76, meter: 4, bars: 16, key: 'F major', reverb: 0.18, swing: 0.16, swingUnit: 0.25,
    fx: { lowpass: 6200, wow: 7 }, beds: [{ kind: 'crackle', gain: 0.5, len: 3, layer: 'main' }],
    desc: 'Lazy lo-fi: Rhodes (FM) seventh chords played late, swung soft kit, round bass, vinyl crackle, tape wow, and a tick-tock wall clock on every beat. Tension layers: tremolo strings, low 8th pulse, heartbeat (doubles at the top), eerie high minor-2nd; the kit drops out as tension peaks.',
    motif: 'A–G–E…C yawning descent over Fmaj7, answered a bar later by D (the 7th of Em7).',
    parts: {
      ep: { inst: 'epiano', gain: 0.75, late: 0.02, human: 0.012 }, lead: { inst: 'epiano', gain: 0.7, late: 0.01, human: 0.01 },
      bass: { inst: 'bass', gain: 0.9 }, clock: { inst: 'tick', gain: 0.32, layer: 'clock', human: 0 },
      kick: { inst: 'kick', gain: 0.55, o: { soft: true }, layer: 'drums' }, snare: { inst: 'snare', gain: 0.38, o: { soft: true }, layer: 'drums', late: 0.012 },
      hat: { inst: 'hat', gain: 0.4, layer: 'drums', human: 0.008 },
      tStr: { inst: 'pad', gain: 1.1, layer: 'tStr', o: { trem: 12, attack: 0.25 } },
      tPulse: { inst: 'bass', gain: 0.8, layer: 'tPulse', o: { type: 'pick' }, human: 0 },
      tHeart: { inst: 'heart', gain: 1, layer: 'tHeart', human: 0 }, tHeart2: { inst: 'heart', gain: 0.9, layer: 'tHeart2', human: 0 },
      tHigh: { inst: 'violin', gain: 0.5, layer: 'tHigh', o: { vib: 30, attack: 0.6 } },
    },
    layers: {
      main: (t) => 1 - 0.35 * t, drums: (t) => 1 - 0.85 * smooth(0.55, 0.95, t), clock: (t) => 1 + 0.6 * t,
      tStr: (t) => smooth(0.15, 0.5, t), tPulse: (t) => smooth(0.35, 0.7, t), tHeart: (t) => smooth(0.5, 0.8, t),
      tHeart2: (t) => smooth(0.82, 1, t), tHigh: (t) => 0.8 * smooth(0.7, 1, t),
    },
    build(S) {
      const P = S.prog(['Fmaj7', 'Em7 A7', 'Dm9', 'Cm7 F7', 'Bbmaj7', 'Am7', 'Gm7', 'C7sus4', 'Fmaj7', 'Em7 A7', 'Dm9', 'Cm7 F7', 'Bbmaj7', 'Bbm6', 'Am7', 'Gm7 C7']);
      const mel = [
        'r:1 A5:.5 G5:.5 E5:1.5 C5:.5', 'D5:2 r:2', 'r:1 F5:.5 E5:.5 C5:1 A4:1', 'Bb4:1.5 A4:.5 G4:2',
        'r:.5 D5:.5 F5:.5 A5:1.5 G5:1', 'E5:2 r:1 C5:1', 'F5:1 E5:.5 D5:.5 Bb4:2', 'C5:3 r:1',
        'r:1 A5:.5 G5:.5 E5:1 F5:.5 C5:.5', 'D5:1.5 E5:.5 r:2', 'r:1 F5:.5 A5:.5 G5:1 E5:1', 'D5:1.5 C5:.5 A4:2',
        'r:1 D5:.5 F5:.5 A5:2', 'Ab5:1.5 G5:.5 F5:1 Db5:1', 'E5:2 C5:2', 'D5:1 E5:.5 G5:.5 C5:2',
      ];
      mel.forEach((m, i) => S.mel('lead', S.bar(i), m, 0.55));
      eachChord(S, P, (ch, b, d, bar, k) => {
        block(S, 'ep', b, d - 0.3, ch, 53, 0.5);
        if (d === 4 && bar % 2 === 1) block(S, 'ep', b + 2.5, 1.2, ch, 53, 0.3);
        S.note('bass', b, Math.min(d, 1.5), ch.bass, 0.75);
        if (d === 4) { S.note('bass', b + 2.5, 0.5, ch.bass + 7, 0.5); S.note('bass', b + 3.5, 0.5, ch.bass + 12, 0.4); }
        // tension layers
        const v = voicing(ch.tones, 64);
        S.note('tStr', b, d, v[1], 0.6); S.note('tStr', b, d, v[v.length - 1], 0.6); S.note('tStr', b, d, ch.root + 12, 0.5);
        for (let i = 0; i < d * 2; i++) S.note('tPulse', b + i * 0.5, 0.3, ch.bass - 12 + 12, i % 2 ? 0.55 : 0.8);
        if (k === 0) S.note('tHigh', b, S.meter, bar % 2 ? 'F6' : 'E6', 0.5);
      });
      for (let bar = 0; bar < 16; bar++) {
        const b = S.bar(bar);
        for (let i = 0; i < 4; i++) { S.note('clock', b + i, 0.1, i % 2 ? 'G7' : 'D8', 0.8); S.note('tHeart', b + i, 0.5, null, 0.8); S.note('tHeart2', b + i + 0.5, 0.5, null, 0.7); }
        S.pat('kick', b, bar % 4 === 3 ? 'X.........x..x..' : 'X.........x.....', 0.25);
        S.pat('snare', b, '....x.......x..-', 0.25);
        S.pat('hat', b, 'x.x-x.x.x.x-x.x.', 0.25);
      }
    },
  },

  // ------------------------------------------------------------ flight
  flight: {
    bpm: 112, gain: 1.15, meter: 4, bars: 16, key: 'A major (pedal A)', reverb: 0.3,
    desc: 'Breath-held hover: pizzicato and harp climb rising scales over an A pedal, suspended chords never resolve, glockenspiel shimmer, high strings swell, shaker ticking, timpani lifts.',
    motif: 'A rising 16th-note pizzicato scale A4→A5 that stops on a held B (sus2) — "the ball at its apex".',
    parts: {
      pz: { inst: 'pizz', gain: 1.0 }, harp: { inst: 'harp', gain: 0.8 }, glock: { inst: 'glock', gain: 0.55 },
      str: { inst: 'pad', gain: 0.9, o: { attack: 1.2, release: 1 } }, bass: { inst: 'bass', gain: 0.7, o: { type: 'sub' } },
      shaker: { inst: 'shaker', gain: 0.8 }, timp: { inst: 'timpani', gain: 0.6 },
      tStr: { inst: 'pad', gain: 0.9, layer: 'tStr', o: { trem: 13, attack: 0.2 } },
    },
    layers: { tStr: (t) => smooth(0.3, 0.8, t) },
    build(S) {
      const P = S.prog(['Asus2', 'Bm7/A', 'Asus4', 'Aadd9', 'D/A', 'E/A', 'F#m/A', 'Esus4', 'Dmaj7', 'E', 'C#m7', 'F#m', 'Dmaj7', 'E', 'Asus4', 'E7sus4']);
      eachChord(S, P, (ch, b, d, bar) => {
        S.note('bass', b, 4, bar < 8 ? 'A1' : ch.bass, 0.7);
        block(S, 'str', b, 4, ch, 69, 0.5);
        S.note('tStr', b, 4, ch.tones[1] + 24, 0.6); S.note('tStr', b, 4, ch.tones[0] + 24, 0.5);
        if (bar % 2 === 0) {
          S.mel('pz', b, 'A4:.25 B4 C#5 D5 E5 F#5 G#5 A5 B5:2', 0.75, undefined);
        } else {
          arp(S, 'pz', b, ch, [0, 1, 2, 3, 2, 3, 4, 5], 0.5, 64, 0.65, 0.5);
        }
        S.note('harp', b + 3, 1, ch.tones[0] + 24, 0.5);
        S.note('glock', b, 3, bar % 2 ? 'E6' : 'A6', 0.5);
        S.pat('glock', b, '......x.......x.', 0.25, ch.tones[2] + 24, 0.3);
        S.pat('shaker', b, 'x-x-x-x-x-x-x-x-', 0.25);
        if (bar % 8 === 7) for (let i = 0; i < 12; i++) S.note('timp', b + 2 + i / 6, 0.2, 'A2', 0.25 + i * 0.05);
      });
    },
  },

  // ------------------------------------------------------------ romance
  romance: {
    bpm: 72, gain: 1.2, meter: 4, bars: 16, key: 'G major', reverb: 0.38,
    desc: 'Tender pop ballad (I–V/7–vi–IV): piano melody over left-hand 8th arpeggios, string pad from bar 5, a cello-like violin countermelody in the second half, glockenspiel sparkle at the phrase ends.',
    motif: 'B4–D5 then a leap up to a held G5 (a rising sixth), sighing back down F#–E.',
    parts: {
      lead: { inst: 'piano', gain: 1.0, o: { ring: 1.3 } }, lh: { inst: 'piano', gain: 0.5, o: { ring: 1.4 } },
      str: { inst: 'pad', gain: 0.85, o: { attack: 0.9, release: 1.2 } }, cello: { inst: 'violin', gain: 0.75, o: { vib: 14, attack: 0.15, cutoff: 3000 } },
      bass: { inst: 'bass', gain: 0.6, o: { type: 'sub' } }, glock: { inst: 'glock', gain: 0.5 },
    },
    build(S) {
      const P = S.prog(['G', 'D/F#', 'Em', 'C', 'G', 'D', 'C', 'D', 'Em', 'C', 'G', 'D', 'C', 'D/F#', 'G', 'Gsus4 G']);
      const mel = [
        'B4:1 D5:.5 G5:1.5 F#5:.5 E5:.5', 'D5:2 A4:1 B4:1', 'G4:1 B4:.5 E5:1.5 D5:.5 C5:.5', 'B4:1.5 A4:.5 G4:1 E4:1',
        'B4:1 D5:.5 G5:1.5 A5:.5 B5:.5', 'A5:2 F#5:1 D5:1', 'E5:1 G5:.5 E5:.5 D5:1 C5:1', 'D5:3 r:1',
        'G5:1.5 F#5:.5 E5:1 B4:1', 'C5:1 E5:.5 G5:1.5 A5:1', 'B5:1.5 A5:.5 G5:1 D5:1', 'F#5:2 E5:1 D5:1',
        'E5:1 G5:1 C6:1.5 B5:.5', 'A5:2 D5:1 F#5:1', 'G5:4', 'r:2 G4:1 A4:1',
      ];
      mel.forEach((m, i) => S.mel('lead', S.bar(i), m, 0.7));
      ['E3:2 F#3:2', 'G3:4', 'D3:2 G3:2', 'A3:4', 'G3:2 E3:2', 'F#3:4', 'D3:4', 'r:4'].forEach((m, i) => S.mel('cello', S.bar(8 + i), m, 0.6));
      eachChord(S, P, (ch, b, d, bar) => {
        arp(S, 'lh', b, ch, [0, 1, 2, 3, 4, 3, 2, 1].slice(0, d * 2), 0.5, 43, 0.4, 1.5);
        S.note('bass', b, d, ch.bass, 0.5);
        if (bar >= 4) block(S, 'str', b, d, ch, 60, 0.45);
      });
      for (const bar of [7, 15]) S.mel('glock', S.bar(bar) + 2, 'G6:.5 D6:.5 B5:.5 G5:.5', 0.4);
    },
  },

  // ------------------------------------------------------------ comedy
  comedy: {
    bpm: 140, gain: 1.5, meter: 4, bars: 16, key: 'F major', reverb: 0.12,
    desc: 'Bouncy cartoon oom-pah: tuba on the beat, pizzicato chord stabs off the beat, staccato bassoon tune, xylophone takes the B section, brushy snare and woodblock, a xylophone glissando "boing".',
    motif: 'C–D–E–F scamper up to a hopping A–F, bassoon staccato (the "sneaky clumsy" theme).',
    parts: {
      bsn: { inst: 'bassoon', gain: 1.0, legato: 0.55 }, xylo: { inst: 'xylo', gain: 0.8 }, tuba: { inst: 'tuba', gain: 0.85, legato: 0.6 },
      pz: { inst: 'pizz', gain: 0.75 }, snare: { inst: 'snare', gain: 0.3, o: { soft: true } }, wood: { inst: 'wood', gain: 0.5, f: 1100 },
    },
    build(S) {
      const P = S.prog(['F', 'C7', 'C7', 'F', 'F', 'Bb', 'C7', 'F', 'Bb', 'F', 'C7', 'F', 'Bb', 'F/C', 'C7', 'F']);
      const bsn = [
        'C4:.5 D4:.5 E4:.5 F4:.5 A4:1 F4:1', 'G4:1 E4:.5 C4:.5 G3:1 r:1', 'Bb3:.5 C4:.5 D4:.5 E4:.5 G4:1 E4:1', 'F4:1 C4:1 F3:1 r:1',
        'A4:.5 A4:.5 Bb4:.5 A4:.5 G4:1 F4:1', 'D4:1 F4:1 Bb4:1.5 r:.5', 'A4:.5 G4:.5 F4:.5 E4:.5 D4:.5 C4:.5 Bb3:.5 G3:.5', 'F3:1 r:1 C4:.5 F4:.5 r:1',
      ];
      bsn.forEach((m, i) => S.mel('bsn', S.bar(i), m, 0.85));
      ['D5:.5 F5:.5 Bb5:.5 F5:.5 D5:1 r:1', 'C5:.5 F5:.5 A5:.5 F5:.5 C5:1 r:1', 'E5:.5 G5:.5 Bb5:.5 G5:.5 E5:.5 C5:.5 r:1', 'F5:1 A5:.5 C6:1.5 r:1']
        .forEach((m, i) => S.mel('xylo', S.bar(8 + i), m, 0.8));
      ['Bb3:.5 D4:.5 F4:.5 Bb4:.5 A4:.5 G4:.5 F4:.5 D4:.5', 'C4:1 A3:1 F3:1 r:1', 'G3:.5 G#3:.5 A3:.5 Bb3:.5 B3:.5 C4:.5 C#4:.5 D4:.5', 'F4:.5 r:.5 C4:.5 r:.5 F3:1 r:1']
        .forEach((m, i) => S.mel('bsn', S.bar(12 + i), m, 0.85));
      S.mel('xylo', S.bar(7) + 3, 'C5:.125 D5 E5 F5 G5 A5 Bb5 C6', 0.6);
      eachChord(S, P, (ch, b) => {
        S.note('tuba', b, 1, ch.bass, 0.85); S.note('tuba', b + 2, 1, ch.bass + 7 > 47 ? ch.bass - 5 : ch.bass + 7, 0.75);
        for (const off of [1, 3]) block(S, 'pz', b + off, 0.4, ch, 57, 0.6);
        S.pat('snare', b, '....x.......x...', 0.25);
        S.pat('wood', b, '..x.......x.....', 0.25);
      });
    },
  },

  // ------------------------------------------------------------ tragedy
  tragedy: {
    bpm: 66, meter: 4, bars: 16, key: 'D minor', reverb: 0.45,
    desc: 'Over-the-top melodrama: sobbing solo violin with heavy vibrato and slides, tremolo string pad, doom piano octaves on the downbeats, sub bass, timpani rolls and cymbal swells. Outro: Gm–A7–Dm cadence with a timpani roll when the ending card appears.',
    motif: 'D–F–A rising cry held on A5, then a sighing G–F–E–D.',
    parts: {
      vln: { inst: 'violin', gain: 1.15, o: { vib: 24, attack: 0.1 } }, str: { inst: 'pad', gain: 0.9, o: { trem: 9, attack: 0.5, release: 1 } },
      pno: { inst: 'piano', gain: 0.7, o: { ring: 1.6 } }, bass: { inst: 'bass', gain: 0.8, o: { type: 'sub' } },
      timp: { inst: 'timpani', gain: 0.75 }, crash: { inst: 'crash', gain: 0.5 },
    },
    build(S) {
      const P = S.prog(['Dm', 'Gm/Bb', 'A7', 'Dm', 'Dm', 'Bb', 'Gm', 'A7', 'F', 'C', 'Dm', 'Bb', 'Gm', 'Dm/A', 'A7', 'Dm']);
      const mel = [
        'D5:1 F5:1 A5:2', 'G5:1.5 F5:.5 E5:1 D5:1', 'C#5:1 E5:1 A5:1.5 G5:.5', 'F5:2 E5:1 D5:1',
        'D5:1 F5:1 A5:1 D6:1', 'D6:1.5 C6:.5 Bb5:1 A5:1', 'G5:1 Bb5:1 E5:1.5 G5:.5', 'A5:3 r:1',
        'C6:2 A5:1 F5:1', 'E5:1.5 G5:.5 C6:2', 'D6:1.5 C6:.5 A5:1 F5:1', 'Bb5:2 D6:2',
        'G5:1 Bb5:1 D6:1 G6:1', 'F6:2 E6:1 D6:1', 'E6:2 C#6:1 A5:1', 'D6:3 r:1',
      ];
      mel.forEach((m, i) => S.mel('vln', S.bar(i), m, 0.8));
      eachChord(S, P, (ch, b, d, bar) => {
        block(S, 'str', b, d, ch, 55, 0.5);
        S.note('bass', b, d, ch.bass, 0.75);
        S.note('pno', b, 2, ch.bass, 0.75); S.note('pno', b, 2, ch.bass + 12, 0.6);
        if ([0, 3, 11].includes(bar)) S.note('timp', b, 1, ch.bass + 12, 0.8);
        if (bar === 7 || bar === 15) for (let i = 0; i < 16; i++) S.note('timp', b + 2 + i / 8, 0.2, 'A2', 0.2 + i * 0.04);
      });
      S.note('crash', S.bar(12) - 2, 2, null, 0.6, { swell: true });
    },
    outro(S) {
      S.mel('vln', 0, 'Bb5:2 A5:2 D6:6', 0.9);
      block(S, 'str', 0, 2, S.chord('Gm'), 55, 0.6); block(S, 'str', 2, 2, S.chord('A7'), 55, 0.6); block(S, 'str', 4, 6, S.chord('Dm'), 55, 0.7);
      S.note('bass', 0, 2, 'G2', 0.8); S.note('bass', 2, 2, 'A2', 0.8); S.note('bass', 4, 6, 'D2', 0.9);
      S.note('pno', 4, 4, 'D2', 0.9); S.note('pno', 4, 4, 'D3', 0.7); S.note('pno', 4, 4, 'A3', 0.6);
      for (let i = 0; i < 14; i++) S.note('timp', 2 + i / 7, 0.2, 'A2', 0.3 + i * 0.04);
      S.note('timp', 4, 2, 'D3', 1); S.note('crash', 4, 2, null, 0.8);
      return 10;
    },
  },

  // ------------------------------------------------------------ shame
  shame: {
    bpm: 60, meter: 4, bars: 16, key: 'none (Bb minor tuba)', reverb: 0.3, gain: 3.5,
    desc: 'Social-death silence: two crickets out of phase, an awkward wall clock, and once in a while a lonely tuba — a sad-trombone "wah-wah-wah-waaah" at bar 8 and a single low "bwomp" at bar 14.',
    motif: 'D3–C#3–C3–B2 descending sad-trombone with wobble and wah mute.',
    parts: {
      cr1: { inst: 'cricket', gain: 0.9, human: 0.02 }, cr2: { inst: 'cricket', gain: 0.6, human: 0.03 },
      clock: { inst: 'tick', gain: 0.25, human: 0 }, tuba: { inst: 'tuba', gain: 0.4, o: { wah: 5 } },
    },
    build(S) {
      for (let bar = 0; bar < 16; bar++) {
        const b = S.bar(bar);
        for (let i = 0; i < 4; i++) {
          S.note('cr1', b + i, 0.1, null, 0.8, { pulses: 3 }); S.note('clock', b + i, 0.1, i % 2 ? 'G7' : 'D8', 0.7);
          if (bar % 2 === 0 || i % 2 === 0) S.note('cr2', b + i + 0.55, 0.1, null, 0.7, { pulses: 4 });
        }
      }
      S.mel('tuba', S.bar(7), 'D3:.75 C#3:.75 C3:.75 B2:2.75', 0.85);
      S.note('tuba', S.bar(13), 1.2, 'Bb1', 0.9);
    },
  },

  // ------------------------------------------------------------ sports
  sports: {
    bpm: 150, meter: 4, bars: 16, key: 'E minor', reverb: 0.15,
    desc: 'Hype stadium anthem: four-on-the-floor kick, snare + claps on 2 and 4, driving 8th picked bass, brass section stabs and a fanfare lead, tom fills every 4 bars, crashes on phrase starts.',
    motif: 'E–E–G–B fanfare pickup to a held B, then a big leap to E5 (brass).',
    parts: {
      lead: { inst: 'brass', gain: 1.0 }, stab: { inst: 'brass', gain: 0.6, legato: 0.5 }, bass: { inst: 'bass', gain: 0.85, o: { type: 'pick' }, legato: 0.7 },
      kick: { inst: 'kick', gain: 0.85 }, snare: { inst: 'snare', gain: 0.7 }, clap: { inst: 'clap', gain: 0.55 }, hat: { inst: 'hat', gain: 0.6 },
      tom: { inst: 'tom', gain: 0.7 }, crash: { inst: 'crash', gain: 0.7 },
    },
    build(S) {
      const P = S.prog(['Em', 'C', 'D', 'B7', 'Em', 'C', 'D', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'D', 'B7sus4', 'B7']);
      const mel = [
        'E4:.5 E4:.5 G4:.5 B4:1.5 A4:.5 G4:.5', 'E5:1.5 D5:.5 C5:1 G4:1', 'F#4:.5 A4:.5 D5:1 E5:.5 F#5:1.5', 'D#5:2 B4:1 F#4:1',
        'E4:.5 E4:.5 G4:.5 B4:1.5 A4:.5 G4:.5', 'E5:1.5 D5:.5 C5:1 G4:1', 'F#4:.5 A4:.5 D5:1 E5:.5 F#5:1.5', 'E5:2 r:2',
        'G5:1 E5:.5 G5:.5 C6:2', 'A5:1 F#5:.5 A5:.5 D6:2', 'B5:1.5 A5:.5 G5:1 E5:1', 'B4:.5 D5:.5 E5:.5 G5:.5 B5:2',
        'C6:1.5 B5:.5 A5:1 G5:1', 'A5:1.5 G5:.5 F#5:1 D5:1', 'E5:2 F#5:2', 'D#5:2 F#5:1 B5:1',
      ];
      mel.forEach((m, i) => S.mel('lead', S.bar(i), m, 0.85));
      eachChord(S, P, (ch, b, d, bar) => {
        for (const off of [0, 1.5, 3]) block(S, 'stab', b + off, 0.35, ch, 55, 0.7);
        for (let i = 0; i < 8; i++) S.note('bass', b + i * 0.5, 0.5, ch.bass + (i === 7 ? 7 : 0), i % 2 ? 0.6 : 0.85);
        S.pat('kick', b, 'X...X...X...X...', 0.25);
        S.pat('snare', b, '....X.......X...', 0.25); S.pat('clap', b, '....x.......x...', 0.25);
        S.pat('hat', b, '..x...x...x...x.', 0.25);
        if (bar % 4 === 3) S.pat('tom', b + 2, 'xxxxXX..', 0.25, 'G2', 0.8);
        if (bar % 4 === 0) S.note('crash', b, 2, null, 0.8);
      });
    },
  },

  // ------------------------------------------------------------ broadcast
  broadcast: {
    bpm: 108, meter: 4, bars: 18, loopFrom: 2, key: 'C major', reverb: 0.2,
    fx: { radio: true, echo: { time: 0.12, fb: 0.25, mix: 0.35, lp: 2800 } }, beds: [{ kind: 'hiss', gain: 0.04, len: 2 }],
    desc: 'Campus PA: a 4-note "ding-dong" PA chime intro (once), then a cheerful school march (glockenspiel + piano oom-pah + march snare), all through a band-limited, saturated "loudspeaker" chain with slap-back echo and tape hiss.',
    motif: 'C5–E5–G5–C6 chime, then E–G–C6 march tune leaping up an octave.',
    parts: {
      chime: { inst: 'bell', gain: 1.1, o: { kind: 'chime' } }, glock: { inst: 'glock', gain: 0.9 }, lead: { inst: 'piano', gain: 0.8 },
      pno: { inst: 'piano', gain: 0.6 }, tuba: { inst: 'tuba', gain: 0.6, legato: 0.6 }, snare: { inst: 'snare', gain: 0.5 }, kick: { inst: 'kick', gain: 0.5 },
    },
    build(S) {
      S.mel('chime', 0, 'C5:1 E5:1 G5:1 C6:3 r:2', 0.8);
      const P = S.prog(['C', 'G7', 'C', 'G7', 'C', 'F', 'G7', 'C', 'F', 'C', 'G7', 'C', 'F', 'C', 'G7', 'C']);
      const mel = [
        'E5:1 G5:1 C6:1.5 G5:.5', 'F5:1 D5:1 B4:2', 'C5:1 E5:1 G5:1 E5:1', 'D5:2 G4:2',
        'E5:1 G5:1 C6:1.5 D6:.5', 'C6:1 A5:1 F5:2', 'G5:1 F5:.5 E5:.5 D5:1 B4:1', 'C5:2 r:2',
        'A5:1.5 G5:.5 F5:1 A5:1', 'G5:1.5 F5:.5 E5:1 G5:1', 'F5:1 E5:1 D5:1 F5:1', 'E5:3 r:1',
        'A5:1.5 G5:.5 F5:1 A5:1', 'G5:1 C6:1 E5:2', 'D5:1 E5:.5 F5:.5 G5:1 B4:1', 'C5:2 r:2',
      ];
      mel.forEach((m, i) => { S.mel('glock', S.bar(i + 2), m, 0.6); S.mel('lead', S.bar(i + 2), m, 0.55); });
      P.forEach((cs, i) => {
        const ch = cs[0], b = S.bar(i + 2);
        S.note('tuba', b, 1, ch.bass, 0.8); S.note('tuba', b + 2, 1, ch.bass + 7 > 47 ? ch.bass - 5 : ch.bass + 7, 0.7);
        block(S, 'pno', b + 1, 0.5, ch, 60, 0.5); block(S, 'pno', b + 3, 0.5, ch, 60, 0.5);
        S.pat('snare', b, i % 4 === 3 ? 'x.x.x.x.x-x-XXXX' : 'x.-.x.-.x.-.x-x-', 0.25);
        S.pat('kick', b, 'x.......x.......', 0.25);
      });
    },
  },

  // ------------------------------------------------------------ lonely
  lonely: {
    bpm: 84, gain: 1.5, meter: 3, bars: 16, key: 'A minor (3/4)', reverb: 0.5,
    fx: { echo: { time: 0.357, fb: 0.32, mix: 0.3, lp: 2200 } },
    desc: 'Night in the empty classroom: a slightly wobbly music box waltz (high comb tines with loose timing) over a soft dark pad, long echo and reverb.',
    motif: 'E6–C6–A5 falling triad, then C6–B5–A5 — a lullaby that never quite resolves.',
    parts: {
      box: { inst: 'musicbox', gain: 1.0, human: 0.018 }, acc: { inst: 'musicbox', gain: 0.55, human: 0.02 },
      pad: { inst: 'pad', gain: 0.7, o: { cutoff: 800, attack: 1.2, release: 1.5 } },
    },
    build(S) {
      const P = S.prog(['Am', 'F', 'C', 'G', 'Am', 'F', 'E7', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'E7', 'Am', 'Am']);
      const mel = ['E6:1 C6:1 A5:1', 'C6:1.5 B5:.5 A5:1', 'G5:1 E5:1 G5:1', 'B5:2 G5:1', 'E6:1 C6:1 A5:1', 'A5:1.5 B5:.5 C6:1', 'B5:1 G#5:1 E5:1', 'A5:3',
        'F5:1 A5:1 C6:1', 'D6:1.5 C6:.5 B5:1', 'C6:1 E6:1 G6:1', 'E6:3', 'F6:1 E6:1 D6:1', 'B5:1.5 C6:.5 D6:1', 'C6:1 B5:1 A5:1', 'A5:2 r:1'];
      mel.forEach((m, i) => S.mel('box', S.bar(i), m, 0.7));
      eachChord(S, P, (ch, b, d) => {
        S.note('acc', b, 1, ch.root + 12, 0.6);
        const v = voicing(ch.tones, 64);
        S.note('acc', b + 1, 1, v[1], 0.45); S.note('acc', b + 2, 1, v[2] ?? v[0] + 12, 0.45);
        block(S, 'pad', b, d, ch, 52, 0.4);
      });
    },
  },

  // ------------------------------------------------------------ mystery
  mystery: {
    bpm: 92, gain: 1.8, meter: 4, bars: 16, key: 'A minor / harmonic minor', reverb: 0.45,
    fx: { echo: { time: 0.49, fb: 0.4, mix: 0.25, lp: 1800 } },
    desc: 'Hidden-ending intrigue: open-fifth drone, celesta arpeggios over lydian / b9 colours, sneaky walking pizzicato bass, theremin lead with portamento from bar 5, a soft gong-like timpani at the top.',
    motif: 'Chromatic creep F5–E5–D#5 resolving to a lydian #11 (E over Bb) — the "something is off" figure.',
    parts: {
      cel: { inst: 'celesta', gain: 0.8 }, thr: { inst: 'theremin', gain: 1.0 }, pz: { inst: 'pizz', gain: 0.9 },
      drone: { inst: 'pad', gain: 0.8, o: { cutoff: 600, attack: 2, release: 2 } }, timp: { inst: 'timpani', gain: 0.5, o: { tau: 1.2 } }, sh: { inst: 'shaker', gain: 0.4 },
    },
    build(S) {
      const P = S.prog(['Amadd9', 'Fmaj7#11', 'Amadd9', 'E7b9', 'Dm9', 'Bbmaj7#11', 'E7sus4', 'E7b9', 'Amadd9', 'Fmaj7#11', 'Am', 'E7b9', 'Fmaj7', 'Am', 'Dm6', 'E7b9']);
      const thr = ['F5:2 E5:1 D#5:1', 'E5:3 r:1', 'A5:1 G#5:.5 A5:.5 B5:2', 'F5:2 G#5:2', 'B5:2 C6:1 E6:1', 'B5:3 r:1', 'A5:1 C6:1 E5:2', 'D#5:1 E5:1 F5:2',
        'C6:2 B5:1 G#5:1', 'A5:2 E5:2', 'F5:1.5 E5:.5 D5:1 C5:1', 'B4:2 G#4:2'];
      thr.forEach((m, i) => S.mel('thr', S.bar(i + 4), m, 0.7));
      const walk = ['A2 E3 A2 G#2', 'F2 C3 F2 B2', 'A2 C3 E3 C3', 'E2 G#2 B2 D3', 'D2 F2 A2 C3', 'Bb1 F2 Bb2 E2', 'E2 A2 B2 D3', 'E2 F2 G#2 B2'];
      eachChord(S, P, (ch, b, d, bar) => {
        arp(S, 'cel', b, ch, [0, 2, 1, 3, 2, 4, 3, 5], 0.5, 69, 0.45, 0.7);
        walk[bar % 8].split(' ').forEach((n, k) => S.note('pz', b + k, 0.8, n, 0.7));
        if (bar % 4 === 0) { S.note('drone', b, 16, 'A2', 0.6); S.note('drone', b, 16, 'E3', 0.5); }
        S.pat('sh', b, '..x...x...x...x.', 0.25);
      });
      S.note('timp', 0, 2, 'A1', 0.7); S.note('timp', S.bar(8), 2, 'A1', 0.6);
    },
  },

  // ------------------------------------------------------------ victory
  victory: {
    bpm: 128, gain: 1.3, meter: 4, bars: 16, loopFrom: 4, key: 'Bb major', reverb: 0.25,
    desc: 'Short triumphant fanfare: a 4-bar brass call with triplet pickups, snare roll and cymbal (once), then a 12-bar festive march loop (brass + glockenspiel, march kit, timpani on roots). Outro: Eb–F–Bb cadence with roll and crash when the card appears.',
    motif: 'F–F–F triplet into a held Bb ("da-da-da DAAA"), repeated a third higher.',
    parts: {
      lead: { inst: 'brass', gain: 1.05 }, stab: { inst: 'brass', gain: 0.55, legato: 0.6 }, glock: { inst: 'glock', gain: 0.6 },
      bass: { inst: 'tuba', gain: 0.6, legato: 0.7 }, snare: { inst: 'snare', gain: 0.55 }, kick: { inst: 'kick', gain: 0.6 },
      timp: { inst: 'timpani', gain: 0.6 }, crash: { inst: 'crash', gain: 0.7 },
    },
    build(S) {
      const fan = ['F4:.333 F4:.333 F4:.334 Bb4:2 C5:1', 'D5:.333 D5:.333 D5:.334 F5:2 Eb5:.5 D5:.5', 'C5:.333 C5:.333 C5:.334 Eb5:1 D5:1 C5:1', 'Bb5:3 r:1'];
      fan.forEach((m, i) => S.mel('lead', S.bar(i), m, 0.9));
      ['Bb', 'Eb F', 'Gm F', 'Bb'].map((s) => s.split(' ').map(S.chord)).forEach((cs, bar) => cs.forEach((ch, k) => {
        const b = S.bar(bar) + k * 2; block(S, 'stab', b, cs.length === 1 ? 3 : 1.5, ch, 53, 0.6); S.note('timp', b, 1, ch.bass + 12, 0.7);
      }));
      for (let i = 0; i < 16; i++) S.note('snare', S.bar(3) + i * 0.125, 0.1, null, 0.3 + i * 0.03);
      S.note('crash', S.bar(3), 2, null, 0.9); S.note('crash', S.bar(4), 2, null, 0.8);
      const P = S.prog(['Bb', 'F', 'Bb', 'Eb', 'Bb', 'F', 'Gm', 'F', 'Eb', 'F', 'Bb', 'Bb']);
      const mel = ['D5:1 F5:1 Bb5:1.5 A5:.5', 'G5:1 F5:1 C5:2', 'D5:1 F5:1 Bb5:1 D6:1', 'C6:2 G5:2', 'F5:1.5 D5:.5 Bb4:1 D5:1', 'C5:1.5 Eb5:.5 A4:2',
        'Bb4:1 D5:1 G5:2', 'F5:1 G5:.5 F5:.5 Eb5:1 C5:1', 'Bb4:1 Eb5:1 G5:1.5 Bb5:.5', 'A5:1 C6:1 F5:2', 'Bb5:1 F5:.5 D5:.5 Bb4:1 F5:1', 'Bb5:2 r:2'];
      mel.forEach((m, i) => { S.mel('lead', S.bar(4 + i), m, 0.8); S.mel('glock', S.bar(4 + i), m, 0.4); });
      P.forEach((cs, i) => {
        const ch = cs[0], b = S.bar(4 + i);
        S.note('bass', b, 1, ch.bass, 0.8); S.note('bass', b + 2, 1, ch.bass + 7 > 47 ? ch.bass - 5 : ch.bass + 7, 0.7);
        block(S, 'stab', b + 1, 0.4, ch, 58, 0.5); block(S, 'stab', b + 3, 0.4, ch, 58, 0.5);
        S.pat('snare', b, i === 11 ? 'x.x.x.x.xxxxXXXX' : 'x..-x.x.x..-x.x-', 0.25); S.pat('kick', b, 'X.......X.......', 0.25);
        if (i % 4 === 0) S.note('timp', b, 1, ch.bass + 12, 0.6);
      });
    },
    outro(S) {
      S.mel('lead', 0, 'G5:1 A5:1 F5:1 A5:1 Bb5:5', 0.95);
      block(S, 'stab', 0, 2, S.chord('Eb'), 55, 0.7); block(S, 'stab', 2, 2, S.chord('F'), 55, 0.7); block(S, 'stab', 4, 5, S.chord('Bb'), 55, 0.8);
      S.note('bass', 0, 2, 'Eb2', 0.8); S.note('bass', 2, 2, 'F2', 0.8); S.note('bass', 4, 4, 'Bb1', 0.9);
      for (let i = 0; i < 16; i++) S.note('snare', 2 + i * 0.125, 0.1, null, 0.3 + i * 0.04);
      S.note('timp', 4, 2, 'Bb2', 1); S.note('crash', 4, 2, null, 1); S.note('kick', 4, 1, null, 1);
      S.mel('glock', 4, 'Bb5:.25 D6 F6 Bb6:3', 0.6);
      return 10;
    },
  },
};

// cricket pitch is set per part (instruments read f)
TRACKS.shame.parts.cr1.f = 4300; TRACKS.shame.parts.cr2.f = 4750;
