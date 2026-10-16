// The classroom set (owner: env-artist). Every number comes from src/core/layout.js.
// Visible boxes and colliders are produced by the same calls (makeSolid) so they stay aligned.
import * as THREE from 'three';
import {
  ROOM, SEATS, DESK, CHAIR, PLATFORM, TEACHER_DESK, BLACKBOARD, WINDOWS, DOORS, TRASH, PLAYER_SEAT,
} from '../core/layout.js';
import { Batch, GEO, mat4, V, toon, colBox, colTrigger, makeSolid, worldUV, atlasUV, rectUV, mergeColored, rngFor, TAU } from './kit.js';
import { PAL } from './palette.js';
import { woodFloorTexture, deskAtlas, bannerTexture, posterAtlas, newspaperTexture, facadeTexture, glassTexture } from './textures.js';
import { createBlackboard } from './blackboard.js';
import { createFans, createCurtains, createClock } from './fixtures.js';
import { createSky, createStars, createClouds, createRain, createShafts, createDust, createSunPatches, treeParts } from './atmos.js';

const WALL_T = 0.12;

// Lighting moods. sunDir points TOWARD the sun (light travels along -sunDir).
const MOODS = {
  day: {
    sunDir: [-1, 0.74, 0.3], sun: 0xffdcaa, sunI: 2.7, hemiSky: 0xe3ecff, hemiGround: 0xd6bc98, hemiI: 1.15, ambI: 0.22, lights: true, ceil: 0.42, exposure: 1.0,
    sky: { top: 0x5fa8ec, horizon: 0xdcefff, bottom: 0xb8c8bc, sun: 0xfff1cf, band: 0x101008, sunSize: 1, glow: 0.45 },
    shaft: [0xffe0a8, 0.15], dust: [0xfff0cc, 0.9], patch: [0xffd49a, 0.34], clouds: [0xffffff, 0.3], facadeNight: false, rain: false, stars: 0,
  },
  sunset: {
    sunDir: [-1, 0.28, 0.42], sun: 0xff9550, sunI: 3.0, hemiSky: 0xffc7a0, hemiGround: 0x8a5a4a, hemiI: 0.85, ambI: 0.12, lights: false, ceil: 0.22, exposure: 1.05,
    sky: { top: 0x3f4f92, horizon: 0xffb27a, bottom: 0x6a4a58, sun: 0xffc080, band: 0x40180a, sunSize: 3, glow: 0.9 },
    shaft: [0xffa060, 0.2], dust: [0xffc890, 0.9], patch: [0xff9a5a, 0.42], clouds: [0xffc4a0, 0.35], facadeNight: false, rain: false, stars: 0,
  },
  night: {
    sunDir: [-1, 0.9, -0.35], sun: 0x9fb6ff, sunI: 0.9, hemiSky: 0x34466e, hemiGround: 0x141822, hemiI: 0.75, ambI: 0.0, lights: false, ceil: 0.03, exposure: 1.1,
    sky: { top: 0x070b1c, horizon: 0x1c2a4a, bottom: 0x0a0e18, sun: 0xdde6ff, band: 0x000000, sunSize: 4, glow: 0.25 },
    shaft: [0x9fb8ff, 0.07], dust: [0xbfd0ff, 0.35], patch: [0x8fa8ff, 0.2], clouds: [0x3a4560, 0.05], facadeNight: true, rain: false, stars: 1,
  },
  rain: {
    sunDir: [-1, 0.9, 0.2], sun: 0xc8d4e0, sunI: 0.35, hemiSky: 0xd0d8e2, hemiGround: 0x8a8678, hemiI: 1.3, ambI: 0.42, lights: true, ceil: 0.5, exposure: 1.0,
    sky: { top: 0x8a96a4, horizon: 0xbcc4cc, bottom: 0x7a8278, sun: 0x000000, band: 0x000000, sunSize: 0, glow: 0 },
    shaft: [0xffffff, 0.0], dust: [0xffffff, 0.0], patch: [0xffffff, 0.0], clouds: [0x9aa2ac, 0.05], facadeNight: false, rain: true, stars: 0,
  },
};

export function buildClassroom(ctx) {
  const lowfx = !!ctx.config.lowfx;
  const group = new THREE.Group();
  group.name = 'classroom';
  const colliders = [];
  const { minX, maxX, minZ, maxZ, height: H } = ROOM;
  const WAIN = WINDOWS[0].sillY;            // wainscot height = window sill

  // ------------------------------------------------------------------ materials
  const mVC = toon();
  const mCeil = toon({ emissive: 0xfff4e2, emissiveIntensity: 0.4 });   // bounce + fluorescent light on the ceiling
  const floorTex = woodFloorTexture();
  const mFloor = toon({ map: floorTex });
  const atlas = deskAtlas();
  const mDesk = toon({ map: atlas.texture });
  const posters = posterAtlas();
  const mPoster = toon({ map: posters.texture });
  const mBanner = toon({ map: bannerTexture() });
  const news = newspaperTexture(0);
  const mNews = toon({ map: news.texture });
  const mGlass = new THREE.MeshBasicMaterial({ map: glassTexture(), color: PAL.glass, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });
  const mTube = new THREE.MeshBasicMaterial({ color: 0xfffaf0, vertexColors: true });
  const facadeDay = facadeTexture(false), facadeNight = facadeTexture(true);
  for (const t of [facadeDay, facadeNight]) t.repeat.set(1, 1);
  const mFacade = toon({ map: facadeDay });

  const B = new Batch();     // opaque, casts + receives shadows
  const BN = new Batch();    // opaque decals (posters), receive only
  const BG = new Batch();    // glass (transparent)
  const solid = makeSolid(B, colliders);

  // ------------------------------------------------------------------ shell
  // floor (visual = room interior; collider extends beyond the walls)
  B.boxMM(mFloor, 0xffffff, minX, -0.1, minZ, maxX, 0, maxZ, worldUV(0.5));
  colliders.push(colBox(minX - 1, -0.3, minZ - 1, maxX + 1, 0, maxZ + 1, 'floor'));
  solid(mCeil, PAL.ceiling, minX - WALL_T, H, minZ - WALL_T, maxX + WALL_T, H + 0.1, maxZ + WALL_T, 'ceiling');

  /** Wall box split at the wainscot line (mint below, cream above) + one collider. */
  const wall = (x0, y0, z0, x1, y1, z1, tag = 'wall') => {
    if (y0 < WAIN && y1 > WAIN) {
      B.boxMM(mVC, PAL.wainscot, x0, y0, z0, x1, WAIN, z1);
      B.boxMM(mVC, PAL.wall, x0, WAIN, z0, x1, y1, z1);
    } else B.boxMM(mVC, y1 <= WAIN ? PAL.wainscot : PAL.wall, x0, y0, z0, x1, y1, z1);
    colliders.push(colBox(x0, y0, z0, x1, y1, z1, tag));
  };
  // front / back
  wall(minX - WALL_T, 0, minZ - WALL_T, maxX + WALL_T, H, minZ);
  wall(minX - WALL_T, 0, maxZ, maxX + WALL_T, H, maxZ + WALL_T);
  // right wall with door openings
  {
    const ds = [...DOORS].sort((a, b) => a.z - b.z);
    let z = minZ;
    for (const d of ds) {
      const z0 = d.z - d.w / 2, z1 = d.z + d.w / 2;
      if (z0 > z) wall(maxX, 0, z, maxX + WALL_T, H, z0);
      wall(maxX, d.h, z0, maxX + WALL_T, H, z1);
      z = z1;
    }
    if (z < maxZ) wall(maxX, 0, z, maxX + WALL_T, H, maxZ);
  }
  // left wall with window openings
  {
    const ws = [...WINDOWS].sort((a, b) => a.z - b.z);
    let z = minZ;
    for (const w of ws) {
      const z0 = w.z - w.w / 2, z1 = w.z + w.w / 2;
      if (z0 > z) wall(minX - WALL_T, 0, z, minX, H, z0);
      wall(minX - WALL_T, 0, z0, minX, w.sillY, z1);
      wall(minX - WALL_T, w.sillY + w.h, z0, minX, H, z1);
      z = z1;
    }
    if (z < maxZ) wall(minX - WALL_T, 0, z, minX, H, maxZ);
  }
  // wainscot trim + skirting (visual, ≤ 1.5 cm proud of the wall)
  const trimRun = (axis, fixed, a0, a1, y0, y1, inward) => {
    if (axis === 'x') B.boxMM(mVC, PAL.wainscotTrim, a0, y0, fixed, a1, y1, fixed + inward);
    else B.boxMM(mVC, PAL.wainscotTrim, fixed, y0, a0, fixed + inward, y1, a1);
  };
  for (const [y0, y1] of [[WAIN - 0.035, WAIN], [0, 0.08]]) {
    trimRun('x', minZ, minX, maxX, y0, y1, 0.012);
    trimRun('x', maxZ, minX, maxX, y0, y1, -0.012);
    for (const d of [...DOORS].sort((a, b) => a.z - b.z).reduce((acc, d, i, arr) => { const prev = i ? arr[i - 1].z + arr[i - 1].w / 2 : minZ; acc.push([prev, d.z - d.w / 2]); if (i === arr.length - 1) acc.push([d.z + d.w / 2, maxZ]); return acc; }, [])) {
      if (d[1] - d[0] > 0.1) trimRun('z', maxX, d[0] + 0.07, d[1] - 0.07, y0, y1, -0.012);
    }
    if (y0 === 0) trimRun('z', minX, minZ, maxZ, y0, y1, 0.012);
    else {
      const ws = [...WINDOWS].sort((a, b) => a.z - b.z);
      let z = minZ;
      for (const w of ws) { trimRun('z', minX, z, w.z - w.w / 2 - 0.06, y0, y1, 0.012); z = w.z + w.w / 2 + 0.06; }
      trimRun('z', minX, z, maxZ, y0, y1, 0.012);
    }
  }

  // ------------------------------------------------------------------ windows
  const windowsOut = WINDOWS.map((w) => ({ ...w }));
  for (const w of WINDOWS) {
    const z0 = w.z - w.w / 2, z1 = w.z + w.w / 2, y0 = w.sillY, y1 = w.sillY + w.h, F = 0.05, X0 = minX - WALL_T, X1 = minX;
    const fr = (a, b, c, d, e, f) => solid(mVC, PAL.frame, a, b, c, d, e, f, 'windowFrame');
    fr(X0, y0, z0, X1, y0 + F, z1);
    fr(X0, y1 - F, z0, X1, y1, z1);
    fr(X0, y0, z0, X1, y1, z0 + F);
    fr(X0, y0, z1 - F, X1, y1, z1);
    solid(mVC, { top: 0xf8f6f0, side: 0xe6e2d6 }, minX, y0 - 0.035, z0 - 0.06, minX + 0.1, y0, z1 + 0.06, 'windowFrame'); // inner sill ledge
    if (!w.open) {
      const sx0 = minX - 0.085, sx1 = minX - 0.035;
      fr(sx0, y0 + F, w.z - 0.035, sx1, y1 - F, w.z + 0.035);                       // meeting stile
      const ry = y0 + w.h * 0.64;
      fr(sx0, ry - 0.02, z0 + F, sx1, ry + 0.02, z1 - F);                            // transom rail
      BG.boxMM(mGlass, 0xffffff, minX - 0.064, y0 + F, z0 + F, minX - 0.056, y1 - F, z1 - F, rectUV([0, 0, 1, 1]));
      colliders.push(colBox(minX - 0.066, y0 + F, z0 + F, minX - 0.054, y1 - F, z1 - F, 'windowGlass'));
    } else {
      // two casement sashes swung outward (outside the room; visual only — the 'outside' trigger fires first)
      const sashW = (w.w - 2 * F) / 2, sh = w.h - 2 * F;
      for (const side of [-1, 1]) {
        const hingeZ = side < 0 ? z0 + F : z1 - F;
        const ang = side < 0 ? -1.25 : 1.25;
        const M = new THREE.Matrix4().makeTranslation(X0, y0 + F, hingeZ).multiply(new THREE.Matrix4().makeRotationY(ang));
        const dir = side < 0 ? 1 : -1; // local +z / -z along the sash
        const part = (cz, cy, sz, sy, color, mat = mVC, batch = B) => batch.add(GEO.box, mat, M.clone().multiply(mat4(-0.02, cy, cz * dir, 0, 0, 0, 0.035, sy, sz)), color);
        part(sashW / 2, 0.02, sashW, 0.04, PAL.frame); part(sashW / 2, sh - 0.02, sashW, 0.04, PAL.frame);
        part(0.02, sh / 2, 0.04, sh, PAL.frame); part(sashW - 0.02, sh / 2, 0.04, sh, PAL.frame);
        part(sashW / 2, sh * 0.64, sashW, 0.035, PAL.frame);
        part(sashW / 2, sh / 2, sashW - 0.06, sh - 0.06, 0xffffff, mGlass, BG);
      }
    }
  }
  // potted plants on the closed windows' sills
  for (const w of WINDOWS.filter((x) => !x.open)) {
    const px = minX + 0.05, pz = w.z + 0.45, y0 = w.sillY;
    solid(mVC, { top: 0x5a3a28, side: PAL.plantPot }, px - 0.06, y0, pz - 0.06, px + 0.06, y0 + 0.11, pz + 0.06, 'prop');
    const r = rngFor(`plant-${w.id}`);
    for (let k = 0; k < 6; k++) B.add(GEO.ico0, mVC, mat4(px + r.range(-0.05, 0.08), y0 + 0.15 + r.range(0, 0.1), pz + r.range(-0.08, 0.08), r.range(0, 3), r.range(0, 3), 0, 0.09, 0.06, 0.12), k % 2 ? PAL.leaf : PAL.leafDark);
  }

  // ------------------------------------------------------------------ doors (right wall)
  for (const d of DOORS) {
    const z0 = d.z - d.w / 2, z1 = d.z + d.w / 2;
    solid(mVC, { top: PAL.door, side: PAL.door }, maxX + 0.02, 0, z0, maxX + 0.06, d.h, z1, 'door');
    B.boxMM(mVC, 0x9c6a42, maxX + 0.012, 0.12, z0 + 0.12, maxX + 0.02, 0.95, z1 - 0.12);           // lower panel
    B.boxMM(mVC, 0xe8e2d0, maxX + 0.012, 1.2, z0 + 0.18, maxX + 0.02, 1.85, z1 - 0.18);           // window frame
    BG.boxMM(mGlass, 0xffffff, maxX + 0.008, 1.24, z0 + 0.22, maxX + 0.012, 1.81, z1 - 0.22, rectUV([0, 0, 1, 1]));
    B.add(GEO.cyl8, mVC, mat4(maxX - 0.02, 1.0, z1 - 0.12, 0, 0, Math.PI / 2, 0.03, 0.08, 0.03), 0xcfd4d8);  // handle
    // architrave (room side)
    solid(mVC, PAL.doorFrame, maxX - 0.02, 0, z0 - 0.07, maxX, d.h + 0.07, z0, 'wall');
    solid(mVC, PAL.doorFrame, maxX - 0.02, 0, z1, maxX, d.h + 0.07, z1 + 0.07, 'wall');
    solid(mVC, PAL.doorFrame, maxX - 0.02, d.h, z0, maxX, d.h + 0.07, z1, 'wall');
    B.boxMM(mVC, PAL.doorFrame, maxX, 0, z0, maxX + 0.02, d.h, z0 + 0.02);
    B.boxMM(mVC, PAL.doorFrame, maxX, 0, z1 - 0.02, maxX + 0.02, d.h, z1);
  }

  // ------------------------------------------------------------------ front: platform, teacher desk, blackboard
  {
    const P = PLATFORM;
    solid(mVC, { top: PAL.platformTop, side: PAL.platformSide }, P.minX, 0, P.minZ, P.maxX, P.h, P.maxZ, 'podium');
    B.boxMM(mVC, 0x7a5434, P.minX, P.h - 0.02, P.maxZ, P.maxX, P.h, P.maxZ + 0.008);   // nosing
    const T = TEACHER_DESK, tx = T.x, tz = T.z, hw = T.w / 2, hd = T.d / 2;
    solid(mVC, { top: PAL.teacherDesk, side: PAL.teacherDesk }, tx - hw + 0.03, P.h, tz - hd + 0.03, tx + hw - 0.03, T.topY - 0.04, tz + hd - 0.03, 'teacherDesk');
    solid(mVC, { top: 0xc28a58, side: 0x9a6a40 }, tx - hw, T.topY - 0.04, tz - hd, tx + hw, T.topY, tz + hd, 'teacherDesk');
    // front panel decoration (students' side)
    B.boxMM(mVC, PAL.teacherDeskPanel, tx - hw + 0.1, P.h + 0.12, tz + hd - 0.03, tx + hw - 0.1, T.topY - 0.14, tz + hd - 0.02);
    B.boxMM(mVC, 0xf2c94c, tx - 0.12, T.topY - 0.42, tz + hd - 0.025, tx + 0.12, T.topY - 0.3, tz + hd - 0.015);
    const top = T.topY;
    // thermos
    B.add(GEO.cyl16, mVC, mat4(tx + 0.45, top + 0.09, tz - 0.08, 0, 0, 0, 0.075, 0.18, 0.075), { top: 0xd8dde2, side: 0xb9c2ca });
    B.add(GEO.cyl16, mVC, mat4(tx + 0.45, top + 0.2, tz - 0.08, 0, 0, 0, 0.078, 0.045, 0.078), 0xc8322d);
    colliders.push(colBox(tx + 0.41, top, tz - 0.12, tx + 0.49, top + 0.225, tz - 0.04, 'teacherDesk'));
    // chalk box with chalk
    solid(mVC, { top: 0xffffff, side: 0xf4e9c8 }, tx - 0.48, top, tz - 0.04, tx - 0.34, top + 0.07, tz + 0.05, 'teacherDesk');
    [0xffffff, 0xffe27a, 0xff9fb4, 0xffffff, 0x9fd8ff].forEach((c, i) => B.add(GEO.cyl8, mVC, mat4(tx - 0.46 + i * 0.025, top + 0.085, tz, 0, 0, 0, 0.012, 0.03, 0.012), c));
    // lesson plan + textbook
    solid(mVC, { top: 0x3d6fb6, side: 0xf3eedf }, tx - 0.17, top, tz - 0.1, tx + 0.11, top + 0.022, tz + 0.1, 'teacherDesk');
    B.boxMM(mVC, { top: 0xe86a5c, side: 0xf3eedf }, tx - 0.15, top + 0.022, tz - 0.08, tx + 0.09, top + 0.036, tz + 0.08);
    // triangle ruler + pointer (flat, visual)
    B.add(new THREE.CylinderGeometry(0.12, 0.12, 0.004, 3), mVC, mat4(tx + 0.2, top + 0.003, tz + 0.12, 0, 0.4, 0), 0xffd9a0);
    B.add(GEO.cyl8, mVC, mat4(tx - 0.05, top + 0.01, tz + 0.2, 0, 0.3, Math.PI / 2, 0.012, 0.8, 0.012), 0x8a5a33);
  }
  // blackboard: backing, frame, chalk tray
  {
    const bb = BLACKBOARD, x0 = bb.x - bb.w / 2, x1 = bb.x + bb.w / 2, y0 = bb.y - bb.h / 2, y1 = bb.y + bb.h / 2, F = 0.05, fz = bb.z + 0.018;
    B.boxMM(mVC, 0x24443a, x0, y0, minZ, x1, y1, bb.z);
    colliders.push(colBox(x0, y0, minZ, x1, y1, bb.z, 'blackboard'));
    const fc = { top: 0xd0d8dc, side: PAL.boardFrame };
    solid(mVC, fc, x0 - F, y1, minZ, x1 + F, y1 + F, fz, 'blackboard');
    solid(mVC, fc, x0 - F, y0 - F, minZ, x1 + F, y0, fz, 'blackboard');
    solid(mVC, fc, x0 - F, y0, minZ, x0, y1, fz, 'blackboard');
    solid(mVC, fc, x1, y0, minZ, x1 + F, y1, fz, 'blackboard');
    // chalk tray
    solid(mVC, { top: 0xaab4ba, side: 0x98a3aa }, x0 - F, y0 - F - 0.025, minZ, x1 + F, y0 - F, bb.z + 0.11, 'blackboard');
    solid(mVC, 0x98a3aa, x0 - F, y0 - F - 0.025, bb.z + 0.1, x1 + F, y0 - F + 0.02, bb.z + 0.11, 'blackboard');
    const ty = y0 - F;
    const r = rngFor('chalk');
    for (let i = 0; i < 9; i++) B.add(GEO.cyl8, mVC, mat4(r.range(x0 + 0.3, x1 - 0.3), ty + 0.006, bb.z + r.range(0.04, 0.08), Math.PI / 2, r.range(0, 1), 0, 0.012, r.range(0.025, 0.07), 0.012), r.pick([0xffffff, 0xffffff, 0xffe27a, 0xff9fb4, 0x9fd8ff]));
    B.boxMM(mVC, { top: 0x8a5a33, side: 0x5a5a62 }, 1.2, ty, bb.z + 0.025, 1.34, ty + 0.045, bb.z + 0.08);   // eraser
    // chalk dust on the tray lip
    B.boxMM(mVC, 0xe8ece8, x0, ty + 0.0005, bb.z + 0.01, x1, ty + 0.0015, bb.z + 0.09);
  }
  // banners left/right of the clock
  {
    const y0 = 2.5, y1 = 2.78, z = minZ + 0.006;
    BN.add(GEO.plane, mBanner, mat4(-1.42, (y0 + y1) / 2, z, 0, 0, 0, 2.1, y1 - y0, 1), 0xffffff, rectUV([0, 0.5, 1, 1]));
    BN.add(GEO.plane, mBanner, mat4(1.42, (y0 + y1) / 2, z, 0, 0, 0, 2.1, y1 - y0, 1), 0xffffff, rectUV([0, 0, 1, 0.5]));
  }

  // ------------------------------------------------------------------ wall decor (posters atlas)
  const R = posters.rects;
  const posterAt = (name, cx, cy, w, h, wallSide) => {
    // wallSide: 'front' (z=minZ, faces +z), 'back' (z=maxZ, faces -z), 'right' (x=maxX, faces -x)
    let m;
    if (wallSide === 'front') m = mat4(cx, cy, minZ + 0.008, 0, 0, 0, w, h, 1);
    else if (wallSide === 'back') m = mat4(cx, cy, maxZ - 0.008, 0, Math.PI, 0, w, h, 1);
    else m = mat4(maxX - 0.008, cy, cx, 0, -Math.PI / 2, 0, w, h, 1);
    BN.add(GEO.plane, mPoster, m, 0xffffff, rectUV(R[name]));
  };
  posterAt('rules', -3.55, 1.65, 0.6, 0.9, 'front');
  posterAt('schedule', 3.55, 1.7, 1.0, 0.75, 'front');
  posterAt('cert1', -2.2, 2.15, 0.56, 0.42, 'right');
  posterAt('cert2', -1.5, 2.15, 0.56, 0.42, 'right');
  posterAt('cert3', -0.8, 2.15, 0.56, 0.42, 'right');
  posterAt('map', -1.5, 1.45, 1.05, 0.7, 'right');
  posterAt('duty', 1.0, 1.55, 0.75, 0.5, 'right');
  posterAt('notice', 2.4, 1.45, 0.3, 0.15, 'right');
  posterAt('scroll', 3.4, 1.75, 0.34, 1.2, 'back');
  // speaker box (front wall, top left)
  solid(mVC, { top: 0xe8e2d4, side: 0xd8d0c0 }, -3.45, 2.6, minZ, -3.15, 2.9, minZ + 0.14, 'prop');
  BN.add(GEO.plane, mPoster, mat4(-3.3, 2.75, minZ + 0.142, 0, 0, 0, 0.26, 0.26, 1), 0xffffff, rectUV(R.speaker));
  // class sign above the front door (room side)
  BN.add(GEO.plane, mPoster, mat4(maxX - 0.01, 2.45, DOORS[0].z, 0, -Math.PI / 2, 0, 0.6, 0.3, 1), 0xffffff, rectUV(R.sign));

  // back wall: 黑板报 with frame, lockers, water dispenser
  {
    const x0 = -2.15, x1 = 2.15, y0 = 1.2, y1 = 2.7;
    B.boxMM(mVC, 0x2c4f40, x0, y0, maxZ - 0.02, x1, y1, maxZ);
    BN.add(GEO.plane, mNews, mat4(0, (y0 + y1) / 2, maxZ - 0.022, 0, Math.PI, 0, x1 - x0, y1 - y0, 1), 0xffffff);
    const fc = 0xb8a07a;
    solid(mVC, fc, x0 - 0.04, y1, maxZ - 0.04, x1 + 0.04, y1 + 0.04, maxZ, 'wall');
    solid(mVC, fc, x0 - 0.04, y0 - 0.04, maxZ - 0.06, x1 + 0.04, y0, maxZ, 'wall');
    solid(mVC, fc, x0 - 0.04, y0, maxZ - 0.04, x0, y1, maxZ, 'wall');
    solid(mVC, fc, x1, y0, maxZ - 0.04, x1 + 0.04, y1, maxZ, 'wall');
    // lockers (back-left)
    const lx0 = minX + 0.15, lx1 = -2.45, lz0 = maxZ - 0.42, ly1 = 1.1;
    solid(mVC, { top: 0xdfe6ea, side: PAL.lockerBody }, lx0, 0, lz0, lx1, ly1, maxZ, 'prop');
    const cols = 6, rows = 3, cw = (lx1 - lx0) / cols, rh = (ly1 - 0.1) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const cx0 = lx0 + i * cw + 0.02, cy0 = 0.08 + j * rh + 0.02;
      B.boxMM(mVC, (i + j) % 3 === 0 ? 0x9cc6da : PAL.locker, cx0, cy0, lz0 - 0.008, cx0 + cw - 0.04, cy0 + rh - 0.04, lz0);
      B.boxMM(mVC, 0x6d8796, cx0 + cw - 0.11, cy0 + rh / 2 - 0.05, lz0 - 0.016, cx0 + cw - 0.09, cy0 + rh / 2 + 0.05, lz0 - 0.008);
    }
    // on top of the lockers: basketball, globe, book pile
    B.add(GEO.sphere, mVC, mat4(-4.3, ly1 + 0.12, maxZ - 0.21, 0, 0, 0, 0.24, 0.24, 0.24), (nx, ny, nz) => (Math.abs(nx) < 0.08 || Math.abs(ny) < 0.08 ? 0x3a2418 : 0xe07b39));
    colliders.push(colBox(-4.42, ly1, maxZ - 0.33, -4.18, ly1 + 0.24, maxZ - 0.09, 'prop'));
    B.add(GEO.sphere, mVC, mat4(-3.55, ly1 + 0.2, maxZ - 0.21, 0.4, 0, 0.3, 0.24, 0.24, 0.24), (nx, ny) => (ny > 0.3 ? 0x7fc39a : 0x5f9fd8));
    B.add(GEO.cyl8, mVC, mat4(-3.55, ly1 + 0.04, maxZ - 0.21, 0, 0, 0, 0.12, 0.08, 0.12), 0xc8a050);
    colliders.push(colBox(-3.67, ly1, maxZ - 0.33, -3.43, ly1 + 0.32, maxZ - 0.09, 'prop'));
    let by = ly1;
    for (let k = 0; k < 5; k++) { const h = 0.03 + (k % 2) * 0.012; B.boxMM(mVC, { top: PAL.books[k], side: 0xf3eedf }, -3.0 + (k % 2) * 0.01, by, maxZ - 0.33, -2.7 + (k % 2) * 0.01, by + h, maxZ - 0.1); by += h; }
    colliders.push(colBox(-3.0, ly1, maxZ - 0.33, -2.69, by, maxZ - 0.1, 'prop'));
    // water dispenser (back-right corner)
    const wx = maxX - 0.3, wz = maxZ - 0.25;
    solid(mVC, { top: 0xf2f2f2, side: 0xe9edf0 }, wx - 0.16, 0, wz - 0.17, wx + 0.16, 0.95, wz + 0.17, 'prop');
    B.boxMM(mVC, 0x6a7a88, wx - 0.1, 0.62, wz - 0.18, wx + 0.1, 0.78, wz - 0.17);
    B.add(GEO.cyl8, mVC, mat4(wx - 0.05, 0.7, wz - 0.2, Math.PI / 2, 0, 0, 0.025, 0.04, 0.025), 0xd8463c);
    B.add(GEO.cyl8, mVC, mat4(wx + 0.05, 0.7, wz - 0.2, Math.PI / 2, 0, 0, 0.025, 0.04, 0.025), 0x4d9ed2);
    const bottle = mergeColored([[GEO.cyl16, mat4(0, 0, 0, 0, 0, 0, 0.27, 0.42, 0.27), 0x8fd0ff]]);
    const bm = new THREE.Mesh(bottle, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: mVC.gradientMap, transparent: true, opacity: 0.65 }));
    bm.position.set(wx, 0.95 + 0.21, wz);
    group.add(bm);
    colliders.push(colBox(wx - 0.135, 0.95, wz - 0.135, wx + 0.135, 1.37, wz + 0.135, 'prop'));
  }

  // ------------------------------------------------------------------ ceiling lights
  const tubeParts = [];
  for (const lx of [-2.8, 0, 2.8]) for (const lz of [-3.6, -0.7, 2.2]) {
    const y0 = H - 0.15, y1 = H - 0.08;
    solid(mVC, { top: 0xf0f0ea, side: 0xe4e4dc, bottom: 0xd8d8d0 }, lx - 0.09, y1 - 0.04, lz - 0.66, lx + 0.09, y1, lz + 0.66, 'prop');
    colliders.push(colBox(lx - 0.09, y0, lz - 0.66, lx + 0.09, y1 - 0.04, lz + 0.66, 'prop'));
    for (const dz of [-0.5, 0.5]) B.add(GEO.cyl8, mVC, mat4(lx, (H + y1) / 2, lz + dz, 0, 0, 0, 0.012, H - y1, 0.012), 0xb0b0a8);
    for (const dx of [-0.045, 0.045]) tubeParts.push([GEO.cyl8, mat4(lx + dx, y0 + 0.02, lz, Math.PI / 2, 0, 0, 0.032, 1.2, 0.032), 0xffffff]);
  }
  const tubes = new THREE.Mesh(mergeColored(tubeParts), mTube);
  tubes.name = 'tubes';
  group.add(tubes);

  // ------------------------------------------------------------------ trash bin (front-right)
  {
    const t = TRASH, th = 0.018, x0 = t.x - t.r, x1 = t.x + t.r, z0 = t.z - t.r, z1 = t.z + t.r;
    const binCol = (nx, ny, nz, px, py, pz) => {
      const inward = nx * (t.x - px) + nz * (t.z - pz);
      if (ny > 0.5) return 0x5aaee0;
      return inward > 0.001 ? PAL.trashDark : PAL.trash;
    };
    solid(mVC, binCol, x0, 0, z0, x1, t.h, z0 + th, 'trashRim');
    solid(mVC, binCol, x0, 0, z1 - th, x1, t.h, z1, 'trashRim');
    solid(mVC, binCol, x0, 0, z0 + th, x0 + th, t.h, z1 - th, 'trashRim');
    solid(mVC, binCol, x1 - th, 0, z0 + th, x1, t.h, z1 - th, 'trashRim');
    B.boxMM(mVC, 0x2a5f85, x0 + th, 0, z0 + th, x1 - th, 0.015, z1 - th);
    // rim lip (visual, 6 mm proud)
    for (const [a, b, c, d] of [[x0 - 0.006, z0 - 0.006, x1 + 0.006, z0 + 0.012], [x0 - 0.006, z1 - 0.012, x1 + 0.006, z1 + 0.006], [x0 - 0.006, z0, x0 + 0.012, z1], [x1 - 0.012, z0, x1 + 0.006, z1]]) B.boxMM(mVC, 0x3f8cc0, a, t.h - 0.03, b, c, t.h, d);
    // recycle sticker on the room-facing side
    B.boxMM(mVC, 0xffffff, x0 - 0.002, 0.16, t.z - 0.07, x0, 0.28, t.z + 0.07);
    B.add(new THREE.CylinderGeometry(0.04, 0.04, 0.003, 3), mVC, mat4(x0 - 0.003, 0.22, t.z, 0, 0, Math.PI / 2), 0x48a868);
    // paper inside
    const r = rngFor('trash');
    for (let i = 0; i < 4; i++) B.add(GEO.ico0, mVC, mat4(t.x + r.range(-0.1, 0.1), 0.05 + i * 0.02, t.z + r.range(-0.1, 0.1), r.range(0, 3), r.range(0, 3), 0, 0.08, 0.07, 0.08), 0xf4f1e6);
    colliders.push(colTrigger(x0 + th, 0, z0 + th, x1 - th, t.h - 0.05, z1 - th, 'trash'));
    // broom + mop + dustpan leaning on the right wall behind the bin
    B.add(GEO.cyl8, mVC, mat4(maxX - 0.08, 0.72, t.z + 0.5, 0.0, 0, -0.12, 0.022, 1.3, 0.022), 0xd9b56a);
    B.add(GEO.box, mVC, mat4(maxX - 0.15, 0.1, t.z + 0.5, 0, 0, -0.12, 0.08, 0.2, 0.22), 0xc9a24a);
    B.add(GEO.cyl8, mVC, mat4(maxX - 0.08, 0.72, t.z + 0.75, 0.08, 0, -0.1, 0.022, 1.3, 0.022), 0x6d8fa8);
    B.add(GEO.ico0, mVC, mat4(maxX - 0.15, 0.1, t.z + 0.75, 0, 0, 0, 0.2, 0.18, 0.2), 0xe8e0d0);
    B.boxMM(mVC, 0x48a868, maxX - 0.06, 0, t.z + 0.95, maxX - 0.02, 0.3, t.z + 1.2);
    colliders.push(colBox(maxX - 0.26, 0, t.z + 0.38, maxX, 1.36, t.z + 1.22, 'prop'));
  }

  // ------------------------------------------------------------------ desks + chairs + desk props
  const deskRng = ctx.makeRng ? ctx.makeRng('world/desks') : rngFor('desks');
  const variants = [];
  for (let i = 1; i < atlas.count; i++) variants.push(i);
  for (const s of SEATS) {
    const id = s.id, x = s.x, dz = s.deskZ, cz = s.chairZ;
    const hw = DESK.w / 2, hd = DESK.d / 2, top = DESK.topY, tt = DESK.top;
    const left = s.col % 2 === 0;            // left-hand desk of a pair
    const aisle = left ? -1 : 1;
    // desk top (atlas cell)
    const cell = s.id === PLAYER_SEAT ? 0 : variants[(s.row * 7 + s.col * 5 + deskRng.int(0, 14)) % variants.length];
    solid(mDesk, 0xffffff, x - hw, top - tt, dz - hd, x + hw, top, dz + hd, 'desk', id, atlasUV(atlas.top(cell), atlas.side(cell), !left && cell !== 0));
    // compartment (桌肚): shelf, front panel, sides — open toward the student
    const cy0 = top - tt - 0.13;
    const cc = { top: 0xb7c5cf, side: PAL.steel };
    solid(mVC, cc, x - hw + 0.015, cy0, dz - hd, x + hw - 0.015, cy0 + 0.012, dz + hd - 0.02, 'desk', id);
    solid(mVC, cc, x - hw + 0.015, cy0, dz - hd, x + hw - 0.015, top - tt, dz - hd + 0.012, 'desk', id);
    solid(mVC, cc, x - hw, cy0, dz - hd, x - hw + 0.015, top - tt, dz + hd - 0.02, 'desk', id);
    solid(mVC, cc, x + hw - 0.015, cy0, dz - hd, x + hw, top - tt, dz + hd - 0.02, 'desk', id);
    // legs
    const lg = 0.026;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = x + sx * (hw - 0.035), lz = dz + sz * (hd - 0.035);
      solid(mVC, PAL.steel, lx - lg / 2, 0.01, lz - lg / 2, lx + lg / 2, cy0, lz + lg / 2, 'desk', id);
      B.boxMM(mVC, PAL.rubber, lx - 0.017, 0, lz - 0.017, lx + 0.017, 0.012, lz + 0.017);
    }
    B.boxMM(mVC, PAL.steelDark, x - hw + 0.04, 0.13, dz - 0.012, x + hw - 0.04, 0.15, dz + 0.012);   // foot bar (visual)
    // chair
    const chw = CHAIR.w / 2, chd = CHAIR.d / 2, sy = CHAIR.seatY;
    solid(mVC, { top: PAL.chairWood, side: 0xc08a50 }, x - chw, sy - 0.03, cz - chd, x + chw, sy, cz + chd, 'chair', id);
    solid(mVC, { top: PAL.chairWood, side: 0xc08a50 }, x - chw + 0.02, CHAIR.backTopY - 0.22, cz + chd - 0.045, x + chw - 0.02, CHAIR.backTopY, cz + chd - 0.025, 'chair', id);
    for (const sx of [-1, 1]) {
      const px = x + sx * (chw - 0.03);
      solid(mVC, PAL.steel, px - 0.011, 0.01, cz + chd - 0.025, px + 0.011, CHAIR.backTopY - 0.02, cz + chd - 0.003, 'chair', id);   // rear leg + post
      solid(mVC, PAL.steel, px - 0.011, 0.01, cz - chd + 0.02, px + 0.011, sy - 0.03, cz - chd + 0.042, 'chair', id);               // front leg
      B.boxMM(mVC, PAL.rubber, px - 0.014, 0, cz + chd - 0.028, px + 0.014, 0.012, cz);
      B.boxMM(mVC, PAL.rubber, px - 0.014, 0, cz - chd + 0.017, px + 0.014, 0.012, cz - chd + 0.045);
    }
    B.boxMM(mVC, PAL.steelDark, x - chw + 0.03, 0.16, cz - chd + 0.03, x - chw + 0.042, 0.175, cz + chd - 0.03);
    B.boxMM(mVC, PAL.steelDark, x + chw - 0.042, 0.16, cz - chd + 0.03, x + chw - 0.03, 0.175, cz + chd - 0.03);

    // ---- desk props (fixed seed → identical colliders every boot)
    const r = deskRng;
    const isPlayer = id === PLAYER_SEAT;
    const side = r.chance(0.5) ? -1 : 1;           // which front corner gets the books
    const fz = dz - hd;                             // front edge (board side)
    if (isPlayer || r.chance(0.58)) {
      // flat stack of textbooks
      let y = top;
      const n = isPlayer ? 3 : r.int(2, 6);
      const bx = x + (isPlayer ? -1 : side) * (hw - 0.155), bz = fz + 0.115;
      for (let k = 0; k < n; k++) {
        const h = r.range(0.012, 0.026), ox = r.range(-0.01, 0.01), oz = r.range(-0.008, 0.008);
        B.boxMM(mVC, { top: r.pick(PAL.books), side: 0xf3eedf, bottom: 0xe0d8c4 }, bx - 0.13 + ox, y, bz - 0.09 + oz, bx + 0.13 + ox, y + h, bz + 0.09 + oz);
        y += h;
      }
      colliders.push(colBox(bx - 0.14, top, bz - 0.098, bx + 0.14, y, bz + 0.098, 'book', id));
    } else {
      // upright "book wall" along the front edge
      const width = r.range(0.18, 0.34), hMax = r.range(0.2, 0.26);
      const xa = side < 0 ? x - hw + 0.02 : x + hw - 0.02 - width;
      let bx = xa;
      while (bx < xa + width - 0.012) {
        const t = Math.min(r.range(0.014, 0.034), xa + width - bx), h = hMax - r.range(0, 0.02);
        B.boxMM(mVC, (nx, ny) => (ny > 0.5 ? 0xf3eedf : 0), bx, top, fz + 0.015, bx + t, top + h, fz + 0.185);
        const last = B.lists.get(mVC);
        recolor(last[last.length - 1], r.pick(PAL.books));
        bx += t;
      }
      B.boxMM(mVC, PAL.steelDark, xa + (side < 0 ? width : -0.006), top, fz + 0.03, xa + (side < 0 ? width + 0.006 : 0), top + 0.12, fz + 0.17); // book end
      colliders.push(colBox(xa - (side < 0 ? 0 : 0.006), top, fz + 0.015, xa + width + (side < 0 ? 0.006 : 0), top + hMax, fz + 0.185, 'book', id));
    }
    if (isPlayer || r.chance(0.6)) { // pencil case
      const px = x - (isPlayer ? -1 : side) * 0.16, pz = fz + 0.06;
      solid(mVC, { top: r.pick(PAL.props), side: r.pick(PAL.props) }, px - 0.1, top, pz - 0.032, px + 0.1, top + 0.045, pz + 0.032, 'prop', id);
    }
    if (!isPlayer && r.chance(0.4)) { // water bottle
      const bx = x - side * 0.245, bz = dz - 0.02;
      const c = r.pick([0x8fd0ff, 0xff9fb4, 0xa8e6a0, 0xfff0a0]);
      B.add(GEO.cyl12, mVC, mat4(bx, top + 0.085, bz, 0, 0, 0, 0.068, 0.17, 0.068), c);
      B.add(GEO.cyl12, mVC, mat4(bx, top + 0.185, bz, 0, 0, 0, 0.05, 0.03, 0.05), 0xffffff);
      colliders.push(colBox(bx - 0.034, top, bz - 0.034, bx + 0.034, top + 0.2, bz + 0.034, 'prop', id));
    }
    if (isPlayer || r.chance(0.3)) { // open book / notebook (thin)
      const ox = isPlayer ? x + 0.03 : x + r.range(-0.06, 0.06), oz = dz + 0.11;
      solid(mVC, { top: 0xfbf8ef, side: 0xe8e2d0 }, ox - 0.17, top, oz - 0.105, ox + 0.17, top + 0.008, oz + 0.105, 'book', id);
      B.boxMM(mVC, 0xd8d0bc, ox - 0.003, top + 0.008, oz - 0.105, ox + 0.003, top + 0.009, oz + 0.105);
      for (let k = 0; k < 6; k++) for (const sgn of [-1, 1]) B.boxMM(mVC, 0xb8c4d8, ox + sgn * 0.02 + (sgn < 0 ? -0.13 : 0), top + 0.0085, oz - 0.08 + k * 0.03, ox + sgn * 0.02 + (sgn < 0 ? 0 : 0.13), top + 0.009, oz - 0.077 + k * 0.03);
      if (isPlayer) B.add(GEO.cyl8, mVC, mat4(ox + 0.1, top + 0.014, oz + 0.02, 0, 0.6, Math.PI / 2, 0.01, 0.15, 0.01), 0x3d6fb6);
    }
    if (!isPlayer && r.chance(0.32)) { // school bag hanging on the aisle-side hook
      const bx = x + aisle * (hw + 0.075);
      const c = r.pick([0x4f6fb0, 0xe86a5c, 0x48a868, 0x404858, 0xf29bb8, 0xf2c14e]);
      B.add(GEO.box, mVC, mat4(bx, 0.44, dz, 0, 0, 0, 0.13, 0.32, 0.27), { top: c, side: c });
      B.add(GEO.box, mVC, mat4(bx + aisle * 0.07, 0.4, dz, 0, 0, 0, 0.03, 0.16, 0.2), new THREE.Color(c).multiplyScalar(0.8).getHex());
      B.boxMM(mVC, PAL.steelDark, x + aisle * hw, 0.6, dz - 0.01, x + aisle * (hw + 0.02), 0.62, dz + 0.01);
      colliders.push(colBox(bx - 0.065 - (aisle < 0 ? 0.03 : 0), 0.28, dz - 0.135, bx + 0.065 + (aisle > 0 ? 0.03 : 0), 0.6, dz + 0.135, 'prop', id));
    }
  }

  // ------------------------------------------------------------------ outside (3rd floor view)
  const outside = new THREE.Group();
  outside.name = 'outside';
  group.add(outside);
  const GROUND = -7.6;
  {
    const OB = new Batch();
    OB.boxMM(mVC, 0x8fbf6a, -220, GROUND - 0.5, -220, minX - WALL_T, GROUND, 220);
    OB.boxMM(mVC, { top: 0xc9c2b4, side: 0xb0a898 }, -14, GROUND, -60, -9, GROUND + 0.02, 60);                    // path
    OB.boxMM(mVC, { top: 0xc8583e, side: 0xa84a34 }, -36, GROUND, -40, -18, GROUND + 0.03, 40);                   // running track strip
    OB.boxMM(mVC, { top: 0x7fb35a, side: 0x6a9a4a }, -33, GROUND, -36, -21, GROUND + 0.04, 36);
    OB.boxMM(mVC, { top: 0xe8e4da, side: PAL.building }, minX - WALL_T - 0.3, GROUND, minZ - 4, minX - WALL_T, -0.02, maxZ + 4);  // own façade below
    OB.boxMM(mVC, 0xd8684e, minX - WALL_T - 0.36, -0.3, minZ - 4, minX - WALL_T, -0.02, maxZ + 4);
    // opposite building + side wing (façade texture on the room-facing side)
    const fx = -46;
    OB.boxMM(mVC, { top: 0xd8d2c4, side: 0xe6e0d2 }, fx - 12, GROUND, -40, fx, 12, 40);
    OB.add(GEO.plane, mFacade, mat4(fx + 0.02, (GROUND + 12) / 2, 0, 0, Math.PI / 2, 0, 80, 12 - GROUND, 1), 0xffffff, (g) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 80 / 7.2, uv.getY(i) * (12 - GROUND) / 7.2); });
    OB.boxMM(mVC, { top: 0xd8d2c4, side: 0xe9e2d4 }, -80, GROUND, 40, -30, 16, 52);
    OB.boxMM(mVC, 0xd8684e, -46.2, 11.4, -40, -46, 12, 40);
    // hills
    const hr = rngFor('hills');
    for (let i = 0; i < 9; i++) OB.add(GEO.cone8, mVC, mat4(-150 - hr.range(0, 30), GROUND + 6, -120 + i * 30 + hr.range(-8, 8), 0, hr.range(0, 3), 0, hr.range(40, 70), hr.range(18, 34), hr.range(40, 70)), (nx, ny) => (ny > 0.6 ? 0xb3cdd0 : PAL.hills));
    OB.build(outside, { castShadow: false, receiveShadow: false, name: 'outsideStatic' });
    // trees (cast shadows: dappled light through the windows)
    const tr = rngFor('trees');
    const parts = [];
    // canopies sit just below / around eye level so the window shows treetops, sky and the far building
    const spots = [[-12, -9.5], [-13.5, -4.5], [-12.5, 0.8], [-14, 5.5], [-12, 10], [-18, -7], [-19, 2.5], [-17, 12], [-21, -1], [-25, 7], [-26, -6], [-23, -13], [-28, 14], [-12, -14]];
    for (const [tx, tz] of spots) parts.push(...treeParts(tr, tx, -5.2, tz, tr.range(1.15, 1.45), [PAL.treeA, PAL.treeB, PAL.treeC], PAL.trunk, true));
    parts.push([GEO.cyl8, mat4(-30, -6.4, 0, 0, 0, 0, 1, 2.4, 1), PAL.trunk]); // keeps merge happy if spots change
    const trees = new THREE.Mesh(mergeColored(parts), mVC);
    trees.castShadow = !lowfx; trees.receiveShadow = false;
    trees.name = 'trees';
    outside.add(trees);
  }
  const sky = createSky(160);
  group.add(sky.mesh);
  const stars = createStars(150, lowfx ? 250 : 600);
  group.add(stars);
  const clouds = createClouds(outside, { count: lowfx ? 5 : 8 });
  const rain = createRain({ count: lowfx ? 700 : 1800 });
  rain.mesh.visible = false;
  group.add(rain.mesh);

  // ------------------------------------------------------------------ build batches
  B.build(group, { name: 'classroomSolid' });
  BN.build(group, { castShadow: false, name: 'classroomDecals' });
  BG.build(group, { castShadow: false, name: 'glass', renderOrder: 3 });

  // ------------------------------------------------------------------ animated fixtures
  const FB = new Batch();
  const fanSys = createFans(group, colliders, FB, mVC);
  FB.build(group, { name: 'fanStatic' });
  const curtains = createCurtains(group, WINDOWS, lowfx);
  colliders.push(...curtains.rodColliders);
  const clock = createClock(ctx, group, mVC);
  const blackboard = createBlackboard(ctx, group);

  // ------------------------------------------------------------------ lights
  const sun = new THREE.DirectionalLight(0xffdcaa, 2.7);
  sun.castShadow = !lowfx;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -9; c.right = 9; c.top = 9; c.bottom = -9; c.near = 1; c.far = 60;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
  }
  const sunTarget = new THREE.Object3D();
  sunTarget.position.set(-0.5, 0, -0.5);
  sun.target = sunTarget;
  group.add(sun, sunTarget);
  const hemi = new THREE.HemisphereLight(0xe3ecff, 0xcaa47c, 1.15);
  const amb = new THREE.AmbientLight(0xfff6e8, 0.2);
  group.add(hemi, amb);

  const shafts = createShafts(WINDOWS, minX);
  group.add(shafts.mesh);
  const dust = createDust(WINDOWS, minX, lowfx ? 90 : 320);
  group.add(dust.mesh);
  const patches = lowfx ? createSunPatches(WINDOWS, minX) : null;
  if (patches) group.add(patches.mesh);

  // ------------------------------------------------------------------ wind
  const wind = { strength: 0, dir: new THREE.Vector3(1, 0, 0) };
  let gusts = [];

  // ------------------------------------------------------------------ the classroom object (contract §4.1)
  let tAcc = 0;
  let mood = 'day';
  const classroom = {
    name: 'classroom', group, colliders,
    background: new THREE.Color(PAL.skyHorizon),
    fog: null,
    exposure: 1.0,
    dynamicColliders: fanSys.dynamicColliders,
    blackboard,
    clock,
    windows: windowsOut,
    fans: fanSys.fans,
    wind,
    /** Trigger a gust at the open window: fast attack, hold, smooth release. Resolves when it has died down. */
    gust(strength = 0.8, dur = 1.5) {
      const s = Math.max(0, Math.min(1, +strength || 0));
      const d = Math.max(0.2, +dur || 1.5);
      gusts.push({ s, d, t: 0 });
      return ctx.time.wait(d);
    },
    get mood() { return mood; },
    setMood(name) {
      const m = MOODS[name] || MOODS.day;
      mood = MOODS[name] ? name : 'day';
      const S = new THREE.Vector3(...m.sunDir).normalize();
      sun.position.copy(sunTarget.position).addScaledVector(S, 25);
      sun.color.set(m.sun); sun.intensity = m.sunI * (lowfx ? 0.75 : 1);
      hemi.color.set(m.hemiSky); hemi.groundColor.set(m.hemiGround); hemi.intensity = m.hemiI * (lowfx ? 1.12 : 1);
      amb.intensity = m.ambI;
      mTube.color.set(m.lights ? 0xfffaf0 : 0x8a8f96);
      mCeil.emissiveIntensity = m.ceil;
      sky.setColors({ ...m.sky, sunDir: S });
      stars.material.uniforms.opacity.value = m.stars;
      stars.visible = m.stars > 0;
      clouds.setTint(m.clouds[0], m.clouds[1]);
      mFacade.map = m.facadeNight ? facadeNight : facadeDay;
      mFacade.emissive.set(m.facadeNight ? 0xffffff : 0x000000);
      mFacade.emissiveMap = m.facadeNight ? facadeNight : null;
      mFacade.emissiveIntensity = m.facadeNight ? 0.6 : 0;
      mFacade.needsUpdate = true;
      rain.mesh.visible = m.rain;
      const L = S.clone().negate();
      shafts.rebuild(L); shafts.material.uniforms.color.value.set(m.shaft[0]); shafts.material.uniforms.opacity.value = m.shaft[1];
      shafts.mesh.visible = m.shaft[1] > 0;
      dust.rebuild(L); dust.material.uniforms.color.value.set(m.dust[0]); dust.material.uniforms.opacity.value = m.dust[1];
      dust.mesh.visible = m.dust[1] > 0;
      if (patches) { patches.rebuild(L); patches.material.color.set(m.patch[0]); patches.material.opacity = m.patch[1]; patches.mesh.visible = m.patch[1] > 0; }
      classroom.exposure = m.exposure;
      classroom.background.set(m.sky.horizon);
      if (ctx.stage?.current === 'classroom') { ctx.engine.renderer.toneMappingExposure = m.exposure; }
      if (mood === 'night') for (const f of fanSys.fans) f.spinning = false;
      else for (const f of fanSys.fans) f.spinning = true;
    },
    update(dt) {
      tAcc += dt;
      // wind envelope (max of active gusts)
      let w = 0;
      for (const g of gusts) {
        g.t += dt;
        const a = Math.min(1, g.t / 0.25), rel = Math.max(0, Math.min(1, (g.d - g.t) / (g.d * 0.45)));
        w = Math.max(w, g.s * a * a * (3 - 2 * a) * rel * rel * (3 - 2 * rel));
      }
      gusts = gusts.filter((g) => g.t < g.d);
      wind.strength = w;
      fanSys.update(dt);
      curtains.update(dt, w);
      clock.update(dt);
      blackboard.update(dt);
      clouds.update(dt);
      rain.update(tAcc);
      shafts.material.uniforms.time.value = tAcc;
      dust.material.uniforms.time.value = tAcc;
      stars.material.uniforms.time.value = tAcc;
    },
    /** extra: reset transient state (round:setup) */
    reset() {
      gusts = []; wind.strength = 0;
      classroom.setMood('day');
      blackboard.clear();
      clock.auto();
      fanSys.reset();
    },
    /** extra: repaint the back-wall newspaper theme (0..2) */
    setNewspaper(v) { news.repaint(v); },
  };
  classroom.setMood('day');
  return classroom;
}

/** Give one already-prepared geometry a uniform colour on every non-top face (book covers). */
function recolor(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.normal, col = geo.attributes.color;
  for (let i = 0; i < col.count; i++) if (n.getY(i) <= 0.5) col.setXYZ(i, c.r, c.g, c.b);
}
