// ============================================================
// TOWER SIEGE — Mobile Controller
// Side-View Pose: Jump Detection + Body Alignment + WebSocket
// ============================================================

// ── DOM Elements ────────────────────────────────────────────
const loadingScreen = document.getElementById('loadingScreen');
const gameScreen = document.getElementById('gameScreen');
const overScreen = document.getElementById('overScreen');
const video = document.getElementById('video');
const overlayCanvas = document.getElementById('overlay');
const overlayCtx = overlayCanvas.getContext('2d');
const teamBadge = document.getElementById('teamBadge');
const pushupCount = document.getElementById('pushupCount');
const soldiersCount = document.getElementById('soldiersCount');
const angleBarFill = document.getElementById('angleBarFill');
const stateIndicator = document.getElementById('stateIndicator');
const readyBtn = document.getElementById('readyBtn');
const gameStatus = document.getElementById('gameStatus');
const overResult = document.getElementById('overResult');
const overStats = document.getElementById('overStats');
const loaderText = document.querySelector('.loader-text');
const loaderSub = document.querySelector('.loader-sub');

// New UI elements
const deployBadge = document.getElementById('deployBadge');
const headIndicator = document.getElementById('headIndicator');
const headArrow = document.getElementById('headArrow');
const headLabel = document.getElementById('headLabel');
const noPersonOverlay = document.getElementById('noPersonOverlay');
const noPersonTimer = document.getElementById('noPersonTimer');
const deployModeSelector = document.getElementById('deployModeSelector');
const autoModeBtn = document.getElementById('autoModeBtn');
const manualModeBtn = document.getElementById('manualModeBtn');

// ── State ───────────────────────────────────────────────────
let poseLandmarker = null;
let drawingUtils = null;
let PoseLandmarkerClass = null;
let ws = null;
let team = null;
let pushups = 0;

let animFrameId = null;
let isGameActive = false;

// Deploy mode: 'auto' or 'manual'
let deployMode = 'auto';

// ── Jump Detection (Side View) ──────────────────────────────
let jumpState = 'grounded';        // 'grounded' or 'airborne'
let restHipY = null;               // baseline hip Y (calibrated)
let calibrationFrames = 0;         // frames collected for calibration
let calibrationSum = 0;            // sum of hip Y during calibration
const CALIBRATION_FRAMES = 20;     // frames to average for baseline (more = stable)
const JUMP_THRESHOLD = 0.035;      // min hip rise to count as jump (3.5% of frame)
const JUMP_COOLDOWN = 400;         // ms between valid jumps
let lastJumpTime = 0;
let emaHipY = 0;                   // smoothed hip Y
const HIP_EMA_ALPHA = 0.3;         // smoothing factor for hip position
let isCalibrated = false;

// ── Body Alignment (Side View) ──────────────────────────────
let emaAlignAngle = 180;           // smoothed alignment angle
const ALIGN_EMA_ALPHA = 0.25;      // smoothing for alignment
const ALIGN_GOOD_MIN = 160;        // straight body lower bound
const ALIGN_GOOD_MAX = 195;        // straight body upper bound

// ── No-Person Detection ─────────────────────────────────────
let personDetected = true;
let noPersonStartTime = null;
const NO_PERSON_TIMEOUT = 5000;    // 5 seconds
let noPersonCountdownInterval = null;

// ── Head Tracking — Side View (lean-based) ──────────────────
let emaLean = 0;                   // smoothed forward/backward lean
const LEAN_EMA = 0.3;
const LEAN_THRESHOLD = 0.04;       // how far to lean to trigger direction
let currentDirection = 'center';   // 'left', 'right', 'center'
let lastNodTime = 0;
const NOD_COOLDOWN = 1500;         // prevent rapid nod triggers
let lastSentDirection = 'center';

// ── Status Updates ──────────────────────────────────────────
function setStatus(main, sub) {
    if (loaderText) loaderText.textContent = main;
    if (loaderSub) loaderSub.textContent = sub || '';
}

function setStatusError(main, sub) {
    setStatus('❌ ' + main, sub);
    if (loaderText) loaderText.style.color = '#ef233c';
}

// ── Check Secure Context ────────────────────────────────────
function checkSecureContext() {
    if (window.isSecureContext) return true;

    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocalhost) return true;

    setStatusError('HTTPS Required',
        `Camera needs a secure connection.\nUse: https://${location.hostname}:3443/mobile/`);
    return false;
}

// ── Initialize MediaPipe (dynamic import) ───────────────────
async function initMediaPipe() {
    setStatus('Loading AI Model...', 'Downloading pose detection (~5MB)');

    try {
        const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs');
        const { PoseLandmarker, FilesetResolver, DrawingUtils } = vision;
        PoseLandmarkerClass = PoseLandmarker;

        const fileset = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );

        // Try GPU first, fall back to CPU with lite model
        try {
            poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
                    delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                numPoses: 1,
                minPoseDetectionConfidence: 0.3,
                minTrackingConfidence: 0.3,
            });
            console.log('[MediaPipe] Loaded (GPU, Full model)');
        } catch (gpuErr) {
            console.warn('[MediaPipe] GPU failed, trying CPU:', gpuErr.message);
            setStatus('Loading AI Model...', 'GPU unavailable, using CPU fallback');

            poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                    delegate: 'CPU',
                },
                runningMode: 'VIDEO',
                numPoses: 1,
                minPoseDetectionConfidence: 0.3,
                minTrackingConfidence: 0.3,
            });
            console.log('[MediaPipe] Loaded (CPU, Lite model)');
        }

        drawingUtils = new DrawingUtils(overlayCtx);
        return true;
    } catch (err) {
        console.error('[MediaPipe] Failed:', err);
        setStatusError('AI Model Failed', err.message || 'Check your internet connection');
        return false;
    }
}

// ── Camera ──────────────────────────────────────────────────
async function initCamera() {
    setStatus('Starting Camera...', 'Please allow camera access');

    // Check if getUserMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatusError('Camera Not Available',
            window.isSecureContext
                ? 'This browser doesn\'t support camera access'
                : `HTTPS required! Open:\nhttps://${location.hostname}:3443/mobile/`);
        return false;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',  // rear camera for side-view capture
                width: { ideal: 640 },
                height: { ideal: 480 },
            },
            audio: false,
        });

        video.srcObject = stream;

        // Wait for video to be ready
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = () => {
                video.play().then(resolve).catch(reject);
            };
            setTimeout(() => reject(new Error('Camera timeout')), 10000);
        });

        overlayCanvas.width = video.videoWidth;
        overlayCanvas.height = video.videoHeight;

        console.log('[Camera] Ready:', video.videoWidth, 'x', video.videoHeight);
        return true;
    } catch (err) {
        console.error('[Camera] Failed:', err);

        let msg = 'Unknown camera error';
        let sub = err.message;

        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            msg = 'Camera Permission Denied';
            sub = 'Please allow camera access and reload';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            msg = 'No Camera Found';
            sub = 'Make sure your device has a camera';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            msg = 'Camera In Use';
            sub = 'Close other apps using the camera';
        } else if (err.name === 'OverconstrainedError') {
            msg = 'Camera Not Compatible';
            sub = 'Trying fallback...';
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                video.srcObject = stream;
                await video.play();
                overlayCanvas.width = video.videoWidth;
                overlayCanvas.height = video.videoHeight;
                return true;
            } catch (e2) {
                sub = 'Fallback also failed';
            }
        } else if (!window.isSecureContext) {
            msg = 'HTTPS Required';
            sub = `Open: https://${location.hostname}:3443/mobile/`;
        }

        setStatusError(msg, sub);
        return false;
    }
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
            team = msg.team;
            teamBadge.textContent = `🏰 ${team.toUpperCase()} TEAM`;
            teamBadge.className = `badge ${team}`;
        }

        if (msg.type === 'gameStart') {
            readyBtn.classList.add('hidden');
            deployModeSelector.classList.add('hidden');
            isGameActive = true;
            gameStatus.classList.remove('hidden');
            gameStatus.textContent = `⏱ ${msg.timer}s — DO JUMPS!`;

            // Show deploy badge and head indicator if manual
            deployBadge.textContent = deployMode === 'auto' ? '🤖 AUTO' : '🎯 MANUAL';
            if (deployMode === 'manual') {
                deployBadge.classList.add('manual');
                headIndicator.classList.remove('hidden');
            }
        }

        if (msg.type === 'gameOver') {
            isGameActive = false;
            showScreen('over');
            const won = msg.winner === team;
            overResult.textContent = won ? '🏆 YOU WIN!' : '💀 YOU LOSE';
            overResult.style.color = won ? '#2ea043' : '#ef233c';
            overStats.innerHTML = `You did ${pushups} jumps<br>⚔ ${pushups * 4} soldiers deployed`;
            headIndicator.classList.add('hidden');
        }

        if (msg.type === 'error') {
            setStatusError('Server Error', msg.message);
        }
    };

    ws.onclose = () => {
        if (isGameActive) {
            gameStatus.textContent = '⚠ DISCONNECTED — Reconnecting...';
            gameStatus.style.color = '#ef233c';
        }
        setTimeout(initWebSocket, 2000);
    };

    ws.onerror = () => {
        console.error('[WS] Connection error');
    };
}

// ── Angle Calculation (for body alignment) ──────────────────
// Returns the angle at point b in the chain a→b→c (degrees)
function calcAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180 / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
}

// ── Pick the more visible side's landmarks ──────────────────
// From side view, only one side of the body is clearly visible.
function pickSideLandmarks(lm) {
    const lShoulder = lm[11], rShoulder = lm[12];
    const lHip = lm[23], rHip = lm[24];
    const lAnkle = lm[27], rAnkle = lm[28];

    const leftVis = (lShoulder?.visibility || 0) + (lHip?.visibility || 0) + (lAnkle?.visibility || 0);
    const rightVis = (rShoulder?.visibility || 0) + (rHip?.visibility || 0) + (rAnkle?.visibility || 0);

    if (leftVis >= rightVis) {
        return { shoulder: lShoulder, hip: lHip, ankle: lAnkle, side: 'left' };
    } else {
        return { shoulder: rShoulder, hip: rHip, ankle: rAnkle, side: 'right' };
    }
}

// ── HEAD / LEAN TRACKING (Side View) ────────────────────────
// From the side, left/right head yaw is unreliable.
// Instead, we detect forward/backward body lean using nose.x vs hip.x.
// Forward lean → 'left' deployment, Backward lean → 'right' deployment.
function processHeadDirection(lm) {
    if (deployMode !== 'manual' || !isGameActive) return;
    if (jumpState !== 'grounded') return; // only when on ground

    const nose = lm[0];
    const { hip } = pickSideLandmarks(lm);

    if (!nose || !hip) return;
    if ((nose.visibility || 0) < 0.2 || (hip.visibility || 0) < 0.2) return;

    // Lean = horizontal offset of nose from hip
    // Positive = nose is to the right of hip (backward lean if facing right)
    // We use the raw X difference; the sign determines direction
    const rawLean = nose.x - hip.x;
    emaLean = LEAN_EMA * rawLean + (1 - LEAN_EMA) * emaLean;

    let newDirection = 'center';
    if (emaLean < -LEAN_THRESHOLD) {
        newDirection = 'left';
    } else if (emaLean > LEAN_THRESHOLD) {
        newDirection = 'right';
    }

    // Update UI arrow
    if (newDirection === 'left') {
        headArrow.textContent = '⬅';
        headLabel.textContent = 'LEAN LEFT';
        headLabel.style.color = '#4361ee';
    } else if (newDirection === 'right') {
        headArrow.textContent = '➡';
        headLabel.textContent = 'LEAN RIGHT';
        headLabel.style.color = '#ef233c';
    } else {
        headArrow.textContent = '⬆';
        headLabel.textContent = 'LEAN TO AIM';
        headLabel.style.color = '#f5c542';
    }

    currentDirection = newDirection;

    // Send direction to server when it changes
    if (currentDirection !== lastSentDirection) {
        lastSentDirection = currentDirection;
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({
                type: 'headDirection',
                direction: currentDirection,
                yaw: Math.round(emaLean * 100) / 100
            }));
        }
    }

    // NOD / DEPLOY: rapid downward hip dip = confirm and send troops
    // (Reuses nod cooldown logic — the player crouches briefly to confirm)
    const now = Date.now();
    if (currentDirection !== 'center' && (now - lastNodTime) > NOD_COOLDOWN) {
        // Auto-send when leaning clearly for more than the cooldown period
        lastNodTime = now;
        console.log(`[LEAN] DEPLOY — sending troops ${currentDirection}`);

        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({
                type: 'manualDeploy',
                direction: currentDirection
            }));
        }

        headLabel.textContent = '⚔ TROOPS SENT!';
        headLabel.style.color = '#2ea043';
        flashTarget();
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        setTimeout(() => {
            headLabel.textContent = 'LEAN TO AIM';
            headLabel.style.color = '#f5c542';
        }, 800);
    }
}

// ── NO-PERSON DETECTION ─────────────────────────────────────
function handleNoPersonDetected() {
    if (!isGameActive) return;

    if (personDetected) {
        personDetected = false;
        noPersonStartTime = Date.now();
        noPersonOverlay.classList.remove('hidden');
        noPersonTimer.textContent = '5';

        noPersonCountdownInterval = setInterval(() => {
            const elapsed = Date.now() - noPersonStartTime;
            const remaining = Math.ceil((NO_PERSON_TIMEOUT - elapsed) / 1000);

            if (remaining <= 0) {
                clearInterval(noPersonCountdownInterval);
                noPersonCountdownInterval = null;
                noPersonTimer.textContent = '0';

                console.log('[NO-PERSON] 5 seconds elapsed — auto-forfeiting');
                if (ws && ws.readyState === 1) {
                    ws.close();
                }
                isGameActive = false;
                showScreen('over');
                overResult.textContent = '💀 GAME OVER';
                overResult.style.color = '#ef233c';
                overStats.innerHTML = `No player detected for 5 seconds<br>Game auto-forfeited`;
            } else {
                noPersonTimer.textContent = remaining.toString();
            }
        }, 500);
    }
}

function handlePersonReturned() {
    if (personDetected) return;

    personDetected = true;
    noPersonStartTime = null;
    noPersonOverlay.classList.add('hidden');

    if (noPersonCountdownInterval) {
        clearInterval(noPersonCountdownInterval);
        noPersonCountdownInterval = null;
    }
}

// ── Process Landmarks (Side-View Jump + Alignment) ──────────
function processLandmarks(landmarks) {
    if (!landmarks || landmarks.length === 0) return;

    const lm = landmarks[0];
    const { shoulder, hip, ankle } = pickSideLandmarks(lm);

    // Need at least shoulder and hip visible for jump detection
    if (!shoulder || !hip) return;
    if ((shoulder.visibility || 0) < 0.2 || (hip.visibility || 0) < 0.2) return;

    const rawHipY = hip.y; // 0=top, 1=bottom in normalized coords

    // ── CALIBRATION PHASE ────────────────────────────────────
    if (!isCalibrated) {
        calibrationFrames++;
        calibrationSum += rawHipY;

        if (calibrationFrames >= CALIBRATION_FRAMES) {
            restHipY = calibrationSum / calibrationFrames;
            emaHipY = restHipY;
            isCalibrated = true;
            stateIndicator.textContent = '🧍 READY';
            stateIndicator.style.color = '#2ea043';
            console.log(`[CALIBRATION] Baseline hip Y = ${restHipY.toFixed(4)}`);
        } else {
            stateIndicator.textContent = '📐 CALIBRATING...';
            stateIndicator.style.color = '#f5c542';
            angleBarFill.style.width = `${(calibrationFrames / CALIBRATION_FRAMES) * 100}%`;
        }
        return;
    }

    // ── SMOOTH HIP POSITION ──────────────────────────────────
    emaHipY = HIP_EMA_ALPHA * rawHipY + (1 - HIP_EMA_ALPHA) * emaHipY;

    // ── BODY ALIGNMENT CHECK ─────────────────────────────────
    // Shoulder → Hip → Ankle angle (straight body ≈ 180°)
    if (ankle && (ankle.visibility || 0) > 0.15) {
        const alignAngle = calcAngle(shoulder, hip, ankle);
        emaAlignAngle = ALIGN_EMA_ALPHA * alignAngle + (1 - ALIGN_EMA_ALPHA) * emaAlignAngle;

        // Map alignment to progress bar (100% = perfectly straight)
        const deviation = Math.abs(180 - emaAlignAngle);
        const alignPct = Math.max(0, Math.min(100, 100 - (deviation * 3))); // 33° deviation = 0%
        angleBarFill.style.width = `${alignPct}%`;

        // Color code: green=good, yellow=okay, red=bad
        if (emaAlignAngle >= ALIGN_GOOD_MIN && emaAlignAngle <= ALIGN_GOOD_MAX) {
            angleBarFill.style.background = 'linear-gradient(90deg, #2ea043, #4ade80)';
        } else if (deviation < 30) {
            angleBarFill.style.background = 'linear-gradient(90deg, #f5c542, #fbbf24)';
        } else {
            angleBarFill.style.background = 'linear-gradient(90deg, #ef233c, #f87171)';
        }
    }

    // ── JUMP DETECTION ────────────────────────────────────────
    // Hip rising = Y decreasing (0=top in normalized coords)
    const hipRise = restHipY - emaHipY; // positive = body went up

    const now = Date.now();

    if (jumpState === 'grounded' && hipRise > JUMP_THRESHOLD) {
        // Person is airborne!
        jumpState = 'airborne';
        stateIndicator.textContent = '🦘 AIRBORNE';
        stateIndicator.style.color = '#4361ee';

        // In manual mode, hide lean indicator while airborne
        if (deployMode === 'manual' && isGameActive) {
            headIndicator.classList.add('hidden');
        }

    } else if (jumpState === 'airborne' && hipRise < JUMP_THRESHOLD * 0.5) {
        // Landed! Count the jump if cooldown passed
        jumpState = 'grounded';
        stateIndicator.textContent = '🧍 GROUNDED';
        stateIndicator.style.color = '#2ea043';

        if ((now - lastJumpTime) > JUMP_COOLDOWN) {
            lastJumpTime = now;
            pushups++;

            pushupCount.textContent = pushups;
            soldiersCount.textContent = `⚔ ${pushups * 4} soldiers sent`;

            flashScreen();
            if (navigator.vibrate) navigator.vibrate(50);

            if (ws && ws.readyState === 1 && isGameActive) {
                ws.send(JSON.stringify({ type: 'pushup', count: pushups }));
            }

            console.log(`[JUMP] #${pushups} detected (hipRise was ${hipRise.toFixed(4)})`);
        }

        // In manual mode, show lean indicator when grounded
        if (deployMode === 'manual' && isGameActive) {
            headIndicator.classList.remove('hidden');
        }
    }

    // Re-calibrate slowly (drift correction) — nudge restHipY when grounded
    if (jumpState === 'grounded') {
        restHipY = 0.995 * restHipY + 0.005 * rawHipY;
    }

    // Process lean direction for manual deploy mode
    processHeadDirection(lm);
}

// ── Visual Flash ────────────────────────────────────────────
function flashScreen() {
    const flash = document.createElement('div');
    flash.className = 'pushup-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 300);
}

function flashTarget() {
    const flash = document.createElement('div');
    flash.className = 'target-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 400);
}

// ── Detection Loop ──────────────────────────────────────────
let lastVideoTime = -1;
let debugFrameCount = 0;

function detectPose() {
    if (!poseLandmarker || !video.videoWidth) {
        animFrameId = requestAnimationFrame(detectPose);
        return;
    }

    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        try {
            const result = poseLandmarker.detectForVideo(video, performance.now());

            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            if (result.landmarks && result.landmarks.length > 0) {
                // Person is detected!
                handlePersonReturned();

                const color = team === 'blue' ? '#4361ee' : team === 'red' ? '#ef233c' : '#6c757d';

                drawingUtils.drawLandmarks(result.landmarks[0], {
                    radius: 4,
                    color: color,
                    fillColor: color,
                });
                drawingUtils.drawConnectors(result.landmarks[0], PoseLandmarkerClass.POSE_CONNECTIONS, {
                    color: color + '80',
                    lineWidth: 2,
                });

                // Debug: log landmark visibility every 60 frames
                debugFrameCount++;
                if (debugFrameCount % 60 === 0) {
                    const lm = result.landmarks[0];
                    const vis = (idx) => (lm[idx]?.visibility || 0).toFixed(2);
                    console.log(`[POSE] Landmarks vis — nose:${vis(0)} L-shoulder:${vis(11)} R-shoulder:${vis(12)} L-hip:${vis(23)} R-hip:${vis(24)} L-ankle:${vis(27)} R-ankle:${vis(28)}`);
                }

                processLandmarks(result.landmarks);
            } else {
                // NO PERSON detected
                handleNoPersonDetected();
            }
        } catch (e) {
            // Silently skip detection errors (can happen on frame drops)
        }
    }

    animFrameId = requestAnimationFrame(detectPose);
}

// ── Deploy Mode Selection ───────────────────────────────────
autoModeBtn.addEventListener('click', () => {
    deployMode = 'auto';
    autoModeBtn.classList.add('active');
    manualModeBtn.classList.remove('active');
    console.log('[MODE] Switched to AUTO deploy');
});

manualModeBtn.addEventListener('click', () => {
    deployMode = 'manual';
    manualModeBtn.classList.add('active');
    autoModeBtn.classList.remove('active');
    console.log('[MODE] Switched to MANUAL deploy');
});

// ── Screen Management ───────────────────────────────────────
function showScreen(name) {
    loadingScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    overScreen.classList.remove('active');

    if (name === 'loading') loadingScreen.classList.add('active');
    if (name === 'game') gameScreen.classList.add('active');
    if (name === 'over') overScreen.classList.add('active');
}

// ── Ready Button ────────────────────────────────────────────
readyBtn.addEventListener('click', () => {
    if (ws && ws.readyState === 1) {
        // Send ready with deploy mode
        ws.send(JSON.stringify({ type: 'ready', deployMode }));
        readyBtn.textContent = '✅ READY!';
        readyBtn.style.background = 'rgba(46,160,67,0.3)';
        readyBtn.style.pointerEvents = 'none';

        // Hide mode selector after ready
        deployModeSelector.classList.add('hidden');
    }
});

// ── Main Init ───────────────────────────────────────────────
async function init() {
    showScreen('loading');

    // Step 1: Check secure context
    if (!checkSecureContext()) return;

    // Step 2: Connect WebSocket (non-blocking)
    setStatus('Connecting to game...', `Server: ${location.host}`);
    initWebSocket();

    // Step 3: Load MediaPipe
    const mpOk = await initMediaPipe();
    if (!mpOk) return;

    // Step 4: Start camera
    const camOk = await initCamera();
    if (!camOk) return;

    // Step 5: All good!
    setStatus('✅ Ready!', 'Switching to game view...');
    await new Promise(r => setTimeout(r, 500));

    showScreen('game');
    detectPose();
}

init();
