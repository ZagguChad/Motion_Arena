/**
 * ============================================================
 *  KNIGHT DASH — game.js
 *  Retro Gyroscope Endless Runner
 *  Controls: Phone gyroscope | Spacebar/↑ | Mouse click/tap
 * ============================================================
 */

'use strict';

// ===========================
//   CONSTANTS
// ===========================
const CFG = {
    FPS: 60,
    GRAVITY: 1800,           // px/s²
    JUMP_VEL: -720,          // first jump velocity
    DOUBLE_JUMP_VEL: -620,
    INIT_SPEED: 320,         // px/s
    MAX_SPEED: 800,
    SPEED_INC: 18,           // px/s per second
    GROUND_RATIO: 0.78,      // ground Y as fraction of canvas height
    GYRO_THRESHOLD: 12,      // m/s² vertical accel to trigger jump
    SCORE_PER_METER: 1,
    OBSTACLE_MIN_GAP: 900,   // px
    OBSTACLE_MAX_GAP: 1600,
    STAR_COUNT: 80,
    CLOUD_COUNT: 5,
    PARTICLE_LIMIT: 60,
};

// ===========================
//   COLOUR PALETTE (pixel art)
// ===========================
const PAL = {
    sky1: '#050518', sky2: '#0d1b3e',
    ground1: '#1a3050', ground2: '#2d4a6b', ground3: '#3a5f80',
    knightBody: '#c0a060', knightArmor: '#8090b0', knightVisor: '#00e5ff',
    knightCape: '#8b1a1a', knightSword: '#e0e0ff',
    obstRock: ['#4a4060', '#6a5080', '#3a3050'],
    obstCactus: ['#1a5a1a', '#2a8a2a', '#1a3a1a'],
    obstBird: ['#7a3090', '#9a40b0', '#5a2070'],
    star: '#ffffff',
    cloud: 'rgba(100,120,160,0.3)',
    particle: ['#ffd700', '#ff8c00', '#ff4444', '#00e5ff', '#39ff14'],
    groundLine: '#4a7090',
    mountFar: '#0d2040', mountNear: '#142a50',
};

// ===========================
//   UTILITIES
// ===========================
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ===========================
//   PIXEL ART RENDERER
// ===========================
class PixelArt {
    constructor(ctx) { this.ctx = ctx; }

    rect(x, y, w, h, color) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(Math.round(x), Math.round(y), w, h);
    }

    // Knight sprite (facing right) — pixel grid
    drawKnight(x, y, scale, frame, isJumping, isDead) {
        const c = this.ctx;
        const S = scale;
        const px = (cx, cy, w, h, col) => {
            c.fillStyle = col;
            c.fillRect(Math.round(x + cx * S), Math.round(y + cy * S), Math.ceil(w * S), Math.ceil(h * S));
        };

        // Legs animation
        const legOff = isJumping ? 0 : (Math.floor(frame / 4) % 2 === 0 ? 1 : -1);
        const wobble = isDead ? Math.sin(Date.now() * 0.01) * 2 : 0;

        c.save();
        c.translate(0, wobble);

        // Cape (behind)
        px(0, 5, 3, 10, PAL.knightCape);

        // Body — torso
        px(3, 4, 7, 9, PAL.knightArmor);
        // Chest highlight
        px(4, 5, 2, 3, '#a0b0c8');

        // Head — helmet
        px(3, 0, 7, 5, PAL.knightArmor);
        // Visor
        px(4, 1, 5, 2, PAL.knightVisor);
        if (!isDead) {
            // Visor glow
            c.shadowColor = PAL.knightVisor;
            c.shadowBlur = 6 * S;
            px(5, 1, 3, 1, '#80f0ff');
            c.shadowBlur = 0;
        }
        // Helmet plume
        px(5, -3, 2, 4, '#cc2222');
        px(6, -4, 1, 2, '#ff4444');

        // Sword arm (right)
        px(10, 5, 3, 2, PAL.knightArmor);
        // Sword
        px(12, 1, 2, 10, PAL.knightSword);
        px(11, 3, 4, 2, PAL.knightSword); // crossguard
        // Sword glint
        c.shadowColor = '#ffffff';
        c.shadowBlur = 4 * S;
        px(12, 2, 1, 1, '#ffffff');
        c.shadowBlur = 0;

        // Shield arm (left)
        px(1, 6, 3, 6, PAL.knightArmor);
        px(0, 6, 3, 7, '#4a6080'); // shield
        px(0, 7, 1, 5, '#5a7090');

        // Legs
        px(4, 13, 3, 4, PAL.knightArmor);
        px(7, 13, 3, 4, PAL.knightArmor);
        // Boots
        px(3, 16 + legOff, 4, 3, '#3a3030');
        px(7, 16 - legOff, 4, 3, '#3a3030');

        c.restore();
    }

    // Rock obstacle
    drawRock(x, y, w, h) {
        // Base
        this.rect(x, y + h * 0.3, w, h * 0.7, PAL.obstRock[0]);
        // Mid
        this.rect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.6, PAL.obstRock[1]);
        // Highlight
        this.rect(x + w * 0.15, y + h * 0.12, w * 0.25, h * 0.2, '#7a6090');
        // Dark crack
        this.rect(x + w * 0.5, y + h * 0.2, 2, h * 0.4, PAL.obstRock[2]);
    }

    // Cactus obstacle
    drawCactus(x, y, w, h) {
        const trunk = w * 0.35;
        const trunkX = x + (w - trunk) / 2;
        // Arms
        this.rect(x, y + h * 0.3, w * 0.3, trunk * 0.8, PAL.obstCactus[0]);
        this.rect(x + w * 0.7, y + h * 0.45, w * 0.3, trunk * 0.8, PAL.obstCactus[0]);
        this.rect(x, y + h * 0.15, trunk * 0.8, trunk * 0.8, PAL.obstCactus[0]);
        this.rect(x + w * 0.7 + w * 0.1, y + h * 0.3, trunk * 0.8, trunk * 0.8, PAL.obstCactus[0]);
        // Trunk
        this.rect(trunkX, y, trunk, h, PAL.obstCactus[0]);
        // Highlight
        this.rect(trunkX + trunk * 0.15, y + h * 0.05, trunk * 0.3, h * 0.8, PAL.obstCactus[1]);
        // Spikes
        for (let i = 0; i < 4; i++) {
            this.rect(trunkX - 4, y + h * 0.2 + i * (h * 0.18), 4, 2, PAL.obstCactus[2]);
            this.rect(trunkX + trunk, y + h * 0.2 + i * (h * 0.18), 4, 2, PAL.obstCactus[2]);
        }
    }

    // Bird obstacle
    drawBird(x, y, frame) {
        const flap = Math.floor(frame / 5) % 2;
        // Body
        this.rect(x + 4, y + 6, 20, 10, PAL.obstBird[0]);
        this.rect(x + 8, y + 5, 12, 12, PAL.obstBird[1]);
        // Wing
        if (flap === 0) {
            this.rect(x, y, 12, 8, PAL.obstBird[0]);
            this.rect(x + 16, y, 12, 8, PAL.obstBird[0]);
        } else {
            this.rect(x, y + 8, 12, 8, PAL.obstBird[0]);
            this.rect(x + 16, y + 8, 12, 8, PAL.obstBird[0]);
        }
        // Beak
        this.rect(x + 24, y + 8, 6, 4, '#ffd700');
        // Eye
        this.rect(x + 20, y + 5, 3, 3, '#ffffff');
        this.rect(x + 21, y + 6, 2, 2, '#000000');
    }

    // Paralax mountain
    drawMountain(x, y, w, h, color) {
        const c = this.ctx;
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(x, y + h);
        c.lineTo(x + w * 0.3, y);
        c.lineTo(x + w * 0.5, y + h * 0.3);
        c.lineTo(x + w * 0.7, y + h * 0.1);
        c.lineTo(x + w, y + h);
        c.closePath();
        c.fill();
    }
}

// ===========================
//   PARTICLE SYSTEM
// ===========================
class ParticleSystem {
    constructor() { this.particles = []; }

    emit(x, y, count, type) {
        for (let i = 0; i < count; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(80, 260);
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 100,
                life: 1.0,
                decay: rand(1.2, 2.5),
                size: rand(3, 8),
                color: PAL.particle[randInt(0, PAL.particle.length - 1)],
                type,
            });
        }
        if (this.particles.length > CFG.PARTICLE_LIMIT) {
            this.particles.splice(0, this.particles.length - CFG.PARTICLE_LIMIT);
        }
    }

    update(dt) {
        this.particles = this.particles.filter(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 400 * dt;
            p.life -= p.decay * dt;
            return p.life > 0;
        });
    }

    draw(ctx) {
        this.particles.forEach(p => {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 4;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        });
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }
}

// ===========================
//   OBSTACLE
// ===========================
class Obstacle {
    constructor(x, groundY, speed) {
        const type = Math.random();
        this.type = type < 0.4 ? 'rock' : type < 0.75 ? 'cactus' : 'bird';
        this.x = x;
        this.speed = speed;
        this.passed = false;

        if (this.type === 'rock') {
            this.w = randInt(32, 56);
            this.h = randInt(28, 48);
            this.y = groundY - this.h;
        } else if (this.type === 'cactus') {
            this.w = randInt(36, 52);
            this.h = randInt(48, 72);
            this.y = groundY - this.h;
        } else {
            // Bird — flies mid-air
            this.w = 30; this.h = 20;
            this.y = groundY - randInt(80, 200);
        }
    }

    update(dt) { this.x -= this.speed * dt; }
    isOffscreen() { return this.x + this.w < -10; }

    getHitbox() {
        // Shrink hitbox slightly for forgiveness
        const m = 6;
        return { x: this.x + m, y: this.y + m, w: this.w - m * 2, h: this.h - m * 2 };
    }
}

// ===========================
//   BACKGROUND LAYER
// ===========================
class Background {
    constructor(canvas) {
        this.canvas = canvas;
        this.clouds = [];
        this.stars = [];
        this.mountains = [];
        this.groundDecor = [];
        this.scrollX = 0;
        this._init();
    }

    _init() {
        const W = this.canvas.width, H = this.canvas.height;
        for (let i = 0; i < CFG.STAR_COUNT; i++) {
            this.stars.push({
                x: rand(0, W), y: rand(0, H * 0.65),
                size: rand(1, 2.5),
                twinkle: rand(0, Math.PI * 2),
            });
        }
        for (let i = 0; i < CFG.CLOUD_COUNT; i++) {
            this.clouds.push({
                x: rand(0, W), y: rand(H * 0.05, H * 0.4),
                w: rand(80, 200), h: rand(30, 60),
                speed: rand(20, 50),
            });
        }
        // Mountain ranges
        for (let i = 0; i < 4; i++) {
            this.mountains.push({ x: i * (W / 2), layer: 0 });
            this.mountains.push({ x: i * (W / 2.5), layer: 1 });
        }
        // Ground cracks / decor
        for (let i = 0; i < 12; i++) {
            this.groundDecor.push({ x: rand(0, W), speed: rand(1, 1.5) });
        }
    }

    resize() { this._init(); }

    update(dt, gameSpeed) {
        const W = this.canvas.width;
        this.scrollX += gameSpeed * dt;

        this.clouds.forEach(c => {
            c.x -= c.speed * dt;
            if (c.x + c.w < 0) { c.x = W + 20; c.y = rand(this.canvas.height * 0.05, this.canvas.height * 0.4); }
        });

        this.mountains.forEach(m => {
            const spd = m.layer === 0 ? gameSpeed * 0.15 : gameSpeed * 0.3;
            m.x -= spd * dt;
            if (m.x < -W / 2) m.x += W * 2.5;
        });

        this.groundDecor.forEach(d => {
            d.x -= gameSpeed * dt * d.speed;
            if (d.x < -10) d.x += W + rand(10, 60);
        });
    }

    draw(ctx, groundY) {
        const W = this.canvas.width, H = this.canvas.height;

        // Sky gradient
        const grad = ctx.createLinearGradient(0, 0, 0, groundY);
        grad.addColorStop(0, PAL.sky1);
        grad.addColorStop(1, PAL.sky2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, groundY);

        // Stars
        const now = Date.now() * 0.001;
        this.stars.forEach(s => {
            const alpha = 0.5 + 0.5 * Math.sin(s.twinkle + now);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = PAL.star;
            ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.ceil(s.size), Math.ceil(s.size));
        });
        ctx.globalAlpha = 1;

        // Far mountains
        this.mountains.filter(m => m.layer === 0).forEach(m => {
            ctx.fillStyle = PAL.mountFar;
            ctx.beginPath();
            ctx.moveTo(m.x, groundY);
            ctx.lineTo(m.x + W * 0.3, groundY - H * 0.25);
            ctx.lineTo(m.x + W * 0.6, groundY);
            ctx.closePath();
            ctx.fill();
        });

        // Near mountains
        this.mountains.filter(m => m.layer === 1).forEach(m => {
            ctx.fillStyle = PAL.mountNear;
            ctx.beginPath();
            ctx.moveTo(m.x, groundY);
            ctx.lineTo(m.x + W * 0.2, groundY - H * 0.18);
            ctx.lineTo(m.x + W * 0.4, groundY);
            ctx.closePath();
            ctx.fill();
        });

        // Clouds
        this.clouds.forEach(cl => {
            ctx.fillStyle = PAL.cloud;
            ctx.beginPath();
            ctx.ellipse(cl.x + cl.w / 2, cl.y + cl.h / 2, cl.w / 2, cl.h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cl.x + cl.w * 0.3, cl.y + cl.h * 0.4, cl.w * 0.3, cl.h * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cl.x + cl.w * 0.7, cl.y + cl.h * 0.45, cl.w * 0.25, cl.h * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
        });

        // Ground
        ctx.fillStyle = PAL.ground1;
        ctx.fillRect(0, groundY, W, H - groundY);
        ctx.fillStyle = PAL.ground2;
        ctx.fillRect(0, groundY, W, 8);
        ctx.fillStyle = PAL.ground3;
        ctx.fillRect(0, groundY, W, 3);

        // Ground grid lines (parallax)
        ctx.strokeStyle = PAL.groundLine;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25;
        const lineSpacing = 60;
        const offset = this.scrollX % lineSpacing;
        for (let x = -offset; x < W + lineSpacing; x += lineSpacing) {
            ctx.beginPath();
            ctx.moveTo(x, groundY + 4);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
}

// ===========================
//   KNIGHT PLAYER
// ===========================
class Knight {
    constructor(x, groundY) {
        this.startX = x;
        this.x = x;
        this.groundY = groundY;
        this.w = 48; this.h = 56;
        this.y = groundY - this.h;
        this.vy = 0;
        this.jumpsLeft = 2;
        this.onGround = true;
        this.frame = 0;
        this.frameTimer = 0;
        this.isDead = false;
        this.scale = 2.4;
        this.squashY = 1.0; // for squash/stretch
    }

    jump() {
        if (this.isDead) return false;
        if (this.jumpsLeft > 0) {
            const isDouble = this.jumpsLeft < 2;
            this.vy = isDouble ? CFG.DOUBLE_JUMP_VEL : CFG.JUMP_VEL;
            this.jumpsLeft--;
            this.onGround = false;
            this.squashY = 0.7; // squash on jump
            return true;
        }
        return false;
    }

    update(dt) {
        if (this.isDead) return;

        this.squashY = lerp(this.squashY, 1.0, dt * 12);

        this.vy += CFG.GRAVITY * dt;
        this.y += this.vy * dt;

        const landY = this.groundY - this.h;
        if (this.y >= landY) {
            this.y = landY;
            if (this.vy > 0) {
                this.squashY = 1.3; // squash on land
                this.jumpsLeft = 2;
                this.onGround = true;
            }
            this.vy = 0;
        }

        this.frameTimer += dt;
        if (this.frameTimer > 1 / 12) {
            this.frame++;
            this.frameTimer = 0;
        }
    }

    getHitbox() {
        return {
            x: this.x + 6,
            y: this.y + 4,
            w: this.w - 12,
            h: this.h - 4,
        };
    }

    draw(ctx, pa) {
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h);
        ctx.scale(1, this.squashY);
        ctx.translate(-(this.x + this.w / 2), -(this.y + this.h));
        pa.drawKnight(this.x, this.y, this.scale, this.frame, !this.onGround, this.isDead);
        ctx.restore();
    }
}

// ===========================
//   GYROSCOPE INPUT MANAGER
// ===========================
class GyroInput {
    constructor() {
        this.enabled = false;
        this.lastAY = 0;
        this.jumpCallback = null;
        this.debugEl = document.getElementById('gyro-bar-fill');
        this.debugVal = document.getElementById('gyro-val');
        this._cooldown = 0;
    }

    async requestPermission() {
        // iOS 13+ requires explicit permission
        if (typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const perm = await DeviceMotionEvent.requestPermission();
                if (perm === 'granted') {
                    this._attach();
                    return true;
                }
                return false;
            } catch {
                return false;
            }
        }
        // Android / non-iOS just listens
        this._attach();
        return true;
    }

    _attach() {
        this.enabled = true;
        window.addEventListener('devicemotion', (e) => this._onMotion(e), { passive: true });
    }

    _onMotion(e) {
        const acc = e.accelerationIncludingGravity;
        if (!acc) return;

        const ay = acc.y ?? 0;
        // Upward acceleration (phone tilts up) → negative delta on Y
        const delta = this.lastAY - ay;
        this.lastAY = ay;

        // Update debug bar
        if (this.debugEl) {
            const pct = clamp(50 + (ay / 20) * 50, 0, 100);
            this.debugEl.style.width = pct + '%';
        }
        if (this.debugVal) {
            this.debugVal.textContent = ay.toFixed(1);
        }

        if (this._cooldown > 0) return;

        if (delta > CFG.GYRO_THRESHOLD || (acc.y !== null && acc.z !== null && Math.abs(acc.z) < 5 && delta > CFG.GYRO_THRESHOLD * 0.7)) {
            if (this.jumpCallback) {
                this.jumpCallback('gyro');
                this._cooldown = 25; // frames cooldown
            }
        }
    }

    tick() {
        if (this._cooldown > 0) this._cooldown--;
    }
}

// ===========================
//   SCREEN MANAGER
// ===========================
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

// ===========================
//   MAIN GAME CLASS
// ===========================
class KnightDashGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.pa = new PixelArt(this.ctx);
        this.particles = new ParticleSystem();
        this.gyro = new GyroInput();

        this.state = 'menu'; // menu | running | dead | paused
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('kd_highscore') || '0');
        this.distance = 0;
        this.obstaclesCleared = 0;
        this.speed = CFG.INIT_SPEED;
        this.gameTime = 0;
        this.frame = 0;

        this.knight = null;
        this.bg = null;
        this.obstacles = [];
        this.nextObstacleX = 0;
        this.lastTime = 0;
        this.animId = null;
        this.activeInput = 'keyboard';

        this._setupCanvas();
        this._setupInput();
        this._setupUI();
        this._drawPreview();
        this._updateHighScoreDisplay();
    }

    _setupCanvas() {
        const resize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.groundY = Math.floor(this.canvas.height * CFG.GROUND_RATIO);
            if (this.bg) this.bg.resize();
            if (this.knight) this.knight.groundY = this.groundY;
        };
        window.addEventListener('resize', resize);
        resize();
    }

    _setupInput() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) {
                e.preventDefault();
                this._handleJump('keyboard');
            }
            if (e.code === 'KeyP') this._togglePause();
            if (e.code === 'Escape') this._togglePause();
        });

        // Mouse / touch
        window.addEventListener('pointerdown', (e) => {
            // Ignore clicks on buttons
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
            this._handleJump('touch');
        });

        // Gyro jump callback
        this.gyro.jumpCallback = (src) => this._handleJump(src);
    }

    _setupUI() {
        // Intro
        document.getElementById('enable-gyro-btn').addEventListener('click', async () => {
            const ok = await this.gyro.requestPermission();
            const ledEl = document.querySelector('.gyro-card .status-led');
            const statusText = document.getElementById('gyro-status-text');
            if (ok) {
                ledEl.className = 'status-led gyro-active';
                statusText.textContent = 'Gyroscope active!';
                document.getElementById('gyro-debug').classList.remove('hidden');
                this.activeInput = 'gyro';
                this._updateInputIndicator('gyro');
            } else {
                statusText.textContent = 'Permission denied';
            }
        });

        document.getElementById('start-btn').addEventListener('click', () => this._startGame());
        document.getElementById('restart-btn').addEventListener('click', () => this._startGame());
        document.getElementById('menu-btn').addEventListener('click', () => {
            this.state = 'menu';
            showScreen('intro-screen');
            this._updateHighScoreDisplay();
        });

        document.getElementById('pause-overlay').addEventListener('click', () => this._togglePause());
    }

    _updateHighScoreDisplay() {
        const padded = String(this.highScore).padStart(5, '0');
        const el = document.getElementById('intro-high-score');
        if (el) el.textContent = padded;
        const hiEl = document.getElementById('hi-score-display');
        if (hiEl) hiEl.textContent = padded;
    }

    _updateInputIndicator(type) {
        const icons = { keyboard: '⌨️', gyro: '📱', touch: '👆' };
        const labels = { keyboard: 'KEYBOARD', gyro: 'GYROSCOPE', touch: 'TAP' };
        document.getElementById('input-icon').textContent = icons[type] || '⌨️';
        document.getElementById('input-label').textContent = labels[type] || 'KEYBOARD';
        this.activeInput = type;
    }

    _handleJump(source) {
        if (this.state === 'dead') {
            this._startGame();
            return;
        }
        if (this.state === 'menu') {
            this._startGame();
            return;
        }
        if (this.state === 'paused') {
            this._togglePause();
            return;
        }
        if (this.state !== 'running') return;

        if (source !== 'gyro') this._updateInputIndicator(source);

        const jumped = this.knight.jump();
        if (jumped) {
            this.particles.emit(
                this.knight.x + this.knight.w / 2,
                this.knight.y + this.knight.h,
                8, 'dust'
            );
            this._updateJumpDots();
        }
    }

    _updateJumpDots() {
        const dots = document.querySelectorAll('#jump-dots .dot');
        dots.forEach((d, i) => {
            d.classList.toggle('active', i < this.knight.jumpsLeft);
        });
    }

    _togglePause() {
        if (this.state === 'running') {
            this.state = 'paused';
            document.getElementById('pause-overlay').classList.remove('hidden');
        } else if (this.state === 'paused') {
            this.state = 'running';
            document.getElementById('pause-overlay').classList.add('hidden');
            this.lastTime = performance.now();
            this._loop();
        }
    }

    _startGame() {
        if (this.animId) cancelAnimationFrame(this.animId);

        this.score = 0;
        this.distance = 0;
        this.obstaclesCleared = 0;
        this.speed = CFG.INIT_SPEED;
        this.gameTime = 0;
        this.frame = 0;
        this.obstacles = [];
        this.nextObstacleX = this.canvas.width + rand(400, 700);

        this.knight = new Knight(100, this.groundY);
        this.bg = new Background(this.canvas);
        this.particles = new ParticleSystem();

        this.state = 'running';
        showScreen('game-screen');
        document.getElementById('pause-overlay').classList.add('hidden');

        this.lastTime = performance.now();
        this._loop();
    }

    _loop() {
        if (this.state !== 'running') return;

        this.animId = requestAnimationFrame((ts) => {
            const dt = Math.min((ts - this.lastTime) / 1000, 0.05);
            this.lastTime = ts;
            this._update(dt);
            this._draw();
            this._loop();
        });
    }

    _update(dt) {
        this.gameTime += dt;
        this.frame++;
        this.gyro.tick();

        // Speed ramp
        this.speed = Math.min(CFG.MAX_SPEED, CFG.INIT_SPEED + this.gameTime * CFG.SPEED_INC);

        // Update background
        this.bg.update(dt, this.speed);

        // Update knight
        this.knight.update(dt);
        this._updateJumpDots();

        // Spawn obstacles
        this.nextObstacleX -= this.speed * dt;
        if (this.nextObstacleX <= this.canvas.width) {
            this.obstacles.push(new Obstacle(this.canvas.width + 50, this.groundY, this.speed));
            this.nextObstacleX = rand(CFG.OBSTACLE_MIN_GAP, CFG.OBSTACLE_MAX_GAP);
        }

        // Update obstacles
        this.obstacles.forEach(ob => {
            ob.speed = this.speed;
            ob.update(dt);
            if (!ob.passed && ob.x + ob.w < this.knight.x) {
                ob.passed = true;
                this.obstaclesCleared++;
                this.particles.emit(this.knight.x, this.knight.y + this.knight.h / 2, 5, 'score');
            }
        });
        this.obstacles = this.obstacles.filter(ob => !ob.isOffscreen());

        // Collision
        const kb = this.knight.getHitbox();
        for (const ob of this.obstacles) {
            const oh = ob.getHitbox();
            if (kb.x < oh.x + oh.w && kb.x + kb.w > oh.x &&
                kb.y < oh.y + oh.h && kb.y + kb.h > oh.y) {
                this._die();
                return;
            }
        }

        // Scoring
        this.distance += this.speed * dt / 60;
        this.score = Math.floor(this.distance * CFG.SCORE_PER_METER + this.obstaclesCleared * 15);

        // Particles
        this.particles.update(dt);

        // HUD
        this._updateHUD();
    }

    _updateHUD() {
        document.getElementById('score-display').textContent = String(this.score).padStart(5, '0');
        document.getElementById('hi-score-display').textContent = String(this.highScore).padStart(5, '0');
        const speedPct = ((this.speed - CFG.INIT_SPEED) / (CFG.MAX_SPEED - CFG.INIT_SPEED)) * 100;
        document.getElementById('speed-fill').style.width = Math.round(speedPct) + '%';
    }

    _draw() {
        const ctx = this.ctx;
        const W = this.canvas.width, H = this.canvas.height;
        ctx.clearRect(0, 0, W, H);
        ctx.imageSmoothingEnabled = false;

        // Background
        this.bg.draw(ctx, this.groundY);

        // Obstacles
        this.obstacles.forEach(ob => {
            if (ob.type === 'rock')   this.pa.drawRock(ob.x, ob.y, ob.w, ob.h);
            if (ob.type === 'cactus') this.pa.drawCactus(ob.x, ob.y, ob.w, ob.h);
            if (ob.type === 'bird')   this.pa.drawBird(ob.x, ob.y, this.frame);
        });

        // Knight
        this.knight.draw(ctx, this.pa);

        // Particles
        this.particles.draw(ctx);

        // Screen flash on near miss
        // (optional: subtle glow effect handled by CSS shadow)
    }

    _die() {
        this.state = 'dead';
        this.knight.isDead = true;

        // Big particle burst
        this.particles.emit(
            this.knight.x + this.knight.w / 2,
            this.knight.y + this.knight.h / 2,
            30, 'death'
        );

        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('kd_highscore', this.highScore);
        }

        // Show game over after short delay
        setTimeout(() => {
            document.getElementById('final-score').textContent = String(this.score).padStart(5, '0');
            document.getElementById('final-high').textContent = String(this.highScore).padStart(5, '0');
            document.getElementById('final-dist').textContent = Math.floor(this.distance) + 'm';
            document.getElementById('final-obs').textContent = this.obstaclesCleared;
            showScreen('gameover-screen');
        }, 700);

        // Keep drawing for death animation
        const deadLoop = (ts) => {
            if (this.state !== 'dead') return;
            const dt = Math.min((ts - this.lastTime) / 1000, 0.05);
            this.lastTime = ts;
            this.particles.update(dt);
            this._draw();
            requestAnimationFrame(deadLoop);
        };
        requestAnimationFrame(deadLoop);
    }

    // Draw animated knight on intro canvas
    _drawPreview() {
        const previewCanvas = document.getElementById('knight-preview-canvas');
        if (!previewCanvas) return;
        const pCtx = previewCanvas.getContext('2d');
        const pPa = new PixelArt(pCtx);
        let pFrame = 0;
        const draw = () => {
            pCtx.clearRect(0, 0, 120, 120);
            pCtx.fillStyle = 'rgba(0,20,50,0.3)';
            pCtx.fillRect(0, 100, 120, 20);
            pPa.drawKnight(20, 28, 2.6, pFrame, false, false);
            pFrame++;
            requestAnimationFrame(draw);
        };
        draw();
    }
}

// ===========================
//   BOOT
// ===========================
window.addEventListener('DOMContentLoaded', () => {
    showScreen('intro-screen');
    new KnightDashGame();
});
