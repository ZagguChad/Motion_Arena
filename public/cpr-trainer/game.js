// ============================================================
// CPR TRAINER — Game Display Renderer (Canvas)
// INSANE reactive visualizations: particles, screen shake,
// patient body, ripple waves, combo fire, oxygen bubbles,
// dynamic background, ECG glow, push/release guidance
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── Colors ──────────────────────────────────────────────────
const COLORS = {
    bg: '#0a0a1a',
    surface: 'rgba(255, 255, 255, 0.04)',
    surfaceBright: 'rgba(255, 255, 255, 0.07)',
    border: 'rgba(255, 255, 255, 0.06)',
    text: '#e5e5e5',
    textDim: 'rgba(255, 255, 255, 0.35)',
    accent: '#e74c6f',
    accentGlow: 'rgba(231, 76, 111, 0.3)',
    green: '#4ade80',
    blue: '#60a5fa',
    yellow: '#fbbf24',
    red: '#ef4444',
    perfect: '#4ade80',
    good: '#60a5fa',
    warning: '#fbbf24',
    bad: '#ef4444',
};

// ── State ───────────────────────────────────────────────────
let gameState = null;
let frameCount = 0;
let lastTime = 0;
let scenarioAlpha = 0;
let prevCompressionCount = 0;

// ── Screen Shake ────────────────────────────────────────────
let shakeX = 0, shakeY = 0;
let shakeIntensity = 0;

// ── Particle System ─────────────────────────────────────────
const particles = [];
const MAX_PARTICLES = 200;

function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
        const angle = Math.random() * Math.PI * 2;
        const v = speed * (0.5 + Math.random() * 0.8);
        particles.push({
            x, y,
            vx: Math.cos(angle) * v,
            vy: Math.sin(angle) * v - 1,
            life: 1.0,
            decay: 0.015 + Math.random() * 0.02,
            size: 2 + Math.random() * 4,
            color,
            type: 'circle',
        });
    }
}

function spawnStars(x, y, count) {
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 60,
            y,
            vx: (Math.random() - 0.5) * 1.5,
            vy: -1.5 - Math.random() * 2,
            life: 1.0,
            decay: 0.008,
            size: 14 + Math.random() * 6,
            color: '#ffd700',
            type: 'star',
        });
    }
}

function spawnFireTrail(x, y) {
    for (let i = 0; i < 3 && particles.length < MAX_PARTICLES; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 20,
            y,
            vx: (Math.random() - 0.5) * 2,
            vy: -2 - Math.random() * 3,
            life: 1.0,
            decay: 0.03 + Math.random() * 0.02,
            size: 4 + Math.random() * 6,
            color: Math.random() > 0.5 ? '#ff6b2b' : '#ffcc00',
            type: 'fire',
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // gravity
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        if (p.type === 'star') {
            drawText('⭐', p.x, p.y, { size: p.size * p.life, align: 'center', baseline: 'middle' });
        } else if (p.type === 'fire') {
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            gradient.addColorStop(0, p.color);
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    ctx.globalAlpha = 1;
}

// ── Ripple System ───────────────────────────────────────────
const ripples = [];

function spawnRipple(x, y, color, maxRadius) {
    ripples.push({ x, y, radius: 5, maxRadius, color, life: 1.0 });
}

function updateRipples() {
    for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += 3;
        r.life = 1.0 - r.radius / r.maxRadius;
        if (r.life <= 0) ripples.splice(i, 1);
    }
}

function drawRipples() {
    ripples.forEach(r => {
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2 * r.life;
        ctx.globalAlpha = r.life * 0.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();
    });
    ctx.globalAlpha = 1;
}

// ── Oxygen Bubbles ──────────────────────────────────────────
const bubbles = [];

function tickBubbles() {
    if (!gameState || !gameState.patient) return;
    const oxygen = gameState.patient.oxygen;

    // Spawn bubbles based on oxygen level
    if (Math.random() < oxygen / 300) {
        bubbles.push({
            x: 40 + Math.random() * 80,
            y: H() - 20,
            vy: -0.5 - Math.random() * 1.5,
            vx: (Math.random() - 0.5) * 0.5,
            size: 3 + Math.random() * 5,
            life: 1.0,
            decay: 0.003 + Math.random() * 0.003,
            color: oxygen >= 60 ? COLORS.green : oxygen >= 30 ? COLORS.yellow : COLORS.red,
        });
    }

    for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y += b.vy;
        b.x += b.vx + Math.sin(frameCount * 0.05 + i) * 0.2;
        b.life -= b.decay;
        if (b.life <= 0 || b.y < 0) bubbles.splice(i, 1);
    }
}

function drawBubbles() {
    bubbles.forEach(b => {
        ctx.globalAlpha = b.life * 0.6;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size * b.life, 0, Math.PI * 2);
        ctx.stroke();

        // Shine
        ctx.fillStyle = b.color + '30';
        ctx.beginPath();
        ctx.arc(b.x - b.size * 0.2, b.y - b.size * 0.2, b.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

// ── Impact Ring ─────────────────────────────────────────────
let impactRing = null;

function spawnImpactRing(depth, quality) {
    const color = quality === 'perfect' ? COLORS.perfect : quality === 'good' ? COLORS.good : quality === 'bad' ? COLORS.bad : COLORS.warning;
    impactRing = { radius: 10, maxRadius: 60 + depth * 15, life: 1.0, color, depth };
}

function updateImpactRing() {
    if (!impactRing) return;
    impactRing.radius += 4;
    impactRing.life = 1.0 - impactRing.radius / impactRing.maxRadius;
    if (impactRing.life <= 0) impactRing = null;
}

// ── Resize ──────────────────────────────────────────────────
function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(dpr, dpr);
}
window.addEventListener('resize', resize);
resize();

const W = () => window.innerWidth;
const H = () => window.innerHeight;

// ── Utility Drawing ─────────────────────────────────────────
function drawText(text, x, y, opts = {}) {
    ctx.font = `${opts.weight || '600'} ${opts.size || 14}px Inter, sans-serif`;
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'top';
    ctx.fillText(text, x, y);
}

function drawGlassPanel(x, y, w, h, opts = {}) {
    ctx.fillStyle = opts.bg || COLORS.surface;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, opts.radius || 12);
    ctx.fill();
    if (opts.border !== false) {
        ctx.strokeStyle = opts.glow || COLORS.border;
        ctx.lineWidth = opts.borderWidth || 1;
        ctx.stroke();
    }
}

function drawRoundedBar(x, y, w, h, value, maxVal, color) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    const fillW = Math.max(h, (value / maxVal) * w);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.min(w, fillW), h, h / 2);
    ctx.fill();
}

// ── Update Game State ───────────────────────────────────────
function updateGameState(state) {
    gameState = state;
}
window.updateGameState = updateGameState;

// ── Detect New Compression Event ────────────────────────────
function checkCompressionEvents() {
    if (!gameState || !gameState.compressions) return;
    const count = gameState.compressions.total;
    if (count > prevCompressionCount && prevCompressionCount >= 0) {
        onNewCompression();
    }
    prevCompressionCount = count;
}

function onNewCompression() {
    const depth = gameState.compressions.currentDepth || 0;
    const events = gameState.events || [];
    const lastEvent = events.length > 0 ? events[events.length - 1] : '';
    const quality = lastEvent.includes('perfect') ? 'perfect' : lastEvent.includes('good') ? 'good' : 'bad';

    // Patient body center
    const cx = W() / 2;
    const cy = H() * 0.38;

    // Screen shake proportional to depth
    shakeIntensity = Math.min(12, depth * 1.5);

    // Particles burst from chest
    const pColor = quality === 'perfect' ? COLORS.perfect : quality === 'good' ? COLORS.good : COLORS.bad;
    spawnParticles(cx, cy, pColor, quality === 'perfect' ? 25 : 12, quality === 'perfect' ? 5 : 3);

    // Ripple from chest
    spawnRipple(cx, cy, pColor, 80 + depth * 20);

    // Impact ring
    spawnImpactRing(depth, quality);

    // Stars on perfect
    if (quality === 'perfect') {
        spawnStars(cx, cy - 40, 3);
    }

    // Combo fire
    if (gameState.scoring && gameState.scoring.combo >= 3) {
        spawnFireTrail(cx - 30, cy - 50);
        spawnFireTrail(cx + 30, cy - 50);
    }
}

// ── Dynamic Background ──────────────────────────────────────
function drawDynamicBackground() {
    if (!gameState || !gameState.patient) {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W(), H());
        return;
    }

    const p = gameState.patient;
    const oxygen = p.oxygen;
    const heartActivity = p.heartActivity;

    // Base gradient shifts with patient status
    let bgTop, bgBot;
    if (p.status === 'stable') {
        bgTop = '#080820';
        bgBot = '#0a1a2a';
    } else if (p.status === 'unstable') {
        bgTop = '#1a1008';
        bgBot = '#1a1510';
    } else {
        // Critical: pulsing red
        const pulse = Math.sin(frameCount * 0.08) * 0.5 + 0.5;
        const r = Math.floor(15 + pulse * 20);
        bgTop = `rgb(${r}, 5, 10)`;
        bgBot = `rgb(${Math.floor(r * 0.7)}, 3, 8)`;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, H());
    gradient.addColorStop(0, bgTop);
    gradient.addColorStop(1, bgBot);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W(), H());

    // Heartbeat screen pulse
    if (heartActivity > 15) {
        const heartRate = 30 + heartActivity * 0.6;
        const beatPhase = (frameCount * heartRate / 3600) % 1;
        if (beatPhase < 0.1) {
            const pulseAlpha = (1 - beatPhase / 0.1) * 0.04 * (heartActivity / 100);
            ctx.fillStyle = `rgba(231, 76, 111, ${pulseAlpha})`;
            ctx.fillRect(0, 0, W(), H());
        }
    }
}

// ── Draw: Lobby/Waiting ─────────────────────────────────────
function drawWaiting() {
    const cx = W() / 2;
    const cy = H() / 2;

    const heartScale = 1 + Math.sin(frameCount * 0.05) * 0.15;
    drawText('❤️', cx, cy - 80, { size: 60 * heartScale, align: 'center', baseline: 'middle' });
    drawText('CPR TRAINER', cx, cy - 15, { size: 34, weight: '900', color: COLORS.accent, align: 'center' });

    const dots = '.'.repeat((Math.floor(frameCount / 20) % 3) + 1);
    drawText('Waiting for player' + dots, cx, cy + 35, { size: 15, color: COLORS.textDim, align: 'center' });
    drawText('📱 Scan QR code with your phone', cx, cy + 75, { size: 13, color: COLORS.blue, align: 'center' });
}

// ── Draw: Scenario ──────────────────────────────────────────
function drawScenario() {
    const cx = W() / 2;
    const cy = H() / 2;
    scenarioAlpha = Math.min(1, scenarioAlpha + 0.025);
    ctx.globalAlpha = scenarioAlpha;

    // Red flash
    const flash = Math.sin(frameCount * 0.2) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(239, 68, 68, ${flash * 0.08})`;
    ctx.fillRect(0, 0, W(), H());

    drawText('🚨', cx, cy - 100, { size: 72, align: 'center', baseline: 'middle' });
    drawText('PATIENT COLLAPSED!', cx, cy - 25, { size: 30, weight: '900', color: COLORS.red, align: 'center' });
    drawText('Person has stopped breathing.', cx, cy + 20, { size: 16, color: COLORS.text, align: 'center' });
    drawText('📞 911 called — Ambulance dispatched!', cx, cy + 55, { size: 14, color: COLORS.yellow, align: 'center' });
    drawText('Begin CPR NOW!', cx, cy + 95, { size: 20, weight: '900', color: COLORS.green, align: 'center' });
    ctx.globalAlpha = 1;
}

// ── Draw: Countdown ─────────────────────────────────────────
function drawCountdown() {
    const cx = W() / 2;
    const cy = H() / 2;
    const count = gameState.countdownTimer;
    const scale = 1.3 + Math.sin(frameCount * 0.15) * 0.15;

    drawText(count > 0 ? count.toString() : 'GO!', cx, cy - 20, {
        size: (count > 0 ? 100 : 70) * scale, weight: '900',
        color: count > 0 ? COLORS.text : COLORS.green,
        align: 'center', baseline: 'middle'
    });

    drawText('Get ready!', cx, cy + 60, { size: 16, color: COLORS.textDim, align: 'center' });
}

// ── Draw: Animated Patient Body ─────────────────────────────
function drawPatientBody() {
    const cx = W() / 2;
    const baseY = H() * 0.32;
    const chest = gameState.chest || { position: 0 };
    const compressionOffset = chest.position * 3; // visual amplification

    // Torso outline
    const torsoW = 100;
    const torsoH = 60;
    const status = gameState.patient ? gameState.patient.status : 'critical';
    const torsoColor = status === 'stable' ? COLORS.green : status === 'unstable' ? COLORS.yellow : COLORS.red;

    // Body silhouette — compressed state
    ctx.save();
    ctx.translate(cx, baseY + compressionOffset);

    // Head
    ctx.fillStyle = torsoColor + '20';
    ctx.strokeStyle = torsoColor + '60';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -torsoH - 20, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Torso (compresses visually)
    const compressedH = torsoH - compressionOffset * 0.3;
    ctx.beginPath();
    ctx.roundRect(-torsoW / 2, -compressedH, torsoW, compressedH, 8);
    ctx.fill();
    ctx.stroke();

    // Chest marker (compression point)
    const markerPulse = Math.sin(frameCount * 0.1) * 3;
    ctx.fillStyle = torsoColor + '40';
    ctx.beginPath();
    ctx.arc(0, -compressedH / 2, 14 + markerPulse, 0, Math.PI * 2);
    ctx.fill();

    // Cross on chest
    ctx.strokeStyle = torsoColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, -compressedH / 2);
    ctx.lineTo(8, -compressedH / 2);
    ctx.moveTo(0, -compressedH / 2 - 8);
    ctx.lineTo(0, -compressedH / 2 + 8);
    ctx.stroke();

    // Arms
    ctx.strokeStyle = torsoColor + '40';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-torsoW / 2, -compressedH * 0.7);
    ctx.lineTo(-torsoW / 2 - 30, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(torsoW / 2, -compressedH * 0.7);
    ctx.lineTo(torsoW / 2 + 30, 10);
    ctx.stroke();

    ctx.restore();

    // Impact ring around compression point
    if (impactRing) {
        ctx.strokeStyle = impactRing.color;
        ctx.lineWidth = 3 * impactRing.life;
        ctx.globalAlpha = impactRing.life * 0.7;
        ctx.beginPath();
        ctx.arc(cx, baseY + compressionOffset - 30, impactRing.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Depth indicator below body
    if (chest.position > 0.5) {
        const depthColor = (chest.position >= 5 && chest.position <= 6) ? COLORS.green : chest.position < 5 ? COLORS.yellow : COLORS.red;
        drawText(`${chest.position.toFixed(1)} cm`, cx, baseY + compressionOffset + 20, {
            size: 16, weight: '900', color: depthColor, align: 'center'
        });
    }
}

// ── Draw: Push/Release Guidance ─────────────────────────────
function drawRhythmGuide() {
    if (!gameState.config || !gameState.config.showPushRelease) return;

    const phase = gameState.rhythmPhase;
    const cx = W() / 2;
    const y = H() * 0.55;

    if (phase === 'push') {
        const bounce = Math.sin(frameCount * 0.2) * 5;
        drawText('⬇ PUSH!', cx, y + bounce, {
            size: 28, weight: '900', color: COLORS.red, align: 'center'
        });
    } else {
        const bounce = Math.sin(frameCount * 0.2) * -5;
        drawText('⬆ RELEASE!', cx, y + bounce, {
            size: 28, weight: '900', color: COLORS.green, align: 'center'
        });
    }
}

// ── Draw: ECG Waveform ──────────────────────────────────────
function drawECG(x, y, w, h) {
    drawGlassPanel(x, y, w, h);
    const pad = 8;
    const ix = x + pad, iy = y + pad, iw = w - 2 * pad;
    const ih = h - 2 * pad - 12;

    drawText('ECG', ix, iy, { size: 9, color: COLORS.textDim, weight: '700' });
    const chartY = iy + 12;
    const chartH = ih;
    const midY = chartY + chartH / 2;

    const ecg = gameState.ecgData || [];
    if (ecg.length > 1) {
        const heartActivity = gameState.patient ? gameState.patient.heartActivity : 0;
        const ecgColor = heartActivity > 50 ? COLORS.green : heartActivity > 20 ? COLORS.yellow : COLORS.red;

        // Glow trail
        ctx.shadowColor = ecgColor;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = ecgColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < ecg.length; i++) {
            const px = ix + (i / ecg.length) * iw;
            const py = midY - ecg[i] * chartH * 0.4;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
    } else {
        ctx.strokeStyle = COLORS.red + '60';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ix, midY);
        ctx.lineTo(ix + iw, midY);
        ctx.stroke();
        drawText('FLATLINE', ix + iw / 2, midY - 6, { size: 10, color: COLORS.red, align: 'center', weight: '800' });
    }
}

// ── Draw: Patient Vitals Panel ──────────────────────────────
function drawPatientPanel(x, y, w, h) {
    const p = gameState.patient || { oxygen: 0, heartActivity: 0, brainTimer: 360, ambulanceTimer: 120, status: 'critical' };
    const glowColor = p.status === 'stable' ? COLORS.green + '30' : p.status === 'unstable' ? COLORS.yellow + '30' : COLORS.red + '30';
    drawGlassPanel(x, y, w, h, { glow: glowColor, borderWidth: 1.5 });

    const pad = 10;
    const ix = x + pad, iy = y + pad, iw = w - 2 * pad;

    drawText('PATIENT', ix, iy, { size: 9, color: COLORS.textDim, weight: '700' });
    const statusColors = { stable: COLORS.green, unstable: COLORS.yellow, critical: COLORS.red };
    drawText((p.status || 'UNKNOWN').toUpperCase(), ix + iw, iy, {
        size: 9, weight: '800', color: statusColors[p.status] || COLORS.textDim, align: 'right'
    });

    let rowY = iy + 20;
    const barH = 6;

    // Oxygen
    const o2Color = p.oxygen >= 60 ? COLORS.green : p.oxygen >= 30 ? COLORS.yellow : COLORS.red;
    drawText('🫁 O₂', ix, rowY, { size: 10, color: COLORS.text });
    drawText(`${Math.round(p.oxygen)}%`, ix + iw, rowY, { size: 10, weight: '800', color: o2Color, align: 'right' });
    rowY += 15;
    drawRoundedBar(ix, rowY, iw, barH, p.oxygen, 100, o2Color);
    rowY += barH + 8;

    // Heart
    const heartColor = p.heartActivity >= 50 ? COLORS.green : p.heartActivity >= 20 ? COLORS.yellow : COLORS.red;
    const heartIcon = Math.sin(frameCount * 0.15) > 0.7 ? '❤️' : '🤍';
    drawText(`${heartIcon} Heart`, ix, rowY, { size: 10, color: COLORS.text });
    drawText(`${Math.round(p.heartActivity)}%`, ix + iw, rowY, { size: 10, weight: '800', color: heartColor, align: 'right' });
    rowY += 15;
    drawRoundedBar(ix, rowY, iw, barH, p.heartActivity, 100, heartColor);
    rowY += barH + 8;

    // Brain
    const brainMins = Math.floor(p.brainTimer / 60);
    const brainSecs = Math.round(p.brainTimer % 60);
    const brainColor = p.brainTimer > 120 ? COLORS.text : p.brainTimer > 60 ? COLORS.yellow : COLORS.red;
    drawText('🧠 Brain', ix, rowY, { size: 10, color: COLORS.text });
    drawText(`${brainMins}:${brainSecs.toString().padStart(2, '0')}`, ix + iw, rowY, { size: 10, weight: '800', color: brainColor, align: 'right' });
    rowY += 15;
    drawRoundedBar(ix, rowY, iw, barH, p.brainTimer, 360, brainColor);
    rowY += barH + 8;

    // Ambulance
    const ambMins = Math.floor(p.ambulanceTimer / 60);
    const ambSecs = Math.round(p.ambulanceTimer % 60);
    const ambBounce = Math.sin(frameCount * 0.1) * 2;
    drawText('🚑', ix + ambBounce, rowY, { size: 10 });
    drawText('ETA', ix + 16, rowY, { size: 10, color: COLORS.text });
    drawText(`${ambMins}:${ambSecs.toString().padStart(2, '0')}`, ix + iw, rowY, { size: 10, weight: '800', color: COLORS.blue, align: 'right' });
}

// ── Draw: Score Panel ───────────────────────────────────────
function drawScorePanel(x, y, w, h) {
    drawGlassPanel(x, y, w, h);
    const pad = 10;
    const ix = x + pad, iy = y + pad, iw = w - 2 * pad;

    const s = gameState.scoring || {};
    const gradeColors = { 'A': COLORS.green, 'B': COLORS.blue, 'C': COLORS.yellow, 'D': COLORS.red, 'F': COLORS.red };

    drawText('SCORE', ix, iy, { size: 9, color: COLORS.textDim, weight: '700' });
    drawText(s.grade || '-', ix + iw, iy - 6, { size: 30, weight: '900', color: gradeColors[s.grade] || COLORS.textDim, align: 'right' });
    drawText(`${s.score || 0}/100`, ix + iw - 30, iy + 20, { size: 11, weight: '700', color: COLORS.accent, align: 'right' });

    let ry = iy + 36;
    const metrics = [
        { label: 'Rate', v: s.rateScore || 0, c: COLORS.blue },
        { label: 'Depth', v: s.depthScore || 0, c: COLORS.green },
        { label: 'Recoil', v: s.recoilScore || 0, c: COLORS.yellow },
        { label: 'Patient', v: s.patientScore || 0, c: COLORS.red },
    ];
    metrics.forEach(m => {
        drawText(m.label, ix, ry, { size: 9, color: COLORS.textDim });
        drawText(`${m.v}%`, ix + iw, ry, { size: 9, weight: '700', color: m.c, align: 'right' });
        ry += 12;
        drawRoundedBar(ix, ry, iw, 5, m.v, 100, m.c);
        ry += 10;
    });

    // Combo fire
    if (s.combo >= 3) {
        const fireScale = 1 + Math.sin(frameCount * 0.2) * 0.2;
        drawText(`🔥 ${s.combo}x COMBO`, ix, ry + 4, {
            size: 14 * fireScale, weight: '900', color: s.combo >= 10 ? COLORS.red : COLORS.yellow
        });
    }
}

// ── Draw: Compression Stats ─────────────────────────────────
function drawCompressionHUD(x, y, w, h) {
    drawGlassPanel(x, y, w, h);
    const pad = 10;
    const ix = x + pad, iy = y + pad, iw = w - 2 * pad;
    const c = gameState.compressions || {};

    drawText('COMPRESSIONS', ix, iy, { size: 9, color: COLORS.textDim, weight: '700' });
    drawText(String(c.total || 0), ix + iw, iy - 6, { size: 28, weight: '900', color: COLORS.accent, align: 'right' });

    let ry = iy + 30;

    // BPM
    const bpmColor = (c.currentBPM >= 100 && c.currentBPM <= 120) ? COLORS.green
        : (c.currentBPM >= 80 && c.currentBPM <= 140) ? COLORS.yellow : COLORS.red;
    drawText('BPM', ix, ry, { size: 11, color: COLORS.text });
    drawText(c.currentBPM > 0 ? `${c.currentBPM}` : '--', ix + iw, ry, {
        size: 22, weight: '900', color: c.currentBPM > 0 ? bpmColor : COLORS.textDim, align: 'right'
    });
    ry += 28;
    drawText('100-120', ix, ry, { size: 8, color: COLORS.textDim });
    ry += 14;

    // Depth
    const depthColor = (c.currentDepth >= 5 && c.currentDepth <= 6) ? COLORS.green
        : c.currentDepth >= 3 ? COLORS.yellow : COLORS.textDim;
    drawText('Depth', ix, ry, { size: 11, color: COLORS.text });
    drawText(c.currentDepth > 0 ? `${c.currentDepth.toFixed(1)} cm` : '--', ix + iw, ry, {
        size: 13, weight: '800', color: depthColor, align: 'right'
    });
    ry += 18;
    drawRoundedBar(ix, ry, iw, 7, c.currentDepth || 0, 8, depthColor);
    ry += 14;

    // Recoil
    const recoilPct = c.currentRecoil || 0;
    const recoilColor = recoilPct >= 80 ? COLORS.green : recoilPct >= 50 ? COLORS.yellow : COLORS.red;
    drawText('Recoil', ix, ry, { size: 11, color: COLORS.text });
    drawText(`${recoilPct}%`, ix + iw, ry, { size: 13, weight: '800', color: recoilColor, align: 'right' });
}

// ── Draw: Header ────────────────────────────────────────────
function drawHeader() {
    const pad = 14;
    const timer = gameState.timer || 0;
    const mins = Math.floor(timer / 60);
    const secs = timer % 60;
    const timerColor = timer <= 10 ? COLORS.red : timer <= 30 ? COLORS.yellow : COLORS.text;

    drawText(`⏱ ${mins}:${secs.toString().padStart(2, '0')}`, pad, pad, { size: 20, weight: '900', color: timerColor });

    const config = gameState.config || {};
    drawText(config.label || '', pad, pad + 22, { size: 9, weight: '700', color: COLORS.textDim });

    drawText(`Score: ${gameState.scoring ? gameState.scoring.score : 0}`, W() - pad, pad, {
        size: 13, weight: '800', color: COLORS.accent, align: 'right'
    });

    // Feedback with glow
    const fbColors = { perfect: COLORS.perfect, good: COLORS.good, warning: COLORS.warning, bad: COLORS.bad, neutral: COLORS.text };
    const fb = gameState.feedback || '';
    const fbType = gameState.feedbackType || 'neutral';
    if (fb) {
        const fbColor = fbColors[fbType] || COLORS.text;
        ctx.shadowColor = fbColor;
        ctx.shadowBlur = 15;
        drawText(fb, W() / 2, 52, { size: 22, weight: '900', color: fbColor, align: 'center' });
        ctx.shadowBlur = 0;
    }

    if (gameState.tiltWarning) {
        drawText('📐 STRAIGHTEN HANDS!', W() / 2, 80, {
            size: 13, weight: '800', color: COLORS.red, align: 'center'
        });
    }
}

// ── Draw: Compression Waveform ──────────────────────────────
function drawWaveform(x, y, w, h) {
    drawGlassPanel(x, y, w, h);
    const pad = 8;
    const ix = x + pad, iy = y + pad, iw = w - 2 * pad;
    const ih = h - 2 * pad - 12;
    drawText('TIMELINE', ix, iy, { size: 9, color: COLORS.textDim, weight: '700' });
    const chartY = iy + 12;
    const chartH = ih;
    const maxDepth = 8;

    // Green target zone
    const zoneTop = chartY + chartH - (6.0 / maxDepth) * chartH;
    const zoneBot = chartY + chartH - (5.0 / maxDepth) * chartH;
    ctx.fillStyle = 'rgba(74, 222, 128, 0.06)';
    ctx.fillRect(ix, zoneTop, iw, zoneBot - zoneTop);

    const waveform = gameState.waveform || [];
    if (waveform.length > 0) {
        const barW = Math.max(3, (iw / 30) - 2);
        const gap = iw / 30;
        waveform.forEach((point, i) => {
            const bx = ix + i * gap;
            const barH = Math.min(chartH, (point.depth / maxDepth) * chartH);
            const by = chartY + chartH - barH;
            const inZone = point.depth >= 5.0 && point.depth <= 6.0;
            const color = inZone ? COLORS.perfect : point.depth < 5.0 ? COLORS.warning : COLORS.bad;
            ctx.fillStyle = color + 'cc';
            ctx.beginPath();
            ctx.roundRect(bx, by, barW, barH, 2);
            ctx.fill();
        });
    }
}

// ── Draw: Playing State ─────────────────────────────────────
function drawPlaying() {
    // Apply screen shake
    if (shakeIntensity > 0) {
        shakeX = (Math.random() - 0.5) * shakeIntensity;
        shakeY = (Math.random() - 0.5) * shakeIntensity;
        shakeIntensity *= 0.85;
        if (shakeIntensity < 0.5) shakeIntensity = 0;
        ctx.save();
        ctx.translate(shakeX, shakeY);
    }

    drawHeader();

    // Patient body — animated center
    drawPatientBody();

    // Push/Release prompt
    drawRhythmGuide();

    // Effects layers
    drawRipples();
    drawParticles();
    drawBubbles();

    const pad = 10;
    const panelW = W() > 700 ? (W() - 30) / 2 : W() - 20;

    if (W() > 700) {
        // Wide: 2-column
        const lx = pad, rx = W() / 2 + 5;
        drawECG(lx, H() * 0.6, panelW, 80);
        drawPatientPanel(lx, H() * 0.6 + 90, panelW, 160);
        drawCompressionHUD(rx, H() * 0.6, panelW, 160);
        drawScorePanel(rx, H() * 0.6 + 170, panelW, 170);
        drawWaveform(lx, H() * 0.6 + 260, panelW, 80);
    } else {
        // Narrow: stack panels below patient
        let y = H() * 0.62;
        drawECG(pad, y, panelW, 70);
        y += 78;
        drawPatientPanel(pad, y, panelW, 145);
        y += 153;
        drawCompressionHUD(pad, y, panelW, 145);
        y += 153;
        drawScorePanel(pad, y, panelW, 145);
        y += 153;
        drawWaveform(pad, y, panelW, 70);
    }

    if (shakeIntensity > 0 || shakeX !== 0) {
        ctx.restore();
        shakeX = 0;
        shakeY = 0;
    }
}

// ── Draw: Game Over ─────────────────────────────────────────
function drawGameOver() {
    const cx = W() / 2;
    const pad = 20;
    let y = 30;

    drawText('🏁 CPR COMPLETE', cx, y, { size: 26, weight: '900', color: COLORS.text, align: 'center' });
    y += 38;

    const p = gameState.patient || {};
    drawText(p.alive ? '💚 Patient Survived!' : '💔 Patient Lost', cx, y, {
        size: 20, weight: '900', color: p.alive ? COLORS.green : COLORS.red, align: 'center'
    });
    y += 35;

    // Survival probability — big
    const sp = gameState.survivalProbability || 0;
    const spColor = sp >= 70 ? COLORS.green : sp >= 40 ? COLORS.yellow : COLORS.red;
    drawText('Survival Probability', cx, y, { size: 12, color: COLORS.textDim, align: 'center' });
    y += 18;

    ctx.shadowColor = spColor;
    ctx.shadowBlur = 20;
    drawText(`${sp}%`, cx, y, { size: 56, weight: '900', color: spColor, align: 'center' });
    ctx.shadowBlur = 0;
    y += 55;

    // Grade + Score
    const s = gameState.scoring || {};
    const gradeColors = { 'A': COLORS.green, 'B': COLORS.blue, 'C': COLORS.yellow, 'D': COLORS.red, 'F': COLORS.red };
    drawText(s.grade || '-', cx - 40, y, { size: 50, weight: '900', color: gradeColors[s.grade] || COLORS.textDim, align: 'center' });
    drawText(`${s.score || 0}/100`, cx + 40, y + 10, { size: 16, weight: '800', color: COLORS.accent, align: 'center' });
    y += 55;

    // Stats grid 
    const stats = [
        ['Compressions', gameState.compressions ? gameState.compressions.total : 0],
        ['Avg BPM', gameState.avgBPM || '--'],
        ['Avg Depth', gameState.avgDepth ? `${gameState.avgDepth} cm` : '--'],
        ['Perfect', s.perfectCount || 0],
        ['Good', s.goodCount || 0],
        ['Max Combo', s.maxCombo || 0],
    ];

    const colW = (W() - pad * 3) / 2;
    stats.forEach((st, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const sx = pad + col * (colW + pad);
        const sy = y + row * 30;
        drawGlassPanel(sx, sy, colW, 26, { radius: 8 });
        drawText(st[0], sx + 8, sy + 6, { size: 10, color: COLORS.textDim });
        drawText(String(st[1]), sx + colW - 8, sy + 6, { size: 11, weight: '800', color: COLORS.text, align: 'right' });
    });
    y += Math.ceil(stats.length / 2) * 30 + 14;

    // Tips
    const tips = gameState.tips || [];
    if (tips.length > 0) {
        drawText('💡 Tips', pad, y, { size: 12, weight: '700', color: COLORS.blue });
        y += 18;
        tips.forEach(tip => {
            drawText(tip, pad + 6, y, { size: 10, color: COLORS.text });
            y += 16;
        });
    }

    // Floating particles on game over
    if (frameCount % 10 === 0) {
        spawnParticles(Math.random() * W(), H(), spColor + '80', 1, 2);
    }
}

// ── Main Render Loop ────────────────────────────────────────
function render(time) {
    const dt = time - lastTime;
    lastTime = time;
    frameCount++;

    // Update effects
    updateParticles();
    updateRipples();
    updateImpactRing();
    tickBubbles();
    checkCompressionEvents();

    // Clear + dynamic background
    ctx.clearRect(0, 0, W(), H());
    if (gameState && (gameState.phase === 'playing' || gameState.phase === 'gameover')) {
        drawDynamicBackground();
    } else {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W(), H());
    }

    if (!gameState || gameState.phase === 'lobby') {
        drawWaiting();
    } else if (gameState.phase === 'scenario') {
        drawScenario();
    } else if (gameState.phase === 'countdown') {
        drawCountdown();
    } else if (gameState.phase === 'playing') {
        drawPlaying();
    } else if (gameState.phase === 'gameover') {
        drawGameOver();
        drawParticles();
    }

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
