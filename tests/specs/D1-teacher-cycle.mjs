import { verdict, join } from '../lib/common.mjs';

export default {
  id: 'D1', title: 'Teacher writing → warning → watching cycle; warning tell lasts 0.5–0.9 s and is visible/audible', priority: 'P0',
  owners: ['ai', 'characters', 'audio'], timeout: 600, quickTimeout: 300,
  method: 'Fresh round, AI unforced, player idle looking at the board; observe 60 s of game time (30 s quick). From `teacher:state` events: the sequence must contain writing→warning→watching; every warning lasts 0.5–0.9 s (game time). Tell: during each warning the teacher character gets a clip/emote/lookAt/expression call, a bubble/say, or the head rotates ≥ 4° (visible), and an audio event appears in `ctx.audio.debug.recent` or an `audio.sfx` call (audible). FP screenshots of writing / warning / watching.',
  async run(page, h) {
    const S = h.S;
    await S.fresh();
    await S.eval((o) => window.__qa.begin(o), { seed: 15, gender: 'm', roundSeconds: 400, freezeWind: false });
    const dur = h.quick ? 30 : 60;
    const r = await S.eval(async (D) => {
      const c = window.__qs.ctx; const T = c.THREE; const qa = window.__qa;
      const tch = c.cast.teacher; const calls = [];
      for (const m of ['play', 'emote', 'lookAt', 'setExpression']) { const f = tch[m]; if (typeof f !== 'function') continue; tch[m] = function (...a) { calls.push({ t: c.time.now, m, a: String(a[0] && a[0].isVector3 ? 'vec' : a[0]) }); return f.apply(this ?? tch, a); }; }
      const headQ = () => { const hd = tch.parts && tch.parts.head; if (!hd) return null; hd.updateWorldMatrix(true, false); return hd.getWorldQuaternion(new T.Quaternion()); };
      const warnings = []; let cur = null; const shots = {}; const ev0 = qa.events.length;
      qa.samplers.set('d1', () => {
        const st = c.ai.teacher.state;
        if (st === 'warning' && !cur) cur = { t0: c.time.now, q0: headQ(), maxAng: 0 };
        if (cur && st === 'warning') { const q = headQ(); if (q && cur.q0) cur.maxAng = Math.max(cur.maxAng, cur.q0.angleTo(q) * 57.3); }
        if (cur && st !== 'warning') { cur.dur = c.time.now - cur.t0; cur.next = st; delete cur.q0; warnings.push(cur); cur = null; }
      });
      const t0 = c.time.now;
      while (c.time.now - t0 < D && c.flow.phase === 'aim') {
        await qa.tick(1);
        const st = c.ai.teacher.state;
        if (!shots[st] && ['writing', 'watching'].includes(st) && c.time.now - t0 > 3) shots[st] = await qa.shot(`D1/${st}`);
        if (!shots.warning && st === 'warning' && cur && c.time.now - cur.t0 > 0.25) shots.warning = await qa.shot('D1/warning');
      }
      qa.samplers.delete('d1');
      const states = qa.events.slice(ev0).filter((e) => e.type === 'teacher:state').map((e) => ({ t: e.t, s: e.p.state }));
      for (const w of warnings) {
        const a = w.t0 - 0.1, b = w.t0 + w.dur + 0.05;
        w.visible = calls.filter((x) => x.t >= a && x.t <= b).map((x) => `${x.m}(${x.a})`).concat(qa.calls.filter((x) => x.t >= a && x.t <= b && /^(ui\.bubble|teacher\.say|ui\.say)/.test(x.api)).map((x) => x.api));
        w.audible = qa.audioLog.filter((x) => x.t >= a && x.t <= b).map((x) => x.e).concat(qa.calls.filter((x) => x.t >= a && x.t <= b && x.api === 'audio.sfx').map((x) => 'sfx:' + x.args[0]));
      }
      return { states, warnings: warnings.map((w) => ({ t0: +w.t0.toFixed(2), dur: +w.dur.toFixed(3), next: w.next, headAng: +w.maxAng.toFixed(1), visible: w.visible.slice(0, 6), audible: w.audible.slice(0, 6) })), shots: Object.values(shots).filter(Boolean), phase: c.flow.phase, timeline: c.ai.teacher.timeline ? c.ai.teacher.timeline.slice(0, 60) : null };
    }, dur);
    const fails = [], warns = [];
    const seq = r.states.map((s) => s.s);
    const cyc = seq.some((s, i) => s === 'warning' && seq.slice(0, i).includes('writing') && ['watching', 'suspicious', 'patrol', 'drinking'].includes(seq[i + 1]));
    if (!cyc) fails.push(`no writing→warning→facing cycle in ${dur} s: ${seq.join('→')}`);
    if (!r.warnings.length) fails.push('no warning state observed');
    const bad = r.warnings.filter((w) => w.dur < 0.5 - 1e-3 || w.dur > 0.9 + 1e-3);
    if (bad.length) fails.push(`warning durations out of range: ${bad.map((w) => w.dur).join(', ')} s`);
    const noVis = r.warnings.filter((w) => !w.visible.length && w.headAng < 4);
    const noAud = r.warnings.filter((w) => !w.audible.length);
    if (noVis.length) fails.push(`${noVis.length}/${r.warnings.length} warnings without a visible tell`);
    if (noAud.length) (noAud.length === r.warnings.length ? fails : warns).push(`${noAud.length}/${r.warnings.length} warnings without an audio event`);
    return { status: verdict(fails, warns), partial: h.quick, details: `states: ${join(seq, 14)}; warnings ${r.warnings.map((w) => `${w.dur}s→${w.next}`).join(', ')}; tells e.g. ${JSON.stringify(r.warnings[0]?.visible?.slice(0, 3))} / ${JSON.stringify(r.warnings[0]?.audible?.slice(0, 2))}. ${fails.concat(warns).join('; ')}`, evidence: r.shots, data: r };
  },
};
