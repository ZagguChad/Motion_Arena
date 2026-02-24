// ============================================================
// CPR TRAINER — Interactive Learning Game
// Server: HTTP + HTTPS + WebSocket + CPR Game Engine
// ============================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const os = require('os');

// ── Config ──────────────────────────────────────────────────
const PORT = 3000;
const HTTPS_PORT = 3443;
const GAME_DURATION = 60;           // seconds of active CPR
const TICK_RATE = 30;               // game ticks per second
const TICK_MS = 1000 / TICK_RATE;

// ── CPR Standards ───────────────────────────────────────────
const TARGET_BPM_LOW = 100;         // AHA guideline: 100-120 compressions/min
const TARGET_BPM_HIGH = 120;
const TARGET_BPM_MID = 110;         // ideal midpoint
const TARGET_DEPTH_LOW = 5.0;       // cm — minimum effective depth
const TARGET_DEPTH_HIGH = 6.0;      // cm — maximum safe depth
const TARGET_DEPTH_MID = 5.5;       // cm — ideal midpoint
const MIN_RECOIL_RATIO = 0.8;      // 80% recoil = acceptable
const PERFECT_RECOIL_RATIO = 0.95;  // 95% = perfect

// ── Scoring Weights ─────────────────────────────────────────
const WEIGHT_RATE = 0.35;
const WEIGHT_DEPTH = 0.35;
const WEIGHT_RECOIL = 0.15;
const WEIGHT_CONSISTENCY = 0.15;

// ── MIME types ──────────────────────────────────────────────
const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
};

// ── Get local IP ────────────────────────────────────────────
function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return '127.0.0.1';
}

// ── Game State ──────────────────────────────────────────────
let game = null;

function createGame() {
    return {
        phase: 'lobby',            // lobby → tutorial → countdown → playing → gameover
        timer: GAME_DURATION,
        countdownTimer: 3,
        player: {
            ws: null,
            connected: false,
            ready: false,
        },
        display: null,

        // Compression tracking
        compressions: [],          // Array of { time, depth, recoilQuality, interval }
        totalCompressions: 0,
        currentBPM: 0,
        currentDepth: 0,
        currentRecoil: 0,
        lastCompressionTime: 0,

        // Rolling window for live BPM (last 10 compressions)
        recentIntervals: [],

        // Scoring
        score: 0,
        rateScore: 0,
        depthScore: 0,
        recoilScore: 0,
        consistencyScore: 0,
        grade: '-',
        combo: 0,                  // consecutive "good" compressions
        maxCombo: 0,
        perfectCount: 0,
        goodCount: 0,
        badCount: 0,

        // Feedback
        feedback: '',              // current feedback text
        feedbackType: 'neutral',   // 'perfect', 'good', 'warning', 'bad'
        events: [],

        // Stats for game over
        avgBPM: 0,
        avgDepth: 0,
        avgRecoil: 0,
        bpmStdDev: 0,
        depthStdDev: 0,
        tips: [],
    };
}

// ── Scoring Functions ───────────────────────────────────────

function scoreRate(bpm) {
    if (bpm === 0) return 0;
    if (bpm >= TARGET_BPM_LOW && bpm <= TARGET_BPM_HIGH) {
        // In the sweet spot — score based on closeness to center
        const deviation = Math.abs(bpm - TARGET_BPM_MID);
        return Math.max(0.85, 1.0 - (deviation / 20) * 0.15);
    }
    // Outside range — quadratic falloff
    const distance = bpm < TARGET_BPM_LOW
        ? TARGET_BPM_LOW - bpm
        : bpm - TARGET_BPM_HIGH;
    return Math.max(0, 1.0 - (distance / 40) ** 1.5);
}

function scoreDepth(depth) {
    if (depth <= 0) return 0;
    if (depth >= TARGET_DEPTH_LOW && depth <= TARGET_DEPTH_HIGH) {
        const deviation = Math.abs(depth - TARGET_DEPTH_MID);
        return Math.max(0.85, 1.0 - (deviation / 1.0) * 0.15);
    }
    const distance = depth < TARGET_DEPTH_LOW
        ? TARGET_DEPTH_LOW - depth
        : depth - TARGET_DEPTH_HIGH;
    return Math.max(0, 1.0 - (distance / 4) ** 1.5);
}

function scoreRecoil(recoil) {
    if (recoil >= PERFECT_RECOIL_RATIO) return 1.0;
    if (recoil >= MIN_RECOIL_RATIO) return 0.7 + 0.3 * ((recoil - MIN_RECOIL_RATIO) / (PERFECT_RECOIL_RATIO - MIN_RECOIL_RATIO));
    return Math.max(0, recoil / MIN_RECOIL_RATIO * 0.7);
}

function calcConsistency(values) {
    if (values.length < 3) return 1.0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 1;
    // CV < 0.05 = perfect, CV > 0.3 = terrible
    return Math.max(0, 1.0 - (cv / 0.3));
}

function calcGrade(score) {
    if (score >= 0.90) return 'A';
    if (score >= 0.75) return 'B';
    if (score >= 0.60) return 'C';
    if (score >= 0.40) return 'D';
    return 'F';
}

function generateTips(game) {
    const tips = [];
    if (game.avgBPM < TARGET_BPM_LOW) {
        tips.push('⬆️ Speed up! Aim for 100-120 compressions per minute. Try pushing to the beat of "Stayin\' Alive" by the Bee Gees.');
    } else if (game.avgBPM > TARGET_BPM_HIGH) {
        tips.push('⬇️ Slow down slightly. Too-fast compressions don\'t allow the heart to refill. Target 100-120 BPM.');
    }
    if (game.avgDepth < TARGET_DEPTH_LOW) {
        tips.push('💪 Push harder! Effective CPR needs at least 5 cm (2 inches) of chest compression. Use your body weight, not just your arms.');
    } else if (game.avgDepth > TARGET_DEPTH_HIGH) {
        tips.push('🛡️ Slightly lighter! Compressing beyond 6 cm risks rib fractures. Keep it in the 5-6 cm range.');
    }
    if (game.avgRecoil < MIN_RECOIL_RATIO) {
        tips.push('🔄 Allow full chest recoil! Lift your hands completely between compressions so the heart can refill with blood.');
    }
    if (game.bpmStdDev > 15) {
        tips.push('🎵 Keep a steady rhythm! Try counting "1-and-2-and-3-and-4" or use a metronome at 110 BPM.');
    }
    if (game.totalCompressions < 20 && game.phase === 'gameover') {
        tips.push('📈 Keep trying! CPR takes practice. The more you train, the more natural the rhythm becomes.');
    }
    if (tips.length === 0) {
        tips.push('🌟 Excellent technique! You\'re performing CPR at a life-saving level. Keep practicing to stay sharp!');
    }
    return tips;
}

// ── Process Compression from Phone ──────────────────────────
function processCompression(data) {
    if (!game || game.phase !== 'playing') return;

    const now = Date.now();
    const depth = Math.max(0, data.depth || 0);
    const recoil = Math.min(1, Math.max(0, data.recoil || 0));

    // Calculate interval
    let interval = 0;
    if (game.lastCompressionTime > 0) {
        interval = now - game.lastCompressionTime;
    }
    game.lastCompressionTime = now;

    // Store compression
    const compression = { time: now, depth, recoil, interval };
    game.compressions.push(compression);
    game.totalCompressions++;

    // Update rolling BPM (last 10 intervals)
    if (interval > 0 && interval < 3000) {
        game.recentIntervals.push(interval);
        if (game.recentIntervals.length > 10) game.recentIntervals.shift();
    }

    // Calculate current BPM from recent intervals
    if (game.recentIntervals.length >= 2) {
        const avgInterval = game.recentIntervals.reduce((a, b) => a + b, 0) / game.recentIntervals.length;
        game.currentBPM = Math.round(60000 / avgInterval);
    }

    game.currentDepth = depth;
    game.currentRecoil = recoil;

    // Score this individual compression
    const rateS = game.recentIntervals.length >= 2 ? scoreRate(game.currentBPM) : 0.5;
    const depthS = scoreDepth(depth);
    const recoilS = scoreRecoil(recoil);

    const compScore = (rateS + depthS + recoilS) / 3;

    // Classify compression quality
    let quality = 'bad';
    if (compScore >= 0.85) {
        quality = 'perfect';
        game.perfectCount++;
        game.combo++;
    } else if (compScore >= 0.60) {
        quality = 'good';
        game.goodCount++;
        game.combo++;
    } else {
        game.badCount++;
        game.combo = 0;
    }

    if (game.combo > game.maxCombo) game.maxCombo = game.combo;

    // Generate feedback
    if (quality === 'perfect') {
        game.feedback = game.combo >= 5 ? `🔥 ${game.combo}x COMBO!` : '⭐ PERFECT!';
        game.feedbackType = 'perfect';
    } else if (quality === 'good') {
        game.feedback = '👍 Good!';
        game.feedbackType = 'good';
        // Add specific tip
        if (depthS < 0.6) game.feedback = '👇 Push Deeper!';
        else if (rateS < 0.6 && game.currentBPM < TARGET_BPM_LOW) game.feedback = '⏩ Faster!';
        else if (rateS < 0.6 && game.currentBPM > TARGET_BPM_HIGH) game.feedback = '⏪ Slower!';
        else if (recoilS < 0.6) game.feedback = '🔄 Full Recoil!';
    } else {
        game.feedbackType = 'bad';
        if (depth < 3) game.feedback = '💪 Push HARDER!';
        else if (game.currentBPM > 0 && game.currentBPM < 80) game.feedback = '⏩ Too SLOW!';
        else if (game.currentBPM > 140) game.feedback = '⏪ Too FAST!';
        else if (recoil < 0.5) game.feedback = '🔄 Let chest RECOIL!';
        else game.feedback = '⚠️ Adjust technique!';
    }

    // Update running scores
    updateRunningScores();

    // Push event
    game.events.push(`compression_${game.totalCompressions}_${quality}`);
    if (game.events.length > 8) game.events = game.events.slice(-8);

    console.log(`[CPR] #${game.totalCompressions} depth:${depth.toFixed(1)}cm BPM:${game.currentBPM} recoil:${(recoil * 100).toFixed(0)}% → ${quality}`);
}

function updateRunningScores() {
    if (game.compressions.length === 0) return;

    const recent = game.compressions.slice(-20); // last 20 compressions for scoring

    // Rate score
    const intervals = recent.filter(c => c.interval > 0 && c.interval < 3000).map(c => c.interval);
    if (intervals.length >= 2) {
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const avgBPM = 60000 / avgInterval;
        game.rateScore = scoreRate(avgBPM);
        game.avgBPM = Math.round(avgBPM);
        game.bpmStdDev = Math.sqrt(intervals.reduce((s, v) => s + (v - avgInterval) ** 2, 0) / intervals.length) * 60000 / (avgInterval * avgInterval);
    }

    // Depth score
    const depths = recent.map(c => c.depth).filter(d => d > 0);
    if (depths.length > 0) {
        const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;
        game.depthScore = scoreDepth(avgDepth);
        game.avgDepth = Math.round(avgDepth * 10) / 10;
        game.depthStdDev = Math.sqrt(depths.reduce((s, v) => s + (v - avgDepth) ** 2, 0) / depths.length);
    }

    // Recoil score
    const recoils = recent.map(c => c.recoil);
    if (recoils.length > 0) {
        const avgRecoil = recoils.reduce((a, b) => a + b, 0) / recoils.length;
        game.recoilScore = scoreRecoil(avgRecoil);
        game.avgRecoil = Math.round(avgRecoil * 100);
    }

    // Consistency score
    game.consistencyScore = (
        calcConsistency(intervals) * 0.6 +
        calcConsistency(depths) * 0.4
    );

    // Weighted total score
    game.score = Math.round((
        game.rateScore * WEIGHT_RATE +
        game.depthScore * WEIGHT_DEPTH +
        game.recoilScore * WEIGHT_RECOIL +
        game.consistencyScore * WEIGHT_CONSISTENCY
    ) * 100);

    game.grade = calcGrade(game.score / 100);
}

// ── Game Timer & Loop ───────────────────────────────────────
let timerInterval = null;
let gameLoopInterval = null;

function startCountdown() {
    game.phase = 'countdown';
    game.countdownTimer = 3;
    broadcastState();

    const countInterval = setInterval(() => {
        game.countdownTimer--;
        broadcastState();
        if (game.countdownTimer <= 0) {
            clearInterval(countInterval);
            startGame();
        }
    }, 1000);
}

function startGame() {
    game.phase = 'playing';
    game.timer = GAME_DURATION;
    game.lastCompressionTime = 0;
    game.compressions = [];
    game.recentIntervals = [];

    // Notify phone
    if (game.player.ws) {
        safeSend(game.player.ws, { type: 'gameStart', timer: GAME_DURATION });
    }

    timerInterval = setInterval(() => {
        game.timer--;
        if (game.timer <= 0) {
            clearInterval(timerInterval);
            clearInterval(gameLoopInterval);
            endGame();
        }
    }, 1000);

    gameLoopInterval = setInterval(() => {
        if (game.phase !== 'playing') return;

        // Decay feedback after 1.5s of no compression
        if (Date.now() - game.lastCompressionTime > 1500 && game.totalCompressions > 0) {
            game.feedback = '❗ Keep Going!';
            game.feedbackType = 'warning';
        }

        broadcastState();
    }, TICK_MS);
}

function endGame() {
    game.phase = 'gameover';
    updateRunningScores();
    game.tips = generateTips(game);

    broadcastState();

    // Send game over to phone
    if (game.player.ws) {
        safeSend(game.player.ws, {
            type: 'gameOver',
            score: game.score,
            grade: game.grade,
            totalCompressions: game.totalCompressions,
            avgBPM: game.avgBPM,
            avgDepth: game.avgDepth,
            avgRecoil: game.avgRecoil,
            tips: game.tips,
        });
    }

    console.log(`[GAME] Game Over! Score: ${game.score} Grade: ${game.grade} Compressions: ${game.totalCompressions}`);
}

// ── Broadcasting ────────────────────────────────────────────
function buildStatePayload() {
    return {
        type: 'gameState',
        phase: game.phase,
        timer: game.timer,
        countdownTimer: game.countdownTimer,
        player: {
            connected: !!game.player.ws,
            ready: game.player.ready,
        },
        compressions: {
            total: game.totalCompressions,
            currentBPM: game.currentBPM,
            currentDepth: game.currentDepth,
            currentRecoil: Math.round(game.currentRecoil * 100),
        },
        scoring: {
            score: game.score,
            grade: game.grade,
            rateScore: Math.round(game.rateScore * 100),
            depthScore: Math.round(game.depthScore * 100),
            recoilScore: Math.round(game.recoilScore * 100),
            consistencyScore: Math.round(game.consistencyScore * 100),
            combo: game.combo,
            maxCombo: game.maxCombo,
            perfectCount: game.perfectCount,
            goodCount: game.goodCount,
            badCount: game.badCount,
        },
        feedback: game.feedback,
        feedbackType: game.feedbackType,
        events: game.events,
        // Game over data
        avgBPM: game.avgBPM,
        avgDepth: game.avgDepth,
        avgRecoil: game.avgRecoil,
        tips: game.tips || [],
        // Recent compression depths for waveform (last 30)
        waveform: game.compressions.slice(-30).map(c => ({
            depth: c.depth,
            interval: c.interval,
            time: c.time,
        })),
    };
}

function broadcastState() {
    const payload = JSON.stringify(buildStatePayload());
    if (game.display && game.display.readyState === 1) {
        game.display.send(payload);
    }
}

function safeSend(ws, obj) {
    try {
        if (ws.readyState === 1) ws.send(JSON.stringify(obj));
    } catch (e) { /* ignore */ }
}

// ── HTTP Server ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, '..', 'public', req.url === '/' ? '/game/index.html' : req.url);

    if (req.url === '/game' || req.url === '/game/') {
        filePath = path.join(__dirname, '..', 'public', 'game', 'index.html');
    }
    if (req.url === '/mobile' || req.url === '/mobile/') {
        filePath = path.join(__dirname, '..', 'public', 'mobile', 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// ── WebSocket Server ────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    const url = req.url || '';
    console.log(`[WS] Connection from ${url}`);

    if (url.startsWith('/display')) {
        // Game display connection
        if (timerInterval) clearInterval(timerInterval);
        if (gameLoopInterval) clearInterval(gameLoopInterval);
        game = createGame();
        game.display = ws;
        console.log('[WS] Game display connected');

        // Generate QR code (HTTPS URL for sensor access)
        const qrIP = getLocalIP();
        const mobileURL = `https://${qrIP}:${HTTPS_PORT}/mobile/`;
        QRCode.toDataURL(mobileURL, { width: 300, margin: 2 }, (err, dataUrl) => {
            if (!err) {
                safeSend(ws, { type: 'qrCode', url: dataUrl, mobileURL });
            }
        });

        broadcastState();

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                // Keyboard simulation — space bar compression
                if (msg.type === 'simCompression' && game.phase === 'playing') {
                    processCompression({
                        depth: 4.5 + Math.random() * 2.0,   // 4.5 - 6.5 cm
                        recoil: 0.7 + Math.random() * 0.3,  // 70-100%
                    });
                }
                if (msg.type === 'startTutorial') {
                    game.phase = 'tutorial';
                    broadcastState();
                }
                if (msg.type === 'skipTutorial') {
                    if (game.player.ready) {
                        startCountdown();
                    }
                }
            } catch (e) { /* ignore */ }
        });

        ws.on('close', () => {
            console.log('[WS] Game display disconnected');
            if (game) game.display = null;
        });

    } else if (url.startsWith('/player')) {
        if (!game) game = createGame();

        if (game.player.ws) {
            safeSend(ws, { type: 'error', message: 'A player is already connected' });
            ws.close();
            return;
        }

        game.player.ws = ws;
        game.player.connected = true;
        console.log('[WS] Player (phone) connected');
        safeSend(ws, { type: 'assigned', role: 'player' });
        broadcastState();

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);

                if (msg.type === 'ready') {
                    game.player.ready = true;
                    console.log('[WS] Player is ready');
                    broadcastState();

                    // If display is showing tutorial or lobby, advance
                    if (game.phase === 'lobby') {
                        game.phase = 'tutorial';
                        broadcastState();
                    }
                }

                if (msg.type === 'startGame') {
                    if (game.phase === 'tutorial' && game.player.ready) {
                        startCountdown();
                    }
                }

                if (msg.type === 'compression' && game.phase === 'playing') {
                    processCompression({
                        depth: msg.depth || 0,
                        recoil: msg.recoil || 0,
                    });
                }

            } catch (e) {
                console.error('[WS] Bad message:', e);
            }
        });

        ws.on('close', () => {
            console.log('[WS] Player disconnected');
            game.player.ws = null;
            game.player.connected = false;
            game.player.ready = false;

            if (game.phase === 'playing') {
                clearInterval(timerInterval);
                clearInterval(gameLoopInterval);
                endGame();
            }
            broadcastState();
        });

    } else if (url.startsWith('/reset')) {
        console.log('[WS] Game reset requested');
        if (timerInterval) clearInterval(timerInterval);
        if (gameLoopInterval) clearInterval(gameLoopInterval);
        game = createGame();
        ws.close();
    }
});

// ── HTTPS — auto-generate cert with OpenSSL at startup ──────
const localIP = getLocalIP();
const certDir = path.join(__dirname, '..', 'certs');
let httpsServer = null;
let wssSecure = null;

try {
    const { execSync } = require('child_process');
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

    const keyPath = path.join(certDir, 'key.pem');
    const certPath = path.join(certDir, 'cert.pem');

    console.log(`[HTTPS] Generating cert for IP ${localIP} ...`);
    execSync(
        `openssl req -x509 -newkey rsa:2048 ` +
        `-keyout "${keyPath}" -out "${certPath}" ` +
        `-days 30 -nodes -subj /CN=CPRTrainer ` +
        `-addext "subjectAltName=IP:${localIP},IP:127.0.0.1,DNS:localhost"`,
        { stdio: 'pipe' }
    );
    console.log('[HTTPS] Cert generated OK');

    const key = fs.readFileSync(keyPath);
    const cert = fs.readFileSync(certPath);

    httpsServer = https.createServer({ key, cert }, server.listeners('request')[0]);

    wssSecure = new WebSocketServer({ server: httpsServer });
    wssSecure.on('connection', (ws, req) => {
        wss.emit('connection', ws, req);
    });
} catch (e) {
    console.warn('[HTTPS] Failed to generate cert — is OpenSSL installed?');
    console.warn('  Error:', e.message);
    console.warn('  Phone sensors will NOT work without HTTPS.');
}

// ── Start HTTP and HTTPS ────────────────────────────────────
server.listen(PORT, () => {
    const ip = localIP;
    const startHttps = () => {
        if (httpsServer) {
            httpsServer.listen(HTTPS_PORT, () => {
                console.log(`  📱 Mobile URL : https://${ip}:${HTTPS_PORT}/mobile/`);
                console.log('  ─────────────────────────────────────────');
                console.log('  ⚠️  Phone: tap "Advanced" → "Proceed" on cert warning');
                console.log('  ─────────────────────────────────────────');
                console.log('  Space bar on game page = simulate compression');
                console.log('');
            });
        } else {
            console.log('  ⚠️  HTTPS disabled — generate certs for phone sensor access!');
            console.log('');
        }
    };
    console.log('');
    console.log('  ❤️  CPR TRAINER — Learn to Save a Life  ❤️');
    console.log('  ─────────────────────────────────────────');
    console.log(`  Game (HTTP)   : http://localhost:${PORT}/game/`);
    console.log(`  Game (HTTPS)  : https://${ip}:${HTTPS_PORT}/game/`);
    startHttps();
});
