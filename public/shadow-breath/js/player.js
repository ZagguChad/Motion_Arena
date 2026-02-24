// ============================================
// Shadow Breath — Player (Assassin) Entity
// ============================================

import { TILE, isSolid } from './levels.js';

export class Player {
    constructor(tileX, tileY, tileSize) {
        this.tileSize = tileSize;
        this.x = tileX * tileSize + tileSize / 2;
        this.y = tileY * tileSize + tileSize / 2;
        this.radius = tileSize * 0.35;
        this.speed = 80; // pixels per second

        // Movement input (normalized -1 to 1)
        this.moveX = 0;
        this.moveY = 0;

        // Stealth state
        this.visible = true;         // true = breathing, false = holding breath
        this.breathCapacity = 5;     // seconds max hold
        this.breathRemaining = 5;    // current hold remaining
        this.breathRechargeRate = 1.5; // seconds recharged per second breathing (faster recovery)
        this.breathDrainRate = 0.8;  // seconds drained per second holding (slower drain)
        this.breathReleaseCooldown = 0; // grace period after releasing breath

        // Focus mode (proximity sensor)
        this.focusActive = false;

        // Animation
        this.animFrame = 0;
        this.animTimer = 0;
        this.facing = 'down'; // up, down, left, right
        this.isMoving = false;
        this.footstepTimer = 0;

        // State
        this.hidden = false; // hidden in barrel
        this.alive = true;
    }

    setBreathCapacity(capacity) {
        this.breathCapacity = capacity;
        this.breathRemaining = capacity;
    }

    update(dt, mapCols, mapRows, mapData) {
        if (!this.alive || this.hidden) return;

        // Update breath
        if (!this.visible) {
            // Holding breath — only drain after grace period ends
            if (this.breathReleaseCooldown > 0) {
                this.breathReleaseCooldown -= dt;
            } else {
                this.breathRemaining -= this.breathDrainRate * dt;
            }
            if (this.breathRemaining <= 0) {
                this.breathRemaining = 0;
                this.visible = true; // forced to breathe
            }
        } else {
            // Breathing — recharge
            this.breathReleaseCooldown = 0;
            this.breathRemaining = Math.min(
                this.breathCapacity,
                this.breathRemaining + this.breathRechargeRate * dt
            );
        }

        // Movement
        const mx = this.moveX;
        const my = this.moveY;
        const len = Math.sqrt(mx * mx + my * my);

        if (len > 0.15) {
            this.isMoving = true;
            const nx = mx / len;
            const ny = my / len;
            const moveSpeed = this.speed * dt;

            const newX = this.x + nx * moveSpeed;
            const newY = this.y + ny * moveSpeed;

            // Determine facing
            if (Math.abs(nx) > Math.abs(ny)) {
                this.facing = nx > 0 ? 'right' : 'left';
            } else {
                this.facing = ny > 0 ? 'down' : 'up';
            }

            // Collision check — try X, then Y separately
            if (!this._collides(newX, this.y, mapCols, mapRows, mapData)) {
                this.x = newX;
            }
            if (!this._collides(this.x, newY, mapCols, mapRows, mapData)) {
                this.y = newY;
            }

            // Keep in bounds
            this.x = Math.max(this.radius, Math.min(mapCols * this.tileSize - this.radius, this.x));
            this.y = Math.max(this.radius, Math.min(mapRows * this.tileSize - this.radius, this.y));

            // Footstep timer
            this.footstepTimer -= dt;

            // Walk animation
            this.animTimer += dt;
            if (this.animTimer > 0.15) {
                this.animTimer = 0;
                this.animFrame = (this.animFrame + 1) % 4;
            }
        } else {
            this.isMoving = false;
            this.animFrame = 0;
        }
    }

    _collides(px, py, cols, rows, mapData) {
        const ts = this.tileSize;
        const r = this.radius * 0.8;
        // Check corners of bounding box
        const checks = [
            { x: px - r, y: py - r },
            { x: px + r, y: py - r },
            { x: px - r, y: py + r },
            { x: px + r, y: py + r }
        ];
        for (const c of checks) {
            const tx = Math.floor(c.x / ts);
            const ty = Math.floor(c.y / ts);
            if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return true;
            const tile = mapData[ty * cols + tx];
            if (isSolid(tile)) return true;
        }
        return false;
    }

    getTileX() {
        return Math.floor(this.x / this.tileSize);
    }

    getTileY() {
        return Math.floor(this.y / this.tileSize);
    }

    // Check if player can interact with adjacent tile
    getInteractTile(mapCols, mapRows, mapData) {
        const dirs = {
            'up': { dx: 0, dy: -1 },
            'down': { dx: 0, dy: 1 },
            'left': { dx: -1, dy: 0 },
            'right': { dx: 1, dy: 0 }
        };
        const d = dirs[this.facing];
        const tx = this.getTileX() + d.dx;
        const ty = this.getTileY() + d.dy;
        if (tx < 0 || ty < 0 || tx >= mapCols || ty >= mapRows) return null;
        const idx = ty * mapCols + tx;
        return { x: tx, y: ty, idx, tile: mapData[idx] };
    }

    draw(ctx, cameraX, cameraY) {
        const sx = this.x - cameraX;
        const sy = this.y - cameraY;
        const size = this.tileSize;

        ctx.save();

        if (!this.visible) {
            // Invisible — ghostly shimmer
            ctx.globalAlpha = 0.25 + Math.sin(Date.now() * 0.01) * 0.1;
        }

        // Body
        const bodyColor = this.hidden ? '#555' : (this.visible ? '#1a1a2e' : '#2244aa');
        ctx.fillStyle = bodyColor;

        // Simple pixel character
        const hs = size * 0.4; // half-size
        ctx.fillRect(sx - hs, sy - hs, hs * 2, hs * 2);

        // Hood / head
        ctx.fillStyle = this.visible ? '#0f0f23' : '#1133aa';
        ctx.fillRect(sx - hs * 0.6, sy - hs - 4, hs * 1.2, hs * 0.6);

        // Eyes - two small dots
        ctx.fillStyle = this.visible ? '#aaa' : '#66aaff';
        if (this.facing === 'down' || this.facing === 'up') {
            ctx.fillRect(sx - 3, sy - hs + 1, 2, 2);
            ctx.fillRect(sx + 1, sy - hs + 1, 2, 2);
        } else if (this.facing === 'left') {
            ctx.fillRect(sx - hs * 0.5 - 1, sy - hs + 1, 2, 2);
        } else {
            ctx.fillRect(sx + hs * 0.5 - 1, sy - hs + 1, 2, 2);
        }

        // Cloak / legs animation
        if (this.isMoving) {
            const legOffset = this.animFrame % 2 === 0 ? 2 : -2;
            ctx.fillStyle = bodyColor;
            ctx.fillRect(sx - 3, sy + hs, 3, 4 + legOffset);
            ctx.fillRect(sx + 1, sy + hs, 3, 4 - legOffset);
        } else {
            ctx.fillRect(sx - 3, sy + hs, 3, 4);
            ctx.fillRect(sx + 1, sy + hs, 3, 4);
        }

        // Invisibility shimmer particles
        if (!this.visible) {
            ctx.fillStyle = 'rgba(100, 170, 255, 0.4)';
            for (let i = 0; i < 5; i++) {
                const angle = (Date.now() * 0.002 + i * 1.2) % (Math.PI * 2);
                const dist = 8 + Math.sin(Date.now() * 0.003 + i) * 4;
                ctx.fillRect(
                    sx + Math.cos(angle) * dist,
                    sy + Math.sin(angle) * dist,
                    2, 2
                );
            }
        }

        ctx.restore();
    }
}
