// Comic emote symbols drawn once per kind onto small canvases (shared textures).
import * as THREE from 'three';
import { heartPath } from './face.js';

export const EMOTES = ['!', '?', 'heart', 'hearts', 'sweat', 'anger', 'zzz', 'sparkle', 'blush', 'question', 'music', 'dots', 'skull'];
const cache = new Map();
const S = 128;

export function emoteTexture(kind) {
  if (kind === 'question') kind = '?';
  if (!EMOTES.includes(kind)) kind = '!';
  if (cache.has(kind)) return cache.get(kind);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  const text = (str, color, size, x = S / 2, y = S / 2 + 4, rot = 0) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.font = `900 ${size}px "Arial Black", "Helvetica Neue", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = size * 0.16; g.strokeStyle = '#ffffff'; g.strokeText(str, 0, 0);
    g.lineWidth = size * 0.06; g.strokeStyle = '#3a2020'; g.strokeText(str, 0, 0);
    g.fillStyle = color; g.fillText(str, 0, 0);
    g.restore();
  };
  const heart = (x, y, sc, col = '#ff4a78') => {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    heartPath(g); g.fillStyle = col; g.fill(); g.lineWidth = 3 / sc * 1.2; g.strokeStyle = '#ffffff'; g.stroke();
    g.lineWidth = 1.6 / sc; g.strokeStyle = '#7a1a30'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-7, -6, 3.5, 2.4, -0.6, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  const drop = (x, y, r) => {
    g.save(); g.translate(x, y);
    g.beginPath(); g.moveTo(0, -r * 1.9); g.quadraticCurveTo(r * 1.15, -r * 0.2, r, r * 0.45); g.arc(0, r * 0.45, r, 0, Math.PI); g.quadraticCurveTo(-r * 1.15, -r * 0.2, 0, -r * 1.9); g.closePath();
    g.fillStyle = '#9fd6ff'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.stroke(); g.lineWidth = 2.2; g.strokeStyle = '#2f6fb3'; g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-r * 0.35, r * 0.2, r * 0.2, r * 0.38, 0.3, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  switch (kind) {
    case '!': text('!', '#ff3b3b', 104, S / 2, S / 2 + 6); break;
    case '?': text('?', '#3b8bff', 100, S / 2, S / 2 + 6, 0.12); break;
    case 'heart': heart(S / 2, S / 2, 3.3); break;
    case 'hearts': heart(S * 0.35, S * 0.6, 1.9); heart(S * 0.68, S * 0.42, 1.5, '#ff7aa2'); heart(S * 0.5, S * 0.18, 1.0, '#ff9fbe'); break;
    case 'sweat': drop(S * 0.55, S * 0.55, 26); break;
    case 'anger': {
      g.strokeStyle = '#ffffff'; g.lineWidth = 16;
      const vein = () => { for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; const ox = Math.cos(a) * 26, oy = Math.sin(a) * 26; g.beginPath(); g.moveTo(S / 2 + ox + Math.cos(a + 1.25) * 22, S / 2 + oy + Math.sin(a + 1.25) * 22); g.quadraticCurveTo(S / 2 + ox * 0.35, S / 2 + oy * 0.35, S / 2 + ox + Math.cos(a - 1.25) * 22, S / 2 + oy + Math.sin(a - 1.25) * 22); g.stroke(); } };
      vein(); g.strokeStyle = '#e8303c'; g.lineWidth = 9; vein();
      break;
    }
    case 'zzz': text('Z', '#6a7cff', 58, S * 0.32, S * 0.68, -0.2); text('z', '#8a9aff', 44, S * 0.6, S * 0.42, -0.15); text('z', '#aab6ff', 32, S * 0.8, S * 0.2, -0.1); break;
    case 'sparkle': {
      const star = (x, y, r, col) => { g.save(); g.translate(x, y); g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2; const rr = i % 2 ? r * 0.28 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fillStyle = col; g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke(); g.fill(); g.restore(); };
      star(S * 0.45, S * 0.55, 34, '#ffd84a'); star(S * 0.78, S * 0.28, 18, '#fff3a0'); star(S * 0.2, S * 0.22, 13, '#ffe680');
      break;
    }
    case 'blush': {
      g.fillStyle = 'rgba(255,120,150,0.9)';
      g.beginPath(); g.ellipse(S / 2, S / 2, 46, 26, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.stroke();
      g.strokeStyle = '#d8345a'; g.lineWidth = 5;
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(S / 2 + i * 22 - 8, S / 2 + 12); g.lineTo(S / 2 + i * 22 + 8, S / 2 - 12); g.stroke(); }
      break;
    }
    case 'music': text('♪', '#ff6fa8', 76, S * 0.35, S * 0.6, -0.15); text('♫', '#5aa8ff', 56, S * 0.72, S * 0.36, 0.15); break;
    case 'dots': {
      g.fillStyle = '#ffffff'; g.strokeStyle = '#3a2a2a'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(S / 2, S / 2, 56, 34, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#3a2a2a';
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(S / 2 + i * 22, S / 2, 7, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'skull': {
      g.fillStyle = 'rgba(160,160,190,0.5)'; g.beginPath(); g.ellipse(S / 2, S / 2 + 4, 56, 50, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.strokeStyle = '#2a2a33'; g.lineWidth = 4;
      g.beginPath(); g.arc(S / 2, S / 2 - 6, 32, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(S / 2 + 18, S / 2 + 34); g.lineTo(S / 2 - 18, S / 2 + 34); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#2a2a33';
      g.beginPath(); g.ellipse(S / 2 - 13, S / 2 - 4, 9, 10, 0, 0, Math.PI * 2); g.ellipse(S / 2 + 13, S / 2 - 4, 9, 10, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(S / 2, S / 2 + 8); g.lineTo(S / 2 - 5, S / 2 + 16); g.lineTo(S / 2 + 5, S / 2 + 16); g.closePath(); g.fill();
      g.lineWidth = 2.5; for (const ox of [-8, 0, 8]) { g.beginPath(); g.moveTo(S / 2 + ox, S / 2 + 24); g.lineTo(S / 2 + ox, S / 2 + 33); g.stroke(); }
      break;
    }
    default: break;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(kind, tex);
  return tex;
}
