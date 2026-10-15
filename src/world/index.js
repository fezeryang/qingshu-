// STUB (gray-box) — to be replaced by the env-artist agent. Contract: docs/CONTRACTS.md §4.1
import * as THREE from 'three';
import { ROOM, SEATS, DESK, CHAIR, PLATFORM, TEACHER_DESK, BLACKBOARD, WINDOWS, TRASH, FANS } from '../core/layout.js';

export async function install(ctx) {
  const group = new THREE.Group();
  group.name = 'classroom';
  const colliders = [];
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const addBox = (min, max, color, tag, ownerId, collide = true) => {
    const size = new THREE.Vector3().subVectors(max, min);
    const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat(color));
    m.position.addVectors(min, max).multiplyScalar(0.5);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (collide) colliders.push({ kind: 'box', min: min.clone(), max: max.clone(), tag, ownerId });
    return m;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // floor / ceiling / walls
  addBox(V(ROOM.minX - 1, -0.1, ROOM.minZ - 1), V(ROOM.maxX + 1, 0, ROOM.maxZ + 1), 0xb9a07a, 'floor');
  addBox(V(ROOM.minX, ROOM.height, ROOM.minZ), V(ROOM.maxX, ROOM.height + 0.1, ROOM.maxZ), 0xf4efe4, 'ceiling');
  addBox(V(ROOM.minX, 0, ROOM.minZ - 0.1), V(ROOM.maxX, ROOM.height, ROOM.minZ), 0xeee4cf, 'wall');
  addBox(V(ROOM.minX, 0, ROOM.maxZ), V(ROOM.maxX, ROOM.height, ROOM.maxZ + 0.1), 0xeee4cf, 'wall');
  addBox(V(ROOM.maxX, 0, ROOM.minZ), V(ROOM.maxX + 0.1, ROOM.height, ROOM.maxZ), 0xeee4cf, 'wall');
  // left wall with window holes: below sill, above top, and piers between windows
  const lw = (z0, z1, y0, y1) => addBox(V(ROOM.minX - 0.1, y0, z0), V(ROOM.minX, y1, z1), 0xeee4cf, 'wall');
  const w0 = WINDOWS[0];
  lw(ROOM.minZ, ROOM.maxZ, 0, w0.sillY);
  lw(ROOM.minZ, ROOM.maxZ, w0.sillY + w0.h, ROOM.height);
  let z = ROOM.minZ;
  for (const w of WINDOWS) {
    lw(z, w.z - w.w / 2, w0.sillY, w0.sillY + w0.h);
    if (!w.open) addBox(V(ROOM.minX - 0.05, w.sillY, w.z - w.w / 2), V(ROOM.minX - 0.03, w.sillY + w.h, w.z + w.w / 2), 0x9fd3ff, 'windowGlass');
    z = w.z + w.w / 2;
  }
  lw(z, ROOM.maxZ, w0.sillY, w0.sillY + w0.h);
  colliders.push({ kind: 'trigger', min: V(-12, -1, -12), max: V(ROOM.minX - 0.15, 8, 12), tag: 'outside' });

  // platform, teacher desk, blackboard
  addBox(V(PLATFORM.minX, 0, PLATFORM.minZ), V(PLATFORM.maxX, PLATFORM.h, PLATFORM.maxZ), 0x9c7b55, 'podium');
  addBox(V(TEACHER_DESK.x - TEACHER_DESK.w / 2, PLATFORM.h, TEACHER_DESK.z - TEACHER_DESK.d / 2),
    V(TEACHER_DESK.x + TEACHER_DESK.w / 2, TEACHER_DESK.topY, TEACHER_DESK.z + TEACHER_DESK.d / 2), 0x8a5a33, 'teacherDesk');
  const bbCanvas = document.createElement('canvas');
  bbCanvas.width = 1024; bbCanvas.height = 280;
  const bbTex = new THREE.CanvasTexture(bbCanvas);
  bbTex.colorSpace = THREE.SRGBColorSpace;
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(BLACKBOARD.w, BLACKBOARD.h), new THREE.MeshStandardMaterial({ map: bbTex, roughness: 0.95 }));
  bb.position.set(BLACKBOARD.x, BLACKBOARD.y, BLACKBOARD.z + 0.01);
  group.add(bb);
  let bbText = '';
  const drawBoard = () => {
    const g = bbCanvas.getContext('2d');
    g.fillStyle = '#2f4a3a'; g.fillRect(0, 0, bbCanvas.width, bbCanvas.height);
    g.fillStyle = '#f2f2e8'; g.font = '48px sans-serif';
    bbText.split('\n').forEach((line, i) => g.fillText(line, 40, 70 + i * 60));
    bbTex.needsUpdate = true;
  };
  drawBoard();

  // desks + chairs
  for (const s of SEATS) {
    addBox(V(s.x - DESK.w / 2, DESK.topY - DESK.top, s.deskZ - DESK.d / 2), V(s.x + DESK.w / 2, DESK.topY, s.deskZ + DESK.d / 2), 0xd8b98c, 'desk', s.id);
    addBox(V(s.x - CHAIR.w / 2, CHAIR.seatY - 0.03, s.chairZ - CHAIR.d / 2), V(s.x + CHAIR.w / 2, CHAIR.seatY, s.chairZ + CHAIR.d / 2), 0x7a8c9c, 'chair', s.id);
  }

  // trash bin: 4 thin walls + inside trigger
  const t = TRASH, th = 0.015;
  addBox(V(t.x - t.r, 0, t.z - t.r), V(t.x + t.r, t.h, t.z - t.r + th), 0x5c7c5c, 'trashRim');
  addBox(V(t.x - t.r, 0, t.z + t.r - th), V(t.x + t.r, t.h, t.z + t.r), 0x5c7c5c, 'trashRim');
  addBox(V(t.x - t.r, 0, t.z - t.r), V(t.x - t.r + th, t.h, t.z + t.r), 0x5c7c5c, 'trashRim');
  addBox(V(t.x + t.r - th, 0, t.z - t.r), V(t.x + t.r, t.h, t.z + t.r), 0x5c7c5c, 'trashRim');
  colliders.push({ kind: 'trigger', min: V(t.x - t.r + th, 0, t.z - t.r + th), max: V(t.x + t.r - th, t.h - 0.05, t.z + t.r - th), tag: 'trash' });

  // fans: 3 blades each, rotating; exposed as dynamic OBB colliders
  const fans = FANS.map((f) => {
    const hub = new THREE.Group();
    hub.position.set(f.x, f.bladeY, f.z);
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(f.r, 0.01, 0.12), mat(0xdddddd));
      blade.position.set(Math.cos((i * 2 * Math.PI) / 3) * f.r / 2, 0, Math.sin((i * 2 * Math.PI) / 3) * f.r / 2);
      blade.rotation.y = -(i * 2 * Math.PI) / 3;
      hub.add(blade);
    }
    group.add(hub);
    return { id: f.id, center: hub.position.clone(), radius: f.r, bladeY: f.bladeY, spinning: true, angle: 0, rps: f.rps, hub };
  });

  group.add(new THREE.HemisphereLight(0xfff4e0, 0x8a7a66, 1.2));
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.2);
  sun.position.set(-8, 7, 2);
  sun.castShadow = !ctx.config.lowfx;
  group.add(sun);

  const classroom = {
    name: 'classroom', group, colliders,
    background: new THREE.Color(0xcfe8ff),
    dynamicColliders() {
      const out = [];
      for (const f of fans) {
        if (!f.spinning) continue;
        for (let i = 0; i < 3; i++) {
          const a = f.angle + (i * 2 * Math.PI) / 3;
          out.push({
            kind: 'obb', tag: 'fan', ownerId: f.id,
            center: new THREE.Vector3(f.center.x + Math.cos(a) * f.radius / 2, f.bladeY, f.center.z + Math.sin(a) * f.radius / 2),
            halfSize: new THREE.Vector3(f.radius / 2, 0.02, 0.06),
            quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a),
            velocity: new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(f.rps * 2 * Math.PI * f.radius / 2),
          });
        }
      }
      return out;
    },
    blackboard: {
      write(text) { bbText = text; drawBoard(); },
      append(text) { bbText += text; drawBoard(); },
      clear() { bbText = ''; drawBoard(); },
      get text() { return bbText; },
    },
    clock: { set() {} },
    wind: { strength: 0, dir: new THREE.Vector3(1, 0, 0) },
    gust(strength = 1, dur = 1.5) { classroom.wind.strength = strength; ctx.time.wait(dur).then(() => { classroom.wind.strength = 0; }); },
    windows: WINDOWS.map((w) => ({ ...w })),
    fans,
    setMood() {},
    update(dt) {
      for (const f of fans) if (f.spinning) { f.angle += f.rps * 2 * Math.PI * dt; f.hub.rotation.y = -f.angle; }
    },
  };

  ctx.world = {
    classroom,
    buildSet(name) {
      const g = new THREE.Group();
      g.name = name;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat(0x88aa77));
      floor.rotation.x = -Math.PI / 2;
      g.add(floor, new THREE.HemisphereLight(0xffffff, 0x666666, 2));
      const a = (x, z, yaw = 0) => ({ pos: V(x, 0, z), yaw });
      return {
        name, group: g, background: new THREE.Color(0xffc9a0),
        anchors: new Proxy({ left: a(-0.6, 0, -Math.PI / 2), right: a(0.6, 0, Math.PI / 2) }, {
          // stub: every anchor key exists; cam* keys are camera placements
          get: (o, k) => o[k] ?? (String(k).startsWith('cam') ? { pos: V(0, 1.6, 4), look: V(0, 1, 0) } : a(0, 0)),
        }),
        update() {},
      };
    },
  };
}
