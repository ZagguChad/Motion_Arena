/**
 * Plank Wars — Server-Side Engine
 * Manages multi-player plank challenge sessions with real-time leaderboard.
 */

class PlankEngine {
    constructor(sessionId, broadcastFn) {
        this.sessionId = sessionId;
        this.broadcast = broadcastFn;
        this.phase = 'lobby'; // lobby, countdown, active, ended
        this.duration = 60; // 60-second challenge
        this.elapsed = 0;
        this.players = {}; // keyed by playerId
        this.gameTimer = null;
        this.countdownTimer = null;
    }

    addPlayer(playerId, playerNum) {
        this.players[playerId] = {
            playerNum,
            plankTime: 0,        // total seconds in plank position
            stability: 100,      // 0-100 stability score
            isPlanking: false,
            lastUpdate: Date.now(),
            totalScore: 0
        };
        this.broadcastLeaderboard();
    }

    removePlayer(playerId) {
        delete this.players[playerId];
        this.broadcastLeaderboard();
    }

    startCountdown() {
        if (this.phase !== 'lobby') return;
        this.phase = 'countdown';
        let count = 3;

        this.broadcast(this.sessionId, 'plank-countdown', { count });

        this.countdownTimer = setInterval(() => {
            count--;
            if (count <= 0) {
                clearInterval(this.countdownTimer);
                this.startChallenge();
            } else {
                this.broadcast(this.sessionId, 'plank-countdown', { count });
            }
        }, 1000);
    }

    startChallenge() {
        this.phase = 'active';
        this.elapsed = 0;

        this.broadcast(this.sessionId, 'plank-start', {
            duration: this.duration
        });

        this.gameTimer = setInterval(() => {
            this.elapsed++;

            // Update all player scores
            for (const [id, player] of Object.entries(this.players)) {
                if (player.isPlanking) {
                    player.plankTime++;
                    player.totalScore = Math.round(player.plankTime * (player.stability / 100));
                }
            }

            this.broadcastLeaderboard();

            this.broadcast(this.sessionId, 'plank-timer', {
                elapsed: this.elapsed,
                remaining: this.duration - this.elapsed
            });

            if (this.elapsed >= this.duration) {
                this.endChallenge();
            }
        }, 1000);
    }

    updatePlankData(playerId, data) {
        const player = this.players[playerId];
        if (!player || this.phase !== 'active') return;

        player.isPlanking = data.isPlanking;
        player.stability = Math.round(data.stability || 0);
        player.lastUpdate = Date.now();
    }

    endChallenge() {
        clearInterval(this.gameTimer);
        this.phase = 'ended';

        // Calculate final rankings
        const rankings = this.getRankings();

        this.broadcast(this.sessionId, 'plank-end', {
            rankings,
            duration: this.duration
        });
    }

    getRankings() {
        return Object.entries(this.players)
            .map(([id, p]) => ({
                playerId: id,
                playerNum: p.playerNum,
                plankTime: p.plankTime,
                stability: p.stability,
                score: p.totalScore,
                isPlanking: p.isPlanking
            }))
            .sort((a, b) => b.score - a.score)
            .map((entry, i) => ({ ...entry, rank: i + 1 }));
    }

    broadcastLeaderboard() {
        this.broadcast(this.sessionId, 'plank-leaderboard', {
            rankings: this.getRankings(),
            elapsed: this.elapsed,
            remaining: this.duration - this.elapsed,
            phase: this.phase
        });
    }

    destroy() {
        clearInterval(this.gameTimer);
        clearInterval(this.countdownTimer);
    }
}

module.exports = { PlankEngine };
