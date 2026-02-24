/**
 * TetrisEngine — Pure game logic for one player's 8×16 board.
 *
 * No rendering. Exposes state for the renderer to read.
 *
 * Grid coordinate system:
 *   row 0 = top, row 15 = bottom
 *   col 0 = left, col 7 = right
 */
import {
    COLS, ROWS, INITIAL_DROP_MS, SPEED_INCREASE_LINES,
    DROP_SPEED_FACTOR, LOCK_DELAY_MS, LINE_SCORES,
    COMBO_GARBAGE, COMBO_BONUS_PER_STREAK
} from '../core/Constants.js';

// ─── Tetromino definitions ───
const SHAPES = {
    I: [[0, -1], [0, 0], [0, 1], [0, 2]],
    O: [[0, 0], [0, 1], [1, 0], [1, 1]],
    T: [[0, -1], [0, 0], [0, 1], [1, 0]],
    S: [[0, 0], [0, 1], [1, -1], [1, 0]],
    Z: [[0, -1], [0, 0], [1, 0], [1, 1]],
    L: [[0, -1], [0, 0], [0, 1], [1, -1]],
    J: [[0, -1], [0, 0], [0, 1], [1, 1]],
};

const TYPES = Object.keys(SHAPES);

function rotateCW(cells) {
    return cells.map(([r, c]) => [c, -r]);
}

export class TetrisEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
        this.piece = null;
        this.ghostCells = null;
        this.nextType = null;

        // Scoring
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.combo = 0;
        this.comboStreak = 0;
        this.maxCombo = 0;

        // Per-frame event data (for renderer)
        this.lastClearedLines = 0;
        this.lastGarbageReceived = 0;
        this.comboFlashTimer = 0;
        this.lineClearFlashTimer = 0;

        // Timing
        this.dropInterval = INITIAL_DROP_MS;
        this.dropTimer = 0;
        this.lockTimer = 0;
        this.isLocking = false;

        // State
        this.gameOver = false;
        this.paused = false;

        // Bag
        this._bag = [];

        // Pre-generate next type
        this.nextType = this._nextType();
        this._spawnPiece();
    }

    // ─── Bag ───
    _nextType() {
        if (this._bag.length === 0) {
            this._bag = [...TYPES];
            for (let i = this._bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this._bag[i], this._bag[j]] = [this._bag[j], this._bag[i]];
            }
        }
        return this._bag.pop();
    }

    // ─── Spawn ───
    _spawnPiece() {
        const type = this.nextType;
        this.nextType = this._nextType();
        const cells = SHAPES[type].map(([r, c]) => [r, c]);
        const row = 0;
        const col = Math.floor(COLS / 2);

        this.piece = { type, cells, row, col };

        if (!this._isValid(cells, row, col)) {
            this.gameOver = true;
            this.piece = null;
            return;
        }

        this._updateGhost();
    }

    // ─── Collision ───
    _isValid(cells, row, col) {
        for (const [dr, dc] of cells) {
            const r = row + dr;
            const c = col + dc;
            if (c < 0 || c >= COLS) return false;
            if (r >= ROWS) return false;
            if (r < 0) continue;
            if (this.grid[r][c] !== null) return false;
        }
        return true;
    }

    // ─── Movement ───
    moveLeft() {
        if (!this.piece || this.gameOver || this.paused) return false;
        if (this._isValid(this.piece.cells, this.piece.row, this.piece.col - 1)) {
            this.piece.col--;
            this._onMove();
            return true;
        }
        return false;
    }

    moveRight() {
        if (!this.piece || this.gameOver || this.paused) return false;
        if (this._isValid(this.piece.cells, this.piece.row, this.piece.col + 1)) {
            this.piece.col++;
            this._onMove();
            return true;
        }
        return false;
    }

    moveDown() {
        if (!this.piece || this.gameOver || this.paused) return false;
        if (this._isValid(this.piece.cells, this.piece.row + 1, this.piece.col)) {
            this.piece.row++;
            this._onMove();
            return true;
        }
        return false;
    }

    rotate() {
        if (!this.piece || this.gameOver || this.paused) return false;
        if (this.piece.type === 'O') return false;

        const rotated = rotateCW(this.piece.cells);
        const kicks = [[0, 0], [0, -1], [0, 1], [-1, 0], [0, -2], [0, 2]];
        for (const [kr, kc] of kicks) {
            if (this._isValid(rotated, this.piece.row + kr, this.piece.col + kc)) {
                this.piece.cells = rotated;
                this.piece.row += kr;
                this.piece.col += kc;
                this._onMove();
                return true;
            }
        }
        return false;
    }

    hardDrop() {
        if (!this.piece || this.gameOver || this.paused) return;
        let rows = 0;
        while (this._isValid(this.piece.cells, this.piece.row + 1, this.piece.col)) {
            this.piece.row++;
            rows++;
        }
        this.score += rows * 2;
        this._lockPiece();
    }

    _onMove() {
        this.isLocking = false;
        this.lockTimer = 0;
        this._updateGhost();
    }

    // ─── Ghost ───
    _updateGhost() {
        if (!this.piece) { this.ghostCells = null; return; }
        let ghostRow = this.piece.row;
        while (this._isValid(this.piece.cells, ghostRow + 1, this.piece.col)) {
            ghostRow++;
        }
        this.ghostCells = this.piece.cells.map(([dr, dc]) => [ghostRow + dr, this.piece.col + dc]);
    }

    // ─── Lock ───
    _lockPiece() {
        if (!this.piece) return;
        const { type, cells, row, col } = this.piece;

        for (const [dr, dc] of cells) {
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
                this.grid[r][c] = type;
            }
        }

        const cleared = this._clearLines();
        this.lastClearedLines = cleared;

        // Combo tracking
        if (cleared > 0) {
            this.comboStreak++;
            this.combo = cleared;
            this.comboFlashTimer = 500; // ms to show combo
            this.lineClearFlashTimer = 300;
            if (this.comboStreak > this.maxCombo) this.maxCombo = this.comboStreak;
        } else {
            this.comboStreak = 0;
        }

        this.isLocking = false;
        this.lockTimer = 0;
        this._spawnPiece();

        return cleared;
    }

    // ─── Line Clear ───
    _clearLines() {
        let cleared = 0;
        for (let r = ROWS - 1; r >= 0; r--) {
            if (this.grid[r].every(cell => cell !== null)) {
                cleared++;
                this.grid.splice(r, 1);
                this.grid.unshift(new Array(COLS).fill(null));
                r++;
            }
        }
        if (cleared > 0) {
            this.lines += cleared;
            this.score += (LINE_SCORES[Math.min(cleared, 4)] || 0) * this.level;

            const newLevel = Math.floor(this.lines / SPEED_INCREASE_LINES) + 1;
            if (newLevel > this.level) {
                this.level = newLevel;
                this.dropInterval = Math.max(100, INITIAL_DROP_MS * Math.pow(DROP_SPEED_FACTOR, this.level - 1));
            }
        }
        return cleared;
    }

    // ─── Garbage Rows ───
    addGarbageRows(count) {
        if (count <= 0 || this.gameOver) return;

        this.lastGarbageReceived = count;

        for (let i = 0; i < count; i++) {
            // Remove top row
            this.grid.shift();
            // Add garbage row at bottom with one random gap
            const gapCol = Math.floor(Math.random() * COLS);
            const row = new Array(COLS).fill('garbage');
            row[gapCol] = null;
            this.grid.push(row);
        }

        // Check if current piece is now in collision
        if (this.piece && !this._isValid(this.piece.cells, this.piece.row, this.piece.col)) {
            // Try to push piece up
            while (this.piece.row > 0 && !this._isValid(this.piece.cells, this.piece.row, this.piece.col)) {
                this.piece.row--;
            }
            if (!this._isValid(this.piece.cells, this.piece.row, this.piece.col)) {
                this.gameOver = true;
            }
        }
        this._updateGhost();
    }

    // Calculate garbage to send to opponent
    getGarbageToSend() {
        if (this.lastClearedLines <= 0) return 0;
        const base = COMBO_GARBAGE[Math.min(this.lastClearedLines, 4)] || 0;
        const bonus = this.comboStreak > 1 ? (this.comboStreak - 1) * COMBO_BONUS_PER_STREAK : 0;
        return base + bonus;
    }

    // ─── Update ───
    update(deltaMs) {
        if (this.gameOver || this.paused || !this.piece) return;

        // Decay timers
        if (this.comboFlashTimer > 0) this.comboFlashTimer -= deltaMs;
        if (this.lineClearFlashTimer > 0) this.lineClearFlashTimer -= deltaMs;

        this.dropTimer += deltaMs;
        if (this.dropTimer >= this.dropInterval) {
            this.dropTimer = 0;
            const fell = this.moveDown();
            if (!fell) {
                if (!this.isLocking) {
                    this.isLocking = true;
                    this.lockTimer = 0;
                }
            }
        }

        if (this.isLocking) {
            this.lockTimer += deltaMs;
            if (this.lockTimer >= LOCK_DELAY_MS) {
                this._lockPiece();
            }
        }
    }

    // ─── State snapshot ───
    getState() {
        return {
            grid: this.grid,
            current: this.piece ? {
                type: this.piece.type,
                cells: this.piece.cells.map(([dr, dc]) => [
                    this.piece.row + dr,
                    this.piece.col + dc,
                ]),
            } : null,
            ghost: this.ghostCells,
            nextType: this.nextType,
            score: this.score,
            level: this.level,
            lines: this.lines,
            combo: this.combo,
            comboStreak: this.comboStreak,
            maxCombo: this.maxCombo,
            comboFlashTimer: this.comboFlashTimer,
            lineClearFlashTimer: this.lineClearFlashTimer,
            lastGarbageReceived: this.lastGarbageReceived,
            gameOver: this.gameOver,
            paused: this.paused,
        };
    }
}
