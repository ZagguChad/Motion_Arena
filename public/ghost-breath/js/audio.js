// ============================================
// Ghost of the Breath Temple — Procedural Audio
// All sounds generated via Web Audio API
// ============================================

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.ambientNode = null;
        this.ambientGain = null;
        this.active = false;
    }

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
            this.active = true;
        } catch (e) {
            console.warn('AudioContext unavailable');
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // ─── BREATH CHIME (correct hit) ───
    playBreathChime(quality) {
        if (!this.active) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Higher quality = higher pitch and brighter tone
        const baseFreq = 520 + quality * 260;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.1);

        gain.gain.setValueAtTime(0.15 * quality, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.4);

        // Harmony note
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(baseFreq * 1.5, now + 0.05);
        gain2.gain.setValueAtTime(0.06 * quality, now + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.5);
    }

    // ─── MISS SOUND ───
    playMiss() {
        if (!this.active) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.3);
    }

    // ─── GHOST WHISPER ───
    playGhostWhisper() {
        if (!this.active) return;
        const now = this.ctx.currentTime;

        // Breathy noise via oscillators
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100 + Math.random() * 60, now);

        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(5 + Math.random() * 3, now);
        lfoGain.gain.setValueAtTime(30, now);

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.04, now + 0.3);
        gain.gain.linearRampToValueAtTime(0, now + 1.2);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 1.2);
        lfo.start(now);
        lfo.stop(now + 1.2);
    }

    // ─── HEARTBEAT (rhythmic guide) ───
    playHeartbeat(intensity) {
        if (!this.active) return;
        const now = this.ctx.currentTime;
        const vol = 0.06 + intensity * 0.06;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(55, now);

        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.15);

        // Second thump
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(45, now + 0.12);
        gain2.gain.setValueAtTime(vol * 0.6, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.25);
    }

    // ─── AMBIENT TEMPLE DRONE ───
    startAmbient() {
        if (!this.active || this.ambientNode) return;

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.value = 0;
        this.ambientGain.connect(this.masterGain);

        // Low drone
        const drone = this.ctx.createOscillator();
        drone.type = 'sine';
        drone.frequency.value = 55;
        drone.connect(this.ambientGain);
        drone.start();

        // Higher harmonic
        const drone2 = this.ctx.createOscillator();
        drone2.type = 'sine';
        drone2.frequency.value = 82.5; // perfect fifth
        const g2 = this.ctx.createGain();
        g2.gain.value = 0.3;
        drone2.connect(g2);
        g2.connect(this.ambientGain);
        drone2.start();

        // Slow LFO on volume
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.15;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.015;
        lfo.connect(lfoGain);
        lfoGain.connect(this.ambientGain.gain);
        lfo.start();

        // Fade in
        this.ambientGain.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime + 2);

        this.ambientNode = { drone, drone2, lfo };
    }

    stopAmbient() {
        if (this.ambientNode) {
            const now = this.ctx.currentTime;
            this.ambientGain.gain.linearRampToValueAtTime(0, now + 1);
            setTimeout(() => {
                try {
                    this.ambientNode.drone.stop();
                    this.ambientNode.drone2.stop();
                    this.ambientNode.lfo.stop();
                } catch (e) { }
                this.ambientNode = null;
            }, 1200);
        }
    }

    // ─── FLAME CRACKLE ───
    playFlameGrow() {
        if (!this.active) return;
        const now = this.ctx.currentTime;

        // White noise burst through bandpass
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2000;
        filter.Q.value = 0.5;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start(now);
    }

    // ─── LEVEL COMPLETE ───
    playVictory() {
        if (!this.active) return;
        const now = this.ctx.currentTime;
        const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6

        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.12, now + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.5);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now + i * 0.15);
            osc.stop(now + i * 0.15 + 0.5);
        });
    }

    // ─── GAME OVER ───
    playGameOver() {
        if (!this.active) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 1.5);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 1.5);
    }

    // ─── PATTERN SHIFT ALERT ───
    playPatternShift() {
        if (!this.active) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(330, now + 0.1);
        osc.frequency.setValueAtTime(440, now + 0.2);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.35);
    }
}
