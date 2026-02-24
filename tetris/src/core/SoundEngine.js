/**
 * SoundEngine — Web Audio API synthesized game sounds.
 * No external audio files needed.
 */
export class SoundEngine {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 0.25;
    }

    _ensureCtx() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    _playTone(freq, duration, type = 'square', ramp = true) {
        if (!this.enabled) return;
        try {
            const ctx = this._ensureCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(this.volume, ctx.currentTime);
            if (ramp) {
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            }
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch { }
    }

    _playChord(freqs, duration, type = 'square') {
        freqs.forEach(f => this._playTone(f, duration, type));
    }

    move() {
        this._playTone(200, 0.05, 'square');
    }

    rotate() {
        this._playTone(400, 0.08, 'sine');
    }

    drop() {
        this._playTone(100, 0.15, 'square');
    }

    lock() {
        this._playTone(150, 0.1, 'triangle');
    }

    lineClear(count) {
        const base = 440;
        for (let i = 0; i < Math.min(count, 4); i++) {
            setTimeout(() => {
                this._playTone(base + i * 110, 0.15, 'sine');
            }, i * 60);
        }
    }

    combo(streak) {
        const freqs = [523, 659, 784, 1047]; // C5, E5, G5, C6
        const n = Math.min(streak, freqs.length);
        for (let i = 0; i < n; i++) {
            setTimeout(() => this._playTone(freqs[i], 0.12, 'sine'), i * 50);
        }
    }

    garbage() {
        this._playTone(80, 0.2, 'sawtooth');
        setTimeout(() => this._playTone(60, 0.15, 'sawtooth'), 50);
    }

    countdown(value) {
        if (value > 0) {
            this._playTone(660, 0.15, 'sine');
        } else {
            // GO!
            this._playChord([523, 659, 784], 0.3, 'sine');
        }
    }

    gameOver() {
        const notes = [440, 392, 349, 330, 294, 262];
        notes.forEach((f, i) => {
            setTimeout(() => this._playTone(f, 0.2, 'triangle'), i * 120);
        });
    }

    playerJoin() {
        this._playTone(880, 0.08, 'sine');
        setTimeout(() => this._playTone(1100, 0.1, 'sine'), 80);
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}
