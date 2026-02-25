// ============================================================
// BALANCE DUEL — Mobile Controller
// Gyroscope tilt → floating shard control
// ============================================================

const loadingScreen = document.getElementById('loadingScreen');
const waitingScreen = document.getElementById('waitingScreen');
const gameScreen = document.getElementById('gameScreen');
const loaderText = document.getElementById('loaderText');
const loaderSub = document.getElementById('loaderSub');
const shardVisual = document.getElementById('shardVisual');
const shardDot = document.getElementById('shardDot');
const tiltXVal = document.getElementById('tiltXVal');
const tiltYVal = document.getElementById('tiltYVal');
const crystalStatus = document.getElementById('crystalStatus');
const playerBadge = document.getElementById('playerBadge');
const connDot = document.getElementById('connDot');
const connText = document.getElementById('connText');

let socket = null;
let sessionId = null;
let playerNum = 0;
let isGameActive = false;

// Tilt
let betaNorm = 0;  // front-back (-1..1)
let gammaNorm = 0; // left-right (-1..1)

let lastEmitTime = 0;
const EMIT_INTERVAL = 66; // ~15 Hz

// Screen management
function showScreen(name) {
    loadingScreen.classList.remove('active');
    waitingScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    if (name === 'loading') loadingScreen.classList.add('active');
    if (name === 'waiting') waitingScreen.classList.add('active');
    if (name === 'game') gameScreen.classList.add('active');
}

function setStatus(main, sub) {
    if (loaderText) loaderText.textContent = main;
    if (loaderSub) loaderSub.textContent = sub || '';
}

function setStatusError(main, sub) {
    setStatus('❌ ' + main, sub);
    if (loaderText) loaderText.style.color = '#ef4444';
}

// Device orientation
function handleOrientation(event) {
    const beta = event.beta || 0;   // -180 to 180 (front-back)
    const gamma = event.gamma || 0; // -90 to 90 (left-right)

    // Normalize: clamp at ±30 degrees for sensitivity and map to -1..1
    betaNorm = Math.max(-1, Math.min(1, beta / 30));
    gammaNorm = Math.max(-1, Math.min(1, gamma / 30));

    if (isGameActive) {
        updateUI();
        emitTilt();
    }
}

function updateUI() {
    // Rotate the shard visual
    const rotX = betaNorm * 20;  // degrees
    const rotY = gammaNorm * 20;
    shardVisual.style.transform = `perspective(300px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;

    // Move the dot
    const dotX = gammaNorm * 40; // px
    const dotY = betaNorm * 40;
    shardDot.style.transform = `translate(calc(-50% + ${dotX}px), calc(-50% + ${dotY}px))`;

    // Tilt values
    tiltXVal.textContent = `${Math.round(gammaNorm * 30)}°`;
    tiltYVal.textContent = `${Math.round(betaNorm * 30)}°`;

    // Color based on tilt magnitude
    const mag = Math.sqrt(betaNorm * betaNorm + gammaNorm * gammaNorm);
    if (mag < 0.3) {
        shardDot.style.background = '#00ff88';
        shardDot.style.boxShadow = '0 0 15px rgba(0, 255, 136, 0.6)';
    } else if (mag < 0.7) {
        shardDot.style.background = '#ffdd00';
        shardDot.style.boxShadow = '0 0 15px rgba(255, 221, 0, 0.6)';
    } else {
        shardDot.style.background = '#ff3355';
        shardDot.style.boxShadow = '0 0 15px rgba(255, 51, 85, 0.6)';
    }
}

function emitTilt() {
    const now = Date.now();
    if (now - lastEmitTime < EMIT_INTERVAL) return;
    lastEmitTime = now;

    if (socket && isGameActive) {
        socket.emit('bd-tilt', {
            beta: Math.round(betaNorm * 1000) / 1000,
            gamma: Math.round(gammaNorm * 1000) / 1000
        });
    }
}

// Sensor init
async function initSensors() {
    setStatus('Initializing Sensors...', 'Requesting gyroscope access');

    if (!('DeviceOrientationEvent' in window)) {
        setStatusError('Sensors Not Available', 'This device needs orientation sensors.');
        return false;
    }

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const perm = await DeviceOrientationEvent.requestPermission();
            if (perm !== 'granted') {
                setStatusError('Permission Denied', 'Orientation sensor access required.');
                return false;
            }
        } catch (err) {
            setStatusError('Permission Error', err.message);
            return false;
        }
    }

    window.addEventListener('deviceorientation', handleOrientation, true);

    return new Promise((resolve) => {
        let gotData = false;
        const timeout = setTimeout(() => {
            if (!gotData) {
                setStatusError('No Sensor Data', 'Orientation sensors not responding.');
                resolve(false);
            }
        }, 3000);
        const handler = (e) => {
            if ((e.beta !== null || e.gamma !== null) && !gotData) {
                gotData = true;
                clearTimeout(timeout);
                resolve(true);
            }
        };
        window.addEventListener('deviceorientation', handler, { once: false });
        setTimeout(() => window.removeEventListener('deviceorientation', handler), 3500);
    });
}

// Socket.IO
function initSocket() {
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('session');

    socket = io({
        transports: ['polling', 'websocket'],
        reconnectionAttempts: 5, reconnectionDelay: 1000, timeout: 10000
    });

    socket.on('connect', () => {
        setStatus('Connected!', 'Joining session...');
        connDot.classList.remove('disconnected');
        connText.textContent = 'Connected';

        if (sessionId) {
            socket.emit('join-session', { sessionId }, (response) => {
                if (response.error) { setStatusError('Join Failed', response.error); return; }
                playerNum = response.playerNum;
                playerBadge.textContent = 'P' + playerNum;
                playerBadge.className = 'player-badge p' + playerNum;
                showScreen('waiting');
            });
        } else {
            setStatusError('No Session', 'No session ID in URL.');
        }
    });

    socket.on('connect_error', (err) => setStatusError('Connection Error', err.message));

    socket.on('game-started', () => {
        isGameActive = true;
        showScreen('game');
    });

    socket.on('bd-crystal-status', (data) => {
        if (data.danger > 0.7) {
            crystalStatus.textContent = '⚠ DANGER';
            crystalStatus.className = 'crystal-status danger';
            if (navigator.vibrate) navigator.vibrate(50);
        } else if (data.danger > 0.4) {
            crystalStatus.textContent = '⚠ UNSTABLE';
            crystalStatus.className = 'crystal-status warning';
        } else {
            crystalStatus.textContent = '● STABLE';
            crystalStatus.className = 'crystal-status stable';
        }
    });

    socket.on('session-ended', (data) => {
        alert(data.reason || 'Session ended');
        window.location.href = '/';
    });

    socket.on('disconnect', () => {
        connDot.classList.add('disconnected');
        connText.textContent = 'Disconnected';
    });
}

async function init() {
    showScreen('loading');

    if (!window.isSecureContext) {
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isLocal) { setStatusError('HTTPS Required', 'Sensors need a secure connection.'); return; }
    }

    setStatus('Connecting...', `Server: ${location.host}`);
    initSocket();

    const ok = await initSensors();
    if (!ok) return;

    setStatus('✅ Sensors Ready!', 'Waiting for game start...');
}

init();
