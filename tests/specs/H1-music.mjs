import { getAudioSession } from '../lib/audio.mjs';
import { verdict } from '../lib/common.mjs';

const ENDING_TRACKS = ['romance', 'comedy', 'tragedy', 'shame', 'sports', 'broadcast', 'lonely', 'mystery', 'victory'];
export default {
  id: 'H1', title: 'AudioContext running after the first click; music track switches per phase', priority: 'P1',
  owners: ['audio'], timeout: 600,
  method: 'Unmuted page (`?lowfx=1`). AudioContext instances are tracked from document start. Real click on 我是男生 → context state must be `running`. One round through the real UI (letter, crumple, intro) then scripted aim → throw → ending; `ctx.audio.debug.music` is recorded at every phase change. Expect title→title, aim→classroom, flight→flight, ending→an ending track (romance, comedy, …). Signal level at the destination is sampled (analyser) for information.',
  async run(page, h) {
    const a = await getAudioSession(h);
    if (a.error && !a.final) return { status: 'fail', details: `audio session failed: ${a.error}` };
    const fails = [], warns = [];
    if (!a.afterClick?.contexts?.length) fails.push('no AudioContext was created');
    else if (!a.afterClick.contexts.includes('running')) fails.push(`AudioContext state after click: ${a.afterClick.contexts.join(',')}`);
    const mp = a.final?.musicByPhase || [];
    const at = (ph) => [...new Set(mp.filter((m) => m.phase === ph).map((m) => m.music))];
    const expect = { title: ['title'], aim: ['classroom'], flight: ['flight'] };
    for (const [ph, want] of Object.entries(expect)) { const got = at(ph); if (!got.some((g) => want.includes(g))) fails.push(`${ph}: music ${JSON.stringify(got)} (expected ${want[0]})`); }
    const end = at('ending');
    if (!end.some((g) => ENDING_TRACKS.includes(g))) fails.push(`ending (${a.final?.endingId}): music ${JSON.stringify(end)}`);
    if (a.error) warns.push(`session note: ${a.error}`);
    return { status: verdict(fails, warns), details: `contexts before/after click ${JSON.stringify(a.beforeClick?.contexts)}→${JSON.stringify(a.afterClick?.contexts)}; music title ${JSON.stringify(at('title'))}, intro ${JSON.stringify(at('intro'))}, aim ${JSON.stringify(at('aim'))}, flight ${JSON.stringify(at('flight'))}, ending ${JSON.stringify(end)}; peak level intro ${a.levelIntro?.peak?.toFixed?.(3)}, ending ${a.levelEnding?.peak?.toFixed?.(3)}. ${fails.concat(warns).join('; ')}`, data: a };
  },
};
