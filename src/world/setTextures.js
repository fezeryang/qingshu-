// Canvas textures for the ending sets (owner: env-artist). Built lazily with their set.
import { drawTexture, rngFor, FONT_HEI, FONT_KAI } from './kit.js';

/** Square floor tiles with grout. */
export function tileTexture(base = '#c9c2b6', alt = '#bfb8ab', grout = '#8f887c', n = 4, label = 'tiles') {
  return drawTexture(512, 512, (g) => {
    const r = rngFor(label), s = 512 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? base : alt; g.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${r.range(0.02, 0.06).toFixed(3)})`; g.fillRect(i * s + r.range(0, s), j * s + r.range(0, s), r.range(1, 4), r.range(1, 4)); }
    }
    g.strokeStyle = grout; g.lineWidth = 4;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 512); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(512, i * s); g.stroke(); }
  }, { repeat: true, anisotropy: 8 });
}

/** City skyline silhouette strip (transparent), with lit windows. */
export function skylineTexture(color = '#3a3358', lit = '#ffd27a', label = 'skyline', density = 1) {
  return drawTexture(1024, 256, (g) => {
    const r = rngFor(label);
    let x = 0;
    while (x < 1024) {
      const w = r.range(24, 70), h = r.range(50, 210) * density;
      g.fillStyle = color; g.fillRect(x, 256 - h, w, h);
      if (r.chance(0.25)) g.fillRect(x + w / 2 - 1, 256 - h - r.range(10, 30), 2, 30);
      if (r.chance(0.2)) { g.beginPath(); g.moveTo(x, 256 - h); g.lineTo(x + w / 2, 256 - h - 16); g.lineTo(x + w, 256 - h); g.fill(); }
      g.fillStyle = lit;
      for (let yy = 256 - h + 8; yy < 250; yy += 9) for (let xx = x + 4; xx < x + w - 4; xx += 7) if (r.chance(0.16)) g.fillRect(xx, yy, 3, 4);
      x += w + r.range(-6, 4);
    }
  });
}

/** Running track oval + football pitch, 1024×512 covering 100 m × 50 m. */
export function trackTexture() {
  return drawTexture(1024, 512, (g, W, H) => {
    g.fillStyle = '#7fb35a'; g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, straight = 400, R0 = 150, lanes = 6, lw = 9;
    const oval = (rad) => { g.beginPath(); g.arc(cx - straight / 2, cy, rad, Math.PI / 2, Math.PI * 1.5); g.lineTo(cx + straight / 2, cy - rad); g.arc(cx + straight / 2, cy, rad, -Math.PI / 2, Math.PI / 2); g.closePath(); };
    g.fillStyle = '#c8583e'; oval(R0 + lanes * lw + 6); g.fill();
    g.fillStyle = '#6fae4c'; oval(R0); g.fill();
    for (let i = 0; i < 11; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'; g.fillRect(cx - straight / 2 - 120 + i * 58, cy - R0 + 10, 58, R0 * 2 - 20); }
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
    for (let i = 0; i <= lanes; i++) { oval(R0 + i * lw); g.stroke(); }
    g.lineWidth = 3;
    g.strokeRect(cx - 230, cy - 120, 460, 240);
    g.beginPath(); g.moveTo(cx, cy - 120); g.lineTo(cx, cy + 120); g.stroke();
    g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.stroke();
    g.strokeRect(cx - 230, cy - 55, 60, 110); g.strokeRect(cx + 170, cy - 55, 60, 110);
  }, { anisotropy: 8 });
}

/** Half basketball court, 1024×512 covering 15 m (x) × 14 m (z); hoop at the top edge. */
export function courtTexture() {
  return drawTexture(1024, 1024, (g, W, H) => {
    g.fillStyle = '#3f8a6a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#c8583e'; g.fillRect(40, 40, W - 80, H - 80);
    const r = rngFor('court');
    for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(0,0,0,${r.range(0.02, 0.05).toFixed(3)})`; g.fillRect(r.range(0, W), r.range(0, H), r.range(2, 8), r.range(2, 8)); }
    const sx = (W - 80) / 15, cx = W / 2, hy = 40 + 1.575 * sx;
    g.strokeStyle = '#ffffff'; g.lineWidth = 6;
    g.strokeRect(40, 40, W - 80, H - 80);
    g.fillStyle = '#d97a4a'; g.fillRect(cx - 2.45 * sx, 40, 4.9 * sx, 5.8 * sx);
    g.strokeRect(cx - 2.45 * sx, 40, 4.9 * sx, 5.8 * sx);
    g.beginPath(); g.arc(cx, 40 + 5.8 * sx, 1.8 * sx, 0, Math.PI); g.stroke();
    g.beginPath(); g.moveTo(cx - 6.6 * sx, 40); g.lineTo(cx - 6.6 * sx, hy); g.arc(cx, hy, 6.75 * sx, Math.PI - 0.2, 0.2, true); g.lineTo(cx + 6.6 * sx, 40); g.stroke();
    g.beginPath(); g.arc(cx, H - 40, 1.8 * sx, Math.PI, 0); g.stroke();
  }, { anisotropy: 8 });
}

/** Canteen menu board. */
export function menuTexture() {
  return drawTexture(1024, 256, (g, W, H) => {
    g.fillStyle = '#2f3a34'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffd34d'; g.font = `bold 48px ${FONT_HEI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('今 日 菜 单', W / 2, 42);
    const items = [['红烧肉', '8元'], ['番茄炒蛋', '4元'], ['麻婆豆腐', '4元'], ['糖醋排骨', '9元'], ['清炒时蔬', '3元'], ['紫菜蛋汤', '免费']];
    g.font = `30px ${FONT_HEI}`;
    items.forEach(([a, b], i) => {
      const x = 110 + (i % 3) * 300, y = 120 + Math.floor(i / 3) * 70;
      g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.fillText(a, x, y);
      g.fillStyle = '#ff9f7a'; g.textAlign = 'right'; g.fillText(b, x + 230, y);
    });
  });
}

/** Office wall: calligraphy 为人师表 (horizontal). */
export function calligraphyTexture(textStr = '为人师表') {
  return drawTexture(512, 160, (g, W, H) => {
    g.fillStyle = '#f6eed8'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#7b5a3a'; g.lineWidth = 12; g.strokeRect(6, 6, W - 12, H - 12);
    g.fillStyle = '#1e1a16'; g.font = `bold 96px ${FONT_KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...textStr].forEach((ch, i) => g.fillText(ch, 80 + i * 118, H / 2 + 4));
    g.fillStyle = '#c8322d'; g.fillRect(W - 46, H - 50, 22, 22);
  });
}

/** Monitor screen / paper sheet (exam paper with red marks). */
export function paperTexture() {
  return drawTexture(256, 256, (g) => {
    g.fillStyle = '#fbf9f2'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#333'; g.font = `bold 18px ${FONT_HEI}`; g.textAlign = 'center'; g.fillText('高二数学 期中测试', 128, 26);
    g.fillStyle = 'rgba(60,60,70,0.55)';
    for (let i = 0; i < 12; i++) g.fillRect(20, 46 + i * 16, 120 + ((i * 37) % 90), 3);
    g.strokeStyle = '#d62f2f'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(190, 70); g.lineTo(204, 86); g.lineTo(232, 50); g.stroke();
    g.fillStyle = '#d62f2f'; g.font = `bold 40px ${FONT_KAI}`; g.fillText('59', 210, 230);
  });
}
