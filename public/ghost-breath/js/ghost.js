// ============================================
// Ghost of the Breath Temple — Ghost Entity
// AI antagonist + visual distortion effects
// ============================================

export class Ghost {
    constructor() {
        // Position / approach
        this.presence = 0;           // 0 = gone, 1 = fully manifested
        this.targetPresence = 0;
        this.approachSpeed = 0.5;
        this.retreatSpeed = 0.4;

        // Visual
        this.x = 0;
        this.y = 0;
        this.time = 0;
        this.eyeGlow = 0;
        this.distortionAmount = 0;

        // Pattern shifting (Level 4)
        this.patternQueue = [];
        this.currentPatternIdx = 0;
        this.beatsInCurrentPattern = 0;
        this.shiftTimer = 0;
        this.shiftInterval = 10;     // seconds between shifts
        this.onPatternShift = null;  // callback(newPattern, name)

        // Particles (ghost wisps)
        this.wisps = [];
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }

    update(dt, accuracy) {
        this.time += dt;

        // Ghost appears when accuracy drops
        const shouldAppear = accuracy < 0.6;
        this.targetPresence = shouldAppear ? Math.min(1, (0.6 - accuracy) * 3) : 0;

        // Smooth presence transition
        if (this.presence < this.targetPresence) {
            this.presence += this.approachSpeed * dt;
        } else {
            this.presence -= this.retreatSpeed * dt;
        }
        this.presence = Math.max(0, Math.min(1, this.presence));

        // Eye glow pulsing
        this.eyeGlow = 0.5 + Math.sin(this.time * 3) * 0.3 + this.presence * 0.2;

        // Distortion tied to presence
        this.distortionAmount = this.presence * 0.8;

        // Ghost wisps
        if (this.presence > 0.2 && this.wisps.length < 20) {
            if (Math.random() < this.presence * 0.3) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 30 + Math.random() * 60;
                this.wisps.push({
                    x: this.x + Math.cos(angle) * dist,
                    y: this.y + Math.sin(angle) * dist,
                    vx: (Math.random() - 0.5) * 20,
                    vy: -10 - Math.random() * 30,
                    life: 1.0,
                    decay: 0.5 + Math.random() * 0.8,
                    size: 2 + Math.random() * 4
                });
            }
        }

        for (let i = this.wisps.length - 1; i >= 0; i--) {
            const w = this.wisps[i];
            w.x += w.vx * dt;
            w.y += w.vy * dt;
            w.life -= w.decay * dt;
            if (w.life <= 0) this.wisps.splice(i, 1);
        }

        // Pattern shifting (Level 4)
        if (this.patternQueue.length > 0) {
            this.shiftTimer += dt;
            if (this.shiftTimer >= this.shiftInterval) {
                this.shiftTimer = 0;
                this._shiftPattern();
            }
        }
    }

    setupPatternShifting(patterns, interval) {
        this.patternQueue = patterns;
        this.shiftInterval = interval;
        this.currentPatternIdx = 0;
        this.shiftTimer = 0;
    }

    _shiftPattern() {
        this.currentPatternIdx = (this.currentPatternIdx + 1) % this.patternQueue.length;
        const entry = this.patternQueue[this.currentPatternIdx];
        if (this.onPatternShift) {
            this.onPatternShift(entry.pattern, entry.name);
        }
    }

    getCurrentPatternName() {
        if (this.patternQueue.length === 0) return '';
        return this.patternQueue[this.currentPatternIdx].name;
    }

    draw(ctx, canvasWidth, canvasHeight) {
        if (this.presence < 0.02) return;

        ctx.save();
        const alpha = this.presence;

        // ─── SCREEN DISTORTION OVERLAY ───
        if (this.distortionAmount > 0.1) {
            const distAlpha = this.distortionAmount * 0.15;
            ctx.fillStyle = `rgba(80, 20, 120, ${distAlpha})`;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);

            // Scan lines effect
            ctx.strokeStyle = `rgba(100, 40, 150, ${this.distortionAmount * 0.08})`;
            ctx.lineWidth = 1;
            for (let y = 0; y < canvasHeight; y += 4) {
                const wobble = Math.sin(y * 0.05 + this.time * 5) * this.distortionAmount * 3;
                ctx.beginPath();
                ctx.moveTo(wobble, y);
                ctx.lineTo(canvasWidth + wobble, y);
                ctx.stroke();
            }
        }

        // ─── GHOST BODY ───
        const gx = this.x + Math.sin(this.time * 1.2) * 15 * alpha;
        const gy = this.y + Math.cos(this.time * 0.8) * 8 * alpha;
        const bodyScale = 0.5 + alpha * 0.5;

        // Ghost shroud
        const ghostGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 80 * bodyScale);
        ghostGrad.addColorStop(0, `rgba(140, 80, 200, ${alpha * 0.3})`);
        ghostGrad.addColorStop(0.4, `rgba(80, 40, 140, ${alpha * 0.15})`);
        ghostGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = ghostGrad;
        ctx.fillRect(gx - 100, gy - 100, 200, 200);

        // Ghost form — hooded shape
        ctx.beginPath();
        ctx.moveTo(gx, gy - 40 * bodyScale);
        ctx.bezierCurveTo(
            gx - 30 * bodyScale, gy - 35 * bodyScale,
            gx - 35 * bodyScale, gy,
            gx - 25 * bodyScale, gy + 30 * bodyScale
        );
        // Wavy bottom
        for (let i = 0; i < 5; i++) {
            const wx = gx - 25 * bodyScale + (i * 12.5 * bodyScale);
            const wy = gy + 30 * bodyScale + Math.sin(this.time * 4 + i) * 5 * bodyScale;
            ctx.lineTo(wx, wy);
        }
        ctx.bezierCurveTo(
            gx + 35 * bodyScale, gy,
            gx + 30 * bodyScale, gy - 35 * bodyScale,
            gx, gy - 40 * bodyScale
        );
        ctx.closePath();
        ctx.fillStyle = `rgba(60, 20, 100, ${alpha * 0.6})`;
        ctx.fill();

        // ─── EYES ───
        const eyeY = gy - 10 * bodyScale;
        const eyeSpacing = 10 * bodyScale;
        const eyeSize = 4 * bodyScale;
        const eg = this.eyeGlow * alpha;

        // Left eye
        ctx.beginPath();
        ctx.arc(gx - eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 255, 180, ${eg})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx - eyeSpacing, eyeY, eyeSize * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${eg})`;
        ctx.fill();

        // Right eye
        ctx.beginPath();
        ctx.arc(gx + eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 255, 180, ${eg})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx + eyeSpacing, eyeY, eyeSize * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${eg})`;
        ctx.fill();

        // Eye glow halo
        const eyeHalo = ctx.createRadialGradient(gx, eyeY, 0, gx, eyeY, 25 * bodyScale);
        eyeHalo.addColorStop(0, `rgba(100, 255, 100, ${eg * 0.2})`);
        eyeHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = eyeHalo;
        ctx.fillRect(gx - 30, eyeY - 30, 60, 60);

        // ─── WISPS ───
        for (const w of this.wisps) {
            ctx.beginPath();
            ctx.arc(w.x, w.y, w.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(120, 80, 180, ${w.life * alpha * 0.5})`;
            ctx.fill();
        }

        ctx.restore();
    }
}
