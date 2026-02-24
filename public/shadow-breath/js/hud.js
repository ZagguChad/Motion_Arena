// ============================================
// Shadow Breath — HUD (Heads-Up Display)
// Lung bar, alert meter, score, minimap, messages
// ============================================

export class HUD {
    constructor(canvas) {
        this.canvas = canvas;
        this.message = null;
        this.messageTimer = 0;
        this.flashTimer = 0;
        this.flashColor = null;
    }

    showMessage(text, duration = 2) {
        this.message = text;
        this.messageTimer = duration;
    }

    flash(color = 'rgba(255,0,0,0.3)') {
        this.flashColor = color;
        this.flashTimer = 0.3;
    }

    update(dt) {
        if (this.messageTimer > 0) {
            this.messageTimer -= dt;
            if (this.messageTimer <= 0) {
                this.message = null;
            }
        }
        if (this.flashTimer > 0) {
            this.flashTimer -= dt;
        }
    }

    draw(ctx, player, guards, levelInfo, score, timeLeft) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Screen flash
        if (this.flashTimer > 0 && this.flashColor) {
            ctx.fillStyle = this.flashColor;
            ctx.globalAlpha = this.flashTimer / 0.3;
            ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = 1;
        }

        // --- LUNG BAR (bottom center) ---
        const barW = 160;
        const barH = 14;
        const barX = (w - barW) / 2;
        const barY = h - 30;
        const breathPct = player.breathRemaining / player.breathCapacity;

        // Frame
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.strokeStyle = 'rgba(100, 170, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX - 2, barY - 2, barW + 4, barH + 4);

        // Fill
        const fillW = barW * breathPct;
        const gradient = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        if (breathPct > 0.5) {
            gradient.addColorStop(0, '#2266cc');
            gradient.addColorStop(1, '#44aaff');
        } else if (breathPct > 0.25) {
            gradient.addColorStop(0, '#cc8800');
            gradient.addColorStop(1, '#ffaa33');
        } else {
            gradient.addColorStop(0, '#cc2222');
            gradient.addColorStop(1, '#ff4444');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(barX, barY, fillW, barH);

        // Lung icon + label
        ctx.fillStyle = '#aaccff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('🫁 BREATH', barX, barY - 5);

        // Percentage
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(breathPct * 100)}%`, barX + barW, barY - 5);

        // --- STEALTH STATUS (below lung bar) ---
        ctx.textAlign = 'center';
        ctx.font = 'bold 10px monospace';
        if (player.hidden) {
            ctx.fillStyle = '#44ff44';
            ctx.fillText('🛢️ HIDDEN', w / 2, barY + barH + 14);
        } else if (!player.visible) {
            ctx.fillStyle = '#66aaff';
            ctx.fillText('👻 INVISIBLE', w / 2, barY + barH + 14);
        } else {
            ctx.fillStyle = '#ff6644';
            ctx.fillText('⚠️ VISIBLE', w / 2, barY + barH + 14);
        }

        // --- ALERT METER (top right) ---
        const maxAlert = Math.max(...guards.map(g => g.alertLevel), 0);
        const amW = 10;
        const amH = 60;
        const amX = w - 24;
        const amY = 10;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(amX - 2, amY - 2, amW + 4, amH + 4);
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(amX - 2, amY - 2, amW + 4, amH + 4);

        const alertFillH = (maxAlert / 100) * amH;
        const alertGrad = ctx.createLinearGradient(0, amY + amH, 0, amY);
        alertGrad.addColorStop(0, '#33aa33');
        alertGrad.addColorStop(0.5, '#ddaa00');
        alertGrad.addColorStop(1, '#ff2222');
        ctx.fillStyle = alertGrad;
        ctx.fillRect(amX, amY + (amH - alertFillH), amW, alertFillH);

        ctx.fillStyle = '#ffaaaa';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🚨', amX + amW / 2, amY - 4);

        // --- TIMER (top left) ---
        ctx.fillStyle = '#ccddff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        const mins = Math.floor(timeLeft / 60);
        const secs = Math.floor(timeLeft % 60);
        ctx.fillText(`⏱ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, 10, 20);

        // --- SCORE (top center) ---
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`★ ${score}`, w / 2, 20);

        // --- LEVEL NAME (top center, smaller) ---
        ctx.fillStyle = '#889';
        ctx.font = '8px monospace';
        ctx.fillText(levelInfo, w / 2, 32);

        // --- FOCUS MODE INDICATOR ---
        if (player.focusActive) {
            ctx.strokeStyle = 'rgba(100, 160, 255, 0.4)';
            ctx.lineWidth = 3;
            ctx.strokeRect(3, 3, w - 6, h - 6);
            ctx.fillStyle = 'rgba(100, 160, 255, 0.6)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('👁 EAGLE VISION', w - 10, h - 50);
        }

        // --- MINIMAP (bottom right) ---
        this._drawMinimap(ctx, w, h, player, guards, levelInfo);

        // --- CENTER MESSAGE ---
        if (this.message) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(w / 2 - 120, h / 2 - 25, 240, 50);
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(w / 2 - 120, h / 2 - 25, 240, 50);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.message, w / 2, h / 2 + 5);
        }
    }

    _drawMinimap(ctx, canvasW, canvasH, player, guards) {
        // We'll draw this based on player/guard positions if we have level data
        // For now, skip if no data
    }

    drawGameOver(ctx, reason) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#ff3333';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION FAILED', w / 2, h / 2 - 20);

        ctx.fillStyle = '#aaa';
        ctx.font = '12px monospace';
        ctx.fillText(reason || 'You were caught!', w / 2, h / 2 + 10);

        ctx.fillStyle = '#66aaff';
        ctx.font = '10px monospace';
        ctx.fillText('Tap INTERACT / Press R to retry', w / 2, h / 2 + 40);
    }

    drawVictory(ctx, score, stats) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#44ff88';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION COMPLETE', w / 2, h / 2 - 50);

        ctx.fillStyle = '#fff';
        ctx.font = '14px monospace';
        ctx.fillText(`★ Score: ${score}`, w / 2, h / 2 - 15);

        if (stats) {
            ctx.fillStyle = '#aaa';
            ctx.font = '10px monospace';
            ctx.fillText(`Longest breath hold: ${stats.longestHold.toFixed(1)}s`, w / 2, h / 2 + 10);
            ctx.fillText(`Alerts raised: ${stats.alertsRaised}`, w / 2, h / 2 + 25);
            ctx.fillText(`Time: ${stats.timeTaken.toFixed(0)}s`, w / 2, h / 2 + 40);
        }

        // Star rating
        const stars = score >= 1000 ? '★★★' : score >= 500 ? '★★☆' : '★☆☆';
        ctx.fillStyle = '#ffdd00';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(stars, w / 2, h / 2 + 65);

        ctx.fillStyle = '#66aaff';
        ctx.font = '10px monospace';
        ctx.fillText('Tap INTERACT / Press N for next level', w / 2, h / 2 + 90);
    }

    drawLevelIntro(ctx, name, subtitle) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#66aaff';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(name, w / 2, h / 2 - 10);

        ctx.fillStyle = '#889';
        ctx.font = '11px monospace';
        ctx.fillText(subtitle, w / 2, h / 2 + 15);

        ctx.fillStyle = '#aaa';
        ctx.font = '9px monospace';
        ctx.fillText('Hold your breath to become invisible...', w / 2, h / 2 + 45);
    }
}
