import { verdict } from '../lib/common.mjs';

const KINDS = ['stretch', 'raiseHand', 'standUp', 'sneeze', 'catch', 'witness', 'gust', 'teacherTurn'];

export default {
  id: 'D5', title: '≥ 6 in-flight accidents can be triggered with ai.students.trigger and are visible', priority: 'P0',
  owners: ['ai', 'characters', 'world'], timeout: 1200, quickTimeout: 700,
  method: 'Per kind (stretch, raiseHand, standUp, sneeze, catch, witness, gust, teacherTurn), three deterministic flights on fresh pages (seed 24, quiet class, teacher forced writing, lob to the podium; trigger 0.2 s into the flight with no id, so the AI picks the classmate nearest the path): (1) discover who/what is affected from `student:event`/`incident`; (2) control without trigger and (3) with trigger, both rendered by a close QA camera on the affected classmate (or the open window for gust, the teacher for teacherTurn) just before and 0.7 s after the trigger time. Visible = the affected character\'s maximum bone displacement over those 0.7 s exceeds max(1.5 × control, control + 6 cm) (a pixel metric was too noisy because classmates track the ball with their gaze); gust = `classroom.wind.strength` peak > 0.3 plus a pixel change at the window (wind is not frozen here). Screenshots are for eyeballing. Pass: ≥ 6 kinds return true, emit an event and are visible. Screenshots: qa/shots/D5/<kind>.png (after) and <kind>-before.png.',
  async run(page, h) {
    const S = h.S;
    const flight = async (kind, mode, focus) => {
      await S.fresh();
      await S.eval((o) => window.__qa.begin(o), { seed: 24, gender: 'm', ambient: false, roundSeconds: 300, freezeWind: false });
      return S.eval(async ([k, md, fc]) => {
        const c = window.__qs.ctx; const qa = window.__qa; const T = c.THREE;
        window.__qs.forceTeacher('writing', 999);
        let s = qa.solve({ name: 'podium' }); if (!s.sol) s = qa.solve({ name: 'r0c2' });
        if (!s.sol) return { error: s.error };
        c.gameplay.launch(s.sol);
        await qa.step(0.2);
        const view = () => {
          if (!fc) return null;
          if (fc.type === 'window') return { pos: [-3.3, 2.1, 1.0], look: [-5, 1.6, -0.7], fov: 55 };
          const ch = fc.type === 'teacher' ? c.cast.teacher : c.cast.get(fc.id);
          if (!ch) return null;
          const hd = ch.headWorld(new T.Vector3());
          if (fc.type === 'teacher') return { pos: [hd.x + 1.2, hd.y + 0.4, hd.z + 2.4], look: [hd.x, hd.y - 0.3, hd.z], fov: 45 };
          return { pos: [hd.x + 0.5, hd.y + 0.9, hd.z - 1.7], look: [hd.x, hd.y - 0.25, hd.z], fov: 50 };
        };
        const v = view();
        const focusChar = fc && fc.type === 'student' ? c.cast.get(fc.id) : fc && fc.type === 'teacher' ? c.cast.teacher : null;
        const pose = () => { if (!focusChar) return null; const out = []; focusChar.root.updateWorldMatrix(true, true); focusChar.root.traverse((o) => { if (out.length < 400) out.push(o.getWorldPosition(new T.Vector3())); }); return out; };
        const p0 = pose();
        let windPeak = 0; qa.samplers.set('d5wind', () => { windPeak = Math.max(windPeak, (c.world.classroom.wind && c.world.classroom.wind.strength) || 0); });
        const before = v ? qa.thumbWith(v, 48, 27) : null;
        const beforeShot = v && md === 'effect' ? await qa.shotWith(v, `D5/${k}-before`) : null;
        const ev0 = qa.events.length;
        let ret = null, err = null;
        if (md !== 'control') { try { ret = c.ai.students.trigger(k); } catch (e) { err = String(e); } }
        await qa.step(0.7);
        qa.samplers.delete('d5wind');
        const p1 = pose();
        let poseMax = null; if (p0 && p1) { poseMax = 0; for (let i = 0; i < Math.min(p0.length, p1.length); i++) poseMax = Math.max(poseMax, p0[i].distanceTo(p1[i])); }
        const after = v ? qa.thumbWith(v, 48, 27) : null;
        const shot = v && md === 'effect' ? await qa.shotWith(v, `D5/${k}`) : null;
        const evs = qa.events.slice(ev0).filter((e) => ['student:event', 'incident', 'teacher:state'].includes(e.type)).map((e) => ({ type: e.type, kind: e.p.kind || e.p.state, action: e.p.action, id: e.p.id }));
        return { ret, err, events: evs.slice(0, 8), diff: before && after ? qa.diff(before, after) : null, poseMax: poseMax == null ? null : +poseMax.toFixed(3), windPeak: +windPeak.toFixed(2), shot, beforeShot };
      }, [kind, mode, focus]);
    };
    const kinds = h.quick ? KINDS.slice(0, 6) : KINDS;
    const rows = [];
    for (const k of kinds) {
      const d = await flight(k, 'discover', null);
      if (d.error) { rows.push({ kind: k, error: d.error }); continue; }
      const sev = d.events.find((e) => e.type === 'student:event' && e.id) || d.events.find((e) => e.type === 'incident' && e.id);
      const focus = k === 'gust' ? { type: 'window' } : k === 'teacherTurn' ? { type: 'teacher' } : sev ? { type: 'student', id: sev.id } : null;
      const ctl = focus ? await flight(k, 'control', focus) : null;
      const eff = focus ? await flight(k, 'effect', focus) : null;
      const r = { kind: k, ret: d.ret, err: d.err, events: d.events, focus, controlDiff: ctl?.diff ?? null, diff: eff?.diff ?? null, controlPose: ctl?.poseMax ?? null, pose: eff?.poseMax ?? null, windPeak: eff?.windPeak, shot: eff?.shot, beforeShot: eff?.beforeShot };
      r.event = d.events.length > 0;
      r.visible = k === 'gust' ? r.windPeak > 0.3 && r.diff > (r.controlDiff ?? 0)
        : r.pose != null && r.controlPose != null && r.pose > Math.max(r.controlPose * 1.5, r.controlPose + 0.06);
      r.ok = r.ret === true && r.event && r.visible;
      rows.push(r);
      h.log(`  ${k}: ret ${r.ret}, events ${r.events.map((e) => e.kind || e.action).join('/')}, focus ${focus?.id || focus?.type}, pose Δ ${r.pose} m vs control ${r.controlPose}, wind ${r.windPeak}, Δpx ${r.diff}/${r.controlDiff}`);
    }
    const ok = rows.filter((r) => r.ok);
    const bad = rows.filter((r) => !r.ok).map((r) => `${r.kind}(ret ${r.ret}${r.err ? ' ' + r.err : ''}${r.error ? ' ' + r.error : ''}, event ${r.event}, pose Δ ${r.pose} vs ctl ${r.controlPose}, wind ${r.windPeak})`);
    const fails = ok.length < 6 ? [`only ${ok.length} kinds triggerable + observable + visible: ${bad.join(', ')}`] : [];
    const warns = !fails.length && bad.length ? [`not OK: ${bad.join(', ')}`] : [];
    return { status: verdict(fails, warns), partial: h.quick, details: `${ok.length}/${rows.length} kinds OK: ${rows.map((r) => `${r.kind}${r.ok ? '✓' : '✗'}(${r.kind === 'gust' ? 'wind ' + r.windPeak : r.pose + '/' + r.controlPose + ' m'})`).join(' ')}. ${fails.concat(warns).join('; ')}`, evidence: rows.map((r) => r.shot).filter(Boolean), data: rows };
  },
};
