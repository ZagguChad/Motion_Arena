// ============================================
// Shadow Breath — Main Game Engine
// ============================================

import { Player } from './player.js';
import { Guard } from './guard.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { LEVELS, TILE, isSolid, isInteractable } from './levels.js';

// Tile colors (retro dungeon palette)
const TILE_COLORS = {
    [TILE.FLOOR]: '#1a1a2e',
    [TILE.WALL]: '#3a3a5c',
    [TILE.DOOR]: '#6b4226',
    [TILE.TABLE]: '#5c3d1e',
    [TILE.BARREL]: '#7a5a30',
    [TILE.TARGET]: '#1a1a2e',
    [TILE.SPAWN]: '#1a1a2e',
    [TILE.TORCH]: '#1a1a2e',
    [TILE.CARPET]: '#2a1a38',
    [TILE.WINDOW]: '#1a2a3e'
};

const WALL_TOP = '#4a4a6e';
const WALL_SHADOW = '#2a2a4c';

export class Game {
    constructor(canvas, socket) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.socket = socket;

        this.TILE_SIZE = 32;
        this.RENDER_WIDTH = 480;
        this.RENDER_HEIGHT = 270;

        this.player = null;
        this.guards = [];
        this.hud = new HUD(canvas);
        this.audio = new AudioEngine();

        this.currentLevel = 0;
        this.levelData = null;
        this.mapData = null; // mutable copy

        this.state = 'intro'; // intro, playing, gameover, victory
        this.introTimer = 3;
        this.timeLeft = 60;
        this.score = 0;
        this.totalScore = 0;

        // Camera
        this.cameraX = 0;
        this.cameraY = 0;

        // Stats
        this.stats = {
            longestHold: 0,
            currentHold: 0,
            alertsRaised: 0,
            timeTaken: 0
        };

        // Target position for interaction check
        this.targetTileIdx = -1;

        // Timing
        this.lastTime = 0;
        this.running = false;

        // Torch flicker animation
        this.torchTimer = 0;

        // Keyboard fallback
        this.keys = {};
        this._setupKeyboard();
    }

    async init() {
        // Pixel-perfect canvas
        this.canvas.width = this.RENDER_WIDTH;
        this.canvas.height = this.RENDER_HEIGHT;
        this.ctx.imageSmoothingEnabled = false;

        this.audio.init();

        this.loadLevel(this.currentLevel);
    }

    loadLevel(idx) {
        if (idx >= LEVELS.length) {
            // All levels complete
            this.state = 'allcomplete';
            return;
        }

        this.currentLevel = idx;
        const level = LEVELS[idx];
        this.levelData = level;
        this.mapData = [...level.map]; // mutable copy
        this.timeLeft = level.timeLimit || 60;

        // Find spawn and target
        let spawnX = 1, spawnY = 1;
        this.targetTileIdx = -1;
        for (let i = 0; i < this.mapData.length; i++) {
            const tile = this.mapData[i];
            if (tile === TILE.SPAWN) {
                spawnX = i % level.cols;
                spawnY = Math.floor(i / level.cols);
                this.mapData[i] = TILE.FLOOR; // clear spawn marker
            }
            if (tile === TILE.TARGET) {
                this.targetTileIdx = i;
            }
        }

        // Player
        this.player = new Player(spawnX, spawnY, this.TILE_SIZE);
        this.player.setBreathCapacity(level.breathCapacity || 5);

        // Guards
        this.guards = level.guards.map(g => new Guard(g, this.TILE_SIZE));

        // Reset stats
        this.stats = {
            longestHold: 0,
            currentHold: 0,
            alertsRaised: 0,
            timeTaken: 0
        };

        this.score = 0;
        this.state = 'intro';
        this.introTimer = 3;
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        this.audio.resume();
        this.audio.startAmbientMusic();
        this.loop();
    }

    loop() {
        if (!this.running) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05); // cap at 50ms
        this.lastTime = now;

        this.update(dt);
        this.render();

        requestAnimationFrame(() => this.loop());
    }

    update(dt) {
        this.hud.update(dt);
        this.torchTimer += dt;

        if (this.state === 'intro') {
            this.introTimer -= dt;
            if (this.introTimer <= 0) {
                this.state = 'playing';
                this.hud.showMessage('GO!', 1);
            }
            return;
        }

        if (this.state !== 'playing') return;

        // Timer
        this.timeLeft -= dt;
        this.stats.timeTaken += dt;
        if (this.timeLeft <= 0) {
            this.gameOver('Time ran out!');
            return;
        }

        // Keyboard fallback input
        this._processKeyboard();

        // Update player
        this.player.update(dt, this.levelData.cols, this.levelData.rows, this.mapData);

        // Track breath hold stats
        if (!this.player.visible) {
            this.stats.currentHold += dt;
            if (this.stats.currentHold > this.stats.longestHold) {
                this.stats.longestHold = this.stats.currentHold;
            }
        } else {
            this.stats.currentHold = 0;
        }

        // Footstep sounds
        if (this.player.isMoving && this.player.visible && this.player.footstepTimer <= 0) {
            this.audio.playFootstep();
            this.player.footstepTimer = 0.3;
        }

        // Heartbeat when low breath
        const breathPct = this.player.breathRemaining / this.player.breathCapacity;
        if (!this.player.visible && breathPct < 0.3) {
            if (!this.audio.heartbeatInterval) {
                this.audio.startHeartbeat(breathPct < 0.15 ? 400 : 600);
            }
        } else {
            this.audio.stopHeartbeat();
        }

        // Update guards + vision check
        let anyAlert = false;
        for (const guard of this.guards) {
            guard.update(dt);
            const seen = guard.checkVision(
                this.player.x, this.player.y,
                this.player.visible && !this.player.hidden
            );
            if (seen && guard.alertLevel > 20) {
                anyAlert = true;
            }
            if (guard.alertLevel >= 100) {
                this.gameOver('A guard spotted you!');
                return;
            }
        }

        if (anyAlert && !this._alertSoundPlayed) {
            this.audio.playAlert();
            this.stats.alertsRaised++;
            this._alertSoundPlayed = true;
            this.hud.flash('rgba(255, 100, 50, 0.2)');
        } else if (!anyAlert) {
            this._alertSoundPlayed = false;
        }

        // Check if player reached target
        const ptx = this.player.getTileX();
        const pty = this.player.getTileY();
        const pidx = pty * this.levelData.cols + ptx;
        if (pidx === this.targetTileIdx) {
            this.victory();
        }

        // Camera follow
        const targetCamX = this.player.x - this.RENDER_WIDTH / 2;
        const targetCamY = this.player.y - this.RENDER_HEIGHT / 2;
        const maxCamX = this.levelData.cols * this.TILE_SIZE - this.RENDER_WIDTH;
        const maxCamY = this.levelData.rows * this.TILE_SIZE - this.RENDER_HEIGHT;
        this.cameraX += (Math.max(0, Math.min(maxCamX, targetCamX)) - this.cameraX) * 0.1;
        this.cameraY += (Math.max(0, Math.min(maxCamY, targetCamY)) - this.cameraY) * 0.1;
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.RENDER_WIDTH, this.RENDER_HEIGHT);

        // Background
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, this.RENDER_WIDTH, this.RENDER_HEIGHT);

        if (this.state === 'allcomplete') {
            this._drawAllComplete(ctx);
            return;
        }

        // Draw tilemap
        this._drawMap(ctx);

        // Draw guards
        for (const guard of this.guards) {
            guard.draw(ctx, this.cameraX, this.cameraY, this.player.focusActive);
        }

        // Draw player
        this.player.draw(ctx, this.cameraX, this.cameraY);

        // Fog of war
        this._drawFog(ctx);

        // HUD
        if (this.state === 'intro') {
            this.hud.drawLevelIntro(ctx, this.levelData.name, this.levelData.subtitle);
        } else if (this.state === 'playing') {
            this.hud.draw(
                ctx, this.player, this.guards,
                `Level ${this.currentLevel + 1}: ${this.levelData.name}`,
                this.totalScore + this.score,
                this.timeLeft
            );
        } else if (this.state === 'gameover') {
            this.hud.draw(
                ctx, this.player, this.guards,
                `Level ${this.currentLevel + 1}: ${this.levelData.name}`,
                this.totalScore + this.score,
                this.timeLeft
            );
            this.hud.drawGameOver(ctx, this._gameOverReason);
        } else if (this.state === 'victory') {
            this.hud.drawVictory(ctx, this.totalScore + this.score, this.stats);
        }
    }

    _drawMap(ctx) {
        const ts = this.TILE_SIZE;
        const cols = this.levelData.cols;
        const rows = this.levelData.rows;

        // Calculate visible tile range
        const startCol = Math.max(0, Math.floor(this.cameraX / ts));
        const startRow = Math.max(0, Math.floor(this.cameraY / ts));
        const endCol = Math.min(cols, Math.ceil((this.cameraX + this.RENDER_WIDTH) / ts) + 1);
        const endRow = Math.min(rows, Math.ceil((this.cameraY + this.RENDER_HEIGHT) / ts) + 1);

        for (let r = startRow; r < endRow; r++) {
            for (let c = startCol; c < endCol; c++) {
                const tile = this.mapData[r * cols + c];
                const sx = c * ts - this.cameraX;
                const sy = r * ts - this.cameraY;

                // Base floor
                ctx.fillStyle = TILE_COLORS[TILE.FLOOR];
                ctx.fillRect(sx, sy, ts, ts);

                // Tile specifics
                switch (tile) {
                    case TILE.WALL:
                        ctx.fillStyle = TILE_COLORS[TILE.WALL];
                        ctx.fillRect(sx, sy, ts, ts);
                        // Top highlight
                        ctx.fillStyle = WALL_TOP;
                        ctx.fillRect(sx, sy, ts, 4);
                        // Side shadow
                        ctx.fillStyle = WALL_SHADOW;
                        ctx.fillRect(sx, sy + ts - 3, ts, 3);
                        // Brick pattern
                        ctx.strokeStyle = '#2a2a4c';
                        ctx.lineWidth = 0.5;
                        ctx.strokeRect(sx + 2, sy + 4, ts / 2 - 2, ts / 2 - 4);
                        ctx.strokeRect(sx + ts / 2 + 1, sy + ts / 2, ts / 2 - 3, ts / 2 - 4);
                        break;

                    case TILE.DOOR:
                        ctx.fillStyle = TILE_COLORS[TILE.DOOR];
                        ctx.fillRect(sx + 4, sy + 2, ts - 8, ts - 4);
                        // Handle
                        ctx.fillStyle = '#aa8844';
                        ctx.fillRect(sx + ts - 10, sy + ts / 2, 3, 3);
                        break;

                    case TILE.TABLE:
                        ctx.fillStyle = TILE_COLORS[TILE.TABLE];
                        ctx.fillRect(sx + 3, sy + 3, ts - 6, ts - 6);
                        ctx.fillStyle = '#4a3010';
                        ctx.fillRect(sx + 5, sy + 5, ts - 10, ts - 10);
                        break;

                    case TILE.BARREL:
                        ctx.fillStyle = TILE_COLORS[TILE.BARREL];
                        ctx.beginPath();
                        ctx.arc(sx + ts / 2, sy + ts / 2, ts / 2 - 4, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = '#5a4020';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(sx + 6, sy + ts / 2);
                        ctx.lineTo(sx + ts - 6, sy + ts / 2);
                        ctx.stroke();
                        break;

                    case TILE.TARGET:
                        // Target marker with pulsing glow
                        const pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.7;
                        ctx.fillStyle = `rgba(255, 50, 50, ${0.15 * pulse})`;
                        ctx.fillRect(sx, sy, ts, ts);
                        ctx.fillStyle = '#ff3333';
                        ctx.font = '16px monospace';
                        ctx.textAlign = 'center';
                        ctx.fillText('✕', sx + ts / 2, sy + ts / 2 + 5);
                        break;

                    case TILE.CARPET:
                        ctx.fillStyle = TILE_COLORS[TILE.CARPET];
                        ctx.fillRect(sx, sy, ts, ts);
                        // Diamond pattern
                        ctx.fillStyle = '#341a48';
                        ctx.fillRect(sx + ts / 2 - 3, sy + ts / 2 - 3, 6, 6);
                        break;

                    case TILE.TORCH:
                        // Torch flame flicker
                        const flicker = Math.sin(this.torchTimer * 8 + c * 3) * 0.5 + 0.5;
                        ctx.fillStyle = `rgba(255, ${150 + flicker * 100}, 50, 0.6)`;
                        ctx.beginPath();
                        ctx.arc(sx + ts / 2, sy + ts / 2, 3 + flicker * 2, 0, Math.PI * 2);
                        ctx.fill();
                        // Glow
                        const grd = ctx.createRadialGradient(
                            sx + ts / 2, sy + ts / 2, 2,
                            sx + ts / 2, sy + ts / 2, ts * 1.5
                        );
                        grd.addColorStop(0, `rgba(255, 180, 50, ${0.15 * flicker})`);
                        grd.addColorStop(1, 'rgba(255, 180, 50, 0)');
                        ctx.fillStyle = grd;
                        ctx.fillRect(sx - ts, sy - ts, ts * 3, ts * 3);
                        break;

                    case TILE.WINDOW:
                        ctx.fillStyle = TILE_COLORS[TILE.WINDOW];
                        ctx.fillRect(sx, sy, ts, ts);
                        // Moonlight beam
                        ctx.fillStyle = 'rgba(150, 180, 220, 0.1)';
                        ctx.fillRect(sx, sy + ts, ts, ts * 2);
                        break;
                }

                // Grid lines (subtle)
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(sx, sy, ts, ts);
            }
        }
    }

    _drawFog(ctx) {
        // Dark vignette / fog of war around the player
        const cx = this.player.x - this.cameraX;
        const cy = this.player.y - this.cameraY;
        const viewRadius = this.player.focusActive ? 200 : 130;

        const fog = ctx.createRadialGradient(cx, cy, viewRadius * 0.4, cx, cy, viewRadius);
        fog.addColorStop(0, 'rgba(0, 0, 0, 0)');
        fog.addColorStop(0.7, 'rgba(0, 0, 0, 0.3)');
        fog.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
        ctx.fillStyle = fog;
        ctx.fillRect(0, 0, this.RENDER_WIDTH, this.RENDER_HEIGHT);
    }

    _drawAllComplete(ctx) {
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, this.RENDER_WIDTH, this.RENDER_HEIGHT);

        ctx.fillStyle = '#44ff88';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ALL MISSIONS COMPLETE!', this.RENDER_WIDTH / 2, this.RENDER_HEIGHT / 2 - 30);

        ctx.fillStyle = '#ffdd00';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`Total Score: ${this.totalScore}`, this.RENDER_WIDTH / 2, this.RENDER_HEIGHT / 2 + 10);

        ctx.fillStyle = '#aaa';
        ctx.font = '10px monospace';
        ctx.fillText('You are the Shadow.', this.RENDER_WIDTH / 2, this.RENDER_HEIGHT / 2 + 40);
    }

    // === GAME EVENTS ===

    gameOver(reason) {
        this.state = 'gameover';
        this._gameOverReason = reason;
        this.audio.stopHeartbeat();
        this.audio.playGameOver();
    }

    victory() {
        this.state = 'victory';
        this.audio.stopHeartbeat();
        this.audio.playVictory();
        this.audio.playKill();

        // Score calculation
        const timeBonus = Math.max(0, Math.floor(this.timeLeft * 10));
        const stealthBonus = this.stats.alertsRaised === 0 ? 500 : 0;
        const holdBonus = Math.floor(this.stats.longestHold * 50);
        this.score = timeBonus + stealthBonus + holdBonus;
        this.totalScore += this.score;
    }

    retry() {
        this.loadLevel(this.currentLevel);
        this.state = 'intro';
        this.introTimer = 2;
    }

    nextLevel() {
        this.loadLevel(this.currentLevel + 1);
    }

    // === INPUT HANDLING ===

    // Called from controller via socket
    handleBreathState(holding) {
        if (!this.player || this.state !== 'playing') return;
        if (holding && this.player.breathRemaining > 0) {
            if (this.player.visible) {
                this.player.visible = false;
                this.player.breathReleaseCooldown = 0.5; // grace period before drain starts
                this.audio.playInvisibleOn();
            }
        } else {
            if (!this.player.visible) {
                this.player.visible = true;
                this.audio.playInvisibleOff();
            }
        }
    }

    handleMovement(x, y) {
        if (!this.player || this.state !== 'playing') return;
        this.player.moveX = x;
        this.player.moveY = y;
    }

    handleFocus(active) {
        if (!this.player) return;
        this.player.focusActive = active;
    }

    handleInteract() {
        if (!this.player || !this.levelData) return;

        if (this.state === 'gameover') {
            this.retry();
            return;
        }
        if (this.state === 'victory') {
            this.nextLevel();
            return;
        }
        if (this.state !== 'playing') return;

        const target = this.player.getInteractTile(
            this.levelData.cols, this.levelData.rows, this.mapData
        );
        if (!target) return;

        if (target.tile === TILE.DOOR) {
            // Toggle door open/close
            this.mapData[target.idx] = TILE.FLOOR;
            this.audio.playDoorOpen();
            this.hud.showMessage('Door opened', 1);
        } else if (target.tile === TILE.BARREL) {
            // Hide in barrel
            this.player.hidden = !this.player.hidden;
            this.hud.showMessage(this.player.hidden ? 'Hidden in barrel' : 'Left barrel', 1);
        }
    }

    handleDash() {
        // Quick dash in facing direction
        if (!this.player || this.state !== 'playing') return;
        const dirs = {
            'up': { dx: 0, dy: -1 },
            'down': { dx: 0, dy: 1 },
            'left': { dx: -1, dy: 0 },
            'right': { dx: 1, dy: 0 }
        };
        const d = dirs[this.player.facing];
        const dashDist = this.TILE_SIZE * 2;
        const newX = this.player.x + d.dx * dashDist;
        const newY = this.player.y + d.dy * dashDist;

        // Check collision at destination
        const cols = this.levelData.cols;
        const rows = this.levelData.rows;
        const tx = Math.floor(newX / this.TILE_SIZE);
        const ty = Math.floor(newY / this.TILE_SIZE);
        if (tx >= 0 && ty >= 0 && tx < cols && ty < rows) {
            if (!isSolid(this.mapData[ty * cols + tx])) {
                this.player.x = newX;
                this.player.y = newY;
            }
        }
    }

    // === KEYBOARD FALLBACK ===

    _setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            this.audio.resume();

            if (e.key === ' ' || e.key === 'Space') {
                // Space = hold breath
                this.handleBreathState(true);
            }
            if (e.key === 'e' || e.key === 'E') {
                this.handleInteract();
            }
            if (e.key === 'f' || e.key === 'F') {
                this.handleFocus(true);
            }
            if (e.key === 'r' || e.key === 'R') {
                if (this.state === 'gameover') this.retry();
            }
            if (e.key === 'n' || e.key === 'N') {
                if (this.state === 'victory') this.nextLevel();
            }
            if (e.key === 'Shift') {
                this.handleDash();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
            if (e.key === ' ' || e.key === 'Space') {
                this.handleBreathState(false);
            }
            if (e.key === 'f' || e.key === 'F') {
                this.handleFocus(false);
            }
        });
    }

    _processKeyboard() {
        let mx = 0, my = 0;
        if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']) my -= 1;
        if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']) my += 1;
        if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) mx -= 1;
        if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) mx += 1;

        // Only override if keyboard is being used (don't clobber phone input)
        if (mx !== 0 || my !== 0) {
            this.player.moveX = mx;
            this.player.moveY = my;
        }
    }
}
