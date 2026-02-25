const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Game Engines
const { CprEngine } = require('./engines/cpr-engine');
const { TowerSiegeEngine } = require('./engines/tower-siege-engine');
const { PlankEngine } = require('./engines/plank-engine');

const app = express();

// === IP DETECTION ===
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    const skipPatterns = [
        /virtualbox/i, /vmware/i, /vmnet/i, /vbox/i,
        /docker/i, /hyper-v/i, /vethernet/i, /loopback/i
    ];
    let fallbackIP = null;
    const candidates = [];
    for (const [name, ifaceList] of Object.entries(interfaces)) {
        const isVirtual = skipPatterns.some(pat => pat.test(name));
        for (const iface of ifaceList) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (!isVirtual) {
                    candidates.push({ name, ip: iface.address });
                } else if (!fallbackIP) {
                    fallbackIP = iface.address;
                }
            }
        }
    }
    const wifi = candidates.find(c => /wi-?fi|wireless|wlan/i.test(c.name));
    if (wifi) return wifi.ip;
    if (candidates.length > 0) return candidates[0].ip;
    return fallbackIP || 'localhost';
}

function getAllIPs() {
    const interfaces = os.networkInterfaces();
    const skipPatterns = [
        /virtualbox/i, /vmware/i, /vmnet/i, /vbox/i,
        /docker/i, /hyper-v/i, /vethernet/i, /loopback/i
    ];
    const results = [];
    for (const [name, ifaceList] of Object.entries(interfaces)) {
        const isVirtual = skipPatterns.some(pat => pat.test(name));
        for (const iface of ifaceList) {
            if (iface.family === 'IPv4' && !iface.internal) {
                results.push({ name, ip: iface.address, virtual: isVirtual });
            }
        }
    }
    return results;
}

// === SSL CERTIFICATE GENERATION ===
const CERT_DIR = path.join(__dirname, '.certs');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');

function generateCert() {
    if (!fs.existsSync(CERT_DIR)) {
        fs.mkdirSync(CERT_DIR, { recursive: true });
    }

    // Build SAN list with all local IPs
    const allIPs = getAllIPs();
    const sanParts = ['DNS:localhost', 'IP:127.0.0.1'];
    for (const entry of allIPs) {
        sanParts.push(`IP:${entry.ip}`);
    }
    const sanString = sanParts.join(',');

    console.log('  Generating SSL certificate via OpenSSL...');
    console.log(`  SANs: ${sanString}`);

    try {
        // Generate cert with openssl
        const cmd = `openssl req -x509 -newkey rsa:2048 -keyout "${KEY_PATH}" -out "${CERT_PATH}" -days 365 -nodes -subj "/CN=Motion Arena" -addext "subjectAltName=${sanString}"`;
        execSync(cmd, { stdio: 'pipe' });
        console.log('  ✅ SSL certificate generated successfully!');
        return {
            key: fs.readFileSync(KEY_PATH, 'utf8'),
            cert: fs.readFileSync(CERT_PATH, 'utf8')
        };
    } catch (err) {
        console.error('  ❌ OpenSSL failed, trying fallback...');
        // Fallback: use selfsigned package with key conversion
        return generateCertFallback(allIPs);
    }
}

function generateCertFallback(allIPs) {
    try {
        const selfsigned = require('selfsigned');
        const crypto = require('crypto');

        const altNames = [
            { type: 2, value: 'localhost' },
            { type: 7, ip: '127.0.0.1' }
        ];
        for (const entry of allIPs) {
            altNames.push({ type: 7, ip: entry.ip });
        }

        const attrs = [{ name: 'commonName', value: 'Motion Arena' }];
        const pems = selfsigned.generate(attrs, {
            days: 365,
            keySize: 2048,
            algorithm: 'sha256',
            extensions: [
                { name: 'subjectAltName', altNames },
                { name: 'basicConstraints', cA: false },
                { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
                { name: 'extKeyUsage', serverAuth: true }
            ]
        });

        // Convert PKCS#1 key to PKCS#8 for better TLS compatibility
        let key = pems.private;
        try {
            const keyObj = crypto.createPrivateKey(pems.private);
            key = keyObj.export({ type: 'pkcs8', format: 'pem' });
        } catch (e) {
            // Use original key if conversion fails
        }

        console.log('  ✅ SSL certificate generated (fallback method)');
        return { key, cert: pems.cert };
    } catch (err) {
        console.error('  ❌ All cert generation methods failed:', err.message);
        return null;
    }
}

// Generate certificate
const sslCreds = generateCert();

// === SERVER SETUP ===
const PORT = 3000;
const HTTPS_PORT = 3443;

const httpServer = http.createServer(app);

let httpsServer = null;
if (sslCreds) {
    httpsServer = https.createServer({
        key: sslCreds.key,
        cert: sslCreds.cert
    }, app);
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO setup
const ioInstances = [];

if (httpsServer) {
    const ioHttps = new Server(httpsServer, { cors: { origin: '*' } });
    ioInstances.push(ioHttps);
}

const ioHttp = new Server(httpServer, { cors: { origin: '*' } });
ioInstances.push(ioHttp);

// === GAME SESSIONS ===
const sessions = {};

function generateSessionId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Broadcast to all io instances
function broadcastToSession(sessionId, event, data) {
    for (const io of ioInstances) {
        io.to(sessionId).emit(event, data);
    }
}

// API: Generate QR code
app.get('/api/qr/:sessionId', async (req, res) => {
    const ip = req.query.ip || getLocalIP();
    const port = httpsServer ? HTTPS_PORT : PORT;
    const protocol = httpsServer ? 'https' : 'http';
    const gameName = req.query.game || '';

    // Route games to their dedicated controller pages
    const controllerMap = {
        'cpr-trainer': '/cpr-trainer/controller.html',
        'tower-siege': '/tower-siege/controller.html',
        'focus-mode': '/focus-mode/controller.html',
        'plank-wars': '/plank-wars/controller.html',
        'gravity-bridge': '/gravity-bridge/controller.html',

        'balance-duel': '/balance-duel/controller.html'
    };
    const controllerPath = controllerMap[gameName] || '/controller.html';

    const url = `${protocol}://${ip}:${port}${controllerPath}?session=${req.params.sessionId}`;
    try {
        const qrDataUrl = await QRCode.toDataURL(url, {
            width: 400,
            margin: 2,
            color: { dark: '#ffffff', light: '#00000000' }
        });
        res.json({ qr: qrDataUrl, url });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate QR' });
    }
});

// API: Get IPs
app.get('/api/ip', (req, res) => {
    res.json({
        ip: getLocalIP(),
        port: PORT,
        httpsPort: httpsServer ? HTTPS_PORT : null,
        allIPs: getAllIPs(),
        hasHttps: !!httpsServer
    });
});

// === SOCKET HANDLER ===
function socketHandler(socket) {
    console.log(`[Socket] Connected: ${socket.id}`);

    socket.on('create-session', (data, callback) => {
        const sessionId = generateSessionId();
        const mode = data.mode || '2p';  // '1p' or '2p'
        sessions[sessionId] = {
            id: sessionId,
            game: data.game,
            mode: mode,
            maxPlayers: mode === '1p' ? 1 : 2,
            laptop: socket.id,
            players: [],
            state: 'waiting',
            gameState: null
        };
        socket.join(sessionId);
        socket.sessionId = sessionId;
        socket.role = 'laptop';
        console.log(`[Session] Created: ${sessionId} for game: ${data.game} (${mode})`);
        if (callback) callback({ sessionId, mode });
    });

    socket.on('join-session', (data, callback) => {
        const session = sessions[data.sessionId];
        if (!session) {
            if (callback) callback({ error: 'Session not found' });
            return;
        }
        if (session.players.length >= session.maxPlayers) {
            if (callback) callback({ error: 'Session is full' });
            return;
        }

        const playerNum = session.players.length + 1;
        session.players.push({ id: socket.id, playerNum, ready: false });

        socket.join(data.sessionId);
        socket.sessionId = data.sessionId;
        socket.role = 'player';
        socket.playerNum = playerNum;

        console.log(`[Session] Player ${playerNum} joined: ${data.sessionId} (${session.mode})`);

        broadcastToSession(data.sessionId, 'player-joined', {
            playerNum, totalPlayers: session.players.length, mode: session.mode
        });

        // Assign team for Tower Siege (player 1 = blue, player 2 = red)
        const team = playerNum === 1 ? 'blue' : 'red';
        if (callback) callback({ playerNum, game: session.game, mode: session.mode, team });

        if (session.players.length >= session.maxPlayers) {
            session.state = 'ready';
            broadcastToSession(data.sessionId, 'session-ready', { game: session.game, mode: session.mode });
        }
    });

    socket.on('gesture', (data) => {
        const session = sessions[socket.sessionId];
        if (!session || session.state !== 'playing') return;
        broadcastToSession(socket.sessionId, 'gesture', {
            playerNum: socket.playerNum,
            action: data.action,
            timestamp: Date.now()
        });
    });

    // Ghost of the Breath Temple: relay breath events from controller to game
    socket.on('breath-event', (data) => {
        const session = sessions[socket.sessionId];
        if (!session || session.state !== 'playing') return;
        broadcastToSession(socket.sessionId, 'breath-event', {
            playerNum: socket.playerNum,
            timestamp: Date.now()
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  CPR TRAINER — Socket.IO Event Handlers
    // ═══════════════════════════════════════════════════════════

    // Compression data from the mobile controller
    socket.on('cpr-compression', (data) => {
        const session = sessions[socket.sessionId];
        if (!session || !session.gameEngine) return;
        if (session.game !== 'cpr-trainer') return;
        session.gameEngine.processCompression({
            depth: data.depth || 0,
            recoil: data.recoil || 0,
            tiltAngle: data.tiltAngle || 0,
        });
    });

    // Simulated compression from keyboard (Space bar on game display)
    socket.on('cpr-sim-compression', () => {
        const session = sessions[socket.sessionId];
        if (!session || !session.gameEngine) return;
        if (session.game !== 'cpr-trainer') return;
        // Simulate a decent compression for keyboard testing
        session.gameEngine.processCompression({
            depth: 5.0 + Math.random() * 1.0,
            recoil: 0.85 + Math.random() * 0.15
        });
    });

    // Player ready signal for CPR
    socket.on('cpr-player-ready', (data) => {
        const session = sessions[socket.sessionId];
        if (!session) return;
        if (session.game !== 'cpr-trainer') return;

        const difficulty = (data && data.difficulty) || 'beginner';

        // Create engine on-demand if doesn't exist yet
        if (!session.gameEngine) {
            session.gameEngine = new CprEngine(socket.sessionId, broadcastToSession, difficulty);
            console.log(`[Session] CPR engine created on-demand for ${socket.sessionId} (${difficulty})`);
        }

        session.gameEngine.playerReady = true;
        session.gameEngine.playerConnected = true;
        session.state = 'playing';

        // Broadcast game-started so controller switches to game screen
        broadcastToSession(socket.sessionId, 'game-started', { game: session.game, mode: session.mode });

        // Auto-start scenario when player is ready
        if (session.gameEngine.phase === 'lobby') {
            session.gameEngine.startScenario();
        }
        console.log(`[CPR:${socket.sessionId}] Player ready (${difficulty}) — starting scenario`);
    });

    // ═══════════════════════════════════════════════════════════
    //  TOWER SIEGE — Socket.IO Event Handlers
    // ═══════════════════════════════════════════════════════════

    // Push-up count update from controller
    socket.on('ts-pushup', (data) => {
        const session = sessions[socket.sessionId];
        if (!session || !session.gameEngine) return;
        if (session.game !== 'tower-siege') return;
        const team = socket.playerNum === 1 ? 'blue' : 'red';
        session.gameEngine.addSoldiersFromPushup(team, data.count);
    });

    // Deploy mode toggle from controller
    socket.on('ts-deploy-mode', (data) => {
        const session = sessions[socket.sessionId];
        if (!session || !session.gameEngine) return;
        if (session.game !== 'tower-siege') return;
        const team = socket.playerNum === 1 ? 'blue' : 'red';
        session.gameEngine.players[team].deployMode = data.mode || 'auto';
        console.log(`[TS:${socket.sessionId}] ${team} deploy mode: ${data.mode}`);
    });

    // Head direction for manual deploy
    socket.on('ts-head-direction', (data) => {
        const session = sessions[socket.sessionId];
        if (!session || !session.gameEngine) return;
        if (session.game !== 'tower-siege') return;
        const team = socket.playerNum === 1 ? 'blue' : 'red';
        session.gameEngine.players[team].headDirection = data.direction || 'center';
    });

    // Manual deploy trigger
    socket.on('ts-manual-deploy', (data) => {
        const session = sessions[socket.sessionId];
        if (!session || !session.gameEngine) return;
        if (session.game !== 'tower-siege') return;
        const team = socket.playerNum === 1 ? 'blue' : 'red';
        session.gameEngine.manualDeploy(team, data.direction);
    });

    // Player ready signal for Tower Siege
    socket.on('ts-player-ready', () => {
        const session = sessions[socket.sessionId];
        if (!session || !session.gameEngine) return;
        if (session.game !== 'tower-siege') return;
        const team = socket.playerNum === 1 ? 'blue' : 'red';
        session.gameEngine.players[team].ready = true;
        console.log(`[TS:${socket.sessionId}] ${team} player ready`);

        // Check if we should start
        const engine = session.gameEngine;
        const blueReady = engine.players.blue.ready;
        const redReady = engine.mode === 'ai' ? true : engine.players.red.ready;
        if (blueReady && redReady && engine.phase === 'lobby') {
            engine.startCountdown();
        }
    });

    // ═══════════════════════════════════════════════════════════
    //  FOCUS MODE — Socket.IO Event Handlers
    // ═══════════════════════════════════════════════════════════

    socket.on('focus-timer-sync', (data) => {
        broadcastToSession(socket.sessionId, 'focus-timer-sync', {
            ...data, playerNum: socket.playerNum
        });
    });

    socket.on('focus-slouch', (data) => {
        broadcastToSession(socket.sessionId, 'focus-slouch', {
            ...data, playerNum: socket.playerNum
        });
    });

    socket.on('focus-break-start', (data) => {
        broadcastToSession(socket.sessionId, 'focus-break-start', {
            ...data, playerNum: socket.playerNum
        });
    });

    socket.on('focus-break-complete', (data) => {
        broadcastToSession(socket.sessionId, 'focus-break-complete', {
            ...data, playerNum: socket.playerNum
        });
    });

    socket.on('focus-breath-complete', (data) => {
        broadcastToSession(socket.sessionId, 'focus-breath-complete', {
            ...data, playerNum: socket.playerNum
        });
    });

    socket.on('focus-streak', (data) => {
        broadcastToSession(socket.sessionId, 'focus-streak', {
            ...data, playerNum: socket.playerNum
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  PLANK WARS — Socket.IO Event Handlers
    // ═══════════════════════════════════════════════════════════

    socket.on('plank-start-challenge', (data) => {
        const session = sessions[socket.sessionId];
        if (!session || !session.gameEngine) return;
        if (session.game !== 'plank-wars') return;
        session.gameEngine.startCountdown();
    });

    socket.on('plank-data', (data) => {
        const session = sessions[socket.sessionId];
        if (!session || !session.gameEngine) return;
        if (session.game !== 'plank-wars') return;
        session.gameEngine.updatePlankData(socket.id, {
            isPlanking: data.isPlanking,
            stability: data.stability
        });
    });

    socket.on('plank-player-ready', () => {
        const session = sessions[socket.sessionId];
        if (!session) return;
        if (session.game !== 'plank-wars') return;
        broadcastToSession(socket.sessionId, 'plank-player-ready', {
            playerNum: socket.playerNum
        });
    });



    // ═══════════════════════════════════════════════════════════
    //  GRAVITY BRIDGE — Socket.IO Event Handlers
    // ═══════════════════════════════════════════════════════════

    socket.on('gb-movement', (data) => {
        const session = sessions[socket.sessionId];
        if (!session || session.state !== 'playing') return;
        if (session.game !== 'gravity-bridge') return;
        broadcastToSession(socket.sessionId, 'gb-movement', {
            playerNum: socket.playerNum,
            height: data.height,
            tilt: data.tilt
        });
    });



    // ═══════════════════════════════════════════════════════════
    //  BALANCE DUEL — Socket.IO Event Handlers
    // ═══════════════════════════════════════════════════════════

    socket.on('bd-tilt', (data) => {
        const session = sessions[socket.sessionId];
        if (!session || session.state !== 'playing') return;
        if (session.game !== 'balance-duel') return;
        broadcastToSession(socket.sessionId, 'bd-tilt', {
            playerNum: socket.playerNum,
            beta: data.beta,
            gamma: data.gamma
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  GENERIC — Start Game (creates game engine)
    // ═══════════════════════════════════════════════════════════

    socket.on('start-game', () => {
        const session = sessions[socket.sessionId];
        if (!session || socket.role !== 'laptop') return;
        session.state = 'playing';
        broadcastToSession(socket.sessionId, 'game-started', { game: session.game, mode: session.mode });
        console.log(`[Session] Game started: ${socket.sessionId} (${session.mode})`);

        // Create game engine based on game type
        if (session.game === 'cpr-trainer' && !session.gameEngine) {
            session.gameEngine = new CprEngine(socket.sessionId, broadcastToSession);
            session.gameEngine.playerConnected = true;
            console.log(`[Session] CPR Trainer engine created for ${socket.sessionId}`);
        }

        // If player already sent cpr-player-ready before engine existed, auto-start
        if (session.game === 'cpr-trainer' && session.gameEngine && session.gameEngine.playerReady && session.gameEngine.phase === 'lobby') {
            session.gameEngine.startScenario();
            console.log(`[CPR:${socket.sessionId}] Player was already ready — auto-starting scenario`);
        }

        if (session.game === 'tower-siege' && !session.gameEngine) {
            const tsMode = session.mode === '1p' ? 'ai' : 'pvp';
            session.gameEngine = new TowerSiegeEngine(socket.sessionId, tsMode, broadcastToSession);
            console.log(`[Session] Tower Siege engine created for ${socket.sessionId} (${tsMode})`);
        }

        if (session.game === 'plank-wars' && !session.gameEngine) {
            session.gameEngine = new PlankEngine(socket.sessionId, broadcastToSession);
            // Add all existing players
            for (const p of session.players) {
                session.gameEngine.addPlayer(p.id, p.playerNum);
            }
            console.log(`[Session] Plank Wars engine created for ${socket.sessionId}`);
        }
    });

    // Laptop reconnection (when navigating from lobby → game page)
    socket.on('rejoin-laptop', (data, callback) => {
        const session = sessions[data.sessionId];
        if (!session) {
            console.log(`[Session] Rejoin failed — session ${data.sessionId} not found`);
            if (callback) callback({ error: 'Session not found' });
            return;
        }

        // Cancel pending destruction timer
        if (session._destroyTimer) {
            clearTimeout(session._destroyTimer);
            session._destroyTimer = null;
            console.log(`[Session] Laptop reconnected in time: ${data.sessionId}`);
        }

        // Take over laptop role
        session.laptop = socket.id;
        socket.join(data.sessionId);
        socket.sessionId = data.sessionId;
        socket.role = 'laptop';

        console.log(`[Session] Laptop rejoined: ${data.sessionId} (state: ${session.state}, mode: ${session.mode})`);
        if (callback) callback({
            sessionId: data.sessionId,
            game: session.game,
            mode: session.mode,
            state: session.state,
            players: session.players.map(p => ({ playerNum: p.playerNum }))
        });
    });

    socket.on('game-over', (data) => {
        const session = sessions[socket.sessionId];
        if (!session) return;
        session.state = 'ended';
        broadcastToSession(socket.sessionId, 'game-ended', data);
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Disconnected: ${socket.id}`);
        const session = sessions[socket.sessionId];
        if (!session) return;

        if (socket.role === 'laptop') {
            // Grace period: wait 10 seconds for laptop to reconnect
            // (this happens when navigating from lobby → game page)
            console.log(`[Session] Laptop disconnected from ${socket.sessionId} — waiting 10s for reconnect...`);
            session._destroyTimer = setTimeout(() => {
                // Only destroy if laptop hasn't reconnected
                if (sessions[socket.sessionId] && sessions[socket.sessionId].laptop === socket.id) {
                    console.log(`[Session] Laptop did not reconnect — destroying session ${socket.sessionId}`);
                    // Destroy game engine if it exists
                    if (session.gameEngine && typeof session.gameEngine.destroy === 'function') {
                        session.gameEngine.destroy();
                    }
                    broadcastToSession(socket.sessionId, 'session-ended', { reason: 'Host disconnected' });
                    delete sessions[socket.sessionId];
                }
            }, 10000);
        } else if (socket.role === 'player') {
            session.players = session.players.filter(p => p.id !== socket.id);
            broadcastToSession(socket.sessionId, 'player-left', {
                playerNum: socket.playerNum, totalPlayers: session.players.length
            });
            if (session.state === 'playing') {
                session.state = 'waiting';
                broadcastToSession(socket.sessionId, 'player-disconnected', {
                    playerNum: socket.playerNum
                });
            }
        }
    });
}

// Attach handler to all io instances
for (const io of ioInstances) {
    io.on('connection', socketHandler);
}

// === START SERVERS ===
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`  HTTP  server: http://localhost:${PORT}`);
});

if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        const localIP = getLocalIP();
        const allIPs = getAllIPs();
        console.log(`  HTTPS server: https://localhost:${HTTPS_PORT}`);
        console.log('');
        console.log('  ╔══════════════════════════════════════════════════════╗');
        console.log('  ║           🏟️  MOTION ARENA SERVER                    ║');
        console.log('  ╠══════════════════════════════════════════════════════╣');
        console.log(`  ║  Laptop:  http://localhost:${PORT}                       ║`);
        console.log(`  ║  Mobile:  https://${localIP}:${HTTPS_PORT}               `);
        console.log('  ╠══════════════════════════════════════════════════════╣');
        console.log('  ║  Network Interfaces:                                ║');
        for (const entry of allIPs) {
            const tag = entry.virtual ? ' (virtual)' : '';
            const selected = entry.ip === localIP ? ' ✅' : '';
            console.log(`  ║    ${entry.name}: ${entry.ip}${tag}${selected}`);
        }
        console.log('  ╠══════════════════════════════════════════════════════╣');
        console.log('  ║  ⚠️  Phone: tap "Advanced" → "Proceed" on warning  ║');
        console.log('  ╚══════════════════════════════════════════════════════╝');
        console.log('');
    });
} else {
    console.log('');
    console.log('  ⚠️  HTTPS unavailable — camera may not work on mobile');
    console.log('  ⚠️  Install OpenSSL or Git for Windows to enable HTTPS');
    console.log('');
}

// Error handling
httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n  ❌ Port ${PORT} is already in use! Close the other server first.\n`);
        process.exit(1);
    }
});

if (httpsServer) {
    httpsServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n  ❌ Port ${HTTPS_PORT} is already in use! Close the other server first.\n`);
            process.exit(1);
        }
    });
}
