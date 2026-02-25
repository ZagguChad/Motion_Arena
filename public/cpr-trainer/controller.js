// ============================================================
// CPR TRAINER — Mobile Controller (Socket.IO)
// Calibration + Accelerometer + Gyroscope
// ============================================================

// ── DOM Elements ────────────────────────────────────────────
const loadingScreen = document.getElementById('loadingScreen');
const calibScreen = document.getElementById('calibScreen');
const setupScreen = document.getElementById('setupScreen');
const gameScreen = document.getElementById('gameScreen');
const overScreen = document.getElementById('overScreen');

const loaderText = document.querySelector('.loader-text');
const loaderSub = document.querySelector('.loader-sub');

const calibStatus = document.getElementById('calibStatus');
const calibCount = document.getElementById('calibCount');
const calibProgress = document.getElementById('calibProgress');

const difficultyBtns = document.querySelectorAll('.diff-btn');
const readyBtn = document.getElementById('readyBtn');
const timerDisplay = document.getElementById('timerDisplay');
const compressionCount = document.getElementById('compressionCount');
const feedbackText = document.getElementById('feedbackText');
const bpmValue = document.getElementById('bpmValue');
const depthFill = document.getElementById('depthFill');
const depthValue = document.getElementById('depthValue');
const metronomeBtn = document.getElementById('metronomeBtn');
const tiltIndicator = document.getElementById('tiltIndicator');

const overGrade = document.getElementById('overGrade');
const overScore = document.getElementById('overScore');
const overSurvival = document.getElementById('overSurvival');
const overStats = document.getElementById('overStats');
const overTips = document.getElementById('overTips');

// ── State ───────────────────────────────────────────────────
let socket = null;
let sessionId = null;
let isGameActive = false;
let compressions = 0;
let selectedDifficulty = 'beginner';

// ── Sensor Processing State ─────────────────────────────────
let sensorReady = false;
let gyroReady = false;

// ── Calibration State ───────────────────────────────────────
let calibPhase = 'waiting';  // 'waiting', 'collecting', 'done'
let calibPeaks = [];
let calibReleases = [];
let calibSmoothZ = 0;
let calibPrevSmooth = 0;
let calibDetecting = false;
let calibPeakVal = 0;
let calibReleaseVal = 0;
const CALIB_REQUIRED = 3;
const CALIB_RAW_THRESHOLD = -1.5;  // initial weak threshold for calibration detection

// ── Dynamic Thresholds (set by calibration) ─────────────────
let PRESS_THRESHOLD = -2.0;
let RELEASE_THRESHOLD = 1.5;

// Gravity removal (high-pass filter)
let gravityZ = 0;
const GRAVITY_ALPHA = 0.8;

// Smoothed acceleration
let smoothAccZ = 0;
const SMOOTH_ALPHA = 0.3;

// Compression detection (Schmitt trigger)
let compressionState = 'idle';
const MIN_COMPRESSION_INTERVAL = 300;
let lastCompressionTime = 0;

// Depth estimation via double integration
let velocityZ = 0;
let displacementZ = 0;
let integrating = false;
let integrationStartTime = 0;
const MAX_INTEGRATION_TIME = 800;
const DEPTH_SCALE = 50;
const DRIFT_DECAY = 0.92;

// Recoil tracking
let peakDisplacement = 0;
let recoilDisplacement = 0;

// BPM calculation
let recentIntervals = [];
let currentBPM = 0;

// Peak tracking for depth
let recentDepths = [];

// ── Gyroscope State ─────────────────────────────────────────
let currentTiltBeta = 0;   // front-back
let currentTiltGamma = 0;  // left-right
let tiltWarning = false;
const TILT_WARN_ANGLE = 15;  // degrees

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
        createAudioContext();
        metronomeInterval = setInterval(playMetronomeTick, 545); // 110 BPM
        metronomeBtn.textContent = '🎵 Metronome: ON';
        metronomeBtn.classList.add('active');
    } else {
        clearInterval(metronomeInterval);
        metronomeBtn.textContent = '🎵 Metronome: OFF';
        metronomeBtn.classList.remove('active');
    }
}

metronomeBtn.addEventListener('click', toggleMetronome);

// ── Difficulty Selection ────────────────────────────────────
difficultyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        difficultyBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedDifficulty = btn.dataset.diff;
    });
});

// ── Screen Management ───────────────────────────────────────
function showScreen(name) {
    loadingScreen.classList.remove('active');
    calibScreen.classList.remove('active');
    setupScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    overScreen.classList.remove('active');

    if (name === 'loading') loadingScreen.classList.add('active');
    if (name === 'calib') calibScreen.classList.add('active');
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

// ── Calibration Motion Handler ──────────────────────────────
function handleCalibrationMotion(event) {
    const accWithGravity = event.accelerationIncludingGravity;
    const acc = event.acceleration;
    if (!accWithGravity) return;

    let rawZ;
    if (acc && acc.z !== null && acc.z !== undefined) {
        rawZ = acc.z;
    } else {
        gravityZ = GRAVITY_ALPHA * gravityZ + (1 - GRAVITY_ALPHA) * accWithGravity.z;
        rawZ = accWithGravity.z - gravityZ;
    }

    calibPrevSmooth = calibSmoothZ;
    calibSmoothZ = SMOOTH_ALPHA * rawZ + (1 - SMOOTH_ALPHA) * calibSmoothZ;

    if (calibPhase !== 'collecting') return;

    // Detect downward peak
    if (!calibDetecting && calibSmoothZ < CALIB_RAW_THRESHOLD) {
        calibDetecting = true;
        calibPeakVal = calibSmoothZ;
        calibReleaseVal = 0;
    }

    if (calibDetecting) {
        // Track peak downward
        if (calibSmoothZ < calibPeakVal) {
            calibPeakVal = calibSmoothZ;
        }

        // Track peak upward (release)
        if (calibSmoothZ > calibReleaseVal) {
            calibReleaseVal = calibSmoothZ;
        }

        // Compression completed when signal returns near zero
        if (calibSmoothZ > -0.5 && calibPrevSmooth > -0.5 && calibReleaseVal > 0.5) {
            calibDetecting = false;
            calibPeaks.push(calibPeakVal);
            calibReleases.push(calibReleaseVal);

            const count = calibPeaks.length;
            if (calibCount) calibCount.textContent = `${count}/${CALIB_REQUIRED}`;
            if (calibProgress) calibProgress.style.width = `${(count / CALIB_REQUIRED) * 100}%`;

            // Haptic feedback
            if (navigator.vibrate) navigator.vibrate(50);

            console.log(`[Calib] Push ${count}: peak=${calibPeakVal.toFixed(2)}, release=${calibReleaseVal.toFixed(2)}`);

            if (count >= CALIB_REQUIRED) {
                finishCalibration();
            }
        }
    }
}

function finishCalibration() {
    calibPhase = 'done';

    // Calculate dynamic thresholds from calibration data
    const avgPeak = calibPeaks.reduce((a, b) => a + b, 0) / calibPeaks.length;
    const avgRelease = calibReleases.reduce((a, b) => a + b, 0) / calibReleases.length;

    PRESS_THRESHOLD = avgPeak * 0.6;   // 60% of avg peak
    RELEASE_THRESHOLD = avgRelease * 0.5; // 50% of avg release

    // Safety bounds
    PRESS_THRESHOLD = Math.min(-0.8, Math.max(-8.0, PRESS_THRESHOLD));
    RELEASE_THRESHOLD = Math.max(0.3, Math.min(5.0, RELEASE_THRESHOLD));

    console.log(`[Calib] Done! PRESS_THRESHOLD=${PRESS_THRESHOLD.toFixed(2)}, RELEASE_THRESHOLD=${RELEASE_THRESHOLD.toFixed(2)}`);

    if (calibStatus) calibStatus.textContent = '✅ Calibration Complete!';
    if (calibCount) calibCount.textContent = 'Done!';

    // Switch sensor handler to game mode
    window.removeEventListener('devicemotion', handleCalibrationMotion, true);
    smoothAccZ = 0;

    // Brief delay then show setup
    setTimeout(() => showScreen('setup'), 800);
}

// ── Sensor Initialization ───────────────────────────────────
async function initSensors() {
    setStatus('Initializing Sensors...', 'Requesting accelerometer access');

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

    // Attach calibration handler first
    window.addEventListener('devicemotion', handleCalibrationMotion, true);

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
        setTimeout(() => window.removeEventListener('devicemotion', testHandler), 3500);
    });
}

// ── Gyroscope Initialization ────────────────────────────────
function initGyroscope() {
    if ('DeviceOrientationEvent' in window) {
        // iOS permission
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(perm => {
                if (perm === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation, true);
                    gyroReady = true;
                }
            }).catch(() => { });
        } else {
            window.addEventListener('deviceorientation', handleOrientation, true);
            gyroReady = true;
        }
    }
    console.log('[Sensor] Gyroscope:', gyroReady ? 'active' : 'unavailable');
}

function handleOrientation(event) {
    currentTiltBeta = event.beta || 0;   // -180 to 180 (front-back)
    currentTiltGamma = event.gamma || 0; // -90 to 90 (left-right)

    // For phone face-down, beta should be near ±180 and gamma near 0
    // We care about deviation from the resting position
    const absBeta = Math.abs(currentTiltBeta);
    const adjustedBeta = absBeta > 90 ? Math.abs(180 - absBeta) : absBeta;
    const absGamma = Math.abs(currentTiltGamma);

    tiltWarning = (adjustedBeta > TILT_WARN_ANGLE || absGamma > TILT_WARN_ANGLE);

    if (tiltIndicator) {
        if (tiltWarning) {
            tiltIndicator.textContent = `📐 Tilt: ${adjustedBeta.toFixed(0)}°/${absGamma.toFixed(0)}° — Straighten!`;
            tiltIndicator.style.color = '#ef4444';
        } else {
            tiltIndicator.textContent = `✅ Hand angle OK`;
            tiltIndicator.style.color = '#4ade80';
        }
    }
}

// ── Game Motion Handler ─────────────────────────────────────
function handleMotion(event) {
    if (!sensorReady || !isGameActive) return;

    const accWithGravity = event.accelerationIncludingGravity;
    const acc = event.acceleration;

    if (!accWithGravity) return;

    let rawZ;
    if (acc && acc.z !== null && acc.z !== undefined) {
        rawZ = acc.z;
    } else {
        gravityZ = GRAVITY_ALPHA * gravityZ + (1 - GRAVITY_ALPHA) * accWithGravity.z;
        rawZ = accWithGravity.z - gravityZ;
    }

    // Low-pass filter
    smoothAccZ = SMOOTH_ALPHA * rawZ + (1 - SMOOTH_ALPHA) * smoothAccZ;

    // Schmitt Trigger Compression Detection
    const now = Date.now();
    const dt = event.interval ? event.interval / 1000 : 1 / 60;

    switch (compressionState) {
        case 'idle':
            if (smoothAccZ < PRESS_THRESHOLD) {
                compressionState = 'pressing';
                integrating = true;
                integrationStartTime = now;
                velocityZ = 0;
                displacementZ = 0;
                peakDisplacement = 0;
            }
            break;

        case 'pressing':
            if (integrating) {
                velocityZ += smoothAccZ * dt;
                velocityZ *= DRIFT_DECAY;
                displacementZ += velocityZ * dt;

                if (Math.abs(displacementZ) > Math.abs(peakDisplacement)) {
                    peakDisplacement = displacementZ;
                }

                if (smoothAccZ > RELEASE_THRESHOLD) {
                    compressionState = 'releasing';
                    recoilDisplacement = 0;
                }

                if (now - integrationStartTime > MAX_INTEGRATION_TIME) {
                    compressionState = 'releasing';
                    recoilDisplacement = 0;
                }
            }
            break;

        case 'releasing':
            if (integrating) {
                velocityZ += smoothAccZ * dt;
                velocityZ *= DRIFT_DECAY;
                recoilDisplacement += velocityZ * dt;

                if (Math.abs(smoothAccZ) < Math.abs(PRESS_THRESHOLD) * 0.3) {
                    integrating = false;
                    compressionState = 'idle';

                    let depth = Math.abs(peakDisplacement) * DEPTH_SCALE;
                    depth = Math.max(0.5, Math.min(10, depth * 1.2));

                    let recoilQuality = 0;
                    if (Math.abs(peakDisplacement) > 0.001) {
                        recoilQuality = Math.min(1.0, Math.abs(recoilDisplacement) / Math.abs(peakDisplacement));
                    }
                    recoilQuality = Math.min(1.0, recoilQuality * 1.1 + 0.15);

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

    if (tiltWarning) {
        feedback = '📐 Straighten Hands!';
        fbClass = 'warning';
    } else if (rateOK && depthOK && recoilOK) {
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

    flashCompression(fbClass === 'perfect' ? 'perfect' : 'normal');

    // Haptic feedback
    if (navigator.vibrate) {
        if (fbClass === 'perfect') {
            navigator.vibrate([30, 20, 30]);
        } else {
            navigator.vibrate(25);
        }
    }

    // Send to server via Socket.IO with tilt angle
    if (socket && isGameActive) {
        const absBeta = Math.abs(currentTiltBeta);
        const adjustedBeta = absBeta > 90 ? Math.abs(180 - absBeta) : absBeta;
        const tiltAngle = Math.max(adjustedBeta, Math.abs(currentTiltGamma));

        socket.emit('cpr-compression', {
            depth: Math.round(depth * 10) / 10,
            recoil: Math.round(recoil * 100) / 100,
            tiltAngle: Math.round(tiltAngle),
        });
    }

    console.log(`[CPR] #${compressions} depth:${depth.toFixed(1)}cm recoil:${(recoil * 100).toFixed(0)}% BPM:${currentBPM}`);
}

// ── Socket.IO Connection ────────────────────────────────────
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
        console.log('[Socket] Connected:', socket.id);
        setStatus('Connected!', 'Joining session...');

        if (sessionId) {
            socket.emit('join-session', { sessionId }, (response) => {
                if (response.error) {
                    setStatusError('Join Failed', response.error);
                    return;
                }
                console.log('[Socket] Joined as player', response.playerNum);
            });
        } else {
            setStatusError('No Session', 'No session ID found in URL.');
        }
    });

    socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
        setStatusError('Connection Error', err.message);
    });

    // Game started — switch to game screen
    socket.on('game-started', () => {
        startGameOnPhone();
    });

    // CPR engine game-start signal
    socket.on('cpr-game-start', (msg) => {
        startGameOnPhone(msg.timer);
    });

    // Push/Release rhythm guidance from server
    socket.on('cpr-game-state', (state) => {
        if (!isGameActive) return;
        if (state.config && state.config.showPushRelease && state.rhythmPhase) {
            const phase = state.rhythmPhase;
            const guideEl = document.getElementById('rhythmGuide');
            if (guideEl) {
                if (phase === 'push') {
                    guideEl.textContent = '⬇ PUSH!';
                    guideEl.style.color = '#ef4444';
                    guideEl.style.textShadow = '0 0 20px rgba(239,68,68,0.6)';
                    document.body.style.borderColor = 'rgba(239,68,68,0.3)';
                } else {
                    guideEl.textContent = '⬆ RELEASE!';
                    guideEl.style.color = '#4ade80';
                    guideEl.style.textShadow = '0 0 20px rgba(74,222,128,0.6)';
                    document.body.style.borderColor = 'rgba(74,222,128,0.3)';
                }
            }
        }
    });

    // Game over
    socket.on('cpr-game-over', (msg) => {
        isGameActive = false;
        window.removeEventListener('devicemotion', handleMotion, true);
        if (metronomeOn) toggleMetronome();
        showScreen('over');

        const gradeColors = { 'A': '#4ade80', 'B': '#60a5fa', 'C': '#fbbf24', 'D': '#ef4444', 'F': '#ef4444' };
        overGrade.textContent = msg.grade || '-';
        overGrade.style.color = gradeColors[msg.grade] || '#e74c6f';
        overScore.textContent = `Score: ${msg.score || 0}/100`;

        // Survival probability
        if (overSurvival) {
            const sp = msg.survivalProbability || 0;
            overSurvival.textContent = `Survival Probability: ${sp}%`;
            overSurvival.style.color = sp >= 70 ? '#4ade80' : sp >= 40 ? '#fbbf24' : '#ef4444';
        }

        overStats.innerHTML = `
            <div class="stat-row"><span class="stat-label">Total Compressions</span><span class="stat-value">${msg.totalCompressions || 0}</span></div>
            <div class="stat-row"><span class="stat-label">Average BPM</span><span class="stat-value">${msg.avgBPM || '--'}</span></div>
            <div class="stat-row"><span class="stat-label">Average Depth</span><span class="stat-value">${msg.avgDepth || '--'} cm</span></div>
            <div class="stat-row"><span class="stat-label">Average Recoil</span><span class="stat-value">${msg.avgRecoil || '--'}%</span></div>
            <div class="stat-row"><span class="stat-label">Patient Status</span><span class="stat-value">${msg.patientAlive ? '💚 Alive' : '💔 Lost'}</span></div>
            <div class="stat-row"><span class="stat-label">Difficulty</span><span class="stat-value">${(msg.difficulty || 'beginner').charAt(0).toUpperCase() + (msg.difficulty || 'beginner').slice(1)}</span></div>
        `;

        overTips.innerHTML = '';
        if (msg.tips && msg.tips.length > 0) {
            msg.tips.forEach(tip => {
                const div = document.createElement('div');
                div.className = 'tip';
                div.textContent = tip;
                overTips.appendChild(div);
            });
        }
    });

    socket.on('session-ended', (data) => {
        alert(data.reason || 'Session ended');
        window.location.href = '/';
    });

    socket.on('disconnect', () => {
        if (isGameActive) {
            feedbackText.textContent = '⚠ DISCONNECTED';
            feedbackText.className = 'feedback-text bad';
        }
    });
}

// ── Start Game on Phone ─────────────────────────────────────
function startGameOnPhone(timer = 120) {
    if (isGameActive) return;
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

    // Attach game motion handler
    window.addEventListener('devicemotion', handleMotion, true);

    showScreen('game');

    // Start countdown display on phone
    let phoneTimer = timer;
    const phoneTimerInterval = setInterval(() => {
        phoneTimer--;
        const mins = Math.floor(phoneTimer / 60);
        const secs = phoneTimer % 60;
        timerDisplay.textContent = `⏱ ${mins}:${secs.toString().padStart(2, '0')}`;
        if (phoneTimer <= 15) timerDisplay.style.color = '#ef4444';
        if (phoneTimer <= 0) clearInterval(phoneTimerInterval);
    }, 1000);
}

// ── Ready Button ────────────────────────────────────────────
readyBtn.addEventListener('click', () => {
    if (socket && socket.connected) {
        socket.emit('cpr-player-ready', { difficulty: selectedDifficulty });
        readyBtn.textContent = '✅ READY — Waiting for game...';
        readyBtn.style.background = 'rgba(46, 160, 67, 0.3)';
        readyBtn.style.pointerEvents = 'none';
    }
});

// ── Main Initialization ─────────────────────────────────────
async function init() {
    showScreen('loading');

    // Step 1: Check secure context
    if (!window.isSecureContext) {
        const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isLocalhost) {
            setStatusError('HTTPS Required',
                `Sensors need a secure connection.\nUse: https://${location.hostname}:${location.port}/cpr-trainer/controller.html`);
            return;
        }
    }

    // Step 2: Connect Socket.IO
    setStatus('Connecting...', `Server: ${location.host}`);
    initSocket();

    // Step 3: Initialize sensors
    const sensorsOK = await initSensors();
    if (!sensorsOK) return;

    // Step 4: Initialize gyroscope
    initGyroscope();

    // Step 5: Enter calibration
    setStatus('✅ Sensors Ready!', 'Starting calibration...');
    await new Promise(r => setTimeout(r, 500));

    calibPhase = 'collecting';
    showScreen('calib');
}

init();
