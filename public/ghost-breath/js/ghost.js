// ============================================
// Ghost of the Breath Temple — Ghost Entity
// AI antagonist + visual distortion effects
// Enhanced with afterglow, tendrils, fog creep
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

        // Afterglow trail
        this.trailPositions = [];     // {x, y, alpha}
        this.trailMaxLength = 12;

        // Tendrils reaching toward flame
        this.tendrils = [];
        this.tendrilTimer = 0;

        // Fog particles (edge fog)
        this.fogParticles = [];

        // Pattern shifting (Level 4)
        this.patternQueue = [];
        this.currentPatternIdx = 0;
        this.beatsInCurrentPattern = 0;
        this.shiftTimer = 0;
        this.shiftInterval = 10;     // seconds between shifts
        this.onPatternShift = null;  // callback(newPattern, name)

        // Particles (ghost wisps)
        this.wisps = [];

        // Mouth animation
        this.mouthOpen = 0;          // 0 = closed, 1 = fully open

        // Flame tracking position (set by game)
        this.flameX = 0;
        this.flameY = 0;
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }

    setFlamePosition(x, y) {
        this.flameX = x;
        this.flameY = y;
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

        // Mouth opens wider with presence
        const targetMouth = this.presence > 0.3 ? Math.min(1, (this.presence - 0.3) * 2) : 0;
        this.mouthOpen += (targetMouth - this.mouthOpen) * dt * 3;

        // ─── Afterglow trail ───
        if (this.presence > 0.1) {
            const gx = this.x + Math.sin(this.time * 1.2) * 15 * this.presence;
            const gy = this.y + Math.cos(this.time * 0.8) * 8 * this.presence;
            this.trailPositions.push({ x: gx, y: gy, alpha: this.presence * 0.4 });
            if (this.trailPositions.length > this.trailMaxLength) {
                this.trailPositions.shift();
            }
        } else {
            // Fade out trail
            for (let i = this.trailPositions.length - 1; i >= 0; i--) {
                this.trailPositions[i].alpha -= dt * 2;
                if (this.trailPositions[i].alpha <= 0) this.trailPositions.splice(i, 1);
            }
        }

        // ─── Tendrils toward flame ───
        this.tendrilTimer += dt;
        if (this.presence > 0.5 && this.tendrilTimer > 0.3) {
            this.tendrilTimer = 0;
            const gx = this.x + Math.sin(this.time * 1.2) * 15 * this.presence;
            const gy = this.y + Math.cos(this.time * 0.8) * 8 * this.presence;
            this.tendrils.push({
                sx: gx + (Math.random() - 0.5) * 30,
                sy: gy + 20,
                progress: 0,
                speed: 0.4 + Math.random() * 0.4,
                wobble: Math.random() * Math.PI * 2,
                alpha: this.presence * 0.4,
                width: 1 + Math.random() * 2
            });
            if (this.tendrils.length > 8) this.tendrils.shift();
        }
        for (let i = this.tendrils.length - 1; i >= 0; i--) {
            const t = this.tendrils[i];
            t.progress += t.speed * dt;
            t.alpha -= dt * 0.3;
            if (t.progress >= 1 || t.alpha <= 0) {
                this.tendrils.splice(i, 1);
            }
        }

        // ─── Edge fog ───
        if (this.presence > 0.4 && this.fogParticles.length < 30) {
            if (Math.random() < this.presence * 0.4) {
                const side = Math.random() < 0.5 ? 0 : 1; // left or right
                this.fogParticles.push({
                    x: side === 0 ? -10 : 10, // will be offset from edge
                    side: side,
                    y: Math.random(),          // normalized 0-1
                    vx: (side === 0 ? 1 : -1) * (5 + Math.random() * 15),
                    life: 1.0,
                    decay: 0.2 + Math.random() * 0.3,
                    size: 20 + Math.random() * 40
                });
            }
        }
        for (let i = this.fogParticles.length - 1; i >= 0; i--) {
            const f = this.fogParticles[i];
            f.x += f.vx * dt;
            f.life -= f.decay * dt;
            if (f.life <= 0) this.fogParticles.splice(i, 1);
        }

        // Ghost wisps
        if (this.presence > 0.2 && this.wisps.length < 25) {
            if (Math.random() < this.presence * 0.4) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 30 + Math.random() * 60;
                const gx = this.x + Math.sin(this.time * 1.2) * 15 * this.presence;
                const gy = this.y + Math.cos(this.time * 0.8) * 8 * this.presence;
                // Varied colors: purple, green, cyan-tinted
                const colorType = Math.random();
                let r, g, b;
                if (colorType < 0.5) { r = 120; g = 80; b = 180; }      // purple
                else if (colorType < 0.8) { r = 80; g = 200; b = 120; }  // eerie green
                else { r = 100; g = 150; b = 220; }                       // cold blue

                this.wisps.push({
                    x: gx + Math.cos(angle) * dist,
                    y: gy + Math.sin(angle) * dist,
                    vx: (Math.random() - 0.5) * 25,
                    vy: -10 - Math.random() * 35,
                    life: 1.0,
                    decay: 0.4 + Math.random() * 0.6,
                    size: 2 + Math.random() * 5,
                    r, g, b,
                    // Trail positions for wisp
                    trail: []
                });
            }
        }

        for (let i = this.wisps.length - 1; i >= 0; i--) {
            const w = this.wisps[i];
            // Store trail
            w.trail.push({ x: w.x, y: w.y });
            if (w.trail.length > 5) w.trail.shift();

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
        const gx = this.x + Math.sin(this.time * 1.2) * 15 * alpha;
        const gy = this.y + Math.cos(this.time * 0.8) * 8 * alpha;
        const bodyScale = 0.5 + alpha * 0.5;

        // ─── EDGE FOG CREEP ───
        for (const f of this.fogParticles) {
            const fx = f.side === 0 ? f.x : canvasWidth + f.x;
            const fy = f.y * canvasHeight;
            const fogGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, f.size);
            fogGrad.addColorStop(0, `rgba(60, 20, 100, ${f.life * alpha * 0.25})`);
            fogGrad.addColorStop(0.5, `rgba(40, 15, 80, ${f.life * alpha * 0.12})`);
            fogGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = fogGrad;
            ctx.fillRect(fx - f.size, fy - f.size, f.size * 2, f.size * 2);
        }

        // ─── SCREEN DISTORTION OVERLAY ───
        if (this.distortionAmount > 0.1) {
            const distAlpha = this.distortionAmount * 0.12;
            ctx.fillStyle = `rgba(80, 20, 120, ${distAlpha})`;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);

            // Scan lines effect with chromatic shift
            ctx.strokeStyle = `rgba(100, 40, 150, ${this.distortionAmount * 0.06})`;
            ctx.lineWidth = 1;
            const step = 3 + Math.floor((1 - this.distortionAmount) * 3);
            for (let y = 0; y < canvasHeight; y += step) {
                const wobble = Math.sin(y * 0.05 + this.time * 5) * this.distortionAmount * 3;
                ctx.beginPath();
                ctx.moveTo(wobble, y);
                ctx.lineTo(canvasWidth + wobble, y);
                ctx.stroke();
            }
        }

        // ─── AFTERGLOW TRAIL ───
        for (let i = 0; i < this.trailPositions.length; i++) {
            const tp = this.trailPositions[i];
            const trailScale = (i / this.trailPositions.length) * bodyScale;
            const trailAlpha = tp.alpha * (i / this.trailPositions.length) * 0.6;
            if (trailAlpha < 0.01) continue;

            const trailGrad = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, 40 * trailScale);
            trailGrad.addColorStop(0, `rgba(120, 60, 180, ${trailAlpha})`);
            trailGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = trailGrad;
            ctx.fillRect(tp.x - 50, tp.y - 50, 100, 100);
        }

        // ─── GHOST SHROUD ───
        const ghostGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 90 * bodyScale);
        ghostGrad.addColorStop(0, `rgba(140, 80, 200, ${alpha * 0.3})`);
        ghostGrad.addColorStop(0.3, `rgba(100, 50, 160, ${alpha * 0.15})`);
        ghostGrad.addColorStop(0.7, `rgba(60, 30, 120, ${alpha * 0.06})`);
        ghostGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = ghostGrad;
        ctx.fillRect(gx - 100, gy - 100, 200, 200);

        // ─── GHOST BODY — hooded shape ───
        ctx.beginPath();
        ctx.moveTo(gx, gy - 42 * bodyScale);
        ctx.bezierCurveTo(
            gx - 32 * bodyScale, gy - 38 * bodyScale,
            gx - 38 * bodyScale, gy - 5 * bodyScale,
            gx - 28 * bodyScale, gy + 32 * bodyScale
        );
        // Wavy bottom
        for (let i = 0; i < 6; i++) {
            const wx = gx - 28 * bodyScale + (i * 11 * bodyScale);
            const wy = gy + 32 * bodyScale + Math.sin(this.time * 4 + i * 1.2) * 6 * bodyScale;
            ctx.lineTo(wx, wy);
        }
        ctx.bezierCurveTo(
            gx + 38 * bodyScale, gy - 5 * bodyScale,
            gx + 32 * bodyScale, gy - 38 * bodyScale,
            gx, gy - 42 * bodyScale
        );
        ctx.closePath();

        // Gradient fill for body
        const bodyGrad = ctx.createLinearGradient(gx, gy - 42 * bodyScale, gx, gy + 35 * bodyScale);
        bodyGrad.addColorStop(0, `rgba(80, 30, 130, ${alpha * 0.7})`);
        bodyGrad.addColorStop(0.5, `rgba(60, 20, 100, ${alpha * 0.6})`);
        bodyGrad.addColorStop(1, `rgba(40, 10, 80, ${alpha * 0.3})`);
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // Subtle inner glow edge
        ctx.strokeStyle = `rgba(140, 80, 220, ${alpha * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // ─── EYES (track flame) ───
        const eyeY = gy - 8 * bodyScale;
        const eyeSpacing = 10 * bodyScale;
        const eyeSize = 4.5 * bodyScale;
        const eg = this.eyeGlow * alpha;

        // Eye direction — look toward flame
        const lookAngle = Math.atan2(this.flameY - eyeY, this.flameX - gx);
        const lookOffset = 1.5 * bodyScale;
        const lookX = Math.cos(lookAngle) * lookOffset;
        const lookY = Math.sin(lookAngle) * lookOffset;

        // Left eye outer
        ctx.beginPath();
        ctx.arc(gx - eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 255, 180, ${eg})`;
        ctx.fill();
        // Left eye pupil
        ctx.beginPath();
        ctx.arc(gx - eyeSpacing + lookX, eyeY + lookY, eyeSize * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${eg})`;
        ctx.fill();

        // Right eye outer
        ctx.beginPath();
        ctx.arc(gx + eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 255, 180, ${eg})`;
        ctx.fill();
        // Right eye pupil
        ctx.beginPath();
        ctx.arc(gx + eyeSpacing + lookX, eyeY + lookY, eyeSize * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${eg})`;
        ctx.fill();

        // Eye glow halo (stronger)
        const eyeHalo = ctx.createRadialGradient(gx, eyeY, 0, gx, eyeY, 30 * bodyScale);
        eyeHalo.addColorStop(0, `rgba(100, 255, 100, ${eg * 0.25})`);
        eyeHalo.addColorStop(0.5, `rgba(80, 200, 80, ${eg * 0.08})`);
        eyeHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = eyeHalo;
        ctx.fillRect(gx - 40, eyeY - 40, 80, 80);

        // ─── MOUTH ───
        if (this.mouthOpen > 0.05) {
            const mouthY = eyeY + 12 * bodyScale;
            const mouthW = 6 * bodyScale * this.mouthOpen;
            const mouthH = 4 * bodyScale * this.mouthOpen;
            ctx.beginPath();
            ctx.ellipse(gx, mouthY, mouthW, mouthH, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(20, 5, 40, ${alpha * 0.8})`;
            ctx.fill();
            // Dark void inner
            ctx.beginPath();
            ctx.ellipse(gx, mouthY, mouthW * 0.5, mouthH * 0.5, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.6})`;
            ctx.fill();
        }

        // ─── TENDRILS toward flame ───
        for (const t of this.tendrils) {
            if (t.alpha < 0.01) continue;
            const p = t.progress;
            // Bezier from ghost to flame
            const mx = (t.sx + this.flameX) / 2 + Math.sin(this.time * 3 + t.wobble) * 40;
            const my = (t.sy + this.flameY) / 2;

            ctx.beginPath();
            ctx.moveTo(t.sx, t.sy);

            // Draw tendril as segments
            const steps = 12;
            for (let s = 1; s <= steps; s++) {
                const st = (s / steps) * p;
                const px = t.sx + (this.flameX - t.sx) * st;
                const py = t.sy + (this.flameY - t.sy) * st;
                const wobX = Math.sin(st * Math.PI * 3 + this.time * 4 + t.wobble) * 15 * (1 - st);
                const wobY = Math.cos(st * Math.PI * 2 + this.time * 3 + t.wobble) * 8;
                ctx.lineTo(px + wobX, py + wobY);
            }

            ctx.strokeStyle = `rgba(120, 60, 180, ${t.alpha})`;
            ctx.lineWidth = t.width;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Glow on tendril tip
            const tipX = t.sx + (this.flameX - t.sx) * p;
            const tipY = t.sy + (this.flameY - t.sy) * p;
            const tipGlow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 8);
            tipGlow.addColorStop(0, `rgba(160, 80, 220, ${t.alpha * 0.5})`);
            tipGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = tipGlow;
            ctx.fillRect(tipX - 10, tipY - 10, 20, 20);
        }

        // ─── WISPS (with trails) ───
        for (const w of this.wisps) {
            // Draw trail
            if (w.trail.length > 1) {
                ctx.beginPath();
                ctx.moveTo(w.trail[0].x, w.trail[0].y);
                for (let i = 1; i < w.trail.length; i++) {
                    ctx.lineTo(w.trail[i].x, w.trail[i].y);
                }
                ctx.lineTo(w.x, w.y);
                ctx.strokeStyle = `rgba(${w.r}, ${w.g}, ${w.b}, ${w.life * alpha * 0.2})`;
                ctx.lineWidth = w.size * 0.5;
                ctx.lineCap = 'round';
                ctx.stroke();
            }

            // Draw wisp body
            ctx.beginPath();
            ctx.arc(w.x, w.y, w.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${w.r}, ${w.g}, ${w.b}, ${w.life * alpha * 0.6})`;
            ctx.fill();

            // Wisp glow
            const wGlow = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.size * 3);
            wGlow.addColorStop(0, `rgba(${w.r}, ${w.g}, ${w.b}, ${w.life * alpha * 0.15})`);
            wGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = wGlow;
            ctx.fillRect(w.x - w.size * 3, w.y - w.size * 3, w.size * 6, w.size * 6);
        }

        ctx.restore();
    }
}
