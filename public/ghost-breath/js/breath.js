// ============================================
// Ghost of the Breath Temple — Breath Engine
// Mic input, RMS analysis, rhythm matching
// Uses ONLY microphone — no other sensors
// ============================================

export class BreathEngine {
    constructor() {
        // Audio analysis
        this.audioCtx = null;
        this.analyser = null;
        this.dataArray = null;
        this.stream = null;

        // Signal processing
        this.smoothedRms = 0;
        this.rmsSamples = [];
        this.SMOOTH_WINDOW = 10;

        // Calibration
        this.noiseFloor = 0.005;
        this.calibrated = false;
        this.calibrationSamples = [];
        this.calibrationDuration = 90; // ~3 seconds at 30fps

        // Breath event detection
        this.breathActive = false;        // currently in a breath?
        this.breathStartTime = 0;
        this.lastBreathTime = 0;          // timestamp of last breath event
        this.breathEvents = [];           // recent breath event timestamps
        this.minBreathDuration = 120;     // ms — minimum airflow to count
        this.breathThresholdMultiplier = 2.0;   // above noise floor
        this.releaseMultiplier = 1.3;     // hysteresis — lower threshold to end breath

        // Rhythm matching
        this.targetPattern = [];          // array of intervals in ms
        this.patternIndex = 0;            // current position in pattern
        this.patternStartTime = 0;        // when current pattern cycle started
        this.tolerance = 400;             // ms tolerance for rhythm matching
        this.accuracy = 1.0;             // rolling accuracy 0-1
        this.accuracyHistory = [];        // last N accuracy scores
        this.maxAccuracyHistory = 12;
        this.lastHitQuality = 0;          // 0-1 quality of last hit

        // State
        this.active = false;
        this.onBreathEvent = null;        // callback(timestamp)
        this.onRhythmHit = null;          // callback(quality: 0-1)
        this.onRhythmMiss = null;         // callback()
    }

    async init() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioCtx.createMediaStreamSource(this.stream);
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.3;
            source.connect(this.analyser);

            this.dataArray = new Float32Array(this.analyser.fftSize);
            this.active = true;
            return true;
        } catch (err) {
            console.warn('Mic access denied:', err);
            return false;
        }
    }

    // Call every frame
    update() {
        if (!this.active || !this.analyser) return;

        // Get time-domain RMS
        this.analyser.getFloatTimeDomainData(this.dataArray);
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i] * this.dataArray[i];
        }
        const rawRms = Math.sqrt(sum / this.dataArray.length);

        // Smooth with rolling average
        this.rmsSamples.push(rawRms);
        if (this.rmsSamples.length > this.SMOOTH_WINDOW) this.rmsSamples.shift();
        this.smoothedRms = this.rmsSamples.reduce((a, b) => a + b, 0) / this.rmsSamples.length;

        // Calibration phase
        if (!this.calibrated) {
            this.calibrationSamples.push(rawRms);
            if (this.calibrationSamples.length >= this.calibrationDuration) {
                const sorted = [...this.calibrationSamples].sort((a, b) => a - b);
                const median = sorted[Math.floor(sorted.length / 2)];
                this.noiseFloor = Math.max(median * this.breathThresholdMultiplier, 0.003);
                this.calibrated = true;
            }
            return;
        }

        // Breath event detection with hysteresis
        const now = Date.now();
        const breathThreshold = this.noiseFloor;
        const releaseThreshold = this.noiseFloor * (this.releaseMultiplier / this.breathThresholdMultiplier);

        if (!this.breathActive && this.smoothedRms > breathThreshold) {
            // Breath started
            this.breathActive = true;
            this.breathStartTime = now;
        } else if (this.breathActive && this.smoothedRms < releaseThreshold) {
            // Breath ended — check if it lasted long enough
            const duration = now - this.breathStartTime;
            if (duration >= this.minBreathDuration) {
                this._registerBreathEvent(this.breathStartTime);
            }
            this.breathActive = false;
        }
    }

    _registerBreathEvent(timestamp) {
        this.breathEvents.push(timestamp);
        if (this.breathEvents.length > 30) this.breathEvents.shift();
        this.lastBreathTime = timestamp;

        if (this.onBreathEvent) this.onBreathEvent(timestamp);

        // Check rhythm if pattern is set
        if (this.targetPattern.length > 0) {
            this._checkRhythm(timestamp);
        }
    }

    _checkRhythm(timestamp) {
        if (this.patternStartTime === 0) {
            // First breath — start the pattern
            this.patternStartTime = timestamp;
            this.patternIndex = 0;
            this._recordHit(1.0); // first beat is always perfect
            if (this.onRhythmHit) this.onRhythmHit(1.0);
            return;
        }

        // Calculate expected time for next beat
        let expectedTime = this.patternStartTime;
        for (let i = 0; i <= this.patternIndex; i++) {
            expectedTime += this.targetPattern[i % this.targetPattern.length];
        }

        // How far off are we?
        const delta = Math.abs(timestamp - expectedTime);

        if (delta <= this.tolerance) {
            // Hit! Quality based on how close
            const quality = 1.0 - (delta / this.tolerance);
            this.lastHitQuality = quality;
            this._recordHit(quality);
            this.patternIndex++;

            // Resync pattern start to prevent drift
            this.patternStartTime = timestamp;
            for (let i = 0; i <= this.patternIndex - 1; i++) {
                this.patternStartTime -= this.targetPattern[i % this.targetPattern.length];
            }

            if (this.onRhythmHit) this.onRhythmHit(quality);
        } else if (timestamp > expectedTime + this.tolerance) {
            // Missed the beat — too late or extra breath
            this._recordHit(0);
            this.patternIndex++;

            // Resync
            this.patternStartTime = timestamp;
            this.patternIndex = 0;

            if (this.onRhythmMiss) this.onRhythmMiss();
        }
    }

    _recordHit(quality) {
        this.accuracyHistory.push(quality);
        if (this.accuracyHistory.length > this.maxAccuracyHistory) {
            this.accuracyHistory.shift();
        }
        this.accuracy = this.accuracyHistory.reduce((a, b) => a + b, 0) / this.accuracyHistory.length;
    }

    setPattern(pattern, tolerance) {
        this.targetPattern = pattern;
        this.tolerance = tolerance || 400;
        this.patternIndex = 0;
        this.patternStartTime = 0;
        this.accuracyHistory = [];
        this.accuracy = 1.0;
    }

    // Get normalized mic level (0-1) for UI display
    getMicLevel() {
        if (!this.calibrated) return 0;
        return Math.min(1.0, this.smoothedRms / (this.noiseFloor * 3));
    }

    // Get calibration progress (0-1)
    getCalibrationProgress() {
        if (this.calibrated) return 1;
        return this.calibrationSamples.length / this.calibrationDuration;
    }

    // Get time until next expected beat (ms), negative if past due
    getTimeToNextBeat() {
        if (this.targetPattern.length === 0 || this.patternStartTime === 0) return 0;

        let expectedTime = this.patternStartTime;
        for (let i = 0; i <= this.patternIndex; i++) {
            expectedTime += this.targetPattern[i % this.targetPattern.length];
        }
        return expectedTime - Date.now();
    }

    // Get progress through current beat interval (0-1)
    getBeatProgress() {
        if (this.targetPattern.length === 0 || this.patternStartTime === 0) return 0;

        const interval = this.targetPattern[this.patternIndex % this.targetPattern.length];
        let beatStart = this.patternStartTime;
        for (let i = 0; i < this.patternIndex; i++) {
            beatStart += this.targetPattern[i % this.targetPattern.length];
        }
        const elapsed = Date.now() - beatStart;
        return Math.min(1.0, Math.max(0, elapsed / interval));
    }

    // Simulate a breath event (keyboard fallback)
    simulateBreath() {
        if (!this.calibrated) return;
        this._registerBreathEvent(Date.now());
    }

    destroy() {
        this.active = false;
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
        }
        if (this.audioCtx) {
            this.audioCtx.close();
        }
    }
}
