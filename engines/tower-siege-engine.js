// ============================================================
// TOWER SIEGE — Game Engine Module (for Motion Arena)
// Per-session game engine, no global state.
// ============================================================

// ── Constants ───────────────────────────────────────────────
const TS_GAME_DURATION = 90;
const TS_TICK_RATE = 30;
const TS_TICK_MS = 1000 / TS_TICK_RATE;
const SOLDIERS_PER_PUSHUP = 4;
const PASSIVE_HOME = 0.3;
const DEPLOY_INTERVAL = 3000;
const MARCH_DURATION = 2000;
const MIN_DEPLOY = 5;
const DEPLOY_RATIO_NEUTRAL = 0.4;
const DEPLOY_RATIO_ATTACK = 0.5;

// ── AI Config ───────────────────────────────────────────────
const AI_BASE_RATE = 0.75;
const AI_SURGE_CHANCE = 0.08;
const AI_SURGE_MULTIPLIER = 1.2;
const AI_MIN_INTERVAL = 3000;
const AI_MAX_INTERVAL = 15000;
const AI_WARMUP = 5000;
const AI_IDLE_THRESHOLD = 10000;

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

// ── Tower Siege Engine Class ────────────────────────────────
class TowerSiegeEngine {
    constructor(sessionId, mode, broadcastFn) {
        this.sessionId = sessionId;
        this.mode = mode; // 'pvp' or 'ai' (mapped from '2p'/'1p')
        this.broadcast = broadcastFn;

        const map = createMap();
        this.phase = 'lobby';
        this.timer = TS_GAME_DURATION;
        this.countdownTimer = 3;

        this.players = {
            blue: {
                pushups: 0, totalSoldiers: 0, towersOwned: 1,
                ready: false, lastPushupTime: 0,
                deployMode: 'auto', headDirection: 'center',
            },
            red: {
                pushups: 0, totalSoldiers: 0, towersOwned: 1,
                ready: false, lastPushupTime: 0,
                isAI: this.mode === 'ai',
                deployMode: 'auto', headDirection: 'center',
            },
        };

        this.towers = map.towers;
        this.edges = map.edges;
        this.marching = [];
        this.events = [];
        this.lastPassiveTick = Date.now();
        this.lastDeployTick = Date.now();
        this.winner = null;

        // AI state
        this.ai = {
            lastPushupTime: 0,
            pushupRate: 0,
            rateSamples: [],
            nextPushupAt: 0,
            isSurging: false,
            surgeEnd: 0,
            gameStartTime: 0,
            playerSnapshot: null,
        };

        // Intervals
        this._timerInterval = null;
        this._gameLoopInterval = null;
    }

    getAdjacent(towerId) {
        const adj = [];
        for (const [a, b] of this.edges) {
            if (a === towerId) adj.push(b);
            if (b === towerId) adj.push(a);
        }
        return adj;
    }

    addSoldiersFromPushup(team, count) {
        const player = this.players[team];
        const newPushups = count - player.pushups;
        if (newPushups <= 0) return;
        if (newPushups > 3) return;

        if (!player.isAI) {
            const now = Date.now();
            const timeSinceLast = now - player.lastPushupTime;
            if (timeSinceLast < 800 && newPushups > 0) {
                console.log(`[TS:${this.sessionId}] ANTI-CHEAT ${team} too fast: ${timeSinceLast}ms`);
                return;
            }
            player.lastPushupTime = now;
        }

        player.pushups = count;
        const homeId = team === 'blue' ? 5 : 7;
        const home = this.towers[homeId];
        if (home.owner === team) {
            const soldiers = newPushups * SOLDIERS_PER_PUSHUP;
            home.soldiers += soldiers;
            this.events.push(`${team}_pushup_${count}`);
            console.log(`[TS:${this.sessionId}] ${team}: +${newPushups} push-up → +${soldiers} soldiers`);
        }
    }

    updateAI() {
        if (this.mode !== 'ai' || this.phase !== 'playing') return;

        const now = Date.now();
        const elapsed = now - this.ai.gameStartTime;
        if (elapsed < AI_WARMUP) return;

        const playerPushups = this.players.blue.pushups;
        const prevSnapshot = this.ai.playerSnapshot || { pushups: 0, time: now };
        const windowMs = now - prevSnapshot.time;

        if (windowMs >= 5000) {
            const recentPushups = playerPushups - prevSnapshot.pushups;
            const recentRate = recentPushups / (windowMs / 1000);
            this.ai.playerSnapshot = { pushups: playerPushups, time: now };
            this.ai.rateSamples.push(recentRate);
            if (this.ai.rateSamples.length > 4) this.ai.rateSamples.shift();
        }

        const avgRate = this.ai.rateSamples.length > 0
            ? this.ai.rateSamples.reduce((a, b) => a + b, 0) / this.ai.rateSamples.length
            : 0;

        const timeSincePlayerPush = now - this.players.blue.lastPushupTime;
        const playerIsIdle = timeSincePlayerPush > AI_IDLE_THRESHOLD;

        if (playerIsIdle && playerPushups > 0) {
            if (now >= this.ai.nextPushupAt) {
                this.doAIPushup(now);
                this.ai.nextPushupAt = now + 12000 + Math.random() * 5000;
            }
            return;
        }

        if (playerPushups === 0) return;

        if (!this.ai.isSurging && Math.random() < AI_SURGE_CHANCE * (TS_TICK_MS / 1000)) {
            this.ai.isSurging = true;
            this.ai.surgeEnd = now + 3000 + Math.random() * 3000;
        }
        if (this.ai.isSurging && now > this.ai.surgeEnd) {
            this.ai.isSurging = false;
        }

        const multiplier = this.ai.isSurging ? AI_SURGE_MULTIPLIER : AI_BASE_RATE;
        let aiTargetRate = avgRate * multiplier;
        if (aiTargetRate <= 0.01) return;

        const interval = Math.max(AI_MIN_INTERVAL, Math.min(AI_MAX_INTERVAL, 1000 / aiTargetRate));

        if (now >= this.ai.nextPushupAt) {
            this.doAIPushup(now);
            const jitter = interval * (0.8 + Math.random() * 0.4);
            this.ai.nextPushupAt = now + jitter;
        }
    }

    doAIPushup(now) {
        const aiPlayer = this.players.red;
        aiPlayer.pushups++;
        aiPlayer.lastPushupTime = now;

        const homeId = 7;
        const home = this.towers[homeId];
        if (home.owner === 'red') {
            home.soldiers += SOLDIERS_PER_PUSHUP;
            this.events.push(`red_pushup_${aiPlayer.pushups}`);
        }
    }

    passiveGeneration() {
        const now = Date.now();
        const elapsed = now - this.lastPassiveTick;
        if (elapsed < 1000) return;
        this.lastPassiveTick = now;

        for (const tower of this.towers) {
            if (tower.owner === 'neutral') continue;
            const isBlueHome = tower.id === 5 && tower.owner === 'blue';
            const isRedHome = tower.id === 7 && tower.owner === 'red';
            if (isBlueHome || isRedHome) {
                const teamPushups = this.players[tower.owner].pushups;
                if (teamPushups > 0) {
                    tower.soldiers += PASSIVE_HOME;
                }
            }
        }
    }

    manualDeploy(team, direction) {
        if (this.phase !== 'playing') return;
        const player = this.players[team];
        if (player.deployMode !== 'manual') return;

        const homeId = team === 'blue' ? 5 : 7;
        const home = this.towers[homeId];
        if (home.owner !== team) return;
        if (home.soldiers < MIN_DEPLOY) return;

        const adj = this.getAdjacent(homeId);
        if (adj.length === 0) return;

        const adjTowers = adj.map(id => ({ id, ...this.towers[id] }));
        adjTowers.sort((a, b) => a.x - b.x);

        let targetTower = direction === 'left' ? adjTowers[0] : adjTowers[adjTowers.length - 1];
        if (!targetTower) return;

        if (targetTower.owner === team) {
            const ownAdj = this.getAdjacent(targetTower.id);
            const nextOpts = ownAdj
                .map(id => ({ id, ...this.towers[id] }))
                .filter(t => t.owner !== team && t.id !== homeId);
            if (nextOpts.length > 0) {
                nextOpts.sort((a, b) => direction === 'left' ? a.x - b.x : b.x - a.x);
                targetTower = nextOpts[0];
            } else {
                return;
            }
        }

        const alreadyMarching = this.marching.some(m => m.to === targetTower.id && m.owner === team);
        if (alreadyMarching) return;

        const garrison = Math.max(3, Math.floor(home.soldiers * 0.2));
        const toSend = Math.floor(home.soldiers - garrison);
        if (toSend < 3) return;

        home.soldiers -= toSend;
        this.marching.push({
            from: homeId, to: targetTower.id, owner: team,
            count: toSend, startTime: Date.now(), progress: 0,
        });
        this.events.push(`${team}_deploy_${direction}`);
        console.log(`[TS:${this.sessionId}] ${team} manual deploy ${direction} → tower ${targetTower.id}`);
    }

    autoDeploy() {
        const now = Date.now();
        if (now - this.lastDeployTick < DEPLOY_INTERVAL) return;
        this.lastDeployTick = now;

        for (const tower of this.towers) {
            if (tower.owner === 'neutral') continue;
            if (tower.soldiers < MIN_DEPLOY) continue;

            const teamPlayer = this.players[tower.owner];
            if (teamPlayer && teamPlayer.deployMode === 'manual' && !teamPlayer.isAI) continue;

            const garrison = Math.max(3, Math.floor(tower.soldiers * 0.3));
            const available = tower.soldiers - garrison;
            if (available < 3) continue;

            const adj = this.getAdjacent(tower.id);
            const targets = [];

            for (const id of adj) {
                const t = this.towers[id];
                if (t.owner === 'neutral') targets.push({ id, priority: 1, defenseStr: t.soldiers });
            }

            if (targets.length === 0) {
                for (const id of adj) {
                    const t = this.towers[id];
                    if (t.owner !== 'neutral' && t.owner !== tower.owner) {
                        if (available > t.soldiers * 1.3) {
                            targets.push({ id, priority: 2, defenseStr: t.soldiers });
                        }
                    }
                }
            }

            if (targets.length === 0 && available > 8) {
                for (const id of adj) {
                    const t = this.towers[id];
                    if (t.owner === tower.owner && t.soldiers < 5) {
                        targets.push({ id, priority: 3, defenseStr: 0 });
                    }
                }
            }

            if (targets.length === 0) continue;

            targets.sort((a, b) => a.priority - b.priority || a.defenseStr - b.defenseStr);
            const target = targets[0];
            const ratio = target.priority === 1 ? DEPLOY_RATIO_NEUTRAL : DEPLOY_RATIO_ATTACK;
            const toSend = Math.floor(available * ratio);
            if (toSend < 3) continue;

            const alreadyMarching = this.marching.some(
                m => m.from === tower.id && m.to === target.id && m.owner === tower.owner
            );
            if (alreadyMarching) continue;

            tower.soldiers -= toSend;
            this.marching.push({
                from: tower.id, to: target.id, owner: tower.owner,
                count: toSend, startTime: now, progress: 0,
            });
        }
    }

    updateMarching() {
        const now = Date.now();
        const arrivals = [];

        for (const march of this.marching) {
            march.progress = Math.min(1, (now - march.startTime) / MARCH_DURATION);
            if (march.progress >= 1) arrivals.push(march);
        }

        for (const march of arrivals) {
            const target = this.towers[march.to];
            if (target.owner === march.owner) {
                target.soldiers += march.count;
            } else if (target.owner === 'neutral') {
                target.owner = march.owner;
                target.soldiers = march.count;
                this.events.push(`${march.owner}_captured_${target.name}`);
            } else {
                target.soldiers -= march.count;
                if (target.soldiers <= 0) {
                    const remaining = Math.abs(target.soldiers);
                    target.owner = remaining > 0 ? march.owner : 'neutral';
                    target.soldiers = remaining;
                    if (remaining > 0) {
                        this.events.push(`${march.owner}_captured_${target.name}`);
                    }
                }
            }
        }

        this.marching = this.marching.filter(m => m.progress < 1);
    }

    updatePlayerStats() {
        for (const team of ['blue', 'red']) {
            let totalSoldiers = 0;
            let towersOwned = 0;
            for (const tower of this.towers) {
                if (tower.owner === team) {
                    totalSoldiers += tower.soldiers;
                    towersOwned++;
                }
            }
            for (const march of this.marching) {
                if (march.owner === team) totalSoldiers += march.count;
            }
            this.players[team].totalSoldiers = totalSoldiers;
            this.players[team].towersOwned = towersOwned;
        }
    }

    checkWinConditions() {
        const blueOwns = this.players.blue.towersOwned;
        const redOwns = this.players.red.towersOwned;

        if (blueOwns === 13 && this.marching.length === 0) {
            this.winner = 'blue'; this.phase = 'gameover'; return;
        }
        if (redOwns === 13 && this.marching.length === 0) {
            this.winner = 'red'; this.phase = 'gameover'; return;
        }
        if (blueOwns === 0 && !this.marching.some(m => m.owner === 'blue')) {
            this.winner = 'red'; this.phase = 'gameover'; return;
        }
        if (redOwns === 0 && !this.marching.some(m => m.owner === 'red')) {
            this.winner = 'blue'; this.phase = 'gameover'; return;
        }
    }

    startCountdown() {
        this.phase = 'countdown';
        this.countdownTimer = 3;
        this.broadcastState();

        const countInterval = setInterval(() => {
            this.countdownTimer--;
            this.broadcastState();
            if (this.countdownTimer <= 0) {
                clearInterval(countInterval);
                this.startGame();
            }
        }, 1000);
    }

    startGame() {
        this.phase = 'playing';
        this.timer = TS_GAME_DURATION;
        this.lastPassiveTick = Date.now();
        this.lastDeployTick = Date.now();

        if (this.mode === 'ai') {
            this.ai.gameStartTime = Date.now();
            this.ai.nextPushupAt = Date.now() + AI_WARMUP + 2000;
            this.ai.lastPushupTime = Date.now();
            this.players.red.ready = true;
            console.log(`[TS:${this.sessionId}] AI opponent initialized`);
        }

        // Notify controllers
        this.broadcast(this.sessionId, 'ts-game-start', {
            mode: this.mode,
            timer: TS_GAME_DURATION,
        });

        this._timerInterval = setInterval(() => {
            this.timer--;
            if (this.timer <= 0) {
                clearInterval(this._timerInterval);
                if (this.players.blue.totalSoldiers > this.players.red.totalSoldiers) {
                    this.winner = 'blue';
                } else if (this.players.red.totalSoldiers > this.players.blue.totalSoldiers) {
                    this.winner = 'red';
                } else {
                    this.winner = this.players.blue.pushups >= this.players.red.pushups ? 'blue' : 'red';
                }
                this.phase = 'gameover';
                this.broadcastState();
                this.broadcastGameOver();
                clearInterval(this._gameLoopInterval);
            }
        }, 1000);

        this._gameLoopInterval = setInterval(() => {
            if (this.phase !== 'playing') return;
            this.updateAI();
            this.passiveGeneration();
            this.autoDeploy();
            this.updateMarching();
            this.updatePlayerStats();
            this.checkWinConditions();
            if (this.phase === 'gameover') {
                clearInterval(this._timerInterval);
                clearInterval(this._gameLoopInterval);
                this.broadcastGameOver();
            }
            this.broadcastState();
            if (this.events.length > 5) this.events = this.events.slice(-5);
        }, TS_TICK_MS);
    }

    buildStatePayload() {
        return {
            mode: this.mode,
            phase: this.phase,
            timer: this.timer,
            countdownTimer: this.countdownTimer,
            players: {
                blue: {
                    pushups: this.players.blue.pushups,
                    totalSoldiers: this.players.blue.totalSoldiers,
                    towersOwned: this.players.blue.towersOwned,
                    connected: true,
                    ready: this.players.blue.ready,
                    deployMode: this.players.blue.deployMode,
                    headDirection: this.players.blue.headDirection,
                },
                red: {
                    pushups: this.players.red.pushups,
                    totalSoldiers: this.players.red.totalSoldiers,
                    towersOwned: this.players.red.towersOwned,
                    connected: this.mode === 'ai' ? true : true,
                    ready: this.players.red.ready,
                    isAI: this.players.red.isAI || false,
                    deployMode: this.players.red.deployMode,
                    headDirection: this.players.red.headDirection,
                },
            },
            towers: this.towers.map(t => ({
                id: t.id, x: t.x, y: t.y,
                owner: t.owner, soldiers: Math.floor(t.soldiers), name: t.name,
            })),
            edges: this.edges,
            marching: this.marching.map(m => ({
                from: m.from, to: m.to, owner: m.owner,
                count: m.count, progress: m.progress,
            })),
            events: this.events,
            winner: this.winner,
        };
    }

    broadcastState() {
        this.broadcast(this.sessionId, 'ts-game-state', this.buildStatePayload());
    }

    broadcastGameOver() {
        this.broadcast(this.sessionId, 'ts-game-over', { winner: this.winner });
        console.log(`[TS:${this.sessionId}] Game Over! Winner: ${this.winner}`);
    }

    destroy() {
        if (this._timerInterval) clearInterval(this._timerInterval);
        if (this._gameLoopInterval) clearInterval(this._gameLoopInterval);
        console.log(`[TS:${this.sessionId}] Engine destroyed`);
    }
}

module.exports = { TowerSiegeEngine };
