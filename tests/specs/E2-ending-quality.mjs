import { getSweep, sweepEndings, verdict, join, thumbDiff } from '../lib/common.mjs';

const NOT_ENDING_MUSIC = new Set(['classroom', 'flight', 'title', 'null', 'undefined']);
export default {
  id: 'E2', title: 'Each ending lasts 8–45 s, has its own camera work / dialogue / music, ends on the card; key frames all differ', priority: 'P0',
  owners: ['story', 'camera', 'audio', 'ui'], timeout: 2400, quickTimeout: 900,
  method: 'From the ending sweep recording (phase `ending` → `card`): game-time duration in [8, 45] s; ≥ 1 dialogue line (`say` event) or caption; camera work = ≥ 1 cut or ≥ 30 frames of camera motion; at least one music track other than classroom/flight/title in `ctx.audio.debug.music` (or an `audio.music` call); card text contains the ending title (the part after ·, the card shows the tag separately). Key frames: the canvas thumbnail at the story climax beat (else +5 s) of every pair of endings must differ (mean abs diff > 6/255).',
  async run(page, h) {
    const sw = await getSweep(h);
    const titles = await h.S.eval(() => Object.fromEntries(window.__qs.ctx.story.ENDINGS.map((e) => [e.id, e.title])));
    const rows = [], fails = [], warns = [];
    for (const e of sweepEndings(sw)) {
      const en = e.ending;
      if (!en) { fails.push(`${e.id}: not played (see E1)`); continue; }
      const music = [...new Set([...(en.music || []), ...(en.musicCalls || []).map(String)])].filter((m) => !NOT_ENDING_MUSIC.has(String(m)));
      const lines = en.says.length + en.captions.length + en.reveals.length;
      const t = titles[e.id] || '';
      const main = t.split('·').pop().trim();
      const cardOk = en.cardText && en.cardText.replace(/\s/g, '').includes(main.replace(/\s/g, ''));
      const r = { id: e.id, dur: en.durGame, durUi: en.durUi, lines, cuts: en.cuts, moving: en.movingFrames, music, stages: en.stages, card: en.reachedCard, cardOk, camCalls: [...new Set(en.camCalls)].slice(0, 12) };
      const iss = [];
      if (!(en.durGame >= 8 && en.durGame <= 45)) iss.push(`duration ${en.durGame}s`);
      if (!lines) iss.push('no dialogue/caption');
      if (en.cuts < 1 && en.movingFrames < 30) iss.push('no camera work');
      if (!music.length) iss.push(`no ending music (${JSON.stringify(en.music)})`);
      if (!en.reachedCard) iss.push('no card');
      else if (!cardOk) iss.push(`card does not show "${t}"`);
      if (iss.length) fails.push(`${e.id}: ${iss.join(', ')}`);
      r.key = (en.thumbs || []).find((x) => x.climax) || (en.thumbs || []).find((x) => x.at >= 5) || (en.thumbs || []).at(-1) || en.finalThumb;
      rows.push(r);
    }
    const pairs = [];
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) { const d = thumbDiff(rows[i].key, rows[j].key); if (d != null) pairs.push({ a: rows[i].id, b: rows[j].id, d }); }
    const same = pairs.filter((p) => p.d <= 6);
    if (same.length) fails.push(`near-identical key frames: ${same.map((p) => `${p.a}/${p.b} (${p.d})`).join(', ')}`);
    const shots = sweepEndings(sw).flatMap((e) => (e.ending?.shots || []).slice(1, 2));
    for (const r of rows) delete r.key;
    return { status: verdict(fails, warns), partial: h.quick, details: `${rows.length} endings: ${rows.map((r) => `${r.id} ${r.dur}s/${r.lines} lines/${r.cuts} cuts/${r.music[0] || '-'}`).join('; ')}. Min key-frame diff ${pairs.length ? Math.min(...pairs.map((p) => p.d)) : 'n/a'}. ${join(fails, 8)}`, evidence: shots.slice(0, 6), data: { rows, pairs } };
  },
};
