// ============================================
// Ghost of the Breath Temple — Flame Renderer
// Procedural flame + particle system on Canvas
// Enhanced with smoke, sparks, floor glow
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
        this.maxParticles = 45;

        // Sparks (on perfect hits)
        this.sparks = [];

        // Smoke wisps (when dim)
        this.smokeParticles = [];

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
        // Spawn sparks on flash
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 * i / 6) + (Math.random() - 0.5) * 0.5;
            this.sparks.push({
                x: this.baseX,
                y: this.baseY - 20,
                vx: Math.cos(angle) * (40 + Math.random() * 60),
                vy: Math.sin(angle) * (30 + Math.random() * 50) - 30,
                life: 1.0,
                decay: 1.5 + Math.random() * 1.5,
                size: 1 + Math.random() * 2.5
            });
        }
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

        // Spawn embers
        if (this.brightness > 0.1 && this.particles.length < this.maxParticles) {
            if (Math.random() < this.brightness * 0.7) {
                const sizeBase = this.brightness * 2.5;
                this.particles.push({
                    x: this.baseX + (Math.random() - 0.5) * 22 * this.brightness,
                    y: this.baseY - 10,
                    vx: (Math.random() - 0.5) * 30 + this.windOffset * 0.5,
                    vy: -45 - Math.random() * 65 * this.brightness,
                    life: 1.0,
                    decay: 0.6 + Math.random() * 1.0,
                    size: 1 + Math.random() * sizeBase,
                    type: Math.random() < 0.3 ? 'hot' : 'ember' // hot = white-yellow, ember = orange
                });
            }
        }

        // Update embers
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy -= 15 * dt; // float upward faster
            p.vx += (Math.random() - 0.5) * 5 * dt; // drift
            p.life -= p.decay * dt;
            p.size *= 0.997;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update sparks
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vy += 60 * dt; // gravity
            s.life -= s.decay * dt;
            if (s.life <= 0) this.sparks.splice(i, 1);
        }

        // Smoke wisps when dim
        if (this.brightness < 0.5 && this.smokeParticles.length < 12) {
            if (Math.random() < (0.5 - this.brightness) * 0.8) {
                this.smokeParticles.push({
                    x: this.baseX + (Math.random() - 0.5) * 10,
                    y: this.baseY - 30 - Math.random() * 20,
                    vx: (Math.random() - 0.5) * 8 + this.windOffset * 0.3,
                    vy: -15 - Math.random() * 20,
                    life: 1.0,
                    decay: 0.3 + Math.random() * 0.3,
                    size: 8 + Math.random() * 12,
                    opacity: 0.06 + Math.random() * 0.04
                });
            }
        }
        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
            const s = this.smokeParticles[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.size += 8 * dt; // expand
            s.life -= s.decay * dt;
            if (s.life <= 0) this.smokeParticles.splice(i, 1);
        }
    }

    draw(ctx) {
        const x = this.baseX + this.windOffset;
        const y = this.baseY;
        const b = Math.max(0.05, this.brightness + this.flickerOffset);
        const scale = 0.4 + b * 0.6;

        ctx.save();

        // ─── FLOOR GLOW (warm light reflection) ───
        const floorGlow = ctx.createRadialGradient(x, y + 18, 0, x, y + 40, 120 * b);
        floorGlow.addColorStop(0, `rgba(${this.currentColor[0]}, ${this.currentColor[1]}, ${Math.min(100, this.currentColor[2])}, ${0.08 * b})`);
        floorGlow.addColorStop(0.5, `rgba(${this.currentColor[0]}, ${this.currentColor[1]}, ${Math.min(80, this.currentColor[2])}, ${0.03 * b})`);
        floorGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = floorGlow;
        ctx.beginPath();
        ctx.ellipse(x, y + 30, 120 * b, 40 * b, 0, 0, Math.PI * 2);
        ctx.fill();

        // ─── SMOKE WISPS ───
        for (const s of this.smokeParticles) {
            const smokeGrad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
            smokeGrad.addColorStop(0, `rgba(100, 90, 80, ${s.opacity * s.life})`);
            smokeGrad.addColorStop(0.6, `rgba(80, 70, 60, ${s.opacity * s.life * 0.4})`);
            smokeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = smokeGrad;
            ctx.fillRect(s.x - s.size, s.y - s.size, s.size * 2, s.size * 2);
        }

        // ─── OUTER GLOW ───
        const glowRadius = 90 + b * 130;
        const glow = ctx.createRadialGradient(x, y - 30 * scale, 0, x, y - 30 * scale, glowRadius);
        glow.addColorStop(0, `rgba(${this.currentColor[0]}, ${this.currentColor[1]}, ${this.currentColor[2]}, ${0.18 * b})`);
        glow.addColorStop(0.3, `rgba(${this.currentColor[0]}, ${this.currentColor[1]}, ${this.currentColor[2]}, ${0.08 * b})`);
        glow.addColorStop(0.6, `rgba(${Math.floor(this.currentColor[0] * 0.6)}, ${Math.floor(this.currentColor[1] * 0.4)}, ${Math.floor(this.currentColor[2] * 0.3)}, ${0.03 * b})`);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - glowRadius, y - 30 * scale - glowRadius, glowRadius * 2, glowRadius * 2);

        // ─── FLAME BODY (layered bezier curves) ───
        const layers = [
            { widthMul: 1.0, heightMul: 1.0, alpha: 0.85, colorShift: 0 },
            { widthMul: 0.75, heightMul: 1.15, alpha: 0.7, colorShift: 25 },
            { widthMul: 0.5, heightMul: 1.0, alpha: 0.6, colorShift: 50 },
            { widthMul: 0.25, heightMul: 0.85, alpha: 0.5, colorShift: 80 },
        ];

        for (const layer of layers) {
            const w = (18 + b * 16) * layer.widthMul;
            const h = (55 + b * 45) * scale * layer.heightMul;
            const tipWobble = Math.sin(this.time * 6 + layer.colorShift) * 3.5 * scale;
            const sideWobble = Math.sin(this.time * 4 + layer.colorShift * 0.5) * 1.5;

            ctx.beginPath();
            ctx.moveTo(x - w, y);
            ctx.bezierCurveTo(
                x - w * 0.8 + sideWobble, y - h * 0.3,
                x - w * 0.3 + tipWobble, y - h * 0.7,
                x + tipWobble, y - h
            );
            ctx.bezierCurveTo(
                x + w * 0.3 + tipWobble, y - h * 0.7,
                x + w * 0.8 - sideWobble, y - h * 0.3,
                x + w, y
            );
            ctx.closePath();

            const r = Math.min(255, this.currentColor[0] + layer.colorShift);
            const g = Math.min(255, this.currentColor[1] + layer.colorShift * 0.5);
            const bl = Math.min(255, this.currentColor[2]);

            // Use gradient for each layer
            const layerGrad = ctx.createLinearGradient(x, y, x, y - h);
            layerGrad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, ${layer.alpha * b})`);
            layerGrad.addColorStop(0.6, `rgba(${Math.min(255, r + 30)}, ${Math.min(255, g + 20)}, ${bl}, ${layer.alpha * b * 0.8})`);
            layerGrad.addColorStop(1, `rgba(${Math.min(255, r + 60)}, ${Math.min(255, g + 40)}, ${Math.min(255, bl + 20)}, ${layer.alpha * b * 0.3})`);
            ctx.fillStyle = layerGrad;
            ctx.fill();
        }

        // ─── FLASH OVERLAY ───
        if (this.flashTimer > 0) {
            const flashAlpha = this.flashTimer / 0.3 * 0.6;
            const flashGlow = ctx.createRadialGradient(x, y - 30 * scale, 0, x, y - 30 * scale, 120);
            flashGlow.addColorStop(0, `rgba(255, 255, 220, ${flashAlpha})`);
            flashGlow.addColorStop(0.4, `rgba(255, 240, 180, ${flashAlpha * 0.4})`);
            flashGlow.addColorStop(1, `rgba(255, 220, 150, 0)`);
            ctx.fillStyle = flashGlow;
            ctx.fillRect(x - 120, y - 150, 240, 240);
        }

        // ─── CANDLE / STONE PEDESTAL ───
        // Upper column
        const stoneGrad = ctx.createLinearGradient(x - 10, y, x + 10, y + 14);
        stoneGrad.addColorStop(0, `rgba(90, 80, 70, 0.9)`);
        stoneGrad.addColorStop(0.5, `rgba(70, 62, 55, 0.9)`);
        stoneGrad.addColorStop(1, `rgba(55, 48, 42, 0.9)`);
        ctx.fillStyle = stoneGrad;
        ctx.fillRect(x - 9, y, 18, 14);

        // Base plate
        const baseGrad = ctx.createLinearGradient(x - 16, y + 12, x + 16, y + 20);
        baseGrad.addColorStop(0, 'rgba(75, 65, 55, 0.9)');
        baseGrad.addColorStop(0.5, 'rgba(60, 52, 45, 0.95)');
        baseGrad.addColorStop(1, 'rgba(50, 42, 35, 0.9)');
        ctx.fillStyle = baseGrad;
        ctx.fillRect(x - 16, y + 12, 32, 8);

        // Decorative lines on pedestal
        ctx.strokeStyle = `rgba(${this.currentColor[0]}, ${this.currentColor[1]}, ${this.currentColor[2]}, ${0.15 * b})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x - 14, y + 13);
        ctx.lineTo(x + 14, y + 13);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 14, y + 18);
        ctx.lineTo(x + 14, y + 18);
        ctx.stroke();

        // ─── SPARKS (on hit) ───
        for (const s of this.sparks) {
            const sparkAlpha = s.life;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, ${200 + Math.floor(55 * s.life)}, ${100 + Math.floor(100 * s.life)}, ${sparkAlpha})`;
            ctx.fill();

            // Spark glow
            const sGlow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 4);
            sGlow.addColorStop(0, `rgba(255, 220, 120, ${sparkAlpha * 0.3})`);
            sGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = sGlow;
            ctx.fillRect(s.x - s.size * 4, s.y - s.size * 4, s.size * 8, s.size * 8);
        }

        // ─── PARTICLES (embers) — with varied colors ───
        for (const p of this.particles) {
            const alpha = p.life * b;
            let pr, pg, pb;
            if (p.type === 'hot') {
                // White-yellow core
                pr = 255;
                pg = Math.min(255, 240 + Math.floor(p.life * 15));
                pb = Math.min(255, 180 + Math.floor(p.life * 40));
            } else {
                // Orange ember
                pr = Math.min(255, this.currentColor[0] + 40);
                pg = Math.min(255, this.currentColor[1] + 20);
                pb = this.currentColor[2];
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;
            ctx.fill();

            // Glow halo for bigger embers
            if (p.size > 2) {
                const eGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
                eGlow.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, ${alpha * 0.2})`);
                eGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = eGlow;
                ctx.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6);
            }
        }

        ctx.restore();
    }
}
