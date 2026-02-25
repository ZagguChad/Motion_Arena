/**
 * Stress Monitor — Emotional AI Lite
 * Reusable client-side module for measuring stress via breath + tremor.
 * 
 * Usage:
 *   const monitor = new StressMonitor();
 *   monitor.start();
 *   monitor.onUpdate((data) => { console.log(data.stressIndex); });
 *   monitor.stop();
 */

class StressMonitor {
    constructor(options = {}) {
        this.breathSampleRate = options.breathSampleRate || 10; // Hz
        this.tremorSampleRate = options.tremorSampleRate || 20; // Hz
        this.updateInterval = options.updateInterval || 2000; // ms
        this.callback = null;

        // Breath analysis
        this.audioCtx = null;
        this.analyser = null;
        this.micStream = null;
        this.breathAmplitudes = [];
        this.breathPeaks = [];
        this.lastBreathPeak = 0;
        this.breathRate = 0; // breaths per minute
        this.breathRegularity = 100; // 0-100

        // Tremor analysis
        this.accelSamples = [];
        this.tremorIntensity = 0; // 0-100

        // Combined
        this.stressIndex = 0; // 0-100
        this.history = []; // last 60 readings

        // Timers
        this._updateTimer = null;
        this._breathTimer = null;
        this._running = false;
    }

    onUpdate(fn) {
        this.callback = fn;
    }

    async start() {
        if (this._running) return;
        this._running = true;

        // Start microphone for breath analysis
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioCtx.createMediaStreamSource(this.micStream);
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);

            this._breathTimer = setInterval(() => this._sampleBreath(), 1000 / this.breathSampleRate);
        } catch (e) {
            console.warn('[StressMonitor] Mic unavailable:', e.message);
        }

        // Start accelerometer for tremor analysis
        if (window.DeviceMotionEvent) {
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const perm = await DeviceMotionEvent.requestPermission();
                    if (perm === 'granted') {
                        window.addEventListener('devicemotion', this._handleMotion.bind(this));
                    }
                } catch (e) {
                    console.warn('[StressMonitor] Accel permission denied');
                }
            } else {
                window.addEventListener('devicemotion', this._handleMotion.bind(this));
            }
        }

        // Periodic stress calculation
        this._updateTimer = setInterval(() => this._calculateStress(), this.updateInterval);
    }

    stop() {
        this._running = false;
        clearInterval(this._breathTimer);
        clearInterval(this._updateTimer);
        window.removeEventListener('devicemotion', this._handleMotion);
        if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
        }
        if (this.audioCtx) {
            this.audioCtx.close();
        }
    }

    _sampleBreath() {
        if (!this.analyser) return;
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(data);

        // Calculate RMS amplitude
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        this.breathAmplitudes.push({ time: Date.now(), rms });

        // Keep last 30 seconds
        const cutoff = Date.now() - 30000;
        this.breathAmplitudes = this.breathAmplitudes.filter(a => a.time > cutoff);

        // Detect breath peaks (RMS spikes above threshold)
        if (rms > 0.08 && Date.now() - this.lastBreathPeak > 1500) {
            this.lastBreathPeak = Date.now();
            this.breathPeaks.push(Date.now());
        }

        // Keep last 60 seconds of peaks
        const peakCutoff = Date.now() - 60000;
        this.breathPeaks = this.breathPeaks.filter(p => p > peakCutoff);
    }

    _handleMotion(e) {
        if (!this._running) return;
        const a = e.acceleration;
        if (!a) return;

        const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
        this.accelSamples.push({ time: Date.now(), mag: magnitude });

        // Keep last 10 seconds
        const cutoff = Date.now() - 10000;
        this.accelSamples = this.accelSamples.filter(s => s.time > cutoff);
    }

    _calculateStress() {
        // ─── Breath Rate (BPM) ───
        if (this.breathPeaks.length >= 2) {
            const intervals = [];
            for (let i = 1; i < this.breathPeaks.length; i++) {
                intervals.push(this.breathPeaks[i] - this.breathPeaks[i - 1]);
            }
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            this.breathRate = Math.round(60000 / avgInterval); // BPM

            // Regularity: low variance = high regularity
            const mean = avgInterval;
            const variance = intervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / intervals.length;
            const stdDev = Math.sqrt(variance);
            const cv = (stdDev / mean) * 100; // coefficient of variation
            this.breathRegularity = Math.max(0, Math.min(100, Math.round(100 - cv)));
        }

        // ─── Tremor Intensity ───
        if (this.accelSamples.length >= 5) {
            const mags = this.accelSamples.map(s => s.mag);
            const avg = mags.reduce((a, b) => a + b, 0) / mags.length;
            const variance = mags.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / mags.length;
            // Higher variance → more tremor
            this.tremorIntensity = Math.min(100, Math.round(variance * 50));
        }

        // ─── Stress Index (0-100) ───
        // Factors:
        // - High breath rate (>20 BPM) → stress
        // - Low breath regularity → stress
        // - High tremor → stress
        let breathStress = 0;
        if (this.breathRate > 20) {
            breathStress = Math.min(100, (this.breathRate - 12) * 5);
        } else if (this.breathRate > 0) {
            breathStress = Math.max(0, (this.breathRate - 12) * 3);
        }

        const irregularityStress = 100 - this.breathRegularity;
        const tremorStress = this.tremorIntensity;

        // Weighted combination
        this.stressIndex = Math.round(
            breathStress * 0.3 +
            irregularityStress * 0.35 +
            tremorStress * 0.35
        );
        this.stressIndex = Math.max(0, Math.min(100, this.stressIndex));

        // Store in history
        this.history.push({
            time: Date.now(),
            stressIndex: this.stressIndex,
            breathRate: this.breathRate,
            breathRegularity: this.breathRegularity,
            tremorIntensity: this.tremorIntensity
        });

        // Keep last 5 minutes
        const historyCutoff = Date.now() - 300000;
        this.history = this.history.filter(h => h.time > historyCutoff);

        // Emit
        if (this.callback) {
            this.callback({
                stressIndex: this.stressIndex,
                breathRate: this.breathRate,
                breathRegularity: this.breathRegularity,
                tremorIntensity: this.tremorIntensity,
                history: this.history
            });
        }
    }

    /**
     * Get difficulty adjustment recommendation.
     * Returns: { level: 'easy'|'normal'|'hard', modifier: 0.5-1.5 }
     */
    getAdaptiveDifficulty() {
        if (this.stressIndex > 70) {
            return { level: 'easy', modifier: 0.6, reason: 'High stress detected — reducing difficulty' };
        } else if (this.stressIndex > 40) {
            return { level: 'normal', modifier: 1.0, reason: 'Normal stress levels' };
        } else {
            return { level: 'hard', modifier: 1.3, reason: 'Low stress — increasing challenge' };
        }
    }
}

// Export for both module and script tag usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StressMonitor };
}
