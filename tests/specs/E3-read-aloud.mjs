import { getSweep, verdict } from '../lib/common.mjs';
import { CUSTOM_LETTER } from '../lib/endings.mjs';

export default {
  id: 'E3', title: 'caught_read reads the player\'s own (custom) letter verbatim', priority: 'P0',
  owners: ['story', 'ui', 'audio'], timeout: 2400, quickTimeout: 900,
  method: `The sweep's caught_read scenario starts with the custom letter "${CUSTOM_LETTER}" (contains "<3" to catch HTML escaping bugs). While the ending plays, the visible DOM text is sampled every 0.1 s; the full normalised letter must appear on screen (typewriter allowed) or in a \`say\`/\`letterReveal\` text. Read-aloud evidence: \`audio.speak\` / speechSynthesis with the full text, or dialogue blips.`,
  async run(page, h) {
    const sw = await getSweep(h);
    const e = sw.endings.caught_read;
    if (!e?.ending) return { status: 'fail', details: 'caught_read was not played (see E1)' };
    const L = e.ending.letter || {};
    const fails = [], warns = [];
    const screen = L.full || L.sayFull;
    if (!screen) fails.push(`letter not fully shown: best on-screen prefix ${L.best}/${L.len} chars${L.revealFull ? ' (letterReveal got the full text, but the DOM never showed it all)' : ''}`);
    const norm = (s) => String(s || '').replace(/\s/g, '');
    const voice = (L.speak || []).some((t) => norm(t).includes(norm(CUSTOM_LETTER))) || (L.speech || []).some((t) => norm(t).includes(norm(CUSTOM_LETTER)));
    if (!voice && !(e.ending.blips > 10)) warns.push('no read-aloud audio evidence (speak/speechSynthesis/blips)');
    return { status: verdict(fails, warns), details: `on screen: ${L.best}/${L.len} chars (full ${L.full}), say ${L.sayFull}, letterReveal ${L.revealFull}; voice ${voice} (speak calls ${(L.speak || []).length}, blips ${e.ending.blips}). ${fails.concat(warns).join('; ')}`, evidence: (e.ending.shots || []).slice(0, 3), data: L };
  },
};
