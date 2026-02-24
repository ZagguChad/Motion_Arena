// ============================================================
// TOWER SIEGE — Pixel Art Sprite System
// Detailed 16-bit style character rendering via Canvas
// ============================================================

// ── Pixel drawing helper ────────────────────────────────────
function px(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, s, s);
}

function pxRow(ctx, x, y, s, colors) {
    for (let i = 0; i < colors.length; i++) {
        if (colors[i]) { ctx.fillStyle = colors[i]; ctx.fillRect(x + i * s, y, s, s); }
    }
}

// ══════════════════════════════════════════════════════════════
//  COMMANDER AZURE — Noble Knight of the Azure Dominion
// ══════════════════════════════════════════════════════════════
function drawAzure(ctx, cx, cy, scale, frame) {
    const s = 3 * scale;
    const bob = Math.sin(frame * 0.04) * 2 * scale;
    const breathe = Math.sin(frame * 0.06) * s * 0.3;
    const x = cx - 10 * s;
    const y = cy - 16 * s + bob;

    // Cape (animated sway)
    const capeWave = Math.sin(frame * 0.05) * 2 * scale;
    ctx.fillStyle = '#1a3a8e';
    ctx.beginPath();
    ctx.moveTo(x + 4 * s, y + 8 * s);
    ctx.lineTo(x + 16 * s, y + 8 * s);
    ctx.lineTo(x + 18 * s + capeWave, y + 28 * s);
    ctx.lineTo(x + 2 * s - capeWave, y + 28 * s);
    ctx.closePath();
    ctx.fill();
    // Cape inner highlight
    ctx.fillStyle = '#2b4ec0';
    ctx.beginPath();
    ctx.moveTo(x + 6 * s, y + 10 * s);
    ctx.lineTo(x + 14 * s, y + 10 * s);
    ctx.lineTo(x + 15 * s + capeWave * 0.5, y + 26 * s);
    ctx.lineTo(x + 5 * s - capeWave * 0.5, y + 26 * s);
    ctx.closePath();
    ctx.fill();

    // — Helmet plume —
    const _ = null;
    const B = '#2b3a8e', Bl = '#4361ee', Bg = '#6fa0ff', G = '#f5c542', Gd = '#c9a020';
    const W = '#e6edf3', Sk = '#e8b87a', Sd = '#c99a5a', Dk = '#1a1a2e', Gy = '#8e8e8e';
    const Sl = '#b8c8e8';

    // Helmet plume (gold feather)
    pxRow(ctx, x + 6 * s, y - 2 * s, s, [_, _, _, G, G, G]);
    pxRow(ctx, x + 6 * s, y - 1 * s, s, [_, _, G, Gd, G, G, G]);
    pxRow(ctx, x + 6 * s, y, s, [_, _, _, G, G]);

    // Helmet
    pxRow(ctx, x + 3 * s, y + 1 * s, s, [_, _, _, B, B, B, B, B, B, B]);
    pxRow(ctx, x + 3 * s, y + 2 * s, s, [_, _, B, Bl, Bl, Bl, Bl, Bl, Bl, B]);
    pxRow(ctx, x + 3 * s, y + 3 * s, s, [_, B, Bl, Bl, G, Bl, Bl, G, Bl, Bl, B]);

    // Face
    pxRow(ctx, x + 3 * s, y + 4 * s, s, [_, B, Sk, Sk, Sk, Sk, Sk, Sk, Sk, Sk, B]);
    pxRow(ctx, x + 3 * s, y + 5 * s, s, [_, _, Sk, Dk, Sk, W, Sk, Dk, Sk, Sk]);
    pxRow(ctx, x + 3 * s, y + 6 * s, s, [_, _, Sk, Sk, Sk, Sk, Sk, Sk, Sk]);
    pxRow(ctx, x + 3 * s, y + 7 * s, s, [_, _, _, Sk, Sd, Sd, Sd, Sk]);

    // Neck
    pxRow(ctx, x + 3 * s, y + 8 * s, s, [_, _, _, _, Sk, Sk, Sk]);

    // Shoulder armor + body
    pxRow(ctx, x + 1 * s, y + 9 * s, s, [_, B, Bl, G, Bl, Bl, Bl, Bl, Bl, G, Bl, B]);
    pxRow(ctx, x + 1 * s, y + 10 * s, s, [B, Bl, Bl, Bl, B, Bl, Bl, B, Bl, Bl, Bl, B]);
    pxRow(ctx, x + 1 * s, y + 11 * s, s, [_, B, B, Bl, B, Bl, Bl, B, Bl, B, B]);

    // Chest plate with emblem
    pxRow(ctx, x + 3 * s, y + 12 * s, s, [_, _, Bl, Bl, G, G, Bl, Bl]);
    pxRow(ctx, x + 3 * s, y + 13 * s, s, [_, _, Bl, G, Gd, Gd, G, Bl]);
    pxRow(ctx, x + 3 * s, y + 14 * s, s, [_, _, Bl, Bl, G, G, Bl, Bl]);

    // Belt
    pxRow(ctx, x + 3 * s, y + 15 * s, s, [_, _, Gd, G, G, G, G, Gd]);

    // Arms
    pxRow(ctx, x + 1 * s, y + 12 * s, s, [Sk, Sk]);
    pxRow(ctx, x + 1 * s, y + 13 * s, s, [Sk, Sk]);
    pxRow(ctx, x + 11 * s, y + 12 * s, s, [Sk, Sk]);
    pxRow(ctx, x + 11 * s, y + 13 * s, s, [Sk, Sk]);

    // Sword (right hand — animated glow)
    const swordGlow = Math.sin(frame * 0.08) * 0.3 + 0.7;
    ctx.globalAlpha = swordGlow;
    ctx.fillStyle = '#a0c4ff'; // blade glow
    ctx.fillRect(x + 12 * s, y + 2 * s, s, 10 * s);
    ctx.globalAlpha = 1;
    ctx.fillStyle = Gy; // blade
    ctx.fillRect(x + 12 * s, y + 3 * s, s, 9 * s);
    ctx.fillStyle = Sl;
    ctx.fillRect(x + 12 * s, y + 4 * s, s, 2 * s); // highlight
    ctx.fillStyle = G; // crossguard
    ctx.fillRect(x + 11 * s, y + 12 * s, 3 * s, s);
    ctx.fillStyle = '#6b4e2e'; // grip
    ctx.fillRect(x + 12 * s, y + 13 * s, s, 2 * s);
    ctx.fillStyle = G; // pommel
    ctx.fillRect(x + 12 * s, y + 15 * s, s, s);

    // Legs
    pxRow(ctx, x + 3 * s, y + 16 * s, s, [_, _, B, Bl, _, _, Bl, B]);
    pxRow(ctx, x + 3 * s, y + 17 * s, s, [_, _, B, Bl, _, _, Bl, B]);
    pxRow(ctx, x + 3 * s, y + 18 * s, s, [_, _, B, Bl, _, _, Bl, B]);

    // Boots
    pxRow(ctx, x + 3 * s, y + 19 * s, s, [_, B, B, Bl, _, B, Bl, B]);
    pxRow(ctx, x + 3 * s, y + 20 * s, s, [B, B, B, B, _, B, B, B, B]);

    // Shield (left hand)
    ctx.fillStyle = Bl;
    ctx.fillRect(x - 1 * s, y + 9 * s, 3 * s, 6 * s);
    ctx.fillStyle = G;
    ctx.fillRect(x, y + 10 * s, s, 4 * s);
    ctx.fillRect(x - 1 * s, y + 11 * s, 3 * s, s);

    // Glow effect around character
    const glowAlpha = Math.sin(frame * 0.05) * 0.1 + 0.15;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40 * scale);
    grad.addColorStop(0, `rgba(67,97,238,${glowAlpha})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, 40 * scale, 0, Math.PI * 2); ctx.fill();
}

// ══════════════════════════════════════════════════════════════
//  GENERAL CRIMSON — Berserker Warlord of the Crimson Horde
// ══════════════════════════════════════════════════════════════
function drawCrimson(ctx, cx, cy, scale, frame) {
    const s = 3 * scale;
    const bob = Math.sin(frame * 0.04 + 1) * 2 * scale;
    const breathe = Math.sin(frame * 0.06 + 1) * s * 0.3;
    const x = cx - 10 * s;
    const y = cy - 16 * s + bob;

    const _ = null;
    const R = '#ef233c', Rd = '#8e1b2b', Rb = '#ff6b7a', G = '#f5c542', Gd = '#c9a020';
    const W = '#e6edf3', Sk = '#d4a574', Sd = '#b08050', Dk = '#1a1a2e', Gy = '#8e8e8e';
    const Or = '#ff6b35', Bk = '#2a2a2a';

    // Tattered cape (animated)
    const capeWave = Math.sin(frame * 0.06 + 0.5) * 3 * scale;
    ctx.fillStyle = '#4a0a15';
    ctx.beginPath();
    ctx.moveTo(x + 4 * s, y + 8 * s);
    ctx.lineTo(x + 16 * s, y + 8 * s);
    ctx.lineTo(x + 19 * s + capeWave, y + 30 * s);
    ctx.lineTo(x + 17 * s + capeWave * 0.7, y + 28 * s);
    ctx.lineTo(x + 15 * s + capeWave * 0.3, y + 30 * s);
    ctx.lineTo(x + 1 * s - capeWave, y + 29 * s);
    ctx.lineTo(x + 3 * s - capeWave * 0.5, y + 27 * s);
    ctx.closePath();
    ctx.fill();

    // Horns
    pxRow(ctx, x + 1 * s, y - 4 * s, s, [Gy, _, _, _, _, _, _, _, _, _, _, _, Gy]);
    pxRow(ctx, x + 1 * s, y - 3 * s, s, [_, Gy, _, _, _, _, _, _, _, _, _, Gy]);
    pxRow(ctx, x + 1 * s, y - 2 * s, s, [_, _, Gy, _, _, _, _, _, _, _, Gy]);

    // Skull helmet
    pxRow(ctx, x + 3 * s, y - 1 * s, s, [_, _, Rd, Rd, Rd, Rd, Rd, Rd]);
    pxRow(ctx, x + 3 * s, y, s, [_, Rd, Bk, R, R, R, R, Bk, Rd]);
    pxRow(ctx, x + 3 * s, y + 1 * s, s, [Rd, R, R, R, R, R, R, R, R, Rd]);
    pxRow(ctx, x + 3 * s, y + 2 * s, s, [Rd, R, Rd, R, R, R, Rd, R, R, Rd]);

    // Face (scarred, angry)
    pxRow(ctx, x + 3 * s, y + 3 * s, s, [_, Rd, Sk, Sk, Sk, Sk, Sk, Sk, Sk, Rd]);
    pxRow(ctx, x + 3 * s, y + 4 * s, s, [_, _, Sk, R, Sk, Sk, Sk, R, Sk]);
    // Scar across right eye
    ctx.fillStyle = '#8e1b2b';
    ctx.fillRect(x + 10 * s, y + 3 * s, s, 3 * s);
    pxRow(ctx, x + 3 * s, y + 5 * s, s, [_, _, Sk, Sk, Sk, Sk, Sk, Sk, Sk]);
    // Snarling mouth with fangs
    pxRow(ctx, x + 3 * s, y + 6 * s, s, [_, _, _, Dk, W, Dk, W, Dk]);

    // Neck (thick)
    pxRow(ctx, x + 3 * s, y + 7 * s, s, [_, _, _, Sk, Sk, Sk, Sk]);

    // Massive spiked shoulders + body
    pxRow(ctx, x, y + 8 * s, s, [_, Gy, Rd, R, R, R, R, R, R, R, R, Rd, Gy]);
    pxRow(ctx, x, y + 9 * s, s, [Gy, R, R, R, Rd, R, R, Rd, R, R, R, R, Gy]);
    pxRow(ctx, x, y + 10 * s, s, [_, Rd, R, R, Rd, R, R, Rd, R, R, Rd]);

    // Chest with skull emblem
    pxRow(ctx, x + 3 * s, y + 11 * s, s, [_, _, R, R, R, R, R, R]);
    pxRow(ctx, x + 3 * s, y + 12 * s, s, [_, _, R, W, W, W, W, R]);
    pxRow(ctx, x + 3 * s, y + 13 * s, s, [_, _, R, W, Dk, Dk, W, R]);
    pxRow(ctx, x + 3 * s, y + 14 * s, s, [_, _, R, _, W, W, _, R]);

    // Belt with skull buckle
    pxRow(ctx, x + 3 * s, y + 15 * s, s, [_, Bk, Gd, Gy, W, W, Gy, Gd, Bk]);

    // Arms (muscular)
    ctx.fillStyle = Sk;
    ctx.fillRect(x, y + 11 * s, 2 * s, 5 * s);
    ctx.fillRect(x + 12 * s, y + 11 * s, 2 * s, 5 * s);
    // Wrist guards
    ctx.fillStyle = Rd;
    ctx.fillRect(x, y + 14 * s, 2 * s, s);
    ctx.fillRect(x + 12 * s, y + 14 * s, 2 * s, s);

    // Battle Axe (left hand — animated swing)
    const axeSwing = Math.sin(frame * 0.07) * 3 * scale;
    ctx.save();
    ctx.translate(x - 1 * s, y + 8 * s);
    ctx.rotate(axeSwing * 0.02);
    // Axe handle
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(-s, -8 * s, s, 14 * s);
    // Axe head
    ctx.fillStyle = Gy;
    ctx.fillRect(-3 * s, -8 * s, 4 * s, 3 * s);
    ctx.fillRect(-4 * s, -7 * s, s, s);
    // Blood on axe
    ctx.fillStyle = Rd;
    ctx.fillRect(-3 * s, -6 * s, 2 * s, s);
    ctx.restore();

    // Legs (armored)
    pxRow(ctx, x + 3 * s, y + 16 * s, s, [_, _, Rd, R, _, _, R, Rd]);
    pxRow(ctx, x + 3 * s, y + 17 * s, s, [_, _, Rd, R, _, _, R, Rd]);
    pxRow(ctx, x + 3 * s, y + 18 * s, s, [_, _, Rd, R, _, _, R, Rd]);

    // Spiked boots
    pxRow(ctx, x + 3 * s, y + 19 * s, s, [_, Bk, Rd, R, _, Bk, R, Rd]);
    pxRow(ctx, x + 3 * s, y + 20 * s, s, [Bk, Bk, Rd, Rd, _, Bk, Rd, Rd, Bk]);
    // Boot spikes
    ctx.fillStyle = Gy;
    ctx.fillRect(x + 3 * s, y + 20 * s, s, s);
    ctx.fillRect(x + 11 * s, y + 20 * s, s, s);

    // Red glow effect
    const glowAlpha = Math.sin(frame * 0.05 + 1) * 0.12 + 0.15;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 45 * scale);
    grad.addColorStop(0, `rgba(239,35,60,${glowAlpha})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, 45 * scale, 0, Math.PI * 2); ctx.fill();

    // Ember particles
    for (let i = 0; i < 5; i++) {
        const px = cx + Math.sin(frame * 0.02 + i * 1.3) * 30 * scale;
        const py = cy - 20 * scale + Math.sin(frame * 0.03 + i * 2) * 25 * scale;
        const emberAlpha = Math.sin(frame * 0.04 + i) * 0.3 + 0.3;
        ctx.globalAlpha = emberAlpha;
        ctx.fillStyle = i % 2 === 0 ? Or : R;
        ctx.fillRect(px, py, 2 * scale, 2 * scale);
    }
    ctx.globalAlpha = 1;
}

// ══════════════════════════════════════════════════════════════
//  TOWER SPRITE — Mini pixel tower for cutscenes
// ══════════════════════════════════════════════════════════════
function drawTowerSprite(ctx, cx, cy, scale, color, frame) {
    const s = 2 * scale;
    const glow = Math.sin(frame * 0.06 + cx * 0.01) * 0.2 + 0.6;

    // Crystal glow
    const grad = ctx.createRadialGradient(cx, cy - 5 * s, 0, cx, cy - 5 * s, 12 * s);
    grad.addColorStop(0, `rgba(245,197,66,${0.15 * glow})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy - 5 * s, 12 * s, 0, Math.PI * 2); ctx.fill();

    // Tower base
    ctx.fillStyle = color === 'blue' ? '#2b3a8e' : color === 'red' ? '#8e1b2b' : '#3a3f44';
    ctx.fillRect(cx - 3 * s, cy, 6 * s, 8 * s);
    // Tower body
    ctx.fillStyle = color === 'blue' ? '#4361ee' : color === 'red' ? '#ef233c' : '#6c757d';
    ctx.fillRect(cx - 4 * s, cy - 8 * s, 8 * s, 8 * s);
    // Battlements
    ctx.fillRect(cx - 5 * s, cy - 10 * s, 2 * s, 3 * s);
    ctx.fillRect(cx + 3 * s, cy - 10 * s, 2 * s, 3 * s);
    ctx.fillRect(cx - 1 * s, cy - 11 * s, 2 * s, 4 * s);
    // Window
    ctx.fillStyle = '#f5c542';
    ctx.globalAlpha = glow;
    ctx.fillRect(cx - s, cy - 5 * s, 2 * s, 3 * s);
    ctx.globalAlpha = 1;
}

// ══════════════════════════════════════════════════════════════
//  CRYSTAL SPRITE — Animated energy crystal
// ══════════════════════════════════════════════════════════════
function drawCrystal(ctx, cx, cy, scale, frame) {
    const s = 3 * scale;
    const pulse = Math.sin(frame * 0.06 + cx * 0.02) * 0.3 + 0.7;
    const float = Math.sin(frame * 0.04 + cx * 0.01) * 4 * scale;

    // Outer glow
    const grad = ctx.createRadialGradient(cx, cy + float, 0, cx, cy + float, 20 * s);
    grad.addColorStop(0, `rgba(245,197,66,${0.2 * pulse})`);
    grad.addColorStop(0.5, `rgba(34,211,238,${0.1 * pulse})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy + float, 20 * s, 0, Math.PI * 2); ctx.fill();

    // Crystal shape
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#f5c542';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6 * s + float);
    ctx.lineTo(cx + 3 * s, cy + float);
    ctx.lineTo(cx + 2 * s, cy + 4 * s + float);
    ctx.lineTo(cx - 2 * s, cy + 4 * s + float);
    ctx.lineTo(cx - 3 * s, cy + float);
    ctx.closePath();
    ctx.fill();

    // Inner highlight
    ctx.fillStyle = '#ffe082';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4 * s + float);
    ctx.lineTo(cx + 1.5 * s, cy + float);
    ctx.lineTo(cx, cy + 2 * s + float);
    ctx.lineTo(cx - 1.5 * s, cy + float);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Sparkles
    for (let i = 0; i < 3; i++) {
        const sx = cx + Math.sin(frame * 0.03 + i * 2.1) * 8 * scale;
        const sy = cy + float + Math.cos(frame * 0.04 + i * 1.7) * 6 * scale;
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = Math.sin(frame * 0.05 + i) * 0.4 + 0.3;
        ctx.fillRect(sx, sy, scale, scale);
        ctx.globalAlpha = 1;
    }
}
