// ============================================================
// BALANCE DUEL — Game Engine (Laptop Canvas Display)
// Two floating shards + shared crystal physics
// ============================================================

class BalanceDuelGame {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.lastTime = 0;

        // Player tilt inputs { beta: -1..1, gamma: -1..1 }
        this.players = {
            1: { beta: 0, gamma: 0, connected: false },
            2: { beta: 0, gamma: 0, connected: false }
        };

        // Crystal physics
        this.crystalX = 0; // -1 to 1 (center = 0)
        this.crystalY = 0;
        this.crystalVX = 0;
        this.crystalVY = 0;
        this.crystalAngle = 0;
        this.crystalAngularVel = 0;

        // Shards
        this.shard1Angle = 0;
        this.shard2Angle = 0;

        // Game state
        this.survivalTime = 0;
        this.gameOver = false;
        this.dangerLevel = 0; // 0-1

        // Disturbances
        this.disturbances = [];
        this.nextDisturbance = 10; // seconds until first disturbance
        this.disturbanceInterval = 12;

        // Visuals
        this.stars = [];
        this.particles = [];
        this.shakeAmount = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.W = this.canvas.width;
        this.H = this.canvas.height;
    }

    updatePlayerTilt(playerNum, beta, gamma) {
        if (this.players[playerNum]) {
            this.players[playerNum].beta = beta;
            this.players[playerNum].gamma = gamma;
            this.players[playerNum].connected = true;
        }
    }

    start() {
        if (this.running) return;
        this.running = true;

        // Stars
        this.stars = [];
        for (let i = 0; i < 100; i++) {
            this.stars.push({
                x: Math.random() * this.W,
                y: Math.random() * this.H,
                size: Math.random() * 2 + 0.5,
                brightness: Math.random() * 0.4 + 0.2,
                twinkleSpeed: Math.random() * 2 + 0.5
            });
        }

        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    loop(timestamp) {
        if (!this.running) return;
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;

        this.update(dt);
        this.render(timestamp);

        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        if (this.gameOver) return;

        this.survivalTime += dt;

        const p1 = this.players[1];
        const p2 = this.players[2];

        // Difficulty scaling
        const difficulty = Math.min(3, 1 + this.survivalTime / 30);

        // Shard angles (visual)
        this.shard1Angle = p1.gamma * 25;
        this.shard2Angle = p2.gamma * 25;

        // Crystal physics — affected by both shards' tilts
        // P1 shard is on the LEFT, P2 shard is on the RIGHT
        // P1 tilt gamma pushes crystal left/right from left side
        // P2 tilt gamma pushes crystal left/right from right side

        // Combined  force is the sum of both players' tilts
        const forceX = (p1.gamma + p2.gamma) * 3 * difficulty;
        const forceY = (p1.beta + p2.beta) * 2 * difficulty;

        // When players tilt in OPPOSITE directions, crystal is more stable
        // When both tilt same way, crystal accelerates
        this.crystalVX += forceX * dt;
        this.crystalVY += forceY * dt;

        // Friction
        this.crystalVX *= 0.97;
        this.crystalVY *= 0.97;

        // Gravity toward center (gentle restoring force)
        this.crystalVX -= this.crystalX * 0.3 * dt;
        this.crystalVY -= this.crystalY * 0.3 * dt;

        // Apply velocity
        this.crystalX += this.crystalVX * dt;
        this.crystalY += this.crystalVY * dt;

        // Crystal rotation (visual)
        this.crystalAngularVel = (p1.gamma - p2.gamma) * 2;
        this.crystalAngle += this.crystalAngularVel * dt;

        // Disturbances
        if (this.survivalTime > this.nextDisturbance) {
            this.spawnDisturbance();
            this.nextDisturbance += Math.max(4, this.disturbanceInterval - this.survivalTime * 0.05);
        }

        // Apply disturbances
        for (let i = this.disturbances.length - 1; i >= 0; i--) {
            const d = this.disturbances[i];
            d.timer -= dt;
            if (d.timer <= 0) {
                this.disturbances.splice(i, 1);
                continue;
            }
            this.crystalVX += d.forceX * dt;
            this.crystalVY += d.forceY * dt;
        }

        // Danger level
        const dist = Math.sqrt(this.crystalX * this.crystalX + this.crystalY * this.crystalY);
        this.dangerLevel = Math.min(1, dist / 0.9);

        // Screen shake
        this.shakeAmount = this.dangerLevel * 5;

        // Particles when danger is high
        if (this.dangerLevel > 0.5 && Math.random() < this.dangerLevel * 0.3) {
            const cx = this.W / 2 + this.crystalX * this.W * 0.25;
            const cy = this.H / 2 + this.crystalY * this.H * 0.2;
            this.particles.push({
                x: cx + (Math.random() - 0.5) * 20,
                y: cy + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 80,
                vy: (Math.random() - 0.5) * 80,
                life: 0.5 + Math.random() * 0.3,
                maxLife: 0.5 + Math.random() * 0.3,
                color: this.dangerLevel > 0.8 ? '#ff3355' : '#ffdd00',
                size: 2 + Math.random() * 3
            });
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Game over check: crystal falls off
        if (dist > 1.0) {
            this.gameOver = true;
            // Explosion particles
            const cx = this.W / 2 + this.crystalX * this.W * 0.25;
            const cy = this.H / 2 + this.crystalY * this.H * 0.2;
            for (let i = 0; i < 40; i++) {
                this.particles.push({
                    x: cx, y: cy,
                    vx: (Math.random() - 0.5) * 400,
                    vy: (Math.random() - 0.5) * 400,
                    life: 1 + Math.random() * 0.5,
                    maxLife: 1 + Math.random() * 0.5,
                    color: ['#ff3355', '#ffdd00', '#ff8800', '#ff00e5'][Math.floor(Math.random() * 4)],
                    size: 3 + Math.random() * 6
                });
            }
        }
    }

    spawnDisturbance() {
        const types = ['wind', 'quake', 'pulse'];
        const type = types[Math.floor(Math.random() * types.length)];
        const strength = 1 + this.survivalTime * 0.05;

        switch (type) {
            case 'wind':
                this.disturbances.push({
                    type: 'wind',
                    forceX: (Math.random() - 0.5) * 4 * strength,
                    forceY: (Math.random() - 0.5) * 2 * strength,
                    timer: 2 + Math.random() * 2,
                    label: '💨 WIND GUST'
                });
                break;
            case 'quake':
                this.disturbances.push({
                    type: 'quake',
                    forceX: Math.sin(Date.now() * 0.01) * 3 * strength,
                    forceY: Math.cos(Date.now() * 0.013) * 2 * strength,
                    timer: 1.5 + Math.random() * 1,
                    label: '🌋 QUAKE'
                });
                break;
            case 'pulse':
                const angle = Math.random() * Math.PI * 2;
                this.disturbances.push({
                    type: 'pulse',
                    forceX: Math.cos(angle) * 5 * strength,
                    forceY: Math.sin(angle) * 5 * strength,
                    timer: 0.5,
                    label: '⚡ SHOCKWAVE'
                });
                break;
        }
    }

    render(timestamp) {
        const ctx = this.ctx;
        const W = this.W;
        const H = this.H;
        const now = timestamp / 1000;

        // Screen shake
        ctx.save();
        if (this.shakeAmount > 0.5) {
            ctx.translate(
                (Math.random() - 0.5) * this.shakeAmount,
                (Math.random() - 0.5) * this.shakeAmount
            );
        }

        // Background
        const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
        bgGrad.addColorStop(0, '#121820');
        bgGrad.addColorStop(1, '#080c10');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Danger vignette
        if (this.dangerLevel > 0.3) {
            const vigAlpha = (this.dangerLevel - 0.3) * 0.5;
            const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.7);
            vig.addColorStop(0, 'transparent');
            vig.addColorStop(1, `rgba(255, 30, 50, ${vigAlpha})`);
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, W, H);
        }

        // Stars
        for (const s of this.stars) {
            const twinkle = 0.5 + 0.5 * Math.sin(now * s.twinkleSpeed);
            ctx.fillStyle = `rgba(200, 220, 255, ${s.brightness * twinkle})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.02)';
        ctx.lineWidth = 1;
        for (let y = 0; y < H; y += 50) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        for (let x = 0; x < W; x += 50) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }

        // Safe zone indicator (circle in center)
        const safeR = Math.min(W, H) * 0.25;
        ctx.strokeStyle = `rgba(${this.dangerLevel > 0.5 ? '255, 100, 100' : '100, 200, 255'}, 0.15)`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, safeR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw shards
        this.drawShard(ctx, W * 0.25, H * 0.5, this.shard1Angle, '#00e5ff', 'P1', this.players[1]);
        this.drawShard(ctx, W * 0.75, H * 0.5, this.shard2Angle, '#ff00e5', 'P2', this.players[2]);

        // Connection lines from shards to crystal
        const cx = W / 2 + this.crystalX * W * 0.25;
        const cy = H / 2 + this.crystalY * H * 0.2;

        ctx.strokeStyle = `rgba(0, 229, 255, ${0.15 + (1 - this.dangerLevel) * 0.15})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W * 0.25, H * 0.5);
        ctx.lineTo(cx, cy);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 0, 229, ${0.15 + (1 - this.dangerLevel) * 0.15})`;
        ctx.beginPath();
        ctx.moveTo(W * 0.75, H * 0.5);
        ctx.lineTo(cx, cy);
        ctx.stroke();

        // Draw crystal
        if (!this.gameOver) {
            this.drawCrystal(ctx, cx, cy, now);
        }

        // Particles
        for (const p of this.particles) {
            const alpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Disturbance warnings
        for (const d of this.disturbances) {
            if (d.timer > 0) {
                ctx.font = "10px 'Press Start 2P'";
                ctx.fillStyle = '#ff8800';
                ctx.textAlign = 'center';
                ctx.globalAlpha = Math.min(1, d.timer);
                ctx.fillText(d.label, W / 2, H * 0.15);
                ctx.globalAlpha = 1;
            }
        }

        // HUD
        this.renderHUD(ctx, now);

        ctx.restore();

        if (this.gameOver) this.renderGameOver(ctx);
    }

    drawShard(ctx, x, y, angle, color, label, player) {
        const size = 60;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle * Math.PI / 180);

        // Glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;

        // Diamond shape
        ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba').replace('#', '');
        // Convert hex to rgba
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.7, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(-size * 0.7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Inner glow
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.08)`;
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.5);
        ctx.lineTo(size * 0.35, 0);
        ctx.lineTo(0, size * 0.5);
        ctx.lineTo(-size * 0.35, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Label
        ctx.font = "8px 'Press Start 2P'";
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y + size + 20);

        // Tilt indicator dot
        const dotX = x + player.gamma * 25;
        const dotY = y + player.beta * 25;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    drawCrystal(ctx, x, y, now) {
        const size = 25;
        const pulse = 1 + Math.sin(now * 3) * 0.05;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.crystalAngle);
        ctx.scale(pulse, pulse);

        // Outer glow
        const glowColor = this.dangerLevel > 0.7 ? 'rgba(255, 50, 80, 0.3)'
            : this.dangerLevel > 0.4 ? 'rgba(255, 221, 0, 0.3)'
                : 'rgba(200, 200, 255, 0.3)';
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3);
        glow.addColorStop(0, glowColor);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, size * 3, 0, Math.PI * 2);
        ctx.fill();

        // Crystal body — hexagonal
        const facets = 6;
        const coreColor = this.dangerLevel > 0.7 ? '#ff3355'
            : this.dangerLevel > 0.4 ? '#ffdd00' : '#aaccff';

        ctx.fillStyle = coreColor;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        for (let i = 0; i < facets; i++) {
            const angle = (i / facets) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(angle) * size;
            const py = Math.sin(angle) * size;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.strokeStyle = coreColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = coreColor;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Inner facet lines
        ctx.strokeStyle = `rgba(255, 255, 255, 0.15)`;
        ctx.lineWidth = 1;
        for (let i = 0; i < facets; i++) {
            const angle = (i / facets) * Math.PI * 2 - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
            ctx.stroke();
        }

        // Center dot
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.restore();

        // 💎 emoji above
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('💎', x, y - size - 10);
    }

    renderHUD(ctx, now) {
        const W = this.W;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, W, 56);

        // Survival time
        ctx.font = "10px 'Press Start 2P'";
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffdd00';
        const mins = Math.floor(this.survivalTime / 60);
        const secs = Math.floor(this.survivalTime % 60);
        ctx.fillText(`TIME: ${mins}:${secs.toString().padStart(2, '0')}`, 20, 25);

        // Danger meter
        const dangerW = 150;
        const dangerH = 8;
        const dangerX = W / 2 - dangerW / 2;
        const dangerY = 18;

        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.roundRect(dangerX, dangerY, dangerW, dangerH, 4);
        ctx.fill();

        const dangerColor = this.dangerLevel > 0.7 ? '#ff3355' : this.dangerLevel > 0.4 ? '#ffdd00' : '#00ff88';
        ctx.fillStyle = dangerColor;
        ctx.beginPath();
        ctx.roundRect(dangerX, dangerY, dangerW * this.dangerLevel, dangerH, 4);
        ctx.fill();

        ctx.font = "7px 'Press Start 2P'";
        ctx.fillStyle = '#8888aa';
        ctx.textAlign = 'center';
        ctx.fillText('CRYSTAL DANGER', W / 2, dangerY + dangerH + 14);

        // Difficulty
        ctx.textAlign = 'right';
        ctx.font = "8px 'Press Start 2P'";
        const diffLevel = Math.min(5, Math.floor(1 + this.survivalTime / 20));
        ctx.fillStyle = '#8888aa';
        ctx.fillText(`LEVEL ${diffLevel}`, W - 20, 25);
    }

    renderGameOver(ctx) {
        const W = this.W;
        const H = this.H;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        ctx.font = "18px 'Press Start 2P'";
        ctx.fillStyle = '#ff3355';
        ctx.shadowColor = '#ff3355';
        ctx.shadowBlur = 20;
        ctx.fillText('CRYSTAL SHATTERED!', W / 2, H / 2 - 80);
        ctx.shadowBlur = 0;

        ctx.font = "14px 'Press Start 2P'";
        ctx.fillStyle = '#ffdd00';
        const mins = Math.floor(this.survivalTime / 60);
        const secs = Math.floor(this.survivalTime % 60);
        ctx.fillText(`SURVIVED: ${mins}:${secs.toString().padStart(2, '0')}`, W / 2, H / 2 - 30);

        // Grade based on survival time
        const grade = this.survivalTime > 120 ? 'S' : this.survivalTime > 80 ? 'A' : this.survivalTime > 45 ? 'B' : 'C';
        const gradeColors = { S: '#ff00e5', A: '#00ff88', B: '#ffdd00', C: '#ff3355' };
        ctx.font = "40px 'Press Start 2P'";
        ctx.fillStyle = gradeColors[grade];
        ctx.shadowColor = gradeColors[grade];
        ctx.shadowBlur = 30;
        ctx.fillText(grade, W / 2, H / 2 + 60);
        ctx.shadowBlur = 0;

        ctx.font = "9px 'Press Start 2P'";
        ctx.fillStyle = '#8888aa';
        const diffLevel = Math.min(5, Math.floor(1 + this.survivalTime / 20));
        ctx.fillText(`Reached Level ${diffLevel}`, W / 2, H / 2 + 100);

        ctx.font = "8px 'Press Start 2P'";
        ctx.fillStyle = '#555570';
        ctx.fillText('Return to lobby to play again', W / 2, H / 2 + 130);
    }
}
