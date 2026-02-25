// ============================================================
// RHYTHM PULSE — Game Engine (Laptop Canvas Display)
// Co-op rhythm game: squat on the beat to open paths
// ============================================================

class RhythmPulseGame {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.lastTime = 0;

        // Beat config
        this.BPM = 80;
        this.beatInterval = 60000 / this.BPM;
        this.beatStartTime = 0;
        this.beatCount = 0;
        this.lastBeatTime = 0;

        // Player states
        this.players = {
            1: { lastSquatTime: 0, quality: 'wait', combo: 0 },
            2: { lastSquatTime: 0, quality: 'wait', combo: 0 }
        };

        // Path / world
        this.scrollX = 0;
        this.scrollSpeed = 60;
        this.pathSegments = [];
        this.levelLength = 6000;

        // Visual state
        this.pulseIntensity = 0;
        this.worldHue = 270; // purple base
        this.backgroundParticles = [];
        this.burstParticles = [];
        this.stars = [];

        // Scoring
        this.score = 0;
        this.totalBeats = 0;
        this.hitsOnBeat = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.timer = 90;
        this.gameOver = false;

        // Audio
        this.audioCtx = null;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.W = this.canvas.width;
        this.H = this.canvas.height;
    }

    generateLevel() {
        // Stars
        this.stars = [];
        for (let i = 0; i < 150; i++) {
            this.stars.push({
                x: Math.random() * this.levelLength * 1.5,
                y: Math.random() * this.H,
                size: Math.random() * 2.5 + 0.5,
                brightness: Math.random() * 0.5 + 0.2,
                twinkleSpeed: Math.random() * 3 + 1
            });
        }

        // Path segments (gates that open on beat)
        this.pathSegments = [];
        const segmentSpacing = this.scrollSpeed * (this.beatInterval / 1000) * 2; // every 2 beats
        for (let x = 300; x < this.levelLength - 200; x += segmentSpacing) {
            this.pathSegments.push({
                x: x,
                width: 60,
                openAmount: 0, // 0 = closed, 1 = fully open
                targetOpen: 0,
                gateHeight: 120 + Math.random() * 80, // how tall the gate is
                color: `hsl(${270 + Math.random() * 60}, 80%, 60%)`
            });
        }

        // Background particles
        this.backgroundParticles = [];
        for (let i = 0; i < 40; i++) {
            this.backgroundParticles.push({
                x: Math.random() * this.W,
                y: Math.random() * this.H,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.5) * 20,
                size: 2 + Math.random() * 3,
                hue: 270 + Math.random() * 60,
                alpha: 0.1 + Math.random() * 0.2
            });
        }
    }

    onPlayerSquat(playerNum, quality, combo, timestamp) {
        const p = this.players[playerNum];
        if (!p) return;
        p.lastSquatTime = Date.now();
        p.quality = quality;
        p.combo = combo;

        // Check if both players hit near a beat
        const otherNum = playerNum === 1 ? 2 : 1;
        const other = this.players[otherNum];
        const bothRecent = (Date.now() - other.lastSquatTime) < 500;

        if (quality === 'perfect' || quality === 'good') {
            this.hitsOnBeat++;
            const points = quality === 'perfect' ? 150 : 80;
            const syncBonus = bothRecent ? 1.5 : 1;
            this.score += points * syncBonus;

            if (bothRecent) {
                this.combo++;
                this.maxCombo = Math.max(this.maxCombo, this.combo);
            }

            // Open nearby gates
            const currentX = this.scrollX + this.W * 0.3;
            for (const seg of this.pathSegments) {
                const dist = Math.abs(seg.x - currentX);
                if (dist < 300) {
                    seg.targetOpen = bothRecent ? 1 : 0.6;
                }
            }

            // Pulse
            this.pulseIntensity = bothRecent ? 1.0 : 0.6;

            // Burst particles
            for (let i = 0; i < (bothRecent ? 20 : 8); i++) {
                this.burstParticles.push({
                    x: this.W * 0.5 + (Math.random() - 0.5) * 200,
                    y: this.H * 0.5 + (Math.random() - 0.5) * 200,
                    vx: (Math.random() - 0.5) * 400,
                    vy: (Math.random() - 0.5) * 400,
                    life: 0.5 + Math.random() * 0.5,
                    maxLife: 0.5 + Math.random() * 0.5,
                    hue: bothRecent ? 120 + Math.random() * 30 : 270 + Math.random() * 60,
                    size: 3 + Math.random() * 5
                });
            }
        } else {
            this.combo = 0;
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.beatStartTime = performance.now();
        this.generateLevel();
        this.initAudio();
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    initAudio() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { }
    }

    playBeat() {
        if (!this.audioCtx) return;
        try {
            // Bass drum
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.frequency.setValueAtTime(80, this.audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, this.audioCtx.currentTime + 0.1);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.15);
            osc.start(this.audioCtx.currentTime);
            osc.stop(this.audioCtx.currentTime + 0.15);

            // Hi-hat on off-beats
            if (this.beatCount % 2 === 1) {
                const noise = this.audioCtx.createOscillator();
                const hg = this.audioCtx.createGain();
                noise.connect(hg);
                hg.connect(this.audioCtx.destination);
                noise.frequency.value = 8000;
                noise.type = 'square';
                hg.gain.setValueAtTime(0.03, this.audioCtx.currentTime);
                hg.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.05);
                noise.start(this.audioCtx.currentTime);
                noise.stop(this.audioCtx.currentTime + 0.05);
            }
        } catch (e) { }
    }

    loop(timestamp) {
        if (!this.running) return;
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;

        // Beat check
        const elapsed = timestamp - this.beatStartTime;
        const currentBeat = Math.floor(elapsed / this.beatInterval);
        if (currentBeat > this.beatCount) {
            this.beatCount = currentBeat;
            this.totalBeats++;
            this.playBeat();
            this.pulseIntensity = Math.max(this.pulseIntensity, 0.3);
        }

        this.update(dt);
        this.render(timestamp);
        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        if (this.gameOver) return;

        this.timer -= dt;
        if (this.timer <= 0) {
            this.timer = 0;
            this.gameOver = true;
            return;
        }

        // Scroll
        this.scrollX += this.scrollSpeed * dt;
        if (this.scrollX >= this.levelLength) {
            this.gameOver = true;
            return;
        }

        // Pulse decay
        this.pulseIntensity *= 0.93;

        // Gate animation
        for (const seg of this.pathSegments) {
            seg.openAmount += (seg.targetOpen - seg.openAmount) * 3 * dt;
            seg.targetOpen *= 0.98; // slowly close
        }

        // Burst particles
        for (let i = this.burstParticles.length - 1; i >= 0; i--) {
            const p = this.burstParticles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.life -= dt;
            if (p.life <= 0) this.burstParticles.splice(i, 1);
        }

        // Background particles
        for (const p of this.backgroundParticles) {
            p.x += p.vx * dt + this.pulseIntensity * (Math.random() - 0.5) * 5;
            p.y += p.vy * dt + this.pulseIntensity * (Math.random() - 0.5) * 5;
            if (p.x < 0) p.x = this.W;
            if (p.x > this.W) p.x = 0;
            if (p.y < 0) p.y = this.H;
            if (p.y > this.H) p.y = 0;
        }
    }

    render(timestamp) {
        const ctx = this.ctx;
        const W = this.W;
        const H = this.H;
        const now = timestamp / 1000;

        // Background with pulse
        const pulseHue = 270 + this.pulseIntensity * 30;
        const bgLight = 4 + this.pulseIntensity * 6;
        ctx.fillStyle = `hsl(${pulseHue}, 30%, ${bgLight}%)`;
        ctx.fillRect(0, 0, W, H);

        // Radial pulse glow
        if (this.pulseIntensity > 0.05) {
            const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
            const alpha = this.pulseIntensity * 0.2;
            grad.addColorStop(0, `hsla(${pulseHue + 60}, 80%, 50%, ${alpha})`);
            grad.addColorStop(1, `hsla(${pulseHue}, 50%, 20%, 0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
        }

        // Stars
        for (const s of this.stars) {
            const sx = (s.x - this.scrollX * 0.2) % (W * 1.5);
            if (sx < -5 || sx > W + 5) continue;
            const twinkle = 0.5 + 0.5 * Math.sin(now * s.twinkleSpeed);
            const bright = s.brightness * twinkle + this.pulseIntensity * 0.3;
            ctx.fillStyle = `rgba(200, 180, 255, ${bright})`;
            ctx.beginPath();
            ctx.arc(sx, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Background particles
        for (const p of this.backgroundParticles) {
            ctx.fillStyle = `hsla(${p.hue + this.pulseIntensity * 60}, 80%, 60%, ${p.alpha + this.pulseIntensity * 0.15})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 + this.pulseIntensity * 0.5), 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw path floor
        const floorY = H * 0.7;
        const pathGrad = ctx.createLinearGradient(0, floorY, 0, H);
        pathGrad.addColorStop(0, `hsla(${pulseHue}, 50%, 20%, 0.5)`);
        pathGrad.addColorStop(1, `hsla(${pulseHue}, 30%, 8%, 0.8)`);
        ctx.fillStyle = pathGrad;
        ctx.fillRect(0, floorY, W, H - floorY);

        // Path line
        ctx.strokeStyle = `hsla(${pulseHue}, 80%, 60%, ${0.3 + this.pulseIntensity * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, floorY);
        ctx.lineTo(W, floorY);
        ctx.stroke();

        // Energy path (scrolling)
        const energyGrad = ctx.createLinearGradient(0, 0, W, 0);
        const energyAlpha = 0.1 + this.pulseIntensity * 0.3;
        energyGrad.addColorStop(0, `hsla(${pulseHue + 60}, 80%, 60%, 0)`);
        energyGrad.addColorStop(0.3, `hsla(${pulseHue + 60}, 80%, 60%, ${energyAlpha})`);
        energyGrad.addColorStop(0.7, `hsla(${pulseHue + 60}, 80%, 60%, ${energyAlpha})`);
        energyGrad.addColorStop(1, `hsla(${pulseHue + 60}, 80%, 60%, 0)`);
        ctx.fillStyle = energyGrad;
        ctx.fillRect(0, floorY - 3, W, 6);

        // Draw gate segments
        for (const seg of this.pathSegments) {
            const sx = seg.x - this.scrollX;
            if (sx < -100 || sx > W + 100) continue;

            const gateH = seg.gateHeight;
            const gapSize = gateH * seg.openAmount;
            const topBottom = floorY - gateH / 2;
            const topTopGate = topBottom + (gateH - gapSize) / 2;
            const bottomTopGate = topBottom + (gateH + gapSize) / 2;

            // Top gate
            ctx.fillStyle = `hsla(${270 + seg.openAmount * 80}, 70%, ${30 + seg.openAmount * 30}%, ${0.6 - seg.openAmount * 0.3})`;
            ctx.fillRect(sx - seg.width / 2, topBottom, seg.width, topTopGate - topBottom);

            // Bottom gate
            ctx.fillRect(sx - seg.width / 2, bottomTopGate, seg.width, (topBottom + gateH) - bottomTopGate);

            // Gate glow when open
            if (seg.openAmount > 0.3) {
                ctx.shadowColor = `hsl(120, 80%, 50%)`;
                ctx.shadowBlur = seg.openAmount * 25;
                ctx.strokeStyle = `hsla(120, 80%, 60%, ${seg.openAmount * 0.5})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(sx, topTopGate);
                ctx.lineTo(sx, bottomTopGate);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }

        // Energy orb traveling along path
        const orbX = W * 0.3;
        const orbY = floorY;
        const orbPulse = 1 + this.pulseIntensity * 0.4;
        const orbR = 8 * orbPulse;

        const orbGlow = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, orbR * 4);
        orbGlow.addColorStop(0, `hsla(${pulseHue + 90}, 80%, 70%, 0.4)`);
        orbGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = orbGlow;
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbR * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsl(${pulseHue + 90}, 80%, 70%)`;
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbR, 0, Math.PI * 2);
        ctx.fill();

        // Burst particles
        for (const p of this.burstParticles) {
            const alpha = p.life / p.maxLife;
            ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }

        // Player indicators
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🧑', W * 0.35, floorY - 30);
        ctx.fillText('🧑', W * 0.65, floorY - 30);

        ctx.font = "7px 'Press Start 2P'";
        ctx.fillStyle = '#00e5ff';
        ctx.fillText('P1', W * 0.35, floorY - 10);
        ctx.fillStyle = '#ff00e5';
        ctx.fillText('P2', W * 0.65, floorY - 10);

        // Player feedback bubbles
        for (const [num, p] of Object.entries(this.players)) {
            const age = Date.now() - p.lastSquatTime;
            if (age < 1000 && p.quality !== 'wait') {
                const alpha = Math.max(0, 1 - age / 1000);
                const px = num === '1' ? W * 0.35 : W * 0.65;
                const py = floorY - 50 - (age / 1000) * 20;

                ctx.globalAlpha = alpha;
                ctx.font = "8px 'Press Start 2P'";
                ctx.fillStyle = p.quality === 'perfect' ? '#00ff88' : p.quality === 'good' ? '#ffdd00' : '#ff3355';
                ctx.fillText(
                    p.quality === 'perfect' ? '⭐ PERFECT' : p.quality === 'good' ? '👍 GOOD' : '❌ MISS',
                    px, py
                );
                ctx.globalAlpha = 1;
            }
        }

        // Beat ring visualization at center
        const beatProgress = ((timestamp - this.beatStartTime) % this.beatInterval) / this.beatInterval;
        const ringRadius = 40 + beatProgress * 30;
        const ringAlpha = (1 - beatProgress) * 0.3;
        ctx.strokeStyle = `hsla(${pulseHue}, 80%, 60%, ${ringAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W / 2, floorY - 100, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Beat dot
        ctx.fillStyle = `hsla(${pulseHue}, 80%, 70%, ${0.5 + (1 - beatProgress) * 0.5})`;
        ctx.beginPath();
        ctx.arc(W / 2, floorY - 100, 6 + (1 - beatProgress) * 4, 0, Math.PI * 2);
        ctx.fill();

        // HUD
        this.renderHUD(ctx, now);

        if (this.gameOver) this.renderGameOver(ctx);
    }

    renderHUD(ctx, now) {
        const W = this.W;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, W, 56);

        ctx.font = "10px 'Press Start 2P'";
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ff00e5';
        ctx.fillText(`SCORE: ${Math.round(this.score)}`, 20, 25);

        ctx.fillStyle = '#ffdd00';
        ctx.fillText(`COMBO: ${this.combo}`, 20, 42);

        ctx.textAlign = 'right';
        ctx.fillStyle = this.timer < 15 ? '#ff3355' : '#ffdd00';
        ctx.font = "12px 'Press Start 2P'";
        const mins = Math.floor(this.timer / 60);
        const secs = Math.floor(this.timer % 60);
        ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, W - 20, 25);

        // BPM display
        ctx.font = "8px 'Press Start 2P'";
        ctx.fillStyle = '#8888aa';
        ctx.fillText(`${this.BPM} BPM`, W - 20, 42);

        // Accuracy
        const accuracy = this.totalBeats > 0 ? Math.round((this.hitsOnBeat / this.totalBeats) * 100) : 0;
        ctx.textAlign = 'center';
        ctx.font = "8px 'Press Start 2P'";
        ctx.fillStyle = accuracy > 70 ? '#00ff88' : accuracy > 40 ? '#ffdd00' : '#ff3355';
        ctx.fillText(`ACCURACY: ${accuracy}%`, W / 2, 42);

        // Progress
        const progress = Math.min(1, this.scrollX / this.levelLength);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(20, this.H - 14, W - 40, 4);
        ctx.fillStyle = 'rgba(255, 0, 229, 0.5)';
        ctx.fillRect(20, this.H - 14, (W - 40) * progress, 4);
    }

    renderGameOver(ctx) {
        const W = this.W;
        const H = this.H;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.font = "18px 'Press Start 2P'";
        ctx.fillStyle = '#ff00e5';
        ctx.shadowColor = '#ff00e5';
        ctx.shadowBlur = 20;
        ctx.fillText('RHYTHM COMPLETE!', W / 2, H / 2 - 80);
        ctx.shadowBlur = 0;

        ctx.font = "14px 'Press Start 2P'";
        ctx.fillStyle = '#ffdd00';
        ctx.fillText(`SCORE: ${Math.round(this.score)}`, W / 2, H / 2 - 30);

        ctx.font = "9px 'Press Start 2P'";
        ctx.fillStyle = '#8888aa';
        const accuracy = this.totalBeats > 0 ? Math.round((this.hitsOnBeat / this.totalBeats) * 100) : 0;
        ctx.fillText(`Accuracy: ${accuracy}%`, W / 2, H / 2 + 10);
        ctx.fillText(`Max Combo: ${this.maxCombo}`, W / 2, H / 2 + 35);

        const grade = accuracy > 85 ? 'S' : accuracy > 70 ? 'A' : accuracy > 50 ? 'B' : 'C';
        const gradeColors = { S: '#ff00e5', A: '#00ff88', B: '#ffdd00', C: '#ff3355' };
        ctx.font = "40px 'Press Start 2P'";
        ctx.fillStyle = gradeColors[grade];
        ctx.shadowColor = gradeColors[grade];
        ctx.shadowBlur = 30;
        ctx.fillText(grade, W / 2, H / 2 + 100);
        ctx.shadowBlur = 0;

        ctx.font = "8px 'Press Start 2P'";
        ctx.fillStyle = '#555570';
        ctx.fillText('Return to lobby to play again', W / 2, H / 2 + 140);
    }
}
