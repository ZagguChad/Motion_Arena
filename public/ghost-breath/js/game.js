// ============================================
// Ghost of the Breath Temple — Main Game Engine
// Orchestrates game loop, rendering, states
// ============================================

import { BreathEngine } from './breath.js';
import { Flame } from './flame.js';
import { Ghost } from './ghost.js';
import { AudioEngine } from './audio.js';
import { LEVELS } from './levels.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Subsystems
        this.breath = new BreathEngine();
        this.flame = new Flame();
        this.ghost = new Ghost();
        this.audio = new AudioEngine();

        // Game state
        this.state = 'init'; // init, calibrating, intro, playing, victory, gameover
        this.currentLevel = 0;
        this.levelConfig = null;
        this.timer = 0;          // seconds remaining
        this.score = 0;
        this.totalScore = 0;
        this.comboCount = 0;
        this.maxCombo = 0;

        // Timing
        this.lastTime = 0;
        this.animFrame = null;

        // Intro animation
        this.introTimer = 0;
        this.introDuration = 3.5;

        // Breath guide circle
        this.guidePhase = 0;       // 0-1 expanding circle
        this.guideRadius = 0;
        this.guidePulseTimer = 0;

        // Visual effects
        this.screenShake = 0;
        this.bgParticles = [];
        this.messages = [];        // floating text messages

        // Pattern shift display
        this.patternShiftMessage = '';
        this.patternShiftTimer = 0;

        // Keyboard fallback
        this.keyboardMode = false;

        // Controller mode
        this.controllerConnected = false;
    }

    async init() {
        // Resize canvas
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Init audio
        this.audio.init();

        // Keyboard fallback — space = breath
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                this.audio.resume();
                if (this.state === 'calibrating') {
                    // Skip calibration in keyboard mode
                    this.keyboardMode = true;
                    this.breath.calibrated = true;
                    this.breath.noiseFloor = 0.01;
                    this._onCalibrated();
                } else if (this.state === 'playing') {
                    this.breath.simulateBreath();
                } else if (this.state === 'intro') {
                    // skip intro
                    this.introTimer = this.introDuration;
                } else if (this.state === 'victory' || this.state === 'gameover') {
                    this._nextAction();
                }
            }
        });

        // Setup breath callbacks
        this.breath.onBreathEvent = (ts) => this._onBreath(ts);
        this.breath.onRhythmHit = (q) => this._onHit(q);
        this.breath.onRhythmMiss = () => this._onMiss();

        // Ghost pattern shift callback
        this.ghost.onPatternShift = (pattern, name) => {
            this.breath.setPattern(pattern, this.levelConfig.tolerance);
            this.patternShiftMessage = `RHYTHM: ${name}`;
            this.patternShiftTimer = 2.5;
            this.audio.playPatternShift();
            this.screenShake = 0.3;
        };

        // Start
        this.state = 'calibrating';
        const micOk = await this.breath.init();
        if (!micOk) {
            this.keyboardMode = true;
            this.breath.calibrated = true;
            this._onCalibrated();
        }

        // Start game loop
        this.lastTime = performance.now();
        this._loop();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.parentElement.clientWidth;
        const h = this.canvas.parentElement.clientHeight;
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.W = w;
        this.H = h;

        // Reposition flame
        this.flame.setPosition(this.W / 2, this.H * 0.55);
        this.ghost.setPosition(this.W / 2, this.H * 0.25);
    }

    // ─── GAME LOOP ───
    _loop() {
        const now = performance.now();
        const dt = Math.min(0.1, (now - this.lastTime) / 1000);
        this.lastTime = now;

        this.update(dt);
        this.draw();

        this.animFrame = requestAnimationFrame(() => this._loop());
    }

    update(dt) {
        // Always update breath engine
        this.breath.update();

        switch (this.state) {
            case 'calibrating':
                if (this.breath.calibrated) {
                    this._onCalibrated();
                }
                break;

            case 'intro':
                this.introTimer += dt;
                if (this.introTimer >= this.introDuration) {
                    this._startPlaying();
                }
                break;

            case 'playing':
                this._updatePlaying(dt);
                break;

            case 'victory':
            case 'gameover':
                this.flame.update(dt);
                this.ghost.update(dt, 1.0); // ghost retreats on victory
                break;
        }

        // Screen shake decay
        if (this.screenShake > 0) this.screenShake -= dt * 2;

        // Floating messages
        for (let i = this.messages.length - 1; i >= 0; i--) {
            const m = this.messages[i];
            m.y -= 30 * dt;
            m.life -= dt;
            if (m.life <= 0) this.messages.splice(i, 1);
        }

        // Pattern shift message
        if (this.patternShiftTimer > 0) this.patternShiftTimer -= dt;

        // Background particles
        if (this.state !== 'init' && this.bgParticles.length < 40) {
            if (Math.random() < 0.15) {
                this.bgParticles.push({
                    x: Math.random() * this.W,
                    y: this.H + 5,
                    vy: -15 - Math.random() * 25,
                    vx: (Math.random() - 0.5) * 10,
                    life: 1.0,
                    decay: 0.1 + Math.random() * 0.15,
                    size: 1 + Math.random() * 2
                });
            }
        }
        for (let i = this.bgParticles.length - 1; i >= 0; i--) {
            const p = this.bgParticles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= p.decay * dt;
            if (p.life <= 0) this.bgParticles.splice(i, 1);
        }
    }

    _updatePlaying(dt) {
        // Timer countdown
        this.timer -= dt;
        if (this.timer <= 0) {
            this.timer = 0;
            // Check if player survived
            if (this.breath.accuracy >= this.levelConfig.requiredAccuracy) {
                this._onVictory();
            } else {
                this._onGameOver();
            }
            return;
        }

        // Update flame
        this.flame.update(dt);

        // Flame brightness driven by accuracy
        this.flame.targetBrightness = 0.2 + this.breath.accuracy * 0.8;

        // Ghost updates — appears when accuracy drops
        this.ghost.update(dt, this.breath.accuracy);

        // Flame decay when ghost is present
        if (this.ghost.presence > 0.3) {
            this.flame.targetBrightness -= this.ghost.presence * this.levelConfig.flameDecayRate;
        }

        // Check flame extinguished
        if (this.flame.brightness <= 0.05 && this.ghost.presence > 0.8) {
            this._onGameOver();
        }

        // Update breath guide circle
        this.guidePhase = this.breath.getBeatProgress();

        // Heartbeat sound on each beat cycle
        this.guidePulseTimer += dt;
        const beatInterval = this.levelConfig.pattern[
            this.breath.patternIndex % this.levelConfig.pattern.length
        ] / 1000;
        if (this.guidePulseTimer >= beatInterval) {
            this.guidePulseTimer -= beatInterval;
            this.audio.playHeartbeat(0.5);
        }

        // Ghost whisper when presence is high
        if (this.ghost.presence > 0.5 && Math.random() < dt * 0.3) {
            this.audio.playGhostWhisper();
        }
    }

    // ─── EVENT HANDLERS ───
    _onCalibrated() {
        this._loadLevel(this.currentLevel);
    }

    _loadLevel(idx) {
        this.currentLevel = idx;
        this.levelConfig = LEVELS[idx];

        // Setup breath pattern
        this.breath.setPattern(this.levelConfig.pattern, this.levelConfig.tolerance);

        // Configure ghost
        this.ghost.approachSpeed = this.levelConfig.ghostSpeed;
        this.ghost.retreatSpeed = this.levelConfig.ghostRetreatSpeed;
        this.ghost.presence = 0;

        // Level 4: setup pattern shifting
        if (this.levelConfig.ghostPatterns) {
            this.ghost.setupPatternShifting(
                this.levelConfig.ghostPatterns,
                this.levelConfig.ghostShiftInterval
            );
        }

        // Flame color
        this.flame.setColor(...this.levelConfig.flameColor);
        this.flame.brightness = 0.8;
        this.flame.targetBrightness = 0.8;

        // Timer
        this.timer = this.levelConfig.duration;
        this.score = 0;
        this.comboCount = 0;
        this.guidePulseTimer = 0;

        // Show intro
        this.state = 'intro';
        this.introTimer = 0;
        this.audio.startAmbient();
    }

    _startPlaying() {
        this.state = 'playing';
        this.breath.patternStartTime = 0; // reset — first breath starts the pattern
    }

    _onBreath(timestamp) {
        // Visual feedback: flame crackle
        this.audio.playFlameGrow();
    }

    _onHit(quality) {
        this.comboCount++;
        if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;

        const points = Math.round(100 * quality * (1 + this.comboCount * 0.1));
        this.score += points;

        this.flame.targetBrightness = Math.min(1.0, this.flame.targetBrightness + this.levelConfig.flameGrowRate);
        this.flame.flash();
        this.audio.playBreathChime(quality);

        // Floating score message
        const label = quality > 0.8 ? 'PERFECT' : quality > 0.5 ? 'GOOD' : 'OK';
        this.messages.push({
            text: `${label} +${points}`,
            x: this.W / 2,
            y: this.H * 0.45,
            life: 1.2,
            color: quality > 0.8 ? '#44ffaa' : quality > 0.5 ? '#88ccff' : '#aaaacc'
        });
    }

    _onMiss() {
        this.comboCount = 0;
        this.flame.targetBrightness = Math.max(0.1, this.flame.targetBrightness - this.levelConfig.flameDecayRate);
        this.screenShake = 0.2;
        this.audio.playMiss();

        this.messages.push({
            text: 'MISS',
            x: this.W / 2,
            y: this.H * 0.45,
            life: 1.0,
            color: '#ff4444'
        });
    }

    _onVictory() {
        this.state = 'victory';
        this.totalScore += this.score;
        this.audio.stopAmbient();
        this.audio.playVictory();
    }

    _onGameOver() {
        this.state = 'gameover';
        this.flame.targetBrightness = 0;
        this.ghost.targetPresence = 1;
        this.audio.stopAmbient();
        this.audio.playGameOver();
    }

    _nextAction() {
        if (this.state === 'victory') {
            if (this.currentLevel < LEVELS.length - 1) {
                this._loadLevel(this.currentLevel + 1);
            } else {
                // All levels complete — show final victory
                this.state = 'gameover'; // reuse screen, but with win text
                this.totalScore += this.score;
            }
        } else {
            // Restart current level
            this._loadLevel(this.currentLevel);
        }
    }

    // Called from controller via socket
    handleBreathEvent() {
        this.controllerConnected = true;
        this.audio.resume();
        if (this.state === 'calibrating') {
            this.keyboardMode = false;
            this.breath.calibrated = true;
            this.breath.noiseFloor = 0.01;
            this._onCalibrated();
        } else if (this.state === 'playing') {
            this.breath.simulateBreath();
        } else if (this.state === 'intro') {
            this.introTimer = this.introDuration;
        } else if (this.state === 'victory' || this.state === 'gameover') {
            this._nextAction();
        }
    }

    // ─── DRAW ───
    draw() {
        const ctx = this.ctx;
        const W = this.W;
        const H = this.H;

        // Screen shake offset
        let shakeX = 0, shakeY = 0;
        if (this.screenShake > 0) {
            shakeX = (Math.random() - 0.5) * this.screenShake * 8;
            shakeY = (Math.random() - 0.5) * this.screenShake * 8;
        }

        ctx.save();
        ctx.translate(shakeX, shakeY);

        // ─── BACKGROUND ───
        const bg = this.levelConfig ? this.levelConfig.bgColor : [10, 8, 20];
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`);
        grad.addColorStop(1, `rgb(${Math.max(0, bg[0] - 5)}, ${Math.max(0, bg[1] - 5)}, ${Math.max(0, bg[2] - 5)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(-10, -10, W + 20, H + 20);

        // Background particles (floating dust/embers)
        for (const p of this.bgParticles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(180, 140, 100, ${p.life * 0.3})`;
            ctx.fill();
        }

        // ─── STATE-SPECIFIC DRAWING ───
        switch (this.state) {
            case 'calibrating':
                this._drawCalibrating(ctx, W, H);
                break;
            case 'intro':
                this._drawIntro(ctx, W, H);
                break;
            case 'playing':
                this._drawPlaying(ctx, W, H);
                break;
            case 'victory':
                this._drawVictory(ctx, W, H);
                break;
            case 'gameover':
                this._drawGameOver(ctx, W, H);
                break;
        }

        ctx.restore();
    }

    _drawCalibrating(ctx, W, H) {
        const progress = this.breath.getCalibrationProgress();

        // Title
        ctx.textAlign = 'center';
        ctx.font = '600 12px "Press Start 2P", monospace';
        ctx.fillStyle = '#6644aa';
        ctx.fillText('GHOST OF THE BREATH TEMPLE', W / 2, H * 0.3);

        // Calibration ring
        const cx = W / 2, cy = H * 0.5;
        const radius = 50;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100, 80, 160, 0.3)';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = '#8866cc';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Mic icon
        ctx.font = '32px serif';
        ctx.fillText('🎤', cx, cy + 10);

        // Status text
        ctx.font = '600 9px "Press Start 2P", monospace';
        ctx.fillStyle = '#aa88ee';
        ctx.fillText('CALIBRATING MIC...', cx, cy + radius + 30);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(160, 140, 200, 0.6)';
        ctx.fillText('Stay silent for 3 seconds', cx, cy + radius + 50);
        ctx.fillText('(or press SPACE for keyboard mode)', cx, cy + radius + 68);
    }

    _drawIntro(ctx, W, H) {
        const t = this.introTimer / this.introDuration;
        const alpha = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;

        // Level number
        ctx.textAlign = 'center';
        ctx.font = '600 10px "Press Start 2P", monospace';
        ctx.fillStyle = `rgba(100, 80, 180, ${alpha})`;
        ctx.fillText(`LEVEL ${this.currentLevel + 1}`, W / 2, H * 0.3);

        // Level name
        ctx.font = '600 16px "Press Start 2P", monospace';
        ctx.fillStyle = `rgba(200, 160, 255, ${alpha})`;
        ctx.fillText(this.levelConfig.name, W / 2, H * 0.4);

        // Subtitle
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = `rgba(140, 120, 180, ${alpha})`;
        ctx.fillText(this.levelConfig.subtitle, W / 2, H * 0.5);

        // Guide message
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = `rgba(100, 200, 150, ${alpha})`;
        ctx.fillText(this.levelConfig.guideMessage, W / 2, H * 0.6);

        // Controls hint
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = `rgba(100, 100, 130, ${alpha * 0.7})`;
        if (this.keyboardMode) {
            ctx.fillText('SPACE = Breathe', W / 2, H * 0.72);
        } else {
            ctx.fillText('Breathe into the phone mic', W / 2, H * 0.72);
        }
    }

    _drawPlaying(ctx, W, H) {
        // Draw ghost (behind flame)
        this.ghost.draw(ctx, W, H);

        // Draw flame
        this.flame.draw(ctx);

        // ─── BREATHING GUIDE CIRCLE ───
        const gcx = W / 2;
        const gcy = H * 0.82;
        const maxR = 35;
        const minR = 12;
        const phase = this.guidePhase;

        // Expanding circle — shows when to breathe
        const r = minR + (maxR - minR) * (1 - Math.abs(phase * 2 - 1));
        const nearBeat = phase > 0.85 || phase < 0.15;

        ctx.beginPath();
        ctx.arc(gcx, gcy, r, 0, Math.PI * 2);
        ctx.strokeStyle = nearBeat ? 'rgba(100, 255, 150, 0.8)' : 'rgba(100, 140, 200, 0.4)';
        ctx.lineWidth = nearBeat ? 3 : 2;
        ctx.stroke();

        // Inner dot
        ctx.beginPath();
        ctx.arc(gcx, gcy, 4, 0, Math.PI * 2);
        ctx.fillStyle = nearBeat ? '#44ff88' : '#6688aa';
        ctx.fill();

        // "BREATHE" label when near beat
        if (nearBeat) {
            ctx.font = '600 8px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(100, 255, 150, 0.9)';
            ctx.fillText('BREATHE', gcx, gcy + maxR + 18);
        }

        // ─── MIC LEVEL BAR ───
        if (!this.keyboardMode) {
            const micLevel = this.breath.getMicLevel();
            const barW = 120;
            const barH = 6;
            const barX = W / 2 - barW / 2;
            const barY = H * 0.93;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = micLevel > 0.4 ? 'rgba(100, 255, 150, 0.6)' : 'rgba(80, 120, 180, 0.4)';
            ctx.fillRect(barX, barY, barW * micLevel, barH);

            ctx.font = '6px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(150, 150, 180, 0.5)';
            ctx.fillText('MIC', W / 2, barY - 4);
        }

        // ─── HUD ───
        // Timer
        ctx.textAlign = 'left';
        ctx.font = '600 10px "Press Start 2P", monospace';
        ctx.fillStyle = this.timer < 10 ? '#ff6644' : '#8888aa';
        const mins = Math.floor(this.timer / 60);
        const secs = Math.floor(this.timer % 60);
        ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, 15, 25);

        // Score
        ctx.textAlign = 'right';
        ctx.fillStyle = '#aaccff';
        ctx.fillText(this.score.toString(), W - 15, 25);

        // Combo
        if (this.comboCount > 1) {
            ctx.font = '8px "Press Start 2P", monospace';
            ctx.fillStyle = '#ffcc44';
            ctx.fillText(`${this.comboCount}x COMBO`, W - 15, 42);
        }

        // Accuracy bar
        const accW = 80;
        const accH = 5;
        const accX = 15;
        const accY = 36;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(accX, accY, accW, accH);
        const accColor = this.breath.accuracy > 0.7 ? '#44ff88' :
            this.breath.accuracy > 0.4 ? '#ffcc44' : '#ff4444';
        ctx.fillStyle = accColor;
        ctx.fillRect(accX, accY, accW * this.breath.accuracy, accH);
        ctx.font = '6px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(150, 150, 180, 0.5)';
        ctx.fillText('ACCURACY', accX, accY + accH + 12);

        // Level indicator
        ctx.textAlign = 'center';
        ctx.font = '6px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(100, 80, 160, 0.5)';
        ctx.fillText(`LEVEL ${this.currentLevel + 1}`, W / 2, 18);

        // ─── FLOATING MESSAGES ───
        for (const m of this.messages) {
            ctx.textAlign = 'center';
            ctx.font = '600 10px "Press Start 2P", monospace';
            ctx.fillStyle = m.color.replace(')', `, ${Math.min(1, m.life)})`).replace('rgb', 'rgba');
            // Handle hex colors
            if (m.color.startsWith('#')) {
                ctx.globalAlpha = Math.min(1, m.life);
                ctx.fillStyle = m.color;
            }
            ctx.fillText(m.text, m.x, m.y);
            ctx.globalAlpha = 1;
        }

        // ─── PATTERN SHIFT MESSAGE ───
        if (this.patternShiftTimer > 0) {
            const pAlpha = Math.min(1, this.patternShiftTimer);
            ctx.textAlign = 'center';
            ctx.font = '600 12px "Press Start 2P", monospace';
            ctx.fillStyle = `rgba(255, 160, 255, ${pAlpha})`;
            ctx.fillText(this.patternShiftMessage, W / 2, H * 0.15);
        }
    }

    _drawVictory(ctx, W, H) {
        this.flame.draw(ctx);

        // Overlay
        ctx.fillStyle = 'rgba(10, 20, 15, 0.4)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        // Title
        ctx.font = '600 14px "Press Start 2P", monospace';
        ctx.fillStyle = '#44ff88';
        ctx.fillText('FLAME PRESERVED', W / 2, H * 0.3);

        // Level info
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = '#88ccaa';
        ctx.fillText(`Level ${this.currentLevel + 1} Complete`, W / 2, H * 0.4);

        // Stats
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = '#aaddcc';
        ctx.fillText(`Score: ${this.score}`, W / 2, H * 0.52);
        ctx.fillText(`Max Combo: ${this.maxCombo}x`, W / 2, H * 0.58);
        ctx.fillText(`Accuracy: ${Math.round(this.breath.accuracy * 100)}%`, W / 2, H * 0.64);

        // Next prompt
        const isLastLevel = this.currentLevel >= LEVELS.length - 1;
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(100, 200, 150, 0.6)';
        const nextText = isLastLevel ? 'ALL LEVELS COMPLETE! PRESS SPACE' : 'PRESS SPACE FOR NEXT LEVEL';
        ctx.fillText(this.keyboardMode ? nextText : 'BREATHE TO CONTINUE', W / 2, H * 0.78);
    }

    _drawGameOver(ctx, W, H) {
        this.ghost.draw(ctx, W, H);
        this.flame.draw(ctx);

        // Dark overlay
        ctx.fillStyle = 'rgba(15, 5, 20, 0.6)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        // Title
        ctx.font = '600 14px "Press Start 2P", monospace';
        ctx.fillStyle = '#ff4466';
        ctx.fillText('FLAME EXTINGUISHED', W / 2, H * 0.3);

        // Ghost won message
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = '#cc88aa';
        ctx.fillText('The ghost disrupted your rhythm...', W / 2, H * 0.42);

        // Stats
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = '#aa7799';
        ctx.fillText(`Score: ${this.score}`, W / 2, H * 0.55);
        ctx.fillText(`Max Combo: ${this.maxCombo}x`, W / 2, H * 0.61);

        // Retry prompt
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(200, 100, 150, 0.6)';
        ctx.fillText(this.keyboardMode ? 'PRESS SPACE TO RETRY' : 'BREATHE TO RETRY', W / 2, H * 0.78);
    }

    destroy() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        this.breath.destroy();
        this.audio.stopAmbient();
    }
}
