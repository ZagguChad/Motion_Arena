// ============================================================
// GRAVITY BRIDGE — Game Engine (Laptop Canvas Display)
// Side-scrolling cooperative bridge platformer
// ============================================================

class GravityBridgeGame {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.lastTime = 0;

        // Player inputs { height: 0-1, tilt: -1..1 }
        this.players = {
            1: { height: 0.5, tilt: 0, connected: false },
            2: { height: 0.5, tilt: 0, connected: false }
        };

        // Bridge state
        this.bridgeY = 0.5;       // 0 = bottom, 1 = top
        this.bridgeTilt = 0;      // -1 left, 1 right
        this.bridgeStability = 1; // 1 = stable, 0 = max wobble
        this.bridgeWobble = 0;

        // Camera / scroll
        this.scrollX = 0;
        this.scrollSpeed = 80; // px/s
        this.levelLength = 8000;

        // Orbs
        this.orbs = [];
        this.orbsCollected = 0;
        this.orbsOnBridge = [];

        // Obstacles
        this.obstacles = [];

        // Particles
        this.particles = [];

        // Stars background
        this.stars = [];

        // Scoring
        this.score = 0;
        this.syncScore = 0;
        this.totalSync = 0;
        this.syncSamples = 0;

        // Game duration
        this.timer = 90;
        this.gameOver = false;

        // Level generation
        this.generated = false;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.W = this.canvas.width;
        this.H = this.canvas.height;
    }

    updatePlayerInput(playerNum, height, tilt) {
        if (this.players[playerNum]) {
            this.players[playerNum].height = height;
            this.players[playerNum].tilt = tilt;
            this.players[playerNum].connected = true;
        }
    }

    generateLevel() {
        // Stars
        this.stars = [];
        for (let i = 0; i < 200; i++) {
            this.stars.push({
                x: Math.random() * this.levelLength * 1.5,
                y: Math.random() * this.H,
                size: Math.random() * 2 + 0.5,
                brightness: Math.random() * 0.5 + 0.3,
                twinkleSpeed: Math.random() * 2 + 1
            });
        }

        // Generate orbs along the path
        this.orbs = [];
        for (let x = 400; x < this.levelLength - 200; x += 200 + Math.random() * 300) {
            const orbY = Math.random(); // 0 = must crouch, 1 = must stand
            this.orbs.push({
                x: x,
                yNorm: orbY, // normalized position (bottom=0, top=1)
                collected: false,
                radius: 14,
                glow: 0,
                pulsePhase: Math.random() * Math.PI * 2
            });
        }

        // Generate obstacles (sweeping beams at fixed heights)
        this.obstacles = [];
        for (let x = 600; x < this.levelLength - 400; x += 350 + Math.random() * 250) {
            const type = Math.random();
            if (type < 0.4) {
                // Top obstacle — must crouch to avoid
                this.obstacles.push({
                    x: x, width: 120 + Math.random() * 80,
                    yMin: 0.55, yMax: 1.0, // occupies upper portion
                    type: 'top', color: '#ff3355'
                });
            } else if (type < 0.8) {
                // Bottom obstacle — must stand to avoid
                this.obstacles.push({
                    x: x, width: 120 + Math.random() * 80,
                    yMin: 0.0, yMax: 0.45,
                    type: 'bottom', color: '#ff8800'
                });
            } else {
                // Gap obstacle — must be in middle
                this.obstacles.push({
                    x: x, width: 80 + Math.random() * 60,
                    yMin: 0.0, yMax: 0.3,
                    type: 'bottom', color: '#ff8800'
                });
                this.obstacles.push({
                    x: x, width: 80 + Math.random() * 60,
                    yMin: 0.7, yMax: 1.0,
                    type: 'top', color: '#ff3355'
                });
            }
        }

        this.generated = true;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.generateLevel();
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    loop(timestamp) {
        if (!this.running) return;

        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;

        this.update(dt);
        this.render();

        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        if (this.gameOver) return;

        // Timer
        this.timer -= dt;
        if (this.timer <= 0) {
            this.timer = 0;
            this.endGame();
            return;
        }

        const p1 = this.players[1];
        const p2 = this.players[2];

        // Calculate sync (how close the two players' heights are)
        const heightDiff = Math.abs(p1.height - p2.height);
        const syncAmount = Math.max(0, 1 - heightDiff * 3); // perfect sync if diff < 0.1
        this.bridgeStability = 0.3 + syncAmount * 0.7;

        this.totalSync += syncAmount;
        this.syncSamples++;
        this.syncScore = this.totalSync / this.syncSamples;

        // Bridge Y = average of both players
        const targetY = (p1.height + p2.height) / 2;
        this.bridgeY += (targetY - this.bridgeY) * 4 * dt;

        // Bridge tilt = average of both players' tilt
        const targetTilt = (p1.tilt + p2.tilt) / 2;
        this.bridgeTilt += (targetTilt - this.bridgeTilt) * 5 * dt;

        // Wobble when out of sync
        if (syncAmount < 0.5) {
            this.bridgeWobble += dt * 8;
        } else {
            this.bridgeWobble *= 0.95;
        }

        // Scroll
        this.scrollX += this.scrollSpeed * dt;

        // Check if level complete
        if (this.scrollX >= this.levelLength) {
            this.endGame();
            return;
        }

        // Bridge screen position
        const bridgeScreenY = this.H * 0.2 + (1 - this.bridgeY) * (this.H * 0.6);
        const bridgeLeft = this.W * 0.2;
        const bridgeRight = this.W * 0.8;
        const bridgeWidth = bridgeRight - bridgeLeft;
        const bridgeCenterX = (bridgeLeft + bridgeRight) / 2;

        // Tilt offset at edges
        const tiltPx = this.bridgeTilt * 40;

        // Orb collection
        for (const orb of this.orbs) {
            if (orb.collected) continue;
            const orbScreenX = orb.x - this.scrollX;
            if (orbScreenX < -50 || orbScreenX > this.W + 50) continue;

            // Orb world Y position
            const orbScreenY = this.H * 0.15 + (1 - orb.yNorm) * (this.H * 0.65);

            // Check if bridge is at correct height to collect
            if (orbScreenX > bridgeLeft && orbScreenX < bridgeRight) {
                const bridgeYAtOrb = bridgeScreenY + (orbScreenX - bridgeCenterX) / bridgeWidth * tiltPx * 2;
                if (Math.abs(orbScreenY - bridgeYAtOrb) < 35) {
                    orb.collected = true;
                    this.orbsCollected++;
                    this.score += 100 * this.bridgeStability;

                    // Spawn particles
                    for (let i = 0; i < 12; i++) {
                        this.particles.push({
                            x: orbScreenX, y: orbScreenY,
                            vx: (Math.random() - 0.5) * 200,
                            vy: (Math.random() - 0.5) * 200,
                            life: 0.6 + Math.random() * 0.4,
                            maxLife: 0.6 + Math.random() * 0.4,
                            color: Math.random() > 0.5 ? '#00e5ff' : '#ff00e5',
                            size: 3 + Math.random() * 4
                        });
                    }
                }
            }
        }

        // Obstacle collision
        for (const obs of this.obstacles) {
            const obsLeft = obs.x - this.scrollX;
            const obsRight = obsLeft + obs.width;
            if (obsRight < 0 || obsLeft > this.W) continue;

            // Check if bridge overlaps obstacle zone
            if (obsLeft < bridgeRight && obsRight > bridgeLeft) {
                if (this.bridgeY >= obs.yMin && this.bridgeY <= obs.yMax) {
                    // Hit! Reduce score and flash
                    this.score = Math.max(0, this.score - 5 * dt);
                    this.bridgeStability = Math.max(0.1, this.bridgeStability - 0.5 * dt);
                }
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    endGame() {
        this.gameOver = true;
    }

    render() {
        const ctx = this.ctx;
        const W = this.W;
        const H = this.H;

        // Background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#060612');
        bgGrad.addColorStop(0.5, '#0a0a1a');
        bgGrad.addColorStop(1, '#0f0a1f');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        const now = performance.now() / 1000;

        // Stars (parallax)
        for (const s of this.stars) {
            const sx = (s.x - this.scrollX * 0.3) % (W * 2);
            const sy = s.y;
            if (sx < -10 || sx > W + 10) continue;
            const twinkle = 0.5 + 0.5 * Math.sin(now * s.twinkleSpeed);
            ctx.fillStyle = `rgba(200, 220, 255, ${s.brightness * twinkle})`;
            ctx.beginPath();
            ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Grid lines (subtle)
        ctx.strokeStyle = 'rgba(255,255,255,0.015)';
        ctx.lineWidth = 1;
        for (let y = 0; y < H; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
        for (let x = -this.scrollX % 40; x < W; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }

        // Bridge position
        const bridgeScreenY = H * 0.2 + (1 - this.bridgeY) * (H * 0.6);
        const bridgeLeft = W * 0.2;
        const bridgeRight = W * 0.8;
        const bridgeCenterX = (bridgeLeft + bridgeRight) / 2;
        const tiltPx = this.bridgeTilt * 40;
        const wobbleOffset = Math.sin(this.bridgeWobble) * (1 - this.bridgeStability) * 15;

        // Draw obstacles
        for (const obs of this.obstacles) {
            const ox = obs.x - this.scrollX;
            if (ox + obs.width < -20 || ox > W + 20) continue;

            const oy1 = H * 0.15 + (1 - obs.yMax) * (H * 0.65);
            const oy2 = H * 0.15 + (1 - obs.yMin) * (H * 0.65);

            // Glow
            const grad = ctx.createLinearGradient(ox, oy1, ox, oy2);
            const baseColor = obs.type === 'top' ? '255,51,85' : '255,136,0';
            grad.addColorStop(0, `rgba(${baseColor}, 0.25)`);
            grad.addColorStop(0.5, `rgba(${baseColor}, 0.12)`);
            grad.addColorStop(1, `rgba(${baseColor}, 0.25)`);
            ctx.fillStyle = grad;
            ctx.fillRect(ox, oy1, obs.width, oy2 - oy1);

            // Borders
            ctx.strokeStyle = `rgba(${baseColor}, 0.5)`;
            ctx.lineWidth = 2;
            ctx.strokeRect(ox, oy1, obs.width, oy2 - oy1);

            // Warning stripes
            ctx.save();
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = obs.color;
            for (let sy = oy1; sy < oy2; sy += 16) {
                ctx.fillRect(ox, sy, obs.width, 4);
            }
            ctx.restore();
        }

        // Draw orbs
        for (const orb of this.orbs) {
            if (orb.collected) continue;
            const ox = orb.x - this.scrollX;
            if (ox < -30 || ox > W + 30) continue;

            const oy = H * 0.15 + (1 - orb.yNorm) * (H * 0.65);
            const pulse = 1 + 0.15 * Math.sin(now * 3 + orb.pulsePhase);
            const r = orb.radius * pulse;

            // Glow
            const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 3);
            glow.addColorStop(0, 'rgba(0, 229, 255, 0.3)');
            glow.addColorStop(1, 'rgba(0, 229, 255, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(ox, oy, r * 3, 0, Math.PI * 2);
            ctx.fill();

            // Core
            const coreGrad = ctx.createRadialGradient(ox - 3, oy - 3, 0, ox, oy, r);
            coreGrad.addColorStop(0, '#ffffff');
            coreGrad.addColorStop(0.3, '#88eeff');
            coreGrad.addColorStop(1, '#00bbdd');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(ox, oy, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Draw bridge
        const bridgeLeftY = bridgeScreenY - tiltPx + wobbleOffset;
        const bridgeRightY = bridgeScreenY + tiltPx + wobbleOffset;

        // Bridge glow
        ctx.save();
        ctx.globalAlpha = 0.15 * this.bridgeStability;
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 30;
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(bridgeLeft, bridgeLeftY);
        ctx.lineTo(bridgeRight, bridgeRightY);
        ctx.stroke();
        ctx.restore();

        // Bridge surface
        const syncColor = this.bridgeStability > 0.7
            ? `rgba(0, 229, 255, ${0.6 + this.bridgeStability * 0.4})`
            : this.bridgeStability > 0.4
                ? `rgba(255, 221, 0, ${0.6 + this.bridgeStability * 0.4})`
                : `rgba(255, 51, 85, ${0.6 + this.bridgeStability * 0.4})`;

        // Bridge body (thick platform)
        const bridgeThickness = 12;
        ctx.fillStyle = syncColor;
        ctx.beginPath();
        ctx.moveTo(bridgeLeft, bridgeLeftY - bridgeThickness / 2);
        ctx.lineTo(bridgeRight, bridgeRightY - bridgeThickness / 2);
        ctx.lineTo(bridgeRight, bridgeRightY + bridgeThickness / 2);
        ctx.lineTo(bridgeLeft, bridgeLeftY + bridgeThickness / 2);
        ctx.closePath();
        ctx.fill();

        // Bridge edge glow
        ctx.strokeStyle = syncColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = syncColor;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(bridgeLeft, bridgeLeftY);
        ctx.lineTo(bridgeRight, bridgeRightY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Bridge supports (vertical lines down)
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let x = bridgeLeft; x <= bridgeRight; x += 30) {
            const frac = (x - bridgeLeft) / (bridgeRight - bridgeLeft);
            const byAtX = bridgeLeftY + frac * (bridgeRightY - bridgeLeftY);
            ctx.beginPath();
            ctx.moveTo(x, byAtX + bridgeThickness / 2);
            ctx.lineTo(x, H);
            ctx.stroke();
        }

        // Player indicators on bridge
        const p1x = bridgeLeft + 40;
        const p1y = bridgeLeftY - 20;
        const p2x = bridgeRight - 40;
        const p2y = bridgeRightY - 20;

        // P1 avatar
        ctx.fillStyle = '#00e5ff';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🧑', p1x, p1y);
        ctx.font = "7px 'Press Start 2P'";
        ctx.fillStyle = '#00e5ff';
        ctx.fillText('P1', p1x, p1y + 16);

        // P2 avatar
        ctx.fillStyle = '#ff00e5';
        ctx.font = '20px sans-serif';
        ctx.fillText('🧑', p2x, p2y);
        ctx.font = "7px 'Press Start 2P'";
        ctx.fillStyle = '#ff00e5';
        ctx.fillText('P2', p2x, p2y + 16);

        // Draw particles
        for (const p of this.particles) {
            const alpha = p.life / p.maxLife;
            ctx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // HUD
        this.renderHUD(ctx, now);

        // Game Over overlay
        if (this.gameOver) {
            this.renderGameOver(ctx);
        }
    }

    renderHUD(ctx, now) {
        const W = this.W;

        // Top bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, W, 56);

        // Score
        ctx.font = "10px 'Press Start 2P'";
        ctx.fillStyle = '#00e5ff';
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE: ${Math.round(this.score)}`, 20, 25);

        // Orbs collected
        ctx.fillStyle = '#00ff88';
        ctx.fillText(`ORBS: ${this.orbsCollected}/${this.orbs.length}`, 20, 42);

        // Timer
        const mins = Math.floor(this.timer / 60);
        const secs = Math.floor(this.timer % 60);
        ctx.textAlign = 'right';
        ctx.fillStyle = this.timer < 15 ? '#ff3355' : '#ffdd00';
        ctx.font = "12px 'Press Start 2P'";
        ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, W - 20, 25);

        // Sync meter
        const syncPct = this.bridgeStability;
        const syncW = 150;
        const syncH = 8;
        const syncX = W / 2 - syncW / 2;
        const syncY = 18;

        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.roundRect(syncX, syncY, syncW, syncH, 4);
        ctx.fill();

        const syncFillColor = syncPct > 0.7 ? '#00ff88' : syncPct > 0.4 ? '#ffdd00' : '#ff3355';
        ctx.fillStyle = syncFillColor;
        ctx.beginPath();
        ctx.roundRect(syncX, syncY, syncW * syncPct, syncH, 4);
        ctx.fill();

        ctx.font = "7px 'Press Start 2P'";
        ctx.fillStyle = '#8888aa';
        ctx.textAlign = 'center';
        ctx.fillText('SYNC', W / 2, syncY + syncH + 14);

        // Progress bar at bottom
        const progress = Math.min(1, this.scrollX / this.levelLength);
        const progW = W - 40;
        const progH = 4;
        const progX = 20;
        const progY = this.H - 16;

        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(progX, progY, progW, progH);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.5)';
        ctx.fillRect(progX, progY, progW * progress, progH);
    }

    renderGameOver(ctx) {
        const W = this.W;
        const H = this.H;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        // Title
        ctx.font = "18px 'Press Start 2P'";
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 20;
        ctx.fillText('BRIDGE CROSSED!', W / 2, H / 2 - 80);
        ctx.shadowBlur = 0;

        // Score
        ctx.font = "14px 'Press Start 2P'";
        ctx.fillStyle = '#ffdd00';
        ctx.fillText(`SCORE: ${Math.round(this.score)}`, W / 2, H / 2 - 30);

        // Stats
        ctx.font = "9px 'Press Start 2P'";
        ctx.fillStyle = '#8888aa';
        ctx.fillText(`Orbs Collected: ${this.orbsCollected} / ${this.orbs.length}`, W / 2, H / 2 + 10);
        ctx.fillText(`Sync Rating: ${Math.round(this.syncScore * 100)}%`, W / 2, H / 2 + 35);

        // Grade
        const grade = this.syncScore > 0.85 ? 'S' : this.syncScore > 0.7 ? 'A' : this.syncScore > 0.5 ? 'B' : 'C';
        const gradeColors = { S: '#ff00e5', A: '#00ff88', B: '#ffdd00', C: '#ff3355' };
        ctx.font = "40px 'Press Start 2P'";
        ctx.fillStyle = gradeColors[grade];
        ctx.shadowColor = gradeColors[grade];
        ctx.shadowBlur = 30;
        ctx.fillText(grade, W / 2, H / 2 + 100);
        ctx.shadowBlur = 0;

        // Restart hint
        ctx.font = "8px 'Press Start 2P'";
        ctx.fillStyle = '#555570';
        ctx.fillText('Return to lobby to play again', W / 2, H / 2 + 140);
    }
}
