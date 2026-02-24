// ============================================
// Ghost of the Breath Temple — Main Game Engine
// Orchestrates game loop, rendering, states
// Enhanced with temple environment & rich visuals
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
        this.levelsCompleted = []; // track which levels are done

        // Timing
        this.lastTime = 0;
        this.animFrame = null;

        // Intro animation
        this.introTimer = 0;
        this.introDuration = 3.5;

        // Breath guide circle
        this.guidePhase = 0;
        this.guideRadius = 0;
        this.guidePulseTimer = 0;

        // Visual effects
        this.screenShake = 0;
        this.bgParticles = [];
        this.messages = [];        // floating text messages

        // Pattern shift display
        this.patternShiftMessage = '';
        this.patternShiftTimer = 0;

        // Temple environment
        this.runeGlow = [];        // floor runes {x, y, radius, phase}
        this.pillarOffsets = [];    // pre-computed pillar positions

        // Victory / gameover particles
        this.celebrationParticles = [];

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

        // Generate temple elements
        this._generateTempleElements();

        // Keyboard fallback — space = breath
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                this.audio.resume();
                if (this.state === 'calibrating') {
                    this.keyboardMode = true;
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

    _generateTempleElements() {
        // Floor runes — glowing symbols
        this.runeGlow = [];
        for (let i = 0; i < 8; i++) {
            this.runeGlow.push({
                x: 0.1 + Math.random() * 0.8,   // normalized
                y: 0.75 + Math.random() * 0.2,
                radius: 8 + Math.random() * 16,
                phase: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random() * 1.5
            });
        }

        // Pillar positions (left and right)
        this.pillarOffsets = [
            { side: 'left', xOff: 0.04, height: 0.7 },
            { side: 'left', xOff: 0.10, height: 0.8 },
            { side: 'right', xOff: 0.96, height: 0.7 },
            { side: 'right', xOff: 0.90, height: 0.8 },
        ];
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

        // Reposition flame & ghost
        this.flame.setPosition(this.W / 2, this.H * 0.55);
        this.ghost.setPosition(this.W / 2, this.H * 0.25);
        this.ghost.setFlamePosition(this.W / 2, this.H * 0.55);
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
                this.ghost.update(dt, 1.0);
                // Update celebration particles
                for (let i = this.celebrationParticles.length - 1; i >= 0; i--) {
                    const p = this.celebrationParticles[i];
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vy += 40 * dt; // gravity
                    p.life -= p.decay * dt;
                    if (p.life <= 0) this.celebrationParticles.splice(i, 1);
                }
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
        if (this.state !== 'init' && this.bgParticles.length < 50) {
            if (Math.random() < 0.2) {
                const levelColors = this.levelConfig ? this.levelConfig.bgColor : [10, 8, 20];
                this.bgParticles.push({
                    x: Math.random() * this.W,
                    y: this.H + 5,
                    vy: -12 - Math.random() * 22,
                    vx: (Math.random() - 0.5) * 8,
                    life: 1.0,
                    decay: 0.08 + Math.random() * 0.12,
                    size: 1 + Math.random() * 2.5,
                    r: Math.min(255, levelColors[0] * 8 + 100),
                    g: Math.min(255, levelColors[1] * 6 + 80),
                    b: Math.min(255, levelColors[2] * 4 + 100)
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
        this.celebrationParticles = [];

        // Show intro
        this.state = 'intro';
        this.introTimer = 0;
        this.audio.startAmbient();
    }

    _startPlaying() {
        this.state = 'playing';
        this.breath.patternStartTime = 0;
    }

    _onBreath(timestamp) {
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
        const colors = {
            'PERFECT': '#44ffaa',
            'GOOD': '#88ccff',
            'OK': '#aaaacc'
        };
        this.messages.push({
            text: `${label} +${points}`,
            x: this.W / 2 + (Math.random() - 0.5) * 40,
            y: this.H * 0.45,
            life: 1.3,
            color: colors[label],
            scale: quality > 0.8 ? 1.3 : 1.0
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
            color: '#ff4444',
            scale: 1.0
        });
    }

    _onVictory() {
        this.state = 'victory';
        this.totalScore += this.score;
        this.levelsCompleted.push(this.currentLevel);
        this.audio.stopAmbient();
        this.audio.playVictory();

        // Spawn celebration particles
        for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 150;
            const hue = Math.random() * 120 + 80; // green-cyan range
            this.celebrationParticles.push({
                x: this.W / 2,
                y: this.H * 0.4,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 40,
                life: 1.0,
                decay: 0.4 + Math.random() * 0.6,
                size: 2 + Math.random() * 4,
                color: `hsl(${hue}, 80%, 65%)`
            });
        }
    }

    _onGameOver() {
        this.state = 'gameover';
        this.flame.targetBrightness = 0;
        this.ghost.targetPresence = 1;
        this.audio.stopAmbient();
        this.audio.playGameOver();

        // Spawn dark particles
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 30 + Math.random() * 80;
            this.celebrationParticles.push({
                x: this.W / 2,
                y: this.H * 0.55,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 20,
                life: 1.0,
                decay: 0.3 + Math.random() * 0.5,
                size: 2 + Math.random() * 3,
                color: `rgba(${120 + Math.floor(Math.random() * 60)}, ${30 + Math.floor(Math.random() * 40)}, ${140 + Math.floor(Math.random() * 80)}, 0.8)`
            });
        }
    }

    _nextAction() {
        if (this.state === 'victory') {
            if (this.currentLevel < LEVELS.length - 1) {
                this._loadLevel(this.currentLevel + 1);
            } else {
                this.state = 'gameover';
                this.totalScore += this.score;
            }
        } else {
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
        grad.addColorStop(0.6, `rgb(${Math.max(0, bg[0] - 3)}, ${Math.max(0, bg[1] - 3)}, ${Math.max(0, bg[2] - 3)})`);
        grad.addColorStop(1, `rgb(${Math.max(0, bg[0] - 6)}, ${Math.max(0, bg[1] - 6)}, ${Math.max(0, bg[2] - 6)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(-10, -10, W + 20, H + 20);

        // ─── TEMPLE ENVIRONMENT ───
        if (this.state !== 'init' && this.state !== 'calibrating') {
            this._drawTemple(ctx, W, H);
        }

        // Background particles (floating dust/embers)
        for (const p of this.bgParticles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.life * 0.35})`;
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

        // ─── VIGNETTE OVERLAY ───
        this._drawVignette(ctx, W, H);

        ctx.restore();
    }

    _drawTemple(ctx, W, H) {
        const b = this.flame ? this.flame.brightness : 0.5;
        const fc = this.levelConfig ? this.levelConfig.flameColor : [255, 160, 50];

        // ─── STONE PILLARS ───
        for (const pillar of this.pillarOffsets) {
            const px = pillar.xOff * W;
            const pw = W * 0.035;
            const ph = H * pillar.height;
            const py = H - ph;

            // Pillar gradient
            const pillarGrad = ctx.createLinearGradient(px - pw / 2, py, px + pw / 2, H);
            pillarGrad.addColorStop(0, `rgba(40, 35, 50, 0.5)`);
            pillarGrad.addColorStop(0.5, `rgba(30, 25, 40, 0.6)`);
            pillarGrad.addColorStop(1, `rgba(20, 15, 30, 0.7)`);
            ctx.fillStyle = pillarGrad;
            ctx.fillRect(px - pw / 2, py, pw, ph);

            // Pillar cap
            ctx.fillStyle = 'rgba(50, 42, 65, 0.6)';
            ctx.fillRect(px - pw / 2 - 3, py, pw + 6, 6);

            // Pillar base
            ctx.fillStyle = 'rgba(45, 38, 58, 0.5)';
            ctx.fillRect(px - pw / 2 - 2, H - 8, pw + 4, 8);

            // Light cast on pillar from flame
            const lightDist = Math.abs(px - W / 2) / W;
            const lightAmount = Math.max(0, (1 - lightDist * 2)) * b * 0.08;
            if (lightAmount > 0.005) {
                const lightGrad = ctx.createLinearGradient(
                    px < W / 2 ? px + pw / 2 : px - pw / 2, py,
                    px < W / 2 ? px - pw / 2 : px + pw / 2, py
                );
                lightGrad.addColorStop(0, `rgba(${fc[0]}, ${fc[1]}, ${fc[2]}, ${lightAmount})`);
                lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = lightGrad;
                ctx.fillRect(px - pw / 2, py, pw, ph);
            }
        }

        // ─── FLOOR LINE ───
        const floorY = H * 0.78;
        ctx.strokeStyle = `rgba(60, 50, 80, 0.2)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W * 0.05, floorY);
        ctx.lineTo(W * 0.95, floorY);
        ctx.stroke();

        // ─── FLOOR RUNES ───
        const time = performance.now() / 1000;
        for (const rune of this.runeGlow) {
            const rx = rune.x * W;
            const ry = rune.y * H;
            const glowAmount = (Math.sin(time * rune.speed + rune.phase) * 0.5 + 0.5) * b;

            if (glowAmount < 0.05) continue;

            // Rune circle
            const runeGrad = ctx.createRadialGradient(rx, ry, 0, rx, ry, rune.radius);
            runeGrad.addColorStop(0, `rgba(${Math.min(255, fc[0] * 0.4 + 60)}, ${Math.min(255, fc[1] * 0.3 + 40)}, ${Math.min(255, fc[2] * 0.5 + 100)}, ${glowAmount * 0.12})`);
            runeGrad.addColorStop(0.5, `rgba(${Math.min(255, fc[0] * 0.3 + 40)}, ${Math.min(255, fc[1] * 0.2 + 30)}, ${Math.min(255, fc[2] * 0.4 + 80)}, ${glowAmount * 0.05})`);
            runeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = runeGrad;
            ctx.fillRect(rx - rune.radius, ry - rune.radius, rune.radius * 2, rune.radius * 2);

            // Rune symbol (small geometric shapes)
            ctx.strokeStyle = `rgba(${Math.min(255, fc[0] * 0.5 + 80)}, ${Math.min(255, fc[1] * 0.3 + 50)}, ${Math.min(255, fc[2] * 0.6 + 120)}, ${glowAmount * 0.2})`;
            ctx.lineWidth = 0.8;
            const symSize = rune.radius * 0.4;
            ctx.beginPath();
            // Triangle rune
            ctx.moveTo(rx, ry - symSize);
            ctx.lineTo(rx - symSize * 0.87, ry + symSize * 0.5);
            ctx.lineTo(rx + symSize * 0.87, ry + symSize * 0.5);
            ctx.closePath();
            ctx.stroke();
        }
    }

    _drawVignette(ctx, W, H) {
        // Top vignette
        const topVig = ctx.createLinearGradient(0, 0, 0, H * 0.15);
        topVig.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
        topVig.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = topVig;
        ctx.fillRect(0, 0, W, H * 0.15);

        // Bottom vignette
        const botVig = ctx.createLinearGradient(0, H * 0.85, 0, H);
        botVig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        botVig.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
        ctx.fillStyle = botVig;
        ctx.fillRect(0, H * 0.85, W, H * 0.15);

        // Left/right edge vignette
        const leftVig = ctx.createLinearGradient(0, 0, W * 0.1, 0);
        leftVig.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
        leftVig.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = leftVig;
        ctx.fillRect(0, 0, W * 0.1, H);

        const rightVig = ctx.createLinearGradient(W * 0.9, 0, W, 0);
        rightVig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        rightVig.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = rightVig;
        ctx.fillRect(W * 0.9, 0, W * 0.1, H);
    }

    _drawCalibrating(ctx, W, H) {
        const progress = this.breath.getCalibrationProgress();

        // Title
        ctx.textAlign = 'center';
        ctx.font = '600 12px "Press Start 2P", monospace';
        ctx.fillStyle = '#6644aa';
        ctx.shadowColor = 'rgba(100, 68, 170, 0.5)';
        ctx.shadowBlur = 15;
        ctx.fillText('GHOST OF THE BREATH TEMPLE', W / 2, H * 0.28);
        ctx.shadowBlur = 0;

        // Calibration ring
        const cx = W / 2, cy = H * 0.5;
        const radius = 55;

        // Outer ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(80, 60, 140, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Background ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100, 80, 160, 0.2)';
        ctx.lineWidth = 5;
        ctx.stroke();

        // Progress ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = '#8866cc';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Mic icon
        ctx.font = '36px serif';
        ctx.shadowBlur = 0;
        ctx.fillText('🎤', cx, cy + 12);

        // Progress percentage inside
        ctx.font = '600 8px "Press Start 2P", monospace';
        ctx.fillStyle = '#aa88ee';
        ctx.fillText(`${Math.round(progress * 100)}%`, cx, cy + 32);

        // Status text
        ctx.font = '600 9px "Press Start 2P", monospace';
        ctx.fillStyle = '#aa88ee';
        ctx.fillText('CALIBRATING MIC...', cx, cy + radius + 35);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(160, 140, 200, 0.6)';
        ctx.fillText('Stay silent for 3 seconds', cx, cy + radius + 55);
        ctx.fillStyle = 'rgba(140, 120, 180, 0.4)';
        ctx.fillText('(or press SPACE for keyboard mode)', cx, cy + radius + 73);
    }

    _drawIntro(ctx, W, H) {
        const t = this.introTimer / this.introDuration;

        // Staggered fade-in for each element
        const titleAlpha = Math.min(1, t * 4);                           // 0-0.25s
        const nameAlpha = Math.min(1, Math.max(0, (t - 0.15) * 3));     // 0.15-0.48s
        const subAlpha = Math.min(1, Math.max(0, (t - 0.3) * 3));       // 0.3-0.63s
        const guideAlpha = Math.min(1, Math.max(0, (t - 0.45) * 3));    // 0.45-0.78s
        const fadeOut = t > 0.8 ? (1 - t) / 0.2 : 1;

        // Level number with glow
        ctx.textAlign = 'center';
        ctx.font = '600 10px "Press Start 2P", monospace';
        ctx.fillStyle = `rgba(100, 80, 180, ${titleAlpha * fadeOut})`;
        ctx.shadowColor = `rgba(100, 80, 180, ${titleAlpha * fadeOut * 0.5})`;
        ctx.shadowBlur = 10;
        ctx.fillText(`— LEVEL ${this.currentLevel + 1} —`, W / 2, H * 0.28);

        // Level name — larger, with strong glow
        ctx.font = '600 18px "Press Start 2P", monospace';
        ctx.fillStyle = `rgba(200, 160, 255, ${nameAlpha * fadeOut})`;
        ctx.shadowColor = `rgba(180, 120, 255, ${nameAlpha * fadeOut * 0.4})`;
        ctx.shadowBlur = 20;
        ctx.fillText(this.levelConfig.name, W / 2, H * 0.40);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = `rgba(140, 120, 180, ${subAlpha * fadeOut})`;
        ctx.fillText(this.levelConfig.subtitle, W / 2, H * 0.50);

        // Decorative line
        const lineW = 80 * subAlpha;
        ctx.strokeStyle = `rgba(100, 80, 160, ${subAlpha * fadeOut * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2 - lineW, H * 0.545);
        ctx.lineTo(W / 2 + lineW, H * 0.545);
        ctx.stroke();

        // Guide message
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = `rgba(100, 200, 150, ${guideAlpha * fadeOut})`;
        ctx.fillText(this.levelConfig.guideMessage, W / 2, H * 0.62);

        // Controls hint
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = `rgba(100, 100, 130, ${guideAlpha * fadeOut * 0.6})`;
        if (this.keyboardMode) {
            ctx.fillText('SPACE = Breathe', W / 2, H * 0.72);
        } else {
            ctx.fillText('Breathe into the phone mic', W / 2, H * 0.72);
        }

        // Level progress dots
        this._drawLevelDots(ctx, W, H, guideAlpha * fadeOut);
    }

    _drawLevelDots(ctx, W, H, alpha) {
        const dotCount = LEVELS.length;
        const dotSpacing = 16;
        const startX = W / 2 - (dotCount - 1) * dotSpacing / 2;
        const dotY = H * 0.82;

        for (let i = 0; i < dotCount; i++) {
            const dx = startX + i * dotSpacing;
            ctx.beginPath();
            ctx.arc(dx, dotY, 4, 0, Math.PI * 2);

            if (this.levelsCompleted.includes(i)) {
                // Completed — green filled
                ctx.fillStyle = `rgba(68, 255, 136, ${alpha * 0.8})`;
                ctx.fill();
            } else if (i === this.currentLevel) {
                // Current — outlined bright
                ctx.strokeStyle = `rgba(200, 160, 255, ${alpha * 0.8})`;
                ctx.lineWidth = 2;
                ctx.stroke();
                // Pulse
                const pulse = Math.sin(performance.now() / 500) * 0.3 + 0.5;
                ctx.beginPath();
                ctx.arc(dx, dotY, 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200, 160, 255, ${alpha * pulse})`;
                ctx.fill();
            } else {
                // Future — dim outline
                ctx.strokeStyle = `rgba(100, 80, 140, ${alpha * 0.3})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
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
        const maxR = 38;
        const minR = 12;
        const phase = this.guidePhase;

        // Expanding circle — shows when to breathe
        const r = minR + (maxR - minR) * (1 - Math.abs(phase * 2 - 1));
        const nearBeat = phase > 0.85 || phase < 0.15;

        // Outer halo
        if (nearBeat) {
            const haloGrad = ctx.createRadialGradient(gcx, gcy, r, gcx, gcy, r + 15);
            haloGrad.addColorStop(0, 'rgba(100, 255, 150, 0.15)');
            haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = haloGrad;
            ctx.fillRect(gcx - r - 15, gcy - r - 15, (r + 15) * 2, (r + 15) * 2);
        }

        ctx.beginPath();
        ctx.arc(gcx, gcy, r, 0, Math.PI * 2);
        ctx.strokeStyle = nearBeat ? 'rgba(100, 255, 150, 0.8)' : 'rgba(100, 140, 200, 0.3)';
        ctx.lineWidth = nearBeat ? 3 : 2;
        ctx.stroke();

        // Inner dot
        ctx.beginPath();
        ctx.arc(gcx, gcy, nearBeat ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = nearBeat ? '#44ff88' : '#6688aa';
        ctx.fill();

        // "BREATHE" label when near beat
        if (nearBeat) {
            ctx.font = '600 8px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(100, 255, 150, 0.9)';
            ctx.shadowColor = 'rgba(100, 255, 150, 0.3)';
            ctx.shadowBlur = 8;
            ctx.fillText('BREATHE', gcx, gcy + maxR + 18);
            ctx.shadowBlur = 0;
        }

        // ─── MIC LEVEL BAR ───
        if (!this.keyboardMode) {
            const micLevel = this.breath.getMicLevel();
            const barW = 120;
            const barH = 6;
            const barX = W / 2 - barW / 2;
            const barY = H * 0.93;

            // Background with rounded caps
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, 3);
            ctx.fill();

            // Fill
            const micColor = micLevel > 0.5 ? 'rgba(100, 255, 150, 0.6)' :
                micLevel > 0.2 ? 'rgba(80, 180, 220, 0.5)' : 'rgba(80, 120, 180, 0.3)';
            ctx.fillStyle = micColor;
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW * micLevel, barH, 3);
            ctx.fill();

            ctx.font = '6px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(150, 150, 180, 0.4)';
            ctx.fillText('MIC', W / 2, barY - 4);
        }

        // ─── HUD ───
        // Timer
        ctx.textAlign = 'left';
        ctx.font = '600 11px "Press Start 2P", monospace';
        const timerUrgent = this.timer < 10;
        ctx.fillStyle = timerUrgent ? '#ff6644' : '#8888aa';
        if (timerUrgent) {
            ctx.shadowColor = 'rgba(255, 102, 68, 0.4)';
            ctx.shadowBlur = 8;
        }
        const mins = Math.floor(this.timer / 60);
        const secs = Math.floor(this.timer % 60);
        ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, 15, 25);
        ctx.shadowBlur = 0;

        // Score
        ctx.textAlign = 'right';
        ctx.fillStyle = '#aaccff';
        ctx.fillText(this.score.toString(), W - 15, 25);

        // Combo with glow effect
        if (this.comboCount > 1) {
            ctx.font = '8px "Press Start 2P", monospace';
            const comboIntensity = Math.min(1, this.comboCount / 10);
            const comboColor = comboIntensity > 0.5 ? '#ffaa22' : '#ffcc44';
            ctx.fillStyle = comboColor;
            if (this.comboCount >= 5) {
                ctx.shadowColor = 'rgba(255, 170, 34, 0.5)';
                ctx.shadowBlur = 10;
            }
            ctx.fillText(`${this.comboCount}x COMBO`, W - 15, 42);
            ctx.shadowBlur = 0;
        }

        // Accuracy bar with gradient
        const accW = 90;
        const accH = 6;
        const accX = 15;
        const accY = 38;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.roundRect(accX, accY, accW, accH, 3);
        ctx.fill();

        // Gradient fill based on accuracy
        const accGrad = ctx.createLinearGradient(accX, accY, accX + accW * this.breath.accuracy, accY);
        if (this.breath.accuracy > 0.7) {
            accGrad.addColorStop(0, '#22cc66');
            accGrad.addColorStop(1, '#44ff88');
        } else if (this.breath.accuracy > 0.4) {
            accGrad.addColorStop(0, '#cc9922');
            accGrad.addColorStop(1, '#ffcc44');
        } else {
            accGrad.addColorStop(0, '#cc2222');
            accGrad.addColorStop(1, '#ff4444');
        }
        ctx.fillStyle = accGrad;
        ctx.beginPath();
        ctx.roundRect(accX, accY, accW * this.breath.accuracy, accH, 3);
        ctx.fill();

        ctx.font = '6px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(150, 150, 180, 0.4)';
        ctx.fillText('ACCURACY', accX, accY + accH + 12);

        // Level indicator
        ctx.textAlign = 'center';
        ctx.font = '6px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(100, 80, 160, 0.4)';
        ctx.fillText(`LEVEL ${this.currentLevel + 1}`, W / 2, 18);

        // Level progress dots (small, top center)
        this._drawLevelDotsSmall(ctx, W);

        // ─── FLOATING MESSAGES ───
        for (const m of this.messages) {
            ctx.textAlign = 'center';
            const fontSize = Math.round(10 * (m.scale || 1));
            ctx.font = `600 ${fontSize}px "Press Start 2P", monospace`;
            ctx.globalAlpha = Math.min(1, m.life);
            ctx.fillStyle = m.color;
            if (m.life > 0.8) {
                ctx.shadowColor = m.color;
                ctx.shadowBlur = 10;
            }
            ctx.fillText(m.text, m.x, m.y);
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }

        // ─── PATTERN SHIFT MESSAGE ───
        if (this.patternShiftTimer > 0) {
            const pAlpha = Math.min(1, this.patternShiftTimer);
            ctx.textAlign = 'center';
            ctx.font = '600 12px "Press Start 2P", monospace';
            ctx.fillStyle = `rgba(255, 160, 255, ${pAlpha})`;
            ctx.shadowColor = `rgba(255, 160, 255, ${pAlpha * 0.4})`;
            ctx.shadowBlur = 15;
            ctx.fillText(this.patternShiftMessage, W / 2, H * 0.15);
            ctx.shadowBlur = 0;
        }
    }

    _drawLevelDotsSmall(ctx, W) {
        const dotCount = LEVELS.length;
        const dotSpacing = 10;
        const startX = W / 2 - (dotCount - 1) * dotSpacing / 2;
        const dotY = 30;

        for (let i = 0; i < dotCount; i++) {
            const dx = startX + i * dotSpacing;
            ctx.beginPath();
            ctx.arc(dx, dotY, 2.5, 0, Math.PI * 2);

            if (this.levelsCompleted.includes(i)) {
                ctx.fillStyle = 'rgba(68, 255, 136, 0.6)';
                ctx.fill();
            } else if (i === this.currentLevel) {
                ctx.fillStyle = 'rgba(200, 160, 255, 0.7)';
                ctx.fill();
            } else {
                ctx.strokeStyle = 'rgba(100, 80, 140, 0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }

    _drawVictory(ctx, W, H) {
        this.flame.draw(ctx);

        // Overlay
        ctx.fillStyle = 'rgba(10, 20, 15, 0.4)';
        ctx.fillRect(0, 0, W, H);

        // Celebration particles
        for (const p of this.celebrationParticles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.globalAlpha = Math.min(1, p.life);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.textAlign = 'center';

        // Title with glow
        ctx.font = '600 16px "Press Start 2P", monospace';
        ctx.fillStyle = '#44ff88';
        ctx.shadowColor = 'rgba(68, 255, 136, 0.5)';
        ctx.shadowBlur = 20;
        ctx.fillText('FLAME PRESERVED', W / 2, H * 0.28);
        ctx.shadowBlur = 0;

        // Level info
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = '#88ccaa';
        ctx.fillText(`Level ${this.currentLevel + 1} Complete`, W / 2, H * 0.38);

        // Decorative line
        ctx.strokeStyle = 'rgba(68, 255, 136, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 60, H * 0.42);
        ctx.lineTo(W / 2 + 60, H * 0.42);
        ctx.stroke();

        // Stats
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = '#aaddcc';
        ctx.fillText(`Score: ${this.score}`, W / 2, H * 0.50);
        ctx.fillText(`Max Combo: ${this.maxCombo}x`, W / 2, H * 0.56);
        ctx.fillText(`Accuracy: ${Math.round(this.breath.accuracy * 100)}%`, W / 2, H * 0.62);

        // Total score
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(136, 204, 170, 0.6)';
        ctx.fillText(`Total: ${this.totalScore}`, W / 2, H * 0.68);

        // Level dots
        this._drawLevelDots(ctx, W, H, 0.8);

        // Next prompt
        const isLastLevel = this.currentLevel >= LEVELS.length - 1;
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(100, 200, 150, 0.6)';
        const pulse = Math.sin(performance.now() / 500) * 0.2 + 0.8;
        ctx.globalAlpha = pulse;
        const nextText = isLastLevel ? 'ALL LEVELS COMPLETE! PRESS SPACE' : 'PRESS SPACE FOR NEXT LEVEL';
        ctx.fillText(this.keyboardMode ? nextText : 'BREATHE TO CONTINUE', W / 2, H * 0.88);
        ctx.globalAlpha = 1;
    }

    _drawGameOver(ctx, W, H) {
        this.ghost.draw(ctx, W, H);
        this.flame.draw(ctx);

        // Dark overlay
        ctx.fillStyle = 'rgba(15, 5, 20, 0.6)';
        ctx.fillRect(0, 0, W, H);

        // Dark particles
        for (const p of this.celebrationParticles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.globalAlpha = Math.min(1, p.life);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.textAlign = 'center';

        // Title with sinister glow
        ctx.font = '600 15px "Press Start 2P", monospace';
        ctx.fillStyle = '#ff4466';
        ctx.shadowColor = 'rgba(255, 68, 102, 0.5)';
        ctx.shadowBlur = 20;
        ctx.fillText('FLAME EXTINGUISHED', W / 2, H * 0.28);
        ctx.shadowBlur = 0;

        // Ghost won message
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = '#cc88aa';
        ctx.fillText('The ghost disrupted your rhythm...', W / 2, H * 0.40);

        // Decorative line
        ctx.strokeStyle = 'rgba(255, 68, 102, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 60, H * 0.44);
        ctx.lineTo(W / 2 + 60, H * 0.44);
        ctx.stroke();

        // Stats
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = '#aa7799';
        ctx.fillText(`Score: ${this.score}`, W / 2, H * 0.53);
        ctx.fillText(`Max Combo: ${this.maxCombo}x`, W / 2, H * 0.59);

        // Level dots
        this._drawLevelDots(ctx, W, H, 0.6);

        // Retry prompt (pulsing)
        ctx.font = '7px "Press Start 2P", monospace';
        const pulse = Math.sin(performance.now() / 500) * 0.2 + 0.8;
        ctx.fillStyle = `rgba(200, 100, 150, ${0.6 * pulse})`;
        ctx.fillText(this.keyboardMode ? 'PRESS SPACE TO RETRY' : 'BREATHE TO RETRY', W / 2, H * 0.82);
    }

    destroy() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        this.breath.destroy();
        this.audio.stopAmbient();
    }
}
