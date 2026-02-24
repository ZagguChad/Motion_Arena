// ============================================================
// TOWER SIEGE — Mobile Controller
// MediaPipe Pose + Push-Up Counter + Head Targeting + WebSocket
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
let armState = 'up';
let lastStateChangeTime = 0;
const STATE_DEBOUNCE = 400;
const DOWN_THRESHOLD = 70;
const UP_THRESHOLD = 30;

let emaAngle1 = 0;
let emaAngle2 = 0;
const EMA_ALPHA = 0.3;

let animFrameId = null;
let isGameActive = false;

// Deploy mode: 'auto' or 'manual'
let deployMode = 'auto';

// ── No-Person Detection ─────────────────────────────────────
let personDetected = true;
let noPersonStartTime = null;
const NO_PERSON_TIMEOUT = 5000;  // 5 seconds
let noPersonCountdownInterval = null;

// ── Head Tracking (for manual mode) ─────────────────────────
let headYaw = 0;              // -1 (left) to 1 (right)
let headPitch = 0;            // -1 (up) to 1 (down)
let emaHeadYaw = 0;
let emaHeadPitch = 0;
const HEAD_EMA = 0.35;
const HEAD_YAW_THRESHOLD = 0.25;     // how far to turn to trigger direction
const NOD_THRESHOLD = 0.35;          // chin drop to confirm
let currentDirection = 'center';     // 'left', 'right', 'center'
let lastNodTime = 0;
const NOD_COOLDOWN = 1500;           // prevent rapid nods
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
                minPoseDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
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
                minPoseDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
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
                facingMode: 'user',
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
            gameStatus.textContent = `⏱ ${msg.timer}s — DO PUSH-UPS!`;

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
            overStats.innerHTML = `You did ${pushups} push-ups<br>⚔ ${pushups * 4} soldiers deployed`;
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

// ── Angle Calculation ───────────────────────────────────────
function calcAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180 / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
}

// ── HEAD TRACKING ───────────────────────────────────────────
// Uses nose position relative to shoulders to determine head yaw
// MediaPipe landmarks: 0=nose, 7=left ear, 8=right ear, 11=leftShoulder, 12=rightShoulder
function processHeadDirection(lm) {
    if (deployMode !== 'manual' || !isGameActive) return;
    if (armState !== 'up') return;  // only track head when at top of push-up

    const nose = lm[0];
    const leftEar = lm[7];
    const rightEar = lm[8];
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];

    if (!nose || !leftEar || !rightEar || !leftShoulder || !rightShoulder) return;
    if (nose.visibility < 0.5) return;

    // Calculate shoulder midpoint
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    if (shoulderWidth < 0.05) return;  // shoulders not visible enough

    // HEAD YAW: nose offset from shoulder center, normalized by shoulder width
    // Positive = looking right (from camera POV), Negative = looking left
    const rawYaw = (nose.x - shoulderMidX) / shoulderWidth;
    emaHeadYaw = HEAD_EMA * rawYaw + (1 - HEAD_EMA) * emaHeadYaw;

    // HEAD PITCH: use ear-to-nose Y difference for nod detection
    const earMidY = (leftEar.y + rightEar.y) / 2;
    const rawPitch = (nose.y - earMidY);  // positive = chin down (nod)
    emaHeadPitch = HEAD_EMA * rawPitch + (1 - HEAD_EMA) * emaHeadPitch;

    // Determine direction from yaw
    let newDirection = 'center';
    if (emaHeadYaw < -HEAD_YAW_THRESHOLD) {
        newDirection = 'left';
    } else if (emaHeadYaw > HEAD_YAW_THRESHOLD) {
        newDirection = 'right';
    }

    // Update UI arrow
    if (newDirection === 'left') {
        headArrow.textContent = '⬅';
        headArrow.style.transform = 'rotate(0deg)';
        headLabel.textContent = 'TARGET LEFT';
        headLabel.style.color = '#4361ee';
    } else if (newDirection === 'right') {
        headArrow.textContent = '➡';
        headArrow.style.transform = 'rotate(0deg)';
        headLabel.textContent = 'TARGET RIGHT';
        headLabel.style.color = '#ef233c';
    } else {
        headArrow.textContent = '⬆';
        headArrow.style.transform = 'rotate(0deg)';
        headLabel.textContent = 'AIM WITH HEAD';
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
                yaw: Math.round(emaHeadYaw * 100) / 100
            }));
        }
    }

    // NOD DETECTION: sharp chin drop = confirm and send troops
    const now = Date.now();
    if (emaHeadPitch > NOD_THRESHOLD && (now - lastNodTime) > NOD_COOLDOWN) {
        if (currentDirection !== 'center') {
            lastNodTime = now;
            console.log(`[HEAD] NOD CONFIRM — sending troops ${currentDirection}`);

            // Send deploy command
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({
                    type: 'manualDeploy',
                    direction: currentDirection
                }));
            }

            // Visual feedback
            headLabel.textContent = '⚔ TROOPS SENT!';
            headLabel.style.color = '#2ea043';
            flashTarget();
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

            // Reset after a moment
            setTimeout(() => {
                headLabel.textContent = 'AIM WITH HEAD';
                headLabel.style.color = '#f5c542';
            }, 800);
        }
    }
}

// ── NO-PERSON DETECTION ─────────────────────────────────────
function handleNoPersonDetected() {
    if (!isGameActive) return;

    if (personDetected) {
        // Person was detected before, now gone
        personDetected = false;
        noPersonStartTime = Date.now();
        noPersonOverlay.classList.remove('hidden');
        noPersonTimer.textContent = '5';

        // Start countdown
        noPersonCountdownInterval = setInterval(() => {
            const elapsed = Date.now() - noPersonStartTime;
            const remaining = Math.ceil((NO_PERSON_TIMEOUT - elapsed) / 1000);

            if (remaining <= 0) {
                // TIME'S UP — auto-forfeit
                clearInterval(noPersonCountdownInterval);
                noPersonCountdownInterval = null;
                noPersonTimer.textContent = '0';

                console.log('[NO-PERSON] 5 seconds elapsed — auto-forfeiting');
                if (ws && ws.readyState === 1) {
                    ws.close();  // closing WS triggers forfeit on server
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
    if (personDetected) return;  // already detected

    personDetected = true;
    noPersonStartTime = null;
    noPersonOverlay.classList.add('hidden');

    if (noPersonCountdownInterval) {
        clearInterval(noPersonCountdownInterval);
        noPersonCountdownInterval = null;
    }
}

// ── Process Landmarks ───────────────────────────────────────
function processLandmarks(landmarks) {
    if (!landmarks || landmarks.length === 0) return;

    const lm = landmarks[0];

    const lShoulder = lm[11], rShoulder = lm[12];
    const lElbow = lm[13], rElbow = lm[14];
    const lWrist = lm[15], rWrist = lm[16];

    if (!lShoulder || !rShoulder || !lElbow || !rElbow || !lWrist || !rWrist) return;
    if (lShoulder.visibility < 0.5 || rShoulder.visibility < 0.5) return;

    const angleLeft = calcAngle(lShoulder, lElbow, lWrist);
    const angleRight = calcAngle(rShoulder, rElbow, rWrist);

    const rawPct1 = Math.max(0, Math.min(100, ((170 - angleLeft) / (170 - 60)) * 100));
    const rawPct2 = Math.max(0, Math.min(100, ((170 - angleRight) / (170 - 60)) * 100));

    emaAngle1 = EMA_ALPHA * rawPct1 + (1 - EMA_ALPHA) * emaAngle1;
    emaAngle2 = EMA_ALPHA * rawPct2 + (1 - EMA_ALPHA) * emaAngle2;

    const avgAngle = (emaAngle1 + emaAngle2) / 2;
    angleBarFill.style.width = `${avgAngle}%`;

    const now = Date.now();
    if (now - lastStateChangeTime < STATE_DEBOUNCE) return;

    if (armState === 'up' && avgAngle > DOWN_THRESHOLD) {
        armState = 'down';
        lastStateChangeTime = now;
        stateIndicator.textContent = '⬇ DOWN';
        stateIndicator.style.color = '#ef233c';

        // In manual mode, hide head indicator while pushing down
        if (deployMode === 'manual' && isGameActive) {
            headIndicator.classList.add('hidden');
        }
    } else if (armState === 'down' && avgAngle < UP_THRESHOLD) {
        armState = 'up';
        lastStateChangeTime = now;
        pushups++;
        stateIndicator.textContent = '⬆ UP';
        stateIndicator.style.color = '#2ea043';

        pushupCount.textContent = pushups;
        soldiersCount.textContent = `⚔ ${pushups * 4} soldiers sent`;

        flashScreen();
        if (navigator.vibrate) navigator.vibrate(50);

        if (ws && ws.readyState === 1 && isGameActive) {
            ws.send(JSON.stringify({ type: 'pushup', count: pushups }));
        }

        // In manual mode, show head indicator at top position
        if (deployMode === 'manual' && isGameActive) {
            headIndicator.classList.remove('hidden');
        }
    }

    // Process head direction for manual mode (only when at top)
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
