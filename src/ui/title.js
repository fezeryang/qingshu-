// Title screen (logo with a heart parabola, gender choice, start, gallery, settings, how-to) and the
// settings panel (shared with the pause menu).
import { h } from './dom.js';
import { HEART_D, ICON_BALL, ICON_TEACHER_BACK, ICON_BREATH } from './icons.js';

const ARC = 'M24 112Q200 -38 372 100';

export function createTitle(U, cards) {
  const { ctx } = U;
  let cur = null;

  const logo = () => h('div.qs-logo', {
    html: `<svg class="qs-logo-arc" viewBox="0 0 400 130" aria-hidden="true">
      <path class="dash" d="${ARC}"/><path class="trail" d="${ARC}" pathLength="100"/>
      <g transform="translate(356 82) scale(.5)"><path class="heart" d="${HEART_D}"/></g>
      <g class="ball"><circle r="8"/><path d="M-4 -3l3 3 4-2M-2 1l1 4"/>
        <animateMotion dur="2.8s" repeatCount="indefinite" path="${ARC}" keyPoints="0;1;1" keyTimes="0;.72;1" calcMode="linear"/></g>
    </svg>
    <h1 class="qs-logo-title"><span class="w1">情书</span><span class="w2">抛物线</span></h1>
    <div class="qs-logo-en">LOVE LETTER PARABOLA</div>`,
  });

  function title() {
    closeTitle();
    return new Promise((resolve) => {
      let gender = ctx.settings.playerGender === 'f' ? 'f' : 'm';
      const gm = U.button('我是男生', 'qs-gbtn qs-g-m', () => setG('m'));
      const gf = U.button('我是女生', 'qs-gbtn qs-g-f', () => setG('f'));
      const setG = (g) => {
        gender = g;
        gm.setAttribute('aria-pressed', String(g === 'm')); gf.setAttribute('aria-pressed', String(g === 'f'));
        ctx.settings.playerGender = g;
        U.saveSettings();
      };
      setG(gender);
      const unlocked = ctx.story?.gallery?.unlocked?.()?.length ?? 0;
      const total = ctx.story?.ENDINGS?.length ?? 13;
      const start = U.button('开始', 'qs-btn-start', () => {
        if (!cur) return;
        U.sfx('swoosh', { volume: 0.6 });
        closeTitle();
        resolve({ action: 'start', playerGender: gender });
      }, { sound: null });
      const card = h('div.qs-title-card.qs-paper.qs-i', {},
        h('span.qs-tape.qs-tape-l'), h('span.qs-tape.qs-tape-r'),
        logo(),
        h('div.qs-gender', { role: 'group' }, gm, gf),
        start,
        h('div.qs-title-links', {},
          U.button('结局图鉴', 'qs-link', () => cards.gallery(), { sound: 'pageFlip', extra: h('span.qs-badge', {}, `${unlocked}/${total}`) }),
          U.button('设置', 'qs-link', () => openSettings()),
          U.button('玩法说明', 'qs-link', () => openHowto())));
      const el = h('div.qs-screen.qs-title', { 'data-kind': 'title' }, card,
        h('div.qs-title-foot', {}, '下午三点，数学课。老师刚转过身去……'));
      U.L.screen.appendChild(el);
      cur = { el };
    });
  }
  function closeTitle() { cur?.el.remove(); cur = null; }

  // ---------------------------------------------------------------- settings
  function openSettings() {
    const s = ctx.settings;
    let lastPing = 0;
    const slider = (label, key, min, max, step, scale = 100) => {
      const out = h('output', {}, String(Math.round((s[key] ?? 1) * scale)));
      const input = h('input.qs-range.qs-i', { type: 'range', min, max, step, value: String(Math.round((s[key] ?? 1) * scale)), 'aria-label': label });
      input.addEventListener('input', () => {
        s[key] = +input.value / scale;
        out.textContent = input.value;
        U.saveSettings();
        if (key !== 'sensitivity' && U.now - lastPing > 0.15) { lastPing = U.now; U.sfx('pop', { volume: 0.5 }); }
      });
      return h('label.qs-set-row', {}, h('span.qs-set-label', {}, label), input, out);
    };
    // 语音: real speech / blips / off → ctx.settings.voiceMode (applied by ctx.audio.applySettings)
    const MODES = [['speech', '真人朗读'], ['blips', '哔哔声'], ['off', '关闭']];
    if (!MODES.some(([k]) => k === s.voiceMode)) s.voiceMode = 'speech';
    const seg = h('div.qs-seg', { role: 'group', 'aria-label': '语音' });
    const segBtns = MODES.map(([k, label]) => {
      const b = U.button(label, 'qs-seg-btn', () => {
        s.voiceMode = k;
        for (const x of segBtns) x.setAttribute('aria-pressed', String(x === b));
        U.saveSettings();
        if (k !== 'off') { try { ctx.audio?.voiceLine?.(k === 'speech' ? '你好，这是语音试听。' : '你好！', { pitch: 1 }, { charId: null }); } catch { /* preview only */ } }
      });
      b.setAttribute('aria-pressed', String(s.voiceMode === k));
      seg.appendChild(b);
      return b;
    });
    const q = ctx.audio?.voiceQuality;
    const voiceNote = q === 'legacy' || q === 'none' ? h('div.qs-set-note', {}, '推荐使用 Edge 浏览器以获得最自然的语音') : null;
    const voiceRow = h('div.qs-set-row.qs-set-voice', {}, h('span.qs-set-label', {}, '语音'), seg);
    const calm = h('input.qs-check.qs-i', { type: 'checkbox', 'aria-label': '减少晃动' });
    calm.checked = !!s.reducedMotion;
    calm.addEventListener('change', () => { s.reducedMotion = calm.checked; U.saveSettings(); });
    const panel = h('div.qs-panel.qs-settings.qs-sticky.qs-i', {},
      h('span.qs-tape'),
      h('h2', {}, '设置'),
      slider('主音量', 'masterVolume', 0, 100, 1),
      slider('音乐', 'musicVolume', 0, 100, 1),
      slider('音效', 'sfxVolume', 0, 100, 1),
      voiceRow,
      voiceNote,
      slider('视角灵敏度', 'sensitivity', 50, 200, 5),
      h('label.qs-set-row.qs-set-check', {}, h('span.qs-set-label', {}, '减少晃动'), calm, h('i.qs-check-box')),
      h('div.qs-panel-foot', {}, U.button('完成', '', () => entry.close())));
    const entry = U.modal(panel);
    entry.el.dataset.kind = 'settings';
    return entry;
  }

  // ---------------------------------------------------------------- how to play
  function openHowto() {
    const row = (icon, html) => h('div.qs-howto-row', {}, h('div.qs-howto-ico', { html: icon }), h('div.qs-howto-txt', { html }));
    const panel = h('div.qs-panel.qs-howto.qs-sticky.qs-i', {},
      h('span.qs-tape'),
      h('h2', {}, '玩法说明'),
      row(ICON_BALL, '选好情书，<b>按住鼠标</b>把它揉成纸团'),
      row(ICON_TEACHER_BACK, '老师背过身时 <kbd>按住左键</kbd> 蓄力、松开扔出；<br>他要回头了？<kbd>右键</kbd>/<kbd>空格</kbd> 装认真'),
      row(ICON_BREATH, '纸团在空中时 <kbd>按住空格</kbd> 屏息慢动作，<kbd>A</kbd>/<kbd>D</kbd> 用意念微调'),
      h('p.qs-howto-end', {}, '落在谁的桌上，故事就怎么写。'),
      h('div.qs-panel-foot', {}, U.button('知道了', '', () => entry.close())));
    const entry = U.modal(panel);
    entry.el.dataset.kind = 'howto';
    return entry;
  }

  U.onClose(() => closeTitle());
  return { title, openSettings, openHowto };
}
