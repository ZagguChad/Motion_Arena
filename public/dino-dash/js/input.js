// ============================================
// INPUT.JS — Side-View LOWER-BODY Jump Detection
// ============================================
// Tracks ONLY: hip, knee, ankle (per side)
// NO upper body tracking — saves computation.
// Jump = hip rises above threshold for 3+ frames.
// Uses model complexity 0 (lite) for speed.

// ─── Landmark Indices (lower body only) ───
const POSE = {
    LEFT_HIP: 23, RIGHT_HIP: 24,
    LEFT_KNEE: 25, RIGHT_KNEE: 26,
    LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};

// ─── Leg Skeleton Connections ───
const LEG_BONES = [
    [POSE.LEFT_HIP, POSE.LEFT_KNEE],
    [POSE.LEFT_KNEE, POSE.LEFT_ANKLE],
    [POSE.RIGHT_HIP, POSE.RIGHT_KNEE],
    [POSE.RIGHT_KNEE, POSE.RIGHT_ANKLE],
    [POSE.LEFT_HIP, POSE.RIGHT_HIP],
];

// ─── EMA Smoother ───
class EMA {
    constructor(alpha = 0.4) { this.a = alpha; this.v = null; }
    update(x) { this.v = this.v === null ? x : this.a * x + (1 - this.a) * this.v; return this.v; }
    reset() { this.v = null; }
}

export class InputManager {
    constructor() {
        // Jump
        this.jumpRequested = false;
        this.lastJumpTime = 0;
        this.jumpCooldown = 600;

        // Socket
        this.socket = null;

        // Webcam
        this.poseDetector = null;
        this.videoElement = null;
        this.overlayCanvas = null;
        this.overlayCtx = null;
        this.webcamEnabled = false;
        this.webcamReady = false;

        // Smoothers (lower body joints)
        this.hipFilter = new EMA(0.4);
        this.kneeFilter = new EMA(0.4);
        this.ankleFilter = new EMA(0.4);

        // Calibration
        this.hipBaseline = 0;
        this.legLength = 0;       // hip-to-ankle distance (for relative threshold)
        this.calibrated = false;
        this.calibSamples = [];
        this.calibLegSamples = [];
        this.CALIB_FRAMES = 40;
        this.STABILITY_LIMIT = 0.025;

        // Jump detection
        this.JUMP_RATIO = 0.12;   // hip must rise 12% of leg length
        this.jumpThreshold = 0;
        this.inAirFrames = 0;
        this.REQUIRED_AIR = 3;
        this.landed = true;

        // Alignment: hip→knee→ankle angle
        this.legAngle = 180;
        this.alignStatus = 'UNKNOWN';

        // Camera rotation
        this.rotation = 0;
        this.rotatedCanvas = null;
        this.rotatedCtx = null;

        // Debug
        this.debugStatus = 'PLACE CAMERA ON SIDE';
        this.debugDelta = 0;

        this._setupKeyboard();
    }

    // ═══ KEYBOARD ═══
    _setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                this.requestJump('keyboard');
            }
        });
    }

    // ═══ PHONE ═══
    setupSocket(socket) {
        this.socket = socket;
        socket.on('gesture', (data) => {
            if (data.action === 'JUMP') this.requestJump('phone');
        });
    }

    // ═══ WEBCAM ═══
    async setupWebcam(videoElement) {
        this.videoElement = videoElement;

        let overlay = document.getElementById('pose-overlay');
        if (!overlay) {
            overlay = document.createElement('canvas');
            overlay.id = 'pose-overlay';
            overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;';
            videoElement.parentElement.style.position = 'relative';
            videoElement.parentElement.appendChild(overlay);
        }
        this.overlayCanvas = overlay;
        this.overlayCtx = overlay.getContext('2d');

        this.rotatedCanvas = document.createElement('canvas');
        this.rotatedCtx = this.rotatedCanvas.getContext('2d');

        // Rotate button
        const rotBtn = document.getElementById('cam-rotate-btn');
        if (rotBtn) {
            rotBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._cycleRotation();
            });
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' }
            });
            videoElement.srcObject = stream;
            await videoElement.play();
            this.webcamEnabled = true;

            const previewDiv = videoElement.closest('.webcam-preview');
            if (previewDiv) previewDiv.classList.remove('hidden');

            this._applyRotationCSS();
            this.debugStatus = 'LOADING POSE...';
            await this._initPose();
        } catch (e) {
            console.warn('Webcam unavailable:', e.message);
            this.webcamEnabled = false;
            this.debugStatus = 'NO CAMERA';
        }
    }

    // ═══ ROTATION ═══
    _cycleRotation() {
        this.rotation = (this.rotation + 90) % 360;
        this._applyRotationCSS();
        this._resetCalibration();
        this.debugStatus = 'STAND STILL (re-calibrating)';
    }

    _applyRotationCSS() {
        if (!this.videoElement) return;
        const preview = this.videoElement.closest('.webcam-preview');
        const isPort = this.rotation === 90 || this.rotation === 270;

        this.videoElement.style.transform = `rotate(${this.rotation}deg)`;
        if (this.overlayCanvas) this.overlayCanvas.style.transform = `rotate(${this.rotation}deg)`;

        if (preview) {
            preview.style.width = isPort ? '150px' : '200px';
            preview.style.height = isPort ? '200px' : '150px';
        }
    }

    _getRotatedImage() {
        const v = this.videoElement;
        if (!v || !this.rotatedCanvas || this.rotation === 0) return v;

        const vw = v.videoWidth, vh = v.videoHeight;
        if (!vw || !vh) return v;

        const isPort = this.rotation === 90 || this.rotation === 270;
        const cw = isPort ? vh : vw, ch = isPort ? vw : vh;

        this.rotatedCanvas.width = cw;
        this.rotatedCanvas.height = ch;
        const ctx = this.rotatedCtx;
        ctx.save();
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.drawImage(v, -vw / 2, -vh / 2, vw, vh);
        ctx.restore();
        return this.rotatedCanvas;
    }

    _resetCalibration() {
        this.calibrated = false;
        this.webcamReady = false;
        this.calibSamples = [];
        this.calibLegSamples = [];
        this.hipFilter.reset();
        this.kneeFilter.reset();
        this.ankleFilter.reset();
        this.inAirFrames = 0;
        this.landed = true;
    }

    // ═══ POSE INIT ═══
    async _initPose() {
        if (typeof Pose === 'undefined') {
            this.webcamEnabled = false;
            this.debugStatus = 'POSE LIB NOT LOADED';
            return;
        }
        try {
            this.poseDetector = new Pose({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
            });
            this.poseDetector.setOptions({
                modelComplexity: 1,       // Full model for accurate joint positions
                smoothLandmarks: true,
                enableSegmentation: false,
                minDetectionConfidence: 0.6,
                minTrackingConfidence: 0.6
            });
            this.poseDetector.onResults((r) => this._onResults(r));
            this.debugStatus = 'STAND SIDEWAYS & STILL';
            this._loop();
        } catch (e) {
            this.webcamEnabled = false;
            this.debugStatus = 'POSE INIT FAILED';
        }
    }

    async _loop() {
        if (!this.webcamEnabled || !this.poseDetector || !this.videoElement) return;
        try {
            const img = this._getRotatedImage();
            await this.poseDetector.send({ image: img });
        } catch (e) { }
        requestAnimationFrame(() => this._loop());
    }

    // ═══ POSE RESULTS — LOWER BODY ONLY ═══
    _onResults(results) {
        if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
            this._draw(null);
            this.debugStatus = 'NO BODY DETECTED';
            return;
        }

        const lm = results.poseLandmarks;

        // Pick more visible side
        const lVis = (lm[POSE.LEFT_HIP].visibility + lm[POSE.LEFT_KNEE].visibility + lm[POSE.LEFT_ANKLE].visibility) / 3;
        const rVis = (lm[POSE.RIGHT_HIP].visibility + lm[POSE.RIGHT_KNEE].visibility + lm[POSE.RIGHT_ANKLE].visibility) / 3;
        const useL = lVis >= rVis;

        const hip = lm[useL ? POSE.LEFT_HIP : POSE.RIGHT_HIP];
        const knee = lm[useL ? POSE.LEFT_KNEE : POSE.RIGHT_KNEE];
        const ankle = lm[useL ? POSE.LEFT_ANKLE : POSE.RIGHT_ANKLE];

        // Need hip + at least one of knee/ankle visible
        if (hip.visibility < 0.3) {
            this._draw(lm);
            this.debugStatus = 'SHOW LEGS (SIDE VIEW)';
            this.inAirFrames = 0;
            return;
        }

        const kneeVis = knee.visibility > 0.3;
        const ankleVis = ankle.visibility > 0.3;

        if (!kneeVis && !ankleVis) {
            this._draw(lm);
            this.debugStatus = 'SHOW LEGS (STEP BACK)';
            this.inAirFrames = 0;
            return;
        }

        // Smooth
        const sHipY = this.hipFilter.update(hip.y);
        const sKneeY = kneeVis ? this.kneeFilter.update(knee.y) : sHipY + 0.15;
        const sAnkleY = ankleVis ? this.ankleFilter.update(ankle.y) : sKneeY + 0.15;

        // Leg alignment: hip→knee→ankle angle
        if (kneeVis && ankleVis) {
            this.legAngle = this._angle(
                { x: hip.x, y: sHipY },
                { x: knee.x, y: sKneeY },
                { x: ankle.x, y: sAnkleY }
            );
            this.alignStatus = this.legAngle > 160 ? 'GOOD' : this.legAngle > 140 ? 'FAIR' : 'BENT';
        }

        // Calibration
        if (!this.calibrated) {
            this._calibrate(sHipY, Math.abs(sAnkleY - sHipY));
            this._draw(lm);
            return;
        }

        // ─── Jump detection: hip Y delta ───
        const delta = this.hipBaseline - sHipY; // positive = upward
        this.debugDelta = delta;

        if (delta > this.jumpThreshold) {
            this.inAirFrames++;
            if (this.inAirFrames >= this.REQUIRED_AIR && this.landed) {
                this.landed = false;
                this.requestJump('webcam');
                this.debugStatus = '🦘 JUMP!';
                setTimeout(() => { if (this.webcamReady) this.debugStatus = 'READY — JUMP!'; }, 500);
            }
        } else {
            if (this.inAirFrames > 0) this.landed = true;
            this.inAirFrames = 0;
        }

        // Slow baseline drift
        this.hipBaseline = this.hipBaseline * 0.998 + sHipY * 0.002;

        this._draw(lm);
    }

    _calibrate(hipY, legH) {
        this.calibSamples.push(hipY);
        this.calibLegSamples.push(legH);

        if (this.calibSamples.length >= 8) {
            const recent = this.calibSamples.slice(-8);
            const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const maxDev = Math.max(...recent.map(s => Math.abs(s - avg)));
            if (maxDev > this.STABILITY_LIMIT) {
                this.calibSamples = [];
                this.calibLegSamples = [];
                this.debugStatus = 'STAND STILL';
                return;
            }
        }

        const pct = Math.floor((this.calibSamples.length / this.CALIB_FRAMES) * 100);
        this.debugStatus = `CALIBRATING ${pct}%`;

        if (this.calibSamples.length >= this.CALIB_FRAMES) {
            this.hipBaseline = this.calibSamples.reduce((a, b) => a + b, 0) / this.calibSamples.length;
            this.legLength = this.calibLegSamples.reduce((a, b) => a + b, 0) / this.calibLegSamples.length;
            this.jumpThreshold = this.legLength * this.JUMP_RATIO;
            this.calibrated = true;
            this.webcamReady = true;
            this.debugStatus = 'READY — JUMP!';
        }
    }

    _angle(a, b, c) {
        const v1x = a.x - b.x, v1y = a.y - b.y;
        const v2x = c.x - b.x, v2y = c.y - b.y;
        const dot = v1x * v2x + v1y * v2y;
        const m1 = Math.sqrt(v1x * v1x + v1y * v1y);
        const m2 = Math.sqrt(v2x * v2x + v2y * v2y);
        if (m1 === 0 || m2 === 0) return 180;
        return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * (180 / Math.PI);
    }

    // ═══ OVERLAY — LEGS ONLY ═══
    _draw(landmarks) {
        if (!this.overlayCanvas || !this.overlayCtx) return;
        const c = this.overlayCanvas;
        const ctx = this.overlayCtx;

        c.width = c.clientWidth;
        c.height = c.clientHeight;
        ctx.clearRect(0, 0, c.width, c.height);

        const w = c.width, h = c.height;

        if (landmarks) {
            // Bone color by alignment
            let boneColor = 'rgba(0,229,255,0.7)';
            if (this.calibrated) {
                boneColor = this.alignStatus === 'GOOD' ? 'rgba(0,255,136,0.8)'
                    : this.alignStatus === 'FAIR' ? 'rgba(255,221,0,0.8)'
                        : 'rgba(255,68,102,0.8)';
            }

            // Draw leg bones only
            ctx.strokeStyle = boneColor;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';

            for (const [i, j] of LEG_BONES) {
                const a = landmarks[i], b = landmarks[j];
                if (a.visibility < 0.25 || b.visibility < 0.25) continue;
                ctx.beginPath();
                ctx.moveTo((1 - a.x) * w, a.y * h);
                ctx.lineTo((1 - b.x) * w, b.y * h);
                ctx.stroke();
            }

            // Draw 6 leg joints only (hip, knee, ankle × 2 sides)
            const legJoints = [
                POSE.LEFT_HIP, POSE.RIGHT_HIP,
                POSE.LEFT_KNEE, POSE.RIGHT_KNEE,
                POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE
            ];
            const isHip = [POSE.LEFT_HIP, POSE.RIGHT_HIP];

            for (const idx of legJoints) {
                const lm = landmarks[idx];
                if (lm.visibility < 0.25) continue;
                const x = (1 - lm.x) * w, y = lm.y * h;
                const hip = isHip.includes(idx);

                ctx.beginPath();
                ctx.arc(x, y, hip ? 6 : 4, 0, 2 * Math.PI);
                ctx.fillStyle = this.calibrated
                    ? (hip ? '#00ff88' : boneColor.replace('0.8', '1'))
                    : '#ffdd00';
                if (hip) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10; }
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Alignment bar (bottom)
            if (this.calibrated) {
                const barY = h - 20, barW = w - 12, barH = 5, barX = 6;
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(barX, barY, barW, barH);
                const fill = Math.max(0, Math.min(1, (this.legAngle - 120) / 60));
                const col = fill > 0.7 ? '#00ff88' : fill > 0.4 ? '#ffdd00' : '#ff4466';
                ctx.fillStyle = col;
                ctx.fillRect(barX, barY, barW * fill, barH);
                ctx.font = 'bold 7px monospace'; ctx.textAlign = 'right'; ctx.fillStyle = col;
                ctx.fillText(`${Math.round(this.legAngle)}°`, w - 8, barY - 2);
            }
        }

        // Status bar (top)
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, w, 16);
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = this.debugStatus.includes('JUMP') || this.debugStatus.includes('READY') ? '#00ff88'
            : this.debugStatus.includes('CALIB') ? '#ffdd00' : '#ff6688';
        ctx.fillText(this.debugStatus, w / 2, 11);
    }

    // ═══ JUMP (all sources) ═══
    requestJump(source) {
        const now = Date.now();
        if (now - this.lastJumpTime < this.jumpCooldown) return;
        this.jumpRequested = true;
        this.lastJumpTime = now;
    }

    consumeJump() {
        if (this.jumpRequested) { this.jumpRequested = false; return true; }
        return false;
    }

    startCalibration() { }
    isCalibrated() { return true; }

    destroy() {
        if (this.videoElement && this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(t => t.stop());
        }
    }
}
