// ============================================================
// CPR TRAINER — Mobile Controller
// Accelerometer-Based Compression Detection + WebSocket
// ============================================================

// ── DOM Elements ────────────────────────────────────────────
const loadingScreen = document.getElementById('loadingScreen');
const setupScreen = document.getElementById('setupScreen');
const gameScreen = document.getElementById('gameScreen');
const overScreen = document.getElementById('overScreen');

const loaderText = document.querySelector('.loader-text');
const loaderSub = document.querySelector('.loader-sub');

const readyBtn = document.getElementById('readyBtn');
const timerDisplay = document.getElementById('timerDisplay');
const compressionCount = document.getElementById('compressionCount');
const feedbackText = document.getElementById('feedbackText');
const feedbackZone = document.getElementById('feedbackZone');
const bpmValue = document.getElementById('bpmValue');
const depthFill = document.getElementById('depthFill');
const depthValue = document.getElementById('depthValue');
const metronomeBtn = document.getElementById('metronomeBtn');

const overGrade = document.getElementById('overGrade');
const overScore = document.getElementById('overScore');
const overStats = document.getElementById('overStats');
const overTips = document.getElementById('overTips');

// ── State ───────────────────────────────────────────────────
let ws = null;
let isGameActive = false;
let compressions = 0;

// ── Sensor Processing State ─────────────────────────────────
let sensorReady = false;
let calibrating = true;
let calibrationSamples = [];
const CALIBRATION_COUNT = 60;           // ~1 second at 60Hz

// Gravity removal (high-pass filter)
let gravityZ = 0;
const GRAVITY_ALPHA = 0.8;             // high-pass filter coefficient

// Smoothed acceleration
let smoothAccZ = 0;
const SMOOTH_ALPHA = 0.3;              // low-pass filter for noise

// Compression detection (Schmitt trigger)
let compressionState = 'idle';         // 'idle', 'pressing', 'releasing'
const PRESS_THRESHOLD = -3.0;          // m/s² — downward acceleration to start press
const RELEASE_THRESHOLD = 2.0;         // m/s² — upward acceleration for release
const MIN_COMPRESSION_INTERVAL = 300;  // ms — fastest allowed (200 BPM cap)
let lastCompressionTime = 0;

// Depth estimation via double integration
let velocityZ = 0;
let displacementZ = 0;
let integrating = false;
let integrationStartTime = 0;
const MAX_INTEGRATION_TIME = 800;      // ms — max compression duration
const DEPTH_SCALE = 100;               // convert m to cm
const DRIFT_DECAY = 0.95;             // velocity drift correction

// Recoil tracking
let peakDisplacement = 0;
let recoilDisplacement = 0;

// BPM calculation
let recentIntervals = [];
let currentBPM = 0;

// Peak tracking for depth
let recentDepths = [];

// ── Metronome ───────────────────────────────────────────────
let metronomeOn = false;
let metronomeInterval = null;
let audioCtx = null;

function createAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playMetronomeTick() {
    try {
        const ctx = createAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
    } catch (e) { /* audio may fail silently */ }
}

function toggleMetronome() {
    metronomeOn = !metronomeOn;
    if (metronomeOn) {
        // 110 BPM = 545ms interval
        createAudioContext();
        metronomeInterval = setInterval(playMetronomeTick, 545);
        metronomeBtn.textContent = '🎵 Metronome: ON';
        metronomeBtn.classList.add('active');
    } else {
        clearInterval(metronomeInterval);
        metronomeBtn.textContent = '🎵 Metronome: OFF';
        metronomeBtn.classList.remove('active');
    }
}

metronomeBtn.addEventListener('click', toggleMetronome);

// ── Screen Management ───────────────────────────────────────
function showScreen(name) {
    loadingScreen.classList.remove('active');
    setupScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    overScreen.classList.remove('active');

    if (name === 'loading') loadingScreen.classList.add('active');
    if (name === 'setup') setupScreen.classList.add('active');
    if (name === 'game') gameScreen.classList.add('active');
    if (name === 'over') overScreen.classList.add('active');
}

function setStatus(main, sub) {
    if (loaderText) loaderText.textContent = main;
    if (loaderSub) loaderSub.textContent = sub || '';
}

function setStatusError(main, sub) {
    setStatus('❌ ' + main, sub);
    if (loaderText) loaderText.style.color = '#ef4444';
}

// ── Visual Flash on Compression ─────────────────────────────
function flashCompression(quality) {
    const flash = document.createElement('div');
    flash.className = 'compression-flash';
    if (quality === 'perfect') flash.classList.add('perfect');
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 200);
}

// ── Sensor Initialization ───────────────────────────────────
async function initSensors() {
    setStatus('Initializing Sensors...', 'Requesting accelerometer access');

    // Check for DeviceMotionEvent support
    if (!('DeviceMotionEvent' in window)) {
        setStatusError('Sensors Not Available', 'This device does not have motion sensors.');
        return false;
    }

    // iOS 13+ requires permission
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const perm = await DeviceMotionEvent.requestPermission();
            if (perm !== 'granted') {
                setStatusError('Permission Denied', 'Motion sensor access is required for CPR detection.');
                return false;
            }
        } catch (err) {
            setStatusError('Permission Error', err.message);
            return false;
        }
    }

    // Attach sensor listener
    window.addEventListener('devicemotion', handleMotion, true);

    // Verify we get data
    return new Promise((resolve) => {
        let gotData = false;
        const checkTimeout = setTimeout(() => {
            if (!gotData) {
                setStatusError('No Sensor Data', 'Motion sensors not responding. Try a different device.');
                resolve(false);
            }
        }, 3000);

        const testHandler = (e) => {
            if (e.accelerationIncludingGravity && !gotData) {
                gotData = true;
                clearTimeout(checkTimeout);
                sensorReady = true;
                console.log('[Sensor] Accelerometer active');
                resolve(true);
            }
        };
        window.addEventListener('devicemotion', testHandler, { once: false });
        // Clean up test handler after 3s
        setTimeout(() => window.removeEventListener('devicemotion', testHandler), 3500);
    });
}

// ── Motion Event Handler ────────────────────────────────────
function handleMotion(event) {
    if (!sensorReady) return;

    // Get acceleration (with gravity for calibration, without for compression detection)
    const accWithGravity = event.accelerationIncludingGravity;
    const acc = event.acceleration;

    if (!accWithGravity) return;

    // Use linear acceleration if available, otherwise high-pass filter
    let rawZ;
    if (acc && acc.z !== null && acc.z !== undefined) {
        rawZ = acc.z;
    } else {
        // High-pass filter to remove gravity
        gravityZ = GRAVITY_ALPHA * gravityZ + (1 - GRAVITY_ALPHA) * accWithGravity.z;
        rawZ = accWithGravity.z - gravityZ;
    }

    // ── Calibration Phase ───────────────────────────────────
    if (calibrating) {
        calibrationSamples.push(rawZ);
        if (calibrationSamples.length >= CALIBRATION_COUNT) {
            // Calculate baseline noise level
            const mean = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
            smoothAccZ = mean;
            calibrating = false;
            console.log(`[Sensor] Calibrated — baseline Z: ${mean.toFixed(3)}`);
        }
        return;
    }

    // ── Low-pass filter for noise reduction ─────────────────
    smoothAccZ = SMOOTH_ALPHA * rawZ + (1 - SMOOTH_ALPHA) * smoothAccZ;

    // ── Schmitt Trigger Compression Detection ───────────────
    const now = Date.now();
    const dt = event.interval ? event.interval / 1000 : 1 / 60; // seconds

    switch (compressionState) {
        case 'idle':
            // Waiting for downward push
            if (smoothAccZ < PRESS_THRESHOLD) {
                compressionState = 'pressing';
                integrating = true;
                integrationStartTime = now;
                velocityZ = 0;
                displacementZ = 0;
                peakDisplacement = 0;
                console.log(`[Compression] Press detected — acc: ${smoothAccZ.toFixed(2)}`);
            }
            break;

        case 'pressing':
            // Integrate acceleration → velocity → displacement
            if (integrating) {
                velocityZ += smoothAccZ * dt;
                velocityZ *= DRIFT_DECAY; // drift correction
                displacementZ += velocityZ * dt;

                // Track peak displacement (most compression)
                if (Math.abs(displacementZ) > Math.abs(peakDisplacement)) {
                    peakDisplacement = displacementZ;
                }

                // Check for release (upward acceleration)
                if (smoothAccZ > RELEASE_THRESHOLD) {
                    compressionState = 'releasing';
                    recoilDisplacement = 0;
                }

                // Timeout safety
                if (now - integrationStartTime > MAX_INTEGRATION_TIME) {
                    compressionState = 'releasing';
                    recoilDisplacement = 0;
                }
            }
            break;

        case 'releasing':
            // Track recoil
            if (integrating) {
                velocityZ += smoothAccZ * dt;
                velocityZ *= DRIFT_DECAY;
                recoilDisplacement += velocityZ * dt;

                // Check if we've returned to near-idle
                if (Math.abs(smoothAccZ) < Math.abs(PRESS_THRESHOLD) * 0.3) {
                    // Compression complete!
                    integrating = false;
                    compressionState = 'idle';

                    // Calculate depth (absolute displacement in cm)
                    let depth = Math.abs(peakDisplacement) * DEPTH_SCALE;

                    // Clamp to reasonable range and apply scaling
                    // Real accelerometer displacement is tiny; scale up to match expected CPR depth
                    depth = Math.max(0.5, Math.min(10, depth * 3.0));

                    // Calculate recoil quality
                    let recoilQuality = 0;
                    if (Math.abs(peakDisplacement) > 0.001) {
                        recoilQuality = Math.min(1.0, Math.abs(recoilDisplacement) / Math.abs(peakDisplacement));
                    }
                    // Boost recoil score — phones tend to spring back well
                    recoilQuality = Math.min(1.0, recoilQuality * 1.2 + 0.3);

                    // Check interval
                    if (now - lastCompressionTime >= MIN_COMPRESSION_INTERVAL || lastCompressionTime === 0) {
                        const interval = lastCompressionTime > 0 ? now - lastCompressionTime : 0;
                        lastCompressionTime = now;

                        registerCompression(depth, recoilQuality, interval);
                    }
                }
            }
            break;
    }
}

// ── Register a Valid Compression ────────────────────────────
function registerCompression(depth, recoil, interval) {
    compressions++;

    // Update BPM
    if (interval > 0 && interval < 3000) {
        recentIntervals.push(interval);
        if (recentIntervals.length > 10) recentIntervals.shift();
    }
    if (recentIntervals.length >= 2) {
        const avg = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
        currentBPM = Math.round(60000 / avg);
    }

    // Track depths
    recentDepths.push(depth);
    if (recentDepths.length > 10) recentDepths.shift();

    // Update UI
    compressionCount.textContent = compressions;
    bpmValue.textContent = currentBPM > 0 ? currentBPM : '--';
    bpmValue.style.color = (currentBPM >= 100 && currentBPM <= 120) ? '#4ade80' : (currentBPM >= 80 && currentBPM <= 140) ? '#fbbf24' : '#ef4444';

    // Depth bar (max 8 cm)
    const depthPct = Math.min(100, (depth / 8) * 100);
    depthFill.style.width = `${depthPct}%`;
    depthFill.style.background = (depth >= 5 && depth <= 6)
        ? 'linear-gradient(90deg, #4ade80, #22c55e)'
        : depth < 5
            ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
            : 'linear-gradient(90deg, #ef4444, #dc2626)';
    depthValue.textContent = `${depth.toFixed(1)} cm`;

    // Feedback
    const rateOK = currentBPM >= 100 && currentBPM <= 120;
    const depthOK = depth >= 5.0 && depth <= 6.0;
    const recoilOK = recoil >= 0.8;

    let feedback = '';
    let fbClass = 'good';

    if (rateOK && depthOK && recoilOK) {
        feedback = '⭐ PERFECT!';
        fbClass = 'perfect';
    } else if (depth < 4) {
        feedback = '💪 Push HARDER!';
        fbClass = 'bad';
    } else if (depth > 7) {
        feedback = '🛡️ Lighter!';
        fbClass = 'warning';
    } else if (currentBPM > 0 && currentBPM < 90) {
        feedback = '⏩ Faster!';
        fbClass = 'warning';
    } else if (currentBPM > 130) {
        feedback = '⏪ Slower!';
        fbClass = 'warning';
    } else if (!recoilOK) {
        feedback = '🔄 Full Recoil!';
        fbClass = 'warning';
    } else {
        feedback = '👍 Good!';
        fbClass = 'good';
    }

    feedbackText.textContent = feedback;
    feedbackText.className = `feedback-text ${fbClass}`;

    // Visual flash
    flashCompression(fbClass === 'perfect' ? 'perfect' : 'normal');

    // Haptic feedback
    if (navigator.vibrate) {
        if (fbClass === 'perfect') {
            navigator.vibrate([30, 20, 30]);
        } else {
            navigator.vibrate(25);
        }
    }

    // Send to server
    if (ws && ws.readyState === 1 && isGameActive) {
        ws.send(JSON.stringify({
            type: 'compression',
            depth: Math.round(depth * 10) / 10,
            recoil: Math.round(recoil * 100) / 100,
        }));
    }

    console.log(`[CPR] #${compressions} depth:${depth.toFixed(1)}cm recoil:${(recoil * 100).toFixed(0)}% BPM:${currentBPM}`);
}

// ── WebSocket ───────────────────────────────────────────────
function initWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}/player`);

    ws.onopen = () => {
        console.log('[WS] Connected');
        setStatus('Connected!', 'Setting up...');
    };

    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);

        if (msg.type === 'assigned') {
            console.log('[WS] Assigned as player');
        }

        if (msg.type === 'gameStart') {
            isGameActive = true;
            compressions = 0;
            recentIntervals = [];
            recentDepths = [];
            currentBPM = 0;
            lastCompressionTime = 0;
            compressionCount.textContent = '0';
            bpmValue.textContent = '--';
            depthFill.style.width = '0%';
            depthValue.textContent = '-- cm';
            feedbackText.textContent = 'Push down!';
            feedbackText.className = 'feedback-text';

            showScreen('game');

            // Start countdown display on phone
            let phoneTimer = msg.timer || 60;
            const phoneTimerInterval = setInterval(() => {
                phoneTimer--;
                const mins = Math.floor(phoneTimer / 60);
                const secs = phoneTimer % 60;
                timerDisplay.textContent = `⏱ ${mins}:${secs.toString().padStart(2, '0')}`;
                if (phoneTimer <= 10) timerDisplay.style.color = '#ef4444';
                if (phoneTimer <= 0) clearInterval(phoneTimerInterval);
            }, 1000);
        }

        if (msg.type === 'gameOver') {
            isGameActive = false;

            // Stop metronome
            if (metronomeOn) toggleMetronome();

            showScreen('over');

            // Grade color
            const gradeColors = { 'A': '#4ade80', 'B': '#60a5fa', 'C': '#fbbf24', 'D': '#ef4444', 'F': '#ef4444' };
            overGrade.textContent = msg.grade || '-';
            overGrade.style.color = gradeColors[msg.grade] || '#e74c6f';

            overScore.textContent = `Score: ${msg.score || 0}/100`;

            // Stats
            overStats.innerHTML = `
                <div class="stat-row"><span class="stat-label">Total Compressions</span><span class="stat-value">${msg.totalCompressions || 0}</span></div>
                <div class="stat-row"><span class="stat-label">Average BPM</span><span class="stat-value">${msg.avgBPM || '--'}</span></div>
                <div class="stat-row"><span class="stat-label">Average Depth</span><span class="stat-value">${msg.avgDepth || '--'} cm</span></div>
                <div class="stat-row"><span class="stat-label">Average Recoil</span><span class="stat-value">${msg.avgRecoil || '--'}%</span></div>
            `;

            // Tips
            overTips.innerHTML = '';
            if (msg.tips && msg.tips.length > 0) {
                msg.tips.forEach(tip => {
                    const div = document.createElement('div');
                    div.className = 'tip';
                    div.textContent = tip;
                    overTips.appendChild(div);
                });
            }
        }

        if (msg.type === 'error') {
            setStatusError('Server Error', msg.message);
        }
    };

    ws.onclose = () => {
        if (isGameActive) {
            feedbackText.textContent = '⚠ DISCONNECTED';
            feedbackText.className = 'feedback-text bad';
        }
        setTimeout(initWebSocket, 2000);
    };

    ws.onerror = () => {
        console.error('[WS] Connection error');
    };
}

// ── Ready Button ────────────────────────────────────────────
readyBtn.addEventListener('click', () => {
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'ready' }));
        readyBtn.textContent = '✅ READY — Waiting for game...';
        readyBtn.style.background = 'rgba(46, 160, 67, 0.3)';
        readyBtn.style.pointerEvents = 'none';

        // Also send startGame after a short delay (auto-start)
        setTimeout(() => {
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'startGame' }));
            }
        }, 1500);
    }
});

// ── Main Initialization ─────────────────────────────────────
async function init() {
    showScreen('loading');

    // Step 1: Check secure context (sensors need HTTPS)
    if (!window.isSecureContext) {
        const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isLocalhost) {
            setStatusError('HTTPS Required',
                `Sensors need a secure connection.\nUse: https://${location.hostname}:3443/mobile/`);
            return;
        }
    }

    // Step 2: Connect WebSocket
    setStatus('Connecting...', `Server: ${location.host}`);
    initWebSocket();

    // Step 3: Initialize sensors
    const sensorsOK = await initSensors();
    if (!sensorsOK) return;

    // Step 4: Ready!
    setStatus('✅ Sensors Ready!', 'Switching to setup...');
    await new Promise(r => setTimeout(r, 500));

    showScreen('setup');
}

init();
