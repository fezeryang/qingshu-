// Launch solver (owner: gameplay). Finds {yaw, pitch, power} that really comes to rest on the
// collider containing a target point, verified with the very same simulator the live ball uses.
//
// Strategy
//   1. Work out the goal from the target: a trigger (bin / outside), a fan disc, a seat (desk, chair,
//      books on it), the podium, the teacher, a person, the floor, or just "near this point".
//   2. For each launch elevation in preference order (lob: high arcs that clear the front rows),
//      bisect the power so that the obstacle-free (drag-correct) arc passes through an aim point.
//      Arcs that would scrape the ceiling or cross a spinning fan's disc are pruned cheaply.
//   3. Fully simulate the candidate (static colliders + a snapshot of the characters + fan discs as
//      keep-out zones) and classify the landing. Successful candidates are re-simulated with small
//      yaw/power perturbations. A first pass inflates the characters and rejects any contact with
//      them (paths that never touch anybody); only if none exists, a second pass allows contacts.
//      The budget is a deterministic count of simulations (no wall clock), so results never depend on load.
import { PHYS, Grid, Scene, simulate, launchVelocity, dirFromYawPitch, K_TRIGGER } from './physics.js';
import { classifyLanding } from './landing.js';
import { ROOM, SEAT_BY_ID } from '../core/layout.js';
import * as THREE from 'three';

const DEG = Math.PI / 180;
const now = () => (globalThis.performance ? performance.now() : Date.now());

const LOB = [58, 62, 54, 66, 50, 70, 46, 74, 60, 56, 64, 52, 68, 48, 72, 44, 76, 42, 40, 38, 36, 34, 30, 26, 22, 18, 14, 10, 6, 2, -2, -6, -10, 78, 82, -16, -24, -34, -48, -62];
const FLAT = [8, 4, 12, 0, 16, 20, -4, 24, 28, 32, -8, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 78, -16, -24, -34, -48, -62];

function pitchOrder(opts) {
  const lo = Number.isFinite(opts.minPitchDeg) ? opts.minPitchDeg : -90, hi = Number.isFinite(opts.maxPitchDeg) ? opts.maxPitchDeg : 90;
  return pitchOrderRaw(opts).filter((x) => x >= lo && x <= hi);
}
function pitchOrderRaw(opts) {
  if (Number.isFinite(opts.pitchDeg)) {
    const p = opts.pitchDeg;
    const near = [];
    for (let k = 0; k <= 8; k++) { near.push(p + 2 * k); if (k) near.push(p - 2 * k); }
    if (Number.isFinite(opts.maxPitchDeg)) for (let x = Math.floor(opts.maxPitchDeg); x > p + 16; x -= 2) near.push(x);
    const rest = (opts.mode === 'flat' ? FLAT : LOB).filter((x) => Math.abs(x - p) > 16);
    return [...near, ...rest].filter((x) => x >= -70 && x <= 84);
  }
  return opts.mode === 'flat' ? FLAT : LOB;
}

/** Distance from point to a compiled record's surface (0 inside). */
function distToRecord(o, p) {
  if (o.kind === 2) return Math.max(0, Math.hypot(p.x - o.cx, p.y - o.cy, p.z - o.cz) - o.r);
  if (o.kind === 1) {
    const dx = p.x - o.cx, dy = p.y - o.cy, dz = p.z - o.cz;
    const lx = o.m00 * dx + o.m10 * dy + o.m20 * dz, ly = o.m01 * dx + o.m11 * dy + o.m21 * dz, lz = o.m02 * dx + o.m12 * dy + o.m22 * dz;
    return Math.hypot(Math.max(0, Math.abs(lx) - o.hx), Math.max(0, Math.abs(ly) - o.hy), Math.max(0, Math.abs(lz) - o.hz));
  }
  return Math.hypot(Math.max(o.minx - p.x, 0, p.x - o.maxx), Math.max(o.miny - p.y, 0, p.y - o.maxy), Math.max(o.minz - p.z, 0, p.z - o.maxz));
}

/** What does "hitting this target" mean? */
export function makeGoal(target, scene, fans = []) {
  const p = target;
  for (const g of [scene.static, scene.dynamic]) {
    for (const o of g.all) if (o.kind === K_TRIGGER && p.x > o.minx && p.x < o.maxx && p.y > o.miny && p.y < o.maxy && p.z > o.minz && p.z < o.maxz) {
      return { kind: 'trigger', tag: o.tag, landType: o.tag === 'trash' ? 'trash' : 'outside', target: p };
    }
  }
  for (const f of fans) {
    if (Math.abs(p.y - f.y) < 0.2 && Math.hypot(p.x - f.x, p.z - f.z) < f.r + 0.1) return { kind: 'fan', landType: 'fan', fan: f, target: p };
  }
  let best = null, bd = Infinity;
  for (const g of [scene.static, scene.dynamic]) {
    for (const o of g.all) {
      if (o.kind === K_TRIGGER || o.tag === 'fan' || o.tag === 'ceiling') continue;
      const d = distToRecord(o, p);
      // prefer specific objects over the floor/walls when equally close
      const bias = o.tag === 'floor' || o.tag === 'wall' ? 0.01 : 0;
      if (d + bias < bd) { bd = d + bias; best = o; }
    }
  }
  if (best && bd <= PHYS.R + 0.06) {
    const t = best.tag;
    if ((t === 'desk' || t === 'chair' || t === 'book') && SEAT_BY_ID[best.ownerId]) return { kind: 'seat', seatId: best.ownerId, target: p };
    if (t === 'podium' || t === 'teacherDesk') return { kind: 'podium', landType: 'podium', target: p };
    if (t === 'teacher') return { kind: 'teacher', landType: 'teacher', target: p };
    if ((t === 'head' || t === 'body') && best.ownerId != null) return { kind: 'person', ownerId: best.ownerId, target: p };
    if (t === 'floor') return { kind: 'floor', landType: 'floor', target: p };
  }
  return { kind: 'near', target: p };
}

function evaluate(goal, res, landing) {
  const p = goal.target;
  const err = Math.hypot(res.pos.x - p.x, res.pos.z - p.z);
  let ok;
  switch (goal.kind) {
    case 'seat': ok = landing.seatId === goal.seatId && (landing.type === 'desk' || landing.type === 'chair' || landing.type === 'self'); break;
    case 'trigger': case 'podium': case 'teacher': ok = landing.type === goal.landType; break;
    case 'fan': ok = res.reason === 'fan' || landing.type === 'fan'; break;
    case 'person': ok = res.hits.some((h) => h.ownerId === goal.ownerId); break;
    case 'floor': ok = landing.type === 'floor' && err < 1.0; break;
    default: ok = err < 0.35 && res.reason !== 'timeout';
  }
  const charHits = res.hits.filter((h) => h.tag === 'head' || h.tag === 'body').length;
  return { ok, err: ['trigger', 'fan', 'teacher', 'person'].includes(goal.kind) ? 0 : err, charHits };
}

/**
 * @param {object} a
 *   origin: Vector3, target: Vector3, scene: Scene (static + snapshot), fans: [{x,z,y,r,hh}],
 *   opts: {pitchDeg?, mode?}, lookups: {occupant, seatOf}, env: base env for simulate (openings), budgetMs
 * Budget (deterministic): opts.maxSims (240) full simulations, opts.maxArcs (9000) free-arc evaluations;
 *   opts.budgetMs (2500) is only a safety cap.
 * @returns {{yaw, pitch, power, expect, robust, clean, pass, sims, arcs, ms}|null}
 */
export function solveLaunch(a) {
  const t0 = now();
  const { origin, target, scene } = a;
  const opts = a.opts || {};
  const fans = a.fans || [];
  const goal = makeGoal(target, scene, fans);
  const env = { bounds: true, ...(a.env || {}), wind: null, nudge: null };
  const lookups = a.lookups || {};
  let sims = 0, arcs = 0;

  // fan discs: keep-out zones (or the goal itself)
  scene.zones = fans.map((f) => ({ ...f }));
  let zoneTime = 0;
  const zoneEv = {
    zone(b, zn, dt) {
      if (goal.kind === 'fan' && zn.id === goal.fan.id) {
        zoneTime += dt;
        if (zoneTime >= 0.1) { b.done = true; b.reason = 'fan'; b.fanOwner = zn.id ?? null; }
      } else if (goal.kind !== 'fan') { b.done = true; b.reason = 'zone'; }
    },
  };

  const dx = target.x - origin.x, dz = target.z - origin.z;
  const D = Math.hypot(dx, dz);
  const ux = D > 1e-6 ? dx / D : 0, uz = D > 1e-6 ? dz / D : -1;     // horizontal unit toward target
  const vel = new THREE.Vector3();

  /** Height of the obstacle-free arc where it reaches horizontal distance `dist` (+ pruning info). */
  function arcAt(yaw, pitch, power, dist) {
    // Lightweight obstacle-free integration (same forces as stepBall, 1/120 s steps). It only picks the
    // aim power for a candidate; every candidate is then verified with the exact simulator.
    arcs++;
    launchVelocity({ yaw, pitch, power }, vel);
    const h = 1 / 120, G = PHYS.G, kq = PHYS.DRAG_QUAD, kl = PHYS.DRAG_LIN;
    let vx = vel.x, vy = vel.y, vz = vel.z, x = origin.x, y = origin.y, z = origin.z;
    let py = y, prevD = 0, maxH = y, crossedZone = false;
    const checkZones = goal.kind !== 'fan' && fans.length;
    for (let i = 0; i < 480; i++) {
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz), dr = kq * sp + kl;
      vx -= dr * vx * h; vy -= (G + dr * vy) * h; vz -= dr * vz * h;
      x += vx * h; y += vy * h; z += vz * h;
      if (y > maxH) maxH = y;
      if (checkZones) for (const f of fans) if (Math.abs(y - f.y) < f.hh + PHYS.R + 0.03 && Math.hypot(x - f.x, z - f.z) < f.r + PHYS.R + 0.06) crossedZone = true;
      const d = (x - origin.x) * ux + (z - origin.z) * uz;
      if (d >= dist) {
        const k = (dist - prevD) / Math.max(1e-9, d - prevD);
        return { y: py + (y - py) * k, maxH, crossedZone, descending: vy < 0 };
      }
      if (y < -1) return null;
      py = y; prevD = d;
    }
    return null;
  }

  /** Power whose free arc passes through (dist, y). */
  function powerFor(yaw, pitch, dist, y) {
    const hi = arcAt(yaw, pitch, 1, dist);
    if (!hi || hi.y < y) return null;
    const lo = arcAt(yaw, pitch, 0, dist);
    if (lo && lo.y > y) return null;
    let a0 = 0, a1 = 1;
    for (let i = 0; i < 11; i++) {
      const m = (a0 + a1) / 2;
      const r = arcAt(yaw, pitch, m, dist);
      if (!r || r.y < y) a0 = m; else a1 = m;
    }
    return (a0 + a1) / 2;
  }

  function run(sc, yaw, pitch, power) {
    sims++;
    zoneTime = 0;
    launchVelocity({ yaw, pitch, power }, vel);
    sc.zones = scene.zones;
    const res = simulate(sc, origin, vel, { env, ev: zoneEv });
    const landing = classifyLanding(res, lookups);
    return { res, landing, ...evaluate(goal, res, landing) };
  }

  const ceilingY = ROOM.height - PHYS.R - 0.03;
  const offsets = goal.kind === 'seat' || goal.kind === 'podium' || goal.kind === 'floor'
    ? [[0, 0], [-0.1, 0], [0.07, 0], [0.12, 0], [0, 0.12], [0, -0.12], [-0.16, 0], [0.12, 0.1], [0.12, -0.1], [-0.1, 0.12], [-0.1, -0.12]]
    : goal.kind === 'trigger' && goal.tag === 'trash' ? [[0, 0], [-0.05, 0], [0.05, 0], [0, 0.05], [0, -0.05]]
      : [[0, 0], [-0.08, 0], [0.08, 0]];
  const dYaw = 0.0045, dPow = 0.004;
  const pitches = pitchOrder(opts);

  // Deterministic budget: counts of simulations / arc evaluations, never wall-clock time.
  // budgetMs is only a safety cap far above the normal cost (BUG-003).
  const maxSims = opts.maxSims ?? a.maxSims ?? 240;
  const maxArcs = opts.maxArcs ?? a.maxArcs ?? 9000;
  const capMs = opts.budgetMs ?? a.budgetMs ?? 2500;
  const over = () => sims >= maxSims || arcs >= maxArcs || now() - t0 > capMs;

  // Pass 1 ("clean"): characters inflated by a margin, character contacts rejected. Such a path never
  // touches anybody in the real scene either, so it does not depend on head animation / gaze (BUG-001).
  // Pass 2 ("contact"): the real snapshot, character contacts allowed (only if no clean path exists).
  const passes = goal.kind === 'person' ? ['contact'] : ['clean', 'contact'];
  const cleanScene = passes[0] === 'clean' ? inflatedScene(scene) : null;
  let best = null;
  for (const pass of passes) {
    const sc = pass === 'clean' ? cleanScene : scene;
    const accept = (c) => c.ok && (pass === 'contact' || c.charHits === 0);
    let found = null;
    outer:
    for (let pi = 0; pi < pitches.length; pi++) {
      const pitch = pitches[pi] * DEG;
      for (const [along, side] of offsets) {
        if (over()) break outer;
        const ax = target.x + ux * along - uz * side, az = target.z + uz * along + ux * side;
        const yaw = Math.atan2(-(ax - origin.x), -(az - origin.z));
        const dist = Math.hypot(ax - origin.x, az - origin.z);
        const power = powerFor(yaw, pitch, dist, target.y);
        if (power == null) break; // no power reaches this aim point at this elevation; try the next one
        const arc = arcAt(yaw, pitch, power, dist);
        if (!arc || arc.maxH > ceilingY || arc.crossedZone) break;
        if (goal.kind === 'fan' && arc.descending && Math.abs(arc.y - target.y) > 0.3) continue;
        const c = run(sc, yaw, pitch, power);
        if (!accept(c)) continue;
        let robust = 0;
        for (const [dy, dp] of [[dYaw, 0], [-dYaw, 0], [0, dPow], [0, -dPow]]) {
          if (power + dp < 0 || power + dp > 1) continue;
          if (accept(run(sc, yaw + dy, pitch, power + dp))) robust++;
        }
        const cand = { yaw, pitch, power, robust, err: c.err, charHits: c.charHits, rank: pi, landing: c.landing, res: c.res, pass };
        const better = !found || cand.robust > found.robust || (cand.robust === found.robust && (cand.charHits < found.charHits || (cand.charHits === found.charHits && cand.err < found.err - 0.05)));
        if (better) found = cand;
        if (cand.robust >= 4 && cand.err < 0.2 && (cand.charHits === 0 || pi > 6)) break outer;
      }
    }
    // a clean path is preferred unless it is clearly fragile and a sturdier contact path exists
    if (found && (found.pass === 'clean' ? found.robust >= 2 : true)) { best = found; break; }
    if (found && !best) best = found;
    if (over()) break;
  }
  if (!best) return null;
  return {
    yaw: best.yaw, pitch: best.pitch, power: best.power,
    expect: { type: best.landing.type, seatId: best.landing.seatId, ownerId: best.landing.ownerId, pos: best.res.pos, flightTime: +best.res.t.toFixed(2) },
    goal: goal.kind, robust: best.robust, clean: best.charHits === 0, pass: best.pass, sims, arcs, ms: +(now() - t0).toFixed(1),
  };
}

// Characters grown by a safety margin (heads +4 cm, bodies/arms +3 cm) for the "clean" pass.
const INFL = new Grid();
function inflatedScene(scene) {
  const list = [];
  for (const o of scene.dynamic.all) {
    const c = o.src;
    if (!c) continue;
    if (o.tag === 'head' || o.tag === 'body') {
      const m = o.tag === 'head' ? 0.04 : 0.03;
      if (c.kind === 'sphere') list.push({ ...c, radius: c.radius + m });
      else if (c.kind === 'box') list.push({ ...c, min: { x: c.min.x - m, y: c.min.y - m, z: c.min.z - m }, max: { x: c.max.x + m, y: c.max.y + m, z: c.max.z + m } });
      else if (c.kind === 'obb') list.push({ ...c, halfSize: { x: c.halfSize.x + m, y: c.halfSize.y + m, z: c.halfSize.z + m } });
      else list.push(c);
    } else list.push(c);
  }
  const keys = scene.dynamic.all.map((o) => o.key);
  return new Scene(scene.static, INFL.setColliders(list, (c, i) => keys[i] ?? `d${i}`));
}

/** Fan discs (solver keep-out zones) from the world's fan list. */
export function fanZones(fans) {
  return (fans || []).map((f) => ({
    id: f.id, x: f.center?.x ?? f.x, z: f.center?.z ?? f.z, y: f.bladeY ?? f.center?.y ?? f.y, r: f.radius ?? f.r ?? 0.7, hh: 0.05,
  })).filter((f) => Number.isFinite(f.x + f.y + f.z + f.r));
}

export { dirFromYawPitch };
