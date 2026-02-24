// ============================================
// Ghost of the Breath Temple — Flame Renderer
// Procedural flame + particle system on Canvas
// ============================================

export class Flame {
    constructor() {
        // Flame state
        this.brightness = 0.8;       // 0 = extinguished, 1 = full blaze
        this.targetBrightness = 0.8;
        this.baseX = 0;
        this.baseY = 0;

        // Animation
        this.time = 0;
        this.flickerOffset = 0;
        this.windOffset = 0;

        // Particles (embers rising)
        this.particles = [];
        this.maxParticles = 35;

        // Color
        this.baseColor = [255, 160, 50]; // warm orange
        this.currentColor = [...this.baseColor];

        // Hit flash
        this.flashTimer = 0;
        this.flashColor = [255, 255, 200];
    }

    setPosition(x, y) {
        this.baseX = x;
        this.baseY = y;
    }

    setColor(r, g, b) {
        this.baseColor = [r, g, b];
    }

    flash() {
        this.flashTimer = 0.3;
    }

    update(dt) {
        this.time += dt;

        // Smooth brightness transition
        this.brightness += (this.targetBrightness - this.brightness) * dt * 3;
        this.brightness = Math.max(0, Math.min(1, this.brightness));

        // Flicker
        this.flickerOffset = Math.sin(this.time * 8) * 0.03 +
            Math.sin(this.time * 13) * 0.02 +
            Math.sin(this.time * 21) * 0.01;

        // Wind
        this.windOffset = Math.sin(this.time * 1.5) * 4 + Math.sin(this.time * 0.7) * 2;

        // Flash decay
        if (this.flashTimer > 0) this.flashTimer -= dt;

        // Update color — shifts toward blue when dim
        const b = this.brightness;
        this.currentColor[0] = this.baseColor[0] * b + 60 * (1 - b);
        this.currentColor[1] = this.baseColor[1] * b + 80 * (1 - b);
        this.currentColor[2] = this.baseColor[2] * (0.5 + b * 0.5) + 180 * (1 - b);

        // Spawn particles
        if (this.brightness > 0.1 && this.particles.length < this.maxParticles) {
            if (Math.random() < this.brightness * 0.6) {
                this.particles.push({
                    x: this.baseX + (Math.random() - 0.5) * 20 * this.brightness,
                    y: this.baseY - 10,
                    vx: (Math.random() - 0.5) * 30,
                    vy: -40 - Math.random() * 60 * this.brightness,
                    life: 1.0,
                    decay: 0.8 + Math.random() * 1.2,
                    size: 1.5 + Math.random() * 2.5 * this.brightness
                });
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy -= 20 * dt; // float upward faster
            p.life -= p.decay * dt;
            p.size *= 0.995;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        const x = this.baseX + this.windOffset;
        const y = this.baseY;
        const b = Math.max(0.05, this.brightness + this.flickerOffset);
        const scale = 0.4 + b * 0.6;

        ctx.save();

        // ─── OUTER GLOW ───
        const glowRadius = 80 + b * 120;
        const glow = ctx.createRadialGradient(x, y - 30 * scale, 0, x, y - 30 * scale, glowRadius);
        glow.addColorStop(0, `rgba(${this.currentColor[0]}, ${this.currentColor[1]}, ${this.currentColor[2]}, ${0.15 * b})`);
        glow.addColorStop(0.5, `rgba(${this.currentColor[0]}, ${this.currentColor[1]}, ${this.currentColor[2]}, ${0.05 * b})`);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - glowRadius, y - 30 * scale - glowRadius, glowRadius * 2, glowRadius * 2);

        // ─── FLAME BODY (layered bezier curves) ───
        const layers = [
            { widthMul: 1.0, heightMul: 1.0, alpha: 0.9, colorShift: 0 },
            { widthMul: 0.7, heightMul: 1.1, alpha: 0.7, colorShift: 30 },
            { widthMul: 0.4, heightMul: 0.9, alpha: 0.6, colorShift: 60 },
        ];

        for (const layer of layers) {
            const w = (18 + b * 14) * layer.widthMul;
            const h = (50 + b * 40) * scale * layer.heightMul;
            const tipWobble = Math.sin(this.time * 6 + layer.colorShift) * 3 * scale;

            ctx.beginPath();
            ctx.moveTo(x - w, y);
            ctx.bezierCurveTo(
                x - w * 0.8, y - h * 0.3,
                x - w * 0.3 + tipWobble, y - h * 0.7,
                x + tipWobble, y - h
            );
            ctx.bezierCurveTo(
                x + w * 0.3 + tipWobble, y - h * 0.7,
                x + w * 0.8, y - h * 0.3,
                x + w, y
            );
            ctx.closePath();

            const r = Math.min(255, this.currentColor[0] + layer.colorShift);
            const g = Math.min(255, this.currentColor[1] + layer.colorShift * 0.5);
            const bl = Math.min(255, this.currentColor[2]);

            ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${layer.alpha * b})`;
            ctx.fill();
        }

        // ─── FLASH OVERLAY ───
        if (this.flashTimer > 0) {
            const flashAlpha = this.flashTimer / 0.3 * 0.5;
            const flashGlow = ctx.createRadialGradient(x, y - 30 * scale, 0, x, y - 30 * scale, 100);
            flashGlow.addColorStop(0, `rgba(255, 255, 220, ${flashAlpha})`);
            flashGlow.addColorStop(1, `rgba(255, 255, 220, 0)`);
            ctx.fillStyle = flashGlow;
            ctx.fillRect(x - 100, y - 130, 200, 200);
        }

        // ─── CANDLE/PEDESTAL BASE ───
        ctx.fillStyle = `rgba(80, 70, 60, 0.9)`;
        ctx.fillRect(x - 8, y, 16, 12);
        ctx.fillStyle = `rgba(60, 50, 40, 0.9)`;
        ctx.fillRect(x - 14, y + 10, 28, 6);

        // ─── PARTICLES (embers) ───
        for (const p of this.particles) {
            const alpha = p.life * b;
            const pr = Math.min(255, this.currentColor[0] + 40);
            const pg = Math.min(255, this.currentColor[1] + 20);
            const pb = this.currentColor[2];
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;
            ctx.fill();
        }

        ctx.restore();
    }
}
