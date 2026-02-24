// ============================================================
// CPR TRAINER — Game Display (Canvas Rendering Engine)
// Real-time vitals, patient visualization, scoring, feedback
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── Responsive Canvas ───────────────────────────────────────
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ── Fonts ───────────────────────────────────────────────────
const FONT_MAIN = '"Inter", sans-serif';
const FONT_MONO = '"JetBrains Mono", monospace';

// ── Color Palette ───────────────────────────────────────────
const COLORS = {
    bg: '#0a0a0f',
    bgGrad1: '#0f0f1a',
    bgGrad2: '#1a0a1a',
    panel: 'rgba(20, 20, 35, 0.85)',
    panelBorder: 'rgba(100, 100, 255, 0.15)',
    text: '#e0e0f0',
    textDim: '#8888aa',
    accent: '#e74c6f',     // CPR red-pink
    accentGlow: '#ff4d7a',
    perfect: '#4ade80',
    good: '#60a5fa',
    warning: '#fbbf24',
    bad: '#ef4444',
    heartRed: '#ff2d55',
    heartGlow: 'rgba(255, 45, 85, 0.3)',
    green: '#22c55e',
    blue: '#3b82f6',
    bpmZoneGood: 'rgba(34, 197, 94, 0.2)',
    depthZoneGood: 'rgba(34, 197, 94, 0.2)',
};

// ── WebSocket ───────────────────────────────────────────────
let ws = null;
let state = null;
let qrCodeImg = null;
let mobileURL = '';

function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}/display`);

    ws.onopen = () => console.log('[WS] Display connected');

    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'qrCode') {
            const img = new Image();
            img.onload = () => { qrCodeImg = img; };
            img.src = msg.url;
            mobileURL = msg.mobileURL;
        }
        if (msg.type === 'gameState') {
            state = msg;
        }
    };

    ws.onclose = () => {
        console.log('[WS] Display disconnected — reconnecting...');
        setTimeout(connectWS, 2000);
    };
}
connectWS();

// ── Keyboard Controls ───────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && ws && ws.readyState === 1) {
        e.preventDefault();
        ws.send(JSON.stringify({ type: 'simCompression' }));
    }
    if (e.code === 'Enter' && ws && ws.readyState === 1) {
        if (state && state.phase === 'lobby') {
            ws.send(JSON.stringify({ type: 'startTutorial' }));
        } else if (state && state.phase === 'tutorial') {
            ws.send(JSON.stringify({ type: 'skipTutorial' }));
        }
    }
});

// ── Animation State ─────────────────────────────────────────
let animTime = 0;
let lastFrame = performance.now();
let heartScale = 1.0;
let chestOffset = 0;          // current chest compression visual offset
let targetChestOffset = 0;
let feedbackPopups = [];       // { text, type, x, y, alpha, vy }
let comboScale = 1.0;
let pulsePhase = 0;
let waveformData = [];

// ── Helper Drawing Functions ────────────────────────────────

function drawRoundedRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function drawGlassPanel(x, y, w, h, r = 16) {
    // Glassmorphism panel
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = COLORS.panel;
    ctx.fill();
    ctx.strokeStyle = COLORS.panelBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

function drawText(text, x, y, { size = 16, color = COLORS.text, align = 'left', font = FONT_MAIN, weight = '400', maxWidth } = {}) {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (maxWidth) {
        ctx.fillText(text, x, y, maxWidth);
    } else {
        ctx.fillText(text, x, y);
    }
}

function lerpColor(a, b, t) {
    // Simple hex lerp — not used for complex blends
    return t > 0.5 ? b : a;
}

// ── Draw Heart Icon ─────────────────────────────────────────
function drawHeart(cx, cy, size, color = COLORS.heartRed) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(size / 30, size / 30);

    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-15, -10, -28, 2, -15, 15);
    ctx.lineTo(0, 28);
    ctx.lineTo(15, 15);
    ctx.bezierCurveTo(28, 2, 15, -10, 0, 8);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();

    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
}

// ── Draw Patient ────────────────────────────────────────────
function drawPatient(cx, cy, scale, compressionOffset) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Surface / bed
    ctx.fillStyle = '#2a2a40';
    drawRoundedRect(-160, 40, 320, 20, 8, '#2a2a40', '#3a3a55');

    // Body outline (side-view lying down)
    ctx.save();
    ctx.translate(0, compressionOffset * 0.5);

    // Legs
    ctx.fillStyle = '#3a3a60';
    drawRoundedRect(60, 5, 100, 25, 8, '#3a3a60');

    // Torso
    const torsoGrad = ctx.createLinearGradient(-80, -10, -80, 35);
    torsoGrad.addColorStop(0, '#4a4a70');
    torsoGrad.addColorStop(1, '#3a3a60');
    drawRoundedRect(-80, -10 + compressionOffset, 140, 45, 12, torsoGrad);

    // Chest compression zone highlight
    const zoneAlpha = 0.3 + 0.2 * Math.sin(pulsePhase * 3);
    ctx.fillStyle = `rgba(231, 76, 111, ${zoneAlpha})`;
    ctx.beginPath();
    ctx.ellipse(-10, 10 + compressionOffset, 28, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Compression indicator (hands)
    if (Math.abs(compressionOffset) > 1) {
        ctx.fillStyle = '#f0c0a0';
        ctx.beginPath();
        ctx.ellipse(-10, -15 + compressionOffset * 0.3, 20, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d4a088';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Arms
        ctx.strokeStyle = '#f0c0a0';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-25, -35);
        ctx.lineTo(-18, -15 + compressionOffset * 0.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(5, -35);
        ctx.lineTo(-2, -15 + compressionOffset * 0.3);
        ctx.stroke();
    }

    // Head
    ctx.fillStyle = '#f0c0a0';
    ctx.beginPath();
    ctx.ellipse(-110, 10, 22, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.restore();
}

// ── Draw BPM Gauge ──────────────────────────────────────────
function drawBPMGauge(x, y, w, h, bpm) {
    drawGlassPanel(x, y, w, h);

    const pad = 16;
    const innerX = x + pad;
    const innerY = y + pad;
    const innerW = w - 2 * pad;

    // Title
    drawText('RATE', innerX, innerY + 8, { size: 11, color: COLORS.textDim, weight: '600' });

    // BPM value
    const bpmColor = (bpm >= 100 && bpm <= 120) ? COLORS.perfect : (bpm >= 80 && bpm <= 140) ? COLORS.warning : COLORS.bad;
    drawText(bpm > 0 ? `${bpm}` : '--', innerX + innerW / 2, innerY + 42, { size: 42, color: bpmColor, align: 'center', weight: '900', font: FONT_MONO });
    drawText('BPM', innerX + innerW / 2, innerY + 68, { size: 12, color: COLORS.textDim, align: 'center', weight: '600' });

    // Target zone bar
    const barY = innerY + 88;
    const barH = 10;

    // Background bar
    drawRoundedRect(innerX, barY, innerW, barH, 5, '#1e1e30');

    // Target zone (green zone)
    const minBarBPM = 60;
    const maxBarBPM = 160;
    const range = maxBarBPM - minBarBPM;
    const goodStart = ((100 - minBarBPM) / range) * innerW;
    const goodEnd = ((120 - minBarBPM) / range) * innerW;
    drawRoundedRect(innerX + goodStart, barY, goodEnd - goodStart, barH, 3, COLORS.bpmZoneGood);

    // Green zone border
    ctx.strokeStyle = COLORS.green + '60';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(innerX + goodStart, barY, goodEnd - goodStart, barH, 3);
    ctx.stroke();

    // Current BPM marker
    if (bpm > 0) {
        const markerX = innerX + Math.max(0, Math.min(innerW, ((bpm - minBarBPM) / range) * innerW));
        ctx.fillStyle = bpmColor;
        ctx.beginPath();
        ctx.moveTo(markerX, barY - 4);
        ctx.lineTo(markerX - 5, barY - 10);
        ctx.lineTo(markerX + 5, barY - 10);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = bpmColor;
        ctx.beginPath();
        ctx.arc(markerX, barY + barH / 2, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Labels
    drawText('60', innerX, barY + barH + 12, { size: 9, color: COLORS.textDim });
    drawText('100-120', innerX + (goodStart + goodEnd) / 2, barY + barH + 12, { size: 9, color: COLORS.green, align: 'center' });
    drawText('160', innerX + innerW, barY + barH + 12, { size: 9, color: COLORS.textDim, align: 'right' });
}

// ── Draw Depth Gauge ────────────────────────────────────────
function drawDepthGauge(x, y, w, h, depth) {
    drawGlassPanel(x, y, w, h);

    const pad = 16;
    const innerX = x + pad;
    const innerY = y + pad;
    const innerW = w - 2 * pad;

    // Title
    drawText('DEPTH', innerX, innerY + 8, { size: 11, color: COLORS.textDim, weight: '600' });

    // Depth value
    const depthColor = (depth >= 5.0 && depth <= 6.0) ? COLORS.perfect : (depth >= 3.5 && depth <= 7.0) ? COLORS.warning : depth > 0 ? COLORS.bad : COLORS.textDim;
    drawText(depth > 0 ? `${depth.toFixed(1)}` : '--', innerX + innerW / 2, innerY + 42, { size: 42, color: depthColor, align: 'center', weight: '900', font: FONT_MONO });
    drawText('cm', innerX + innerW / 2, innerY + 68, { size: 12, color: COLORS.textDim, align: 'center', weight: '600' });

    // Vertical depth gauge
    const gaugeX = innerX + innerW - 20;
    const gaugeY = innerY + 10;
    const gaugeH = h - 2 * pad - 25;
    const gaugeW = 12;

    // Background
    drawRoundedRect(gaugeX, gaugeY, gaugeW, gaugeH, 6, '#1e1e30');

    // Green zone (5-6 cm mapped to gauge)
    const maxDepthGauge = 8;
    const greenTopFrac = 5.0 / maxDepthGauge;
    const greenBotFrac = 6.0 / maxDepthGauge;
    const greenTop = gaugeY + greenTopFrac * gaugeH;
    const greenBot = gaugeY + greenBotFrac * gaugeH;
    drawRoundedRect(gaugeX, greenTop, gaugeW, greenBot - greenTop, 3, COLORS.depthZoneGood);

    // Current depth fill
    if (depth > 0) {
        const fillH = Math.min(gaugeH, (depth / maxDepthGauge) * gaugeH);
        drawRoundedRect(gaugeX + 2, gaugeY + 2, gaugeW - 4, fillH, 4, depthColor + '80');
    }

    // Zone labels
    drawText('5cm', gaugeX - 5, greenTop, { size: 8, color: COLORS.green, align: 'right' });
    drawText('6cm', gaugeX - 5, greenBot, { size: 8, color: COLORS.green, align: 'right' });
}

// ── Draw Recoil Gauge ───────────────────────────────────────
function drawRecoilGauge(x, y, w, h, recoilPct) {
    drawGlassPanel(x, y, w, h);

    const pad = 16;
    const innerX = x + pad;
    const innerY = y + pad;
    const innerW = w - 2 * pad;

    drawText('RECOIL', innerX, innerY + 8, { size: 11, color: COLORS.textDim, weight: '600' });

    const recoilColor = recoilPct >= 95 ? COLORS.perfect : recoilPct >= 80 ? COLORS.good : recoilPct >= 50 ? COLORS.warning : recoilPct > 0 ? COLORS.bad : COLORS.textDim;
    drawText(recoilPct > 0 ? `${recoilPct}%` : '--%', innerX + innerW / 2, innerY + 38, { size: 32, color: recoilColor, align: 'center', weight: '900', font: FONT_MONO });

    // Circular gauge
    const arcCx = innerX + innerW / 2;
    const arcCy = innerY + 72;
    const arcR = 22;

    // BG arc
    ctx.beginPath();
    ctx.arc(arcCx, arcCy, arcR, Math.PI * 0.8, Math.PI * 2.2);
    ctx.strokeStyle = '#1e1e30';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Fill arc
    if (recoilPct > 0) {
        const fillAngle = Math.PI * 0.8 + (recoilPct / 100) * Math.PI * 1.4;
        ctx.beginPath();
        ctx.arc(arcCx, arcCy, arcR, Math.PI * 0.8, fillAngle);
        ctx.strokeStyle = recoilColor;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    drawText('Full release ≥ 95%', innerX + innerW / 2, arcCy + arcR + 14, { size: 9, color: COLORS.textDim, align: 'center' });
}

// ── Draw Score Panel ────────────────────────────────────────
function drawScorePanel(x, y, w, h, scoring) {
    drawGlassPanel(x, y, w, h);

    const pad = 16;
    const innerX = x + pad;
    const innerY = y + pad;
    const innerW = w - 2 * pad;

    // Score number
    const gradeColors = { 'A': COLORS.perfect, 'B': COLORS.good, 'C': COLORS.warning, 'D': COLORS.bad, 'F': COLORS.bad, '-': COLORS.textDim };
    const gradeColor = gradeColors[scoring.grade] || COLORS.textDim;

    drawText('SCORE', innerX, innerY + 8, { size: 11, color: COLORS.textDim, weight: '600' });

    // Big score
    drawText(`${scoring.score}`, innerX + innerW / 2, innerY + 48, { size: 50, color: gradeColor, align: 'center', weight: '900', font: FONT_MONO });

    // Grade
    drawText(scoring.grade, innerX + innerW - 5, innerY + 15, { size: 28, color: gradeColor, align: 'right', weight: '900' });

    // Sub-scores
    const barStartY = innerY + 80;
    const barHeight = 6;
    const barGap = 22;
    const labels = [
        { name: 'Rate', value: scoring.rateScore, color: COLORS.blue },
        { name: 'Depth', value: scoring.depthScore, color: COLORS.accent },
        { name: 'Recoil', value: scoring.recoilScore, color: COLORS.perfect },
        { name: 'Consistency', value: scoring.consistencyScore, color: COLORS.warning },
    ];

    labels.forEach((l, i) => {
        const by = barStartY + i * barGap;
        drawText(l.name, innerX, by - 2, { size: 10, color: COLORS.textDim });
        drawText(`${l.value}%`, innerX + innerW, by - 2, { size: 10, color: l.color, align: 'right', font: FONT_MONO, weight: '700' });
        drawRoundedRect(innerX, by + 8, innerW, barHeight, 3, '#1e1e30');
        const fillW = (l.value / 100) * innerW;
        if (fillW > 0) drawRoundedRect(innerX, by + 8, fillW, barHeight, 3, l.color);
    });

    // Combo
    if (scoring.combo >= 3) {
        const comboY = barStartY + labels.length * barGap + 10;
        drawText(`🔥 ${scoring.combo}x COMBO`, innerX + innerW / 2, comboY, { size: 16, color: COLORS.warning, align: 'center', weight: '700' });
    }
}

// ── Draw Waveform ───────────────────────────────────────────
function drawWaveform(x, y, w, h, waveform) {
    drawGlassPanel(x, y, w, h);

    const pad = 12;
    const innerX = x + pad;
    const innerY = y + pad;
    const innerW = w - 2 * pad;
    const innerH = h - 2 * pad - 14;

    drawText('COMPRESSION TIMELINE', innerX, innerY + 4, { size: 10, color: COLORS.textDim, weight: '600' });

    const chartY = innerY + 18;
    const chartH = innerH - 10;

    // Grid lines
    ctx.strokeStyle = '#1e1e30';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const gy = chartY + (i / 4) * chartH;
        ctx.beginPath();
        ctx.moveTo(innerX, gy);
        ctx.lineTo(innerX + innerW, gy);
        ctx.stroke();
    }

    // Target depth zone
    const maxDepth = 8;
    const zoneTop = chartY + (5.0 / maxDepth) * chartH;
    const zoneBot = chartY + (6.0 / maxDepth) * chartH;
    ctx.fillStyle = COLORS.depthZoneGood;
    ctx.fillRect(innerX, zoneTop, innerW, zoneBot - zoneTop);

    // Draw waveform bars
    if (waveform && waveform.length > 0) {
        const barW = Math.max(4, (innerW / 30) - 2);
        const gap = innerW / 30;

        waveform.forEach((point, i) => {
            const bx = innerX + i * gap;
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

    // Labels
    drawText('0cm', innerX + innerW + 5, chartY + chartH, { size: 8, color: COLORS.textDim });
    drawText('8cm', innerX + innerW + 5, chartY, { size: 8, color: COLORS.textDim });
    drawText('5-6', innerX + innerW + 5, (zoneTop + zoneBot) / 2, { size: 8, color: COLORS.green });
}

// ── Draw Feedback ───────────────────────────────────────────
function drawFeedback(cx, cy, feedback, feedbackType) {
    if (!feedback) return;

    const typeColors = {
        perfect: COLORS.perfect,
        good: COLORS.good,
        warning: COLORS.warning,
        bad: COLORS.bad,
        neutral: COLORS.textDim,
    };

    const color = typeColors[feedbackType] || COLORS.text;

    // Glow background
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    drawText(feedback, cx, cy, { size: 32, color, align: 'center', weight: '900' });
    ctx.shadowBlur = 0;
    ctx.restore();
}

// ── Draw Lobby Screen ───────────────────────────────────────
function drawLobby() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Background gradient
    const grad = ctx.createRadialGradient(cx, cy, 100, cx, cy, canvas.width * 0.7);
    grad.addColorStop(0, '#1a0a20');
    grad.addColorStop(1, COLORS.bg);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title
    drawHeart(cx, cy - 200, 35, COLORS.heartRed);
    drawText('CPR TRAINER', cx, cy - 150, { size: 48, color: COLORS.accent, align: 'center', weight: '900' });
    drawText('Learn to Save a Life', cx, cy - 115, { size: 18, color: COLORS.textDim, align: 'center', weight: '400' });

    // QR Code
    if (qrCodeImg) {
        const qrSize = 180;
        const qrX = cx - qrSize / 2;
        const qrY = cy - 70;

        // QR background
        drawRoundedRect(qrX - 15, qrY - 15, qrSize + 30, qrSize + 30, 16, 'white');
        ctx.drawImage(qrCodeImg, qrX, qrY, qrSize, qrSize);

        drawText('📱 Scan with your phone', cx, qrY + qrSize + 35, { size: 16, color: COLORS.text, align: 'center', weight: '600' });
        drawText(mobileURL, cx, qrY + qrSize + 58, { size: 12, color: COLORS.textDim, align: 'center', font: FONT_MONO });
    } else {
        drawText('Waiting for server...', cx, cy, { size: 18, color: COLORS.textDim, align: 'center' });
    }

    // Status
    const connected = state && state.player && state.player.connected;
    const statusText = connected ? '✅ Phone Connected — Press ENTER to start' : '⏳ Waiting for phone to connect...';
    const statusColor = connected ? COLORS.perfect : COLORS.warning;
    drawText(statusText, cx, canvas.height - 60, { size: 16, color: statusColor, align: 'center', weight: '600' });

    // Help
    drawText('Press SPACE to simulate compressions (keyboard testing)', cx, canvas.height - 30, { size: 12, color: COLORS.textDim, align: 'center' });
}

// ── Draw Tutorial Screen ────────────────────────────────────
function drawTutorial() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // BG
    const grad = ctx.createRadialGradient(cx, cy, 50, cx, cy, canvas.width * 0.6);
    grad.addColorStop(0, '#150a1f');
    grad.addColorStop(1, COLORS.bg);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawText('HOW TO PLAY', cx, 60, { size: 36, color: COLORS.accent, align: 'center', weight: '900' });

    // Steps
    const steps = [
        { icon: '📱', title: 'Place Phone Face-Down', desc: 'Put your phone on a pillow or cushion, screen facing down.' },
        { icon: '🤲', title: 'Position Your Hands', desc: 'Place the heel of one hand on top of the phone. Interlock fingers.' },
        { icon: '💪', title: 'Push Hard & Fast', desc: 'Compress 5-6 cm deep at 100-120 BPM (like "Stayin\' Alive" beat).' },
        { icon: '🔄', title: 'Allow Full Recoil', desc: 'Let the chest (phone) come all the way back up between pushes.' },
    ];

    const cardW = 260;
    const cardH = 120;
    const gap = 20;
    const totalW = steps.length * cardW + (steps.length - 1) * gap;
    const startX = cx - totalW / 2;
    const cardY = cy - 40;

    steps.forEach((step, i) => {
        const sx = startX + i * (cardW + gap);
        drawGlassPanel(sx, cardY, cardW, cardH);
        drawText(step.icon, sx + cardW / 2, cardY + 25, { size: 30, align: 'center' });
        drawText(step.title, sx + cardW / 2, cardY + 55, { size: 14, color: COLORS.text, align: 'center', weight: '700' });
        drawText(step.desc, sx + cardW / 2, cardY + 80, { size: 11, color: COLORS.textDim, align: 'center', maxWidth: cardW - 30 });
        // Step number
        drawText(`${i + 1}`, sx + 16, cardY + 16, { size: 12, color: COLORS.accent, weight: '900' });
    });

    // Target zones
    const infoY = cardY + cardH + 50;
    drawGlassPanel(cx - 300, infoY, 600, 80, 12);
    drawText('🎯 TARGET: 100-120 BPM  •  5-6 cm depth  •  Full chest recoil', cx, infoY + 25, { size: 15, color: COLORS.perfect, align: 'center', weight: '600' });
    drawText('Based on American Heart Association (AHA) CPR Guidelines', cx, infoY + 52, { size: 12, color: COLORS.textDim, align: 'center' });

    // Start prompt
    const blink = Math.sin(animTime * 4) > 0;
    if (blink) {
        drawText('Press ENTER or tap START on phone to begin', cx, canvas.height - 50, { size: 16, color: COLORS.warning, align: 'center', weight: '600' });
    }
}

// ── Draw Countdown ──────────────────────────────────────────
function drawCountdown() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const num = state ? state.countdownTimer : 3;
    const scale = 1 + 0.3 * Math.sin(animTime * 8);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    drawText(`${num}`, 0, 0, { size: 120, color: COLORS.accent, align: 'center', weight: '900', font: FONT_MONO });
    ctx.restore();

    drawText('GET READY!', cx, cy + 100, { size: 24, color: COLORS.textDim, align: 'center', weight: '700' });
    drawText('Place phone face-down and prepare to compress', cx, cy + 135, { size: 14, color: COLORS.textDim, align: 'center' });
}

// ── Draw Playing State ──────────────────────────────────────
function drawPlaying() {
    const W = canvas.width;
    const H = canvas.height;

    // Background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, COLORS.bgGrad1);
    grad.addColorStop(1, COLORS.bgGrad2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle animated grid
    ctx.strokeStyle = 'rgba(100, 100, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
    }
    for (let y = 0; y < H; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    if (!state) return;

    // Layout
    const panelW = 180;
    const panelGap = 12;
    const leftX = 20;
    const rightX = W - panelW - 20;

    // ── TOP BAR: Timer + Compressions ───────────────────────
    drawGlassPanel(leftX, 15, W - 40, 55, 12);

    // Timer
    const timerColor = state.timer <= 10 ? COLORS.bad : state.timer <= 20 ? COLORS.warning : COLORS.text;
    const mins = Math.floor(state.timer / 60);
    const secs = state.timer % 60;
    drawText(`⏱ ${mins}:${secs.toString().padStart(2, '0')}`, leftX + 20, 42, { size: 24, color: timerColor, weight: '700', font: FONT_MONO });

    // Total compressions
    drawText(`${state.compressions.total}`, W / 2, 42, { size: 28, color: COLORS.accent, align: 'center', weight: '900', font: FONT_MONO });
    drawText('COMPRESSIONS', W / 2, 58, { size: 9, color: COLORS.textDim, align: 'center', weight: '600' });

    // Heart animation
    const heartBeat = state.compressions.currentBPM > 0 ? 1 + 0.15 * Math.sin(animTime * (state.compressions.currentBPM / 60) * Math.PI * 2) : 1;
    drawHeart(rightX - 20, 42, 18 * heartBeat, COLORS.heartRed);

    // ── LEFT COLUMN: Gauges ─────────────────────────────────
    const gaugeStartY = 85;
    drawBPMGauge(leftX, gaugeStartY, panelW, 130, state.compressions.currentBPM);
    drawDepthGauge(leftX, gaugeStartY + 145, panelW, 130, state.compressions.currentDepth);
    drawRecoilGauge(leftX, gaugeStartY + 290, panelW, 120, state.compressions.currentRecoil);

    // ── CENTER: Patient + Feedback ──────────────────────────
    const centerX = W / 2;
    const centerY = H / 2 - 20;

    // Smooth chest compression animation
    targetChestOffset = state.compressions.currentDepth > 0 ? Math.min(20, state.compressions.currentDepth * 3) : 0;
    chestOffset += (targetChestOffset - chestOffset) * 0.3;

    drawPatient(centerX, centerY, 1.8, chestOffset);

    // Feedback text above patient
    drawFeedback(centerX, centerY - 100, state.feedback, state.feedbackType);

    // ── RIGHT COLUMN: Scores ────────────────────────────────
    drawScorePanel(rightX, gaugeStartY, panelW, 220, state.scoring);

    // ── BOTTOM: Waveform ────────────────────────────────────
    const waveY = H - 130;
    const waveW = W - panelW * 2 - 80;
    drawWaveform(leftX + panelW + panelGap, waveY, waveW, 115, state.waveform);
}

// ── Draw Game Over ──────────────────────────────────────────
function drawGameOver() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // BG
    const grad = ctx.createRadialGradient(cx, cy, 50, cx, cy, canvas.width * 0.6);
    grad.addColorStop(0, '#1a0a15');
    grad.addColorStop(1, COLORS.bg);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!state) return;

    // Title
    drawText('SESSION COMPLETE', cx, 50, { size: 32, color: COLORS.accent, align: 'center', weight: '900' });

    // Grade (big)
    const gradeColors = { 'A': COLORS.perfect, 'B': COLORS.good, 'C': COLORS.warning, 'D': COLORS.bad, 'F': COLORS.bad, '-': COLORS.textDim };
    const gc = gradeColors[state.scoring.grade] || COLORS.textDim;

    ctx.save();
    ctx.shadowColor = gc;
    ctx.shadowBlur = 40;
    drawText(state.scoring.grade, cx, 140, { size: 100, color: gc, align: 'center', weight: '900' });
    ctx.shadowBlur = 0;
    ctx.restore();
    drawText(`Score: ${state.scoring.score}/100`, cx, 200, { size: 20, color: COLORS.text, align: 'center', font: FONT_MONO, weight: '700' });

    // Stats grid
    const statsY = 250;
    const statCards = [
        { label: 'Total Compressions', value: `${state.compressions.total}`, color: COLORS.accent },
        { label: 'Average BPM', value: `${state.avgBPM}`, color: (state.avgBPM >= 100 && state.avgBPM <= 120) ? COLORS.perfect : COLORS.warning },
        { label: 'Average Depth', value: `${state.avgDepth} cm`, color: (state.avgDepth >= 5 && state.avgDepth <= 6) ? COLORS.perfect : COLORS.warning },
        { label: 'Avg Recoil', value: `${state.avgRecoil}%`, color: state.avgRecoil >= 95 ? COLORS.perfect : COLORS.warning },
        { label: 'Perfect Compressions', value: `${state.scoring.perfectCount}`, color: COLORS.perfect },
        { label: 'Max Combo', value: `${state.scoring.maxCombo}x`, color: COLORS.warning },
    ];

    const cardW = 160;
    const cardH = 70;
    const cardGap = 15;
    const cols = 3;
    const totalCardW = cols * cardW + (cols - 1) * cardGap;
    const cardStartX = cx - totalCardW / 2;

    statCards.forEach((card, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const sx = cardStartX + col * (cardW + cardGap);
        const sy = statsY + row * (cardH + cardGap);

        drawGlassPanel(sx, sy, cardW, cardH, 10);
        drawText(card.value, sx + cardW / 2, sy + 25, { size: 26, color: card.color, align: 'center', weight: '900', font: FONT_MONO });
        drawText(card.label, sx + cardW / 2, sy + 52, { size: 11, color: COLORS.textDim, align: 'center' });
    });

    // Tips
    const tipsY = statsY + 2 * (cardH + cardGap) + 20;
    if (state.tips && state.tips.length > 0) {
        drawGlassPanel(cx - 350, tipsY, 700, 30 + state.tips.length * 28, 12);
        drawText('💡 TIPS FOR IMPROVEMENT', cx, tipsY + 18, { size: 13, color: COLORS.warning, align: 'center', weight: '700' });
        state.tips.forEach((tip, i) => {
            drawText(tip, cx, tipsY + 42 + i * 26, { size: 12, color: COLORS.text, align: 'center', maxWidth: 660 });
        });
    }

    // Replay
    const blinkReplay = Math.sin(animTime * 3) > 0;
    if (blinkReplay) {
        drawText('Refresh page to play again', cx, canvas.height - 40, { size: 14, color: COLORS.textDim, align: 'center' });
    }
}

// ── Main Render Loop ────────────────────────────────────────
function render(timestamp) {
    const dt = (timestamp - lastFrame) / 1000;
    lastFrame = timestamp;
    animTime += dt;
    pulsePhase += dt;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const phase = state ? state.phase : 'lobby';

    switch (phase) {
        case 'lobby':
            drawLobby();
            break;
        case 'tutorial':
            drawTutorial();
            break;
        case 'countdown':
            drawCountdown();
            break;
        case 'playing':
            drawPlaying();
            break;
        case 'gameover':
            drawGameOver();
            break;
        default:
            drawLobby();
    }

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
