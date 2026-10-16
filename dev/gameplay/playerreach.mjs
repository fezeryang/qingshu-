// Which desks can a human reach? Player launch elevation is limited to fp pitch (−35°..+25°) + 10°.
import * as P from '../../src/gameplay/physics.js';
import { solveLaunch, fanZones } from '../../src/gameplay/solver.js';
import { staticColliders, characterColliders, FAN_LIST } from './refscene.mjs';
import { SEATS, PLAYER_SEAT, BALL_RADIUS } from '../../src/core/layout.js';
import * as THREE from 'three';
const maxP = +(process.argv[2] || 35);
const sg = new P.Grid().setColliders(staticColliders());
const ch = characterColliders({ headR: +(process.argv[3] || 0.15) });
const scene = new P.Scene(sg, new P.Grid()); scene.setDynamic(ch.colliders, P.dynamicKeyFn());
const origin = P.launchOriginFor(0, 0);
const res = [];
for (const s of SEATS) if (s.id !== PLAYER_SEAT) {
  const sol = solveLaunch({ origin, target: new THREE.Vector3(s.x, s.deskTopY + BALL_RADIUS, s.deskZ), scene, fans: fanZones(FAN_LIST), lookups: ch.lookups, opts: { maxPitchDeg: maxP, minPitchDeg: -25 }, budgetMs: 400 });
  res.push(`${s.id}:${sol ? (sol.pitch * 57.3).toFixed(0) + (sol.robust < 4 ? '?' : '') : '--'}`);
}
console.log(`max launch pitch ${maxP}°: reachable ${res.filter((x) => !x.endsWith('--')).length}/29\n${res.join(' ')}`);
