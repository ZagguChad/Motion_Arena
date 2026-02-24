// ============================================
// Ghost of the Breath Temple — Level Definitions
// Each level defines a breathing pattern + ghost behavior
// ============================================

export const LEVELS = [
    // ─── LEVEL 1: CALM BREATH ───
    {
        name: "THE AWAKENING",
        subtitle: "Breathe slowly... calm the flame",
        description: "Match a slow, steady breathing rhythm",
        pattern: [3500],                // one breath every 3.5 seconds
        tolerance: 500,                 // ±500ms — generous
        duration: 45,                   // seconds to survive
        flameDecayRate: 0.08,           // how fast flame dims on miss
        flameGrowRate: 0.15,            // how fast flame grows on hit
        ghostSpeed: 0.3,               // ghost approach speed
        ghostRetreatSpeed: 0.5,        // ghost retreat speed on good accuracy
        ghostAppearThreshold: 0.5,     // accuracy below this = ghost appears
        requiredAccuracy: 0.5,         // minimum accuracy to win
        bgColor: [10, 8, 20],          // deep dark purple
        flameColor: [255, 160, 50],    // warm orange
        guideMessage: "BREATHE every 3.5 seconds"
    },

    // ─── LEVEL 2: BOX BREATHING ───
    {
        name: "THE DISCIPLINE",
        subtitle: "Box breathing... structure your breath",
        description: "Breath, pause, breath, pause — equal intervals",
        pattern: [3000, 3000],          // breath, wait 3s, breath, wait 3s
        tolerance: 400,                 // ±400ms — tighter
        duration: 60,
        flameDecayRate: 0.10,
        flameGrowRate: 0.12,
        ghostSpeed: 0.5,
        ghostRetreatSpeed: 0.4,
        ghostAppearThreshold: 0.55,
        requiredAccuracy: 0.55,
        bgColor: [8, 12, 25],
        flameColor: [255, 140, 80],
        guideMessage: "BREATHE every 3 seconds — stay steady"
    },

    // ─── LEVEL 3: KAPALABHATI ───
    {
        name: "THE TEMPEST",
        subtitle: "Rapid fire... kapalabhati breathing",
        description: "Fast rhythmic bursts of breath",
        pattern: [800],                 // rapid — one breath every 0.8s
        tolerance: 250,                 // ±250ms — tight
        duration: 40,
        flameDecayRate: 0.15,
        flameGrowRate: 0.10,
        ghostSpeed: 0.7,
        ghostRetreatSpeed: 0.3,
        ghostAppearThreshold: 0.6,
        requiredAccuracy: 0.55,
        bgColor: [20, 5, 10],
        flameColor: [255, 100, 40],
        guideMessage: "RAPID breaths — 0.8 seconds apart"
    },

    // ─── LEVEL 4: GHOST'S GAME ───
    {
        name: "THE GHOST'S GAME",
        subtitle: "The ghost controls the rhythm now...",
        description: "Dynamic patterns that shift mid-level",
        pattern: [2500],                // starts here, ghost changes it
        tolerance: 350,
        duration: 75,
        flameDecayRate: 0.12,
        flameGrowRate: 0.10,
        ghostSpeed: 0.8,
        ghostRetreatSpeed: 0.25,
        ghostAppearThreshold: 0.6,
        requiredAccuracy: 0.5,
        bgColor: [15, 5, 25],
        flameColor: [200, 120, 255],    // purple-tinted flame
        guideMessage: "Follow the ghost's rhythm...",
        // Ghost pattern shift config
        ghostPatterns: [
            { pattern: [2500], beats: 8, name: "SLOW" },
            { pattern: [1200], beats: 8, name: "MEDIUM" },
            { pattern: [800], beats: 6, name: "FAST" },
            { pattern: [3000], beats: 6, name: "DEEP" },
            { pattern: [600], beats: 10, name: "FRENZY" },
            { pattern: [2000, 1000], beats: 8, name: "SYNCOPATED" },
        ],
        ghostShiftInterval: 10        // seconds between pattern shifts
    }
];
