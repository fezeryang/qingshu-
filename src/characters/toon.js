// Shared toon materials: gradient ramp, per-character palette textures, outline material.
import * as THREE from 'three';

export const PALETTE_SIZE = 16;
export const SLOT = {
  skin: 0, hair: 1, hairShade: 2, top: 3, topAccent: 4, shirt: 5, bottom: 6, bottomAccent: 7,
  shoe: 8, sole: 9, tie: 10, frame: 11, acc: 12, sock: 13, white: 14, dark: 15,
};
export const slotUV = (slot) => [(slot + 0.5) / PALETTE_SIZE, 0.5];

let gradient = null;
export function gradientMap() {
  if (!gradient) {
    const v = [150, 168, 236, 255];
    const data = new Uint8Array(v.length * 4);
    v.forEach((x, i) => { data.set([x, x, x, 255], i * 4); });
    gradient = new THREE.DataTexture(data, v.length, 1, THREE.RGBAFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

/** colors: array of PALETTE_SIZE THREE.Color → DataTexture (sRGB bytes). */
export function makePaletteTexture(colors) {
  const data = new Uint8Array(PALETTE_SIZE * 4);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const hex = (colors[i] || new THREE.Color(0xff00ff)).getHex();
    data.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, PALETTE_SIZE, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const paletteMatCache = new Map();
/** One toon material per distinct palette (characters with identical colours share it). */
export function paletteMaterial(colors) {
  const key = colors.map((c) => c.getHexString()).join('');
  let m = paletteMatCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ map: makePaletteTexture(colors), gradientMap: gradientMap() });
    m.name = 'charPalette';
    paletteMatCache.set(key, m);
  }
  return m;
}

export function toonMaterial(opts) {
  return new THREE.MeshToonMaterial({ gradientMap: gradientMap(), ...opts });
}

// Inverted-hull outline. Extrusion = normal * aOutline * width, scaled with view depth so the
// line keeps a roughly constant pixel width.
export const outlineUniform = { value: 0.0042 };
let outlineMat = null;
export function outlineMaterial() {
  if (!outlineMat) {
    outlineMat = new THREE.MeshBasicMaterial({ color: 0x2a1c1c, side: THREE.BackSide });
    outlineMat.name = 'charOutline';
    outlineMat.onBeforeCompile = (sh) => {
      sh.uniforms.uOutline = outlineUniform;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aOutline;\nuniform float uOutline;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  float olDepth = clamp(-(modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z, 0.8, 7.0);
  transformed += normalize(normal) * aOutline * uOutline * olDepth;`);
    };
    outlineMat.customProgramCacheKey = () => 'qs-outline';
  }
  return outlineMat;
}

/** Parse a colour from number / '#hex' / css / preset word; returns THREE.Color or null. */
const PRESETS = {
  black: '#1f1b1e', darkbrown: '#3b2a22', brown: '#5a3c2a', chestnut: '#7a4a2e', auburn: '#8a3b26', blonde: '#d9b56e',
  gray: '#8d8d92', grey: '#8d8d92', white: '#eeeeee', navy: '#2a3550', red: '#b23a3a', pink: '#e98fa5', blue: '#3a6fc2',
  light: '#ffe3cf', fair: '#ffe6d6', medium: '#f1c9a5', tan: '#d9a87e', dark: '#a8704c', pale: '#fff0e6',
  green: '#3f7a4f', purple: '#6c4f9c',
};
export function parseColor(v, fallback) {
  try {
    if (v == null || v === '') return new THREE.Color(fallback);
    if (typeof v === 'number' && Number.isFinite(v)) return new THREE.Color(v);
    if (v?.isColor) return v.clone();
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (PRESETS[s]) return new THREE.Color(PRESETS[s]);
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) return new THREE.Color(s);
      if (/^0x[0-9a-f]{6}$/.test(s)) return new THREE.Color(parseInt(s, 16));
      if (/^(rgb|hsl)a?\(/.test(s)) return new THREE.Color(s);
    }
  } catch { /* fall through */ }
  return new THREE.Color(fallback);
}
