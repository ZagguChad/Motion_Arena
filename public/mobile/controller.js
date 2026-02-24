// ============================================================
// PUSH-UP BATTLE — Side-View Mobile Controller
// Landscape-locked | 3-2-1 Countdown | Anti-Fake Push-Up Detection
// ============================================================

// ── DOM ─────────────────────────────────────────────────────
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
const deployBadge = document.getElementById('deployBadge');
const headIndicator = document.getElementById('headIndicator');
const headArrow = document.getElementById('headArrow');
const headLabel = document.getElementById('headLabel');
const noPersonOverlay = document.getElementById('noPersonOverlay');
const noPersonTimer = document.getElementById('noPersonTimer');
const deployModeSelector = document.getElementById('deployModeSelector');
const autoModeBtn = document.getElementById('autoModeBtn');
const manualModeBtn = document.getElementById('manualModeBtn');
const countdownOverlay = document.getElementById('countdownOverlay');
const countdownNumber = document.getElementById('countdownNumber');

// ── State ───────────────────────────────────────────────────
let poseLandmarker = null;
let PoseLandmarkerClass = null;
let ws = null;
let team = null;
let pushups = 0;
let animFrameId = null;
let isGameActive = false;
let deployMode = 'auto';

// ── Orientation Lock ────────────────────────────────────────
async function lockLandscape() {
    try {
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape');
            console.log('[ORIENT] Locked to landscape');
        }
    } catch (e) {
        console.warn('[ORIENT] Lock failed (CSS fallback active):', e.message);
    }
}

// ── SIDE-VIEW PUSH-UP DETECTION ─────────────────────────────
// From the side, a push-up looks like:
//   UP position:   arms extended, shoulder high, body straight
//   DOWN position:  arms bent, shoulder drops close to ground
//
// We track:
//   1. shoulderY relative to ankleY (normalized body position)
//   2. Require full range of motion (deep enough down + high enough up)
//   3. Must maintain body alignment (no arching/sagging)
//   4. Anti-fake: multi-point validation, speed limits, consistency

// Calibration
let isCalibrated = false;
let calibFrames = 0;
let calibShoulderSum = 0;
let calibHipSum = 0;
let calibAnkleSum = 0;
let calibShoulderSqSum = 0;    // for variance check
const CALIB_FRAMES = 30;        // ~1 second at 30fps
const CALIB_MAX_VARIANCE = 0.003; // person must be still

// Baseline positions (set after calibration — UP position)
let baseShoulderY = 0;  // shoulder Y in UP position
let baseHipY = 0;       // hip Y in UP position
let baseAnkleY = 0;     // ankle Y (ground reference)
let bodyHeight = 0;     // shoulder-to-ankle distance (normalizer)

// Smoothed current positions
let emaShoulderY = 0;
let emaHipY = 0;
const EMA_ALPHA = 0.3;

// Push-up state machine
let pushState = 'up';      // 'up' → 'going_down' → 'down' → 'going_up' → 'up' (count!)
let stateEnteredAt = 0;    // timestamp when current state was entered
let deepestDrop = 0;       // max shoulder drop in current rep

// Thresholds (as fraction of bodyHeight)
const DOWN_ENTER = 0.12;  // shoulder must drop 12% of body height to start "going down"
const DOWN_CONFIRM = 0.20;  // must reach 20% drop to confirm "down" position
const UP_RETURN = 0.08;  // must return within 8% of baseline to confirm "up"
const MIN_DOWN_MS = 200;   // must stay in down zone at least 200ms
const MIN_UP_MS = 200;   // must stay in up zone at least 200ms
const MIN_REP_MS = 800;   // minimum time for a full rep (anti-cheat)
const MAX_REP_MS = 8000;  // max time — if longer, reset (person probably stopped)

// Alignment check
let emaAlignAngle = 180;
const ALIGN_EMA = 0.25;
const ALIGN_MIN = 145;      // minimum angle for valid push-up posture
const ALIGN_MAX = 200;

// Timing
let lastRepTime = 0;
let repStartTime = 0;       // when the current rep started (entered going_down)

// Consecutive frame confirmation
let downFrames = 0;
let upFrames = 0;
const CONFIRM_FRAMES = 3;   // need 3 frames to confirm state change

// No-person detection
let personDetected = true;
let noPersonStartTime = null;
const NO_PERSON_TIMEOUT = 5000;
let noPersonCountdownInterval = null;

// Lean tracking (manual deploy)
let emaLean = 0;
const LEAN_EMA = 0.3;
const LEAN_THRESHOLD = 0.04;
let currentDirection = 'center';
let lastNodTime = 0;
const NOD_COOLDOWN = 1500;
let lastSentDirection = 'center';

// 3-2-1 countdown before tracking starts
let countdownDone = false;

// ── Status Helpers ──────────────────────────────────────────
function setStatus(main, sub) {
    if (loaderText) loaderText.textContent = main;
    if (loaderSub) loaderSub.textContent = sub || '';
}
function setStatusError(main, sub) {
    setStatus('❌ ' + main, sub);
    if (loaderText) loaderText.style.color = '#ef233c';
}

// ── Secure Context Check ────────────────────────────────────
function checkSecureContext() {
    if (window.isSecureContext) return true;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return true;
    setStatusError('HTTPS Required', `Open: https://${location.hostname}:3443/mobile/`);
    return false;
}

// ── MediaPipe Init (LITE model only — efficient) ───────────
async function initMediaPipe() {
    setStatus('Loading AI Model...', 'Downloading pose detection (~3MB)');
    try {
        const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs');
        const { PoseLandmarker, FilesetResolver } = vision;
        PoseLandmarkerClass = PoseLandmarker;

        const fileset = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );

        // Try GPU first, fall back to CPU — ALWAYS use lite model
        try {
            poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                    delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                numPoses: 1,
                minPoseDetectionConfidence: 0.6,
                minTrackingConfidence: 0.6,
            });
            console.log('[MediaPipe] Loaded (GPU, Lite)');
        } catch (gpuErr) {
            console.warn('[MediaPipe] GPU failed:', gpuErr.message);
            setStatus('Loading AI Model...', 'Using CPU fallback');
            poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                    delegate: 'CPU',
                },
                runningMode: 'VIDEO',
                numPoses: 1,
                minPoseDetectionConfidence: 0.6,
                minTrackingConfidence: 0.6,
            });
            console.log('[MediaPipe] Loaded (CPU, Lite)');
        }
        return true;
    } catch (err) {
        console.error('[MediaPipe] Failed:', err);
        setStatusError('AI Model Failed', err.message);
        return false;
    }
}

// ── Camera (environment = rear camera, landscape preferred) ─
async function initCamera() {
    setStatus('Starting Camera...', 'Please allow camera access');
    if (!navigator.mediaDevices?.getUserMedia) {
        setStatusError('Camera Not Available',
            window.isSecureContext ? 'Browser doesn\'t support camera' : `Use HTTPS`);
        return false;
    }

    try {
        // Try rear camera first (side-view setup), fall back to any camera
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false,
            });
        } catch (e) {
            console.warn('[Camera] Rear camera failed, trying any camera');
            stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false,
            });
        }

        video.srcObject = stream;
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = () => video.play().then(resolve).catch(reject);
            setTimeout(() => reject(new Error('Camera timeout')), 10000);
        });

        overlayCanvas.width = video.videoWidth;
        overlayCanvas.height = video.videoHeight;
        console.log('[Camera] Ready:', video.videoWidth, 'x', video.videoHeight);
        return true;
    } catch (err) {
        console.error('[Camera] Failed:', err);
        let msg = 'Camera Error', sub = err.message;
        if (err.name === 'NotAllowedError') { msg = 'Camera Denied'; sub = 'Allow camera & reload'; }
        else if (err.name === 'NotFoundError') { msg = 'No Camera'; sub = 'Connect a camera'; }
        else if (!window.isSecureContext) { msg = 'HTTPS Required'; sub = `https://${location.hostname}:3443/mobile/`; }
        setStatusError(msg, sub);
        return false;
    }
}

// ── WebSocket ───────────────────────────────────────────────
function initWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}/player`);

    ws.onopen = () => { console.log('[WS] Connected'); setStatus('Connected!', 'Setting up...'); };

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
            deployBadge.textContent = deployMode === 'auto' ? '🤖 AUTO' : '🎯 MANUAL';
            deployBadge.classList.remove('hidden');
            if (deployMode === 'manual') {
                deployBadge.classList.add('manual');
                headIndicator.classList.remove('hidden');
            }
            // Start 3-2-1 countdown before tracking
            startPushupCountdown();
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

        if (msg.type === 'error') { setStatusError('Server Error', msg.message); }
    };

    ws.onclose = () => {
        if (isGameActive) {
            gameStatus.textContent = '⚠ DISCONNECTED — Reconnecting...';
            gameStatus.style.color = '#ef233c';
        }
        setTimeout(initWebSocket, 2000);
    };
    ws.onerror = () => console.error('[WS] Error');
}

// ── 3-2-1 COUNTDOWN ────────────────────────────────────────
// Counting only starts AFTER this countdown finishes.
function startPushupCountdown() {
    countdownDone = false;
    isCalibrated = false;
    calibFrames = 0;
    calibShoulderSum = 0;
    calibHipSum = 0;
    calibAnkleSum = 0;
    calibShoulderSqSum = 0;
    pushState = 'up';
    pushups = 0;
    pushupCount.textContent = '0';

    countdownOverlay.classList.remove('hidden');
    let count = 3;
    countdownNumber.textContent = count;
    stateIndicator.textContent = '⏳ GET READY';
    stateIndicator.style.color = '#f5c542';

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownNumber.textContent = count;
        } else {
            clearInterval(interval);
            countdownNumber.textContent = 'GO!';
            setTimeout(() => {
                countdownOverlay.classList.add('hidden');
                countdownDone = true;
                stateIndicator.textContent = '📐 STAND STILL...';
                stateIndicator.style.color = '#f5c542';
                console.log('[COUNTDOWN] Done — calibration starting');
            }, 600);
        }
    }, 1000);
}

// ── Angle Calculation ───────────────────────────────────────
function calcAngle(a, b, c) {
    const rad = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(rad * 180 / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
}

// ── Pick best visible side ─────────────────────────────────
// Side view means only one side's landmarks are reliable.
function pickSide(lm) {
    const v = (idx) => lm[idx]?.visibility || 0;
    const leftScore = v(11) + v(13) + v(15) + v(23) + v(27); // shoulder,elbow,wrist,hip,ankle
    const rightScore = v(12) + v(14) + v(16) + v(24) + v(28);

    if (leftScore >= rightScore) {
        return { shoulder: lm[11], elbow: lm[13], wrist: lm[15], hip: lm[23], ankle: lm[27], side: 'L' };
    } else {
        return { shoulder: lm[12], elbow: lm[14], wrist: lm[16], hip: lm[24], ankle: lm[28], side: 'R' };
    }
}

// ── Draw side-profile landmarks (4 key points + connections) ─
function drawSideProfile(lm, color) {
    const s = pickSide(lm);
    const nose = lm[0];
    const pts = [nose, s.shoulder, s.elbow, s.wrist, s.hip, s.ankle].filter(p => p && (p.visibility || 0) > 0.3);

    for (const pt of pts) {
        const x = pt.x * overlayCanvas.width;
        const y = pt.y * overlayCanvas.height;
        overlayCtx.beginPath();
        overlayCtx.arc(x, y, 5, 0, Math.PI * 2);
        overlayCtx.fillStyle = color;
        overlayCtx.fill();
        overlayCtx.strokeStyle = '#fff';
        overlayCtx.lineWidth = 1.5;
        overlayCtx.stroke();
    }

    // Connections: nose→shoulder→hip→ankle, shoulder→elbow→wrist
    const chains = [
        [nose, s.shoulder, s.hip, s.ankle],
        [s.shoulder, s.elbow, s.wrist],
    ];
    for (const chain of chains) {
        overlayCtx.strokeStyle = color + '80';
        overlayCtx.lineWidth = 2.5;
        overlayCtx.beginPath();
        let started = false;
        for (const pt of chain) {
            if (!pt || (pt.visibility || 0) < 0.3) { started = false; continue; }
            const x = pt.x * overlayCanvas.width, y = pt.y * overlayCanvas.height;
            if (!started) { overlayCtx.moveTo(x, y); started = true; }
            else overlayCtx.lineTo(x, y);
        }
        overlayCtx.stroke();
    }
}

// ── PUSH-UP DETECTION (SIDE VIEW) ───────────────────────────
function processLandmarks(landmarks) {
    if (!landmarks?.length) return;
    if (!countdownDone) return;  // don't process until 3-2-1 is done

    const lm = landmarks[0];
    const s = pickSide(lm);

    // Require good visibility on key joints
    const vis = (p) => p?.visibility || 0;
    if (vis(s.shoulder) < 0.5 || vis(s.hip) < 0.5 || vis(s.ankle) < 0.45) return;

    const rawShoulderY = s.shoulder.y;
    const rawHipY = s.hip.y;
    const rawAnkleY = s.ankle.y;

    // ── CALIBRATION ─────────────────────────────────────────
    // Person must be still in push-up UP position for 30 frames
    if (!isCalibrated) {
        calibFrames++;
        calibShoulderSum += rawShoulderY;
        calibHipSum += rawHipY;
        calibAnkleSum += rawAnkleY;
        calibShoulderSqSum += rawShoulderY * rawShoulderY;

        const progress = calibFrames / CALIB_FRAMES;
        angleBarFill.style.width = `${progress * 100}%`;
        stateIndicator.textContent = '📐 HOLD STILL...';
        stateIndicator.style.color = '#f5c542';

        if (calibFrames >= CALIB_FRAMES) {
            const mean = calibShoulderSum / CALIB_FRAMES;
            const variance = (calibShoulderSqSum / CALIB_FRAMES) - (mean * mean);

            if (variance > CALIB_MAX_VARIANCE) {
                // Too much movement — restart
                console.log(`[CALIB] Variance ${variance.toFixed(5)} too high, restarting`);
                calibFrames = 0;
                calibShoulderSum = 0; calibHipSum = 0; calibAnkleSum = 0;
                calibShoulderSqSum = 0;
                stateIndicator.textContent = '⚠ STAY STILL!';
                stateIndicator.style.color = '#ef233c';
                return;
            }

            baseShoulderY = mean;
            baseHipY = calibHipSum / CALIB_FRAMES;
            baseAnkleY = calibAnkleSum / CALIB_FRAMES;
            bodyHeight = Math.abs(baseAnkleY - baseShoulderY);
            emaShoulderY = baseShoulderY;
            emaHipY = baseHipY;
            isCalibrated = true;
            pushState = 'up';
            deepestDrop = 0;
            downFrames = 0;
            upFrames = 0;

            stateIndicator.textContent = '✅ START PUSH-UPS!';
            stateIndicator.style.color = '#2ea043';
            console.log(`[CALIB] Done: shoulder=${baseShoulderY.toFixed(3)} ankle=${baseAnkleY.toFixed(3)} bodyH=${bodyHeight.toFixed(3)}`);
        }
        return;
    }

    if (bodyHeight < 0.05) return; // body not properly visible

    // ── SMOOTH POSITIONS ────────────────────────────────────
    emaShoulderY = EMA_ALPHA * rawShoulderY + (1 - EMA_ALPHA) * emaShoulderY;
    emaHipY = EMA_ALPHA * rawHipY + (1 - EMA_ALPHA) * emaHipY;

    // ── BODY ALIGNMENT CHECK ────────────────────────────────
    // Shoulder → Hip → Ankle should be roughly straight
    if (vis(s.ankle) > 0.4) {
        const alignAngle = calcAngle(s.shoulder, s.hip, s.ankle);
        emaAlignAngle = ALIGN_EMA * alignAngle + (1 - ALIGN_EMA) * emaAlignAngle;

        const deviation = Math.abs(180 - emaAlignAngle);
        const pct = Math.max(0, Math.min(100, 100 - deviation * 3));
        angleBarFill.style.width = `${pct}%`;

        if (emaAlignAngle >= ALIGN_MIN && emaAlignAngle <= ALIGN_MAX) {
            angleBarFill.style.background = 'linear-gradient(90deg, #2ea043, #4ade80)';
        } else if (deviation < 40) {
            angleBarFill.style.background = 'linear-gradient(90deg, #f5c542, #fbbf24)';
        } else {
            angleBarFill.style.background = 'linear-gradient(90deg, #ef233c, #f87171)';
        }
    }

    // ── PUSH-UP STATE MACHINE ───────────────────────────────
    // drop = how much shoulder has moved down from baseline (positive = lower)
    const drop = (emaShoulderY - baseShoulderY) / bodyHeight;
    const now = Date.now();

    // Also check arm bend from side: shoulder→elbow→wrist angle
    let elbowAngle = null;
    if (vis(s.elbow) > 0.4 && vis(s.wrist) > 0.4) {
        elbowAngle = calcAngle(s.shoulder, s.elbow, s.wrist);
    }

    switch (pushState) {
        case 'up':
            // Waiting for person to start going down
            if (drop > DOWN_ENTER) {
                downFrames++;
                if (downFrames >= CONFIRM_FRAMES) {
                    pushState = 'going_down';
                    stateEnteredAt = now;
                    repStartTime = now;
                    deepestDrop = drop;
                    downFrames = 0;
                    stateIndicator.textContent = '⬇ GOING DOWN';
                    stateIndicator.style.color = '#f5c542';
                }
            } else {
                downFrames = 0;
            }
            break;

        case 'going_down':
            // Track the deepest point
            if (drop > deepestDrop) deepestDrop = drop;

            // Check if we've reached deep enough for a valid "down"
            if (deepestDrop >= DOWN_CONFIRM) {
                pushState = 'down';
                stateEnteredAt = now;
                stateIndicator.textContent = '⬇ DOWN';
                stateIndicator.style.color = '#ef233c';
            }

            // Timeout — took too long, reset
            if (now - stateEnteredAt > MAX_REP_MS) {
                pushState = 'up';
                deepestDrop = 0;
                downFrames = 0; upFrames = 0;
                stateIndicator.textContent = '🔄 RESET';
                stateIndicator.style.color = '#888';
                console.log('[PUSHUP] Reset — too slow');
            }
            break;

        case 'down':
            // Must stay down for MIN_DOWN_MS, then start coming up
            if (drop < UP_RETURN) {
                upFrames++;
                if (upFrames >= CONFIRM_FRAMES) {
                    const downDuration = now - stateEnteredAt;
                    if (downDuration >= MIN_DOWN_MS) {
                        pushState = 'going_up';
                        stateEnteredAt = now;
                        upFrames = 0;
                        stateIndicator.textContent = '⬆ GOING UP';
                        stateIndicator.style.color = '#4361ee';
                    }
                }
            } else {
                upFrames = 0;
            }

            // Timeout
            if (now - stateEnteredAt > MAX_REP_MS) {
                pushState = 'up';
                deepestDrop = 0;
                downFrames = 0; upFrames = 0;
            }
            break;

        case 'going_up':
            // Check if fully returned to top
            if (drop < UP_RETURN) {
                upFrames++;
                if (upFrames >= CONFIRM_FRAMES) {
                    const repDuration = now - repStartTime;
                    const sinceLast = now - lastRepTime;

                    // VALIDATION GATES:
                    // 1. Full rep must take at least MIN_REP_MS
                    // 2. Cooldown from last rep
                    // 3. Must have gone deep enough
                    // 4. Body alignment must be acceptable (not flailing)
                    const alignOk = emaAlignAngle >= ALIGN_MIN && emaAlignAngle <= ALIGN_MAX;
                    const deepOk = deepestDrop >= DOWN_CONFIRM;
                    const timeOk = repDuration >= MIN_REP_MS && sinceLast >= MIN_REP_MS;

                    if (deepOk && timeOk && alignOk) {
                        // ✅ VALID PUSH-UP!
                        lastRepTime = now;
                        pushups++;
                        pushupCount.textContent = pushups;
                        soldiersCount.textContent = `⚔ ${pushups * 4} soldiers sent`;

                        flashScreen();
                        if (navigator.vibrate) navigator.vibrate(50);

                        if (ws?.readyState === 1 && isGameActive) {
                            ws.send(JSON.stringify({ type: 'pushup', count: pushups }));
                        }

                        stateIndicator.textContent = '⬆ UP — COUNTED!';
                        stateIndicator.style.color = '#2ea043';
                        console.log(`[PUSHUP] #${pushups} ✓ (drop=${deepestDrop.toFixed(3)}, dur=${repDuration}ms, align=${emaAlignAngle.toFixed(0)}°)`);
                    } else {
                        // ❌ REJECTED
                        stateIndicator.textContent = '❌ NOT COUNTED';
                        stateIndicator.style.color = '#ef233c';
                        const reason = !deepOk ? 'too shallow' : !timeOk ? 'too fast' : 'bad form';
                        console.log(`[PUSHUP] REJECTED (${reason}: drop=${deepestDrop.toFixed(3)}, dur=${repDuration}ms, align=${emaAlignAngle.toFixed(0)}°)`);
                        setTimeout(() => {
                            if (pushState === 'up') {
                                stateIndicator.textContent = '⬆ UP';
                                stateIndicator.style.color = '#2ea043';
                            }
                        }, 800);
                    }

                    // Reset for next rep
                    pushState = 'up';
                    deepestDrop = 0;
                    downFrames = 0; upFrames = 0;
                }
            } else {
                upFrames = 0;
                // Still coming up but haven't reached top — stay in going_up
            }

            // Timeout
            if (now - stateEnteredAt > MAX_REP_MS) {
                pushState = 'up';
                deepestDrop = 0;
                downFrames = 0; upFrames = 0;
            }
            break;
    }

    // Very slow drift correction (only in 'up' resting state)
    if (pushState === 'up' && downFrames === 0) {
        baseShoulderY = 0.999 * baseShoulderY + 0.001 * rawShoulderY;
        baseHipY = 0.999 * baseHipY + 0.001 * rawHipY;
    }

    // Manual deploy — lean detection
    processLeanDirection(lm);
}

// ── LEAN DIRECTION (manual deploy mode) ─────────────────────
function processLeanDirection(lm) {
    if (deployMode !== 'manual' || !isGameActive) return;
    if (pushState !== 'up') return; // only when at rest

    const nose = lm[0];
    const s = pickSide(lm);
    if (!nose || !s.hip) return;
    if ((nose.visibility || 0) < 0.4 || (s.hip.visibility || 0) < 0.4) return;

    const rawLean = nose.x - s.hip.x;
    emaLean = LEAN_EMA * rawLean + (1 - LEAN_EMA) * emaLean;

    let newDir = 'center';
    if (emaLean < -LEAN_THRESHOLD) newDir = 'left';
    else if (emaLean > LEAN_THRESHOLD) newDir = 'right';

    if (newDir === 'left') {
        headArrow.textContent = '⬅'; headLabel.textContent = 'LEAN LEFT'; headLabel.style.color = '#4361ee';
    } else if (newDir === 'right') {
        headArrow.textContent = '➡'; headLabel.textContent = 'LEAN RIGHT'; headLabel.style.color = '#ef233c';
    } else {
        headArrow.textContent = '⬆'; headLabel.textContent = 'LEAN TO AIM'; headLabel.style.color = '#f5c542';
    }

    currentDirection = newDir;

    if (currentDirection !== lastSentDirection) {
        lastSentDirection = currentDirection;
        if (ws?.readyState === 1) {
            ws.send(JSON.stringify({ type: 'headDirection', direction: currentDirection, yaw: Math.round(emaLean * 100) / 100 }));
        }
    }

    const now = Date.now();
    if (currentDirection !== 'center' && (now - lastNodTime) > NOD_COOLDOWN) {
        lastNodTime = now;
        if (ws?.readyState === 1) {
            ws.send(JSON.stringify({ type: 'manualDeploy', direction: currentDirection }));
        }
        headLabel.textContent = '⚔ TROOPS SENT!'; headLabel.style.color = '#2ea043';
        flashTarget();
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        setTimeout(() => { headLabel.textContent = 'LEAN TO AIM'; headLabel.style.color = '#f5c542'; }, 800);
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
                clearInterval(noPersonCountdownInterval); noPersonCountdownInterval = null;
                noPersonTimer.textContent = '0';
                if (ws?.readyState === 1) ws.close();
                isGameActive = false;
                showScreen('over');
                overResult.textContent = '💀 GAME OVER'; overResult.style.color = '#ef233c';
                overStats.innerHTML = 'No player detected for 5 seconds<br>Game auto-forfeited';
            } else {
                noPersonTimer.textContent = remaining.toString();
            }
        }, 500);
    }
}
function handlePersonReturned() {
    if (personDetected) return;
    personDetected = true; noPersonStartTime = null;
    noPersonOverlay.classList.add('hidden');
    if (noPersonCountdownInterval) { clearInterval(noPersonCountdownInterval); noPersonCountdownInterval = null; }
}

// ── Visual Effects ──────────────────────────────────────────
function flashScreen() {
    const f = document.createElement('div'); f.className = 'pushup-flash';
    document.body.appendChild(f); setTimeout(() => f.remove(), 300);
}
function flashTarget() {
    const f = document.createElement('div'); f.className = 'target-flash';
    document.body.appendChild(f); setTimeout(() => f.remove(), 400);
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

            if (result.landmarks?.length > 0) {
                handlePersonReturned();
                const color = team === 'blue' ? '#4361ee' : team === 'red' ? '#ef233c' : '#6c757d';
                drawSideProfile(result.landmarks[0], color);
                processLandmarks(result.landmarks);
            } else {
                handleNoPersonDetected();
            }
        } catch (e) { /* skip frame errors */ }
    }
    animFrameId = requestAnimationFrame(detectPose);
}

// ── Deploy Mode Selection ───────────────────────────────────
autoModeBtn.addEventListener('click', () => {
    deployMode = 'auto';
    autoModeBtn.classList.add('active'); manualModeBtn.classList.remove('active');
});
manualModeBtn.addEventListener('click', () => {
    deployMode = 'manual';
    manualModeBtn.classList.add('active'); autoModeBtn.classList.remove('active');
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
    if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'ready', deployMode }));
        readyBtn.textContent = '✅ READY!';
        readyBtn.style.background = 'rgba(46,160,67,0.3)';
        readyBtn.style.pointerEvents = 'none';
        deployModeSelector.classList.add('hidden');
    }
});

// ── Main Init ───────────────────────────────────────────────
async function init() {
    showScreen('loading');
    if (!checkSecureContext()) return;

    // Lock to landscape
    await lockLandscape();

    setStatus('Connecting...', `Server: ${location.host}`);
    initWebSocket();

    const mpOk = await initMediaPipe();
    if (!mpOk) return;

    const camOk = await initCamera();
    if (!camOk) return;

    setStatus('✅ Ready!', 'Switching to game view...');
    await new Promise(r => setTimeout(r, 500));
    showScreen('game');
    detectPose();
}

init();
