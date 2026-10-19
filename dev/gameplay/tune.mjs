// Tuning helper: which targets can the solver reach for given SPEED_MAX / drag?
import * as P from '../../src/gameplay/physics.js';
import { solveLaunch, fanZones } from '../../src/gameplay/solver.js';
import { staticColliders, characterColliders, FAN_LIST } from './refscene.mjs';
import { SEATS, PLAYER_SEAT, BALL_RADIUS, TRASH, WINDOWS, TEACHER_DESK, FANS, AISLES_X, ROWS_Z } from '../../src/core/layout.js';
import * as THREE from 'three';
const [vmax, dq, dl] = process.argv.slice(2).map(Number);
if (vmax) P.PHYS.SPEED_MAX = vmax; if (process.env.G) P.PHYS.G = +process.env.G; if (process.env.VMIN) P.PHYS.SPEED_MIN = +process.env.VMIN; if (dq >= 0) P.PHYS.DRAG_QUAD = dq; if (dl >= 0) P.PHYS.DRAG_LIN = dl;
const sg = new P.Grid().setColliders(staticColliders());
const ch = characterColliders();
const scene = new P.Scene(sg, new P.Grid()); scene.setDynamic(ch.colliders, P.dynamicKeyFn());
const origin = P.launchOriginFor(0, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const w = WINDOWS.find((x) => x.open), f = FANS[0];
const targets = {
  trash: V(TRASH.x, TRASH.h * 0.6, TRASH.z), window: V(w.x - 0.6, w.sillY + 0.5, w.z),
  podium: V(TEACHER_DESK.x, TEACHER_DESK.topY + BALL_RADIUS, TEACHER_DESK.z), fan: V(f.x + f.r * 0.6, f.bladeY, f.z),
  teacher: V(0, 1.72, -5.45), floor: V(AISLES_X[1], BALL_RADIUS, (ROWS_Z[2] + ROWS_Z[3]) / 2), self: V(-3.12, 0.78, 1.8),
};
for (const s of SEATS) if (s.id !== PLAYER_SEAT) targets[s.id] = V(s.x, s.deskTopY + BALL_RADIUS, s.deskZ);
let fails = [], ms = 0, mx = 0, pw = 0, minpw = 1, ft = [];
for (const [k, t] of Object.entries(targets)) {
  const sol = solveLaunch({ origin, target: t, scene, fans: fanZones(FAN_LIST), lookups: ch.lookups, opts: {} });
  if (!sol) { fails.push(k); continue; }
  ms += sol.ms; mx = Math.max(mx, sol.ms); pw = Math.max(pw, sol.power); minpw = Math.min(minpw, sol.power); { const r = P.simulate(scene, origin, P.launchVelocity(sol)); ft.push(r.hits.length ? r.hits[0].t : r.t); }
  if (process.env.V) console.log(k, 'sims', sol.sims, 'arcs', sol.arcs, sol.pass, (sol.pitch * 57.3).toFixed(0), sol.power.toFixed(3), 'robust', sol.robust, sol.expect.type, sol.ms + 'ms');
}
console.log(`vmax ${P.PHYS.SPEED_MAX} drag ${P.PHYS.DRAG_QUAD}/${P.PHYS.DRAG_LIN}: fails [${fails}] avg ${(ms / (Object.keys(targets).length - fails.length)).toFixed(1)}ms max ${mx.toFixed(0)}ms maxPower ${pw.toFixed(2)} minPower ${minpw.toFixed(2)} G ${P.PHYS.G} vmin ${P.PHYS.SPEED_MIN} airborne median ${ft.sort((a,b)=>a-b)[ft.length>>1]} min ${ft[0]} max ${ft[ft.length-1]}`);
