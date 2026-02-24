// ============================================
// GAME.JS — Core Game Engine (Oak Woods Asset Version)
// ============================================

import { Player } from './player.js';
import { ObstacleManager } from './obstacles.js';
import { ParallaxBackground } from './parallax.js';
import { AudioManager } from './audio.js';
import { InputManager } from './input.js';

export class Game {
    constructor(canvas, socket) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.socket = socket;

        // Logical (CSS-pixel) dimensions
        this.w = 800;
        this.h = 600;

        // Systems
        this.player = new Player();
        this.obstacles = new ObstacleManager(this.w);
        this.background = new ParallaxBackground(this.w, this.h);
        this.audio = new AudioManager();
        this.input = new InputManager();

        // Game state
        this.state = 'waiting';
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('dinodash-highscore') || '0');
        this.speed = 7;
        this.baseSpeed = 7;
        this.maxSpeed = 13;

        // Timing
        this.scoreTimer = 0;
        this.scoreInterval = 3; // score every 3 frames ≈ Chrome Dino pacing

        // Countdown
        this.countdownValue = 3;
        this.countdownTimer = 0;

        // Milestone flash
        this.flashAlpha = 0;

        // Animation
        this.animFrame = null;
        this.running = false;
        this.assetsLoaded = false;

        // Landing detection
        this.wasOnGround = true;

        // Decorative grass loaded separately for random ground decoration
        this.grassImages = [];

        // Resize
        this._resizeHandler = () => this.resize();
        window.addEventListener('resize', this._resizeHandler);
        this.resize();

        // Input via socket
        this.input.setupSocket(socket);
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.w = rect.width;
        this.h = rect.height;

        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.w * dpr;
        this.canvas.height = this.h * dpr;
        this.canvas.style.width = this.w + 'px';
        this.canvas.style.height = this.h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Update background for new dimensions
        this.background = new ParallaxBackground(this.w, this.h);
        if (this.assetsLoaded) {
            // Reload background assets on resize
            this.background.loadAssets().then(() => {
                const groundY = this.background.getGroundY();
                this.player.setGroundY(groundY);
                this.obstacles.logicalWidth = this.w;
            });
        }
    }

    async init() {
        this.audio.init();

        // Show loading text
        this.drawLoadingScreen('Loading assets...');

        // Load all assets in parallel
        try {
            await Promise.all([
                this.background.loadAssets(),
                this.player.loadAssets(),
                this.obstacles.loadAssets(),
                this.loadGrassImages()
            ]);
        } catch (e) {
            console.warn('Some assets failed to load, using fallbacks:', e.message);
        }

        this.assetsLoaded = true;

        // Position player on ground
        const groundY = this.background.getGroundY();
        this.player.setGroundY(groundY);

        // Webcam (non-blocking, optional)
        const videoEl = document.getElementById('pose-video');
        if (videoEl) {
            this.input.setupWebcam(videoEl).catch(() => { });
        }

        this.input.startCalibration();
    }

    async loadGrassImages() {
        const names = ['grass_1.png', 'grass_2.png', 'grass_3.png'];
        for (const name of names) {
            try {
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = `/dino-dash/assets/${name}`;
                });
                this.grassImages.push(img);
            } catch (e) { /* skip */ }
        }
    }

    drawLoadingScreen(text) {
        const ctx = this.ctx;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.w, this.h);

        ctx.fillStyle = '#8888aa';
        ctx.font = "14px 'Press Start 2P', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, this.w / 2, this.h / 2);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.state = 'countdown';
        this.countdownValue = 3;
        this.countdownTimer = 0;
        this.player.setState('idle');
        this.loop();
    }

    loop() {
        if (!this.running) return;
        this.update();
        this.draw();
        this.animFrame = requestAnimationFrame(() => this.loop());
    }

    update() {
        switch (this.state) {
            case 'countdown': this.updateCountdown(); break;
            case 'running': this.updateRunning(); break;
            case 'gameover': this.updateGameOver(); break;
        }
    }

    updateCountdown() {
        this.countdownTimer++;
        if (this.countdownTimer >= 40) { // faster countdown (40 frames ≈ 0.67s per digit)
            this.countdownTimer = 0;
            this.countdownValue--;
            if (this.countdownValue <= 0) {
                this.state = 'running';
                this.resetGame();
            }
        }
        this.background.update(3);
        this.player.update();
    }

    updateRunning() {
        // Jump input
        if (this.input.consumeJump()) {
            if (this.player.jump()) {
                this.audio.playJump();
            }
        }

        // Track landing
        const wasJumping = !this.wasOnGround;
        this.wasOnGround = this.player.isOnGround;

        // Update systems
        this.player.update();
        this.obstacles.update(this.background.getGroundY());
        this.background.update(this.speed);

        // Landing sound
        if (wasJumping && this.player.isOnGround) {
            this.audio.playLand();
        }

        // Collision
        if (this.obstacles.checkCollision(this.player.getHitbox())) {
            this.gameOver();
            return;
        }

        // Score
        this.scoreTimer++;
        if (this.scoreTimer >= this.scoreInterval) {
            this.scoreTimer = 0;
            this.score++;
            if (this.score > 0 && this.score % 100 === 0) {
                this.flashAlpha = 1.0;
                this.audio.playMilestone();
            }
        }

        // Smooth per-frame acceleration (Chrome Dino = 0.001/frame)
        this.speed = Math.min(this.maxSpeed, this.speed + 0.001);
        this.obstacles.setDifficulty(this.speed);

        if (this.flashAlpha > 0) this.flashAlpha -= 0.02;
    }

    updateGameOver() {
        if (this.input.consumeJump()) {
            // CRITICAL: Re-emit start-game so server goes back to 'playing'
            // Without this, server stays in 'ended' and blocks all phone gestures
            if (this.socket) {
                this.socket.emit('start-game');
            }
            this.state = 'countdown';
            this.countdownValue = 3;
            this.countdownTimer = 0;
        }
    }

    gameOver() {
        this.state = 'gameover';
        this.player.setState('dead');
        this.audio.playGameOver();

        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('dinodash-highscore', this.highScore.toString());
        }

        if (this.socket) {
            this.socket.emit('game-over', { score: this.score, highScore: this.highScore });
        }

        this.updateScoreDisplay();
    }

    resetGame() {
        this.score = 0;
        this.speed = this.baseSpeed;
        this.scoreTimer = 0;
        this.flashAlpha = 0;
        this.obstacles.reset();

        // Recreate player but keep sprite loaded
        const oldSheet = this.player.spriteSheet;
        const wasLoaded = this.player.loaded;
        this.player = new Player();
        this.player.spriteSheet = oldSheet;
        this.player.loaded = wasLoaded;
        this.player.setGroundY(this.background.getGroundY());
        this.player.setState('run');
        this.wasOnGround = true;
        this.updateScoreDisplay();
    }

    // === DRAWING ===

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.w, this.h);

        // Background (always)
        this.background.draw(ctx);

        switch (this.state) {
            case 'countdown':
                this.drawPlayer(ctx);
                this.drawCountdown(ctx);
                break;
            case 'running':
                this.drawGame(ctx);
                break;
            case 'gameover':
                this.drawGame(ctx);
                this.drawGameOver(ctx);
                break;
        }
    }

    drawPlayer(ctx) {
        this.player.draw(ctx);
    }

    drawGame(ctx) {
        this.obstacles.draw(ctx);
        this.player.draw(ctx);

        // Milestone flash
        if (this.flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha * 0.15})`;
            ctx.fillRect(0, 0, this.w, this.h);
        }

        this.updateScoreDisplay();
    }

    drawCountdown(ctx) {
        const cx = this.w / 2;
        const cy = this.h / 2 - 40;

        const progress = this.countdownTimer / 40;
        const scale = 1 + (1 - progress) * 0.5;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.globalAlpha = 1 - progress * 0.3;

        ctx.font = "bold 72px 'Press Start 2P', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow effect
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#00e5ff';
        ctx.fillText(this.countdownValue.toString(), 0, 0);

        ctx.shadowBlur = 0;
        ctx.restore();

        ctx.font = "16px 'Press Start 2P', monospace";
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('GET READY', cx, cy + 70);
    }

    drawGameOver(ctx) {
        const cx = this.w / 2;
        const cy = this.h / 2;

        // Overlay
        ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
        ctx.fillRect(0, 0, this.w, this.h);

        // Box
        const boxW = 360;
        const boxH = 220;
        const bx = cx - boxW / 2;
        const by = cy - boxH / 2;

        // Box background with rounded corners
        ctx.fillStyle = '#1a1a25';
        ctx.strokeStyle = '#ff3355';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const r = 12;
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + boxW - r, by);
        ctx.arcTo(bx + boxW, by, bx + boxW, by + r, r);
        ctx.lineTo(bx + boxW, by + boxH - r);
        ctx.arcTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH, r);
        ctx.lineTo(bx + r, by + boxH);
        ctx.arcTo(bx, by + boxH, bx, by + boxH - r, r);
        ctx.lineTo(bx, by + r);
        ctx.arcTo(bx, by, bx + r, by, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Red accent
        ctx.fillStyle = '#ff3355';
        ctx.fillRect(bx + 1, by + 1, boxW - 2, 3);

        // Title
        ctx.font = "20px 'Press Start 2P', monospace";
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff3355';
        ctx.shadowColor = '#ff3355';
        ctx.shadowBlur = 15;
        ctx.fillText('GAME OVER', cx, by + 50);
        ctx.shadowBlur = 0;

        // Score
        ctx.font = "12px 'Press Start 2P', monospace";
        ctx.fillStyle = '#f0f0f5';
        ctx.fillText(`SCORE: ${this.score}`, cx, by + 90);

        // High score
        ctx.fillStyle = '#ffdd00';
        ctx.fillText(`BEST: ${this.highScore}`, cx, by + 120);

        // New record
        if (this.score >= this.highScore && this.score > 0) {
            ctx.fillStyle = '#00ff88';
            ctx.font = "8px 'Press Start 2P', monospace";
            ctx.fillText('★ NEW RECORD! ★', cx, by + 145);
        }

        // Restart hint
        ctx.font = "8px 'Press Start 2P', monospace";
        ctx.fillStyle = '#aaaacc';
        if (Math.sin(Date.now() / 300) > 0) {
            ctx.fillText('JUMP OR PRESS SPACE TO RESTART', cx, by + 185);
        }
    }

    updateScoreDisplay() {
        const scoreEl = document.getElementById('score-value');
        const highEl = document.getElementById('high-score-value');
        if (scoreEl) scoreEl.textContent = String(this.score).padStart(5, '0');
        if (highEl) highEl.textContent = String(this.highScore).padStart(5, '0');
    }

    stop() {
        this.running = false;
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        this.input.destroy();
        window.removeEventListener('resize', this._resizeHandler);
    }
}
