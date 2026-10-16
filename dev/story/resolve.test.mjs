// Unit test for story/resolve() — the GDD §7 ending priority table.
//   node dev/story/resolve.test.mjs
import assert from 'node:assert/strict';
import { resolve, ENDINGS, ENDING_IDS } from '../../src/story/endings.js';
import { makeRoster, STUDENTS, TEACHER, NPCS, SNITCH_TRAITS } from '../../src/story/roster.js';
import { LETTERS } from '../../src/story/letters.js';
import { createRng } from '../../src/core/rng.js';
import { SEATS, PLAYER_SEAT } from '../../src/core/layout.js';

let passed = 0;
const fails = [];
const test = (name, fn) => { try { fn(); passed++; } catch (e) { fails.push(`✗ ${name}\n    ${e.message.split('\n').join('\n    ')}`); } };

// ---------- fixtures ----------
// player 'm'; crush = su_nian (f, shy). Seats chosen by hand.
const seatMap = {
  r0c0: 'su_nian',       // crush (f)
  r0c1: 'xu_ruoqing',    // f, normal  → wrong_accept
  r1c0: 'lin_xiaoyu',    // f, monitor → wrong_caught (snitch)
  r1c1: 'yan_zheng',     // m, disciplinarian (same gender as player m)
  r2c2: 'wang_dazhuang', // m, foodie → same_gender
  r2c3: null,            // empty seat
};
const roster = makeRoster(createRng(1), 'm', { crushId: 'su_nian', seatMap });
const base = (over = {}) => ({
  launched: true, caughtDuring: null, teacherSawBall: false, crushId: 'su_nian', playerGender: 'm', roster, landing: null, ...over,
});
const land = (type, extra = {}) => ({ type, seatId: null, ownerId: null, pos: { x: 0, y: 0, z: 0 }, hits: [], flightTime: 1, bounces: 0, ...extra });
const desk = (seatId, extra = {}) => land('desk', { seatId, ownerId: roster.seatMap[seatId], ...extra });

// ---------- roster ----------
test('roster: 23 students, about half girls', () => {
  assert.equal(STUDENTS.length, 23);
  const f = STUDENTS.filter((s) => s.gender === 'f').length;
  assert.ok(f >= 11 && f <= 12, `girls = ${f}`);
});
test('roster: unique ids and names, every trait for both genders (snitch split)', () => {
  assert.equal(new Set(STUDENTS.map((s) => s.id)).size, 23);
  assert.equal(new Set(STUDENTS.map((s) => s.name)).size, 23);
  for (const t of ['nerd', 'sleeper', 'foodie', 'gossip', 'jock', 'artsy', 'chuuni', 'shy', 'clown', 'gamer']) {
    for (const g of ['m', 'f']) assert.ok(STUDENTS.some((s) => s.trait === t && s.gender === g), `${t}/${g}`);
  }
  assert.ok(STUDENTS.some((s) => SNITCH_TRAITS.includes(s.trait) && s.gender === 'm'));
  assert.ok(STUDENTS.some((s) => SNITCH_TRAITS.includes(s.trait) && s.gender === 'f'));
});
test('roster: looks are valid and pairwise distinct', () => {
  const HAIR = ['short', 'buzz', 'messy', 'sidepart', 'curtain', 'bob', 'ponytail', 'twintails', 'long', 'bun', 'braid', 'combover', 'bald'];
  const ACC = ['none', 'hairclip', 'headband', 'bandaid', 'earbuds', 'freckles', 'mole'];
  const OUT = ['uniform', 'shirtTie', 'suit', 'tracksuit', 'casual', 'janitor'];
  const all = [...STUDENTS, TEACHER, ...Object.values(NPCS)];
  for (const s of all) {
    const L = s.look;
    assert.ok(HAIR.includes(L.hairStyle), `${s.id} hairStyle ${L.hairStyle}`);
    assert.ok(ACC.includes(L.accessory), `${s.id} accessory`);
    assert.ok(OUT.includes(L.outfit), `${s.id} outfit`);
    assert.ok(['slim', 'normal', 'sturdy'].includes(L.build), `${s.id} build`);
    assert.ok(L.height >= 0.92 && L.height <= 1.08, `${s.id} height`);
    assert.match(L.skin, /^#[0-9a-f]{6}$/i); assert.match(L.hairColor, /^#[0-9a-f]{6}$/i);
    assert.ok(s.voice.pitch >= 0.5 && s.voice.pitch <= 2, `${s.id} pitch`);
    assert.ok(typeof s.bio === 'string' && s.bio.length > 4);
  }
  const key = (s) => [s.gender, s.look.hairStyle, s.look.hairColor, s.look.accessory, s.look.glasses, s.look.build].join('|');
  assert.equal(new Set(STUDENTS.map(key)).size, 23, 'two students share an identical look');
  assert.equal(TEACHER.name, '王老师'); assert.equal(TEACHER.look.hairStyle, 'combover'); assert.equal(TEACHER.look.glasses, true); assert.equal(TEACHER.look.outfit, 'shirtTie');
});
test('makeRoster: player seat empty, 6 empty seats, deterministic per seed, crush opposite gender', () => {
  for (const pg of ['m', 'f']) {
    for (let seed = 1; seed <= 40; seed++) {
      const a = makeRoster(createRng(seed), pg);
      const b = makeRoster(createRng(seed), pg);
      assert.deepEqual(a.seatMap, b.seatMap);
      assert.equal(a.crushId, b.crushId);
      assert.equal(a.seatMap[PLAYER_SEAT], null);
      assert.equal(Object.values(a.seatMap).filter(Boolean).length, 23);
      assert.equal(SEATS.length - 1 - 23, 6);
      const crush = a.students.find((s) => s.id === a.crushId);
      assert.notEqual(crush.gender, pg);
      assert.ok(Object.values(a.seatMap).includes(a.crushId));
      assert.equal(a.playerSeatId, PLAYER_SEAT);
      assert.equal(a.teacher.id, 'teacher');
    }
  }
  const seats = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(makeRoster(createRng(i), 'm').seatMap)));
  assert.ok(seats.size > 25, 'seat maps should vary per seed');
});
test('makeRoster: opts.crushId / opts.seatMap override (partial map, explicit empty seats)', () => {
  assert.equal(roster.crushId, 'su_nian');
  for (const [k, v] of Object.entries(seatMap)) assert.equal(roster.seatMap[k], v);
  assert.equal(Object.values(roster.seatMap).filter(Boolean).length, 23);
  const r2 = makeRoster(createRng(5), 'f', { crushId: 'xia_mo' }); // same-gender crush allowed for tests
  assert.equal(r2.crushId, 'xia_mo');
  const r3 = makeRoster(createRng(5), 'f', { crushId: 'nobody' });
  assert.equal(r3.students.find((s) => s.id === r3.crushId).gender, 'm');
  const r4 = makeRoster(createRng(5), 'm', { seatMap: { [PLAYER_SEAT]: 'su_nian' } });
  assert.equal(r4.seatMap[PLAYER_SEAT], null, 'player seat can never be taken');
});
test('letters: ≥ 4 presets, ≤ 60 chars, unique ids', () => {
  assert.ok(LETTERS.length >= 4);
  assert.equal(new Set(LETTERS.map((l) => l.id)).size, LETTERS.length);
  for (const l of LETTERS) assert.ok([...l.text].length <= 60, `${l.id} has ${[...l.text].length} chars`);
});
test('ENDINGS: 13 with full metadata', () => {
  assert.equal(ENDINGS.length, 13);
  for (const e of ENDINGS) {
    for (const k of ['id', 'title', 'subtitle', 'rarity', 'hint', 'icon', 'color']) assert.ok(e[k], `${e.id}.${k}`);
    assert.ok(['common', 'rare', 'secret'].includes(e.rarity));
  }
  assert.deepEqual([...ENDING_IDS].sort(), ['caught_read', 'chalk_counter', 'confetti', 'coward', 'graded', 'lost', 'out_window', 'perfect', 'same_gender', 'self_love', 'three_pointer', 'wrong_accept', 'wrong_caught']);
});

// ---------- resolve(): one case per row, plus priority edges ----------
const cases = [
  // [name, round, expected]
  ['coward: bell rang, never threw', base({ launched: false }), 'coward'],
  ['coward: no landing data at all', { launched: false }, 'coward'],
  ['caught_read: suspicion maxed during aim', base({ launched: false, caughtDuring: 'aim' }), 'caught_read'],
  ['caught_read: aim-catch wins even if a launch slipped through', base({ caughtDuring: 'aim', landing: land('trash') }), 'caught_read'],
  ['caught_read: seen + crush desk', base({ teacherSawBall: true, caughtDuring: 'flight', landing: desk('r0c0') }), 'caught_read'],
  ['caught_read: seen + crush chair', base({ teacherSawBall: true, landing: land('chair', { seatId: 'r0c0', ownerId: 'su_nian' }) }), 'caught_read'],
  ['caught_read: seen + same-gender classmate', base({ teacherSawBall: true, landing: desk('r2c2') }), 'caught_read'],
  ['caught_read: seen + same-gender snitch', base({ teacherSawBall: true, landing: desk('r1c1') }), 'caught_read'],
  ['caught_read: seen + floor', base({ teacherSawBall: true, landing: land('floor') }), 'caught_read'],
  ['caught_read: seen + empty desk counts as floor', base({ teacherSawBall: true, landing: land('desk', { seatId: 'r2c3', ownerId: null }) }), 'caught_read'],
  ['caught_read: seen + timeout counts as floor', base({ teacherSawBall: true, landing: land('timeout') }), 'caught_read'],
  ['caught_read: caughtDuring flight implies seen', base({ caughtDuring: 'flight', landing: land('floor') }), 'caught_read'],
  ['chalk_counter: landing type teacher', base({ landing: land('teacher', { ownerId: 'teacher' }) }), 'chalk_counter'],
  ['chalk_counter: bounced off the teacher onto the podium', base({ landing: land('podium', { hits: [{ tag: 'teacher', ownerId: 'teacher', t: 1, speed: 3 }] }) }), 'chalk_counter'],
  ['chalk_counter: bounced off the teacher onto the crush (unseen)', base({ landing: desk('r0c0', { hits: [{ tag: 'teacher', ownerId: 'teacher', t: 1, speed: 3 }] }) }), 'chalk_counter'],
  ['chalk_counter: teacher intercept', base({ landing: land('intercept', { ownerId: 'teacher' }) }), 'chalk_counter'],
  ['chalk_counter: even if seen', base({ teacherSawBall: true, landing: land('teacher') }), 'chalk_counter'],
  ['caught_read beats chalk_counter: seen, hit teacher, then crush desk', base({ teacherSawBall: true, landing: desk('r0c0', { hits: [{ tag: 'teacher', ownerId: 'teacher' }] }) }), 'caught_read'],
  ['graded: podium', base({ landing: land('podium') }), 'graded'],
  ['graded: podium even if seen', base({ teacherSawBall: true, landing: land('podium') }), 'graded'],
  ['three_pointer: trash', base({ landing: land('trash') }), 'three_pointer'],
  ['three_pointer: trash even if seen', base({ teacherSawBall: true, landing: land('trash') }), 'three_pointer'],
  ['out_window: outside', base({ landing: land('outside') }), 'out_window'],
  ['confetti: fan', base({ landing: land('fan') }), 'confetti'],
  ['confetti: fan even if seen', base({ teacherSawBall: true, landing: land('fan') }), 'confetti'],
  ['self_love: type self', base({ landing: land('self', { seatId: PLAYER_SEAT }) }), 'self_love'],
  ['self_love: desk on the player seat', base({ landing: land('desk', { seatId: PLAYER_SEAT }) }), 'self_love'],
  ['self_love: chair on the player seat, seen', base({ teacherSawBall: true, landing: land('chair', { seatId: PLAYER_SEAT }) }), 'self_love'],
  ['wrong_caught: opposite-gender snitch (monitor), unseen', base({ landing: desk('r1c0') }), 'wrong_caught'],
  ['wrong_caught: opposite-gender normal, seen', base({ teacherSawBall: true, landing: desk('r0c1') }), 'wrong_caught'],
  ['wrong_caught: ownerId resolved from seatId', base({ landing: land('desk', { seatId: 'r1c0', ownerId: null }) }), 'wrong_caught'],
  ['same_gender: same-gender normal, unseen', base({ landing: desk('r2c2') }), 'same_gender'],
  ['same_gender: same-gender snitch, unseen (snitch rule is for opposite gender)', base({ landing: desk('r1c1') }), 'same_gender'],
  ['same_gender: caught mid-air by a same-gender jock', base({ landing: land('intercept', { ownerId: 'zhang_haoran' }) }), 'same_gender'],
  ['wrong_accept: opposite-gender normal, unseen', base({ landing: desk('r0c1') }), 'wrong_accept'],
  ['wrong_accept: chair landing', base({ landing: land('chair', { seatId: 'r0c1', ownerId: 'xu_ruoqing' }) }), 'wrong_accept'],
  ['wrong_accept: caught mid-air by an opposite-gender jock', base({ landing: land('intercept', { ownerId: 'xia_mo' }) }), 'wrong_accept'],
  ['perfect: crush desk, unseen', base({ landing: desk('r0c0') }), 'perfect'],
  ['perfect: crush catches it mid-air', base({ landing: land('intercept', { ownerId: 'su_nian' }) }), 'perfect'],
  ['perfect: crush who is a snitch type still says yes', base({ crushId: 'lin_xiaoyu', landing: desk('r1c0') }), 'perfect'],
  ['perfect: player f, crush m', { ...base({ playerGender: 'f', crushId: 'wang_dazhuang', landing: desk('r2c2') }) }, 'perfect'],
  ['same_gender: player f → girl', base({ playerGender: 'f', crushId: 'wang_dazhuang', landing: desk('r0c1') }), 'same_gender'],
  ['wrong_caught: player f → disciplinarian boy', base({ playerGender: 'f', crushId: 'wang_dazhuang', landing: desk('r1c1') }), 'wrong_caught'],
  ['lost: floor, unseen', base({ landing: land('floor') }), 'lost'],
  ['lost: empty desk, unseen', base({ landing: land('desk', { seatId: 'r2c3', ownerId: null }) }), 'lost'],
  ['lost: timeout, unseen', base({ landing: land('timeout') }), 'lost'],
  ['lost: missing landing', base({ landing: null }), 'lost'],
  ['lost: unknown owner id', base({ landing: land('desk', { seatId: 'r4c5', ownerId: 'ghost' }) }), 'lost'],
];
for (const [name, round, want] of cases) test(`resolve ${name}`, () => assert.equal(resolve(round), want));
test('resolve covers all 13 endings', () => {
  const got = new Set(cases.map(([, r]) => resolve(r)));
  for (const id of ENDING_IDS) assert.ok(got.has(id), `no case reaches ${id}`);
});
test('resolve is pure (does not mutate the round)', () => {
  const r = base({ teacherSawBall: true, landing: desk('r0c0') });
  const snap = JSON.stringify(r);
  resolve(r); resolve(r);
  assert.equal(JSON.stringify(r), snap);
});

console.log(fails.join('\n'));
console.log(`${fails.length ? '✗' : '✓'} ${passed} passed, ${fails.length} failed`);
if (fails.length) process.exitCode = 1;
