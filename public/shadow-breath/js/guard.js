// ============================================
// Shadow Breath — Guard AI & Vision System
// ============================================

export class Guard {
    constructor(config, tileSize) {
        this.tileSize = tileSize;
        this.type = config.type; // 'patrol' or 'watcher'
        this.speed = config.speed || 1;
        this.visionRange = (config.visionRange || 3) * tileSize;
        this.visionAngle = (config.visionAngle || 60) * (Math.PI / 180); // half-angle in radians

        // Position
        if (this.type === 'patrol') {
            this.path = config.path.map(p => ({
                x: p.x * tileSize + tileSize / 2,
                y: p.y * tileSize + tileSize / 2
            }));
            this.pathIndex = 0;
            this.x = this.path[0].x;
            this.y = this.path[0].y;
        } else {
            this.x = config.pos.x * tileSize + tileSize / 2;
            this.y = config.pos.y * tileSize + tileSize / 2;
            this.path = [];
            this.pathIndex = 0;
        }

        // Facing direction (in radians, 0 = right)
        this.angle = Math.PI / 2; // Start facing down
        this.rotateSpeed = config.rotateSpeed || 0;

        // Alert state
        this.alertLevel = 0; // 0 = calm, 0-50 = suspicious, 50-100 = alert
        this.alertDecay = 15; // per second
        this.canSeePlayer = false;

        // Animation
        this.animFrame = 0;
        this.animTimer = 0;
        this.isMoving = false;

        // Watcher rotation state
        if (this.type === 'watcher') {
            this.rotateDir = 1; // 1 or -1
            this.rotateAccum = 0;
            this.rotateMax = Math.PI * 0.8; // rotate back and forth
        }
    }

    update(dt) {
        if (this.type === 'patrol') {
            this._updatePatrol(dt);
        } else {
            this._updateWatcher(dt);
        }

        // Decay alert when not seeing player
        if (!this.canSeePlayer && this.alertLevel > 0) {
            this.alertLevel = Math.max(0, this.alertLevel - this.alertDecay * dt);
        }

        // Animation
        if (this.isMoving) {
            this.animTimer += dt;
            if (this.animTimer > 0.2) {
                this.animTimer = 0;
                this.animFrame = (this.animFrame + 1) % 4;
            }
        }
    }

    _updatePatrol(dt) {
        if (this.path.length < 2) return;

        const target = this.path[this.pathIndex];
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 2) {
            // Reached waypoint, go to next
            this.pathIndex = (this.pathIndex + 1) % this.path.length;
            this.isMoving = false;
            return;
        }

        this.isMoving = true;
        const moveSpeed = this.speed * this.tileSize * dt;
        const nx = dx / dist;
        const ny = dy / dist;

        this.x += nx * moveSpeed;
        this.y += ny * moveSpeed;
        this.angle = Math.atan2(ny, nx);
    }

    _updateWatcher(dt) {
        this.isMoving = false;
        this.rotateAccum += this.rotateSpeed * this.rotateDir * dt;

        if (Math.abs(this.rotateAccum) > this.rotateMax) {
            this.rotateDir *= -1;
            this.rotateAccum = Math.sign(this.rotateAccum) * this.rotateMax;
        }

        this.angle = (Math.PI / 2) + this.rotateAccum;
    }

    // Check if a point (player position) is in the guard's vision cone
    checkVision(playerX, playerY, playerVisible) {
        if (!playerVisible) {
            this.canSeePlayer = false;
            return false;
        }

        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Out of range
        if (dist > this.visionRange) {
            this.canSeePlayer = false;
            return false;
        }

        // Check angle
        const angleToPlayer = Math.atan2(dy, dx);
        let angleDiff = angleToPlayer - this.angle;
        // Normalize to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) > this.visionAngle) {
            this.canSeePlayer = false;
            return false;
        }

        // Player is visible!
        this.canSeePlayer = true;
        const alertIncrease = (1 - dist / this.visionRange) * 80; // closer = more alert
        this.alertLevel = Math.min(100, this.alertLevel + alertIncrease * 0.016); // ~per frame
        return true;
    }

    draw(ctx, cameraX, cameraY, showPatrolPath) {
        const sx = this.x - cameraX;
        const sy = this.y - cameraY;
        const ts = this.tileSize;

        ctx.save();

        // Draw patrol path (focus mode)
        if (showPatrolPath && this.type === 'patrol' && this.path.length > 1) {
            ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(this.path[0].x - cameraX, this.path[0].y - cameraY);
            for (let i = 1; i < this.path.length; i++) {
                ctx.lineTo(this.path[i].x - cameraX, this.path[i].y - cameraY);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Vision cone
        this._drawVisionCone(ctx, sx, sy);

        // Guard body
        const hs = ts * 0.4;

        // Armor color based on type
        let bodyColor, headColor;
        if (this.type === 'watcher') {
            bodyColor = '#3a2a15';
            headColor = '#2a1a0a';
        } else {
            bodyColor = '#4a3520';
            headColor = '#3a2a15';
        }

        // Body
        ctx.fillStyle = bodyColor;
        ctx.fillRect(sx - hs, sy - hs, hs * 2, hs * 2);

        // Head / helmet
        ctx.fillStyle = headColor;
        ctx.fillRect(sx - hs * 0.7, sy - hs - 3, hs * 1.4, hs * 0.6);

        // Eyes — direction they're looking
        ctx.fillStyle = this.alertLevel > 50 ? '#ff3333' : (this.alertLevel > 20 ? '#ffaa00' : '#ffcc44');
        const eyeAngle = this.angle;
        const eyeOffX = Math.cos(eyeAngle) * 3;
        const eyeOffY = Math.sin(eyeAngle) * 3;
        ctx.fillRect(sx + eyeOffX - 2, sy - hs + eyeOffY, 2, 2);
        ctx.fillRect(sx + eyeOffX + 1, sy - hs + eyeOffY, 2, 2);

        // Legs
        if (this.isMoving) {
            const lo = this.animFrame % 2 === 0 ? 2 : -2;
            ctx.fillStyle = '#2a1a0a';
            ctx.fillRect(sx - 3, sy + hs, 3, 4 + lo);
            ctx.fillRect(sx + 1, sy + hs, 3, 4 - lo);
        } else {
            ctx.fillStyle = '#2a1a0a';
            ctx.fillRect(sx - 3, sy + hs, 3, 4);
            ctx.fillRect(sx + 1, sy + hs, 3, 4);
        }

        // Alert indicator
        if (this.alertLevel > 20) {
            ctx.fillStyle = this.alertLevel > 50 ? '#ff0000' : '#ffaa00';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.alertLevel > 50 ? '!' : '?', sx, sy - hs - 8);
        }

        ctx.restore();
    }

    _drawVisionCone(ctx, sx, sy) {
        const coneColor = this.alertLevel > 50
            ? 'rgba(255, 50, 50, 0.15)'
            : (this.alertLevel > 20
                ? 'rgba(255, 180, 50, 0.12)'
                : 'rgba(255, 200, 80, 0.08)');

        const coneEdge = this.alertLevel > 50
            ? 'rgba(255, 50, 50, 0.3)'
            : 'rgba(255, 200, 80, 0.15)';

        ctx.fillStyle = coneColor;
        ctx.strokeStyle = coneEdge;
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        const startAngle = this.angle - this.visionAngle;
        const endAngle = this.angle + this.visionAngle;
        ctx.arc(sx, sy, this.visionRange, startAngle, endAngle);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}
