// ============================================================
// TOWER SIEGE — Story Cutscene Engine
// Multi-scene animated intro with typewriter text, transitions
// ============================================================

// ── Storyline Scenes (expanded & dramatic) ──────────────────
const STORY = [
    {
        bg: 'stars',
        character: null,
        subtitle: null,
        lines: [
            '  A thousand years ago...',
            '  two kingdoms were born from',
            '  the same mountain of crystal.',
        ],
        titleReveal: 'TOWER SIEGE',
        titleDelay: 2200,
        duration: 5500,
    },
    {
        bg: 'castle_blue',
        character: 'azure',
        subtitle: 'THE AZURE DOMINION — Kingdom of Discipline',
        lines: [
            'Commander Azure, the Iron Shield,',
            'believed strength comes from will.',
            '',
            '"Every push-up forges a soldier.',
            ' Every rep sharpens the blade.',
            ' Discipline IS power."',
        ],
        duration: 7500,
    },
    {
        bg: 'castle_red',
        character: 'crimson',
        subtitle: 'THE CRIMSON HORDE — Empire of Fury',
        lines: [
            'General Crimson, the Blood Berserker,',
            'rose from nothing through sheer rage.',
            '',
            '"The weak kneel. The strong CONQUER.',
            ' I will break every tower,',
            ' every wall, every bone."',
        ],
        duration: 7500,
    },
    {
        bg: 'towers',
        character: null,
        subtitle: 'THE 13 SACRED TOWERS',
        lines: [
            'Between their lands stand 13 towers,',
            'each built upon ancient crystal veins.',
            '',
            'They amplify the Iron Will of',
            'whoever claims them — turning raw',
            'strength into an unstoppable army.',
        ],
        duration: 7000,
    },
    {
        bg: 'crystals',
        character: null,
        subtitle: 'THE IRON RITUAL',
        lines: [
            'The crystals respond only to one',
            'thing: PHYSICAL FORCE.',
            '',
            'Each push-up channels your Iron Will',
            'through the crystal network, spawning',
            'soldiers to fight in your name.',
            '',
            'Your body is the weapon.',
        ],
        duration: 7000,
    },
    {
        bg: 'versus',
        character: 'both',
        subtitle: null,
        lines: [
            'The final siege begins.',
            'Only one kingdom will remain.',
        ],
        duration: 4500,
    },
];

// ── Cutscene State ──────────────────────────────────────────
let storyScene = 0;
let storyStart = Date.now();
let storyFade = 1;
let storyFadeDir = -1;
let storySkipAlpha = 0;

// Starfield
const storyStars = [];
for (let i = 0; i < 200; i++) {
    storyStars.push({
        x: Math.random(), y: Math.random(),
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.0003 + 0.00008,
        phase: Math.random() * 100,
    });
}

function resetStoryScene() {
    storyStart = Date.now();
    storyFade = 1;
    storyFadeDir = -1;
}

function advanceStoryScene() {
    storyScene++;
    if (storyScene >= STORY.length) {
        gamePhase = 'modeselect';
        return;
    }
    resetStoryScene();
}

// ── Background Renderers ────────────────────────────────────
function drawStoryStarfield(ctx, w, h, frame) {
    for (const star of storyStars) {
        star.y += star.speed;
        if (star.y > 1) { star.y = 0; star.x = Math.random(); }
        const twinkle = 0.4 + Math.sin(frame * 0.03 * (star.phase % 5 + 1) + star.phase) * 0.5;
        ctx.globalAlpha = twinkle * 0.85;
        ctx.fillStyle = '#e6edf3';
        ctx.fillRect(star.x * w, star.y * h, star.size, star.size);
    }
    ctx.globalAlpha = 1;
}

function drawStoryBg(ctx, type, w, h, frame) {
    if (type === 'stars') {
        drawStoryStarfield(ctx, w, h, frame);
        return;
    }

    drawStoryStarfield(ctx, w, h, frame);

    if (type === 'castle_blue') {
        const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
        g.addColorStop(0, 'transparent');
        g.addColorStop(1, 'rgba(67,97,238,0.12)');
        ctx.fillStyle = g; ctx.fillRect(0, h * 0.55, w, h * 0.45);
        // Distant mountains
        ctx.fillStyle = 'rgba(43,58,142,0.15)';
        for (let i = 0; i < 8; i++) {
            const mx = w * 0.05 + i * w * 0.12;
            const mh = 40 + Math.sin(i * 1.8) * 25;
            ctx.beginPath();
            ctx.moveTo(mx, h * 0.65); ctx.lineTo(mx + w * 0.06, h * 0.65 - mh); ctx.lineTo(mx + w * 0.12, h * 0.65);
            ctx.fill();
        }
        // Castle
        ctx.fillStyle = 'rgba(43,58,142,0.35)';
        const cx = w * 0.12, cw = w * 0.22, cy = h * 0.52;
        ctx.fillRect(cx, cy, cw, h - cy);
        ctx.fillRect(cx - 15, cy - 50, 30, 50);
        ctx.fillRect(cx + cw - 15, cy - 50, 30, 50);
        ctx.fillRect(cx + cw / 2 - 20, cy - 80, 40, 80);
        // Banner
        ctx.fillStyle = 'rgba(67,97,238,0.4)';
        ctx.fillRect(cx + cw / 2 - 5, cy - 110, 10, 30);
        ctx.fillRect(cx + cw / 2 + 5, cy - 105, 15, 20);
        // Windows
        ctx.fillStyle = 'rgba(245,197,66,0.15)';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(cx + 20 + i * (cw - 40) / 3, cy + 25, 12, 18);
        }
    }

    if (type === 'castle_red') {
        const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
        g.addColorStop(0, 'transparent');
        g.addColorStop(1, 'rgba(239,35,60,0.12)');
        ctx.fillStyle = g; ctx.fillRect(0, h * 0.55, w, h * 0.45);
        // Jagged terrain
        ctx.fillStyle = 'rgba(142,27,43,0.12)';
        for (let i = 0; i < 10; i++) {
            const mx = w * 0.6 + i * w * 0.04;
            ctx.beginPath();
            ctx.moveTo(mx, h * 0.62); ctx.lineTo(mx + 15, h * 0.62 - 30 - Math.random() * 20); ctx.lineTo(mx + 30, h * 0.62);
            ctx.fill();
        }
        // Dark fortress
        ctx.fillStyle = 'rgba(142,27,43,0.35)';
        const cx = w * 0.66, cw = w * 0.24, cy = h * 0.48;
        ctx.fillRect(cx, cy, cw, h - cy);
        ctx.fillRect(cx - 20, cy - 60, 35, 60);
        ctx.fillRect(cx + cw - 15, cy - 60, 35, 60);
        ctx.fillRect(cx + cw / 2 - 25, cy - 100, 50, 100);
        // Spikes
        ctx.fillStyle = 'rgba(180,180,180,0.25)';
        ctx.fillRect(cx + cw / 2 - 3, cy - 130, 6, 30);
        ctx.fillRect(cx - 18, cy - 75, 6, 15);
        ctx.fillRect(cx + cw + 12, cy - 75, 6, 15);
        // Lava windows
        ctx.fillStyle = 'rgba(255,107,53,0.2)';
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(cx + 30 + i * (cw - 60) / 2, cy + 20, 14, 20);
        }
    }

    if (type === 'towers') {
        const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
        glow.addColorStop(0, 'rgba(245,197,66,0.06)');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
        // Draw 13 towers
        for (let i = 0; i < 13; i++) {
            const tx = w * 0.08 + (w * 0.84) * (i / 12);
            const ty = h * 0.55 + Math.sin(i * 1.1 + 0.5) * 30;
            const col = i < 4 ? 'blue' : i > 8 ? 'red' : 'neutral';
            drawTowerSprite(ctx, tx, ty, 0.8, col, frame + i * 20);
        }
    }

    if (type === 'crystals') {
        for (let i = 0; i < 7; i++) {
            const cx = w * 0.15 + (w * 0.7) * (i / 6);
            const cy = h * 0.6 + Math.sin(i * 2.1) * 25;
            drawCrystal(ctx, cx, cy, 1.2, frame + i * 30);
        }
    }

    if (type === 'versus') {
        // Dramatic energy in center
        const flash = Math.sin(frame * 0.12);
        if (flash > 0.6) {
            ctx.strokeStyle = '#f5c542';
            ctx.lineWidth = 2 + flash * 2;
            ctx.globalAlpha = (flash - 0.6) * 2;
            ctx.beginPath(); ctx.moveTo(w / 2, h * 0.1);
            for (let y = h * 0.1; y < h * 0.9; y += 15) {
                ctx.lineTo(w / 2 + (Math.random() - 0.5) * 50, y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        // Center glow
        const p = Math.sin(frame * 0.06) * 0.2 + 0.5;
        const cg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 120);
        cg.addColorStop(0, `rgba(245,197,66,${0.15 * p})`);
        cg.addColorStop(1, 'transparent');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(w / 2, h / 2, 120, 0, Math.PI * 2); ctx.fill();
    }
}

// ── CRT Scanlines ───────────────────────────────────────────
function drawStoryScanlines(ctx, w, h, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.globalAlpha = 1;
    // Vignette
    const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.7);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
}

// ── Draw Current Scene ──────────────────────────────────────
function drawStoryScene(ctx, w, h, frame) {
    const scene = STORY[storyScene];
    if (!scene) return;

    const cx = w / 2;
    const elapsed = Date.now() - storyStart;

    // Auto-advance
    if (elapsed > scene.duration) storyFadeDir = 1;

    // Fade
    if (storyFadeDir === -1) storyFade = Math.max(0, storyFade - 0.025);
    else if (storyFadeDir === 1) {
        storyFade = Math.min(1, storyFade + 0.035);
        if (storyFade >= 1) { advanceStoryScene(); return; }
    }

    // Background
    drawStoryBg(ctx, scene.bg, w, h, frame);

    // Subtitle bar
    if (scene.subtitle) {
        const barAlpha = Math.min(1, elapsed / 600);
        ctx.globalAlpha = barAlpha * 0.7;
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 50, w, 36);
        ctx.globalAlpha = barAlpha;
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f5c542';
        ctx.fillText(scene.subtitle, cx, 74);
        ctx.globalAlpha = 1;
    }

    // Big title reveal (scene 0)
    if (scene.titleReveal && elapsed > scene.titleDelay) {
        const t = Math.min(1, (elapsed - scene.titleDelay) / 1000);
        const sc = 1 + (1 - t) * 1.5;
        ctx.save();
        ctx.translate(cx, h * 0.35);
        ctx.scale(sc, sc);
        ctx.font = '36px "Press Start 2P", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = t;
        ctx.shadowColor = '#f5c542'; ctx.shadowBlur = 40 * t;
        ctx.fillStyle = '#f5c542';
        ctx.fillText(scene.titleReveal, 0, 0);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        ctx.restore();
        ctx.textBaseline = 'alphabetic';
        // Subtitle under title
        if (t > 0.5) {
            ctx.globalAlpha = (t - 0.5) * 2;
            ctx.font = '9px "Press Start 2P", monospace';
            ctx.textAlign = 'center'; ctx.fillStyle = '#e6edf3';
            ctx.fillText('⚔ PUSH-UP POWERED WARFARE ⚔', cx, h * 0.35 + 35);
            ctx.globalAlpha = 1;
        }
    }

    // Characters
    if (scene.character === 'azure') {
        drawAzure(ctx, w * 0.82, h * 0.52, 2.2, frame);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'center'; ctx.fillStyle = '#4361ee';
        ctx.fillText('COMMANDER AZURE', w * 0.82, h * 0.52 + 75);
        ctx.fillStyle = '#6fa0ff'; ctx.font = '6px "Press Start 2P", monospace';
        ctx.fillText('"The Iron Shield"', w * 0.82, h * 0.52 + 90);
    }
    if (scene.character === 'crimson') {
        drawCrimson(ctx, w * 0.18, h * 0.52, 2.2, frame);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'center'; ctx.fillStyle = '#ef233c';
        ctx.fillText('GENERAL CRIMSON', w * 0.18, h * 0.52 + 75);
        ctx.fillStyle = '#ff6b7a'; ctx.font = '6px "Press Start 2P", monospace';
        ctx.fillText('"The Blood Berserker"', w * 0.18, h * 0.52 + 90);
    }
    if (scene.character === 'both') {
        drawAzure(ctx, w * 0.28, h * 0.48, 2.5, frame);
        drawCrimson(ctx, w * 0.72, h * 0.48, 2.5, frame);
        // VS text
        const vp = Math.sin(frame * 0.08) * 0.2 + 0.8;
        ctx.save();
        ctx.shadowColor = '#f5c542'; ctx.shadowBlur = 25;
        ctx.font = '42px "Press Start 2P", monospace';
        ctx.textAlign = 'center'; ctx.globalAlpha = vp;
        ctx.fillStyle = '#f5c542';
        ctx.fillText('VS', cx, h * 0.48 + 10);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        ctx.restore();
    }

    // Typewriter text (in a dark text box)
    const textX = scene.character === 'azure' ? w * 0.38 :
        scene.character === 'crimson' ? w * 0.62 : cx;
    const textStartY = scene.character
        ? h * 0.3
        : (scene.titleReveal ? h * 0.55 : h * 0.38);

    // Text box background
    if (scene.lines.length > 0) {
        const boxW = 440;
        const boxH = scene.lines.length * 22 + 20;
        const boxX = textX - boxW / 2;
        const boxY = textStartY - 15;
        const textAlpha = Math.min(1, Math.max(0, (elapsed - 300) / 500));
        ctx.globalAlpha = textAlpha * 0.7;
        ctx.fillStyle = '#0d1117';
        ctx.strokeStyle = 'rgba(245,197,66,0.3)';
        ctx.lineWidth = 1;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);
        ctx.globalAlpha = 1;
    }

    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';

    const charSpeed = 32;
    const totalTime = elapsed - 500;
    let totalChars = totalTime > 0 ? Math.floor(totalTime / charSpeed) : 0;
    let running = 0;

    for (let li = 0; li < scene.lines.length; li++) {
        const line = scene.lines[li];
        const chars = Math.max(0, Math.min(line.length, totalChars - running));
        if (chars > 0) {
            const text = line.substring(0, chars);
            const isQuote = line.trim().startsWith('"') || line.trim().startsWith("'");
            ctx.fillStyle = isQuote ? '#22d3ee' : '#e6edf3';
            ctx.globalAlpha = 0.95;
            ctx.fillText(text, textX, textStartY + li * 22);
            ctx.globalAlpha = 1;
        }
        running += line.length;
    }

    // Scanlines + vignette
    drawStoryScanlines(ctx, w, h, 0.05);

    // Fade overlay
    if (storyFade > 0) {
        ctx.fillStyle = `rgba(13,17,23,${storyFade})`;
        ctx.fillRect(0, 0, w, h);
    }

    // Skip hint
    storySkipAlpha = Math.min(0.5, storySkipAlpha + 0.004);
    ctx.globalAlpha = storySkipAlpha;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'right'; ctx.fillStyle = '#e6edf3';
    ctx.fillText('CLICK TO SKIP ▶▶', w - 20, h - 20);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
}
