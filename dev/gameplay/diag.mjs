import * as P from '../../src/gameplay/physics.js';
import { classifyLanding } from '../../src/gameplay/landing.js';
import { staticColliders, characterColliders } from './refscene.mjs';
import { SEAT_BY_ID, BALL_RADIUS } from '../../src/core/layout.js';
import * as THREE from 'three';
const sg = new P.Grid().setColliders(staticColliders());
const ch = characterColliders();
const scene = new P.Scene(sg, new P.Grid()); scene.setDynamic(ch.colliders, P.dynamicKeyFn());
const o = P.launchOriginFor(0, 0);
const s = SEAT_BY_ID[process.argv[2] || 'r0c5'];
const yaw = Math.atan2(-(s.x - o.x), -(s.deskZ - o.z));
for (let pd = 20; pd <= 60; pd += 4) {
  let line = `pitch ${pd}: `;
  for (let pw = 0.8; pw <= 1.0001; pw += 0.025) {
    const r = P.simulate(scene, o, P.launchVelocity({ yaw, pitch: pd * Math.PI / 180, power: pw }));
    const L = classifyLanding(r, ch.lookups);
    line += `${pw.toFixed(3)}:${L.type}/${L.seatId || ''}${r.maxHeight > 3.1 ? '^' : ''} `;
  }
  console.log(line);
}
