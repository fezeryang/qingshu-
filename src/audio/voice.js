// Dialogue blips (Animal-Crossing style syllables) and read-aloud.
// speak(): speechSynthesis (zh-CN) when available, unlocked and audible; otherwise a blip sequence.
// Both paths are driven by the UI clock in update(uiDt) and ALWAYS resolve within a bounded time,
// so headless runs (no voices, no gesture, ?mute=1) never hang a cutscene.
import { VOWELS, clamp } from './dsp.js';

const PUNCT = /[\s，。！？、…—“”‘’,.!?;:：；（）()《》\-~·「」『』~～]/;
const LONG = /[。！？!?…\n]/;
const SHORT = /[，、,;；:：—]/;

export function createVoice(M, ctx, rec) {
  let lastBlip = -1;
  const jobs = [];
  const stats = { blips: 0, spoken: 0, tts: 0 };
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let voices = [];
  const loadVoices = () => { try { voices = synth?.getVoices?.() || []; } catch { voices = []; } };
  if (synth) { loadVoices(); try { synth.addEventListener?.('voiceschanged', loadVoices); } catch { /* old API */ } }
  const zhVoice = () => voices.find((v) => /zh[-_]CN/i.test(v.lang)) || voices.find((v) => /^zh/i.test(v.lang)) || null;

  function blip(voice, ch) {
    if (ch != null && ch !== '' && PUNCT.test(ch)) return;
    stats.blips++;
    if (!M.running || M.silent('voice')) return;
    const ac = M.ac, now = ac.currentTime;
    if (now - lastBlip < 0.035) return;
    lastBlip = now;
    const code = ch ? ch.codePointAt(0) : Math.floor(Math.random() * 997);
    const pitch = clamp(+voice?.pitch || 1, 0.4, 2.5);
    const semis = [0, 2, 4, 7, 9][code % 5] - 4 + (Math.random() - 0.5) * 0.8;
    const f = 175 * pitch * 2 ** (semis / 12);
    const vow = VOWELS['aeiou'[(code >> 3) % 5]];
    const scale = pitch ** 0.35;
    const o = ac.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(f * 1.04, now); o.frequency.exponentialRampToValueAtTime(f, now + 0.03);
    const g = ac.createGain(); g.connect(M.bus.voiceIn);
    const dur = 0.05 + Math.random() * 0.015;
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.32, now + 0.006); g.gain.setTargetAtTime(0, now + dur * 0.6, 0.015);
    for (let k = 0; k < 2; k++) {
      const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = clamp(vow[k][0] * scale, 100, 6000); b.Q.value = 4;
      const bg = ac.createGain(); bg.gain.value = k ? 0.7 : 1.4; o.connect(b); b.connect(bg); bg.connect(g);
    }
    o.start(now); o.stop(now + dur + 0.1);
  }

  /** Build the timed blip script for a text: [{t, ch}], total seconds. */
  function blipScript(text, rate) {
    const chars = [...text];
    const step = 0.12 / rate;
    let t = 0.1;
    const evs = [];
    for (const ch of chars) {
      if (LONG.test(ch)) t += 0.36 / rate;
      else if (SHORT.test(ch)) t += 0.2 / rate;
      else if (/\s/.test(ch)) t += 0.05;
      else { evs.push({ t, ch }); t += step; }
    }
    let total = t + 0.2;
    const cap = Math.min(30, 2.5 + 0.25 * chars.length);
    if (total > cap) { const k = cap / total; for (const e of evs) e.t *= k; total = cap; }
    return { evs, total };
  }

  function speak(text, o = {}) {
    text = String(text ?? '');
    rec('speak', text.slice(0, 24));
    stats.spoken++;
    return new Promise((resolve) => {
      const rate = clamp(+o.rate || 1, 0.5, 2);
      const job = { text, o, rate, resolve, t: 0, mode: 'blips', idx: 0, voice: { pitch: +o.pitch || 1 } };
      const script = blipScript(text, rate);
      job.evs = script.evs; job.total = script.total;
      const uiNow = ctx.time.uiNow;
      const v = zhVoice();
      if (synth && v && M.running && !M.silent('voice') && text.trim()) {
        try {
          synth.cancel();
          const parts = text.split(/(?<=[。！？!?…\n；;])/).map((s) => s.trim()).filter(Boolean);
          job.mode = 'tts'; job.ended = false;
          job.deadline = Math.min(45, 2 + [...text].length * 0.3 / rate + parts.length * 0.5);
          parts.forEach((p, i) => {
            const u = new SpeechSynthesisUtterance(p);
            u.voice = v; u.lang = v.lang; u.rate = rate; u.pitch = clamp(+o.pitch || 1, 0.1, 2);
            u.volume = clamp(M.vol.master * M.vol.sfx, 0, 1);
            u.onerror = (e) => { if (job.t < 0.6 && e?.error !== 'interrupted' && e?.error !== 'canceled') { job.mode = 'blips'; job.t = 0; } else job.ended = true; };
            if (i === parts.length - 1) u.onend = () => { job.ended = true; };
            synth.speak(u);
          });
          stats.tts++;
        } catch { job.mode = 'blips'; }
      }
      M.duck(0.45, (job.mode === 'tts' ? job.deadline : job.total) + 0.3, uiNow);
      jobs.push(job);
    });
  }

  function finish(job) {
    const i = jobs.indexOf(job); if (i >= 0) jobs.splice(i, 1);
    M.ducks = M.ducks.filter((d) => d.amount !== 0.45);
    job.resolve();
  }

  function update(uiDt) {
    for (const job of [...jobs]) {
      job.t += uiDt;
      if (job.mode === 'tts') {
        if (job.ended || job.t > job.deadline) { if (!job.ended) { try { synth.cancel(); } catch { /* ok */ } } finish(job); }
        continue;
      }
      while (job.idx < job.evs.length && job.evs[job.idx].t <= job.t) {
        const e = job.evs[job.idx++];
        if (job.t - e.t < 0.1) blip(job.voice, e.ch); // skip stale blips when fast-forwarding
      }
      if (job.t >= job.total) finish(job);
    }
  }

  function cancelAll() {
    if (jobs.some((j) => j.mode === 'tts')) { try { synth.cancel(); } catch { /* ok */ } }
    for (const j of [...jobs]) finish(j);
  }

  return { blip, speak, update, cancelAll, stats, get busy() { return jobs.length > 0; }, hasZhVoice: () => !!zhVoice() };
}
