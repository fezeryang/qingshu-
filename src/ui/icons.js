// Hand-drawn doodle icons (inline SVG strings). Marker outline + highlighter fills, 64×64 viewBox.
// Owner: ui-designer. No emoji: headless/Linux browsers often lack an emoji font.

const INK = '#2a3350';
const open = (extra = '') => `<svg class="qs-ico" viewBox="0 0 64 64" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>`;
export const HEART_D = 'M32 54C12 40 6 28 10 19C14 10 26 9 32 19C38 9 50 10 54 19C58 28 52 40 32 54Z';
const heart = (x, y, s, fill = '#ff7aa8', sw = 2.6) => `<path transform="translate(${x} ${y}) scale(${s})" d="${HEART_D}" fill="${fill}" stroke-width="${sw / s}"/>`;
const sparkle = (x, y, r = 4, c = '#f7c948') => `<path d="M${x} ${y - r}L${x + r * 0.3} ${y - r * 0.3}L${x + r} ${y}L${x + r * 0.3} ${y + r * 0.3}L${x} ${y + r}L${x - r * 0.3} ${y + r * 0.3}L${x - r} ${y}L${x - r * 0.3} ${y - r * 0.3}Z" fill="${c}" stroke-width="1.4"/>`;

export const ENDING_ICONS = {
  perfect: open() + `<circle cx="32" cy="44" r="19" fill="#ffb15c" stroke="none"/><path d="M4 44H60"/><path d="M9 44V55M20 44V55M32 44V55M44 44V55M55 44V55M5 55H59"/>` + heart(17, 4, 0.47) + sparkle(52, 12) + '</svg>',
  same_gender: open() + `<circle cx="32" cy="40" r="15" stroke="#d99a1c" stroke-width="5"/><circle cx="32" cy="40" r="15" stroke-width="1.6"/><path d="M25 21L32 12L39 21L32 28Z" fill="#a9dcff"/>` + sparkle(50, 14) + sparkle(13, 18, 3) + '</svg>',
  wrong_caught: open() + `<path d="M15 34a10 10 0 0 1 4-19a13 13 0 0 1 24 2a9 9 0 0 1 5 17Z" fill="#b9c3d6"/><path d="M20 42l-3 7M30 42l-3 7M44 42l-3 7M25 52l-2 5M39 52l-2 5" stroke="#5b8fd6"/><path d="M36 36l-5 9h7l-5 10" stroke="#e0a526" stroke-width="3"/>` + '</svg>',
  wrong_accept: open() + heart(2, 4, 0.94) + `<path d="M26 26q0-7 7-7q7 0 7 6q0 5-6 7v4" stroke="#fff" stroke-width="4"/><circle cx="34" cy="44" r="1.8" fill="#fff" stroke="#fff"/>` + '</svg>',
  caught_read: open() + `<rect x="23" y="8" width="18" height="27" rx="9" fill="#c9d1e0"/><path d="M27 15h10M27 21h10M27 27h10" stroke-width="1.6"/><path d="M17 28a15 15 0 0 0 30 0"/><path d="M32 43V53M23 53H41"/><path d="M52 12q4 6 0 9q-4-3 0-9Z" fill="#a9dcff" stroke-width="1.8"/><path d="M9 14q-3 5 0 10M5 11q-5 8 0 16" stroke-width="2"/>` + '</svg>',
  chalk_counter: open() + `<path d="M6 40h10M4 32h12M8 48h9" stroke-width="2"/><rect x="18" y="29" width="25" height="9" rx="2" transform="rotate(-22 30 33)" fill="#fffdf5"/><path d="M46 8l3 9 9 1-7 6 3 9-8-5-8 5 3-9-7-6 9-1Z" fill="#f7c948" stroke-width="2"/>` + '</svg>',
  graded: open() + `<path d="M13 7h31l7 7v43H13Z" fill="#fffdf5"/><path d="M44 7v7h7"/><path d="M19 18h22M19 25h26M19 32h14" stroke="#c9dcf0" stroke-width="2"/><text x="31" y="52" text-anchor="middle" font-size="19" font-weight="900" fill="#e23b3b" stroke="none" font-family="sans-serif">59</text><ellipse cx="31" cy="46" rx="15" ry="10" stroke="#e23b3b" stroke-width="2.2" transform="rotate(-8 31 46)"/>` + '</svg>',
  three_pointer: open() + `<path d="M36 14H60" stroke-width="3.4" stroke="#e8505b"/><path d="M39 14l3 13h12l3-13M44 14l1 13M50 14l-1 13" stroke-width="1.6"/><path d="M8 50Q14 10 40 18" stroke-dasharray="3 5" stroke-width="2"/><circle cx="17" cy="46" r="12" fill="#f08a24"/><path d="M5 46h24M17 34v24M9 37q6 9 0 18M25 37q-6 9 0 18" stroke-width="1.8"/>` + '</svg>',
  out_window: open() + `<path d="M8 26h9l16-11v34L17 38H8Z" fill="#d9dee8"/><path d="M40 24q5 8 0 16M46 19q9 13 0 26M52 14q13 18 0 36" stroke-width="2.4"/>` + sparkle(56, 50, 3) + '</svg>',
  confetti: open() + heart(4, 6, 0.36) + heart(34, 2, 0.28, '#ffb3d1') + heart(22, 30, 0.42) + heart(44, 34, 0.26, '#ffb3d1') + `<path d="M50 20v12M44 26h12M46 22l8 8M54 22l-8 8" stroke="#7fb8e8" stroke-width="2"/>` + '</svg>',
  self_love: open() + `<path d="M12 22a22 22 0 1 0 8-9" stroke="#2f9e6e" stroke-width="3"/><path d="M14 7l6 6-8 3" stroke="#2f9e6e" stroke-width="3"/>` + heart(16, 15, 0.5) + '</svg>',
  lost: open() + `<path d="M4 42q7-6 14 0t14 0t14 0t14 0" stroke="#5b8fd6" stroke-width="3"/><path d="M4 52q7-6 14 0t14 0t14 0t14 0" stroke="#5b8fd6" stroke-width="2.4"/><path d="M24 40a8 8 0 0 1 16 0" fill="#fffdf5"/><path d="M28 36l4 2 3-3" stroke-width="1.6"/><circle cx="40" cy="24" r="2.6"/><circle cx="46" cy="15" r="3.4"/><circle cx="38" cy="8" r="2"/><path d="M14 8a8 8 0 1 0 9 11a6.5 6.5 0 1 1-9-11Z" fill="#f7e27a" stroke-width="1.8"/>` + '</svg>',
  coward: open() + `<path d="M19 42q0-24 13-26q13 2 13 26Z" fill="#ffd36b"/><path d="M15 42H49"/><circle cx="32" cy="47" r="3.4" fill="${INK}"/><path d="M32 16v-5"/><path d="M8 24q-3 6 0 12M56 24q3 6 0 12" stroke-width="2"/><path d="M52 8q4 6 0 9q-4-3 0-9Z" fill="#a9dcff" stroke-width="1.8"/>` + '</svg>',
};
export const ICON_LETTER = open() + `<rect x="7" y="16" width="50" height="34" rx="3" fill="#fffdf5"/><path d="M7 17l25 19 25-19"/>` + heart(23, 26, 0.28, '#e8505b') + '</svg>';
export const ICON_LOCK = open('stroke="#9aa0ad"') + `<rect x="16" y="28" width="32" height="24" rx="4" fill="#e9e6dc"/><path d="M22 28v-7a10 10 0 0 1 20 0v7"/><circle cx="32" cy="39" r="3" fill="#9aa0ad"/><path d="M32 42v4"/>` + '</svg>';

export const ICON_CHALKBOARD = open() + `<rect x="5" y="12" width="54" height="36" rx="4" fill="#2f5e48" stroke="#6b4423" stroke-width="3"/><path d="M12 25q5-6 9 0t9 0t9 0" stroke="#fffdf5" stroke-width="2.2"/><path d="M12 35h18" stroke="#fffdf5" stroke-width="2.2"/><rect x="38" y="40" width="12" height="4" rx="1.5" fill="#fffdf5" stroke="#fffdf5" stroke-width="1"/>` + '</svg>';
export const ICON_CLOCK = open() + `<path d="M12 20a8 8 0 0 1 12-9M52 20a8 8 0 0 0-12-9" stroke-width="4"/><circle cx="32" cy="36" r="19" fill="#fffdf5"/><path d="M32 24v12l8 5"/><path d="M20 55l-4 5M44 55l4 5"/>` + '</svg>';
export const ICON_BOOK = open() + `<path d="M6 18q13-6 26 2q13-8 26-2v32q-13-6-26 2q-13-8-26-2Z" fill="#fffdf5"/><path d="M32 20v32"/><path d="M12 26q7-2 14 1M12 33q7-2 14 1M38 27q7-3 14-1M38 34q7-3 14-1" stroke="#c9dcf0" stroke-width="2"/>` + '</svg>';
export const ICON_BREATH = open() + `<path d="M8 26h30a8 8 0 1 0-8-8M8 36h40a8 8 0 1 1-8 8M8 46h18" stroke="#2e7dd1" stroke-width="3.4"/>` + '</svg>';
export const ICON_MOUSE = open() + `<rect x="17" y="8" width="30" height="48" rx="15" fill="#fffdf5"/><path d="M32 8v18M17 26h30"/><path d="M18 24V22a14 14 0 0 1 13-14v18Z" fill="#ff7aa8" stroke="none"/>` + '</svg>';
export const ICON_BALL = open() + `<path d="M32 9l12 4 9 10 2 13-6 12-12 7-13-1-10-9-4-12 4-13 9-8Z" fill="#fffdf5"/><path d="M20 22l9 6 4 10-8 7M33 38l11-3 6 6M29 28l9-9M44 35l3-12" stroke="#9aa6bd" stroke-width="1.8"/>` + '</svg>';
export const ICON_TEACHER_BACK = open() + `<rect x="4" y="8" width="56" height="24" rx="3" fill="#2f5e48" stroke="#6b4423" stroke-width="2.4"/><path d="M12 18q4-4 8 0t8 0" stroke="#fffdf5" stroke-width="1.8"/><circle cx="32" cy="38" r="8" fill="#3b3b44"/><path d="M20 62q0-14 12-14t12 14" fill="#5a7bb5"/>` + '</svg>';

/** Crumpled paper ball, bigger and more detailed (crumple finale, letter flying away). */
export const BALL_SVG = `<svg viewBox="0 0 100 100" class="qs-ball-svg" aria-hidden="true"><defs><radialGradient id="qsBallG" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fffef8"/><stop offset=".65" stop-color="#efe9d6"/><stop offset="1" stop-color="#c9c0a6"/></radialGradient></defs>
<path d="M50 6l18 6 15 13 9 17-2 19-10 16-17 12-19 2-17-8-13-15-5-19 5-19 12-15Z" fill="url(#qsBallG)" stroke="#6e6a5c" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M30 24l14 12 6 18-12 14M50 54l18-6 14 6M44 36l16-14M62 48l4-20M24 50l14 4M50 54l4 22M38 68l-12 6" fill="none" stroke="#a69f88" stroke-width="2" stroke-linecap="round"/>
<path d="M44 36l6 18 12-6" fill="#ffffff" opacity=".55"/><path d="M50 54l-12 14 16 8Z" fill="#b8b098" opacity=".45"/></svg>`;

export const STATE_GLYPH = { // tiny label under the suspicion sticker
  writing: { text: '安全', cls: 'safe' },
  idle: { text: '', cls: '' },
  drinking: { text: '喝茶中', cls: 'safe' },
  warning: { text: '要回头了', cls: 'warn' },
  fakeout: { text: '……？', cls: 'warn' },
  watching: { text: '在看', cls: 'watch' },
  patrol: { text: '巡视中', cls: 'watch' },
  suspicious: { text: '盯上你了', cls: 'danger' },
  alert: { text: '盯上你了', cls: 'danger' },
  cutscene: { text: '', cls: '' },
};
