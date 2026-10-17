import { verdict } from '../lib/common.mjs';

export default {
  id: 'C3', title: 'Bounces, rolling and settling are plausible; a head hit bounces off and triggers a reaction', priority: 'P0',
  owners: ['gameplay', 'ai', 'characters'], timeout: 600,
  method: 'Sandbox. (1) A flat throw (pitch ~20°) onto a desk with the full position log: bounce apex heights must decrease, the ball must come to rest (drift < 5 mm over 1 s after ball:landed), roll distance after first contact < 1.5 m; 6 frames from a QA side camera go to qa/shots/C3/ for review. (2) In the normal flow (reactions only run in `flight`), flat throws at the heads of the nearest classmates in front (ballistic aim at the head centre): a `ball:hit` tagged head must occur, the post-hit velocity must point away from the head, and a reaction must follow within 1.5 s (`student:event` or `ai.students.react` for that id, or an expression/clip change visible as a student:event).',
  async run(page, h) {
    const S = h.S;
    await S.fresh();
    await S.eval((o) => window.__qa.physSetup(o), { seed: 11 });
    const fails = [], warns = [], evidence = [];
    // (1) bounce + settle on a desk, with a QA side camera
    const b = await S.eval(async () => {
      const c = window.__qs.ctx; const qs = window.__qs;
      let s = c.gameplay.solveLaunch(qs.target('r2c1'), { mode: 'flat' }) || c.gameplay.solveLaunch(qs.target('r2c1'));
      if (!s) return { error: 'no solution for r2c1' };
      const res = await window.__qa.physThrow(s, { track: true, settle: 1 });
      return { sol: { pitch: +(s.pitch * 57.3).toFixed(1), power: +s.power.toFixed(3) }, ...res };
    });
    if (b.error) fails.push(b.error);
    else {
      const tr = b.track;
      const firstContactIdx = tr.findIndex((p, i) => i > 0 && p[2] < 0.9 && tr[i - 1][4] - p[4] > 0.5);
      const ys = tr.slice(Math.max(0, firstContactIdx)).map((p) => p[2]);
      const apexes = [];
      for (let i = 1; i < ys.length - 1; i++) if (ys[i] > ys[i - 1] && ys[i] >= ys[i + 1] && ys[i] - Math.min(...ys.slice(Math.max(0, i - 20), i)) > 0.005) apexes.push(ys[i]);
      const decreasing = apexes.every((y, i) => i === 0 || y <= apexes[i - 1] + 0.003);
      const fc = tr[Math.max(0, firstContactIdx)];
      const roll = fc ? Math.hypot(b.end[0] - fc[1], b.end[2] - fc[3]) : null;
      if (!b.landing) fails.push('desk throw never landed');
      if (!decreasing) fails.push(`bounce heights not decreasing: ${apexes.map((y) => y.toFixed(3)).join(', ')}`);
      if (b.drift > 0.005) fails.push(`ball drifts ${b.drift} m after landing`);
      if (roll > 1.5) warns.push(`rolled ${roll.toFixed(2)} m after first contact`);
      b.summary = { landing: b.landing?.type + '@' + (b.landing?.seatId || ''), bounces: b.landing?.bounces, apexes, roll, drift: b.drift, flight: b.landedAfter };
      // replay with screenshots from a side camera at fixed times
      await S.fresh();
      await S.eval((o) => window.__qa.physSetup(o), { seed: 11 });
      const shots = await S.eval(async (fcT) => {
        const c = window.__qs.ctx; const qs = window.__qs;
        const s = c.gameplay.solveLaunch(qs.target('r2c1'), { mode: 'flat' }) || c.gameplay.solveLaunch(qs.target('r2c1'));
        const seat = c.layout.SEAT_BY_ID.r2c1;
        const view = { pos: [seat.x + 1.3, 1.15, seat.deskZ + 0.6], look: [seat.x, 0.78, seat.deskZ], fov: 45 };
        window.__qa.lastLanded = null;
        c.gameplay.launch(s);
        const t0 = c.time.now; const out = [];
        const times = [fcT - 0.15, fcT, fcT + 0.08, fcT + 0.2, fcT + 0.45, fcT + 1.2];
        for (let i = 0; i < times.length; i++) { while (c.time.now - t0 < times[i]) await window.__qa.tick(1); out.push(await window.__qa.shotWith(view, `C3/desk-${i + 1}`)); }
        return out;
      }, fc ? fc[0] : 0.8);
      evidence.push(...shots.filter(Boolean));
    }
    // (2) head hit — normal flow (classmate reactions only run in the flight phase, so no sandbox here)
    const heads = [];
    for (const k of [0, 1, 2, 3]) {
      await S.fresh();
      await S.eval((o) => window.__qa.begin(o), { seed: 11, gender: 'm', ambient: false, roundSeconds: 300, teacher: 'writing' });
      const r = await S.eval(async (idx) => {
        const c = window.__qs.ctx; const L = c.layout; const T = c.THREE; const qa = window.__qa;
        window.__qs.forceTeacher('writing', 999);
        const cands = qa.roster().filter((s) => s.seatId && s.dist < 3.2 && L.SEAT_BY_ID[s.seatId].deskZ < L.SEAT_BY_ID[L.PLAYER_SEAT].deskZ).sort((a, b) => a.dist - b.dist);
        const st = cands[idx];
        if (!st) return null;
        const head = c.cast.get(st.id).headWorld(new T.Vector3());
        const sol = qa.ballistic(head, 12);
        if (!sol) return null;
        const charCalls = [];
        for (const ch of c.cast.students()) for (const m of ['setExpression', 'emote', 'play']) { const f = ch[m]; if (typeof f !== 'function') continue; ch[m] = function (...a) { charCalls.push({ id: ch.id, m, a: String(a[0]) }); return f.apply(this ?? ch, a); }; }
        const ev0 = qa.events.length;
        let hit = null; const after = [];
        qa.samplers.set('c3', () => {
          if (!hit) { const e = qa.events.slice(ev0).find((x) => x.type === 'ball:hit' && x.p && x.p.tag === 'head'); if (e) hit = e.p; }
          else if (after.length < 6) { const hp = c.cast.get(hit.ownerId).headWorld(new T.Vector3()); after.push(c.gameplay.ball.pos.distanceTo(hp)); }
        });
        c.gameplay.launch(sol);
        await qa.stepUntil(() => c.flow.phase === 'ending', 8);
        await qa.step(0.3);
        qa.samplers.delete('c3');
        if (!hit) return { target: st.id, hit: null };
        const evs = qa.events.slice(ev0);
        return { target: st.id, hitOwner: hit.ownerId, speed: hit.speed, bouncedAway: after.length > 2 && after.at(-1) > after[0],
          reaction: evs.filter((e) => e.type === 'student:event' && e.p && e.p.id === hit.ownerId).map((e) => e.p.kind),
          reactCalls: [], charReact: charCalls.filter((x) => x.id === hit.ownerId).map((x) => `${x.m}(${x.a})`).slice(0, 10), landing: c.round.landing && c.round.landing.type };
      }, k);
      if (r && r.hitOwner) { heads.push(r); break; }
    }
    const hh = heads[0];
    if (!hh) fails.push('could not produce a head hit with ballistic throws at 4 nearby heads');
    else {
      if (!hh.bouncedAway) fails.push(`ball did not bounce away from ${hh.hitOwner}'s head`);
      if (!hh.reaction.length && !hh.reactCalls.length && !hh.charReact.length) fails.push(`no reaction (student:event, students.react, or expression/emote/clip on the character) from ${hh.hitOwner} within 1.5 s`);
    }
    return { status: verdict(fails, warns), details: `desk: ${JSON.stringify(b.summary || b.error)}; head: ${hh ? `${hh.hitOwner} hit at ${hh.speed} m/s, bounced away ${hh.bouncedAway}, reactions [${hh.reaction.join(',')}] character calls [${hh.charReact.join(', ')}]` : 'none'}. ${fails.concat(warns).join('; ')}`, evidence, data: { desk: { ...b, track: b.track?.filter((_, i) => i % 3 === 0) }, heads } };
  },
};
