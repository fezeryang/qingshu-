# Story module (`src/story/`): implementation notes

Owner: qs-narrative-director. Contract: `docs/CONTRACTS.md` §4.6.

## Files

| File | Contents |
|---|---|
| `index.js` | install; `ctx.story`; script runner (hard caps, cancellation, fallback ending); gallery; `round:setup` reset; sets the HUD objective on every `aim` phase |
| `roster.js` | `STUDENTS` (23), `TEACHER`, `NPCS` (dad, mom, principal, PE teacher, janitor), `playerAvatarSpec(gender)`, `SNITCH_TRAITS`, `makeRoster()`. Pure, so it runs in Node |
| `letters.js` | 6 letter presets (each ≤ 60 characters) |
| `endings.js` | `ENDINGS` metadata and `resolve()`, the GDD §7 table. Pure, so it runs in Node |
| `direct.js` | Director toolkit `d`. Every call into another module goes through it (see "Robustness") |
| `intro.js` | Class-start intro and its cleanup |
| `cutscenes/common.js` | Shared beats: `begin`, `settleClass`, occlusion-aware `front()` framing, `pickUpAndRead`, `hitPrelude`, `expressionRamp`, … |
| `cutscenes/<id>.js` | One script per ending (15) |

Dev and test files live in `dev/story/`:

| File | Purpose |
|---|---|
| `resolve.test.mjs` | `node dev/story/resolve.test.mjs`: 82 checks covering the roster, letters, metadata, every resolve() branch and the priority edges |
| `_template.js`, `gen.sh` | `sh dev/story/gen.sh` regenerates `endings1..3.js` |
| `endings1.js` … `endings3.js` | Each one triggers 4–5 endings through `__qs`, checks the ending id, takes a screenshot at the `climax` and `final` beats, and returns durations and errors |

## Additions to `ctx.story` (beyond the contract)

| Field | Meaning |
|---|---|
| `STUDENTS`, `TEACHER`, `NPCS` | Raw specs (read-only) |
| `debug.beat` | Current beat of the running script: `start` → `react` → (`glance`) → `climax` → `final`. The intro uses `start`, `crush`, `done`. QA can screenshot on `debug.beat === 'climax'` |
| `debug.beats` | `[{name, t}]` for the current script, in game time |
| `debug.durations[id]` | `{game, ui, result}` for each ending played. `result` is `ok`, `timeout` (hit the 44 s cap), or `error` (the fallback ran) |
| `debug.endingId`, `debug.running`, `debug.lastError`, `debug.introSkipped` | Additional debug fields |

Roster object extras: `makeRoster()` also returns `playerGender`. Every spec carries a Chinese `bio`.

## Roster

Colours are `'#rrggbb'` strings. There are 12 girls and 11 boys. Every trait exists for both genders, except that the snitch types are split by gender: `monitor` is a girl and `disciplinarian` is a boy. This means every ending is reachable with either player gender.

| id | name | gender | trait | look |
|---|---|---|---|---|
| `lin_xiaoyu` | 林晓雨 | f | monitor (snitch) | ponytail, hairclip |
| `gu_xiaosuan` | 顾小算 | f | nerd | braid, glasses |
| `bai_xiaomeng` | 白小梦 | f | sleeper | messy |
| `chen_keke` | 陈可可 | f | foodie | bob |
| `tang_tang` | 唐糖 | f | gossip | twintails, hairclip |
| `xia_mo` | 夏沫 | f | jock | short, headband |
| `ye_zhiqiu` | 叶知秋 | f | artsy | bun, mole |
| `leng_yue` | 冷月 | f | chuuni | curtain, bandaid |
| `su_nian` | 苏念 | f | shy | long |
| `le_duoduo` | 乐多多 | f | clown | ponytail, freckles (auburn) |
| `you_xiaoyou` | 游小悠 | f | gamer | sidepart, earbuds |
| `xu_ruoqing` | 许若晴 | f | normal | long, hairclip |
| `yan_zheng` | 严正 | m | disciplinarian (snitch) | sidepart, glasses |
| `song_shuhang` | 宋书航 | m | nerd | short, glasses |
| `zhao_xiaokun` | 赵小困 | m | sleeper | messy |
| `wang_dazhuang` | 王大壮 | m | foodie | buzz, sturdy |
| `hu_shuo` | 胡硕 | m | gossip | sidepart, mole |
| `zhang_haoran` | 张浩然 | m | jock | short, headband |
| `jiang_bei` | 江北 | m | artsy | curtain, earbuds |
| `long_aotian` | 龙傲天 | m | chuuni | messy, bandaid |
| `wen_yan` | 温言 | m | shy | curtain, freckles |
| `sun_xiaokong` | 孙小空 | m | clown | buzz |
| `li_yiming` | 李一鸣 | m | gamer | curtain, glasses |

- **Teacher:** `teacher`, 王老师: combover, glasses, `shirtTie`, trait `strict`.
- **NPCs:** created with `ctx.cast.extra(NPCS.x)`:
  - `npc_dad` 爸爸 and `npc_mom` 妈妈 (casual);
  - `npc_principal` 校长 (bald, suit);
  - `npc_pe` 体育老师 (tracksuit);
  - `npc_janitor` 保洁阿姨 (janitor).
- **Player avatar:** `player_m` / `player_f`, name 你, role `npc`. It is used whenever "you" must be on screen. In classroom endings it sits in `r4c0`.

### `makeRoster(rng, playerGender, opts)`

- **Seats.** Seats are shuffled with `rng`. The player seat `r4c0` is always empty, and 6 other seats are empty.
- **`opts.seatMap`** may be **partial**:
  - listed seats are used as given (`id`, or `null` to keep the seat empty);
  - unknown ids are ignored;
  - every unlisted student goes, in shuffled order, into the remaining seats.
- **Crush.** `opts.crushId` is used as-is if it is a valid student id; a same-gender crush is allowed for tests. Otherwise the crush is a random *seated* student of the other gender.
- **Determinism.** Results are deterministic per seed. `__qs.start({seed, playerGender, crushId, seatMap})` passes these opts straight through.

## resolve(round)

`resolve()` is pure, except that it also writes `round.recipientId` and `round.delivery` (contract §4.6).

### Recipient rule (GDD §7, playtest round 1)

`decideRecipient(round, landing)` in `endings.js` returns `{id, delivery}`:

1. **`desk`**: a `desk`/`chair`/`intercept` landing on an occupied seat (or a classmate's catch). The recipient is the occupant or catcher.
2. **`bonk`**: otherwise, the first classmate (student) in `landing.hits` with tag `head`/`body`.
3. **`pickup`**: otherwise, the occupant of the nearest occupied seat within **0.9 m** of `landing.pos`. Distance is taken in XZ to the chair centre or the desk centre, whichever is nearer. If there is no `pos`, `landing.nearSeatId`/`nearSeatDist` are used.
4. **`null`**: nobody. This also applies to place landings (teacher, podium, bin, window, fan, own desk) and to teacher intercepts.

### Priority

1. `!launched && caughtDuring !== 'aim'` → `coward`.
2. `caughtDuring === 'aim'` → `caught_read`.
3. Seen, and the recipient is the crush, a same-gender classmate, or nobody (not a place) → `caught_read`.
4. Any teacher contact → `chalk_counter`.
5. `podium` → `graded`; `trash` → `three_pointer`; `outside` → `out_window`; `fan` → `confetti`; own desk/chair → `self_love`.
6. **`love_bonk`**: the recipient is the crush, it is unseen, and the crush was hit (`delivery === 'bonk'`, or a crush head/body hit before resting on her desk).
7. **`passed_around`**: the recipient is a `gossip`, not the crush, and it is unseen.
8. The recipient is opposite-gender and not the crush → `wrong_caught` if seen or a snitch type, else `wrong_accept`.
9. Same-gender, not the crush → `same_gender`.
10. The crush → `perfect`.
11. Nobody → `lost`.

`node dev/story/resolve.test.mjs` runs 82 checks, covering every row, every delivery type and the priority edges.

### Delivery staging

`receive(d, ch)` in `cutscenes/common.js` is used by perfect, same_gender, wrong_caught, wrong_accept and passed_around:

- **desk:** `!`, pick up, unfold, read.
- **bonk:** dizzy face and a hand to the head, then "哎哟！/痛……/谁啊？！". They glare left and right, then a low floor shot of the ball with them in the background, then a suspicious pick-up and a peek.
- **pickup:** `!` at the ball, a glance at the teacher (cut-away to his back, still writing), then a low floor shot as they slide down and sneak it up ("嘘……"). They read it with a suspicious face.

In caught_read, the recipient protests according to the delivery: "它砸的我！不是我扔的！" / "我、我只是捡起来……".

## Deterministic trigger recipes (for QA)

The common setup is `__qs.start({seed: 11, playerGender: 'm', crushId: 'su_nian', skipIntro: true})`, then `__qs.forceTeacher('writing', 999)` (back turned, so nothing is seen) and `ctx.ai.students.setAmbient(false)` (no fidgets or reflex catches to deflect the ball; sticky, so call `setAmbient(true)` afterwards). Throw with `throwAt(target, {budgetMs: 600})`: under SwiftShader load, the solver's default 140 ms budget sometimes returns "no launch solution" (seen for `fan` and once for a desk). Throw targets accept character ids (`__qs.target` resolves them to the seat's desk).

For `playerGender: 'f'`, use the boys instead: `yan_zheng` for `wrong_caught`, `xia_mo`/`xu_ruoqing` for `same_gender`, and `wang_dazhuang` for `wrong_accept`, with a male crush such as `wen_yan`.

| Ending | Trigger | Verified (seed 11, m) |
|---|---|---|
| `perfect` | `throwAt('crush')` | desk r3c5 → perfect, 30.9 s |
| `same_gender` | `throwAt('wang_dazhuang')` (any boy except the crush) | desk r0c5 → same_gender, 32.9 s |
| `wrong_caught` | `throwAt('lin_xiaoyu')` (monitor girl). Or any non-crush girl with `ctx.round.teacherSawBall = true` during flight | desk r0c2 → wrong_caught, 29.7 s |
| `wrong_accept` | `throwAt('xu_ruoqing')` (any non-snitch, non-crush girl) | desk r3c3 → wrong_accept, 28.1 s |
| `caught_read` | `forceTeacher('watching', 30); setSuspicion(0.99); ctx.gameplay.aim.charging = true` (the smoke recipe). Or teacher saw + crush/boy/floor | caught during aim → caught_read, 24.1 s |
| `chalk_counter` | `throwAt({x, y, z})` of `ctx.cast.teacher.headWorld()`. `throwAt('teacher')` trips a debug.js bug, see gameplay → lead | teacher → chalk_counter, ~16 s |
| `graded` | `throwAt('podium')` | podium → graded, 23.9 s |
| `three_pointer` | `throwAt('trash')` | trash → three_pointer, 19.5 s |
| `out_window` | `throwAt('window')` | outside → out_window, ~25 s |
| `confetti` | `throwAt('fan')` | fan (`budgetMs: 400`) → confetti, 11.3 s |
| `self_love` | `throwAt('self')` | self → self_love, 19.4 s |
| `love_bonk` | a landing with `hits: [{tag:'head', ownerId: crushId}]` that rests anywhere but another occupied desk, e.g. `throwAt(<crush head position>)`. Verified by injecting `ball:landed {type:'floor', hits:[crush head]}` | love_bonk |
| `passed_around` | `throwAt('tang_tang')` (gossip girl; `hu_shuo` for the boy), with the crush ≠ the gossip | passed_around |
| bonk / pickup variants | inject `ball:landed {type:'floor', hits:[{tag:'head', ownerId:X}]}`, or `{type:'floor', pos: next to X's chair}` | X's ending, `delivery` bonk/pickup |
| `lost` | `throwAt('floor')`. The default floor target (aisle x = −1.4) is > 0.9 m from every seat | floor → lost, 16.1 s |
| `coward` | `start({..., roundSeconds: 2})`, then wait | bell → coward, 12.0 s |

To test a cutscene without physics, emit `ball:launched` and then `ball:landed` with a hand-made Landing during `aim`/`flight`. Flow takes it from there.

## Robustness (why cutscenes never crash or hang)

- **Wrapped calls.** Every cross-module call goes through `d.try()` (try/catch plus warn-once) and optional chaining.
- **Capped awaits.** Every awaited promise is capped (`d.settle`). Dialogue is capped at `3 + 0.15·len` s, reveals at `4 + 0.22·len` s, camera moves at `dur + 1` s, clips at about 3 s. If a module returns a non-promise, the director waits a sensible fallback time instead.
- **Overall caps.**
  - Each ending is capped at **44 s of game time**. After the cap the director is cancelled, so every later `d.*` await throws an internal `CANCEL` and the script unwinds silently.
  - The intro is capped at 6.5 s (ui clock).
- **No unhandled rejections.** All async director helpers have a no-op rejection handler attached, so a cancelled fire-and-forget call never surfaces as an unhandled rejection.
- **Fallback ending.** A real exception in a script is logged with `console.error` (so QA sees it). A fallback ending (title caption plus subtitle) then plays, and flow continues to the card.
- **Walks.** `d.place()`/`d.seat()` cancel a still-running `walkTo` (same walk-token trick the character module uses) so placements stick.
- **Props.** Props are cached per key for the whole session (`d.prop`), so memory stays flat. On `round:setup` they are removed from the scene, and story loops are stopped.

## Intro (≤ 6.5 s, ui clock; Mouse0/Space skips)

| t (s) | Camera | Action / text | Audio |
|---|---|---|---|
| 0 | Wide from the back right, sun from the windows | teacher faces the class; bus `bell` | bell (audio, on `bell`) |
| 0.55 | — | teacher `teacherLecture`, bubble "上课！" | |
| 1.2 | — | monitor bubble "起立！"; class `standUp` (staggered) | chairScrape |
| 2.0 | — | bubble "老——师——好——"; class `bow` | murmur |
| 2.85 | — | "同学们好，坐。"; class `sitDown` | |
| 3.4 | Your gaze: from your eye, pushing in on the crush (fov 42→24); `slowMo(0.55, 1.4)` | crush gazes out of the window, clip at speed 0.4 | heartbeat, slowmoIn |
| 4.45 | occlusion-aware 3/4 `front(crush)` | `smile`, `emote('sparkle')`, chapter caption with the crush's name | heartbeat, sparkle |
| ≈5.8 | `cast.seatAll()`, letterbox off, `toFP({instant})` | objective "把情书扔到 X 的桌上"; AI and ambient back on | |

## Ending storyboards

> Playtest round 1: every ending now has about 6–10 distinct shots, with reaction cut-aways (`cutaway()`) and oblivious-teacher cut-aways (`teacherOblivious()`). The tables below list the main beats. The added cut-aways are: perfect (gossip "哦——？", teacher at the board), graded (gossip "是情书！", crush "……谁写的？", clown "五十九！哈哈哈！"), self_love (deskmate "……你在跟纸团谈恋爱？", crush yawning, teacher), coward (the wall clock, the crush laughing), confetti (teacher looking up, foodie "……能吃吗？"), lost (sleeper snoring, teacher), caught_read (recipient protest, crush hiding her face), three_pointer (teacher's jaw drop, crush "好帅……"), same_gender (teacher "……什么情况？"), wrong_accept (gossip "大新闻！", crush "……？").

### love_bonk: 隐藏 · 砸出来的缘分 (~25 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | behind the crush, `slowMo(0.3)` | the bonk; dizzy; impact "咚！" | thudHead, shake |
| — | `overShoulder(you, crush)` | she clutches her head and turns: "谁啊？！" | |
| — | `front(you)` | frozen, sweating: "对、对不起……" | |
| — | `twoShot`, `slowMo(0.4)` | eyes meet; chapter "四目相对"; her anger melts into a blush | **romance**, heartbeat |
| climax | `front(crush)` | she picks it up and reads it (`letterReveal`), then a blush close-up with hearts | sparkle |
| — | teacher cut-away | "后排的，安静一点。" | chalkScratch |
| — | side shot of your head | she lobs it back and bonks *you*; you get dizzy hearts; she laughs: "扯平了。" | whoosh, thudHead |
| final | `twoShot` | both grinning; the gossip rolls her eyes (`dots`); chapter "一 砸 钟 情" | |

### passed_around: 隐藏 · 全班传阅 (~30 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | `front(gossip)` | delivery staging, then a smug peek: "哦豁——"; you: "不……不要传……" | |
| relay | alternating hand-off wides and per-classmate cut-aways | the note travels up to 5 classmates along the path to the crush; each reacts in character (nerd "格式不对。", foodie "（吧唧）……嗯，甜。", sleeper wakes up and passes it, chuuni "禁忌的文书……", clown "噗——"…) | **comedy**, swoosh |
| freeze | the teacher turning | halfway: "……嗯？", slow motion, everyone pretends to write; impact "装 认 真"; he turns back | stingDanger |
| climax | `front(crush)` | it reaches the crush last: "……为什么我是最后一个看到的？" | **romance** |
| final | wide from the front, then `front(you)` | the whole class turns to you, beaming; impact "全班都知道了"; you facepalm | ooh |


Every ending follows the same frame:

- **Opening:** `begin()` (AI teacher off, ambient off, PiP off, HUD off, letterbox on) and `settleClass()` (students reset and seated, sleepers keep sleeping as a running gag).
- **Middle:** immediate reaction in the classroom, then the main act (sometimes a set change).
- **End:** a freeze held for about 1.5–2 s on beat `final`.

Line variants are drawn from `ctx.rng.fork('story/<id>')`, so a seed reproduces them. Some lines also depend on the recipient's trait. If the ball bonked heads on the way (`landing.hits`), those classmates complain first (`hitPrelude`). If it was caught mid-air (`intercept`), the catcher gets a "接住了！……诶？" line.

### perfect: 完美 · 天台之约 (~30 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | `front(crush)` 3/4 | teacher keeps writing, back turned; crush `!`, pickUp → unfold → read | pop, paperUnfold |
| read | slow push-in (6 s) | `letterReveal(text, read)`; face shock → embarrassed (sweat) → blush | **romance** |
| glance | `overShoulder(you, crush)` | crush looks back at you; `heart`; caption "心 动" (impact) | heartbeat |
| write | `closeUp(crush, right)` | crush writes; teacher bubble lecturing to the board | pencil |
| climax | side wide from the window aisle, panning along the arc; `slowMo(0.45)` | crush `throw`; reply note flies back to your desk (`scriptedThrow`) | whoosh, thudDesk |
| reply | POV down at your desk | `letterReveal(reply)`: "放学后，天台见。" plus a trait P.S. (13 variants) | stingReveal, sparkle |
| rooftop | `irisHeart` out/in, `camWide`, then `twoShot` | chapter "放学后 · 天台"; 3 dialogue variants | romance |
| final | walk to the railing, `camSunset` | side by side facing the sunset, hearts | |

### caught_read: 社死 · 当众朗读 (~25–38 s, depending on letter length)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | `crashZoom(teacher)` | glasses push, `!`. Aim case: "最后一排，靠窗的那位同学——你手里拿的，是什么？". Flight case: "刚才飞过去的那个纸团……", and the recipient protests | recordScratch, stingDanger |
| — | `front(you)` | whole class `turnBack`s to you; you `shock`/sweat; "拿上来。念给大家听。" | ooh |
| walk | low angle in the window aisle | you stand and walk; gossip bubbles "哇哦——" / "是情书吧？！" | **shame**, murmur |
| climax | from the aisle among the desks, slow push (head low in frame so the sheet never hides you) | you, at the front, holding the letter; `letterReveal(text, readAloud)` + `audio.speak(text)` **verbatim**; gossips gasp, crush facepalms, clowns laugh | duck |
| erupt | your POV pushing toward the laughing class | everyone laugh/clap/point; impact "社 死"; shake | laughCrowd, ooh |
| final | `front(you)` | teacher's verdict (3 variants); you `cry`, `skull` emote | |

### chalk_counter: 隐藏 · 粉笔头反击 (~16 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | behind the class toward the teacher's back | `anger` emote; class gasps | silence, thudHead, gasp |
| turn | `dutch(8°)` during a 1.6 s slow `faceTo`, then `closeUp` | `teacherAdjustGlasses`, glint `sparkle`; 3 two-line variants ("我教了三十年书……") | stingReveal, **mystery** |
| climax | `track(chalk)`, `slowMo(0.3)` | `teacherThrowChalk`; impact "狙 击"; the chalk arcs to your forehead | whoosh |
| hit | `flash(white)` + shake, then `front(you)` | you `dizzy`, `dots`, shiver | thudHead, ding, **comedy** |
| final | wide from the platform | class applauds; the clown: "好准！老师，再来一个！"; teacher `smug`: "继续上课。"; chapter "命中率 100%" | clapCrowd |

### graded: 隐藏 · 59 分 (~25 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | side of the platform | teacher `?`, turns, picks the letter up off his desk, reads; "嗯……" | thudDesk, gasp |
| — | `front(you)` | "……完了。" | |
| grading | mid-class toward the board | red chalk; the board shows "《情书》批改", your letter (wrapped), remarks, "59 分" | **comedy**, chalkScratch |
| climax | — | `letterReveal(text, {mode: 'grading', score: 59})` | chalkTap |
| verdict | `closeUp(teacher)` | "错别字 3 处，比喻不当——59 分。"; impact "59 分"; class laughs; tag line (3 variants, e.g. "扣的那一分，是因为没写名字。") | buzzer, laughCrowd |
| final | board + you facepalming | | |

### three_pointer: 隐藏 · 三分球 (~20 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | replay angle on the bin, `slowMo(0.4)` | commentator (解说): "球——进——了——！！！"; impact "三 分 球 ！" | swish, buzzer, **sports**, cheer |
| ovation | wide from the front | class stands and cheers; the jock: "这弧线……是天才！"; the teacher, sweating | |
| PE teacher | door shot, then `front(you)` | slams in: "刚才那一球，是谁投的？！"; class points at you; recruitment line (2 variants) | doorSlam |
| court | white fade to `court` `camWide` | chapter "一个月后 · 全国大赛"; crush and 5 classmates in the stands | cheer |
| climax | `track(basketball)`, `slowMo(0.5)` | your shot into the hoop; commentator verdict (2 variants); PE teacher cries "好苗子……" | swish, buzzer |
| final | low-angle hero shot | crush "加油——！" | |

### out_window: 隐藏 · 校园广播 (~25–32 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | inside, looking out of the open window | window-side classmates `?`; the gossip: "刚才，是不是有什么东西飞出去了？"; you: "……完了。" | windGust |
| yard | `schoolyard` `camHigh`, `track(ball)` | the ball drifts down, swaying, onto the principal's bald head | **mystery**, pop |
| — | `closeUp(principal)` | reads; shock → moved to tears; "……多么纯洁的感情啊。" (3 variants) | |
| climax | `camWide`, then the loudspeaker | megaphone; impact "全 校 广 播"; "咳咳。全体师生请注意——"; reads your letter verbatim (`readAloud` + speak) | ding ding, **broadcast** |
| class | back to the classroom, push in on you | everyone turns to you; crush blushes and facepalms; teacher in shock | |
| final | `front(you)` | the principal's blessing (3 variants); impact "全 校 皆 知"; you facepalm, `skull` | ooh |

### confetti: 隐藏 · 心碎成雪 (~20 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | looking up at the fan, `slowMo(0.5)` | 4 confetti props drift down over 9 s | shatter, fanHum, **romance** |
| snow | low wide looking up | everyone looks up; the artsy kid: "……下雪了。" (whisper caption) | |
| climax | `front(crush)` | crush `catch`es a scrap; smile → blush, heart; "……是谁的心，碎了呢。" (3 variants) | sparkle |
| final | `front(you)`, then low wide | you laugh-cry; chapter "心 碎 成 雪"; the sleeper wakes: "……下课了吗？" | |

### self_love: 隐藏 · 爱自己 (~20 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | POV down at your desk | "……它回来了？" | pop |
| read | `front(you)`, push-in | you pick it up and read your own letter; shock → blush → moved to tears; "……写得真好。" (3 variants) | **romance** |
| climax | — | you hug the letter, `hearts`; your deskmate `dots` "你还好吗？" | sparkle |
| final | slow 5 s pull back and up: one small figure in a big classroom | philosophical chapter caption (3 variants) | |

### wrong_caught: 误投 A · 请家长 (~30 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | `front(recipient)` | reads, shock. Snitch: stands, raises a hand, "报告老师！有人上课传情书！" (monitor) or "……我已经记下来了。" (disciplinarian). Seen: the teacher demands it | |
| verdict | `closeUp` / `crashZoom(teacher)` | reads, `anger`; "最后一排靠窗的同学——明天，把家长叫来。"; class turns; you `skull` | stingDanger, **tragedy** |
| office | fade to `office` `camWide` | chapter "第二天 · 办公室"; teacher states the case; mom "我们家孩子从小就老实啊！"; dad reads it: "……这字写得，跟我当年一模一样。"; mom: "……你当年写给谁的？！" | rain loop |
| climax | `camOverShoulder` | "回去写三千字检讨。" / "三、三千字？！"; impact "检讨书 · 3000 字" | |
| final | `front(you)`, crying | whisper caption "尊敬的王老师：我错了。（还剩 2994 字）" (2 variants) | |

### same_gender: 误投 · 认真的回应 (~35–40 s). Warm, never mocking.

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | `front(recipient)`, push-in | reads every word carefully (shock → neutral → determined) | silence |
| look | `overShoulder(you, recipient)` | a long look back at you | clockTick |
| climax | low `front` | stands up solemnly; "……" then a trait-specific "我愿意。" (13 variants, e.g. nerd "我验算了三遍。……我愿意。") | chairScrape |
| erupt | wide from the front | 1 s of frozen silence, then the class erupts; impact "全 班 沸 腾"; crush: "……诶？？我呢？"; you: "等、等一下，我其实是想——"; recipient: "以后请多关照。" | crickets, then **romance**, cheer |
| montage | `irisHeart`; `cherryPath` track | chapter "后来——"; walk side by side to the bench | |
| — | `canteen` | "鸡腿，分你一半。" | |
| final | back of the classroom | standing at the back together (罚站), laughing; teacher: "你们两个，站好！"; chapter "……好像，也不错？" | |

### wrong_accept: 误投 B · 将错就错 (~28 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | `front(recipient)` | reads; shock → embarrassed → blush, heart | |
| — | `overShoulder` | shy glance; trait answer (11 variants, e.g. gamer "组队申请……已通过。"); you: "等……不是……" | **romance**, heartbeat |
| climax | `closeUp(recipient)` | nods with `love` eyes, "不用说了，我都懂。"; crush `?`; impact "将 错 就 错" | **comedy**, ooh |
| montage | iris to `cherryPath` | chapter "第 1 天：还没找到机会解释。" | romance |
| — | `canteen` | feeds you, "啊——张嘴。"; chapter "第 30 天：好像……解释不清了。" | |
| final | rooftop `camSunset` | chapter "第 100 天：……算了，就这样吧。" | |

### lost: 隐藏 · 石沉大海 (~20 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | ball POV at floor level | class carries on; teacher lectures; whisper "……没有人注意到。"; you sigh | **lonely**, clockTick |
| night | fade, `setMood('night')`, everyone gone | chapter "当天晚上"; the janitor walks in with a broom | bell, footstep |
| climax | ball POV looking up at the janitor | "……又是一封没送出去的。" (3 variants); swept into the dustpan | swoosh |
| final | dark wide | chapter "石 沉 大 海"; she leaves, humming (`music` emote) | |

### coward: 怂 · 下课铃 (~20 s)

| Beat | Camera | Action / dialogue | Music / SFX |
|---|---|---|---|
| react | your POV | "好，下课。"; class stands | (bell from flow), chairScrape |
| leave | POV pan to the back door | crush and their deskmate leave laughing ("放学去喝奶茶吗？" / "好呀！") | doorSlam |
| climax | close on your hand | the soggy paper ball; whisper "纸团……被手汗泡软了。"; impact "怂" | **lonely** |
| final | sunset (`setMood('sunset')`), empty classroom, slow push | head down on the desk; "……明天。明天一定。" (3 variants) | |

## Requests filed

See `docs/requests/narrative-director-to-*.md`.

Classroom voice integration: the class greeting starts at 2.0 s and the teacher answers at 3.9 s, after all eight neural chorus voices finish. The crush reveal is shortened to keep the complete skippable intro within its existing 6.5-second cap.

## Same-gender montage transitions

The cherry-path montage now walks both actors side by side along the path and awaits both arrivals before the canteen lunch scene and the return to the classroom. The returned class is reset to seated idle poses; the couple stands with clear separation against the rear wall in a shared shot. `path`, `canteen` and `punishment` debug beats identify these locations independently of `climax` and `final`.

Director-owned walks invalidate the character's movement token on timeout or cancellation and stop walk/run clips. A completed capped await must never leave a tween that overwrites a subsequent `place()`. Ending text-only dialogue uses normal text pacing rather than reserving nonexistent speech duration.

Regression commands:

```sh
node --test dev/story/walk.test.mjs
node tools/shot.mjs --script dev/story/same-gender.js --out dev/story/shots/same-gender-fixed
node tools/shot.mjs --script dev/story/same-gender.js --query 'lowfx=1&mute=1&long=1&pickup=1&gender=f' --out dev/story/shots/same-gender-long-fixed
```

The browser script verifies classroom → cherry path → canteen → classroom, both actors visible and standing inside the camera frame, successful completion without the ending hard cap, and no runtime errors. It captures the declaration, walk, lunch and punishment for visual review. The second case covers a female player, floor pickup and a long custom letter.

Final regression evidence is stored in `qa/data/same-gender-regression.json`: male/head-hit delivery completes in 33.91 s; female/floor-pickup delivery with a 300-character letter completes in 38.09 s. Both visit all four locations and return `result: 'ok'` with no runtime errors. `dev/story/shots/same-gender-complete/` contains the four key frames for each case. Walk cancellation unit tests and the full-round smoke also pass. The lunch shot uses the canteen wide anchor so its counter and tables identify the location.
