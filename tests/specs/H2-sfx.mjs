import { getAudioSession } from '../lib/audio.mjs';
import { verdict } from '../lib/common.mjs';

const NEED = ['paperCrumple', 'whoosh', 'thudDesk', 'bell', 'stingDanger', 'heartbeat'];
export default {
  id: 'H2', title: 'Key events have sounds (crumple, whoosh, desk thud, bell, teacher sting, heartbeat) in audio.debug.recent', priority: 'P1',
  owners: ['audio'], timeout: 600,
  method: 'Same unmuted round as H1 (real crumple, intro bell, forced teacher warning, charging, throw onto a desk). Every new entry of `ctx.audio.debug.recent` is collected each tick; each required name must appear. Names seen only through `ctx.audio.sfx` call spies (not in debug.recent) give a warning.',
  async run(page, h) {
    const a = await getAudioSession(h);
    if (!a.final) return { status: 'fail', details: `audio session failed: ${a.error}` };
    const log = a.final.audioLog.join('\n');
    const calls = a.final.sfxCalls.map(String);
    const fails = [], warns = [];
    const found = {};
    for (const n of NEED) {
      found[n] = log.includes(n) ? 'recent' : calls.includes(n) ? 'spy' : null;
      if (!found[n]) fails.push(`${n} not heard`);
      else if (found[n] === 'spy') warns.push(`${n} only via sfx() spy, not in debug.recent`);
    }
    return { status: verdict(fails, warns), details: `${Object.entries(found).map(([k, v]) => `${k}:${v || '✗'}`).join(' ')}; ${a.final.audioLog.length} debug.recent entries (sample ${JSON.stringify(a.final.recentSample?.slice(0, 2))}). ${fails.concat(warns).join('; ')}`, data: { found, audioLog: a.final.audioLog.slice(0, 300), sfxCalls: calls } };
  },
};
