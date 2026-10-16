# World module (`src/world/`): environment, sets, lighting

Owner: qs-env-artist. Contract: `docs/CONTRACTS.md` §4.1. Preview scripts: `dev/world/*.js` (screenshots go to `dev/world/shots/`).

## Files

| File | What |
|---|---|
| `index.js` | `install(ctx)`: builds the classroom, set cache, collider debug overlay, `round:setup` reset |
| `classroom.js` | Classroom geometry + colliders (all numbers from `src/core/layout.js`), outside view, lights, moods, wind |
| `fixtures.js` | Ceiling fans (+ dynamic OBB colliders), curtains (CPU cloth), wall clock |
| `blackboard.js` | Chalk board on two 1024×560 canvas textures, per-glyph chalk rendering, typewriter `append` |
| `atmos.js` | Sky dome shader, stars, clouds, rain, petals, light shafts, dust motes, lowfx sun patches, low-poly trees |
| `sets.js` | The six ending sets plus a fallback set; anchors |
| `kit.js` | `Batch` geometry merging (vertex colours), collider helpers, toon ramp, canvas helpers |
| `textures.js`, `setTextures.js` | Procedural canvas textures (all ≤ 1024²) |
| `palette.js` | Shared palette (see below) |

## Contract surface (unchanged) and additions

`ctx.world.classroom` exposes everything in §4.1. Additions (safe to ignore):

- `classroom.dynamicColliders(tOffset = 0)`: optional time offset in seconds, so the solver can sample the blades mid-frame (`angle + omega * tOffset`). Blades of a fan that has fully stopped are returned with tag `'prop'` (harmless bounce) instead of `'fan'`. Each OBB carries `velocity` (tangential speed at the blade centre).
- `classroom.fans[i]`: also has `omega` (current rad/s). Set `spinning = false` to spin a fan down smoothly; `setMood('night')` stops both fans.
- `classroom.gust(strength, dur)` returns a Promise that resolves after `dur` game seconds. Envelope: 0.25 s smooth attack, then a smooth release over the last 45 % of `dur`. Overlapping gusts take the max. `wind.dir` is a constant `(1, 0, 0)` (into the room). `wind.strength` is **0 unless a gust is active**: the ambient breeze only moves the curtains and never affects the ball.
- `classroom.blackboard`:
  - `write(text)` shows immediately, `append(text)` reveals one character at a time at `blackboard.speed` chars per game second (default 14), `clear()`, `text` (raw string as written, markup included).
  - Extras: `isWriting` (true while `append` is still revealing), `flush()` (reveal everything now), `speed`.
  - Inline markup, not drawn: `[[white]] [[yellow]] [[red]] [[pink]] [[blue]] [[green]]` switch chalk colour; `[[big]] [[small]] [[normal]]` switch size. Unknown `[[tags]]` are drawn literally. Example: `'错别字 3 个\n[[big]][[red]]59 分'`.
  - Long lines wrap automatically; when the board is full, the oldest lines scroll off the top.
  - A date / duty-roster strip on the right edge is part of the board background and survives `clear()`.
- `classroom.clock.set(minutes, seconds)` shows 15:mm:ss and switches the clock to manual until the next `round:setup`. In **auto** mode (default) the clock reads `15:45:00 − ctx.round.timeLeft` during intro/aim/flight, so the bell rings at 15:45 with the second hand ticking down. Extra: `clock.auto()`.
- `classroom.setMood(name)`: `'day' | 'sunset' | 'night' | 'rain'`. Unknown names fall back to `'day'`. Also exposed: `classroom.mood`. Moods change the sun (direction, colour, intensity), hemisphere and ambient light, fluorescent tubes on/off, sky dome, clouds, the opposite building's lit windows (night), rain streaks, light shafts, dust and exposure. If the classroom is the current stage, the exposure is applied immediately.
- `classroom.reset()`: day mood, empty board, no wind, auto clock, fans on. Called on every `round:setup`; the back-wall newspaper also changes theme per round (`classroom.setNewspaper(0..2)`).
- `ctx.world.showColliders(on)` draws every static collider as a wireframe (desks blue, chairs violet, books orange, triggers green, others yellow) plus live fan OBBs in red. It is enabled automatically with `?debug=1`.
- `ctx.world.setNames`: list of the built-in set names. `ctx.world.sets`: the cache (Map).

## Colliders (§5)

About 630 static colliders, all axis-aligned boxes except the triggers. Each collider is built from the same numbers as its visible box (`makeSolid`), so they are aligned to within 1.5 cm (trim and rims stay ≤ 1.5 cm proud).

| tag | what | ownerId |
|---|---|---|
| `floor` | floor slab (extends 1 m past the walls) | |
| `ceiling` | ceiling slab | |
| `wall` | walls (with door and window holes), door architraves, back-wall newspaper frame | |
| `windowFrame` | window sill / head / jambs, meeting stile, transom rail, inner sill ledges | |
| `windowGlass` | glass of the two closed windows (`w0`, `w2`) | |
| `door` | the two closed doors | |
| `podium` | the platform | |
| `teacherDesk` | lectern body + top, thermos, chalk box, lesson plan | |
| `blackboard` | board face, aluminium frame, chalk tray + lip | |
| `desk` | desk top, compartment (shelf, front, sides; open toward the student), 4 legs | seat id |
| `chair` | seat, backrest, rear legs/posts, front legs | seat id |
| `book` | flat textbook stacks, upright "book walls" at the front edge, open books | seat id |
| `prop` | pencil cases, bottles, hanging school bags (ownerId = seat id); lockers, dispenser, basketball, globe, speaker box, light fixtures, curtain rods, fan motor/downrod (ownerId = fan id), plant pots, brooms | seat id / fan id / none |
| `trashRim` | the four 1.8 cm walls of the square bin | |
| `trash` (trigger) | the bin interior, up to 5 cm below the rim | |
| `outside` (trigger) | everything at x < `ROOM.minX − 0.15` (only reachable through the open window `w1`) | |
| `fan` (dynamic OBB) | 3 blades per fan, from r = 0.10 to `FANS[i].r`, 13 cm wide, half-height 2 cm (visible blades are 1.2 cm thick) | fan id |

Desk props come from a fixed seed (`ctx.makeRng('world/desks')`), so colliders are identical on every boot and for every round seed. Book stacks and book walls stay in the front 20 cm of the desk, so the desk centre (the `throwAt` target) is always clear.

Verified with the real gameplay solver (`dev/world/throws.js`, `dev/world/seats.js`): `trash` → `trash`, `window` → `outside`, `podium` → `podium`, `self` → `self`, and all 29 non-player seats → `desk` on the right seat (29/29).

## Ending sets

`buildSet(name)` builds lazily and caches. Unknown names return a simple outdoor fallback set (never throws). Anchors are wrapped in a Proxy: an unknown key logs one `console.warn` and returns a sane default (`{pos:(0,0,0), yaw:0}`, or a camera placement for `cam*` keys). Character anchors: `pos` is on the floor at the character's feet, and `yaw` follows the §2 convention. Camera anchors: `{pos, look, fov}`.

| set | anchors (contract) | extras / notes |
|---|---|---|
| `rooftop` | `left` `right` (1.2 m apart, facing each other), `door` (in front of the stairwell door, facing the couple), `railing`, `camWide`, `camSunset` | Sunset sky, city skyline, railing. The sun sits low behind the couple (backlit). |
| `office` | `teacherChair` (seat height 0.44 m, yaw π, faces the student), `student`, `parent1`, `parent2`, `desk` (pos = desk-top centre, y = 0.76), `camWide`, `camOverShoulder` | Rain behind the window, monitor, piles of exam papers, a "59" test paper on the desk, 为人师表 calligraphy |
| `cherryPath` | `left` `right`, `bench` (seat 0.44 m high, yaw π/2 = facing the path), `camWide`, `camTrackStart`, `camTrackEnd` | Falling petal particles |
| `court` | `hoop` (pos = rim centre, y = 3.05), `player` (behind the 3-pt line, facing the hoop), `coach`, `crowd0..crowd5` (standing on the 3 bleacher tiers, facing the court), `camWide` | Each crowd anchor also has `sitPos` (root position for a seated pose on that tier) |
| `schoolyard` | `landing`, `principal` (facing the landing), `speaker` (pos = loudspeaker horns, ~4.65 m up), `flagpole`, `camWide`, `camHigh` (from the classroom window, looking down at the landing) | Extra anchor `window` = the open 3rd-floor window on the façade (pos/yaw); waving flag |
| `canteen` | `tableA`, `tableB` (pos = table centre on the floor), `camWide` | Each table anchor also has `top` (table-top centre) and `seats: [{pos, yaw}]` (4 stools, seat height 0.44, facing the table) |

## Lighting and look

- Materials: `MeshToonMaterial` with a shared 3-step ramp (`[0, 0.7, 1]`: back faces get no sun, which avoids shadow acne), mostly vertex coloured and merged per material.
- Sun: a warm directional light through the left windows (3 pm, about 35° elevation, slightly from the front). Its shadows (2048², normal mode only) make the window-pane patches on desks and floor. In **lowfx**, shadows are off and additive window-shaped "sun patches" are projected onto the floor instead.
- Light shafts: additive prisms extruded from each window along the sun direction, with dust motes (320 normal / 90 lowfx) drifting inside them.
- Ceiling: a slight emissive lift per mood (fluorescent bounce).
- Draw calls (classroom only, shadow pass included): about 62; about 60k triangles. Sets: 6–20 draw calls each.

## Palette (sRGB), for the character artist

| Use | Hex |
|---|---|
| Cream wall | `#f4ead3` |
| Mint wainscot / trim | `#8fbf9f` / `#5f9476` |
| Ceiling | `#f8f4ea` |
| Floor wood | `#c08a52`–`#d6a46c` |
| Desk top wood | `#e8c592` |
| Blue-grey steel | `#8ea3b2` (dark `#6c8091`) |
| Chair wood | `#dca66a` |
| Blackboard green | `#2f5a46` |
| Chalk | white `#f4f4ea`, yellow `#fae278`, pink `#f8a8be`, red `#f67060`, blue `#96d2f5` |
| Banner red / gold | `#c8322d` / `#ffd75e` |
| Curtain ivory / hem | `#f8f0d8` / `#a9cfb6` |
| Sun (day) | `#ffdcaa`; sunset `#ff9550`; moon `#9fb6ff` |
| Sky (day) | top `#5fa8ec`, horizon `#dcefff` |
| Trash bin | `#4d9ed2` |

Characters will look most at home with warm skin tones, the blue-and-white tracksuit uniform (`#3d6fb6` / `#f4f4f0` sit well against the cream and mint), and soft dark outlines rather than pure black.

## Known limitations

- The outside view is a static backdrop: trees float (their trunks start below the visible sill line). It is not meant to be seen from outside the window.
- Curtains are not colliders (soft cloth). The open window's casement sashes swing outward and are visual only; the `outside` trigger fires before the ball could reach them.
- The thermos on the teacher's desk is static. If a cutscene gives the teacher a thermos prop, both may be visible.
