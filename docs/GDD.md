# 情书抛物线 · Love Letter Parabola — Game Design Document

> Maintained by the lead (director/architect). Agents treat it as read-only; propose design changes in your delivery report and the lead decides.
> All Markdown in this repo is written in English. In-game text (UI, dialogue, captions) is Simplified Chinese.

## 1. Pitch

You sit in the back row by the window. While the math teacher turns to write on the blackboard, you crumple your love letter into a paper ball and lob it toward your crush's desk. The ball traces a slow-motion parabola — and whose desk it lands on decides the rest of your life (or at least the rest of this class).

## 2. Experience goals

- **Short rounds (60–120 s), endlessly replayable.** One throw per round; the landing decides the ending. Failing is funny too, so you want another go.
- **Tension → release → laughter.** The teacher's back-turned "safe window" creates tension; the cinematic slow-motion flight builds anticipation; the ending cutscene pays off with a laugh or a heart-flutter.
- **Ending collection.** 15 endings (several hidden), persisted in an ending gallery; locked endings show a vague hint to drive replays.
- **Style.** Japanese/Chinese youth-anime school vibe: 3 pm sunlight, warm palette, low-poly chibi characters (big heads, texture-drawn faces, outlines), exaggerated comic staging, big manga-style captions.

## 3. Round flow (phases)

| Phase | Content | Exit |
|---|---|---|
| `title` | Title screen: start / ending gallery / settings; choose "我是 男生 / 女生" (player gender) | Start clicked |
| `letter` | Write the letter: 3+ presets (shy / chuuni / cheesy pick-up line / nerd) or type your own (≤ 60 chars), then **hold the mouse to crumple it** (progress + crumple sound) | Crumple done |
| `intro` | Bell rings, teacher starts class; camera drifts to the crush (heartbeat, slow motion, hair flowing, pink glow); objective: "把情书扔到 XXX 的课桌上" | ~4 s or click to skip |
| `aim` | First-person, seated. Mouse looks around (limited angles). **Hold LMB to charge** (arm rises, FOV tightens, heartbeat), release to throw. **Hold RMB or Space to "pretend to study"** (look down at the book; suspicion drops fast). Wall clock counts down (default 90 s) | Thrown / caught / bell |
| `flight` | Camera switches to the paper-ball follow cam by default (C cycles: chase / side / stay-at-seat). Automatic bullet time at the apex and near landing. **Hold Space to "hold your breath"**: slow motion + A/D "telekinesis" nudges (limited willpower) | Ball at rest / enters a trigger / 6 s timeout |
| `ending` | Immediate reaction where it landed (pick up, unfold, neighbours react, did the teacher notice?) followed by the ending cutscene (may change scene: rooftop, office, basketball court…) | Cutscene done |
| `card` | Ending card: title, rarity, NEW stamp, gallery progress x/13, "再来一局" / "改写情书" / "回到标题" | Player choice |

## 4. Classroom layout (data in `src/core/layout.js`, lead-owned)

- Room x∈[-5,5], z∈[-6,4.5], height 3.2 m. Blackboard on the front wall (z = -6); students face -Z.
- Left wall (x = -5) has three windows; **the middle one is open** (the ball can fly out → hidden ending; gusts of wind move the curtains and push the ball sideways). Right wall (x = +5) has front and back doors.
- Teacher platform (讲台) z∈[-6,-4.6], raised 0.2 m; teacher's desk at (0, -4.95).
- 5 rows × 6 columns of desks (3 pairs of deskmates, ~1.5 m aisles). The player always sits at **`r4c0`: back row, by the window** — the anime protagonist seat.
- Trash bin in the front-right corner (by the door); two ceiling fans (spinning — the blades can hit the ball).

## 5. Characters

- **You (player):** first-person; only your hands are visible (sleeves follow gender/uniform).
- **王老师 (Mr. Wang):** math teacher; comb-over, glasses, thermos, chalk. Writes on the board, lectures, sips tea, fake-turns, patrols the aisles, throws chalk.
- **Classmates (~23):** a fixed, named class with personalities (class monitor, discipline officer, PE rep/jock, nerd, sleeper, foodie, gossip, artsy dreamer, chuuni, shy, clown, gamer…). Each has a `gender`, a `trait`, and a distinct look. Seats are shuffled per round by seed; **the crush** is drawn at random from classmates whose gender differs from the player's.
- `trait` drives: ambient behaviour (sleeping, sneaking snacks, passing notes, phone under the desk, stretching), in-flight accidents, and how they react when they receive the letter by mistake (report it / accept it / get flustered).

## 6. Core mechanics

### 6.1 Throwing and physics
> **Playtest round 1 changes (lead):** the ball was too fast for the camera hand-off and desks were too hard to hit. The paper ball now uses **stylised floaty physics**: lower gravity (≈ 5–6 m/s²) and lower launch speeds, so a typical throw is airborne **1.3–2.5 s** with the same reachable targets. Desk tops **catch** the ball (low bounce, high friction), there is a **gentle aim assist** toward the desk nearest the predicted landing point, and the charge preview dots are a little longer. Exact numbers live in `src/gameplay/` and `docs/modules/gameplay.md`.

- Ball radius 0.04 m, stylised gravity 5.5 m/s² (floaty paper ball), light air drag, low restitution (wood ~0.3, heads ~0.55), high friction; it bounces, rolls and stops.
- Charge 0→1 over 1.1 s, then jitters between 0.85 and 1 (shaky hand). Speed maps to 1.4–8.5 m/s; typical desk lobs fly ~1.7 s. Hold-breath nudge ≈ 0.55 m/s² (≈ 0.8 m landing shift at full willpower). Launch direction = view direction + ~10° upward lob.
- While charging, show a dotted preview of the first 0.5 s of the trajectory (not the whole arc — keep it skill-based).
- Colliders: floor, walls, window frames/glass, desk tops, chairs, book stacks, platform, teacher's desk, trash bin (walls + inner trigger), fan blades (rotating OBBs), classmates' heads (spheres) and torsos (boxes), raised arms, the teacher (head + torso).

### 6.2 Teacher AI and suspicion
- States: `writing` (back turned, safe) → `warning` (0.5–0.9 s tell before turning: chalk stops, head tilts, "嗯？", tension sting) → `watching` (faces the class, gaze sweeps the rows) → occasional `fakeout` (half-turn, then back), `drinking` (facing the class but eyes closed sipping tea — relatively safe), `patrol` (walks down an aisle — dangerous), `suspicious` (suspicion > 0.6: stares at your area).
- Suspicion 0–1: while the teacher faces the class and you are in the view cone, **charging** raises it fastest, **looking around** (gaze away from the board) raises it slowly, **pretending to study** drops it quickly. A ball flying inside the teacher's view cone raises it very fast.
- Suspicion full → **caught** (aim phase: straight to the "read it aloud" ending; flight phase: flag `teacherSawBall` and resolve via the ending table after landing).
- Noise: a loud hit (ball on a head or desk) makes a writing teacher turn early.

### 6.3 In-flight accidents (at least 6)
- A classmate suddenly **stretches** / **raises a hand** / **stands up** (arms and body block the path).
- A classmate **sneezes** (head jerks).
- **Gust** at the window (curtains billow, ball drifts sideways).
- **Ceiling fan** hit → the ball is shredded into heart-shaped confetti (ending `confetti`).
- The **PE rep catches it by reflex** (treated as landing on their desk).
- A classmate **turns around and witnesses** it ("!" bubble, may raise suspicion).
- The teacher **turns early mid-flight** → picture-in-picture danger window + slow motion.

## 7. Ending table (`src/story/` is authoritative; priority top to bottom)

**Recipient rule (playtest round 1).** A letter that doesn't land on a desk is not automatically lost. `resolve()` first decides who ends up with the letter (`round.recipientId`) and how (`round.delivery`):
1. `desk` — it rests on a desk or chair: the seat's occupant.
2. `bonk` — it hit a classmate's head/body during flight and then fell anywhere except another occupied desk/chair: the **first classmate it hit** rubs their head, picks it up and peeks.
3. `pickup` — it rests on the floor/aisle within ~0.9 m of an occupied seat: the **nearest classmate** sneaks it up off the floor and peeks.
4. none — otherwise (far from everyone): `lost`.
The recipient then goes through the usual table (crush / same gender / opposite gender / snitch), and every ending script stages the delivery type (desk reaction vs. head-rub vs. sneaky pick-up). Two new endings sit above the recipient rows:
- `love_bonk` (隐藏 · 砸出来的缘分): the ball **bonks the crush** and the teacher didn't see — the crush turns around, their eyes meet yours, a meet-cute.
- `passed_around` (隐藏 · 全班传阅): the recipient is a `gossip` (not the crush) and the teacher didn't see — they peek, then the note is secretly passed around the whole class, row by row, until it reaches the crush.


| id | Name (in-game) | Condition | Staging notes |
|---|---|---|---|
| `coward` | 怂 · 下课铃 | Timer ran out, never threw | Bell rings; the crush leaves chatting with someone else; the ball goes soggy in your sweaty palm |
| `caught_read` | 社死 · 当众朗读 | Suspicion maxed during aim; or the teacher saw the ball and it landed on the crush / a same-gender classmate / the floor | Called to the front; **you read your own letter aloud verbatim** (typewriter + voice); class erupts, crush hides their face, giant "社死" caption |
| `chalk_counter` | 隐藏 · 粉笔头反击 | Ball hits the teacher | Teacher turns slowly, glasses glint; sniper chalk throw; camera follows the chalk to your forehead; white flash |
| `graded` | 隐藏 · 59 分 | Lands on the platform / teacher's desk | Teacher unfolds it and grades your love letter in red chalk on the board: "错别字 3 个，比喻不当，59 分" |
| `three_pointer` | 隐藏 · 三分球 | Lands in the trash bin | Bullet time + basketball-commentator voice, class gives a standing ovation, PE teacher bursts in to recruit you; cut to the basketball court |
| `out_window` | 隐藏 · 校园广播 | Flies out of the window | The ball drifts down to the schoolyard; the principal picks it up and reads it tenderly over the school-wide PA |
| `confetti` | 隐藏 · 心碎成雪 | Shredded by a fan | Heart-shaped scraps fall like snow; everyone looks up — "下雪了"; the crush catches one piece |
| `self_love` | 隐藏 · 爱自己 | Lands back on your own desk/chair | You unfold your own letter and are moved by it; camera pulls back; philosophical caption |
| `wrong_caught` | 误投 A · 请家长 | Opposite-gender non-crush AND (teacher saw OR recipient is a snitch type) | Office, rain outside, parents summoned, 3000-character self-criticism; melodramatic music |
| `same_gender` | 误投 · 认真的回应 | Same-gender (as the player) non-crush, teacher didn't see | They read it, stand up solemnly: "……我愿意。" Warm, absurd rom-com montage; the crush cracks in the background |
| `wrong_accept` | 误投 B · 将错就错 | Opposite-gender non-crush, unseen, not a snitch type | They shyly accept; a baffling "and somehow we're dating" montage |
| `perfect` | 完美 · 天台之约 | Lands on the crush's desk and the teacher didn't see | They read it and blush, write a reply and throw it back (camera follows it in reverse): "放学后天台见"; heart iris transition to a sunset rooftop |
| `lost` | 隐藏 · 石沉大海 | Floor / aisle far from everyone, nobody was hit (unseen) | Nobody notices; night, empty classroom; the janitor sweeps it into a dustpan (ball's POV) |

> `same_gender` must be **warm absurdist comedy**: the joke is the mix-up and the other person's earnestness — never mocking same-sex romance.

## 8. Controls

| Input | aim | flight |
|---|---|---|
| Mouse move / touch drag | Look (cursor position maps to limited yaw ±75° / pitch −35°…+45°, smoothed) | — |
| LMB hold / release | Charge / throw | — |
| RMB or Space hold | Pretend to study | Space: hold breath (slow-mo + telekinesis) |
| A / D | — | Telekinesis nudge (while holding breath) |
| C | — | Cycle camera |
| Esc | Pause | Pause |
| Click / Space | Skip/advance dialogue in cutscenes | |

## 9. Art and audio direction

- Palette: 3–4 pm sun slanting in from the left windows, dust motes, cream walls, green blackboard, light-wood desks, blue-and-white tracksuit uniforms.
- Characters: chibi proportions (~1:3.5 head-to-body), inverted-hull outlines, canvas-drawn faces (eyes, blush, sweat drops, heart eyes).
- Music: fully procedural WebAudio. Lazy lo-fi classroom (clock ticks + adaptive tension layer), bouncy pizzicato for the flight, romantic piano, comedic bassoon, melodramatic violin, social-death awkwardness (crickets + tuba), hype sports track for the commentator, school PA broadcast. Dialogue is **voiced with real Chinese speech** (speechSynthesis zh-CN, per-character pitch/rate) whenever the browser has a Chinese voice; soft syllable blips are only the fallback. A setting lets players choose voice / blips / off (playtest round 1).

## 10. Technology

- three.js r170 (`vendor/three`, import map), **no build step**, ES modules, `node serve.mjs`.
- All art assets are procedural (three.js geometry + canvas textures) — no external model files. Physics is a small in-house sphere vs box/OBB/sphere solver (deterministic and testable).
- Testing: Playwright + headless Chromium (SwiftShader); deterministic fast-forward via the `window.__qs` debug API; screenshots reviewed visually by the QA agent.
