import { getSweep, sweepEndings, verdict, join } from '../lib/common.mjs';

const norm = (t, names) => { let s = String(t || ''); for (const n of names || []) if (n) s = s.split(n).join('@'); return s.replace(/\d+/g, '#').split('\n').map((l) => l.trim()).filter(Boolean); };

export default {
  id: 'A4', title: 'After any ending, 再来一局 returns to a clean aim view', priority: 'P0',
  owners: ['camera', 'ui', 'story', 'core'], timeout: 2400, quickTimeout: 900,
  method: 'For every ending in the sweep: `cardChoice("retry")` (falls back to clicking 再来一局) → intro → aim + 0.8 s; compare with the fresh-round aim snapshot taken before the throw: phase/timeScale=1/not paused/cam fp/stage classroom/input enabled/ball held, no new full-screen DOM overlays, top/bottom band not black (letterbox), overall luminance within ±40 % (fade/flash), one render call per frame (no PiP), no HUD line of the fresh view missing (digits and names normalised; new lines such as lecture bubbles are ignored).',
  async run(page, h) {
    const sw = await getSweep(h);
    const rows = [], fails = [], warns = [], evidence = [];
    for (const e of sweepEndings(sw)) {
      const a = e.a4;
      if (!a) { if (e.ending?.reachedCard) fails.push(`${e.id}: retry check did not run`); continue; }
      const b = a.base;
      const issues = [], soft = [];
      if (!a.ok || a.phase !== 'aim') issues.push(`did not reach aim (phase ${a.phase}, via ${a.via})`);
      if (a.timeScale !== 1) issues.push(`timeScale ${a.timeScale}`);
      if (a.paused) issues.push('engine paused');
      if (a.cam !== 'fp') issues.push(`cam ${a.cam}`);
      if (a.stage !== 'classroom') issues.push(`stage ${a.stage}`);
      if (!a.input) issues.push('input disabled');
      if (a.ball !== 'held') soft.push(`ball ${a.ball}`);
      if (a.mood && a.mood !== 'day') issues.push(`classroom mood ${a.mood}`);
      if (a.renderCallsPerFrame > (b?.renderCallsPerFrame ?? 1)) issues.push(`${a.renderCallsPerFrame} render calls/frame (PiP left on?)`);
      const key = (o) => `${o.tag}#${o.id}.${o.cls}`;
      const baseKeys = new Set((b?.overlays || []).map(key));
      const extra = (a.overlays || []).filter((o) => !baseKeys.has(key(o)) && (o.alpha >= 0.08 || o.tag === 'canvas'));
      const faint = (a.overlays || []).filter((o) => !baseKeys.has(key(o)) && !(o.alpha >= 0.08 || o.tag === 'canvas'));
      if (faint.length) soft.push(`new transparent layer(s) with a background image (not visible in the screenshot check): ${faint.map((o) => `${o.tag}.${o.cls.split(' ')[0]}`).join(', ')}`);
      if (extra.length) issues.push(`new overlay(s): ${extra.map((o) => `${o.tag}${o.id ? '#' + o.id : ''}.${o.cls.split(' ')[0]} area ${o.area} α${o.alpha}`).join(', ')}`);
      const s = a.shot, bs = b?.shot;
      if (s && bs) {
        if (s.top.dark > 0.85 && bs.top.dark < 0.5) issues.push('top band black (letterbox residue)');
        if (s.bottom.dark > 0.85 && bs.bottom.dark < 0.5) issues.push('bottom band black (letterbox residue)');
        const ratio = s.lum / Math.max(1, bs.lum);
        if (ratio < 0.6) issues.push(`screen ${Math.round((1 - ratio) * 100)} % darker than a fresh aim view (fade residue?)`);
        if (ratio > 1.6) issues.push(`screen ${Math.round((ratio - 1) * 100)} % brighter (flash residue?)`);
        if (s.lum < 10) issues.push('black screen');
      }
      const hb = new Set(norm(b?.hud, b?.names)), ha = norm(a.hud, a.names);
      const missing = [...hb].filter((l) => !ha.includes(l)), added = ha.filter((l) => !hb.has(l));
      if (missing.length) soft.push(`HUD lines missing after retry: ${missing.slice(0, 4).join(' / ')}`);
      if (s?.file) evidence.push(s.file);
      rows.push({ id: e.id, issues, soft, snapshot: { ...a, base: undefined, hud: a.hud.slice(0, 300), shot: s && { lum: s.lum, top: s.top, bottom: s.bottom, file: s.file } }, baseLum: bs?.lum });
      if (issues.length) fails.push(`${e.id}: ${issues.join(', ')}`);
      if (soft.length) warns.push(`${e.id}: ${soft.join(', ')}`);
    }
    return { status: verdict(fails, warns), partial: h.quick, details: `${rows.length} retries checked. ${join([...fails, ...warns], 8)}`, evidence: evidence.slice(0, 6), data: rows };
  },
};
