// Resolve a roster spec into a complete look (deterministic defaults from the id) + palette colours.
import * as THREE from 'three';
import { parseColor, SLOT, PALETTE_SIZE } from './toon.js';
import { HAIR_STYLES } from './hair.js';

export const OUTFITS = ['uniform', 'shirtTie', 'suit', 'tracksuit', 'casual', 'janitor'];
export const ACCESSORIES = ['none', 'hairclip', 'headband', 'bandaid', 'earbuds', 'freckles', 'mole'];
export const BUILDS = ['slim', 'normal', 'sturdy'];
export const OUTFIT_SHAPE = { uniform: 'jacket', tracksuit: 'jacket', shirtTie: 'shirt', suit: 'suit', casual: 'sweater', janitor: 'coat' };

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFrom(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

const SKINS = ['#ffe6d4', '#fde0c8', '#f8d4b8', '#f2c8a6', '#e8b993'];
const HAIRS = ['#1f1a1d', '#262022', '#2e2320', '#3a2a22', '#463024', '#25222c', '#4f3426'];
const EYES = ['#5a3a2a', '#45302a', '#6b4a33', '#3a3550', '#4f3a2c'];
const ACC_COLS = ['#ff6f91', '#ffcf4f', '#6ec6e8', '#b59be0', '#f2584f', '#7fd18b'];

export function resolveLook(spec) {
  spec = spec || {};
  const L = spec.look || {};
  const id = String(spec.id ?? 'anon');
  const r = rngFrom(hashStr(id));
  const role = ['student', 'teacher', 'npc'].includes(spec.role) ? spec.role : 'student';
  const gender = spec.gender === 'f' ? 'f' : 'm';
  const adult = role !== 'student';
  const defStyle = role === 'teacher' ? 'combover'
    : gender === 'f' ? pick(r, adult ? ['bob', 'bun', 'long', 'short'] : ['ponytail', 'bob', 'long', 'twintails', 'bun', 'braid', 'short', 'ponytail'])
      : pick(r, adult ? ['short', 'sidepart', 'buzz', 'combover'] : ['short', 'messy', 'sidepart', 'buzz', 'curtain', 'short']);
  const hairStyle = HAIR_STYLES.includes(L.hairStyle) ? L.hairStyle : defStyle;
  const outfit = OUTFITS.includes(L.outfit) ? L.outfit : role === 'teacher' ? 'shirtTie' : role === 'npc' ? 'casual' : 'uniform';
  const build = BUILDS.includes(L.build) ? L.build : pick(r, ['normal', 'normal', 'slim', 'normal', 'sturdy']);
  let height = Number(L.height);
  if (!Number.isFinite(height)) height = 0.95 + r() * 0.1;
  height = THREE.MathUtils.clamp(height, 0.85, 1.15);
  const glasses = typeof L.glasses === 'boolean' ? L.glasses : role === 'teacher' ? true : r() < 0.2;
  const accessory = ACCESSORIES.includes(L.accessory) ? L.accessory : 'none';
  const bottom = (L.bottom === 'skirt' || L.skirt === true) && (outfit === 'uniform' || outfit === 'casual') ? 'skirt' : 'pants';
  const skin = parseColor(L.skin, pick(r, SKINS));
  const hairColor = parseColor(L.hairColor, role === 'teacher' ? '#3b3532' : pick(r, HAIRS));
  const eyeColor = parseColor(L.eyeColor, pick(r, EYES));
  const look = {
    role, gender, adult, hairStyle, outfit, build, height, glasses, accessory, bottom, skin, hairColor, eyeColor,
    shape: OUTFIT_SHAPE[outfit],
    skinCss: `#${skin.getHexString()}`, eyeCss: `#${eyeColor.getHexString()}`,
    browCss: `#${hairColor.clone().multiplyScalar(0.75).getHexString()}`,
    accColor: parseColor(L.accessoryColor, pick(r, ACC_COLS)),
    variant: r(),
  };
  look.colors = palette(look, L.palette || {}, r);
  return look;
}

function palette(look, over, r) {
  const C = (v) => new THREE.Color(v);
  const p = new Array(PALETTE_SIZE).fill(null).map(() => C('#ff00ff'));
  p[SLOT.skin] = look.skin.clone();
  p[SLOT.hair] = look.hairColor.clone();
  p[SLOT.hairShade] = look.hairColor.clone().multiplyScalar(0.7);
  p[SLOT.white] = C('#f5f5f2');
  p[SLOT.dark] = C('#2a2524');
  p[SLOT.frame] = C(look.role === 'teacher' ? '#3a2c26' : pick(r, ['#2a2a30', '#5a3a2a', '#2a2a30', '#a03048', '#3a4f7a']));
  p[SLOT.acc] = look.accColor.clone();
  p[SLOT.tie] = C('#b03040');
  p[SLOT.sock] = C('#f2f2f2');
  const set = (o) => { for (const [k, v] of Object.entries(o)) p[SLOT[k]] = C(v); };
  switch (look.outfit) {
    case 'tracksuit': set({ top: '#c63a44', topAccent: '#f4f4f4', shirt: '#f4f4f4', bottom: '#27304a', bottomAccent: '#f4f4f4', shoe: '#f2f2f2', sole: '#c2c6cf', tie: '#1e3a8a', acc: '#d8dde4' }); break;
    case 'shirtTie': set({ top: '#eef3f8', topAccent: '#dce5ef', shirt: '#eef3f8', bottom: '#4b505c', bottomAccent: '#4b505c', shoe: '#2b2320', sole: '#1a1614', tie: '#8e2b33', sock: '#2b2b2b' }); break;
    case 'suit': set({ top: '#2c3446', topAccent: '#2c3446', shirt: '#f5f5f5', bottom: '#2c3446', bottomAccent: '#2c3446', shoe: '#1f1a17', sole: '#121010', tie: '#b8323a', sock: '#222' }); break;
    case 'casual': {
      const top = C(pick(r, ['#c9a77c', '#7c8f5a', '#a4524f', '#6a7fa8', '#d48fa0', '#8a6f9e']));
      p[SLOT.top] = top; p[SLOT.topAccent] = top.clone().multiplyScalar(0.8);
      set({ shirt: '#f1ece4', shoe: '#5a4232', sole: '#3a2a20', sock: '#3d3d44' });
      const b = C(look.bottom === 'skirt' ? pick(r, ['#5a4a6a', '#3d4a5c', '#7a5a48']) : pick(r, ['#3d4252', '#6b5a48', '#2f3b4f']));
      p[SLOT.bottom] = b; p[SLOT.bottomAccent] = b.clone().multiplyScalar(0.8);
      break;
    }
    case 'janitor': set({ top: '#6d8fa3', topAccent: '#56778a', shirt: '#dfe5e8', bottom: '#3b4250', bottomAccent: '#3b4250', shoe: '#2f4a3a', sole: '#1e2f25', acc: '#6d8fa3' }); break;
    default: set({ top: '#3565ba', topAccent: '#f4f6fa', shirt: '#f4f6fa', bottom: '#3565ba', bottomAccent: '#f4f6fa', shoe: '#f3f3f3', sole: '#c3c8d2', sock: '#f4f4f4' });
  }
  for (const [k, v] of Object.entries(over)) if (SLOT[k] != null) p[SLOT[k]] = parseColor(v, `#${p[SLOT[k]].getHexString()}`);
  return p;
}
