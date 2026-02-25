// ============================================================
// CPR TRAINER — Game Engine Module (for Motion Arena)
// Spring-damper chest physics, virtual patient, game modes
// ============================================================

// ── CPR Standards ───────────────────────────────────────────
const TARGET_BPM_LOW = 100;
const TARGET_BPM_HIGH = 120;
const TARGET_BPM_MID = 110;
const TARGET_DEPTH_LOW = 5.0;
const TARGET_DEPTH_HIGH = 6.0;
const TARGET_DEPTH_MID = 5.5;
const MIN_RECOIL_RATIO = 0.8;
const PERFECT_RECOIL_RATIO = 0.95;

// ── Scoring Weights ─────────────────────────────────────────
const WEIGHT_RATE = 0.30;
const WEIGHT_DEPTH = 0.30;
const WEIGHT_RECOIL = 0.15;
const WEIGHT_CONSISTENCY = 0.10;
const WEIGHT_PATIENT = 0.15;  // new: patient outcome weight

const CPR_GAME_DURATION = 120;  // 2 minutes — ambulance arrival time
const CPR_TICK_RATE = 30;
const CPR_TICK_MS = 1000 / CPR_TICK_RATE;

// ── Spring-Damper Chest Constants ───────────────────────────
const CHEST_MASS = 0.5;              // kg (effective mass)
const CHEST_MAX_DEPTH = 8.0;         // cm max physical depth

const DIFFICULTY_CONFIG = {
    beginner: {
        stiffness: 120,              // N/m — softer chest
        damping: 8,
        fatigueRate: 0,              // no fatigue
        scoringLeniency: 1.0,        // same as intermediate (no free pass)
        showRhythm: true,
        showPushRelease: true,        // guided push/release prompts
        showDepthGuide: true,
        label: 'Beginner',
    },
    intermediate: {
        stiffness: 180,
        damping: 12,
        fatigueRate: 0,
        scoringLeniency: 1.0,
        showRhythm: false,
        showPushRelease: true,        // still show push/release for intermediate
        showDepthGuide: true,
        label: 'Intermediate',
    },
    advanced: {
        stiffness: 220,
        damping: 15,
        fatigueRate: 0.15,           // stiffness increase per second
        scoringLeniency: 1.2,        // stricter
        showRhythm: false,
        showPushRelease: false,
        showDepthGuide: false,
        label: 'Advanced',
    },
};

// ── Scoring Functions ───────────────────────────────────────
function scoreRate(bpm) {
    if (bpm === 0) return 0;
    if (bpm >= TARGET_BPM_LOW && bpm <= TARGET_BPM_HIGH) {
        const deviation = Math.abs(bpm - TARGET_BPM_MID);
        return Math.max(0.80, 1.0 - (deviation / 15) * 0.20);
    }
    const distance = bpm < TARGET_BPM_LOW ? TARGET_BPM_LOW - bpm : bpm - TARGET_BPM_HIGH;
    return Math.max(0, 1.0 - (distance / 30) ** 2.0);
}

function scoreDepth(depth) {
    if (depth <= 0) return 0;
    if (depth >= TARGET_DEPTH_LOW && depth <= TARGET_DEPTH_HIGH) {
        const deviation = Math.abs(depth - TARGET_DEPTH_MID);
        return Math.max(0.80, 1.0 - (deviation / 0.8) * 0.20);
    }
    const distance = depth < TARGET_DEPTH_LOW ? TARGET_DEPTH_LOW - depth : depth - TARGET_DEPTH_HIGH;
    return Math.max(0, 1.0 - (distance / 3) ** 2.0);
}

function scoreRecoil(recoil) {
    if (recoil >= PERFECT_RECOIL_RATIO) return 1.0;
    if (recoil >= MIN_RECOIL_RATIO) return 0.7 + 0.3 * ((recoil - MIN_RECOIL_RATIO) / (PERFECT_RECOIL_RATIO - MIN_RECOIL_RATIO));
    return Math.max(0, recoil / MIN_RECOIL_RATIO * 0.7);
}

function calcConsistency(values) {
    if (values.length < 3) return 1.0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 1;
    return Math.max(0, 1.0 - (cv / 0.3));
}

function calcGrade(score) {
    if (score >= 0.90) return 'A';
    if (score >= 0.75) return 'B';
    if (score >= 0.60) return 'C';
    if (score >= 0.40) return 'D';
    return 'F';
}

function generateTips(g) {
    const tips = [];
    if (g.avgBPM < TARGET_BPM_LOW) tips.push('⬆️ Speed up! Aim for 100-120 BPM. Try the beat of "Stayin\' Alive".');
    else if (g.avgBPM > TARGET_BPM_HIGH) tips.push('⬇️ Slow down slightly. Target 100-120 BPM.');
    if (g.avgDepth < TARGET_DEPTH_LOW) tips.push('💪 Push harder! Need at least 5 cm depth.');
    else if (g.avgDepth > TARGET_DEPTH_HIGH) tips.push('🛡️ Slightly lighter! Keep in 5-6 cm range.');
    if (g.avgRecoil < MIN_RECOIL_RATIO * 100) tips.push('🔄 Allow full chest recoil between compressions!');
    if (g.bpmStdDev > 15) tips.push('🎵 Keep a steady rhythm! Use a metronome at 110 BPM.');
    if (g.totalCompressions < 20 && g.phase === 'gameover') tips.push('📈 Keep trying! More practice = better rhythm.');
    if (g.patient.oxygen < 50) tips.push('🫁 Patient oxygen was critically low. Minimize interruptions!');
    if (tips.length === 0) tips.push('🌟 Excellent technique! You\'re performing CPR at a life-saving level!');
    return tips;
}

// ── CPR Engine Class ────────────────────────────────────────
class CprEngine {
    constructor(sessionId, broadcastFn, difficulty = 'beginner') {
        this.sessionId = sessionId;
        this.broadcast = broadcastFn;

        this.difficulty = difficulty;
        this.config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.beginner;

        this.phase = 'lobby';   // lobby → scenario → countdown → playing → gameover
        this.timer = CPR_GAME_DURATION;
        this.countdownTimer = 3;
        this.playerConnected = false;
        this.playerReady = false;

        // ── Spring-Damper Chest Physics ──────────────────────
        this.chest = {
            position: 0,        // cm (0 = resting, positive = compressed)
            velocity: 0,        // cm/s
            stiffness: this.config.stiffness,
            damping: this.config.damping,
            baseStiffness: this.config.stiffness,
            appliedForce: 0,    // N — current compression force
        };

        // ── Virtual Patient ─────────────────────────────────
        this.patient = {
            oxygen: 40,          // % — starts low (patient just collapsed)
            heartActivity: 10,   // % — very weak at start
            brainTimer: 360,     // seconds until brain damage (6 min)
            ambulanceTimer: CPR_GAME_DURATION, // ambulance ETA
            status: 'critical',  // critical, unstable, stable
            alive: true,
        };

        // Compression tracking
        this.compressions = [];
        this.totalCompressions = 0;
        this.currentBPM = 0;
        this.currentDepth = 0;
        this.currentRecoil = 0;
        this.lastCompressionTime = 0;
        this.recentIntervals = [];
        this.lastTiltAngle = 0;

        // Scoring
        this.score = 0;
        this.rateScore = 0;
        this.depthScore = 0;
        this.recoilScore = 0;
        this.consistencyScore = 0;
        this.patientScore = 0;
        this.grade = '-';
        this.combo = 0;
        this.maxCombo = 0;
        this.perfectCount = 0;
        this.goodCount = 0;
        this.badCount = 0;

        // Feedback
        this.feedback = '';
        this.feedbackType = 'neutral';
        this.events = [];
        this.tiltWarning = false;

        // Stats
        this.avgBPM = 0;
        this.avgDepth = 0;
        this.avgRecoil = 0;
        this.bpmStdDev = 0;
        this.depthStdDev = 0;
        this.tips = [];
        this.survivalProbability = 0;

        // Interruption tracking
        this.totalInterruptionTime = 0;
        this.interruptionStart = 0;
        this.oxygenHistory = [];

        // ECG waveform data
        this.ecgData = [];
        this.ecgPhase = 0;

        // Intervals
        this._timerInterval = null;
        this._gameLoopInterval = null;

        // Elapsed time for fatigue
        this._gameElapsed = 0;

        // Rhythm phase guidance (for beginner/intermediate)
        this.rhythmPhase = 'push';    // 'push' or 'release'
        this._rhythmToggle = 0;       // ms counter
    }

    // ── Spring-Damper Physics Tick ───────────────────────────
    tickChestPhysics(dt) {
        const k = this.chest.stiffness;
        const c = this.chest.damping;
        const m = CHEST_MASS;

        // F = -kx - cv + applied
        const springForce = -k * this.chest.position;
        const dampingForce = -c * this.chest.velocity;
        const totalForce = springForce + dampingForce + this.chest.appliedForce;

        const acceleration = totalForce / m;
        this.chest.velocity += acceleration * dt;
        this.chest.position += this.chest.velocity * dt;

        // Clamp
        if (this.chest.position < 0) {
            this.chest.position = 0;
            this.chest.velocity = Math.max(0, this.chest.velocity);
        }
        if (this.chest.position > CHEST_MAX_DEPTH) {
            this.chest.position = CHEST_MAX_DEPTH;
            this.chest.velocity = 0;
        }

        // Decay applied force quickly (compression is a pulse)
        this.chest.appliedForce *= 0.85;
        if (Math.abs(this.chest.appliedForce) < 0.1) this.chest.appliedForce = 0;
    }

    // ── Virtual Patient Tick ────────────────────────────────
    tickPatient(dt) {
        const p = this.patient;
        if (!p.alive) return;

        const now = Date.now();
        const timeSinceLastCompression = this.lastCompressionTime > 0 ? (now - this.lastCompressionTime) / 1000 : 999;
        const isCPRActive = timeSinceLastCompression < 2.0;
        const qualityFactor = Math.max(0.1, (this.rateScore + this.depthScore + this.recoilScore) / 3);

        // ── Oxygen ──
        if (isCPRActive) {
            // Good CPR raises oxygen
            const oxygenGain = qualityFactor * 8.0 * dt;  // up to ~8%/sec with perfect CPR
            p.oxygen = Math.min(100, p.oxygen + oxygenGain);

            // Track interruption end
            if (this.interruptionStart > 0) {
                this.totalInterruptionTime += (now - this.interruptionStart) / 1000;
                this.interruptionStart = 0;
            }
        } else {
            // No CPR → oxygen drops
            const oxygenDrop = 3.0 * dt;  // ~3%/sec without CPR
            p.oxygen = Math.max(0, p.oxygen - oxygenDrop);

            // Track interruption start
            if (this.interruptionStart === 0 && this.totalCompressions > 0) {
                this.interruptionStart = now;
            }
        }

        // ── Heart Activity ──
        if (isCPRActive) {
            const heartTarget = qualityFactor * 70 + 10;  // 10-80%
            p.heartActivity += (heartTarget - p.heartActivity) * 0.05;
        } else {
            p.heartActivity = Math.max(0, p.heartActivity - 5 * dt);
        }
        p.heartActivity = Math.max(0, Math.min(100, p.heartActivity));

        // ── Brain Timer ──
        if (p.oxygen < 20) {
            p.brainTimer -= dt * 2;  // accelerated damage when very low O2
        } else if (p.oxygen < 40) {
            p.brainTimer -= dt * 0.5;
        }
        // Good oxygen slows brain damage
        p.brainTimer = Math.max(0, p.brainTimer);

        // ── Patient Status ──
        if (p.oxygen >= 60) p.status = 'stable';
        else if (p.oxygen >= 30) p.status = 'unstable';
        else p.status = 'critical';

        if (p.brainTimer <= 0) {
            p.alive = false;
            p.status = 'deceased';
        }

        // Record oxygen history every second
        this.oxygenHistory.push(p.oxygen);
        if (this.oxygenHistory.length > CPR_GAME_DURATION * CPR_TICK_RATE) {
            this.oxygenHistory = this.oxygenHistory.slice(-CPR_GAME_DURATION * CPR_TICK_RATE);
        }
    }

    // ── Fatigue Simulation (Advanced Mode) ──────────────────
    tickFatigue(dt) {
        if (this.config.fatigueRate <= 0) return;
        this._gameElapsed += dt;
        // Stiffness increases over time
        this.chest.stiffness = this.chest.baseStiffness + this.config.fatigueRate * this._gameElapsed;
    }

    // ── ECG Waveform Generation ─────────────────────────────
    tickECG(dt) {
        this.ecgPhase += dt;
        let ecgValue = 0;

        if (this.patient.heartActivity > 20) {
            // Generate PQRST-like wave based on heart activity
            const heartRate = 30 + this.patient.heartActivity * 0.6;  // 30-90 bpm equivalent
            const period = 60 / heartRate;
            const t = this.ecgPhase % period;
            const tNorm = t / period;

            if (tNorm < 0.05) {
                ecgValue = Math.sin(tNorm / 0.05 * Math.PI) * 0.2;  // P wave
            } else if (tNorm < 0.12) {
                ecgValue = 0;  // PR segment
            } else if (tNorm < 0.16) {
                const qrsPhase = (tNorm - 0.12) / 0.04;
                ecgValue = Math.sin(qrsPhase * Math.PI * 2) * (0.3 + this.patient.heartActivity / 100 * 0.7);  // QRS
            } else if (tNorm < 0.35) {
                ecgValue = 0;  // ST segment
            } else if (tNorm < 0.45) {
                ecgValue = Math.sin((tNorm - 0.35) / 0.10 * Math.PI) * 0.15;  // T wave
            }
        } else {
            // Nearly flatline with noise
            ecgValue = (Math.random() - 0.5) * 0.05;
        }

        this.ecgData.push(ecgValue);
        if (this.ecgData.length > 200) this.ecgData.shift();
    }

    processCompression(data) {
        if (this.phase !== 'playing') return;

        const now = Date.now();
        const depth = Math.max(0, data.depth || 0);
        const recoil = Math.min(1, Math.max(0, data.recoil || 0));
        const tiltAngle = data.tiltAngle || 0;

        let interval = 0;
        if (this.lastCompressionTime > 0) {
            interval = now - this.lastCompressionTime;
        }
        this.lastCompressionTime = now;

        // Apply force to spring-damper chest model
        const forceMultiplier = Math.max(0.5, depth / TARGET_DEPTH_MID);
        this.chest.appliedForce = forceMultiplier * this.chest.stiffness * 0.08;

        const compression = { time: now, depth, recoil, interval, tiltAngle };
        this.compressions.push(compression);
        this.totalCompressions++;

        if (interval > 0 && interval < 3000) {
            this.recentIntervals.push(interval);
            if (this.recentIntervals.length > 10) this.recentIntervals.shift();
        }

        if (this.recentIntervals.length >= 2) {
            const avgInterval = this.recentIntervals.reduce((a, b) => a + b, 0) / this.recentIntervals.length;
            this.currentBPM = Math.round(60000 / avgInterval);
        }

        this.currentDepth = depth;
        this.currentRecoil = recoil;
        this.lastTiltAngle = tiltAngle;

        // Tilt warning
        this.tiltWarning = Math.abs(tiltAngle) > 15;

        const rateS = this.recentIntervals.length >= 2 ? scoreRate(this.currentBPM) : 0.5;
        const depthS = scoreDepth(depth);
        const recoilS = scoreRecoil(recoil);
        const compScore = (rateS + depthS + recoilS) / 3;

        // Tilt penalty — bad hand angle reduces score
        const tiltPenalty = Math.abs(tiltAngle) > 15 ? 0.15 : Math.abs(tiltAngle) > 10 ? 0.05 : 0;
        const adjustedScore = Math.max(0, compScore - tiltPenalty);

        let quality = 'bad';
        if (adjustedScore >= 0.90) {
            quality = 'perfect';
            this.perfectCount++;
            this.combo++;
        } else if (adjustedScore >= 0.70) {
            quality = 'good';
            this.goodCount++;
            this.combo++;
        } else {
            this.badCount++;
            this.combo = 0;
        }

        if (this.combo > this.maxCombo) this.maxCombo = this.combo;

        // Generate feedback
        if (this.tiltWarning) {
            this.feedback = '📐 Straighten hands!';
            this.feedbackType = 'warning';
        } else if (quality === 'perfect') {
            this.feedback = this.combo >= 5 ? `🔥 ${this.combo}x COMBO!` : '⭐ PERFECT!';
            this.feedbackType = 'perfect';
        } else if (quality === 'good') {
            this.feedback = '👍 Good!';
            this.feedbackType = 'good';
            if (depthS < 0.6) this.feedback = '👇 Push Deeper!';
            else if (rateS < 0.6 && this.currentBPM < TARGET_BPM_LOW) this.feedback = '⏩ Faster!';
            else if (rateS < 0.6 && this.currentBPM > TARGET_BPM_HIGH) this.feedback = '⏪ Slower!';
            else if (recoilS < 0.6) this.feedback = '🔄 Full Recoil!';
        } else {
            this.feedbackType = 'bad';
            if (depth < 3) this.feedback = '💪 Push HARDER!';
            else if (this.currentBPM > 0 && this.currentBPM < 80) this.feedback = '⏩ Too SLOW!';
            else if (this.currentBPM > 140) this.feedback = '⏪ Too FAST!';
            else if (recoil < 0.5) this.feedback = '🔄 Let chest RECOIL!';
            else this.feedback = '⚠️ Adjust technique!';
        }

        this.updateRunningScores();
        this.events.push(`compression_${this.totalCompressions}_${quality}`);
        if (this.events.length > 8) this.events = this.events.slice(-8);

        // Spike ECG on compression
        if (this.ecgData.length > 0) {
            this.ecgData[this.ecgData.length - 1] = 0.8 * (quality === 'perfect' ? 1 : quality === 'good' ? 0.6 : 0.3);
        }

        console.log(`[CPR:${this.sessionId}] #${this.totalCompressions} depth:${depth.toFixed(1)}cm BPM:${this.currentBPM} tilt:${tiltAngle.toFixed(0)}° → ${quality}`);
    }

    updateRunningScores() {
        if (this.compressions.length === 0) return;

        const recent = this.compressions.slice(-20);
        const intervals = recent.filter(c => c.interval > 0 && c.interval < 3000).map(c => c.interval);

        if (intervals.length >= 2) {
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const avgBPM = 60000 / avgInterval;
            this.rateScore = scoreRate(avgBPM);
            this.avgBPM = Math.round(avgBPM);
            this.bpmStdDev = Math.sqrt(intervals.reduce((s, v) => s + (v - avgInterval) ** 2, 0) / intervals.length) * 60000 / (avgInterval * avgInterval);
        }

        const depths = recent.map(c => c.depth).filter(d => d > 0);
        if (depths.length > 0) {
            const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;
            this.depthScore = scoreDepth(avgDepth);
            this.avgDepth = Math.round(avgDepth * 10) / 10;
            this.depthStdDev = Math.sqrt(depths.reduce((s, v) => s + (v - avgDepth) ** 2, 0) / depths.length);
        }

        const recoils = recent.map(c => c.recoil);
        if (recoils.length > 0) {
            const avgRecoil = recoils.reduce((a, b) => a + b, 0) / recoils.length;
            this.recoilScore = scoreRecoil(avgRecoil);
            this.avgRecoil = Math.round(avgRecoil * 100);
        }

        this.consistencyScore = (calcConsistency(intervals) * 0.6 + calcConsistency(depths) * 0.4);

        // Patient outcome score
        this.patientScore = Math.min(1.0, this.patient.oxygen / 80);

        this.score = Math.round((
            this.rateScore * WEIGHT_RATE +
            this.depthScore * WEIGHT_DEPTH +
            this.recoilScore * WEIGHT_RECOIL +
            this.consistencyScore * WEIGHT_CONSISTENCY +
            this.patientScore * WEIGHT_PATIENT
        ) * 100);

        this.grade = calcGrade(this.score / 100);
    }

    calcSurvivalProbability() {
        // Based on: avg oxygen, compression quality, interruption time, brain timer
        const avgOxygen = this.oxygenHistory.length > 0
            ? this.oxygenHistory.reduce((a, b) => a + b, 0) / this.oxygenHistory.length
            : 0;

        const qualityFactor = (this.rateScore + this.depthScore + this.recoilScore + this.consistencyScore) / 4;
        const interruptionPenalty = Math.max(0, 1 - this.totalInterruptionTime / 30);  // lose points after 30s total interruption
        const brainFactor = this.patient.brainTimer / 360;

        const raw = (avgOxygen / 100 * 0.3 + qualityFactor * 0.3 + interruptionPenalty * 0.2 + brainFactor * 0.2) * 100;
        return Math.round(Math.max(0, Math.min(98, raw)));
    }

    // ── Phase: Scenario ─────────────────────────────────────
    startScenario() {
        this.phase = 'scenario';
        this.broadcastState();

        // Show scenario for 4 seconds then auto-progress to countdown
        setTimeout(() => {
            if (this.phase === 'scenario') {
                this.startCountdown();
            }
        }, 4000);
    }

    startCountdown() {
        this.phase = 'countdown';
        this.countdownTimer = 3;
        this.broadcastState();

        const countInterval = setInterval(() => {
            this.countdownTimer--;
            this.broadcastState();
            if (this.countdownTimer <= 0) {
                clearInterval(countInterval);
                this.startGame();
            }
        }, 1000);
    }

    startGame() {
        this.phase = 'playing';
        this.timer = CPR_GAME_DURATION;
        this.lastCompressionTime = 0;
        this.compressions = [];
        this.recentIntervals = [];
        this._gameElapsed = 0;

        // Notify controller
        this.broadcast(this.sessionId, 'cpr-game-start', {
            timer: CPR_GAME_DURATION,
            difficulty: this.difficulty,
        });

        this._timerInterval = setInterval(() => {
            this.timer--;
            this.patient.ambulanceTimer = this.timer;
            if (this.timer <= 0) {
                clearInterval(this._timerInterval);
                clearInterval(this._gameLoopInterval);
                this.endGame();
            }
        }, 1000);

        this._gameLoopInterval = setInterval(() => {
            if (this.phase !== 'playing') return;

            const dt = CPR_TICK_MS / 1000;

            // Physics simulation
            this.tickChestPhysics(dt);
            this.tickPatient(dt);
            this.tickFatigue(dt);
            this.tickECG(dt);

            // "Keep Going" feedback if idle
            if (Date.now() - this.lastCompressionTime > 1500 && this.totalCompressions > 0) {
                this.feedback = '❗ Keep Going!';
                this.feedbackType = 'warning';
            }

            // Rhythm phase toggle for push/release guidance
            if (this.config.showPushRelease) {
                this._rhythmToggle += CPR_TICK_MS;
                const halfBeat = 60000 / TARGET_BPM_MID / 2;  // ~273ms per push/release
                if (this._rhythmToggle >= halfBeat) {
                    this._rhythmToggle -= halfBeat;
                    this.rhythmPhase = this.rhythmPhase === 'push' ? 'release' : 'push';
                }
            }

            this.broadcastState();
        }, CPR_TICK_MS);
    }

    endGame() {
        this.phase = 'gameover';
        this.updateRunningScores();
        this.survivalProbability = this.calcSurvivalProbability();
        this.tips = generateTips(this);
        this.broadcastState();

        this.broadcast(this.sessionId, 'cpr-game-over', {
            score: this.score,
            grade: this.grade,
            totalCompressions: this.totalCompressions,
            avgBPM: this.avgBPM,
            avgDepth: this.avgDepth,
            avgRecoil: this.avgRecoil,
            survivalProbability: this.survivalProbability,
            patientAlive: this.patient.alive,
            tips: this.tips,
            difficulty: this.difficulty,
        });

        console.log(`[CPR:${this.sessionId}] Game Over! Score: ${this.score} Grade: ${this.grade} Survival: ${this.survivalProbability}%`);
    }

    buildStatePayload() {
        return {
            phase: this.phase,
            timer: this.timer,
            countdownTimer: this.countdownTimer,
            difficulty: this.difficulty,
            config: {
                showRhythm: this.config.showRhythm,
                showDepthGuide: this.config.showDepthGuide,
                showPushRelease: this.config.showPushRelease || false,
                label: this.config.label,
            },
            rhythmPhase: this.rhythmPhase,
            player: {
                connected: this.playerConnected,
                ready: this.playerReady,
            },
            chest: {
                position: Math.round(this.chest.position * 10) / 10,
                stiffness: Math.round(this.chest.stiffness),
                baseStiffness: this.chest.baseStiffness,
            },
            patient: {
                oxygen: Math.round(this.patient.oxygen * 10) / 10,
                heartActivity: Math.round(this.patient.heartActivity * 10) / 10,
                brainTimer: Math.round(this.patient.brainTimer),
                ambulanceTimer: this.timer,
                status: this.patient.status,
                alive: this.patient.alive,
            },
            compressions: {
                total: this.totalCompressions,
                currentBPM: this.currentBPM,
                currentDepth: this.currentDepth,
                currentRecoil: Math.round(this.currentRecoil * 100),
            },
            scoring: {
                score: this.score,
                grade: this.grade,
                rateScore: Math.round(this.rateScore * 100),
                depthScore: Math.round(this.depthScore * 100),
                recoilScore: Math.round(this.recoilScore * 100),
                consistencyScore: Math.round(this.consistencyScore * 100),
                patientScore: Math.round(this.patientScore * 100),
                combo: this.combo,
                maxCombo: this.maxCombo,
                perfectCount: this.perfectCount,
                goodCount: this.goodCount,
                badCount: this.badCount,
            },
            feedback: this.feedback,
            feedbackType: this.feedbackType,
            tiltWarning: this.tiltWarning,
            events: this.events,
            avgBPM: this.avgBPM,
            avgDepth: this.avgDepth,
            avgRecoil: this.avgRecoil,
            survivalProbability: this.survivalProbability,
            tips: this.tips || [],
            ecgData: this.ecgData.slice(-100),
            waveform: this.compressions.slice(-30).map(c => ({
                depth: c.depth,
                interval: c.interval,
                time: c.time,
            })),
        };
    }

    broadcastState() {
        this.broadcast(this.sessionId, 'cpr-game-state', this.buildStatePayload());
    }

    destroy() {
        if (this._timerInterval) clearInterval(this._timerInterval);
        if (this._gameLoopInterval) clearInterval(this._gameLoopInterval);
        console.log(`[CPR:${this.sessionId}] Engine destroyed`);
    }
}

module.exports = { CprEngine };
