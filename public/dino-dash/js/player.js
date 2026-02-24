// ============================================
// PLAYER.JS — Character using char_blue.png Sprite Sheet
// ============================================
// Sprite sheet: char_blue.png (448×392, 8 cols × 7 rows, 56×56 per frame)
//
// Row layout (observed from the sprite sheet):
// Row 0: Idle        — 6 frames
// Row 1: Attack      — 6 frames (with weapon)
// Row 2: Run         — 8 frames
// Row 3: Jump Up     — 2 frames
// Row 4: Fall Down   — 2 frames
// Row 5: Death/Slide — 4 frames
// Row 6: Hurt/Slide  — 3 frames

const SPRITE = {
    sheetPath: '/dino-dash/assets/char_blue.png',
    frameW: 56,
    frameH: 56,
    cols: 8,
    // Animation definitions: [row, frameCount, frameSpeed (ticks per frame)]
    animations: {
        idle: { row: 0, frames: 6, speed: 8 },
        attack: { row: 1, frames: 6, speed: 5 },
        run: { row: 2, frames: 8, speed: 3 },
        jump: { row: 3, frames: 2, speed: 10 },
        fall: { row: 4, frames: 2, speed: 10 },
        death: { row: 5, frames: 4, speed: 8 },
        slide: { row: 6, frames: 3, speed: 6 }
    }
};

export class Player {
    constructor() {
        // Display size (scaled up from 56px for better visibility)
        this.scale = 2.2;
        this.width = Math.floor(SPRITE.frameW * this.scale);
        this.height = Math.floor(SPRITE.frameH * this.scale);
        this.x = 80;
        this.groundY = 0;
        this.y = 0;

        // Physics (Chrome Dino reference: gravity 0.6, jump -10)
        this.velocityY = 0;
        this.gravity = 0.6;
        this.jumpForce = -10;
        this.isJumping = false;
        this.isOnGround = true;

        // Animation
        this.currentAnim = 'idle';
        this.frameIndex = 0;
        this.frameTimer = 0;
        this.state = 'idle'; // 'idle' | 'run' | 'jump' | 'fall' | 'dead'

        // Sprite sheet image
        this.spriteSheet = null;
        this.loaded = false;

        // Dust particles
        this.dustParticles = [];

        // Hitbox padding
        this.hitboxPadding = 18;
    }

    async loadAssets() {
        return new Promise((resolve, reject) => {
            this.spriteSheet = new Image();
            this.spriteSheet.onload = () => {
                this.loaded = true;
                resolve();
            };
            this.spriteSheet.onerror = () => reject(new Error('Failed to load character sprite'));
            this.spriteSheet.src = SPRITE.sheetPath;
        });
    }

    setGroundY(groundY) {
        this.groundY = groundY - this.height;
        this.y = this.groundY;
    }

    jump() {
        if (!this.isOnGround) return false;
        this.velocityY = this.jumpForce;
        this.isJumping = true;
        this.isOnGround = false;
        this.setState('jump');
        return true;
    }

    setState(newState) {
        if (this.state === newState) return;
        this.state = newState;

        // Map game state to animation
        const animMap = {
            idle: 'idle',
            run: 'run',
            jump: 'jump',
            fall: 'fall',
            dead: 'death'
        };
        const newAnim = animMap[newState] || 'idle';
        if (this.currentAnim !== newAnim) {
            this.currentAnim = newAnim;
            this.frameIndex = 0;
            this.frameTimer = 0;
        }
    }

    update() {
        // Gravity
        if (!this.isOnGround) {
            this.velocityY += this.gravity;
            this.y += this.velocityY;

            // Switch from jump to fall when descending
            if (this.velocityY > 0 && this.state === 'jump') {
                this.setState('fall');
            }

            if (this.y >= this.groundY) {
                this.y = this.groundY;
                this.velocityY = 0;
                this.isJumping = false;
                this.isOnGround = true;
                this.setState('run');
                this.spawnDust();
            }
        }

        // Advance animation frame
        const anim = SPRITE.animations[this.currentAnim];
        if (anim) {
            this.frameTimer++;
            if (this.frameTimer >= anim.speed) {
                this.frameTimer = 0;
                this.frameIndex = (this.frameIndex + 1) % anim.frames;
            }
        }

        // Update dust particles
        this.updateDust();
    }

    spawnDust() {
        for (let i = 0; i < 6; i++) {
            this.dustParticles.push({
                x: this.x + this.width / 2 + (Math.random() - 0.5) * 30,
                y: this.y + this.height,
                vx: (Math.random() - 0.5) * 3,
                vy: -Math.random() * 2.5 - 0.5,
                life: 18 + Math.random() * 12,
                maxLife: 30,
                size: 3 + Math.random() * 4
            });
        }
    }

    updateDust() {
        for (let i = this.dustParticles.length - 1; i >= 0; i--) {
            const p = this.dustParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.06;
            p.life--;
            if (p.life <= 0) this.dustParticles.splice(i, 1);
        }
    }

    getHitbox() {
        const pad = this.hitboxPadding;
        return {
            x: this.x + pad,
            y: this.y + pad,
            width: this.width - pad * 2,
            height: this.height - pad * 2
        };
    }

    draw(ctx) {
        // Dust particles
        this.dustParticles.forEach(p => {
            const alpha = p.life / p.maxLife;
            ctx.fillStyle = `rgba(200, 180, 150, ${alpha * 0.6})`;
            ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.ceil(p.size), Math.ceil(p.size));
        });

        if (!this.loaded || !this.spriteSheet) return;

        // Get current animation config
        const anim = SPRITE.animations[this.currentAnim];
        if (!anim) return;

        // Source rect on sprite sheet
        const sx = this.frameIndex * SPRITE.frameW;
        const sy = anim.row * SPRITE.frameH;

        // Draw sprite
        ctx.drawImage(
            this.spriteSheet,
            sx, sy, SPRITE.frameW, SPRITE.frameH,
            Math.floor(this.x), Math.floor(this.y), this.width, this.height
        );
    }
}
