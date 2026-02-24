// ============================================================
// TOWER SIEGE — Game Display (Canvas Renderer)
// Adapted for Motion Arena Socket.IO integration
// Loads: sprites.js, story.js (must be included before this)
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── Retro Colors ────────────────────────────────────────────
const C = {
    bg: '#0d1117', bgGrid: '#161b22',
    blue: '#4361ee', blueGlow: '#7209b7', blueDark: '#2b3a8e', blueBright: '#6fa0ff',
    red: '#ef233c', redGlow: '#ff6b35', redDark: '#8e1b2b', redBright: '#ff6b7a',
    neutral: '#6c757d', neutralDark: '#3a3f44',
    white: '#e6edf3', whiteA: 'rgba(230,237,243,0.15)',
    gold: '#f5c542', green: '#2ea043',
    path: 'rgba(230,237,243,0.12)',
    purple: '#a855f7', purpleDark: '#6b21a8', cyan: '#22d3ee',
};

// ── State (updated by Socket.IO via game.html wrapper) ──────
let state = null;
let animFrame = 0, particles = [], eventFeed = [];
let screenShake = { x: 0, y: 0, intensity: 0 }, prevTowerOwners = {};
let gamePhase = 'waiting'; // 'waiting' → 'playing' (intro/modeselect skipped)

// Called by the Socket.IO wrapper in game.html
function updateGameState(newState) {
    const old = state;
    state = newState;
    // Detect tower captures for visual effects
    if (old && state.towers) {
        for (const t of state.towers) {
            const prev = prevTowerOwners[t.id];
            if (prev && prev !== t.owner && t.owner !== 'neutral') {
                spawnParticles(t.x, t.y, t.owner);
                screenShake.intensity = 8;
                addEvent(`${t.owner === 'blue' ? '🔵' : '🔴'} captured ${t.name}!`);
            }
            prevTowerOwners[t.id] = t.owner;
        }
    }
}

// Called by game.html wrapper to skip intro/mode select
function setGamePhase(phase) {
    gamePhase = phase;
}

// ── Canvas ──────────────────────────────────────────────────
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

// ── Effects ─────────────────────────────────────────────────
function spawnParticles(x, y, o) {
    const c = o === 'blue' ? C.blueBright : C.redBright;
    for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
        particles.push({ x: sx(x), y: sy(y), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.01 + Math.random() * 0.025, size: 2 + Math.random() * 4, color: c });
    }
}
function updateParticles() { for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= p.decay; } particles = particles.filter(p => p.life > 0); }
function drawParticles() { for (const p of particles) { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); } ctx.globalAlpha = 1; }
function addEvent(t) { eventFeed.unshift({ text: t, time: Date.now() }); if (eventFeed.length > 5) eventFeed.pop(); }
function drawEvents() {
    const x = canvas.width / 2, by = canvas.height - 100; ctx.textAlign = 'center'; ctx.font = '10px "Press Start 2P",monospace';
    for (let i = 0; i < eventFeed.length; i++) { const e = eventFeed[i], age = (Date.now() - e.time) / 1000; if (age > 5) continue; ctx.globalAlpha = Math.max(0, 1 - age / 5); ctx.fillStyle = C.gold; ctx.fillText(e.text, x, by - i * 18); }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
}
function updateShake() {
    if (screenShake.intensity > 0) { screenShake.x = (Math.random() - 0.5) * screenShake.intensity; screenShake.y = (Math.random() - 0.5) * screenShake.intensity; screenShake.intensity *= 0.9; if (screenShake.intensity < 0.5) screenShake.intensity = 0; } else { screenShake.x = 0; screenShake.y = 0; }
}

// ── Helpers ─────────────────────────────────────────────────
function tc(o) { return o === 'blue' ? C.blue : o === 'red' ? C.red : C.neutral; }
function tcd(o) { return o === 'blue' ? C.blueDark : o === 'red' ? C.redDark : C.neutralDark; }
function tg(o) { return o === 'blue' ? C.blueGlow : o === 'red' ? C.redGlow : C.neutral; }
function sx(x) { return (x / 1200) * canvas.width; }
function sy(y) { return 80 + (y / 700) * (canvas.height - 140); }

// ── Background ──────────────────────────────────────────────
function drawBg() {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = C.bgGrid; ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
}

// ── Paths, Towers, Marching ─────────────────────────────────
function drawPaths() {
    if (!state || !state.edges || !state.towers) return;
    for (const [a, b] of state.edges) { const ta = state.towers[a], tb = state.towers[b]; ctx.beginPath(); ctx.strokeStyle = C.path; ctx.lineWidth = 2; ctx.setLineDash([6, 8]); ctx.moveTo(sx(ta.x), sy(ta.y)); ctx.lineTo(sx(tb.x), sy(tb.y)); ctx.stroke(); ctx.setLineDash([]); }
}
function drawTowers() {
    if (!state || !state.towers) return; const pulse = Math.sin(animFrame * 0.05) * 0.15 + 0.85;
    for (const t of state.towers) {
        const x = sx(t.x), y = sy(t.y), bR = 28, r = bR + (t.owner !== 'neutral' ? Math.min(t.soldiers * 0.15, 12) : 0);
        if (t.owner !== 'neutral') { const g = ctx.createRadialGradient(x, y, r, x, y, r * 2.5); g.addColorStop(0, tg(t.owner) + '40'); g.addColorStop(1, 'transparent'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.5 * pulse, 0, Math.PI * 2); ctx.fill(); }
        ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fillStyle = tc(t.owner); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2); ctx.fillStyle = tcd(t.owner); ctx.fill();
        const tw = r * 0.7; ctx.fillStyle = tc(t.owner); ctx.fillRect(x - tw / 2, y - tw / 2 - 3, tw, tw * 0.7); const bw = tw / 5;
        for (let i = 0; i < 3; i++) ctx.fillRect(x - tw / 2 + i * bw * 2, y - tw / 2 - 3 - bw, bw, bw);
        ctx.font = 'bold 11px "Press Start 2P",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.white; ctx.fillText(Math.floor(t.soldiers), x, y + r * 0.45);
        ctx.font = '7px "Press Start 2P",monospace'; ctx.fillStyle = 'rgba(230,237,243,0.4)'; ctx.fillText(t.name, x, y - r - 10);
    } ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function drawMarching() {
    if (!state || !state.marching) return;
    for (const m of state.marching) {
        const f = state.towers[m.from], t = state.towers[m.to], x1 = sx(f.x), y1 = sy(f.y), x2 = sx(t.x), y2 = sy(t.y), c = m.owner === 'blue' ? C.blueBright : C.redBright;
        for (let i = 0; i < Math.min(m.count, 10); i++) { const p = m.progress - (i * 0.15 / Math.min(m.count, 10)); if (p < 0 || p > 1) continue; const dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy), w = Math.sin(p * 20 + animFrame * 0.15) * 3; ctx.beginPath(); ctx.arc(x1 + dx * p + (-dy / l) * w, y1 + dy * p + (dx / l) * w, 3, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); }
        ctx.font = '8px "Press Start 2P",monospace'; ctx.textAlign = 'center'; ctx.fillStyle = c; ctx.fillText(m.count, x1 + (x2 - x1) * m.progress, y1 + (y2 - y1) * m.progress - 12);
    } ctx.textAlign = 'left';
}

// ── HUD ─────────────────────────────────────────────────────
function drawHUD() {
    if (!state) return; const w = canvas.width, ai = state.mode === 'ai';
    ctx.fillStyle = 'rgba(13,17,23,0.9)'; ctx.fillRect(0, 0, w, 70); ctx.fillStyle = 'rgba(230,237,243,0.05)'; ctx.fillRect(0, 69, w, 1);
    ctx.font = '12px "Press Start 2P",monospace'; ctx.fillStyle = C.blue; ctx.fillText(ai ? '⚔ CMDR. AZURE' : '🔵 BLUE', 20, 25);
    ctx.font = '10px "Press Start 2P",monospace'; ctx.fillStyle = C.white; ctx.fillText(`Push-ups: ${state.players.blue.pushups}`, 20, 42); ctx.fillText(`⚔${state.players.blue.totalSoldiers}  🏰${state.players.blue.towersOwned}`, 20, 58);
    ctx.font = '12px "Press Start 2P",monospace'; ctx.fillStyle = C.red; ctx.textAlign = 'right'; ctx.fillText(ai ? 'GEN. CRIMSON 🤖' : 'RED 🔴', w - 20, 25);
    ctx.font = '10px "Press Start 2P",monospace'; ctx.fillStyle = C.white; ctx.fillText(`Push-ups: ${state.players.red.pushups}`, w - 20, 42); ctx.fillText(`🏰${state.players.red.towersOwned}  ⚔${state.players.red.totalSoldiers}`, w - 20, 58); ctx.textAlign = 'left';
    ctx.font = '18px "Press Start 2P",monospace'; ctx.textAlign = 'center'; const mn = Math.floor(state.timer / 60), sc = state.timer % 60; ctx.fillStyle = state.timer <= 10 ? C.red : C.gold; ctx.fillText(`${mn}:${sc.toString().padStart(2, '0')}`, w / 2, 30);
    ctx.font = '8px "Press Start 2P",monospace'; ctx.fillStyle = C.whiteA; ctx.fillText(ai ? 'TOWER SIEGE — VS THE HORDE' : 'TOWER SIEGE — 1v1', w / 2, 50); ctx.textAlign = 'left';
    drawTerrBar();
}
function drawTerrBar() {
    if (!state) return; const tot = 13, bT = state.players.blue.towersOwned, rT = state.players.red.towersOwned;
    const bY = canvas.height - 35, bH = 14, bX = 40, bW = canvas.width - 80; ctx.fillStyle = C.neutralDark; ctx.fillRect(bX, bY, bW, bH);
    const bw = (bT / tot) * bW; if (bw > 0) { ctx.fillStyle = C.blue; ctx.fillRect(bX, bY, bw, bH); }
    const rw = (rT / tot) * bW; if (rw > 0) { ctx.fillStyle = C.red; ctx.fillRect(bX + bW - rw, bY, rw, bH); }
    ctx.font = '7px "Press Start 2P",monospace'; ctx.textAlign = 'center'; ctx.fillStyle = C.white;
    if (bw > 30) ctx.fillText(`${Math.round(bT / tot * 100)}%`, bX + bw / 2, bY + bH - 3); if (rw > 30) ctx.fillText(`${Math.round(rT / tot * 100)}%`, bX + bW - rw / 2, bY + bH - 3);
    ctx.fillStyle = 'rgba(230,237,243,0.4)'; ctx.fillText('TERRITORY', canvas.width / 2, bY - 4); ctx.textAlign = 'left';
}

// ── Waiting Screen ──────────────────────────────────────────
function drawWaiting() {
    const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
    drawStoryStarfield(ctx, w, h, animFrame);
    drawStoryScanlines(ctx, w, h, 0.03);
    drawAzure(ctx, 130, cy + 30, 1.6, animFrame);
    drawCrimson(ctx, w - 130, cy + 30, 1.6, animFrame);

    ctx.save(); ctx.shadowColor = C.gold; ctx.shadowBlur = 15;
    ctx.font = '26px "Press Start 2P",monospace'; ctx.textAlign = 'center'; ctx.fillStyle = C.gold;
    ctx.fillText('⚔ TOWER SIEGE ⚔', cx, cy - 80); ctx.shadowBlur = 0; ctx.restore();

    ctx.font = '10px "Press Start 2P",monospace'; ctx.fillStyle = C.white; ctx.textAlign = 'center';
    ctx.fillText('Waiting for game to start...', cx, cy);

    const blink = Math.sin(animFrame * 0.08) > 0;
    if (blink) {
        ctx.font = '8px "Press Start 2P",monospace'; ctx.fillStyle = C.green;
        ctx.fillText('Push-ups power your army!', cx, cy + 30);
    }
    ctx.textAlign = 'left';
}

// ── Countdown ───────────────────────────────────────────────
function drawCountdown() {
    if (!state) return; const cx = canvas.width / 2, cy = canvas.height / 2; ctx.fillStyle = 'rgba(13,17,23,0.85)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const n = state.countdownTimer, s = 1 + Math.sin(animFrame * 0.2) * 0.1; ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
    ctx.font = '80px "Press Start 2P",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = n > 0 ? C.gold : C.green; ctx.shadowColor = C.gold; ctx.shadowBlur = 30; ctx.fillText(n > 0 ? n.toString() : 'SIEGE!', 0, 0); ctx.shadowBlur = 0; ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// ── Game Over ───────────────────────────────────────────────
function drawGameOver() {
    if (!state) return; const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, ai = state.mode === 'ai', win = state.winner, wc = win === 'blue' ? C.blue : C.red;
    drawPaths(); drawTowers(); ctx.fillStyle = 'rgba(13,17,23,0.8)'; ctx.fillRect(0, 0, w, h);
    if (win === 'blue') drawAzure(ctx, cx, cy - 110, 2.8, animFrame); else drawCrimson(ctx, cx, cy - 110, 2.8, animFrame);
    ctx.textAlign = 'center'; ctx.font = '14px "Press Start 2P",monospace'; ctx.fillStyle = C.gold; ctx.fillText('THE SIEGE IS OVER', cx, cy + 25);
    ctx.font = '20px "Press Start 2P",monospace'; ctx.fillStyle = wc; ctx.shadowColor = wc; ctx.shadowBlur = 20;
    if (ai) ctx.fillText(win === 'blue' ? '⚔ AZURE VICTORIOUS!' : '🤖 CRIMSON CONQUERS!', cx, cy + 55);
    else ctx.fillText(win === 'blue' ? '⚔ AZURE WINS!' : '⚔ CRIMSON WINS!', cx, cy + 55); ctx.shadowBlur = 0;
    ctx.font = '8px "Press Start 2P",monospace'; ctx.fillStyle = C.white;
    ctx.fillText(`Cmdr. Azure: ${state.players.blue.pushups} push-ups | ${state.players.blue.towersOwned} towers`, cx, cy + 90);
    ctx.fillText(`Gen. Crimson: ${state.players.red.pushups} push-ups | ${state.players.red.towersOwned} towers`, cx, cy + 110);
    if (Math.sin(animFrame * 0.08) > 0) { ctx.font = '8px "Press Start 2P",monospace'; ctx.fillStyle = C.gold; ctx.fillText('REFRESH TO PLAY AGAIN', cx, cy + 150); }
    ctx.textAlign = 'left';
}

// ── Deploy Mode & Head Direction on Game Display ────────────
function drawDeployBadges() {
    if (!state) return;
    ctx.font = '7px "Press Start 2P",monospace';
    const blueMode = state.players.blue.deployMode || 'auto';
    if (blueMode === 'manual') {
        ctx.fillStyle = 'rgba(245,197,66,0.2)'; ctx.fillRect(20, 65, 75, 16);
        ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.strokeRect(20, 65, 75, 16);
        ctx.fillStyle = C.gold; ctx.textAlign = 'left'; ctx.fillText('🎯 MANUAL', 25, 77);
    }
    const redMode = state.players.red.deployMode || 'auto';
    if (redMode === 'manual') {
        ctx.fillStyle = 'rgba(245,197,66,0.2)'; ctx.fillRect(canvas.width - 95, 65, 75, 16);
        ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.strokeRect(canvas.width - 95, 65, 75, 16);
        ctx.fillStyle = C.gold; ctx.textAlign = 'right'; ctx.fillText('🎯 MANUAL', canvas.width - 25, 77);
    }
    ctx.textAlign = 'left';
}

function drawHeadIndicator() {
    if (!state) return;
    for (const team of ['blue', 'red']) {
        const p = state.players[team];
        if (p.deployMode !== 'manual' || p.isAI) continue;

        const dir = p.headDirection || 'center';
        if (dir === 'center') continue;

        const isBlue = team === 'blue';
        const baseX = isBlue ? 120 : canvas.width - 120;
        const baseY = canvas.height - 70;
        const col = isBlue ? C.blue : C.red;
        const pulse = Math.sin(animFrame * 0.1) * 0.3 + 0.7;

        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.font = '24px "Press Start 2P",monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = col;
        ctx.shadowBlur = 15;
        ctx.fillStyle = C.gold;
        ctx.fillText(dir === 'left' ? '⬅' : '➡', baseX, baseY);
        ctx.font = '7px "Press Start 2P",monospace';
        ctx.fillStyle = col;
        ctx.shadowBlur = 0;
        ctx.fillText(`HEAD ${dir.toUpperCase()}`, baseX, baseY + 15);
        ctx.restore();
    }
    ctx.textAlign = 'left';
}

function drawHeadTargetPath() {
    if (!state || !state.edges || !state.towers) return;

    for (const team of ['blue', 'red']) {
        const p = state.players[team];
        if (p.deployMode !== 'manual' || p.isAI) continue;

        const dir = p.headDirection || 'center';
        if (dir === 'center') continue;

        const homeId = team === 'blue' ? 5 : 7;
        const home = state.towers[homeId];
        if (!home) continue;

        const adj = [];
        for (const [a, b] of state.edges) {
            if (a === homeId) adj.push(b);
            if (b === homeId) adj.push(a);
        }
        if (adj.length === 0) continue;

        const adjTowers = adj.map(id => ({ id, ...state.towers[id] }));
        adjTowers.sort((a, b) => a.x - b.x);

        const target = dir === 'left' ? adjTowers[0] : adjTowers[adjTowers.length - 1];
        if (!target) continue;

        const x1 = sx(home.x), y1 = sy(home.y);
        const x2 = sx(target.x), y2 = sy(target.y);
        const pulse = Math.sin(animFrame * 0.08) * 0.3 + 0.7;

        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 4;
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 12;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        const angle = Math.atan2(y2 - y1, x2 - x1);
        const arrowLen = 12;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - arrowLen * Math.cos(angle - 0.4), y2 - arrowLen * Math.sin(angle - 0.4));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - arrowLen * Math.cos(angle + 0.4), y2 - arrowLen * Math.sin(angle + 0.4));
        ctx.stroke();
        ctx.restore();
    }
}

// ── Main Render ─────────────────────────────────────────────
function render() {
    animFrame++; updateParticles(); updateShake();
    ctx.save(); ctx.translate(screenShake.x, screenShake.y); drawBg();

    if (gamePhase === 'waiting') {
        drawWaiting();
    } else if (!state || state.phase === 'lobby') {
        drawWaiting();
    } else if (state.phase === 'countdown') {
        drawPaths(); drawTowers(); drawHUD(); drawCountdown();
    } else if (state.phase === 'playing') {
        drawPaths(); drawHeadTargetPath(); drawMarching(); drawTowers(); drawParticles(); drawHUD(); drawDeployBadges(); drawHeadIndicator(); drawEvents();
        drawStoryScanlines(ctx, canvas.width, canvas.height, 0.015);
    } else if (state.phase === 'gameover') {
        drawGameOver(); drawParticles();
    }

    ctx.restore(); requestAnimationFrame(render);
}
requestAnimationFrame(render);
