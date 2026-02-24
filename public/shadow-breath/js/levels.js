// ============================================
// Shadow Breath — Level Data (Moderate Difficulty)
// Tile Legend:
//   0 = floor, 1 = wall, 2 = door, 3 = table,
//   4 = barrel (hideable), 5 = target, 6 = spawn,
//   7 = torch, 8 = carpet, 9 = window
// ============================================

export const TILE = {
    FLOOR: 0,
    WALL: 1,
    DOOR: 2,
    TABLE: 3,
    BARREL: 4,
    TARGET: 5,
    SPAWN: 6,
    TORCH: 7,
    CARPET: 8,
    WINDOW: 9
};

// Is this tile solid (can't walk through)?
export function isSolid(tile) {
    return tile === TILE.WALL || tile === TILE.TABLE;
}

// Is this tile interactable?
export function isInteractable(tile) {
    return tile === TILE.DOOR || tile === TILE.BARREL;
}

// ============ LEVEL 1: THE DUNGEON ============
// Medium-sized fortress with multiple rooms and corridors
const level1 = {
    name: "THE DUNGEON",
    subtitle: "Infiltrate the underground fortress",
    cols: 18,
    rows: 12,
    breathCapacity: 5,
    timeLimit: 90,
    map: [
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 6, 0, 0, 0, 1, 7, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 1,
        1, 0, 0, 0, 0, 1, 0, 0, 3, 0, 2, 0, 0, 0, 0, 0, 0, 1,
        1, 0, 4, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 3, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 2, 1, 1, 1, 1, 1,
        1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 1, 0, 0, 3, 3, 0, 0, 4, 0, 0, 0, 0, 1,
        1, 7, 0, 4, 0, 1, 1, 1, 1, 2, 1, 1, 1, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 8, 0, 0, 5, 0, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 8, 0, 0, 0, 0, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
    ],
    guards: [
        // Room 2 — patrol guard circling the center table
        {
            type: 'patrol',
            path: [
                { x: 7, y: 2 },
                { x: 9, y: 2 },
                { x: 9, y: 4 },
                { x: 7, y: 4 },
            ],
            speed: 1.0,
            visionRange: 3.5,
            visionAngle: 55
        },
        // Corridor — watcher guarding the door
        {
            type: 'watcher',
            pos: { x: 3, y: 6 },
            speed: 0,
            visionRange: 4,
            visionAngle: 50,
            rotateSpeed: 0.7
        },
        // Room 3 — long horizontal patrol
        {
            type: 'patrol',
            path: [
                { x: 12, y: 5 },
                { x: 16, y: 5 },
                { x: 16, y: 7 },
                { x: 12, y: 7 },
            ],
            speed: 1.3,
            visionRange: 3,
            visionAngle: 60
        },
        // Bottom corridor — fast patrol near the target
        {
            type: 'patrol',
            path: [
                { x: 2, y: 9 },
                { x: 8, y: 9 },
            ],
            speed: 1.6,
            visionRange: 3,
            visionAngle: 55
        },
        // Near target — stationary watcher
        {
            type: 'watcher',
            pos: { x: 13, y: 10 },
            speed: 0,
            visionRange: 3.5,
            visionAngle: 45,
            rotateSpeed: 0.5
        }
    ]
};

// ============ LEVEL 2: THE LABYRINTH ============
// Narrow winding corridors with ambush points
const level2 = {
    name: "THE LABYRINTH",
    subtitle: "Navigate the maze of death",
    cols: 22,
    rows: 14,
    breathCapacity: 4.5,
    timeLimit: 120,
    map: [
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 6, 0, 0, 1, 0, 0, 0, 0, 0, 1, 7, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 1, 0, 3, 0, 0, 0, 2, 0, 0, 0, 4, 0, 1, 0, 0, 0, 0, 1,
        1, 0, 4, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 3, 0, 1,
        1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 2, 1, 1, 1, 0, 0, 0, 0, 1,
        1, 1, 1, 1, 1, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 4, 0, 0, 1,
        1, 0, 3, 0, 1, 1, 1, 2, 1, 1, 7, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 2, 1, 1, 1, 1, 1,
        1, 0, 0, 0, 0, 4, 0, 0, 0, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 7, 0, 1,
        1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 8, 8, 0, 0, 0, 0, 0, 0, 0, 5, 0, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ],
    guards: [
        // Room 1 — patrol between rooms
        {
            type: 'patrol',
            path: [
                { x: 7, y: 1 },
                { x: 7, y: 4 },
                { x: 3, y: 4 },
                { x: 3, y: 1 },
            ],
            speed: 1.2,
            visionRange: 3,
            visionAngle: 55
        },
        // Central room — watcher at intersection
        {
            type: 'watcher',
            pos: { x: 13, y: 2 },
            speed: 0,
            visionRange: 4,
            visionAngle: 50,
            rotateSpeed: 0.8
        },
        // Top right room — fast patrol
        {
            type: 'patrol',
            path: [
                { x: 18, y: 1 },
                { x: 20, y: 1 },
                { x: 20, y: 3 },
                { x: 18, y: 3 },
            ],
            speed: 1.5,
            visionRange: 3,
            visionAngle: 60
        },
        // Central corridor — long patrol
        {
            type: 'patrol',
            path: [
                { x: 6, y: 5 },
                { x: 16, y: 5 },
                { x: 16, y: 7 },
                { x: 6, y: 7 },
            ],
            speed: 1.4,
            visionRange: 3.5,
            visionAngle: 55
        },
        // Bottom-left area — patrol
        {
            type: 'patrol',
            path: [
                { x: 2, y: 8 },
                { x: 2, y: 11 },
                { x: 5, y: 11 },
                { x: 5, y: 8 },
            ],
            speed: 1.1,
            visionRange: 3,
            visionAngle: 60
        },
        // Bottom-right near target — watcher
        {
            type: 'watcher',
            pos: { x: 15, y: 11 },
            speed: 0,
            visionRange: 4.5,
            visionAngle: 55,
            rotateSpeed: 0.6
        },
        // Target room entrance — fast guard
        {
            type: 'patrol',
            path: [
                { x: 11, y: 10 },
                { x: 11, y: 12 },
                { x: 18, y: 12 },
                { x: 18, y: 10 },
            ],
            speed: 1.6,
            visionRange: 3,
            visionAngle: 50
        }
    ]
};

// ============ LEVEL 3: THE THRONE ROOM ============
// Large open throne room with heavily guarded target
const level3 = {
    name: "THE THRONE ROOM",
    subtitle: "Eliminate the tyrant king",
    cols: 24,
    rows: 16,
    breathCapacity: 4,
    timeLimit: 150,
    map: [
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 6, 0, 0, 0, 1, 9, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 9, 1, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1,
        1, 0, 4, 0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 1, 0, 0, 4, 0, 1,
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 1, 1,
        1, 7, 0, 0, 0, 0, 0, 0, 8, 8, 8, 8, 8, 8, 8, 8, 0, 0, 0, 0, 0, 0, 7, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 1,
        1, 0, 0, 4, 0, 0, 0, 0, 8, 0, 0, 5, 0, 0, 0, 8, 0, 0, 0, 0, 4, 0, 0, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 1,
        1, 7, 0, 0, 0, 0, 0, 0, 8, 8, 8, 8, 8, 8, 8, 8, 0, 0, 0, 0, 0, 0, 7, 1,
        1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 1, 1,
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        1, 0, 4, 0, 0, 2, 0, 0, 3, 0, 0, 0, 0, 0, 0, 3, 0, 0, 2, 0, 0, 4, 0, 1,
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ],
    guards: [
        // Left wing — patrol
        {
            type: 'patrol',
            path: [
                { x: 2, y: 1 },
                { x: 2, y: 4 },
                { x: 4, y: 4 },
                { x: 4, y: 1 },
            ],
            speed: 1.2,
            visionRange: 3.5,
            visionAngle: 55
        },
        // Right wing — patrol
        {
            type: 'patrol',
            path: [
                { x: 20, y: 1 },
                { x: 22, y: 1 },
                { x: 22, y: 4 },
                { x: 20, y: 4 },
            ],
            speed: 1.2,
            visionRange: 3.5,
            visionAngle: 55
        },
        // Top corridor — long fast patrol
        {
            type: 'patrol',
            path: [
                { x: 7, y: 2 },
                { x: 16, y: 2 },
                { x: 16, y: 4 },
                { x: 7, y: 4 },
            ],
            speed: 1.5,
            visionRange: 4,
            visionAngle: 50
        },
        // Left throne approach — watcher
        {
            type: 'watcher',
            pos: { x: 6, y: 7 },
            speed: 0,
            visionRange: 4.5,
            visionAngle: 55,
            rotateSpeed: 0.6
        },
        // Right throne approach — watcher
        {
            type: 'watcher',
            pos: { x: 17, y: 8 },
            speed: 0,
            visionRange: 4.5,
            visionAngle: 55,
            rotateSpeed: 0.6
        },
        // Throne inner patrol — circling the throne
        {
            type: 'patrol',
            path: [
                { x: 9, y: 7 },
                { x: 14, y: 7 },
                { x: 14, y: 9 },
                { x: 9, y: 9 },
            ],
            speed: 0.9,
            visionRange: 3,
            visionAngle: 65
        },
        // Bottom corridor — patrol
        {
            type: 'patrol',
            path: [
                { x: 7, y: 12 },
                { x: 16, y: 12 },
                { x: 16, y: 14 },
                { x: 7, y: 14 },
            ],
            speed: 1.4,
            visionRange: 3.5,
            visionAngle: 55
        },
        // Bottom left room — patrol
        {
            type: 'patrol',
            path: [
                { x: 2, y: 12 },
                { x: 4, y: 12 },
                { x: 4, y: 14 },
                { x: 2, y: 14 },
            ],
            speed: 1.1,
            visionRange: 3,
            visionAngle: 60
        },
        // Bottom right room — watcher
        {
            type: 'watcher',
            pos: { x: 21, y: 13 },
            speed: 0,
            visionRange: 4,
            visionAngle: 50,
            rotateSpeed: 0.7
        }
    ]
};

export const LEVELS = [level1, level2, level3];
