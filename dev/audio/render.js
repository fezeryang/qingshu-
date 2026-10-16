// Audio self-test (run: node tools/shot.mjs --script dev/audio/render.js --out dev/audio/shots --w 1600 --h 900)
// Renders every track (8 s, default mix, through the real master chain) and every SFX (variant 0)
// with OfflineAudioContext, prints peak / RMS / duration / activity / zero-crossing stats, checks that
// nothing is silent or clipped and that items differ, and draws spectrogram contact sheets.
qs.manual(true);
const A = qs.ctx.audio;
const out = { tracks: {}, sfx: {}, problems: [] };

function mono(buf) {
  const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const m = new Float32Array(buf.length); for (let i = 0; i < m.length; i++) m[i] = (a[i] + b[i]) / 2; return m;
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
      re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi;
    }
  }
}
/** spectrogram: cols x bands (log-frequency 60 Hz..16 kHz), dB */
function spec(buf, cols = 200, bands = 64) {
  const x = mono(buf), sr = buf.sampleRate, N = 1024, hop = Math.max(1, Math.floor((x.length - N) / cols));
  const S = [], avg = new Float32Array(bands);
  const edges = Array.from({ length: bands + 1 }, (_, i) => Math.floor(60 * (16000 / 60) ** (i / bands) / sr * N));
  for (let c = 0; c < cols; c++) {
    const re = new Float32Array(N), im = new Float32Array(N), o = c * hop;
    for (let i = 0; i < N; i++) re[i] = (x[o + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    fft(re, im);
    const col = new Float32Array(bands);
    for (let b = 0; b < bands; b++) {
      let s = 0; const lo = edges[b], hi = Math.max(edges[b] + 1, edges[b + 1]);
      for (let k = lo; k < hi; k++) s += re[k] * re[k] + im[k] * im[k];
      col[b] = 10 * Math.log10(s / (hi - lo) + 1e-12); avg[b] += Math.max(-100, col[b]) / cols;
    }
    S.push(col);
  }
  return { S, avg };
}
function sheet(items, title, cols) {
  const W = 1600, H = 900;
  let cv = document.getElementById('audio-sheet');
  if (!cv) { cv = document.createElement('canvas'); cv.id = 'audio-sheet'; cv.style.cssText = 'position:fixed;inset:0;z-index:9999;width:100vw;height:100vh;background:#111'; document.body.appendChild(cv); }
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.font = '18px monospace'; g.fillText(title, 10, 22);
  const rows = Math.ceil(items.length / cols), tw = Math.floor(W / cols), th = Math.floor((H - 34) / rows);
  items.forEach((it, i) => {
    const x0 = (i % cols) * tw + 4, y0 = 34 + Math.floor(i / cols) * th, w = tw - 8, h = th - 22;
    const { S } = it.spec, bands = S[0].length;
    let mx = -200; for (const col of S) for (const db of col) if (db > mx) mx = db;
    const img = g.createImageData(S.length, bands);
    S.forEach((col, c) => col.forEach((db, b) => {
      const v = Math.max(0, Math.min(1, (db - mx + 72) / 72)), p = ((bands - 1 - b) * S.length + c) * 4;
      img.data[p] = 255 * Math.min(1, v * 1.8); img.data[p + 1] = 255 * Math.max(0, v * 1.6 - 0.5); img.data[p + 2] = 255 * Math.max(0, 1 - v * 2) * v * 3; img.data[p + 3] = 255;
    }));
    const tmp = document.createElement('canvas'); tmp.width = S.length; tmp.height = bands; tmp.getContext('2d').putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false; g.drawImage(tmp, x0, y0 + 16, w, h);
    // waveform envelope overlay
    const m = mono(it.buf), step = Math.floor(m.length / w);
    g.strokeStyle = 'rgba(120,255,160,.8)'; g.beginPath();
    for (let px = 0; px < w; px++) { let p = 0; for (let k = 0; k < step; k++) p = Math.max(p, Math.abs(m[px * step + k] || 0)); g.moveTo(x0 + px, y0 + 16 + h - p * h); g.lineTo(x0 + px, y0 + 16 + h); }
    g.stroke();
    g.fillStyle = '#ddd'; g.font = '12px monospace';
    g.fillText(`${it.name}  pk ${it.stats.peakDb} rms ${it.stats.rmsDb} ${it.stats.dur}s`, x0, y0 + 12);
  });
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / a.length); };

const t0 = performance.now();
const trackItems = [];
const ids = Object.keys(A.dev.tracks);
for (const id of ids) {
  const r = await A.dev.renderTrack(id, 8);
  const sp = spec(r.buf);
  trackItems.push({ name: id, buf: r.buf, stats: r.stats, spec: sp });
  out.tracks[id] = { bpm: r.bpm, meter: r.meter, bars: r.bars, key: r.key, events: r.events, ...r.stats };
}
{
  const r = await A.dev.renderTrack('classroom', 8, { tension: 1 });
  trackItems.push({ name: 'classroom@tension1', buf: r.buf, stats: r.stats, spec: spec(r.buf) });
  out.tracks['classroom@tension1'] = { ...r.stats };
}
sheet(trackItems, 'tracks — 8 s offline renders (log-freq spectrogram 60 Hz..16 kHz, green = peak envelope)', 4);
await shot('tracks');

const sfxItems = [];
for (const name of A.dev.sfxNames) {
  const r = await A.dev.renderSfxStats(name, 0);
  sfxItems.push({ name, buf: r.buf, stats: r.stats, spec: spec(r.buf, 120, 48) });
  out.sfx[name] = { level: r.level, loop: r.loop, variants: r.variants, ...r.stats };
}
sheet(sfxItems.slice(0, 24), 'sfx 1/2 — offline renders (variant 0, normalised)', 6);
await shot('sfx1');
sheet(sfxItems.slice(24), 'sfx 2/2 — offline renders (variant 0, normalised)', 6);
await shot('sfx2');
document.getElementById('audio-sheet')?.remove();

// checks
for (const [k, s] of Object.entries({ ...out.tracks, ...out.sfx })) {
  if (s.rmsDb < -50 || s.peakDb < -30) out.problems.push(`${k}: too quiet (${s.peakDb}/${s.rmsDb})`);
  if (s.clipped > 0 || s.peakDb > -0.1) out.problems.push(`${k}: clipping (${s.peakDb} dB, ${s.clipped} samples)`);
}
const all = [...trackItems, ...sfxItems];
let minD = { d: 1e9 };
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
  if (all[i].name.startsWith('classroom') && all[j].name.startsWith('classroom')) continue;
  const d = dist(all[i].spec.avg, all[j].spec.avg);
  if (d < minD.d) minD = { d: +d.toFixed(2), a: all[i].name, b: all[j].name };
}
out.closestPair = minD;
out.tensionDelta = +(out.tracks['classroom@tension1'].rmsDb - out.tracks.classroom.rmsDb).toFixed(1);
out.renderSeconds = +((performance.now() - t0) / 1000).toFixed(1);
return out;
