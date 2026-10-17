import { getSweep, sweepEndings, verdict } from '../lib/common.mjs';

export default {
  id: 'J2', title: 'Each ending\'s joke / emotional beat can be summarised in one sentence', priority: 'P1',
  owners: ['story'], timeout: 2400, quickTimeout: 900,
  method: 'Collects every ending\'s script as played (dialogue lines with speakers, captions, letter reveals, music, sets) into qa/data/J2.json together with the +1.5 s / +5 s / card screenshots, for a human one-sentence summary in the report (manual). Automatic part: an ending with no dialogue, caption or reveal at all fails.',
  async run(page, h) {
    const sw = await getSweep(h);
    const out = {}, fails = [];
    for (const e of sweepEndings(sw)) {
      const en = e.ending;
      if (!en) { fails.push(`${e.id}: not played`); continue; }
      out[e.id] = { dialogue: en.says.map((s) => `${s.speaker || '旁白'}：${s.text}`), captions: en.captions, reveals: en.reveals.map((r) => `${r.opts?.mode || ''}: ${String(r.text).slice(0, 40)}`), music: en.music, stages: en.stages, shots: [...(en.shots || []), en.cardShot].filter(Boolean), durGame: en.durGame };
      if (!en.says.length && !en.captions.length && !en.reveals.length) fails.push(`${e.id}: no dialogue/caption/reveal`);
    }
    return { status: fails.length ? 'fail' : 'warn', partial: h.quick, details: `${Object.keys(out).length} ending scripts captured for manual review${fails.length ? '. ' + fails.join('; ') : ''}`, data: out };
  },
};
