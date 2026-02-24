// ============================================================
// CPR TRAINER — Game Engine Module (for Motion Arena)
// Per-session game engine, no global state.
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
const WEIGHT_RATE = 0.35;
const WEIGHT_DEPTH = 0.35;
const WEIGHT_RECOIL = 0.15;
const WEIGHT_CONSISTENCY = 0.15;

const CPR_GAME_DURATION = 60;
const CPR_TICK_RATE = 30;
const CPR_TICK_MS = 1000 / CPR_TICK_RATE;

// ── Scoring Functions ───────────────────────────────────────
function scoreRate(bpm) {
    if (bpm === 0) return 0;
    if (bpm >= TARGET_BPM_LOW && bpm <= TARGET_BPM_HIGH) {
        const deviation = Math.abs(bpm - TARGET_BPM_MID);
        return Math.max(0.85, 1.0 - (deviation / 20) * 0.15);
    }
    const distance = bpm < TARGET_BPM_LOW ? TARGET_BPM_LOW - bpm : bpm - TARGET_BPM_HIGH;
    return Math.max(0, 1.0 - (distance / 40) ** 1.5);
}

function scoreDepth(depth) {
    if (depth <= 0) return 0;
    if (depth >= TARGET_DEPTH_LOW && depth <= TARGET_DEPTH_HIGH) {
        const deviation = Math.abs(depth - TARGET_DEPTH_MID);
        return Math.max(0.85, 1.0 - (deviation / 1.0) * 0.15);
    }
    const distance = depth < TARGET_DEPTH_LOW ? TARGET_DEPTH_LOW - depth : depth - TARGET_DEPTH_HIGH;
    return Math.max(0, 1.0 - (distance / 4) ** 1.5);
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
    if (tips.length === 0) tips.push('🌟 Excellent technique! You\'re performing CPR at a life-saving level!');
    return tips;
}

// ── CPR Engine Class ────────────────────────────────────────
class CprEngine {
    constructor(sessionId, broadcastFn) {
        this.sessionId = sessionId;
        this.broadcast = broadcastFn; // function(sessionId, event, data)

        this.phase = 'lobby';
        this.timer = CPR_GAME_DURATION;
        this.countdownTimer = 3;
        this.playerConnected = false;
        this.playerReady = false;

        // Compression tracking
        this.compressions = [];
        this.totalCompressions = 0;
        this.currentBPM = 0;
        this.currentDepth = 0;
        this.currentRecoil = 0;
        this.lastCompressionTime = 0;
        this.recentIntervals = [];

        // Scoring
        this.score = 0;
        this.rateScore = 0;
        this.depthScore = 0;
        this.recoilScore = 0;
        this.consistencyScore = 0;
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

        // Stats
        this.avgBPM = 0;
        this.avgDepth = 0;
        this.avgRecoil = 0;
        this.bpmStdDev = 0;
        this.depthStdDev = 0;
        this.tips = [];

        // Intervals
        this._timerInterval = null;
        this._gameLoopInterval = null;
    }

    processCompression(data) {
        if (this.phase !== 'playing') return;

        const now = Date.now();
        const depth = Math.max(0, data.depth || 0);
        const recoil = Math.min(1, Math.max(0, data.recoil || 0));

        let interval = 0;
        if (this.lastCompressionTime > 0) {
            interval = now - this.lastCompressionTime;
        }
        this.lastCompressionTime = now;

        const compression = { time: now, depth, recoil, interval };
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

        const rateS = this.recentIntervals.length >= 2 ? scoreRate(this.currentBPM) : 0.5;
        const depthS = scoreDepth(depth);
        const recoilS = scoreRecoil(recoil);
        const compScore = (rateS + depthS + recoilS) / 3;

        let quality = 'bad';
        if (compScore >= 0.85) {
            quality = 'perfect';
            this.perfectCount++;
            this.combo++;
        } else if (compScore >= 0.60) {
            quality = 'good';
            this.goodCount++;
            this.combo++;
        } else {
            this.badCount++;
            this.combo = 0;
        }

        if (this.combo > this.maxCombo) this.maxCombo = this.combo;

        // Generate feedback
        if (quality === 'perfect') {
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

        console.log(`[CPR:${this.sessionId}] #${this.totalCompressions} depth:${depth.toFixed(1)}cm BPM:${this.currentBPM} → ${quality}`);
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

        this.score = Math.round((
            this.rateScore * WEIGHT_RATE +
            this.depthScore * WEIGHT_DEPTH +
            this.recoilScore * WEIGHT_RECOIL +
            this.consistencyScore * WEIGHT_CONSISTENCY
        ) * 100);

        this.grade = calcGrade(this.score / 100);
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

        // Notify controller
        this.broadcast(this.sessionId, 'cpr-game-start', { timer: CPR_GAME_DURATION });

        this._timerInterval = setInterval(() => {
            this.timer--;
            if (this.timer <= 0) {
                clearInterval(this._timerInterval);
                clearInterval(this._gameLoopInterval);
                this.endGame();
            }
        }, 1000);

        this._gameLoopInterval = setInterval(() => {
            if (this.phase !== 'playing') return;

            if (Date.now() - this.lastCompressionTime > 1500 && this.totalCompressions > 0) {
                this.feedback = '❗ Keep Going!';
                this.feedbackType = 'warning';
            }

            this.broadcastState();
        }, CPR_TICK_MS);
    }

    endGame() {
        this.phase = 'gameover';
        this.updateRunningScores();
        this.tips = generateTips(this);
        this.broadcastState();

        this.broadcast(this.sessionId, 'cpr-game-over', {
            score: this.score,
            grade: this.grade,
            totalCompressions: this.totalCompressions,
            avgBPM: this.avgBPM,
            avgDepth: this.avgDepth,
            avgRecoil: this.avgRecoil,
            tips: this.tips,
        });

        console.log(`[CPR:${this.sessionId}] Game Over! Score: ${this.score} Grade: ${this.grade}`);
    }

    buildStatePayload() {
        return {
            phase: this.phase,
            timer: this.timer,
            countdownTimer: this.countdownTimer,
            player: {
                connected: this.playerConnected,
                ready: this.playerReady,
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
                combo: this.combo,
                maxCombo: this.maxCombo,
                perfectCount: this.perfectCount,
                goodCount: this.goodCount,
                badCount: this.badCount,
            },
            feedback: this.feedback,
            feedbackType: this.feedbackType,
            events: this.events,
            avgBPM: this.avgBPM,
            avgDepth: this.avgDepth,
            avgRecoil: this.avgRecoil,
            tips: this.tips || [],
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
