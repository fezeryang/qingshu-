// Atmosphere helpers shared by the classroom and the ending sets (owner: env-artist):
// sky dome, stars, drifting clouds, rain streaks, falling petals, light shafts, dust motes, fake sun patches.
// Everything animated runs on a `time` uniform fed from the set's update(dt) (game clock).
import * as THREE from 'three';
import { mergeColored, mat4, GEO, toon, rngFor } from './kit.js';
import { softDotTexture, lightPatchTexture, petalTexture } from './textures.js';

const col = (hex) => new THREE.Color(hex);

// ---------------------------------------------------------------------------------------------
/** Gradient sky dome with a sun/moon glow. setColors({top, horizon, bottom, sun, sunDir, sunSize, glow}). */
export function createSky(radius = 150) {
  const uniforms = {
    top: { value: col(0x5fa8ec) }, horizon: { value: col(0xd6ecf7) }, bottom: { value: col(0xb9c9c0) },
    sunColor: { value: col(0xfff0c8) }, sunDir: { value: new THREE.Vector3(-1, 0.6, 0.3).normalize() },
    sunSize: { value: 1.0 }, glow: { value: 0.35 }, band: { value: col(0x000000) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `uniform vec3 top, horizon, bottom, sunColor, band; uniform vec3 sunDir; uniform float sunSize, glow; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h,0.0,1.0), 0.4));
        c += band * exp(-abs(h - 0.04) * 18.0);
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunColor * (smoothstep(0.9993 - 0.0006 * sunSize, 0.9996, s) * 1.6 + pow(s, 12.0) * glow + pow(s, 3.0) * glow * 0.25);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  mesh.name = 'sky';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh, uniforms,
    setColors(o) {
      for (const k of ['top', 'horizon', 'bottom', 'band']) if (o[k] != null) uniforms[k].value.set(o[k]);
      if (o.sun != null) uniforms.sunColor.value.set(o.sun);
      if (o.sunDir) uniforms.sunDir.value.copy(o.sunDir).normalize();
      if (o.sunSize != null) uniforms.sunSize.value = o.sunSize;
      if (o.glow != null) uniforms.glow.value = o.glow;
    },
  };
}

/** Star field on a dome (night). */
export function createStars(radius = 140, count = 500, label = 'stars') {
  const r = rngFor(label);
  const pos = new Float32Array(count * 3), size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = r.range(0.05, 1), th = r.range(0, Math.PI * 2);
    const y = u, rr = Math.sqrt(1 - y * y);
    pos.set([Math.cos(th) * rr * radius, y * radius, Math.sin(th) * rr * radius], i * 3);
    size[i] = r.range(1, 3.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 1 }, time: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float size; uniform float time; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size; vA = 0.6 + 0.4 * sin(time * 2.0 + position.x * 0.37 + position.z * 0.11); }`,
    fragmentShader: `uniform float opacity; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0,0.97,0.9), opacity * vA * smoothstep(0.5, 0.1, d)); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -9;
  return pts;
}

/** Low-poly cumulus clouds: an array of meshes that drift along `dir` and wrap inside `span`. */
export function createClouds(parent, { count = 6, center = new THREE.Vector3(-70, 28, 0), spread = new THREE.Vector3(30, 8, 90), scale = 1, label = 'clouds' } = {}) {
  const r = rngFor(label);
  const mat = toon({ emissive: 0xffffff, emissiveIntensity: 0.25 });
  const list = [];
  for (let i = 0; i < count; i++) {
    const parts = [];
    const n = r.int(4, 7);
    for (let k = 0; k < n; k++) {
      const s = r.range(3, 6.5) * scale;
      parts.push([GEO.ico, mat4((k - n / 2) * 2.6 * scale + r.range(-1, 1), r.range(0, 1.5) * scale, r.range(-1.5, 1.5) * scale, 0, r.range(0, 3), 0, s * 1.3, s * 0.75, s), (_, ny) => (ny < -0.3 ? 0xdfe6f0 : 0xffffff)]);
    }
    const m = new THREE.Mesh(mergeColored(parts), mat);
    m.position.set(center.x + r.range(-1, 1) * spread.x, center.y + r.range(-1, 1) * spread.y, center.z + r.range(-1, 1) * spread.z);
    m.castShadow = false; m.receiveShadow = false;
    m.userData.speed = r.range(0.25, 0.6);
    parent.add(m);
    list.push(m);
  }
  return {
    list, material: mat,
    update(dt) { for (const m of list) { m.position.z += m.userData.speed * dt; if (m.position.z > center.z + spread.z) m.position.z -= spread.z * 2; } },
    setTint(hex, emissive = 0.25) { mat.color.set(hex); mat.emissiveIntensity = emissive; },
  };
}

/** Rain streaks inside a box (shader-animated line segments). */
export function createRain({ min = new THREE.Vector3(-30, -8, -20), max = new THREE.Vector3(-5.4, 12, 20), count = 1500, label = 'rain' } = {}) {
  const r = rngFor(label);
  const pos = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const x = r.range(min.x, max.x), y = r.range(min.y, max.y), z = r.range(min.z, max.z), len = r.range(0.35, 0.7);
    pos.set([x, y, z, x + 0.03, y + len, z + 0.01], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, y0: { value: min.y }, h: { value: max.y - min.y }, opacity: { value: 0.45 } },
    transparent: true, depthWrite: false, fog: false,
    vertexShader: `uniform float time, y0, h; void main(){ vec3 p = position; p.y = y0 + mod(p.y - y0 - time * 9.0, h); gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: `uniform float opacity; void main(){ gl_FragColor = vec4(0.82,0.88,0.95, opacity); }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.name = 'rain';
  return { mesh: lines, update(t) { mat.uniforms.time.value = t; } };
}

/** Falling cherry petals (points that flutter down and wrap). */
export function createPetals({ min, max, count = 400, label = 'petals' }) {
  const r = rngFor(label);
  const pos = new Float32Array(count * 3), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos.set([r.range(min.x, max.x), r.range(min.y, max.y), r.range(min.z, max.z)], i * 3); ph[i] = r.range(0, 100); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, map: { value: petalTexture() }, y0: { value: min.y }, h: { value: max.y - min.y }, size: { value: 22 } },
    transparent: true, depthWrite: false,
    vertexShader: `attribute float phase; uniform float time, y0, h, size; varying float vRot;
      void main(){ vec3 p = position; float t = time + phase;
        p.y = y0 + mod(p.y - y0 - time * 0.55, h); p.x += sin(t * 1.3) * 0.5 + time * 0.25; p.z += cos(t * 0.9) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size / max(0.5, -mv.z) * 3.0; vRot = t * 2.0; }`,
    fragmentShader: `uniform sampler2D map; varying float vRot; void main(){ vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), co = cos(vRot); c = mat2(co,-s,s,co) * c * vec2(1.0, 1.0 + 0.6 * abs(s)); vec4 t = texture2D(map, c + 0.5); if (t.a < 0.1) discard; gl_FragColor = t; }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { mesh: pts, update(t) { mat.uniforms.time.value = t; } };
}

// ---------------------------------------------------------------------------------------------
/** Window light shafts: additive prisms extruded from each opening along the sun direction. */
export function createShafts(windows, wallX) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: col(0xffe2a8) }, opacity: { value: 0.16 }, time: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float opacity, time; varying vec2 vUv;
      void main(){ float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float streak = 0.62 + 0.38 * sin(vUv.x * 31.0 + time * 0.35) * sin(vUv.x * 11.0 - time * 0.21);
        float a = opacity * pow(1.0 - vUv.y, 1.4) * smoothstep(0.0, 0.06, vUv.y) * edge * streak;
        gl_FragColor = vec4(color, a); }`,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.name = 'lightShafts';
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  const api = {
    mesh, material: mat,
    /** dir: unit vector the light travels along (into the room). */
    rebuild(dir) {
      const P = [], U = [];
      const quad = (a, b, len) => {
        const a2 = a.clone().addScaledVector(dir, len), b2 = b.clone().addScaledVector(dir, len);
        P.push(...a.toArray(), ...b.toArray(), ...b2.toArray(), ...a.toArray(), ...b2.toArray(), ...a2.toArray());
        U.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      };
      for (const w of windows) {
        const y0 = w.sillY + 0.05, y1 = w.sillY + w.h - 0.05, z0 = w.z - w.w / 2 + 0.05, z1 = w.z + w.w / 2 - 0.05;
        const len = Math.min(9, (y1 + 0.3) / Math.max(0.12, -dir.y));
        const c = (y, z) => new THREE.Vector3(wallX, y, z);
        const ym = (y0 + y1) / 2, zm = (z0 + z1) / 2;
        quad(c(y1, z0), c(y1, z1), len); quad(c(y0, z0), c(y0, z1), len);
        quad(c(y0, z0), c(y1, z0), len); quad(c(y0, z1), c(y1, z1), len);
        quad(c(ym, z0), c(ym, z1), len); quad(c(y0, zm), c(y1, zm), len);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      mesh.geometry.dispose();
      mesh.geometry = g;
    },
  };
  return api;
}

/** Dust motes floating inside the window shafts. */
export function createDust(windows, wallX, count) {
  const r = rngFor('dust');
  const base = new Float32Array(count * 3), seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) { base.set([r.next(), r.next(), r.next()], i * 3); seed.set([r.range(0, 100), r.range(0.5, 1.5)], i * 2); }
  const g = new THREE.BufferGeometry();
  // positions are filled by rebuild(); keep the unit randoms around
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, color: { value: col(0xfff1cc) }, opacity: { value: 0.9 }, map: { value: softDotTexture() }, scale: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    vertexShader: `attribute vec2 seed; uniform float time, scale; varying float vA;
      void main(){ vec3 p = position; float t = time * 0.25 * seed.y + seed.x;
        p += vec3(sin(t * 1.3) * 0.12, sin(t * 0.7 + 1.0) * 0.18 + cos(t * 0.31) * 0.1, cos(t * 1.1) * 0.12);
        vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = min(3.0, scale * 2.5 * seed.y * projectionMatrix[1][1] / max(0.2, -mv.z));
        vA = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(time * 1.7 * seed.y + seed.x * 3.0), 2.0); }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; uniform sampler2D map; varying float vA; void main(){ gl_FragColor = vec4(color, texture2D(map, gl_PointCoord).a * opacity * vA); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  pts.name = 'dust';
  return {
    mesh: pts, material: mat,
    rebuild(dir) {
      const p = g.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const w = windows[i % windows.length];
        const a = base[i * 3], b = base[i * 3 + 1], c = base[i * 3 + 2];
        const y = w.sillY + 0.1 + b * (w.h - 0.2), z = w.z - w.w / 2 + 0.1 + c * (w.w - 0.2);
        const len = (y + 0.2) / Math.max(0.12, -dir.y);
        const t = 0.15 + a * 0.8 * len;
        p[i * 3] = wallX + dir.x * t; p[i * 3 + 1] = y + dir.y * t; p[i * 3 + 2] = z + dir.z * t;
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

/** lowfx stand-in for shadowed sunlight: window-shaped additive patches projected onto the floor. */
export function createSunPatches(windows, wallX) {
  const mat = new THREE.MeshBasicMaterial({ map: lightPatchTexture(), color: 0xffd9a0, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.name = 'sunPatches';
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return {
    mesh, material: mat,
    rebuild(dir, floorY = 0.004) {
      const P = [], U = [];
      for (const w of windows) {
        const hit = (y, z) => { const t = (y - floorY) / Math.max(0.05, -dir.y); return [wallX + dir.x * t, floorY, z + dir.z * t]; };
        const z0 = w.z - w.w / 2, z1 = w.z + w.w / 2, y0 = w.sillY, y1 = w.sillY + w.h;
        const a = hit(y1, z0), b = hit(y1, z1), c = hit(y0, z1), d = hit(y0, z0);
        P.push(...a, ...c, ...b, ...a, ...d, ...c);
        U.push(0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      mesh.geometry.dispose();
      mesh.geometry = g;
    },
  };
}

// ---------------------------------------------------------------------------------------------
/** Low-poly tree (merged parts for a Batch-like list): trunk + layered canopy clusters. Returns parts for mergeColored. */
export function treeParts(r, x, y, z, s = 1, colors = [0x6aaa4c, 0x4c8f3e, 0x8cc463], trunk = 0x7a5636, blossom = false) {
  const parts = [];
  const h = r.range(3.2, 4.5) * s;
  parts.push([GEO.cyl8, mat4(x, y + h / 2, z, 0, 0, r.range(-0.06, 0.06), 0.28 * s, h, 0.28 * s), trunk]);
  const n = r.int(7, 10);
  for (let k = 0; k < n; k++) {
    const rs = r.range(1.5, 2.3) * s;
    const c = colors[k % colors.length];
    parts.push([blossom ? GEO.ico : GEO.sphere, mat4(x + r.range(-1.1, 1.1) * s, y + h + r.range(-0.3, 1.3) * s, z + r.range(-1.1, 1.1) * s, r.range(0, 3), r.range(0, 3), 0, rs * 1.15, rs * 0.95, rs * 1.1),
      (nx, ny) => (ny > 0.35 ? c : new THREE.Color(c).multiplyScalar(0.82).getHex())]);
  }
  return parts;
}
