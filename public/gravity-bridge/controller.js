// ============================================================
// GRAVITY BRIDGE — Mobile Controller
// Accelerometer (crouch/stand) + Gyroscope (tilt)
// ============================================================

// ── DOM ──────────────────────────────────────────────────────
const loadingScreen = document.getElementById('loadingScreen');
const waitingScreen = document.getElementById('waitingScreen');
const gameScreen = document.getElementById('gameScreen');

const loaderText = document.getElementById('loaderText');
const loaderSub = document.getElementById('loaderSub');
const heightFill = document.getElementById('heightFill');
const heightMarker = document.getElementById('heightMarker');
const heightValue = document.getElementById('heightValue');
const tiltIndicator = document.getElementById('tiltIndicator');
const syncLabel = document.getElementById('syncLabel');
const playerBadge = document.getElementById('playerBadge');
const connDot = document.getElementById('connDot');
const connText = document.getElementById('connText');

// ── State ────────────────────────────────────────────────────
let socket = null;
let sessionId = null;
let playerNum = 0;
let isGameActive = false;

// Accelerometer
let sensorReady = false;
let gravityY = 0;
const GRAVITY_ALPHA = 0.8;
let smoothAccY = 0;
const SMOOTH_ALPHA = 0.25;

// Calibration
let calibSamples = [];
const CALIB_COUNT = 30;
let neutralY = 0;
let calibDone = false;

// Height mapping: deviation from neutral standing position
// Crouching → positive accel spike on Y when phone is in pocket/hand
// We track accumulated vertical displacement
let heightNorm = 0.5; // 0 = full crouch, 1 = full stand, 0.5 = neutral

// Gyroscope tilt
let tiltNorm = 0; // -1 = left, 0 = center, 1 = right
let currentGamma = 0;

// Emit throttle
let lastEmitTime = 0;
const EMIT_INTERVAL = 66; // ~15 Hz

// ── Screen Management ────────────────────────────────────────
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

// ── Accelerometer: Detect Vertical Movement ──────────────────
function handleMotion(event) {
    const accG = event.accelerationIncludingGravity;
    const acc = event.acceleration;
    if (!accG) return;

    let rawY;
    if (acc && acc.y !== null && acc.y !== undefined) {
        rawY = acc.y;
    } else {
        gravityY = GRAVITY_ALPHA * gravityY + (1 - GRAVITY_ALPHA) * accG.y;
        rawY = accG.y - gravityY;
    }

    smoothAccY = SMOOTH_ALPHA * rawY + (1 - SMOOTH_ALPHA) * smoothAccY;

    // Calibration phase: collect neutral samples
    if (!calibDone) {
        calibSamples.push(accG.y);
        if (calibSamples.length >= CALIB_COUNT) {
            neutralY = calibSamples.reduce((a, b) => a + b, 0) / calibSamples.length;
            calibDone = true;
            console.log('[GB] Calibrated neutralY:', neutralY.toFixed(2));
        }
        return;
    }

    if (!isGameActive) return;

    // Height estimation: compare current gravity reading to neutral
    // When crouching, the phone dips (Y with gravity changes)
    // We use the linear acceleration Y to detect up/down movement
    // Integrate to get relative height change
    const heightDelta = smoothAccY * 0.008; // scale factor
    heightNorm = Math.max(0, Math.min(1, heightNorm + heightDelta));

    // Slowly drift back to neutral (0.5) if no strong movement
    heightNorm += (0.5 - heightNorm) * 0.01;

    updateUI();
    emitMovement();
}

// ── Gyroscope: Detect Left/Right Tilt ────────────────────────
function handleOrientation(event) {
    currentGamma = event.gamma || 0; // -90 to 90

    // Normalize to -1..1, clamp at ±45 degrees
    tiltNorm = Math.max(-1, Math.min(1, currentGamma / 45));

    if (isGameActive) {
        updateUI();
        emitMovement();
    }
}

// ── Update Controller UI ─────────────────────────────────────
function updateUI() {
    // Height gauge: fill from bottom
    const fillPct = heightNorm * 100;
    heightFill.style.height = fillPct + '%';
    heightMarker.style.bottom = (fillPct - 2) + '%';
    heightValue.textContent = Math.round(fillPct) + '%';

    // Color based on height
    if (heightNorm > 0.65) {
        heightFill.style.background = 'linear-gradient(0deg, rgba(0,255,136,0.4), rgba(0,255,136,0.1))';
        heightMarker.style.background = '#00ff88';
        heightMarker.style.boxShadow = '0 0 12px rgba(0,255,136,0.6)';
    } else if (heightNorm < 0.35) {
        heightFill.style.background = 'linear-gradient(0deg, rgba(255,0,229,0.4), rgba(255,0,229,0.1))';
        heightMarker.style.background = '#ff00e5';
        heightMarker.style.boxShadow = '0 0 12px rgba(255,0,229,0.6)';
    } else {
        heightFill.style.background = 'linear-gradient(0deg, rgba(0,229,255,0.4), rgba(0,229,255,0.1))';
        heightMarker.style.background = '#00e5ff';
        heightMarker.style.boxShadow = '0 0 12px rgba(0,229,255,0.6)';
    }

    // Tilt bar
    const tiltPct = 50 + tiltNorm * 45; // 5% to 95%
    tiltIndicator.style.left = `calc(${tiltPct}% - 15px)`;
}

// ── Emit to Server ───────────────────────────────────────────
function emitMovement() {
    const now = Date.now();
    if (now - lastEmitTime < EMIT_INTERVAL) return;
    lastEmitTime = now;

    if (socket && isGameActive) {
        socket.emit('gb-movement', {
            height: Math.round(heightNorm * 1000) / 1000,
            tilt: Math.round(tiltNorm * 1000) / 1000
        });
    }
}

// ── Sensor Init ──────────────────────────────────────────────
async function initSensors() {
    setStatus('Initializing Sensors...', 'Requesting accelerometer access');

    if (!('DeviceMotionEvent' in window)) {
        setStatusError('Sensors Not Available', 'This device needs motion sensors.');
        return false;
    }

    // iOS permission
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const perm = await DeviceMotionEvent.requestPermission();
            if (perm !== 'granted') {
                setStatusError('Permission Denied', 'Motion sensor access required.');
                return false;
            }
        } catch (err) {
            setStatusError('Permission Error', err.message);
            return false;
        }
    }

    window.addEventListener('devicemotion', handleMotion, true);

    // Gyroscope
    if ('DeviceOrientationEvent' in window) {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const perm = await DeviceOrientationEvent.requestPermission();
                if (perm === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation, true);
                }
            } catch (e) { }
        } else {
            window.addEventListener('deviceorientation', handleOrientation, true);
        }
    }

    // Verify sensor data arrives
    return new Promise((resolve) => {
        let gotData = false;
        const timeout = setTimeout(() => {
            if (!gotData) {
                setStatusError('No Sensor Data', 'Motion sensors not responding.');
                resolve(false);
            }
        }, 3000);

        const handler = (e) => {
            if (e.accelerationIncludingGravity && !gotData) {
                gotData = true;
                clearTimeout(timeout);
                sensorReady = true;
                resolve(true);
            }
        };
        window.addEventListener('devicemotion', handler, { once: false });
        setTimeout(() => window.removeEventListener('devicemotion', handler), 3500);
    });
}

// ── Socket.IO ────────────────────────────────────────────────
function initSocket() {
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('session');

    socket = io({
        transports: ['polling', 'websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000
    });

    socket.on('connect', () => {
        console.log('[GB] Socket connected:', socket.id);
        setStatus('Connected!', 'Joining session...');
        connDot.classList.remove('disconnected');
        connText.textContent = 'Connected';

        if (sessionId) {
            socket.emit('join-session', { sessionId }, (response) => {
                if (response.error) {
                    setStatusError('Join Failed', response.error);
                    return;
                }
                playerNum = response.playerNum;
                playerBadge.textContent = 'P' + playerNum;
                playerBadge.className = 'player-badge p' + playerNum;
                console.log('[GB] Joined as P' + playerNum);
                showScreen('waiting');
            });
        } else {
            setStatusError('No Session', 'No session ID in URL.');
        }
    });

    socket.on('connect_error', (err) => {
        setStatusError('Connection Error', err.message);
    });

    socket.on('game-started', () => {
        console.log('[GB] Game started!');
        isGameActive = true;
        showScreen('game');
    });

    // Sync feedback from server
    socket.on('gb-sync-status', (data) => {
        if (data.synced) {
            syncLabel.textContent = '● IN SYNC';
            syncLabel.className = 'sync-label synced';
        } else {
            syncLabel.textContent = '● OUT OF SYNC';
            syncLabel.className = 'sync-label desynced';
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

// ── Main Init ────────────────────────────────────────────────
async function init() {
    showScreen('loading');

    if (!window.isSecureContext) {
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isLocal) {
            setStatusError('HTTPS Required', 'Sensors need a secure connection.');
            return;
        }
    }

    setStatus('Connecting...', `Server: ${location.host}`);
    initSocket();

    const ok = await initSensors();
    if (!ok) return;

    setStatus('✅ Sensors Ready!', 'Calibrating...');
    // Calibration runs in handleMotion
}

init();
