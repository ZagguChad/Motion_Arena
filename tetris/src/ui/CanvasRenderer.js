/**
 * CanvasRenderer v2 — Neon arcade Tetris renderer.
 *
 * Features:
 * - Dynamic cell sizing based on viewport
 * - Screen shake on garbage received
 * - Combo glow flash effects
 * - Fullscreen responsive scaling
 * - Leaderboard on game-over
 * - Premium neon arcade aesthetic
 */
import { COLS, ROWS, COLORS, BLOCK_RADIUS, BLOCK_INSET, GLOW_BLUR, SHAKE_INTENSITY, SHAKE_DURATION } from '../core/Constants.js';

const PREVIEW_SHAPES = {
    I: [[0, -1], [0, 0], [0, 1], [0, 2]],
    O: [[0, 0], [0, 1], [1, 0], [1, 1]],
    T: [[0, -1], [0, 0], [0, 1], [1, 0]],
    S: [[0, 0], [0, 1], [1, -1], [1, 0]],
    Z: [[0, -1], [0, 0], [1, 0], [1, 1]],
    L: [[0, -1], [0, 0], [0, 1], [1, -1]],
    J: [[0, -1], [0, 0], [0, 1], [1, 1]],
};

export class CanvasRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Screen shake state
        this.shakeTimer = 0;
        this.shakeTarget = 0; // which board: 0=none, 1=board1, 2=board2

        // Combo flash
        this.comboFlash1 = 0;
        this.comboFlash2 = 0;

        // Previous garbage received for detecting new garbage
        this._prevGarbage1 = 0;
        this._prevGarbage2 = 0;

        // Previous countdown for sound triggers
        this._prevCountdown = -1;

        // Dynamic sizing
        this._calcCellSize();
        this._recalcLayout();
    }

    _calcCellSize() {
        const maxW = window.innerWidth;
        const maxH = window.innerHeight;
        // Layout: panelW + boardW + gap + boardW + panelW
        // panelW = 5*cs, boardW = 8*cs, gap = 0.5*cs
        // total = 5 + 8 + 0.5 + 8 + 5 = 26.5 * cs
        // height: hudH + boardH = 2.5*cs + 16*cs = 18.5*cs
        const csW = Math.floor(maxW / 26.5);
        const csH = Math.floor(maxH / 18.5);
        this.cellSize = Math.max(16, Math.min(csW, csH, 48));
    }

    _recalcLayout() {
        const cs = this.cellSize;
        this.boardW = COLS * cs;
        this.boardH = ROWS * cs;
        this.panelW = cs * 5;
        this.hudH = cs * 2.5;
        this.gap = cs * 0.5;

        this.totalW = this.panelW + this.boardW + this.gap + this.boardW + this.panelW;
        this.totalH = this.hudH + this.boardH;

        this.canvas.width = this.totalW;
        this.canvas.height = this.totalH;

        this.board1X = this.panelW;
        this.board2X = this.panelW + this.boardW + this.gap;
        this.boardY = this.hudH;

        this.panel1X = 0;
        this.panel2X = this.panelW + this.boardW + this.gap + this.boardW;
    }

    triggerShake(player) {
        this.shakeTimer = SHAKE_DURATION;
        this.shakeTarget = player;
    }

    render(multiState, deltaMs = 0) {
        const { ctx } = this;

        // Decay shake
        if (this.shakeTimer > 0) this.shakeTimer -= deltaMs;
        if (this.comboFlash1 > 0) this.comboFlash1 -= deltaMs;
        if (this.comboFlash2 > 0) this.comboFlash2 -= deltaMs;

        // Clear
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, this.totalW, this.totalH);

        if (!multiState) return {};

        const { gameState, countdownValue, winner, pauseReason, player1, player2, leaderboard } = multiState;

        // Detect new garbage → trigger shake
        let events = {};
        if (player1 && player1.lastGarbageReceived > this._prevGarbage1 && player1.lastGarbageReceived > 0) {
            this.triggerShake(1);
            events.garbage1 = true;
        }
        if (player2 && player2.lastGarbageReceived > this._prevGarbage2 && player2.lastGarbageReceived > 0) {
            this.triggerShake(2);
            events.garbage2 = true;
        }
        this._prevGarbage1 = player1?.lastGarbageReceived || 0;
        this._prevGarbage2 = player2?.lastGarbageReceived || 0;

        // Detect combo for flash
        if (player1?.comboFlashTimer > 0 && player1.comboStreak > 1) {
            this.comboFlash1 = 300;
            events.combo1 = player1.comboStreak;
        }
        if (player2?.comboFlashTimer > 0 && player2.comboStreak > 1) {
            this.comboFlash2 = 300;
            events.combo2 = player2.comboStreak;
        }

        // Detect line clears
        if (player1?.lineClearFlashTimer > 0 && player1.lineClearFlashTimer > 200) {
            events.lineClear1 = true;
        }
        if (player2?.lineClearFlashTimer > 0 && player2.lineClearFlashTimer > 200) {
            events.lineClear2 = true;
        }

        // Countdown sound events
        if (gameState === 'countdown' && countdownValue !== this._prevCountdown) {
            events.countdown = countdownValue;
        }
        this._prevCountdown = countdownValue;

        // Game over
        if (gameState === 'gameover' && winner) {
            events.gameOver = winner;
        }

        // Draw HUD
        this._drawHUD(player1, player2);

        // Draw boards with shake offset
        const shake1 = (this.shakeTimer > 0 && (this.shakeTarget === 1 || this.shakeTarget === 0))
            ? (Math.random() - 0.5) * SHAKE_INTENSITY * (this.shakeTimer / SHAKE_DURATION) : 0;
        const shake2 = (this.shakeTimer > 0 && (this.shakeTarget === 2 || this.shakeTarget === 0))
            ? (Math.random() - 0.5) * SHAKE_INTENSITY * (this.shakeTimer / SHAKE_DURATION) : 0;

        ctx.save();
        ctx.translate(shake1, shake1 * 0.5);
        this._drawBoard(player1, this.board1X, this.boardY, 1);
        ctx.restore();

        ctx.save();
        ctx.translate(shake2, shake2 * 0.5);
        this._drawBoard(player2, this.board2X, this.boardY, 2);
        ctx.restore();

        // Center divider
        this._drawDivider();

        // Side panels
        this._drawNextPanel(player1, this.panel1X, this.boardY, 1);
        this._drawNextPanel(player2, this.panel2X, this.boardY, 2);

        // Combo flash overlay
        if (this.comboFlash1 > 0) {
            const a = Math.min(1, this.comboFlash1 / 200) * 0.15;
            ctx.fillStyle = `rgba(0,255,255,${a})`;
            ctx.fillRect(this.board1X, this.boardY, this.boardW, this.boardH);
        }
        if (this.comboFlash2 > 0) {
            const a = Math.min(1, this.comboFlash2 / 200) * 0.15;
            ctx.fillStyle = `rgba(0,255,255,${a})`;
            ctx.fillRect(this.board2X, this.boardY, this.boardW, this.boardH);
        }

        // State overlays
        if (gameState === 'countdown') this._drawCountdown(countdownValue);
        else if (gameState === 'lobby') this._drawLobbyOverlay(multiState);
        else if (gameState === 'paused') this._drawPauseOverlay(pauseReason);
        else if (gameState === 'gameover') this._drawGameOverOverlay(winner, player1, player2, leaderboard);

        return events;
    }

    // ─── HUD ───
    _drawHUD(p1, p2) {
        const { ctx } = this;
        const cs = this.cellSize;
        const midX = this.totalW / 2;

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, this.totalW, this.hudH);

        // Glow line
        ctx.shadowColor = COLORS.neonGlow;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = 'rgba(0,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, this.hudH);
        ctx.lineTo(this.totalW, this.hudH);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Title
        const titleSize = Math.max(10, cs * 0.45);
        ctx.font = `bold ${titleSize}px "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0,255,255,0.5)';
        ctx.fillText('MOTION ARENA', midX, 4);

        // P1 stats
        const p1X = this.board1X + this.boardW / 2;
        const statFont = Math.max(8, cs * 0.35);
        const labelFont = Math.max(7, cs * 0.28);

        ctx.font = `bold ${statFont}px "Press Start 2P", monospace`;
        ctx.fillStyle = '#ff4466';
        ctx.fillText('P1', p1X, 4);

        ctx.font = `bold ${statFont}px "Rajdhani", sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.fillText(`${p1?.score || 0}`, p1X, 6 + statFont);

        ctx.font = `${labelFont}px "Rajdhani", sans-serif`;
        ctx.fillStyle = '#888';
        ctx.fillText(`LV ${p1?.level || 1} │ ${p1?.lines || 0} Lines`, p1X, 10 + statFont * 2);

        if (p1?.comboStreak > 1 && p1?.comboFlashTimer > 0) {
            const ci = Math.min(p1.comboStreak - 1, COLORS.comboColors.length - 1);
            ctx.fillStyle = COLORS.comboColors[ci];
            ctx.font = `bold ${statFont}px "Press Start 2P", monospace`;
            ctx.fillText(`${p1.comboStreak}x COMBO!`, p1X, 14 + statFont * 3);
        }

        // P2 stats
        const p2X = this.board2X + this.boardW / 2;

        ctx.font = `bold ${statFont}px "Press Start 2P", monospace`;
        ctx.fillStyle = '#4488ff';
        ctx.fillText('P2', p2X, 4);

        ctx.font = `bold ${statFont}px "Rajdhani", sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.fillText(`${p2?.score || 0}`, p2X, 6 + statFont);

        ctx.font = `${labelFont}px "Rajdhani", sans-serif`;
        ctx.fillStyle = '#888';
        ctx.fillText(`LV ${p2?.level || 1} │ ${p2?.lines || 0} Lines`, p2X, 10 + statFont * 2);

        if (p2?.comboStreak > 1 && p2?.comboFlashTimer > 0) {
            const ci = Math.min(p2.comboStreak - 1, COLORS.comboColors.length - 1);
            ctx.fillStyle = COLORS.comboColors[ci];
            ctx.font = `bold ${statFont}px "Press Start 2P", monospace`;
            ctx.fillText(`${p2.comboStreak}x COMBO!`, p2X, 14 + statFont * 3);
        }
    }

    // ─── Board ───
    _drawBoard(state, ox, oy, playerNum) {
        const { ctx, cellSize: cs } = this;

        ctx.fillStyle = COLORS.boardBg;
        ctx.fillRect(ox, oy, this.boardW, this.boardH);

        // Grid
        ctx.strokeStyle = COLORS.gridLine;
        ctx.lineWidth = 0.5;
        for (let c = 0; c <= COLS; c++) {
            ctx.beginPath(); ctx.moveTo(ox + c * cs, oy); ctx.lineTo(ox + c * cs, oy + this.boardH); ctx.stroke();
        }
        for (let r = 0; r <= ROWS; r++) {
            ctx.beginPath(); ctx.moveTo(ox, oy + r * cs); ctx.lineTo(ox + this.boardW, oy + r * cs); ctx.stroke();
        }

        // Board border
        const bc = playerNum === 1 ? 'rgba(255,68,102,0.25)' : 'rgba(68,136,255,0.25)';
        const sc = playerNum === 1 ? '#ff4466' : '#4488ff';
        ctx.shadowColor = sc;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = bc;
        ctx.lineWidth = 2;
        ctx.strokeRect(ox, oy, this.boardW, this.boardH);
        ctx.shadowBlur = 0;

        if (!state) return;

        // Locked blocks
        if (state.grid) {
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const cell = state.grid[r][c];
                    if (cell) {
                        const color = cell === 'garbage' ? COLORS.garbage : (COLORS[cell] || '#555');
                        this._drawBlock(ox, oy, r, c, color, cell !== 'garbage');
                    }
                }
            }
        }

        // Ghost
        if (state.ghost) {
            for (const [r, c] of state.ghost) {
                if (r >= 0 && r < ROWS) this._drawGhostBlock(ox, oy, r, c, state.current?.type);
            }
        }

        // Current piece
        if (state.current) {
            const color = COLORS[state.current.type] || '#fff';
            for (const [r, c] of state.current.cells) {
                if (r >= 0 && r < ROWS) this._drawBlock(ox, oy, r, c, color, true);
            }
        }

        // Line clear flash
        if (state.lineClearFlashTimer > 0) {
            const alpha = Math.min(1, state.lineClearFlashTimer / 200) * 0.25;
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fillRect(ox, oy, this.boardW, this.boardH);
        }

        // Game over per board
        if (state.gameOver) {
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.fillRect(ox, oy, this.boardW, this.boardH);
            ctx.fillStyle = '#ff4444';
            ctx.font = `bold ${Math.max(12, cs * 0.5)}px "Press Start 2P", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GAME', ox + this.boardW / 2, oy + this.boardH / 2 - cs * 0.5);
            ctx.fillText('OVER', ox + this.boardW / 2, oy + this.boardH / 2 + cs * 0.5);
        }
    }

    // ─── Blocks ───
    _drawBlock(ox, oy, row, col, color, glow = false) {
        const { ctx, cellSize: cs } = this;
        const x = ox + col * cs + BLOCK_INSET;
        const y = oy + row * cs + BLOCK_INSET;
        const w = cs - BLOCK_INSET * 2;
        const h = cs - BLOCK_INSET * 2;

        if (glow) { ctx.shadowColor = color; ctx.shadowBlur = GLOW_BLUR; }

        ctx.fillStyle = color;
        this._roundRect(x, y, w, h, BLOCK_RADIUS);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Bevels
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        this._roundRect(x, y, w, Math.min(3, cs * 0.1), BLOCK_RADIUS);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x, y + 3, Math.min(3, cs * 0.1), h - 6);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(x + 3, y + h - 3, w - 3, 3);
    }

    _drawGhostBlock(ox, oy, row, col, type) {
        const { ctx, cellSize: cs } = this;
        const x = ox + col * cs + BLOCK_INSET;
        const y = oy + row * cs + BLOCK_INSET;
        const w = cs - BLOCK_INSET * 2;
        const h = cs - BLOCK_INSET * 2;

        ctx.strokeStyle = COLORS[type] || 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25;
        this._roundRect(x, y, w, h, BLOCK_RADIUS);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    _roundRect(x, y, w, h, r) {
        const { ctx } = this;
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // ─── Divider ───
    _drawDivider() {
        const { ctx } = this;
        const x = this.board1X + this.boardW + this.gap / 2;
        ctx.shadowColor = COLORS.neonGlow;
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(0,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.moveTo(x, this.hudH);
        ctx.lineTo(x, this.totalH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
    }

    // ─── Next Piece ───
    _drawNextPanel(state, px, py, playerNum) {
        const { ctx, cellSize: cs } = this;

        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(px, py, this.panelW, this.boardH);

        const labelSize = Math.max(7, cs * 0.28);
        ctx.font = `${labelSize}px "Press Start 2P", monospace`;
        ctx.fillStyle = '#444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('NEXT', px + this.panelW / 2, py + 10);

        if (!state?.nextType) return;

        const type = state.nextType;
        const shape = PREVIEW_SHAPES[type];
        if (!shape) return;

        const color = COLORS[type] || '#fff';
        const previewCs = cs * 0.65;
        const centerX = px + this.panelW / 2;
        const centerY = py + 50 + cs;

        for (const [dr, dc] of shape) {
            const bx = centerX + dc * previewCs - previewCs / 2;
            const by = centerY + dr * previewCs - previewCs / 2;
            ctx.shadowColor = color;
            ctx.shadowBlur = 5;
            ctx.fillStyle = color;
            this._roundRect(bx + 1, by + 1, previewCs - 2, previewCs - 2, 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Combo/max stats
        const infoY = py + 110 + cs * 2;
        const infoSize = Math.max(7, cs * 0.25);
        ctx.font = `${infoSize}px "Rajdhani", sans-serif`;
        ctx.fillStyle = '#444';
        ctx.fillText('COMBO', px + this.panelW / 2, infoY);
        ctx.fillStyle = state.comboStreak > 0 ? '#0ff' : '#333';
        ctx.font = `bold ${Math.max(14, cs * 0.5)}px "Rajdhani", sans-serif`;
        ctx.fillText(`${state.comboStreak || 0}`, px + this.panelW / 2, infoY + 16);

        ctx.font = `${infoSize}px "Rajdhani", sans-serif`;
        ctx.fillStyle = '#444';
        ctx.fillText('MAX', px + this.panelW / 2, infoY + 40);
        ctx.fillStyle = '#555';
        ctx.font = `bold ${Math.max(10, cs * 0.38)}px "Rajdhani", sans-serif`;
        ctx.fillText(`${state.maxCombo || 0}`, px + this.panelW / 2, infoY + 54);
    }

    // ─── Overlays ───
    _drawCountdown(value) {
        const { ctx, cellSize: cs } = this;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, this.totalW, this.totalH);

        const text = value > 0 ? value.toString() : 'GO!';
        const color = value > 0 ? '#0ff' : '#0f0';

        ctx.shadowColor = color;
        ctx.shadowBlur = 40;
        ctx.fillStyle = color;
        const size = value > 0 ? Math.max(60, cs * 3) : Math.max(48, cs * 2.5);
        ctx.font = `bold ${size}px "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, this.totalW / 2, this.totalH / 2);
        ctx.shadowBlur = 0;
    }

    _drawLobbyOverlay(multiState) {
        const { ctx, cellSize: cs } = this;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, this.totalW, this.totalH);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const titleSize = Math.max(16, cs * 0.7);
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 25;
        ctx.fillStyle = '#0ff';
        ctx.font = `bold ${titleSize}px "Press Start 2P", monospace`;
        ctx.fillText('MOTION ARENA', this.totalW / 2, this.totalH / 2 - cs * 3);
        ctx.shadowBlur = 0;

        const subSize = Math.max(12, cs * 0.4);
        ctx.fillStyle = '#888';
        ctx.font = `${subSize}px "Rajdhani", sans-serif`;
        ctx.fillText('Scan QR code to connect controllers', this.totalW / 2, this.totalH / 2 - cs * 1.5);

        // Player status
        const stSize = Math.max(10, cs * 0.35);
        const p1Text = multiState.player1Connected ? '✓ CONNECTED' : '○ Waiting...';
        const p2Text = multiState.player2Connected ? '✓ CONNECTED' : '○ Waiting...';

        ctx.font = `bold ${stSize}px "Press Start 2P", monospace`;
        ctx.fillStyle = '#ff4466';
        ctx.fillText('P1', this.totalW / 2 - cs * 3, this.totalH / 2);
        ctx.fillStyle = multiState.player1Connected ? '#0f0' : '#555';
        ctx.font = `${Math.max(9, cs * 0.3)}px "Rajdhani", sans-serif`;
        ctx.fillText(p1Text, this.totalW / 2 - cs * 3, this.totalH / 2 + cs);

        ctx.font = `bold ${stSize}px "Press Start 2P", monospace`;
        ctx.fillStyle = '#4488ff';
        ctx.fillText('P2', this.totalW / 2 + cs * 3, this.totalH / 2);
        ctx.fillStyle = multiState.player2Connected ? '#0f0' : '#555';
        ctx.font = `${Math.max(9, cs * 0.3)}px "Rajdhani", sans-serif`;
        ctx.fillText(p2Text, this.totalW / 2 + cs * 3, this.totalH / 2 + cs);

        ctx.fillStyle = '#444';
        ctx.font = `${Math.max(10, cs * 0.3)}px "Rajdhani", sans-serif`;
        ctx.fillText('Press SPACE or both players READY to start', this.totalW / 2, this.totalH / 2 + cs * 3);
        ctx.fillText('Keyboard: P1=WASD  P2=Arrows  R=Reset  M=Mute', this.totalW / 2, this.totalH / 2 + cs * 3.8);
    }

    _drawPauseOverlay(reason) {
        const { ctx, cellSize: cs } = this;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, this.totalW, this.totalH);

        ctx.shadowColor = '#ff0';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#ff0';
        ctx.font = `bold ${Math.max(20, cs * 0.8)}px "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSED', this.totalW / 2, this.totalH / 2 - 20);
        ctx.shadowBlur = 0;

        if (reason) {
            ctx.fillStyle = '#888';
            ctx.font = `${Math.max(12, cs * 0.4)}px "Rajdhani", sans-serif`;
            ctx.fillText(reason, this.totalW / 2, this.totalH / 2 + 20);
        }
    }

    _drawGameOverOverlay(winner, p1, p2, leaderboard) {
        const { ctx, cellSize: cs } = this;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, this.totalW, this.totalH);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const winColor = winner === 1 ? '#ff4466' : '#4488ff';
        ctx.shadowColor = winColor;
        ctx.shadowBlur = 30;
        ctx.fillStyle = winColor;
        ctx.font = `bold ${Math.max(16, cs * 0.65)}px "Press Start 2P", monospace`;
        ctx.fillText(`PLAYER ${winner} WINS!`, this.totalW / 2, this.totalH / 2 - cs * 2);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#aaa';
        ctx.font = `${Math.max(12, cs * 0.4)}px "Rajdhani", sans-serif`;
        ctx.fillText(`P1: ${p1?.score || 0}  vs  P2: ${p2?.score || 0}`, this.totalW / 2, this.totalH / 2 - cs * 0.8);

        // Leaderboard
        if (leaderboard && leaderboard.length > 0) {
            const lbY = this.totalH / 2 + cs * 0.3;
            ctx.fillStyle = '#666';
            ctx.font = `bold ${Math.max(9, cs * 0.3)}px "Press Start 2P", monospace`;
            ctx.fillText('TOP SCORES', this.totalW / 2, lbY);

            ctx.font = `${Math.max(10, cs * 0.32)}px "Rajdhani", sans-serif`;
            leaderboard.slice(0, 5).forEach((entry, i) => {
                const y = lbY + 16 + i * 18;
                ctx.fillStyle = i === 0 ? '#ff0' : '#888';
                ctx.fillText(`#${i + 1}  ${entry.player}  ${entry.score}`, this.totalW / 2, y);
            });
        }

        ctx.fillStyle = '#444';
        ctx.font = `${Math.max(10, cs * 0.3)}px "Rajdhani", sans-serif`;
        ctx.fillText('Press R to restart', this.totalW / 2, this.totalH / 2 + cs * 3.5);
    }

    // ─── Tutorial ───
    drawTutorial() {
        const { ctx, cellSize: cs } = this;
        ctx.fillStyle = 'rgba(0,0,0,0.88)';
        ctx.fillRect(0, 0, this.totalW, this.totalH);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#0ff';
        ctx.font = `bold ${Math.max(14, cs * 0.55)}px "Press Start 2P", monospace`;
        ctx.fillText('HOW TO PLAY', this.totalW / 2, cs * 2);
        ctx.shadowBlur = 0;

        const gestures = [
            ['👈 Thumb Out', 'Move LEFT'],
            ['👉 Index Up', 'Move RIGHT'],
            ['🤙 Thumb+Pinky', 'ROTATE'],
            ['✋ No Hand', 'HARD DROP'],
            ['✌️ Peace Sign', 'Soft DOWN'],
        ];

        const gSize = Math.max(11, cs * 0.38);
        ctx.font = `${gSize}px "Rajdhani", sans-serif`;
        let y = cs * 4;
        for (const [gesture, action] of gestures) {
            ctx.fillStyle = '#0ff';
            ctx.textAlign = 'right';
            ctx.fillText(gesture, this.totalW / 2 - 10, y);
            ctx.fillStyle = '#888';
            ctx.textAlign = 'left';
            ctx.fillText(action, this.totalW / 2 + 10, y);
            y += cs * 1.2;
        }

        ctx.textAlign = 'center';
        ctx.fillStyle = '#555';
        ctx.font = `${Math.max(10, cs * 0.3)}px "Rajdhani", sans-serif`;
        ctx.fillText('Clear multiple lines to attack your opponent!', this.totalW / 2, y + cs);
        ctx.fillText('Press any key to start', this.totalW / 2, y + cs * 2);
    }

    // ─── Debug Overlay ───
    drawDebugOverlay(stats) {
        const { ctx } = this;
        const panelW = 260;
        const panelH = 280;
        const x = this.totalW - panelW - 10;
        const y = this.hudH + 10;

        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(x, y, panelW, panelH);
        ctx.strokeStyle = 'rgba(0,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, panelW, panelH);

        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#0ff';
        ctx.fillText('DEBUG [G to hide]', x + 8, y + 6);

        const lines = [
            { t: `Session: ${stats.sessionId || '—'}`, c: stats.sessionId ? '#0ff' : '#f44' },
            { t: `WS: ${stats.wsState}`, c: stats.wsState === 'connected' ? '#0f0' : '#f44' },
            { t: `Sockets: ${stats.connectedSockets || 0}`, c: '#aaa' },
            { t: `Last msg: ${stats.lastMessage || '—'}`, c: '#888' },
            { t: '─────────────────', c: '#333' },
            { t: `P1: ${stats.p1Connected ? 'ON' : 'off'} | Ready: ${stats.p1Ready ? '✓' : '✗'}`, c: stats.p1Connected ? '#0f0' : '#666' },
            { t: `P2: ${stats.p2Connected ? 'ON' : 'off'} | Ready: ${stats.p2Ready ? '✓' : '✗'}`, c: stats.p2Connected ? '#0f0' : '#666' },
            { t: '─────────────────', c: '#333' },
            { t: `FPS: ${stats.fps}`, c: stats.fps >= 55 ? '#0f0' : stats.fps >= 30 ? '#ff0' : '#f44' },
            { t: `Latency: ${stats.latency}ms`, c: stats.latency < 50 ? '#0f0' : stats.latency < 80 ? '#ff0' : '#f44' },
            { t: `P1 Input: ${stats.p1Gesture}`, c: '#aaa' },
            { t: `P2 Input: ${stats.p2Gesture}`, c: '#aaa' },
            { t: `P1 Queue: ${stats.p1QueueSize}`, c: stats.p1QueueSize > 4 ? '#ff0' : '#aaa' },
            { t: `P2 Queue: ${stats.p2QueueSize}`, c: stats.p2QueueSize > 4 ? '#ff0' : '#aaa' },
            { t: `Inputs OK: ${stats.inputsProcessed}`, c: '#aaa' },
            { t: `Inputs Drop: ${stats.inputsDropped}`, c: stats.inputsDropped > 0 ? '#f44' : '#aaa' },
        ];

        ctx.font = '9px monospace';
        lines.forEach((line, i) => {
            ctx.fillStyle = line.c;
            ctx.fillText(line.t, x + 8, y + 22 + i * 15);
        });
    }

    // ─── Resize ───
    resize() {
        this._calcCellSize();
        this._recalcLayout();
        const maxW = window.innerWidth;
        const maxH = window.innerHeight;
        const scaleW = maxW / this.totalW;
        const scaleH = maxH / this.totalH;
        const scale = Math.min(scaleW, scaleH);
        this.canvas.style.width = `${this.totalW * scale}px`;
        this.canvas.style.height = `${this.totalH * scale}px`;
    }
}
