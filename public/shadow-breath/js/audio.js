// ============================================
// Shadow Breath — Retro Audio Engine (Web Audio API)
// All sounds generated procedurally — no audio files needed
// ============================================

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.musicPlaying = false;
        this.currentMusic = null;
        this.heartbeatInterval = null;
    }

    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.6;
        this.masterGain.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.25;
        this.musicGain.connect(this.masterGain);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.5;
        this.sfxGain.connect(this.masterGain);
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // --- SFX ---

    playFootstep() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 80 + Math.random() * 40;
        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.06);
    }

    playInvisibleOn() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800 - i * 200, t);
            osc.frequency.exponentialRampToValueAtTime(200, t + 0.3);
            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t + i * 0.05);
            osc.stop(t + 0.35);
        }
    }

    playInvisibleOff() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.12);
    }

    playAlert() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(400 + i * 200, t + i * 0.08);
            gain.gain.setValueAtTime(0.2, t + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.1);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t + i * 0.08);
            osc.stop(t + i * 0.08 + 0.12);
        }
    }

    playKill() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.linearRampToValueAtTime(50, t + 0.15);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(t + 0.25);
    }

    playDoorOpen() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(500, t + 0.15);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(t + 0.2);
    }

    playVictory() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.15, t + i * 0.2);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.4);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t + i * 0.2);
            osc.stop(t + i * 0.2 + 0.45);
        });
    }

    playGameOver() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const notes = [400, 350, 300, 200];
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.15, t + i * 0.25);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.25 + 0.4);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t + i * 0.25);
            osc.stop(t + i * 0.25 + 0.45);
        });
    }

    // Heartbeat when breath is low
    startHeartbeat(rate = 600) {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            // Double-beat
            for (let i = 0; i < 2; i++) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 60;
                gain.gain.setValueAtTime(0.2, t + i * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.1);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t + i * 0.12);
                osc.stop(t + i * 0.12 + 0.15);
            }
        }, rate);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    // --- AMBIENT MUSIC (procedural drone) ---
    startAmbientMusic() {
        if (!this.ctx || this.musicPlaying) return;
        this.musicPlaying = true;

        // Low drone
        const drone = this.ctx.createOscillator();
        drone.type = 'sine';
        drone.frequency.value = 55; // A1
        const droneGain = this.ctx.createGain();
        droneGain.gain.value = 0.08;
        drone.connect(droneGain);
        droneGain.connect(this.musicGain);
        drone.start();

        // Second drone — slight detune
        const drone2 = this.ctx.createOscillator();
        drone2.type = 'sine';
        drone2.frequency.value = 55.5;
        const drone2Gain = this.ctx.createGain();
        drone2Gain.gain.value = 0.06;
        drone2.connect(drone2Gain);
        drone2Gain.connect(this.musicGain);
        drone2.start();

        // LFO for subtle pulsing
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.3; // Very slow
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.03;
        lfo.connect(lfoGain);
        lfoGain.connect(droneGain.gain);
        lfo.start();

        this.currentMusic = { drone, drone2, droneGain, drone2Gain, lfo, lfoGain };
    }

    stopAmbientMusic() {
        if (!this.currentMusic) return;
        try {
            this.currentMusic.drone.stop();
            this.currentMusic.drone2.stop();
            this.currentMusic.lfo.stop();
        } catch (e) { }
        this.currentMusic = null;
        this.musicPlaying = false;
    }

    stopAll() {
        this.stopHeartbeat();
        this.stopAmbientMusic();
    }
}
