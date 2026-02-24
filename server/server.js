// ============================================================
// TOWER SIEGE — Push-Up Powered Tower Capture Game
// Server: HTTP + HTTPS + WebSocket + Game Engine + AI Mode
// ============================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const os = require('os');

// ── Config ──────────────────────────────────────────────────
const PORT = 3000;
const HTTPS_PORT = 3443;
const GAME_DURATION = 90;           // seconds
const TICK_RATE = 30;               // game ticks per second (30 is enough)
const TICK_MS = 1000 / TICK_RATE;
const SOLDIERS_PER_PUSHUP = 4;      // soldiers spawned per real push-up
const PASSIVE_HOME = 0.3;           // TINY passive: 0.3 soldiers/sec at home ONLY
const PASSIVE_TOWER = 0;            // NO passive at captured towers — push-ups only!
const DEPLOY_INTERVAL = 3000;       // ms between auto-deploys (slower = more strategic)
const MARCH_DURATION = 2000;        // ms to march one path segment (a bit slower)
const MIN_DEPLOY = 5;               // need at least 5 soldiers to auto-deploy
const DEPLOY_RATIO_NEUTRAL = 0.4;   // send 40% to neutral towers (conservative)
const DEPLOY_RATIO_ATTACK = 0.5;    // send 50% to attack enemy towers

// ── AI Config ───────────────────────────────────────────────
const AI_BASE_RATE = 0.75;          // AI targets 75% of player's recent rate
const AI_SURGE_CHANCE = 0.08;       // 8% chance of a surge tick
const AI_SURGE_MULTIPLIER = 1.2;    // During surge, AI does 120% of player rate
const AI_MIN_INTERVAL = 3000;       // Min 3s between AI push-ups
const AI_MAX_INTERVAL = 15000;      // Max 15s between AI push-ups (AI can stall if player stalls)
const AI_WARMUP = 5000;             // 5s warmup before AI starts
const AI_IDLE_THRESHOLD = 10000;    // If player hasn't pushed in 10s, AI also slows massively

// ── MIME types ──────────────────────────────────────────────
const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

// ── Get local IP ────────────────────────────────────────────
function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return '127.0.0.1';
}

// ── Map Definition ──────────────────────────────────────────
function createMap(canvasW = 1200, canvasH = 700) {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const towers = [
        { id: 0, x: cx - 300, y: cy - 220, owner: 'neutral', soldiers: 0, name: 'N1' },
        { id: 1, x: cx, y: cy - 250, owner: 'neutral', soldiers: 0, name: 'N2' },
        { id: 2, x: cx + 300, y: cy - 220, owner: 'neutral', soldiers: 0, name: 'N3' },
        { id: 3, x: cx - 150, y: cy - 110, owner: 'neutral', soldiers: 0, name: 'N4' },
        { id: 4, x: cx + 150, y: cy - 110, owner: 'neutral', soldiers: 0, name: 'N5' },
        { id: 5, x: cx - 350, y: cy, owner: 'blue', soldiers: 15, name: 'B1' },
        { id: 6, x: cx, y: cy, owner: 'neutral', soldiers: 0, name: 'N6' },
        { id: 7, x: cx + 350, y: cy, owner: 'red', soldiers: 15, name: 'R1' },
        { id: 8, x: cx - 150, y: cy + 110, owner: 'neutral', soldiers: 0, name: 'N7' },
        { id: 9, x: cx + 150, y: cy + 110, owner: 'neutral', soldiers: 0, name: 'N8' },
        { id: 10, x: cx - 300, y: cy + 220, owner: 'neutral', soldiers: 0, name: 'N9' },
        { id: 11, x: cx, y: cy + 250, owner: 'neutral', soldiers: 0, name: 'N10' },
        { id: 12, x: cx + 300, y: cy + 220, owner: 'neutral', soldiers: 0, name: 'N11' },
    ];

    const edges = [
        [0, 1], [1, 2],
        [0, 3], [1, 3], [1, 4], [2, 4],
        [0, 5], [3, 5], [3, 6], [4, 6], [4, 7], [2, 7],
        [5, 6], [6, 7],
        [5, 8], [6, 8], [6, 9], [7, 9],
        [8, 10], [8, 11], [9, 11], [9, 12],
        [10, 11], [11, 12],
        [5, 10], [7, 12],
    ];

    return { towers, edges };
}

// ── Game State ──────────────────────────────────────────────
let game = null;

function createGame(mode = 'pvp') {
    const map = createMap();
    return {
        mode,                // 'pvp' or 'ai'
        phase: 'lobby',
        timer: GAME_DURATION,
        countdownTimer: 3,
        players: {
            blue: { ws: null, pushups: 0, totalSoldiers: 0, towersOwned: 1, ready: false, lastPushupTime: 0, deployMode: 'auto', headDirection: 'center' },
            red: { ws: null, pushups: 0, totalSoldiers: 0, towersOwned: 1, ready: false, lastPushupTime: 0, isAI: mode === 'ai', deployMode: 'auto', headDirection: 'center' },
        },
        towers: map.towers,
        edges: map.edges,
        marching: [],
        events: [],
        lastPassiveTick: Date.now(),
        lastDeployTick: Date.now(),
        winner: null,
        display: null,
        // AI state
        ai: {
            lastPushupTime: 0,
            pushupRate: 0,
            rateSamples: [],
            nextPushupAt: 0,
            isSurging: false,
            surgeEnd: 0,
            gameStartTime: 0,
            playerSnapshot: null,   // tracks player rate in 5s windows
        },
    };
}

// ── Adjacency helper ────────────────────────────────────────
function getAdjacent(towerId) {
    const adj = [];
    for (const [a, b] of game.edges) {
        if (a === towerId) adj.push(b);
        if (b === towerId) adj.push(a);
    }
    return adj;
}

// ── Game Logic ──────────────────────────────────────────────
function addSoldiersFromPushup(team, count) {
    const player = game.players[team];
    const newPushups = count - player.pushups;
    if (newPushups <= 0) return;  // no new push-ups
    if (newPushups > 3) return;   // reject jumps > 3 at once (anti-cheat)

    // Anti-cheat: minimum time between push-ups (skip for AI)
    if (!player.isAI) {
        const now = Date.now();
        const timeSinceLast = now - player.lastPushupTime;

        // A real push-up takes at LEAST 800ms (down + up)
        if (timeSinceLast < 800 && newPushups > 0) {
            console.log(`[ANTI-CHEAT] ${team} push-up too fast: ${timeSinceLast}ms — rejected`);
            return;
        }
        player.lastPushupTime = now;
    }

    player.pushups = count;

    // Soldiers spawn ONLY at the team's home base
    const homeId = team === 'blue' ? 5 : 7;
    const home = game.towers[homeId];
    if (home.owner === team) {
        const soldiers = newPushups * SOLDIERS_PER_PUSHUP;
        home.soldiers += soldiers;
        game.events.push(`${team}_pushup_${count}`);
        console.log(`[GAME] ${team}: +${newPushups} push-up(s) → +${soldiers} soldiers (total: ${player.pushups})`);
    }
}

// ── AI Adaptive Logic ───────────────────────────────────────
// The AI mirrors the player's effort. If the player stops, the AI slows way down.
// The AI should NEVER carry the game — it should feel like a fair opponent.
function updateAI() {
    if (game.mode !== 'ai' || game.phase !== 'playing') return;

    const now = Date.now();
    const elapsed = now - game.ai.gameStartTime;

    // Warmup: AI doesn't push during first few seconds
    if (elapsed < AI_WARMUP) return;

    // Track player's RECENT push-up activity (last 15 seconds, not entire game)
    const playerPushups = game.players.blue.pushups;
    const prevSnapshot = game.ai.playerSnapshot || { pushups: 0, time: now };
    const windowMs = now - prevSnapshot.time;

    // Take a snapshot every 5 seconds to measure recent rate
    if (windowMs >= 5000) {
        const recentPushups = playerPushups - prevSnapshot.pushups;
        const recentRate = recentPushups / (windowMs / 1000); // pushups/sec
        game.ai.playerSnapshot = { pushups: playerPushups, time: now };

        // Smooth the rate with previous samples
        game.ai.rateSamples.push(recentRate);
        if (game.ai.rateSamples.length > 4) game.ai.rateSamples.shift();
    }

    // Calculate smoothed player rate from recent windows
    const avgRate = game.ai.rateSamples.length > 0
        ? game.ai.rateSamples.reduce((a, b) => a + b, 0) / game.ai.rateSamples.length
        : 0;

    // CHECK: Is the player actually doing push-ups?
    const timeSincePlayerPush = now - game.players.blue.lastPushupTime;
    const playerIsIdle = timeSincePlayerPush > AI_IDLE_THRESHOLD;

    // If player is idle, AI slows down dramatically (1 push-up every 12-15s)
    if (playerIsIdle && playerPushups > 0) {
        // AI does occasional weak push-ups but doesn't rush
        if (now >= game.ai.nextPushupAt) {
            doAIPushup(now);
            game.ai.nextPushupAt = now + 12000 + Math.random() * 5000; // 12-17s
        }
        return;
    }

    // If player has done 0 push-ups total, AI does nothing
    if (playerPushups === 0) return;

    // Decide if AI should surge
    if (!game.ai.isSurging && Math.random() < AI_SURGE_CHANCE * (TICK_MS / 1000)) {
        game.ai.isSurging = true;
        game.ai.surgeEnd = now + 3000 + Math.random() * 3000; // 3-6 sec surge
    }
    if (game.ai.isSurging && now > game.ai.surgeEnd) {
        game.ai.isSurging = false;
    }

    // AI targets a fraction of the player's rate
    const multiplier = game.ai.isSurging ? AI_SURGE_MULTIPLIER : AI_BASE_RATE;
    let aiTargetRate = avgRate * multiplier;

    // NO minimum rate — if player does nothing, AI does nothing
    if (aiTargetRate <= 0.01) return;  // effectively zero, skip

    // Calculate interval from rate
    const interval = Math.max(AI_MIN_INTERVAL, Math.min(AI_MAX_INTERVAL, 1000 / aiTargetRate));

    // Time for a push-up?
    if (now >= game.ai.nextPushupAt) {
        doAIPushup(now);
        const jitter = interval * (0.8 + Math.random() * 0.4);
        game.ai.nextPushupAt = now + jitter;
    }
}

function doAIPushup(now) {
    const aiPlayer = game.players.red;
    aiPlayer.pushups++;
    aiPlayer.lastPushupTime = now;

    const homeId = 7;
    const home = game.towers[homeId];
    if (home.owner === 'red') {
        home.soldiers += SOLDIERS_PER_PUSHUP;
        game.events.push(`red_pushup_${aiPlayer.pushups}`);
    }
}

function passiveGeneration() {
    const now = Date.now();
    const elapsed = now - game.lastPassiveTick;
    if (elapsed < 1000) return;
    game.lastPassiveTick = now;

    // ONLY home bases get a tiny trickle — and ONLY if the player has done push-ups
    for (const tower of game.towers) {
        if (tower.owner === 'neutral') continue;
        const isBlueHome = tower.id === 5 && tower.owner === 'blue';
        const isRedHome = tower.id === 7 && tower.owner === 'red';

        if (isBlueHome || isRedHome) {
            // Only generate passively if the team has done at least 1 push-up
            const teamPushups = game.players[tower.owner].pushups;
            if (teamPushups > 0) {
                tower.soldiers += PASSIVE_HOME;  // 0.3/sec — very small
            }
        }
        // NO passive gen for non-home towers
    }
}

// ── Manual Deploy (head gesture) ────────────────────────────
function manualDeploy(team, direction) {
    if (!game || game.phase !== 'playing') return;

    const player = game.players[team];
    if (player.deployMode !== 'manual') return;

    // Find the team's home tower
    const homeId = team === 'blue' ? 5 : 7;
    const home = game.towers[homeId];
    if (home.owner !== team) return;
    if (home.soldiers < MIN_DEPLOY) {
        console.log(`[MANUAL] ${team}: not enough soldiers (${Math.floor(home.soldiers)})`);
        return;
    }

    const adj = getAdjacent(homeId);
    if (adj.length === 0) return;

    // Map direction to tower selection
    // Sort adjacent towers by x-position to determine left/right
    const adjTowers = adj.map(id => ({ id, ...game.towers[id] }));
    adjTowers.sort((a, b) => a.x - b.x);

    let targetTower = null;
    if (direction === 'left') {
        // Pick the leftmost adjacent tower (by x coordinate)
        targetTower = adjTowers[0];
    } else if (direction === 'right') {
        // Pick the rightmost adjacent tower
        targetTower = adjTowers[adjTowers.length - 1];
    }

    if (!targetTower) return;
    if (targetTower.owner === team) {
        // If it's our own tower, try the NEXT one in that direction
        const ownAdj = getAdjacent(targetTower.id);
        const nextOpts = ownAdj
            .map(id => ({ id, ...game.towers[id] }))
            .filter(t => t.owner !== team && t.id !== homeId);
        if (nextOpts.length > 0) {
            nextOpts.sort((a, b) => direction === 'left' ? a.x - b.x : b.x - a.x);
            targetTower = nextOpts[0];
        } else {
            console.log(`[MANUAL] ${team}: no valid target ${direction}`);
            return;
        }
    }

    // Check for existing march
    const alreadyMarching = game.marching.some(
        m => m.to === targetTower.id && m.owner === team
    );
    if (alreadyMarching) {
        console.log(`[MANUAL] ${team}: troops already marching to tower ${targetTower.id}`);
        return;
    }

    // Send troops!
    const garrison = Math.max(3, Math.floor(home.soldiers * 0.2));
    const toSend = Math.floor(home.soldiers - garrison);
    if (toSend < 3) return;

    home.soldiers -= toSend;
    game.marching.push({
        from: homeId,
        to: targetTower.id,
        owner: team,
        count: toSend,
        startTime: Date.now(),
        progress: 0,
    });

    game.events.push(`${team}_deploy_${direction}`);
    console.log(`[MANUAL] ${team}: sent ${toSend} troops ${direction} to tower ${targetTower.id} (${targetTower.name})`);
}

function autoDeploy() {
    const now = Date.now();
    if (now - game.lastDeployTick < DEPLOY_INTERVAL) return;
    game.lastDeployTick = now;

    for (const tower of game.towers) {
        if (tower.owner === 'neutral') continue;
        if (tower.soldiers < MIN_DEPLOY) continue;  // need at least 5

        // SKIP auto-deploy for teams in MANUAL deploy mode
        // (except home base auto-sends for AI, which is always auto)
        const teamPlayer = game.players[tower.owner];
        if (teamPlayer && teamPlayer.deployMode === 'manual' && !teamPlayer.isAI) {
            continue;  // player controls deployment manually
        }

        // Keep a garrison — never send more than you can afford
        const garrison = Math.max(3, Math.floor(tower.soldiers * 0.3));
        const available = tower.soldiers - garrison;
        if (available < 3) continue;  // not enough to send after garrison

        const adj = getAdjacent(tower.id);
        const targets = [];

        // Priority 1: neutral towers adjacent
        for (const id of adj) {
            const t = game.towers[id];
            if (t.owner === 'neutral') targets.push({ id, priority: 1, defenseStr: t.soldiers });
        }

        // Priority 2: enemy towers (only if we can reasonably overcome them)
        if (targets.length === 0) {
            for (const id of adj) {
                const t = game.towers[id];
                if (t.owner !== 'neutral' && t.owner !== tower.owner) {
                    // Only attack if we have significantly more troops
                    if (available > t.soldiers * 1.3) {
                        targets.push({ id, priority: 2, defenseStr: t.soldiers });
                    }
                }
            }
        }

        // Priority 3: reinforce friendly frontline towers that are weak
        if (targets.length === 0 && available > 8) {
            for (const id of adj) {
                const t = game.towers[id];
                if (t.owner === tower.owner && t.soldiers < 5) {
                    targets.push({ id, priority: 3, defenseStr: 0 });
                }
            }
        }

        if (targets.length === 0) continue;

        // Pick the BEST single target (don't spread thin)
        targets.sort((a, b) => a.priority - b.priority || a.defenseStr - b.defenseStr);
        const target = targets[0];

        const ratio = target.priority === 1 ? DEPLOY_RATIO_NEUTRAL : DEPLOY_RATIO_ATTACK;
        const toSend = Math.floor(available * ratio);
        if (toSend < 3) continue;

        // Don't send if troops are already marching there
        const alreadyMarching = game.marching.some(
            m => m.from === tower.id && m.to === target.id && m.owner === tower.owner
        );
        if (alreadyMarching) continue;

        tower.soldiers -= toSend;
        game.marching.push({
            from: tower.id,
            to: target.id,
            owner: tower.owner,
            count: toSend,
            startTime: now,
            progress: 0,
        });
    }
}

function updateMarching() {
    const now = Date.now();
    const arrivals = [];

    for (const march of game.marching) {
        march.progress = Math.min(1, (now - march.startTime) / MARCH_DURATION);
        if (march.progress >= 1) arrivals.push(march);
    }

    for (const march of arrivals) {
        const target = game.towers[march.to];

        if (target.owner === march.owner) {
            target.soldiers += march.count;
        } else if (target.owner === 'neutral') {
            target.owner = march.owner;
            target.soldiers = march.count;
            game.events.push(`${march.owner}_captured_${target.name}`);
        } else {
            target.soldiers -= march.count;
            if (target.soldiers <= 0) {
                const remaining = Math.abs(target.soldiers);
                target.owner = remaining > 0 ? march.owner : 'neutral';
                target.soldiers = remaining;
                if (remaining > 0) {
                    game.events.push(`${march.owner}_captured_${target.name}`);
                }
            }
        }
    }

    game.marching = game.marching.filter(m => m.progress < 1);
}

function updatePlayerStats() {
    for (const team of ['blue', 'red']) {
        let totalSoldiers = 0;
        let towersOwned = 0;
        for (const tower of game.towers) {
            if (tower.owner === team) {
                totalSoldiers += tower.soldiers;
                towersOwned++;
            }
        }
        for (const march of game.marching) {
            if (march.owner === team) totalSoldiers += march.count;
        }
        game.players[team].totalSoldiers = totalSoldiers;
        game.players[team].towersOwned = towersOwned;
    }
}

function checkWinConditions() {
    const blueOwns = game.players.blue.towersOwned;
    const redOwns = game.players.red.towersOwned;

    if (blueOwns === 13 && game.marching.length === 0) {
        game.winner = 'blue';
        game.phase = 'gameover';
        return;
    }
    if (redOwns === 13 && game.marching.length === 0) {
        game.winner = 'red';
        game.phase = 'gameover';
        return;
    }

    if (blueOwns === 0 && !game.marching.some(m => m.owner === 'blue')) {
        game.winner = 'red';
        game.phase = 'gameover';
        return;
    }
    if (redOwns === 0 && !game.marching.some(m => m.owner === 'red')) {
        game.winner = 'blue';
        game.phase = 'gameover';
        return;
    }
}

// ── Game Timer ──────────────────────────────────────────────
let timerInterval = null;
let gameLoopInterval = null;

function startCountdown() {
    game.phase = 'countdown';
    game.countdownTimer = 3;
    broadcastState();

    const countInterval = setInterval(() => {
        game.countdownTimer--;
        broadcastState();
        if (game.countdownTimer <= 0) {
            clearInterval(countInterval);
            startGame();
        }
    }, 1000);
}

function startGame() {
    game.phase = 'playing';
    game.timer = GAME_DURATION;
    game.lastPassiveTick = Date.now();
    game.lastDeployTick = Date.now();

    // AI init
    if (game.mode === 'ai') {
        game.ai.gameStartTime = Date.now();
        game.ai.nextPushupAt = Date.now() + AI_WARMUP + 2000; // first AI pushup after warmup
        game.ai.lastPushupTime = Date.now();
        game.players.red.ready = true;
        console.log('[AI] AI opponent initialized — adaptive difficulty active');
    }

    // Notify phones
    if (game.players.blue.ws) {
        safeSend(game.players.blue.ws, { type: 'gameStart', team: 'blue', timer: GAME_DURATION });
    }
    if (game.players.red.ws) {
        safeSend(game.players.red.ws, { type: 'gameStart', team: 'red', timer: GAME_DURATION });
    }

    timerInterval = setInterval(() => {
        game.timer--;
        if (game.timer <= 0) {
            clearInterval(timerInterval);
            if (game.players.blue.totalSoldiers > game.players.red.totalSoldiers) {
                game.winner = 'blue';
            } else if (game.players.red.totalSoldiers > game.players.blue.totalSoldiers) {
                game.winner = 'red';
            } else {
                game.winner = game.players.blue.pushups >= game.players.red.pushups ? 'blue' : 'red';
            }
            game.phase = 'gameover';
            broadcastState();
            broadcastGameOver();
            clearInterval(gameLoopInterval);
        }
    }, 1000);

    gameLoopInterval = setInterval(() => {
        if (game.phase !== 'playing') return;
        updateAI();            // AI tick (no-op if pvp mode)
        passiveGeneration();
        autoDeploy();
        updateMarching();
        updatePlayerStats();
        checkWinConditions();
        if (game.phase === 'gameover') {
            clearInterval(timerInterval);
            clearInterval(gameLoopInterval);
            broadcastGameOver();
        }
        broadcastState();
        if (game.events.length > 5) game.events = game.events.slice(-5);
    }, TICK_MS);
}

// ── Broadcasting ────────────────────────────────────────────
function buildStatePayload() {
    return {
        type: 'gameState',
        mode: game.mode,
        phase: game.phase,
        timer: game.timer,
        countdownTimer: game.countdownTimer,
        players: {
            blue: {
                pushups: game.players.blue.pushups,
                totalSoldiers: game.players.blue.totalSoldiers,
                towersOwned: game.players.blue.towersOwned,
                connected: !!game.players.blue.ws,
                ready: game.players.blue.ready,
                deployMode: game.players.blue.deployMode,
                headDirection: game.players.blue.headDirection,
            },
            red: {
                pushups: game.players.red.pushups,
                totalSoldiers: game.players.red.totalSoldiers,
                towersOwned: game.players.red.towersOwned,
                connected: game.mode === 'ai' ? true : !!game.players.red.ws,
                ready: game.players.red.ready,
                isAI: game.players.red.isAI || false,
                deployMode: game.players.red.deployMode,
                headDirection: game.players.red.headDirection,
            },
        },
        towers: game.towers.map(t => ({
            id: t.id, x: t.x, y: t.y,
            owner: t.owner, soldiers: Math.floor(t.soldiers), name: t.name,
        })),
        edges: game.edges,
        marching: game.marching.map(m => ({
            from: m.from, to: m.to, owner: m.owner,
            count: m.count, progress: m.progress,
        })),
        events: game.events,
        winner: game.winner,
    };
}

function broadcastState() {
    const payload = JSON.stringify(buildStatePayload());
    if (game.display && game.display.readyState === 1) {
        game.display.send(payload);
    }
}

function broadcastGameOver() {
    if (game.players.blue.ws) safeSend(game.players.blue.ws, { type: 'gameOver', winner: game.winner });
    if (game.players.red.ws) safeSend(game.players.red.ws, { type: 'gameOver', winner: game.winner });
}

function safeSend(ws, obj) {
    try {
        if (ws.readyState === 1) ws.send(JSON.stringify(obj));
    } catch (e) { /* ignore */ }
}

// ── HTTP Server ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, '..', 'public', req.url === '/' ? '/game/index.html' : req.url);

    if (req.url === '/game' || req.url === '/game/') {
        filePath = path.join(__dirname, '..', 'public', 'game', 'index.html');
    }
    if (req.url === '/mobile' || req.url === '/mobile/') {
        filePath = path.join(__dirname, '..', 'public', 'mobile', 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// ── WebSocket Server ────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    const url = req.url || '';
    console.log(`[WS] Connection from ${url}`);

    if (url.startsWith('/display')) {
        // Game display connection — parse mode from query string
        const params = new URL(url, 'http://localhost').searchParams;
        const mode = params.get('mode') || 'pvp';

        // Reset game for new display with desired mode
        if (timerInterval) clearInterval(timerInterval);
        if (gameLoopInterval) clearInterval(gameLoopInterval);
        game = createGame(mode);
        game.display = ws;
        console.log(`[WS] Game display connected — mode: ${mode}`);

        // Generate QR code (HTTPS URL for camera access)
        const qrIP = getLocalIP();
        const mobileURL = `https://${qrIP}:${HTTPS_PORT}/mobile/`;
        QRCode.toDataURL(mobileURL, { width: 300, margin: 2 }, (err, dataUrl) => {
            if (!err) {
                safeSend(ws, { type: 'qrCode', url: dataUrl, mobileURL });
            }
        });

        // In AI mode, mark red as AI-connected and ready
        if (mode === 'ai') {
            game.players.red.isAI = true;
            game.players.red.ready = true;
            console.log('[AI] Red team is AI — waiting for 1 human player');
        }

        broadcastState();

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'setMode') {
                    // Mode change from display
                    if (timerInterval) clearInterval(timerInterval);
                    if (gameLoopInterval) clearInterval(gameLoopInterval);
                    const newMode = msg.mode === 'ai' ? 'ai' : 'pvp';
                    game = createGame(newMode);
                    game.display = ws;
                    if (newMode === 'ai') {
                        game.players.red.isAI = true;
                        game.players.red.ready = true;
                    }
                    console.log(`[WS] Mode changed to: ${newMode}`);

                    // Regenerate QR
                    QRCode.toDataURL(mobileURL, { width: 300, margin: 2 }, (err, dataUrl) => {
                        if (!err) safeSend(ws, { type: 'qrCode', url: dataUrl, mobileURL });
                    });
                    broadcastState();
                }
            } catch (e) { /* ignore */ }
        });

        ws.on('close', () => {
            console.log('[WS] Game display disconnected');
            if (game) game.display = null;
        });

    } else if (url.startsWith('/player')) {
        if (!game) game = createGame();

        let team = null;
        if (!game.players.blue.ws) {
            team = 'blue';
            game.players.blue.ws = ws;
        } else if (!game.players.red.ws && !game.players.red.isAI) {
            team = 'red';
            game.players.red.ws = ws;
        } else if (game.mode === 'ai' && !game.players.blue.ws) {
            // In AI mode, only blue slot available
            team = 'blue';
            game.players.blue.ws = ws;
        } else {
            safeSend(ws, { type: 'error', message: 'Game is full' });
            ws.close();
            return;
        }

        console.log(`[WS] Player joined as ${team}`);
        safeSend(ws, { type: 'assigned', team });
        broadcastState();

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);

                if (msg.type === 'ready') {
                    game.players[team].ready = true;
                    // Save deploy mode choice
                    if (msg.deployMode === 'manual' || msg.deployMode === 'auto') {
                        game.players[team].deployMode = msg.deployMode;
                        console.log(`[WS] ${team} deploy mode: ${msg.deployMode}`);
                    }
                    console.log(`[WS] ${team} is ready`);
                    broadcastState();

                    // Check start conditions based on mode
                    if (game.phase === 'lobby') {
                        if (game.mode === 'ai') {
                            if (game.players.blue.ready) {
                                console.log('[GAME] Player ready — starting AI match');
                                startCountdown();
                            }
                        } else {
                            if (game.players.blue.ready && game.players.red.ready) {
                                console.log('[GAME] Both players ready — starting countdown');
                                startCountdown();
                            }
                        }
                    }
                }

                if (msg.type === 'pushup' && game.phase === 'playing') {
                    addSoldiersFromPushup(team, msg.count);
                }

                // Head direction update (manual mode)
                if (msg.type === 'headDirection' && game.phase === 'playing') {
                    game.players[team].headDirection = msg.direction || 'center';
                }

                // Manual deploy command (nod confirmed)
                if (msg.type === 'manualDeploy' && game.phase === 'playing') {
                    manualDeploy(team, msg.direction);
                }

            } catch (e) {
                console.error('[WS] Bad message:', e);
            }
        });

        ws.on('close', () => {
            console.log(`[WS] ${team} disconnected`);
            game.players[team].ws = null;
            game.players[team].ready = false;

            if (game.phase === 'playing') {
                game.winner = team === 'blue' ? 'red' : 'blue';
                game.phase = 'gameover';
                broadcastState();
                broadcastGameOver();
                clearInterval(timerInterval);
                clearInterval(gameLoopInterval);
            }
            broadcastState();
        });

    } else if (url.startsWith('/reset')) {
        console.log('[WS] Game reset requested');
        if (timerInterval) clearInterval(timerInterval);
        if (gameLoopInterval) clearInterval(gameLoopInterval);
        game = createGame();
        ws.close();
    }
});

// ── HTTPS — auto-generate cert with OpenSSL at startup ──────
const localIP = getLocalIP();
const certDir = path.join(__dirname, '..', 'certs');
let httpsServer = null;
let wssSecure = null;

try {
    const { execSync } = require('child_process');
    // Create certs dir if missing
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

    const keyPath = path.join(certDir, 'key.pem');
    const certPath = path.join(certDir, 'cert.pem');

    // Always regenerate so the SAN matches the current IP
    console.log(`[HTTPS] Generating cert for IP ${localIP} ...`);
    execSync(
        `openssl req -x509 -newkey rsa:2048 ` +
        `-keyout "${keyPath}" -out "${certPath}" ` +
        `-days 30 -nodes -subj /CN=TowerSiege ` +
        `-addext "subjectAltName=IP:${localIP},IP:127.0.0.1,DNS:localhost"`,
        { stdio: 'pipe' }
    );
    console.log('[HTTPS] Cert generated OK');

    const key = fs.readFileSync(keyPath);
    const cert = fs.readFileSync(certPath);

    httpsServer = https.createServer({ key, cert }, server.listeners('request')[0]);

    wssSecure = new WebSocketServer({ server: httpsServer });
    wssSecure.on('connection', (ws, req) => {
        wss.emit('connection', ws, req);
    });
} catch (e) {
    console.warn('[HTTPS] Failed to generate cert — is OpenSSL installed?');
    console.warn('  Error:', e.message);
    console.warn('  Mobile camera will NOT work without HTTPS.');
}

// ── Start HTTP and HTTPS ────────────────────────────────────
server.listen(PORT, () => {
    const ip = localIP;
    const startHttps = () => {
        if (httpsServer) {
            httpsServer.listen(HTTPS_PORT, () => {
                console.log(`  📱 Mobile URL : https://${ip}:${HTTPS_PORT}/mobile/`);
                console.log('  ─────────────────────────────────────────');
                console.log('  ⚠️  Phone: tap "Advanced" → "Proceed" on cert warning');
                console.log('  ─────────────────────────────────────────');
                console.log('  Modes: PvP (1v1) | AI (Solo vs Adaptive Bot)');
                console.log('');
            });
        } else {
            console.log('  ⚠️  HTTPS disabled — generate certs for mobile camera!');
            console.log('');
        }
    };
    console.log('');
    console.log('  ⚔️  TOWER SIEGE — Push-Up Battle Server  ⚔️');
    console.log('  ─────────────────────────────────────────');
    console.log(`  Game (HTTP)   : http://localhost:${PORT}/game/`);
    console.log(`  Game (HTTPS)  : https://${ip}:${HTTPS_PORT}/game/`);
    startHttps();
});
