// Ending sets (owner: env-artist). Built lazily by ctx.world.buildSet(name) and cached by index.js.
// Every set shares the world origin. Character anchors: {pos (on the floor), yaw}. Camera anchors (cam*):
// {pos, look, fov}. Anchor keys follow CONTRACTS.md §4.1 exactly; unknown keys return a safe default.
import * as THREE from 'three';
import { Batch, GEO, mat4, V, surface, worldUV, rectUV, mergeColored, rngFor, TAU } from './kit.js';
import { PAL } from './palette.js';
import { yawTo } from '../core/util.js';
import { createSky, createClouds, createRain, createPetals, treeParts } from './atmos.js';
import { facadeTexture, glassTexture, posterAtlas } from './textures.js';
import { tileTexture, skylineTexture, trackTexture, courtTexture, menuTexture, calligraphyTexture, paperTexture } from './setTextures.js';

export const SET_NAMES = ['rooftop', 'office', 'schoolyard', 'court', 'cherryPath', 'canteen'];

/** Wrap anchors so unknown keys never crash a cutscene (warn once, return a sane default). */
export function safeAnchors(name, anchors) {
  const warned = new Set();
  return new Proxy(anchors, {
    get(o, k) {
      if (k in o || typeof k === 'symbol' || k === 'then' || k === 'toJSON') return o[k];
      if (!warned.has(k)) { warned.add(k); console.warn(`[world] set "${name}" has no anchor "${String(k)}"`); }
      return String(k).startsWith('cam') ? { pos: V(0, 1.6, 4), look: V(0, 1, 0), fov: 50 } : { pos: V(0, 0, 0), yaw: 0 };
    },
  });
}

const A = (x, y, z, yaw = 0) => ({ pos: V(x, y, z), yaw });
const C = (px, py, pz, lx, ly, lz, fov = 50) => ({ pos: V(px, py, pz), look: V(lx, ly, lz), fov });
const face = (x, z, tx, tz) => yawTo({ x, z }, { x: tx, z: tz });

/** Common set scaffolding: group, sky, sun (+shadows unless lowfx), hemisphere + ambient fill. */
function scaffold(ctx, name, o) {
  const lowfx = !!ctx.config.lowfx;
  const group = new THREE.Group();
  group.name = name;
  const mVC = surface();
  const S = new THREE.Vector3(...o.sunDir).normalize();
  let sky = null;
  if (o.sky) { sky = createSky(170); sky.setColors({ ...o.sky, sunDir: S }); group.add(sky.mesh); }
  const sun = new THREE.DirectionalLight(o.sun ?? 0xffe0b0, (o.sunI ?? 2.4) * (lowfx ? 0.8 : 1));
  const target = new THREE.Object3D();
  target.position.set(...(o.focus || [0, 0, 0]));
  sun.target = target;
  sun.position.copy(target.position).addScaledVector(S, 30);
  sun.castShadow = !lowfx && o.shadows !== false;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera, e = o.shadowExtent ?? 12;
    c.left = -e; c.right = e; c.top = e; c.bottom = -e; c.near = 1; c.far = 80;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  }
  group.add(sun, target);
  group.add(new THREE.HemisphereLight(o.hemiSky ?? 0xe6eeff, o.hemiGround ?? 0xa08a70, (o.hemiI ?? 1.1) * (lowfx ? 1.1 : 1)));
  if (o.ambI) group.add(new THREE.AmbientLight(o.amb ?? 0xffffff, o.ambI));
  return { lowfx, group, mVC, B: new Batch(), S, sky, sun };
}

function finish(sc, { name, anchors, update, background, fog, exposure = 1 }) {
  sc.B.build(sc.group, { name: `${name}Solid` });
  return { name, group: sc.group, background: new THREE.Color(background ?? 0xcfe6f5), fog: fog ?? null, exposure, anchors: safeAnchors(name, anchors), update: update || (() => {}) };
}

/** Railing run along a straight line (posts + 2 rails). */
function railing(B, m, x0, z0, x1, z1, y0, h, color, step = 1.2) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / step));
  const ang = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i <= n; i++) { const t = i / n; B.add(GEO.cyl8, m, mat4(x0 + (x1 - x0) * t, y0 + h / 2, z0 + (z1 - z0) * t, 0, 0, 0, 0.05, h, 0.05), color); }
  for (const yy of [y0 + h, y0 + h * 0.55]) B.add(GEO.cyl8, m, mat4((x0 + x1) / 2, yy, (z0 + z1) / 2, Math.PI / 2, ang, 0, 0.045, len, 0.045, 'YXZ'), color);
  for (let i = 0; i < n * 4; i++) { const t = (i + 0.5) / (n * 4); B.add(GEO.box, m, mat4(x0 + (x1 - x0) * t, y0 + h * 0.55 + h * 0.225, z0 + (z1 - z0) * t, 0, ang, 0, 0.018, h * 0.45, 0.018), color); }
}

/** Simple building block with a façade texture on one face. face: '+z' | '+x' | '-x'. */
function building(B, mVC, mFac, x0, z0, x1, z1, y0, y1, faceDir = '+z', bodyColor = 0xe6e0d2, tile = 7.2) {
  B.boxMM(mVC, { top: 0xd2ccbe, side: bodyColor }, x0, y0, z0, x1, y1, z1);
  const h = y1 - y0;
  let m, w;
  if (faceDir === '+z') { w = x1 - x0; m = mat4((x0 + x1) / 2, (y0 + y1) / 2, z1 + 0.02, 0, 0, 0, w, h, 1); }
  else if (faceDir === '+x') { w = z1 - z0; m = mat4(x1 + 0.02, (y0 + y1) / 2, (z0 + z1) / 2, 0, Math.PI / 2, 0, w, h, 1); }
  else { w = z1 - z0; m = mat4(x0 - 0.02, (y0 + y1) / 2, (z0 + z1) / 2, 0, -Math.PI / 2, 0, w, h, 1); }
  B.add(GEO.plane, mFac, m, 0xffffff, (g) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile); });
}

function trees(group, m, spots, label, s = [1, 1.3], colors, trunk = PAL.trunk, blossom = false, cast = true) {
  const r = rngFor(label), parts = [];
  for (const [x, z, y = 0] of spots) parts.push(...treeParts(r, x, y, z, r.range(s[0], s[1]), colors || [PAL.treeA, PAL.treeB, PAL.treeC], trunk, blossom));
  const mesh = new THREE.Mesh(mergeColored(parts), m);
  mesh.castShadow = cast; mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// =============================================================================================
const BUILDERS = {
  // ------------------------------------------------------------------------------------------
  rooftop(ctx) {
    const sc = scaffold(ctx, 'rooftop', {
      sunDir: [-0.28, 0.17, -1], sun: 0xff9a55, sunI: 2.6, hemiSky: 0xffb890, hemiGround: 0x6a4a60, hemiI: 1.2, amb: 0xffd0c0, ambI: 0.2,
      sky: { top: 0x39408a, horizon: 0xffa064, bottom: 0x5a3a50, sun: 0xffd590, band: 0x5a2008, sunSize: 5, glow: 1.3 }, focus: [0, 0, 0], shadowExtent: 11,
    });
    const { B, mVC, group } = sc;
    const mTile = surface({ map: tileTexture('#b9b0a6', '#c4bbb0', '#857d74', 4, 'roof') });
    B.boxMM(mTile, 0xffffff, -9, -0.3, -3.3, 9, 0, 9, worldUV(0.5));
    // parapet + railing
    const conc = { top: 0xd8d0c4, side: 0xc8beb2 };
    B.boxMM(mVC, conc, -9.3, -0.3, -3.6, 9.3, 0.55, -3.3);
    B.boxMM(mVC, conc, -9.3, -0.3, -3.3, -9, 0.55, 9);
    B.boxMM(mVC, conc, 9, -0.3, -3.3, 9.3, 0.55, 9);
    railing(B, mVC, -9.15, -3.45, 9.15, -3.45, 0.55, 0.7, 0x5f8a72);
    railing(B, mVC, -9.15, -3.45, -9.15, 9, 0.55, 0.7, 0x5f8a72);
    railing(B, mVC, 9.15, -3.45, 9.15, 9, 0.55, 0.7, 0x5f8a72);
    // stair housing with the door
    B.boxMM(mVC, { top: 0xd0c8bc, side: 0xeee6d6 }, 3.6, 0, 2.8, 7.6, 3.0, 7.6);
    B.boxMM(mVC, 0xb8b0a4, 3.4, 3.0, 2.6, 7.8, 3.15, 7.8);
    B.boxMM(mVC, 0x6f8f86, 3.55, 0, 4.55, 3.6, 2.1, 5.55);
    B.boxMM(mVC, 0xe8e2d4, 3.52, 2.1, 4.45, 3.6, 2.2, 5.65);
    B.boxMM(mVC, 0xe8e2d4, 3.52, 0, 4.45, 3.6, 2.1, 4.55); B.boxMM(mVC, 0xe8e2d4, 3.52, 0, 5.55, 3.6, 2.1, 5.65);
    B.add(GEO.cyl8, mVC, mat4(3.5, 1.0, 5.4, 0, 0, Math.PI / 2, 0.03, 0.08, 0.03), 0xd8d8d8);
    B.boxMM(mVC, 0xffe7a0, 3.45, 2.35, 4.9, 3.55, 2.45, 5.2);
    // water tank, AC units, pipes, a lonely chair
    B.add(GEO.cyl24, mVC, mat4(-5.6, 2.0, 5.6, 0, 0, 0, 2.2, 1.7, 2.2), { top: 0xd8dde2, side: 0xc4ccd2 });
    for (const [x, z] of [[-6.4, 4.8], [-4.8, 4.8], [-6.4, 6.4], [-4.8, 6.4]]) B.boxMM(mVC, 0x8a949c, x - 0.06, 0, z - 0.06, x + 0.06, 1.15, z + 0.06);
    B.boxMM(mVC, 0x8a949c, -6.6, 1.1, 4.6, -4.6, 1.16, 6.6);
    for (let i = 0; i < 3; i++) { B.boxMM(mVC, { top: 0xe4e6e6, side: 0xd6d8d8 }, -8.6, 0, -1.6 + i * 1.3, -7.9, 0.62, -0.7 + i * 1.3); B.add(GEO.cyl16, mVC, mat4(-7.88, 0.31, -1.15 + i * 1.3, 0, 0, Math.PI / 2, 0.42, 0.02, 0.42), 0x6a7278); }
    B.add(GEO.cyl8, mVC, mat4(-3, 0.1, 8.6, Math.PI / 2, Math.PI / 2, 0, 0.12, 12, 0.12), 0x9aa2a8);
    // far below: campus ground + trees; city skyline billboards beyond the railing
    B.boxMM(mVC, 0x4f6a52, -200, -18.5, -200, 200, -18, 200);
    trees(group, mVC, [[-14, -14], [-6, -18], [4, -15], [12, -20], [-20, -25], [18, -12], [0, -28]].map(([x, z]) => [x, z, -18]), 'roof-trees', [1.8, 2.3], [0x4a6a40, 0x3e5a38, 0x5a7a48], 0x4a3628, false, false);
    const sky1 = new THREE.MeshBasicMaterial({ map: skylineTexture('#4a3d6e', '#ffcf8a', 'sky-far', 0.8), transparent: true, depthWrite: false, fog: false });
    const sky2 = new THREE.MeshBasicMaterial({ map: skylineTexture('#2f2848', '#ffd27a', 'sky-near', 1), transparent: true, depthWrite: false, fog: false });
    const far = new THREE.Mesh(new THREE.PlaneGeometry(340, 50), sky1); far.position.set(0, 6, -150); far.renderOrder = -5;
    const near = new THREE.Mesh(new THREE.PlaneGeometry(260, 40), sky2); near.position.set(10, 1, -100); near.renderOrder = -4;
    group.add(far, near);
    const clouds = createClouds(group, { count: sc.lowfx ? 5 : 8, center: V(0, 34, -110), spread: V(90, 8, 30), scale: 1.4, label: 'roof-clouds' });
    clouds.setTint(0xffb6a0, 0.45);
    return finish(sc, {
      name: 'rooftop', background: 0xffa064, exposure: 1.05, fog: new THREE.Fog(0xff9e70, 80, 320),
      anchors: {
        left: A(-0.6, 0, -1.6, -Math.PI / 2), right: A(0.6, 0, -1.6, Math.PI / 2),
        door: A(3.25, 0, 5.05, face(3.25, 5.05, 0, -1.6)), railing: A(0, 0, -2.9, 0),
        camWide: C(0.4, 1.45, 3.6, 0, 1.35, -3, 45), camSunset: C(-1.8, 0.9, 0.9, 0.3, 1.9, -8, 50),
      },
      update(dt) { clouds.update(dt); },
    });
  },

  // ------------------------------------------------------------------------------------------
  office(ctx) {
    const sc = scaffold(ctx, 'office', {
      sunDir: [0.25, 0.6, -1], sun: 0xc8d4e2, sunI: 0.8, hemiSky: 0xdfe6f0, hemiGround: 0x8a8478, hemiI: 1.25, amb: 0xf0f4ff, ambI: 0.42,
      sky: { top: 0x7c8896, horizon: 0xaeb6c0, bottom: 0x6a7068, sun: 0x000000, band: 0x000000, sunSize: 0, glow: 0 }, focus: [0, 0, -1], shadowExtent: 7,
    });
    const { B, mVC, group } = sc;
    const W = 4.2, Z0 = -3.6, Z1 = 3.4, H = 3.0, wy0 = 0.95, wy1 = 2.45, wx = 1.6;
    const mFloor = surface({ map: tileTexture('#d8d4cc', '#cfcac0', '#a8a298', 4, 'office-floor') });
    B.boxMM(mFloor, 0xffffff, -W, -0.1, Z0, W, 0, Z1, worldUV(0.6));
    B.boxMM(mVC, 0xf4f1ea, -W - 0.1, H, Z0 - 0.1, W + 0.1, H + 0.1, Z1 + 0.1);
    const wall = (x0, y0, z0, x1, y1, z1) => { if (y0 < 1 && y1 > 1) { B.boxMM(mVC, 0x9cb8c4, x0, y0, z0, x1, 1, z1); B.boxMM(mVC, 0xf1ece0, x0, 1, z0, x1, y1, z1); } else B.boxMM(mVC, y1 <= 1 ? 0x9cb8c4 : 0xf1ece0, x0, y0, z0, x1, y1, z1); };
    wall(-W - 0.12, 0, Z0 - 0.12, -wx, H, Z0); wall(wx, 0, Z0 - 0.12, W + 0.12, H, Z0);
    wall(-wx, 0, Z0 - 0.12, wx, wy0, Z0); wall(-wx, wy1, Z0 - 0.12, wx, H, Z0);
    wall(-W - 0.12, 0, Z0, -W, H, Z1); wall(W, 0, Z0, W + 0.12, H, Z1); wall(-W - 0.12, 0, Z1, W + 0.12, H, Z1 + 0.12);
    // window frame + glass + blinds
    for (const [a, b, c, d] of [[-wx, wy0, wx, wy0 + 0.05], [-wx, wy1 - 0.05, wx, wy1], [-wx, wy0, -wx + 0.05, wy1], [wx - 0.05, wy0, wx, wy1], [-0.025, wy0, 0.025, wy1]]) B.boxMM(mVC, 0xf3f1ea, a, b, Z0 - 0.1, c, d, Z0);
    B.boxMM(mVC, 0xe8e4da, -wx - 0.05, wy0 - 0.03, Z0, wx + 0.05, wy0, Z0 + 0.12);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(wx * 2, wy1 - wy0), new THREE.MeshBasicMaterial({ map: glassTexture(), color: 0xc8d8e8, transparent: true, opacity: 0.22, depthWrite: false }));
    glass.position.set(0, (wy0 + wy1) / 2, Z0 - 0.06); glass.renderOrder = 3; group.add(glass);
    for (let i = 0; i < 9; i++) B.boxMM(mVC, 0xe8e2d2, -wx + 0.04, wy1 - 0.08 - i * 0.035, Z0 + 0.04, wx - 0.04, wy1 - 0.07 - i * 0.035, Z0 + 0.07);
    // outside: rain, a grey building opposite
    const mFac = surface({ map: facadeTexture(false) });
    building(B, mVC, mFac, -30, -32, 30, -22, -12, 12, '+z', 0xc8c4bc);
    B.boxMM(mVC, 0x5a6a5a, -60, -12.5, -60, 60, -12, -3.8);
    const rain = createRain({ min: V(-12, -10, -20), max: V(12, 10, -3.9), count: sc.lowfx ? 900 : 2000, label: 'office-rain' });
    group.add(rain.mesh);
    // main desk + teacher chair
    const dx = 0, dz = -1.2, dw = 1.5, dd = 0.75, top = 0.76;
    B.boxMM(mVC, { top: 0xb88a5c, side: 0x9a6e46 }, dx - dw / 2, top - 0.04, dz - dd / 2, dx + dw / 2, top, dz + dd / 2);
    B.boxMM(mVC, 0x8a6040, dx - dw / 2 + 0.02, 0, dz - dd / 2 + 0.05, dx - dw / 2 + 0.45, top - 0.04, dz + dd / 2 - 0.02);
    B.boxMM(mVC, 0x8a6040, dx + dw / 2 - 0.45, 0, dz - dd / 2 + 0.05, dx + dw / 2 - 0.02, top - 0.04, dz + dd / 2 - 0.02);
    B.boxMM(mVC, 0x8a6040, dx - dw / 2 + 0.45, 0.3, dz + dd / 2 - 0.06, dx + dw / 2 - 0.45, top - 0.04, dz + dd / 2 - 0.03);
    const cz = -1.85;
    B.boxMM(mVC, { top: 0x2f3a48, side: 0x26303c }, -0.25, 0.4, cz - 0.24, 0.25, 0.46, cz + 0.24);
    B.boxMM(mVC, 0x2f3a48, -0.24, 0.48, cz - 0.3, 0.24, 1.15, cz - 0.24);
    B.add(GEO.cyl8, mVC, mat4(0, 0.22, cz, 0, 0, 0, 0.06, 0.36, 0.06), 0x5a6068);
    for (let k = 0; k < 5; k++) { const a = k * TAU / 5; B.boxMM(mVC, 0x3a3e44, Math.cos(a) * 0.2 - 0.03, 0.02, cz + Math.sin(a) * 0.2 - 0.03, Math.cos(a) * 0.2 + 0.03, 0.06, cz + Math.sin(a) * 0.2 + 0.03); }
    // desk props: monitor (facing the teacher), paper piles, mug, red pen, name plate
    B.boxMM(mVC, 0x2a2e34, -0.32, top + 0.12, dz - 0.12, 0.32, top + 0.5, dz - 0.09);
    B.boxMM(mVC, 0x3a4048, -0.05, top, dz - 0.1, 0.05, top + 0.12, dz - 0.05);
    const r = rngFor('office');
    for (const [px, pz, n] of [[-0.55, dz - 0.15, 14], [-0.55, dz + 0.15, 9], [0.52, dz - 0.1, 18], [0.55, dz + 0.2, 6]]) {
      let y = top;
      for (let k = 0; k < n; k++) { const h = r.range(0.008, 0.016); B.boxMM(mVC, { top: k % 5 === 4 ? 0xf2d8a0 : 0xfbf8f0, side: 0xe8e2d4 }, px - 0.14 + r.range(-0.01, 0.01), y, pz - 0.105, px + 0.14 + r.range(-0.01, 0.01), y + h, pz + 0.105); y += h; }
    }
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), surface({ map: paperTexture(), vertexColors: false }));
    paper.rotation.set(-Math.PI / 2, 0, 0.15); paper.position.set(0.08, top + 0.002, dz + 0.22); group.add(paper);
    B.add(GEO.cyl12, mVC, mat4(0.32, top + 0.055, dz + 0.12, 0, 0, 0, 0.08, 0.11, 0.08), 0xffffff);
    B.add(GEO.cyl8, mVC, mat4(-0.2, top + 0.006, dz + 0.25, 0, 0.4, Math.PI / 2, 0.012, 0.14, 0.012), 0xd62f2f);
    B.boxMM(mVC, { top: 0x8a6040, side: 0xc8322d }, -0.12, top, dz + dd / 2 - 0.08, 0.12, top + 0.06, dz + dd / 2 - 0.05);
    // other desks with exercise-book towers, filing cabinets, bookshelf, plant, water dispenser
    for (const [ox, oz] of [[-2.9, -1.6], [2.9, -1.6], [-2.9, 1.2], [2.9, 1.2]]) {
      B.boxMM(mVC, { top: 0xb88a5c, side: 0x9a6e46 }, ox - 0.65, 0.72, oz - 0.35, ox + 0.65, 0.76, oz + 0.35);
      B.boxMM(mVC, 0x8a6040, ox - 0.62, 0, oz - 0.3, ox - 0.25, 0.72, oz + 0.3); B.boxMM(mVC, 0x8a6040, ox + 0.25, 0, oz - 0.3, ox + 0.62, 0.72, oz + 0.3);
      for (let t = 0; t < 3; t++) { const h = r.range(0.15, 0.42); B.boxMM(mVC, { top: r.pick([0x8fb8e8, 0xf2c14e, 0x9be29b]), side: 0xf3eedf }, ox - 0.5 + t * 0.32, 0.76, oz - 0.12, ox - 0.26 + t * 0.32, 0.76 + h, oz + 0.12); }
      B.boxMM(mVC, 0x2a2e34, ox - 0.2, 0.88, oz - 0.3, ox + 0.2, 1.15, oz - 0.27);
    }
    for (let i = 0; i < 3; i++) { B.boxMM(mVC, { top: 0xc8ccd0, side: 0xb4bcc4 }, W - 0.5, 0, 2.6 - i * 0.55 - 0.25, W, 1.3, 2.6 - i * 0.55 + 0.25); for (let k = 0; k < 4; k++) B.boxMM(mVC, 0x8a949c, W - 0.51, 0.25 + k * 0.3, 2.6 - i * 0.55 - 0.06, W - 0.5, 0.28 + k * 0.3, 2.6 - i * 0.55 + 0.06); }
    const shelf = { top: 0x9a6e46, side: 0x8a6040 };
    B.boxMM(mVC, shelf, -W, 0, 0.2, -W + 0.03, 2.1, 2.4);
    B.boxMM(mVC, shelf, -W, 0, 0.2, -W + 0.4, 2.1, 0.24); B.boxMM(mVC, shelf, -W, 0, 2.36, -W + 0.4, 2.1, 2.4);
    for (let s = 0; s <= 5; s++) B.boxMM(mVC, shelf, -W, s * 0.42, 0.2, -W + 0.4, s * 0.42 + 0.03, 2.4);
    for (let s = 0; s < 5; s++) for (let k = 0; k < 14; k++) { if (r.chance(0.15)) continue; const h = r.range(0.24, 0.36); B.boxMM(mVC, r.pick(PAL.books), -W + 0.05, 0.03 + s * 0.42, 0.27 + k * 0.148, -W + 0.32, 0.03 + s * 0.42 + h, 0.27 + k * 0.148 + 0.12); }
    B.add(GEO.cyl12, mVC, mat4(-2.0, 0.2, -3.2, 0, 0, 0, 0.36, 0.4, 0.36), PAL.plantPot);
    for (let k = 0; k < 7; k++) B.add(GEO.ico0, mVC, mat4(-2.0 + r.range(-0.25, 0.25), 0.6 + r.range(0, 0.7), -3.2 + r.range(-0.2, 0.2), r.range(0, 3), r.range(0, 3), 0, 0.3, 0.42, 0.24), k % 2 ? PAL.leaf : PAL.leafDark);
    B.boxMM(mVC, 0xf0f2f2, 2.6, 0, -3.5, 2.95, 0.95, -3.15);
    B.add(GEO.cyl16, mVC, mat4(2.775, 1.17, -3.325, 0, 0, 0, 0.26, 0.42, 0.26), 0x8fd0ff);
    // wall: calligraphy, clock, notice board
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), surface({ map: calligraphyTexture('为人师表'), vertexColors: false }));
    cal.position.set(0, 2.15, Z1 - 0.01); cal.rotation.y = Math.PI; group.add(cal);
    const pa = posterAtlas();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.75), surface({ map: pa.texture, vertexColors: false }));
    board.geometry.attributes.uv.array.forEach((v, i, arr) => { const rr = pa.rects.schedule; arr[i] = i % 2 ? rr[1] + (rr[3] - rr[1]) * v : rr[0] + (rr[2] - rr[0]) * v; });
    board.position.set(-W + 0.01, 1.7, -1.6); board.rotation.y = Math.PI / 2; group.add(board);
    B.add(GEO.cyl24, mVC, mat4(2.6, 2.4, Z1 - 0.03, Math.PI / 2, 0, 0, 0.34, 0.04, 0.34), { top: 0xffffff, side: 0x3a3a40 });
    B.boxMM(mVC, 0x222222, 2.595, 2.4, Z1 - 0.06, 2.605, 2.53, Z1 - 0.05);
    B.boxMM(mVC, 0x222222, 2.6, 2.395, Z1 - 0.06, 2.7, 2.405, Z1 - 0.05);
    // fluorescent lights
    const tubes = [];
    for (const lx of [-2, 0, 2]) for (const lz of [-1.5, 1.2]) { B.boxMM(mVC, 0xe8e8e2, lx - 0.1, H - 0.07, lz - 0.62, lx + 0.1, H, lz + 0.62); tubes.push([GEO.cyl8, mat4(lx, H - 0.085, lz, Math.PI / 2, 0, 0, 0.035, 1.18, 0.035), 0xffffff]); }
    group.add(new THREE.Mesh(mergeColored(tubes), new THREE.MeshBasicMaterial({ color: 0xf4f8ff, vertexColors: true })));
    let t = 0;
    return finish(sc, {
      name: 'office', background: 0xaeb6c0, exposure: 1.0,
      anchors: {
        teacherChair: A(0, 0, cz, Math.PI), student: A(0, 0, -0.3, 0),
        parent1: A(-0.8, 0, 0.35, face(-0.8, 0.35, 0, -1.2)), parent2: A(0.8, 0, 0.35, face(0.8, 0.35, 0, -1.2)),
        desk: A(dx, top, dz, 0),
        camWide: C(3.0, 2.25, 2.7, -0.1, 1.0, -1.0, 50), camOverShoulder: C(0.5, 1.45, -2.5, -0.05, 1.25, 0.1, 42),
      },
      update(dt) { t += dt; rain.update(t); },
    });
  },

  // ------------------------------------------------------------------------------------------
  schoolyard(ctx) {
    const sc = scaffold(ctx, 'schoolyard', {
      sunDir: [-0.7, 0.62, 0.55], sun: 0xffdcaa, sunI: 2.6, hemiSky: 0xdde9ff, hemiGround: 0xa89070, hemiI: 1.1, ambI: 0.12,
      sky: { top: 0x5fa8ec, horizon: 0xdcefff, bottom: 0xb8c8bc, sun: 0xfff1cf, band: 0x101008, sunSize: 1, glow: 0.45 }, focus: [0, 0, -3], shadowExtent: 16,
    });
    const { B, mVC, group } = sc;
    const mPlaza = surface({ map: tileTexture('#d6cfc2', '#cfc8ba', '#aaa294', 4, 'plaza') });
    B.boxMM(mVC, 0x8fbf6a, -150, -0.3, -150, 150, -0.02, 150);
    B.boxMM(mPlaza, 0xffffff, -16, -0.02, -12, 16, 0.0, 6, worldUV(0.5));
    const mTrack = surface({ map: trackTexture() });
    B.add(GEO.plane, mTrack, mat4(0, 0.005, 33, -Math.PI / 2, 0, 0, 100, 50, 1), 0xffffff);
    B.boxMM(mVC, 0xe8e4da, -16, 0, 5.9, 16, 0.12, 6.1);
    // the teaching building (the open window on the 3rd floor is right above the landing spot)
    const mFac = surface({ map: facadeTexture(false) });
    building(B, mVC, mFac, -32, -26, 32, -12, 0, 18, '+z');
    B.boxMM(mVC, 0xd8684e, -32, 18, -26, 32, 18.6, -11.8);
    B.boxMM(mVC, { top: 0xd8d2c4, side: 0xe9e2d4 }, -3, 0, -12, 3, 3.4, -10.6);
    B.boxMM(mVC, 0x4a5a6a, -1.2, 0, -10.62, 1.2, 2.5, -10.58);
    const win = { x: 0.4, y: 2 * 3.6 + 1.0 };
    B.boxMM(mVC, 0x3a4250, win.x - 0.9, win.y, -11.99, win.x + 0.9, win.y + 1.5, -11.97);
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.4, 4, 8), surface({ color: PAL.curtain, vertexColors: false, side: THREE.DoubleSide }));
    curtain.position.set(win.x + 0.5, win.y + 0.75, -11.9);
    group.add(curtain);
    const cBase = curtain.geometry.attributes.position.array.slice();
    // banner on the façade
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.1), new THREE.MeshToonMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 112; const g = c.getContext('2d'); g.fillStyle = '#c8322d'; g.fillRect(0, 0, 1024, 112); g.fillStyle = '#ffe07a'; g.font = 'bold 76px "AR PL KaitiM GB", KaiTi, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('育 才 中 学 · 团 结 奋 进', 512, 58); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() }));
    ban.position.set(0, 4.3, -11.97); group.add(ban);
    // flagpole with a waving flag
    const FX = -9, FZ = -5.5;
    B.boxMM(mVC, { top: 0xe8e2d4, side: 0xc8c0b0 }, FX - 1.2, 0, FZ - 1.2, FX + 1.2, 0.3, FZ + 1.2);
    B.boxMM(mVC, { top: 0xe8e2d4, side: 0xc8c0b0 }, FX - 0.6, 0.3, FZ - 0.6, FX + 0.6, 0.55, FZ + 0.6);
    B.add(GEO.cyl8, mVC, mat4(FX, 5.5, FZ, 0, 0, 0, 0.12, 10, 0.12), 0xe0e4e8);
    B.add(GEO.sphere, mVC, mat4(FX, 10.55, FZ, 0, 0, 0, 0.2, 0.2, 0.2), 0xf2c94c);
    const flagTex = (() => { const c = document.createElement('canvas'); c.width = 192; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#de2910'; g.fillRect(0, 0, 192, 128); const star = (x, y, R, rot) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = rot - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.38 : R; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fillStyle = '#ffde00'; g.fill(); }; star(32, 32, 19, 0); star(64, 13, 6, 0.6); star(77, 26, 6, 0.9); star(77, 45, 6, 0); star(64, 58, 6, 0.4); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2, 12, 4), new THREE.MeshToonMaterial({ map: flagTex, side: THREE.DoubleSide }));
    flag.position.set(FX + 0.95, 9.7, FZ);
    flag.castShadow = true;
    group.add(flag);
    const fBase = flag.geometry.attributes.position.array.slice();
    // PA loudspeaker pole
    const SPX = 5.5, SPZ = -6.5;
    B.add(GEO.cyl8, mVC, mat4(SPX, 2.5, SPZ, 0, 0, 0, 0.14, 5, 0.14), 0x8a949c);
    B.boxMM(mVC, 0x6a747c, SPX - 0.2, 4.3, SPZ - 0.2, SPX + 0.2, 4.5, SPZ + 0.2);
    for (const [ry, rx] of [[-0.5, 0.25], [0.7, 0.25]]) B.add(GEO.cone8, mVC, mat4(SPX + Math.sin(ry) * 0.3, 4.65, SPZ + Math.cos(ry) * 0.3, -Math.PI / 2 + rx, ry, 0, 0.5, 0.65, 0.5, 'YXZ'), { top: 0xd8dde2, side: 0xc4ccd2, bottom: 0x3a3e44 });
    B.boxMM(mVC, 0xd8dde2, SPX - 0.15, 4.95, SPZ - 0.15, SPX + 0.15, 5.05, SPZ + 0.15);
    // benches + trees + bike shed
    for (const bx of [-11, 9]) { B.boxMM(mVC, { top: 0xc28a58, side: 0xa8754a }, bx - 0.9, 0.42, -6.2, bx + 0.9, 0.46, -5.8); for (const lx of [-0.8, 0.8]) B.boxMM(mVC, 0x5a5a62, bx + lx - 0.03, 0, -6.15, bx + lx + 0.03, 0.42, -5.85); }
    trees(group, mVC, [[-14, -9], [-14, -4], [-14, 1], [14, -9], [14, -4], [14, 1], [-24, 10], [26, 12], [-30, -2], [30, -4]], 'yard-trees', [1.2, 1.5]);
    B.boxMM(mVC, 0x6a9a8a, 18, 0, -10, 26, 0.06, -6); B.boxMM(mVC, 0x6aa0c8, 18, 2.4, -10, 26, 2.5, -6);
    for (const x of [18, 26]) for (const z of [-10, -6]) B.boxMM(mVC, 0x8a949c, x - 0.05, 0, z - 0.05, x + 0.05, 2.4, z + 0.05);
    // football goals on the field
    for (const gz of [33]) for (const gx of [-23, 23]) { B.boxMM(mVC, 0xffffff, gx - 0.05, 0, gz - 3.6, gx + 0.05, 2.4, gz - 3.5); B.boxMM(mVC, 0xffffff, gx - 0.05, 0, gz + 3.5, gx + 0.05, 2.4, gz + 3.6); B.boxMM(mVC, 0xffffff, gx - 0.05, 2.3, gz - 3.6, gx + 0.05, 2.4, gz + 3.6); }
    const clouds = createClouds(group, { count: sc.lowfx ? 4 : 7, center: V(0, 40, -40), spread: V(80, 8, 60), scale: 1.4, label: 'yard-clouds' });
    let t = 0;
    return finish(sc, {
      name: 'schoolyard', background: 0xdcefff, exposure: 1.0, fog: new THREE.Fog(0xdcefff, 90, 300),
      anchors: {
        landing: A(0.4, 0, -4.2, 0), principal: A(1.6, 0, -2.9, face(1.6, -2.9, 0.4, -4.2)),
        speaker: { pos: V(SPX, 4.65, SPZ), yaw: face(SPX, SPZ, 0.4, -4.2), look: V(SPX, 4.65, SPZ) },
        flagpole: A(FX, 0, FZ, 0),
        window: { pos: V(win.x, win.y + 0.7, -11.9), yaw: Math.PI },
        camWide: C(2.5, 2.2, 15, -1.2, 5.2, -9, 55), camHigh: C(0.4, 9.2, -11.2, 0.5, 0, -3.8, 55),
      },
      update(dt) {
        t += dt; clouds.update(dt);
        const fp = flag.geometry.attributes.position;
        for (let i = 0; i < fp.count; i++) { const x = fBase[i * 3] + 0.9; fp.setZ(i, Math.sin(x * 3.2 - t * 5) * 0.12 * x); }
        fp.needsUpdate = true; flag.geometry.computeVertexNormals();
        const cp = curtain.geometry.attributes.position;
        for (let i = 0; i < cp.count; i++) { const v = (0.7 - cBase[i * 3 + 1]) / 1.4; cp.setZ(i, cBase[i * 3 + 2] + v * v * (0.5 + 0.15 * Math.sin(t * 4 + cBase[i * 3] * 5))); }
        cp.needsUpdate = true;
      },
    });
  },

  // ------------------------------------------------------------------------------------------
  court(ctx) {
    const sc = scaffold(ctx, 'court', {
      sunDir: [-0.8, 0.55, 0.5], sun: 0xffd29a, sunI: 2.7, hemiSky: 0xdde9ff, hemiGround: 0xa08060, hemiI: 1.05, ambI: 0.12,
      sky: { top: 0x58a0e8, horizon: 0xe8f0f0, bottom: 0xb8c8bc, sun: 0xffe6b0, band: 0x201008, sunSize: 1.5, glow: 0.6 }, focus: [-2, 0, -1], shadowExtent: 13,
    });
    const { B, mVC, group } = sc;
    B.boxMM(mVC, 0x8fbf6a, -150, -0.3, -150, 150, -0.03, 150);
    B.boxMM(mVC, 0x3f8a6a, -10, -0.03, -9, 10, -0.01, 10);
    const mCourt = surface({ map: courtTexture() });
    B.add(GEO.plane, mCourt, mat4(0, 0.0, 0, -Math.PI / 2, 0, 0, 15.6, 15.6, 1), 0xffffff);
    // hoop: rim centre at z = -7.8 + 0.8 + 1.575 ≈ court texture hoop mark
    const cScale = (15.6 * (1 - 80 / 1024)) / 15, rimZ = -7.8 + 15.6 * 40 / 1024 + 1.575 * cScale, rimY = 3.05;
    const bbZ = rimZ - 0.38;
    B.add(GEO.cyl12, mVC, mat4(0, 1.9, bbZ - 1.3, 0, 0, 0, 0.22, 3.8, 0.22), 0x2f5a8a);
    B.boxMM(mVC, 0x2f5a8a, -0.08, 3.4, bbZ - 1.3, 0.08, 3.55, bbZ - 0.02);
    B.boxMM(mVC, 0x2f5a8a, -1.0, -0.03, bbZ - 1.9, 1.0, 0.25, bbZ - 0.8);
    B.boxMM(mVC, { top: 0xffffff, side: 0xf4f4f4 }, -0.9, 2.9, bbZ - 0.04, 0.9, 3.95, bbZ);
    for (const [a, b, c, d] of [[-0.3, 3.0, 0.3, 3.04], [-0.3, 3.4, 0.3, 3.44], [-0.3, 3.0, -0.26, 3.44], [0.26, 3.0, 0.3, 3.44]]) B.boxMM(mVC, 0xd8463c, a, b, bbZ + 0.001, c, d, bbZ + 0.004);
    B.add(new THREE.TorusGeometry(0.23, 0.012, 6, 24), mVC, mat4(0, rimY, rimZ, Math.PI / 2, 0, 0), 0xe8642c);
    B.boxMM(mVC, 0xe8642c, -0.06, rimY - 0.06, bbZ, 0.06, rimY, rimZ - 0.2);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.15, 0.42, 12, 3, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.85 }));
    net.position.set(0, rimY - 0.21, rimZ); group.add(net);
    // bleachers along the left side (3 tiers, rise 0.44, depth 0.8)
    const bx0 = -8.6, tierD = 0.8, rise = 0.44, zA = -6, zB = 6;
    for (let i = 0; i < 3; i++) {
      B.boxMM(mVC, { top: 0xdad6cc, side: 0xb8b2a6 }, bx0 - tierD * (i + 1), 0, zA, bx0 - tierD * i, rise * (i + 1), zB);
      for (let k = 0; k < 12; k++) B.boxMM(mVC, (k + i) % 2 ? 0x4d9ed2 : 0xf2f2f2, bx0 - tierD * i - 0.42, rise * (i + 1), zA + 0.2 + k * 0.98, bx0 - tierD * i - 0.05, rise * (i + 1) + 0.05, zA + 0.9 + k * 0.98);
    }
    railing(B, mVC, bx0 - tierD * 3 - 0.05, zA, bx0 - tierD * 3 - 0.05, zB, rise * 3, 0.9, 0x8a949c, 1.5);
    // fence posts + top rail around the court, trees and the school behind
    for (const [x0, z0, x1, z1] of [[-10, -9, 10, -9], [10, -9, 10, 10], [-10, 10, 10, 10]]) railing(B, mVC, x0, z0, x1, z1, 0, 3.2, 0x5f8a72, 2.5);
    trees(group, mVC, [[-14, -12], [-6, -14], [3, -15], [11, -13], [16, -4], [15, 6], [-16, 4], [-15, 13], [6, 15]], 'court-trees', [1.2, 1.5]);
    const mFac = surface({ map: facadeTexture(false) });
    building(B, mVC, mFac, -30, -42, 30, -30, 0, 14.4, '+z');
    // ball rack + water bottles
    B.boxMM(mVC, 0x8a949c, 8.2, 0, 3.5, 9.4, 0.7, 4.1);
    for (let k = 0; k < 4; k++) B.add(GEO.sphere, mVC, mat4(8.35 + k * 0.3, 0.82, 3.8, 0, k, 0, 0.24, 0.24, 0.24), (nx, ny) => (Math.abs(ny) < 0.08 || Math.abs(nx) < 0.08 ? 0x3a2418 : 0xe07b39));
    const clouds = createClouds(group, { count: sc.lowfx ? 4 : 7, center: V(0, 40, -50), spread: V(80, 8, 60), scale: 1.4, label: 'court-clouds' });
    const crowd = {};
    for (let i = 0; i < 6; i++) { const tier = i % 3, z = i < 3 ? -1.4 : 1.4; crowd[`crowd${i}`] = { pos: V(bx0 - tierD * tier - 0.4, rise * (tier + 1), z + (tier - 1) * 0.3), yaw: -Math.PI / 2, sitPos: V(bx0 - tierD * tier - 0.25, rise * tier, z) }; }
    const playerZ = rimZ + 6.75 * cScale + 0.15;
    return finish(sc, {
      name: 'court', background: 0xe8f0f0, exposure: 1.0, fog: new THREE.Fog(0xe8f0f0, 90, 300),
      anchors: {
        hoop: { pos: V(0, rimY, rimZ), yaw: 0 }, player: A(0, 0, playerZ, 0), coach: A(2.6, 0, playerZ + 0.9, face(2.6, playerZ + 0.9, 0, playerZ)),
        ...crowd,
        camWide: C(6.2, 3.0, playerZ + 5.5, -1.2, 1.8, rimZ + 2, 50),
      },
      update(dt) { clouds.update(dt); },
    });
  },

  // ------------------------------------------------------------------------------------------
  cherryPath(ctx) {
    const sc = scaffold(ctx, 'cherryPath', {
      sunDir: [-0.6, 0.7, 0.4], sun: 0xffe6c8, sunI: 2.4, hemiSky: 0xffe8f0, hemiGround: 0xa89078, hemiI: 1.2, ambI: 0.15, amb: 0xffe8f0,
      sky: { top: 0x7ab8ee, horizon: 0xfbe8ee, bottom: 0xc8d0c0, sun: 0xfff1df, band: 0x100808, sunSize: 1, glow: 0.5 }, focus: [0, 0, -2], shadowExtent: 12,
    });
    const { B, mVC, group } = sc;
    B.boxMM(mVC, 0x9cc87a, -120, -0.3, -120, 120, -0.02, 120);
    const mPath = surface({ map: tileTexture('#d8cbbb', '#cdbfae', '#a89a88', 3, 'path') });
    B.boxMM(mPath, 0xffffff, -1.6, -0.02, -45, 1.6, 0.0, 14, worldUV(0.6));
    B.boxMM(mVC, { top: 0xe0dad0, side: 0xc8c0b4 }, -1.75, -0.02, -45, -1.6, 0.1, 14);
    B.boxMM(mVC, { top: 0xe0dad0, side: 0xc8c0b4 }, 1.6, -0.02, -45, 1.75, 0.1, 14);
    const spots = [];
    for (let z = 10; z > -44; z -= 4.6) { spots.push([-3.6, z + 1.1]); spots.push([3.6, z - 0.9]); }
    trees(group, mVC, spots, 'sakura', [0.95, 1.15], [0xffc2d4, 0xffadc6, 0xffd8e4, 0xf7b6cb], 0x6a4a3e, true);
    // fallen petals on the path & grass (flat specks)
    const r = rngFor('petal-ground');
    for (let i = 0; i < 260; i++) B.boxMM(mVC, r.pick([0xffc2d4, 0xffd8e4, 0xffadc6]), ...(() => { const x = r.range(-5, 5), z = r.range(-20, 10); return [x, 0.0, z, x + 0.05, 0.004, z + 0.04]; })());
    // bench (seat 0.44 high, faces the path: -x)
    const bx = 2.4, bz = -1.0;
    B.boxMM(mVC, { top: 0xc8925e, side: 0xa8754a }, bx - 0.25, 0.4, bz - 0.85, bx + 0.25, 0.44, bz + 0.85);
    B.boxMM(mVC, 0xc8925e, bx + 0.22, 0.55, bz - 0.85, bx + 0.26, 0.9, bz + 0.85);
    for (const z of [-0.75, 0.75]) { B.boxMM(mVC, 0x4a4a52, bx - 0.24, 0, bz + z - 0.03, bx + 0.24, 0.4, bz + z + 0.03); B.boxMM(mVC, 0x4a4a52, bx + 0.2, 0.4, bz + z - 0.03, bx + 0.26, 0.92, bz + z + 0.03); }
    // lamp posts
    for (const z of [6, -6, -18, -30]) { B.add(GEO.cyl8, mVC, mat4(-2.1, 1.6, z, 0, 0, 0, 0.1, 3.2, 0.1), 0x3a4048); B.add(GEO.sphere, mVC, mat4(-2.1, 3.3, z, 0, 0, 0, 0.32, 0.32, 0.32), 0xfff4d8); }
    // school gate at the end of the path
    for (const x of [-2.6, 2.6]) B.boxMM(mVC, { top: 0xd8d0c4, side: 0xc8bfb0 }, x - 0.5, 0, -44.5, x + 0.5, 4, -43.5);
    B.boxMM(mVC, 0xc8322d, -3.1, 3.4, -44.2, 3.1, 4.1, -43.8);
    B.boxMM(mVC, 0xffe07a, -2, 3.6, -43.79, 2, 3.9, -43.78);
    const mFac = surface({ map: facadeTexture(false) });
    building(B, mVC, mFac, -25, -70, 25, -58, 0, 14.4, '+z');
    const petals = createPetals({ min: V(-6, 0, -18), max: V(6, 6.5, 9), count: sc.lowfx ? 160 : 450, label: 'sakura-petals' });
    group.add(petals.mesh);
    const clouds = createClouds(group, { count: sc.lowfx ? 4 : 6, center: V(0, 40, -60), spread: V(70, 8, 50), scale: 1.3, label: 'path-clouds' });
    let t = 0;
    return finish(sc, {
      name: 'cherryPath', background: 0xfbe8ee, exposure: 1.02, fog: new THREE.Fog(0xfbe8ee, 35, 160),
      anchors: {
        left: A(-0.5, 0, 0, -Math.PI / 2), right: A(0.5, 0, 0, Math.PI / 2), bench: A(bx, 0, bz, Math.PI / 2),
        camWide: C(0, 1.6, 6.2, 0, 1.4, -4, 45), camTrackStart: C(-3.2, 1.35, 3.6, 0, 1.15, 0, 45), camTrackEnd: C(3.0, 1.55, 3.0, 0, 1.2, -0.8, 45),
      },
      update(dt) { t += dt; petals.update(t); clouds.update(dt); },
    });
  },

  // ------------------------------------------------------------------------------------------
  canteen(ctx) {
    const sc = scaffold(ctx, 'canteen', {
      sunDir: [1, 0.6, 0.3], sun: 0xffe0b0, sunI: 1.6, hemiSky: 0xf0f2ff, hemiGround: 0xb09a80, hemiI: 1.25, ambI: 0.35, amb: 0xfff8ea,
      sky: { top: 0x5fa8ec, horizon: 0xdcefff, bottom: 0xb8c8bc, sun: 0xfff1cf, band: 0x101008, sunSize: 1, glow: 0.4 }, focus: [0, 0, 0], shadowExtent: 9,
    });
    const { B, mVC, group } = sc;
    const X = 7, Z0 = -5, Z1 = 5, H = 3.4;
    const mFloor = surface({ map: tileTexture('#e6e2d8', '#dcd6ca', '#b8b0a2', 4, 'canteen-floor') });
    B.boxMM(mFloor, 0xffffff, -X, -0.1, Z0, X, 0, Z1, worldUV(0.7));
    B.boxMM(mVC, 0xf6f4ee, -X - 0.1, H, Z0 - 0.1, X + 0.1, H + 0.1, Z1 + 0.1);
    const wallC = (x0, y0, z0, x1, y1, z1) => { if (y0 < 1.2 && y1 > 1.2) { B.boxMM(mVC, 0xa8d0c0, x0, y0, z0, x1, 1.2, z1); B.boxMM(mVC, 0xf4eedc, x0, 1.2, z0, x1, y1, z1); } else B.boxMM(mVC, 0xf4eedc, x0, y0, z0, x1, y1, z1); };
    wallC(-X - 0.12, 0, Z0 - 0.12, X + 0.12, H, Z0); wallC(-X - 0.12, 0, Z1, X + 0.12, H, Z1 + 0.12); wallC(-X - 0.12, 0, Z0, -X, H, Z1);
    // right wall with big windows
    const wins = [-2.6, 1.4];
    let z = Z0;
    for (const wz of wins) { wallC(X, 0, z, X + 0.12, H, wz - 1); wallC(X, 0, wz - 1, X + 0.12, 1.0, wz + 1); wallC(X, 2.6, wz - 1, X + 0.12, H, wz + 1); for (const [a, b, c, d] of [[1.0, wz - 1, 1.05, wz + 1], [2.55, wz - 1, 2.6, wz + 1], [1.0, wz - 0.02, 2.6, wz + 0.02]]) B.boxMM(mVC, 0xf3f1ea, X, a, b, X + 0.1, c, d); z = wz + 1; }
    wallC(X, 0, z, X + 0.12, H, Z1);
    trees(group, mVC, [[11, -6], [12, 0], [11, 6], [16, -2]], 'canteen-trees', [1.0, 1.2]);
    B.boxMM(mVC, 0x8fbf6a, X, -0.3, -40, 60, -0.05, 40);
    // serving counter + windows into the kitchen + menu board
    B.boxMM(mVC, { top: 0xd8dde2, side: 0xb8c0c8 }, -5.5, 0, Z0, 5.5, 0.95, Z0 + 0.7);
    B.boxMM(mVC, 0xc8d0d8, -5.5, 0.95, Z0 + 0.55, 5.5, 1.0, Z0 + 0.75);
    const r = rngFor('canteen');
    const foods = [0xc8562e, 0xf2c14e, 0x6cb04a, 0xe8873a, 0xd8463c, 0x9a6a3a, 0xf4f1e6, 0x7fb35a];
    for (let i = 0; i < 10; i++) { const fx = -5 + i * 1.05; B.boxMM(mVC, 0xc0c8d0, fx, 0.95, Z0 + 0.1, fx + 0.85, 1.0, Z0 + 0.5); B.boxMM(mVC, foods[i % foods.length], fx + 0.05, 1.0, Z0 + 0.14, fx + 0.8, 1.03, Z0 + 0.46); }
    B.boxMM(mVC, 0x6a5e50, -5.5, 1.0, Z0 + 0.01, 5.5, 2.05, Z0 + 0.02);
    for (let i = 0; i < 4; i++) B.boxMM(mVC, 0xdfe6ea, -5.5 + i * 2.8 - 0.1, 1.0, Z0 + 0.02, -5.5 + i * 2.8 + 0.1, 2.05, Z0 + 0.04);
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), surface({ map: menuTexture(), vertexColors: false }));
    menu.position.set(0, 2.6, Z0 + 0.01); group.add(menu);
    // tables (4-seat units with fixed round stools at height 0.44)
    const tables = [[-2.4, -0.6], [2.0, 0.9], [-2.4, 2.6], [2.0, -2.0], [-5.2, 0.9], [5.0, 3.0], [5.0, -0.6]];
    const seatsOf = (tx, tz) => [[-0.45, -0.62], [0.45, -0.62], [-0.45, 0.62], [0.45, 0.62]].map(([sx, sz]) => ({ pos: V(tx + sx, 0, tz + sz), yaw: sz < 0 ? Math.PI : 0 }));
    for (const [tx, tz] of tables) {
      B.boxMM(mVC, { top: 0xf2ece0, side: 0xd8d0c0 }, tx - 0.65, 0.72, tz - 0.4, tx + 0.65, 0.76, tz + 0.4);
      B.boxMM(mVC, 0x6a7a88, tx - 0.04, 0, tz - 0.04, tx + 0.04, 0.72, tz + 0.04);
      B.boxMM(mVC, 0x6a7a88, tx - 0.6, 0.22, tz - 0.03, tx + 0.6, 0.26, tz + 0.03);
      for (const s of seatsOf(tx, tz)) { B.add(GEO.cyl12, mVC, mat4(s.pos.x, 0.42, s.pos.z, 0, 0, 0, 0.32, 0.04, 0.32), 0xe8873a); B.add(GEO.cyl8, mVC, mat4(s.pos.x, 0.2, s.pos.z, 0, 0, 0, 0.05, 0.4, 0.05), 0x6a7a88); }
      for (let k = 0; k < 2; k++) if (r.chance(0.7)) { const sx = k ? 0.3 : -0.3, sz = r.chance(0.5) ? -0.18 : 0.18; B.boxMM(mVC, { top: 0x9fc6e0, side: 0x7fa8c8 }, tx + sx - 0.2, 0.76, tz + sz - 0.14, tx + sx + 0.2, 0.78, tz + sz + 0.14); B.add(GEO.cyl12, mVC, mat4(tx + sx + 0.08, 0.81, tz + sz, 0, 0, 0, 0.12, 0.05, 0.12), 0xffffff); B.boxMM(mVC, r.pick(foods), tx + sx - 0.17, 0.78, tz + sz - 0.1, tx + sx - 0.02, 0.795, tz + sz + 0.1); }
    }
    const tubes = [];
    for (const lx of [-4, 0, 4]) for (const lz of [-2.5, 0.5, 3.5]) { B.boxMM(mVC, 0xe8e8e2, lx - 0.1, H - 0.07, lz - 0.62, lx + 0.1, H, lz + 0.62); tubes.push([GEO.cyl8, mat4(lx, H - 0.085, lz, Math.PI / 2, 0, 0, 0.035, 1.18, 0.035), 0xffffff]); }
    group.add(new THREE.Mesh(mergeColored(tubes), new THREE.MeshBasicMaterial({ color: 0xfffaf0, vertexColors: true })));
    const tableAnchor = (i) => ({ pos: V(tables[i][0], 0, tables[i][1]), yaw: 0, top: V(tables[i][0], 0.76, tables[i][1]), seats: seatsOf(...tables[i]) });
    return finish(sc, {
      name: 'canteen', background: 0xdcefff, exposure: 1.0,
      anchors: { tableA: tableAnchor(0), tableB: tableAnchor(1), camWide: C(1.8, 2.1, 3.8, -1.9, 0.8, -0.8, 50) },
    });
  },

  // ------------------------------------------------------------------------------------------
  __fallback(ctx, label = 'set') {
    const sc = scaffold(ctx, label, { sunDir: [-0.6, 0.7, 0.4], sky: { top: 0x5fa8ec, horizon: 0xdcefff, bottom: 0xb8c8bc, sun: 0xfff1cf, sunSize: 1, glow: 0.4 } });
    sc.B.boxMM(sc.mVC, 0x9cc87a, -60, -0.3, -60, 60, 0, 60);
    trees(sc.group, sc.mVC, [[-6, -8], [5, -9], [-9, 2], [8, 3]], `fb-${label}`, [1, 1.2]);
    return finish(sc, { name: label, anchors: { left: A(-0.6, 0, 0, -Math.PI / 2), right: A(0.6, 0, 0, Math.PI / 2), camWide: C(0, 1.6, 4.5, 0, 1.1, 0, 50) } });
  },
};

export function buildEndingSet(ctx, name, label) {
  const fn = BUILDERS[name] || ((c) => BUILDERS.__fallback(c, name));
  if (name === '__fallback') return BUILDERS.__fallback(ctx, label || 'set');
  return fn(ctx);
}

