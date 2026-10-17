// Classroom layout — pure data shared by every module (owner: lead).
// Units are metres. +Y is up. Students sit facing -Z (toward the blackboard on the front wall).
// Never hard-code these numbers elsewhere: import them from here.

export const ROOM = { minX: -5, maxX: 5, minZ: -6, maxZ: 4.5, height: 3.2 };

export const DESK = { w: 0.6, d: 0.45, topY: 0.74, top: 0.03 };          // desk top surface at y = topY
export const CHAIR = { w: 0.42, d: 0.4, seatY: 0.44, backTopY: 0.86, behind: 0.42 }; // chair centre = desk centre + behind (in +Z)

// 3 pairs of 同桌 desks per row, aisles of ~1.5 m between pairs and ~1.6 m along the walls.
export const COLS_X = [-3.12, -2.48, -0.32, 0.32, 2.48, 3.12];
export const ROWS_Z = [-3.2, -1.95, -0.7, 0.55, 1.8];
export const AISLES_X = [-4.2, -1.4, 1.4, 4.2];

export const PLAYER_SEAT = 'r4c0';                // window side, back row — the protagonist seat
export const EYE_Y_SEATED = 1.24;                 // seated eye height (stylised: high enough to see over the big chibi heads in front)
export const HEAD_Y_SEATED = 1.08;                // seated head centre (for colliders / look-at)

/** @typedef {{id:string,row:number,col:number,x:number,deskZ:number,chairZ:number,deskTopY:number,deskmate:string,isPlayer:boolean}} Seat */
/** @type {Seat[]} */
export const SEATS = [];
for (let r = 0; r < ROWS_Z.length; r++) {
  for (let c = 0; c < COLS_X.length; c++) {
    const id = `r${r}c${c}`;
    SEATS.push({
      id, row: r, col: c, x: COLS_X[c], deskZ: ROWS_Z[r], chairZ: ROWS_Z[r] + CHAIR.behind,
      deskTopY: DESK.topY, deskmate: `r${r}c${c ^ 1}`, isPlayer: id === PLAYER_SEAT,
    });
  }
}
export const SEAT_BY_ID = Object.fromEntries(SEATS.map((s) => [s.id, s]));
export const PLAYER_EYE = { x: SEAT_BY_ID[PLAYER_SEAT].x, y: EYE_Y_SEATED, z: SEAT_BY_ID[PLAYER_SEAT].chairZ };

// Front of the room.
export const PLATFORM = { minX: -4.2, maxX: 4.2, minZ: -6, maxZ: -4.6, h: 0.2 };       // 讲台 (raised floor)
export const TEACHER_DESK = { x: 0, z: -4.95, w: 1.3, d: 0.6, topY: 1.15 };            // 讲桌, top surface y
export const BLACKBOARD = { x: 0, y: 1.7, z: -5.96, w: 4.8, h: 1.3 };                  // writable face at z
export const TEACHER_SPOTS = {
  board: [{ x: -1.6, z: -5.45 }, { x: 0, z: -5.45 }, { x: 1.6, z: -5.45 }],              // facing -Z to write
  lecture: [{ x: -1.2, z: -5.1 }, { x: 0, z: -5.3 }, { x: 1.2, z: -5.1 }],               // facing +Z to talk
  patrolAisles: [-1.4, 1.4],                                                            // walk down these x lines
};

// Walls.
export const WINDOWS = [                                                                // left wall x = minX
  { id: 'w0', x: -5, z: -3.6, w: 1.8, sillY: 1.0, h: 1.5, open: false },
  { id: 'w1', x: -5, z: -0.7, w: 1.8, sillY: 1.0, h: 1.5, open: true },                // the open one (ending: out_window)
  { id: 'w2', x: -5, z: 2.2, w: 1.8, sillY: 1.0, h: 1.5, open: false },
];
export const DOORS = [                                                                  // right wall x = maxX
  { id: 'front', x: 5, z: -4.9, w: 1.0, h: 2.1 },
  { id: 'back', x: 5, z: 3.5, w: 1.0, h: 2.1 },
];

// Props that matter for gameplay.
export const TRASH = { x: 4.35, z: -3.9, r: 0.2, h: 0.42 };                            // open-top bin (ending: three_pointer)
export const FANS = [                                                                   // ceiling fans (ending: confetti)
  { id: 'f0', x: -1.4, z: -2.3, bladeY: 2.72, r: 0.68, rps: 2.2 },
  { id: 'f1', x: 1.4, z: 0.9, bladeY: 2.72, r: 0.68, rps: 2.2 },
];
export const WALL_CLOCK = { x: 0, y: 2.75, z: -5.95 };                                 // above the blackboard

export const BALL_RADIUS = 0.04;
