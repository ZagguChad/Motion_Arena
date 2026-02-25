// ============================================================
// RHYTHM PULSE — Mobile Controller
// Accelerometer squat detection + Beat sync
// ============================================================

const loadingScreen = document.getElementById('loadingScreen');
const waitingScreen = document.getElementById('waitingScreen');
const gameScreen = document.getElementById('gameScreen');
const loaderText = document.getElementById('loaderText');
const loaderSub = document.getElementById('loaderSub');
const beatCircle = document.getElementById('beatCircle');
const comboValue = document.getElementById('comboValue');
const feedbackText = document.getElementById('feedbackText');
const playerBadge = document.getElementById('playerBadge');
const connDot = document.getElementById('connDot');
const connText = document.getElementById('connText');

let socket = null;
let sessionId = null;
let playerNum = 0;
let isGameActive = false;

// Sensor
let sensorReady = false;
let gravityY = 0;
const GRAVITY_ALPHA = 0.8;
let smoothAccY = 0;
const SMOOTH_ALPHA = 0.3;

// Squat detection
let squatState = 'idle'; // idle, squatting
let squatThreshold = -2.0;
let standThreshold = 1.0;
let lastSquatTime = 0;
const MIN_SQUAT_INTERVAL = 400;

// Beat timing
const BPM = 80;
const BEAT_INTERVAL = 60000 / BPM; // ms per beat
let beatStartTime = 0;
let combo = 0;

// Audio
let audioCtx = null;

function createAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playBeatSound() {
    try {
        const ctx = createAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 220;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
    } catch (e) { }
}

function playSquatSound(quality) {
    try {
        const ctx = createAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = quality === 'perfect' ? 660 : quality === 'good' ? 440 : 200;
        osc.type = quality === 'perfect' ? 'sine' : 'triangle';
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) { }
}

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

// Beat visual pulse
let beatInterval = null;
function startBeatPulse() {
    beatStartTime = Date.now();
    beatInterval = setInterval(() => {
        playBeatSound();
        beatCircle.classList.add('on-beat');
        setTimeout(() => beatCircle.classList.remove('on-beat'), 150);
    }, BEAT_INTERVAL);
}

// Get timing offset from nearest beat
function getBeatOffset() {
    const elapsed = Date.now() - beatStartTime;
    const beatPos = elapsed % BEAT_INTERVAL;
    // distance from nearest beat edge
    return Math.min(beatPos, BEAT_INTERVAL - beatPos);
}

// Accelerometer
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

    if (!isGameActive) return;

    const now = Date.now();

    // Squat detection (Schmitt trigger)
    if (squatState === 'idle' && smoothAccY < squatThreshold) {
        if (now - lastSquatTime >= MIN_SQUAT_INTERVAL) {
            squatState = 'squatting';
            lastSquatTime = now;
            onSquat();
        }
    } else if (squatState === 'squatting' && smoothAccY > standThreshold) {
        squatState = 'idle';
    }
}

function onSquat() {
    // Check beat timing
    const offset = getBeatOffset();
    const PERFECT_WINDOW = 120; // ms
    const GOOD_WINDOW = 250;

    let quality;
    if (offset <= PERFECT_WINDOW) {
        quality = 'perfect';
        combo++;
    } else if (offset <= GOOD_WINDOW) {
        quality = 'good';
        combo++;
    } else {
        quality = 'miss';
        combo = 0;
    }

    // Update UI
    comboValue.textContent = combo;
    feedbackText.textContent = quality === 'perfect' ? '⭐ PERFECT!' : quality === 'good' ? '👍 GOOD' : '❌ OFF-BEAT';
    feedbackText.className = `feedback-text ${quality}`;

    if (quality !== 'miss') {
        beatCircle.classList.add('on-beat');
        setTimeout(() => beatCircle.classList.remove('on-beat'), 200);
    } else {
        beatCircle.classList.add('off-beat');
        setTimeout(() => beatCircle.classList.remove('off-beat'), 200);
    }

    playSquatSound(quality);

    // Haptic
    if (navigator.vibrate) {
        navigator.vibrate(quality === 'perfect' ? [30, 15, 30] : quality === 'good' ? 25 : 15);
    }

    // Send to server
    if (socket && isGameActive) {
        socket.emit('rp-squat', {
            timestamp: Date.now(),
            quality: quality,
            combo: combo
        });
    }
}

// Sensor init
async function initSensors() {
    setStatus('Initializing Sensors...', 'Requesting accelerometer access');

    if (!('DeviceMotionEvent' in window)) {
        setStatusError('Sensors Not Available', 'This device needs motion sensors.');
        return false;
    }

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
        startBeatPulse();
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
