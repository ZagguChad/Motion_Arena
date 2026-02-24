// ====================================
// GASTRO TETRIS — Game Engine v2
// Motion Arena | 2-Player Competitive
// Full-screen, combos, enhanced scoring
// ====================================

(function () {
    'use strict';

    // === CONSTANTS ===
    const COLS = 10;
    const ROWS = 20;

    // Tetromino shapes and colors
    const TETROMINOES = {
        I: { shape: [[1, 1, 1, 1]], color: '#00e5ff' },
        O: { shape: [[1, 1], [1, 1]], color: '#ffdd00' },
        T: { shape: [[0, 1, 0], [1, 1, 1]], color: '#aa55ff' },
        S: { shape: [[0, 1, 1], [1, 1, 0]], color: '#00ff88' },
        Z: { shape: [[1, 1, 0], [0, 1, 1]], color: '#ff3355' },
        J: { shape: [[1, 0, 0], [1, 1, 1]], color: '#3388ff' },
        L: { shape: [[0, 0, 1], [1, 1, 1]], color: '#ff8800' }
    };

    const PIECE_NAMES = Object.keys(TETROMINOES);
    const LINE_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };
    const LINE_NAMES = { 1: 'SINGLE', 2: 'DOUBLE', 3: 'TRIPLE', 4: 'TETRIS!' };
    const LEVEL_SPEEDS = [
        1500, 1350, 1200, 1050, 900, 780, 660, 540, 440, 360,
        300, 260, 220, 180, 160, 140, 120, 100, 90, 80
    ];

    // === SOCKET CONNECTION ===
    const socket = io();
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    const gameMode = params.get('mode') || '2p';  // '1p' or '2p'

    // === DYNAMIC SIZING ===
    function calculateBlockSize() {
        const gameArea = document.querySelector('.game-area');
        if (!gameArea) return 25;
        const availableHeight = gameArea.clientHeight - 40;
        const blockSize = Math.floor(availableHeight / ROWS);
        return Math.max(16, Math.min(blockSize, 36));
    }

    // === GAME STATE CLASS ===
    class TetrisBoard {
        constructor(playerNum) {
            this.playerNum = playerNum;
            this.canvas = document.getElementById(`board-${playerNum}`);
            this.ctx = this.canvas.getContext('2d');
            this.nextCanvas = document.getElementById(`next-${playerNum}`);
            this.nextCtx = this.nextCanvas.getContext('2d');

            this.blockSize = calculateBlockSize();
            this.resize();
            this.reset();
        }

        resize() {
            this.blockSize = calculateBlockSize();
            this.canvas.width = COLS * this.blockSize;
            this.canvas.height = ROWS * this.blockSize;
        }

        reset() {
            this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
            this.score = 0;
            this.lines = 0;
            this.level = 1;
            this.combo = 0;
            this.maxCombo = 0;
            this.totalPieces = 0;
            this.gameOver = false;

            this.currentPiece = null;
            this.currentX = 0;
            this.currentY = 0;
            this.currentColor = null;

            this.nextPieceType = null;

            this.lastDrop = 0;
            this.dropInterval = LEVEL_SPEEDS[0];

            // Animation states
            this.flashRows = null;
            this.flashTime = 0;
            this.shakeAmount = 0;
            this.shakeTime = 0;

            this.nextPieceType = this.randomPiece();
            this.spawnPiece();
            this.updateUI();
        }

        randomPiece() {
            return PIECE_NAMES[Math.floor(Math.random() * PIECE_NAMES.length)];
        }

        spawnPiece() {
            const type = this.nextPieceType;
            this.nextPieceType = this.randomPiece();

            const piece = TETROMINOES[type];
            this.currentPiece = piece.shape.map(row => [...row]);
            this.currentColor = piece.color;
            this.currentX = Math.floor((COLS - this.currentPiece[0].length) / 2);
            this.currentY = 0;
            this.totalPieces++;

            if (this.collides(this.currentPiece, this.currentX, this.currentY)) {
                this.gameOver = true;
            }

            this.drawNext();
        }

        collides(piece, px, py) {
            for (let r = 0; r < piece.length; r++) {
                for (let c = 0; c < piece[r].length; c++) {
                    if (piece[r][c]) {
                        const newX = px + c;
                        const newY = py + r;
                        if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
                        if (newY >= 0 && this.grid[newY][newX]) return true;
                    }
                }
            }
            return false;
        }

        rotatePiece() {
            const rotated = this.currentPiece[0].map((_, i) =>
                this.currentPiece.map(row => row[i]).reverse()
            );
            const offsets = [0, -1, 1, -2, 2];
            for (const offset of offsets) {
                if (!this.collides(rotated, this.currentX + offset, this.currentY)) {
                    this.currentPiece = rotated;
                    this.currentX += offset;
                    return true;
                }
            }
            return false;
        }

        moveLeft() {
            if (!this.collides(this.currentPiece, this.currentX - 1, this.currentY)) {
                this.currentX--;
                return true;
            }
            return false;
        }

        moveRight() {
            if (!this.collides(this.currentPiece, this.currentX + 1, this.currentY)) {
                this.currentX++;
                return true;
            }
            return false;
        }

        moveDown() {
            if (!this.collides(this.currentPiece, this.currentX, this.currentY + 1)) {
                this.currentY++;
                return true;
            }
            return false;
        }

        softDrop() {
            if (!this.moveDown()) {
                this.lockPiece();
            }
        }

        lockPiece() {
            for (let r = 0; r < this.currentPiece.length; r++) {
                for (let c = 0; c < this.currentPiece[r].length; c++) {
                    if (this.currentPiece[r][c]) {
                        const y = this.currentY + r;
                        const x = this.currentX + c;
                        if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
                            this.grid[y][x] = this.currentColor;
                        }
                    }
                }
            }
            this.clearLines();
            this.spawnPiece();
        }

        clearLines() {
            let linesCleared = 0;
            const clearedRows = [];

            for (let r = ROWS - 1; r >= 0; r--) {
                if (this.grid[r].every(cell => cell !== null)) {
                    clearedRows.push(r);
                    linesCleared++;
                }
            }

            if (linesCleared > 0) {
                // Combo system
                this.combo++;
                if (this.combo > this.maxCombo) this.maxCombo = this.combo;

                // Score with combo multiplier
                const comboMultiplier = 1 + (this.combo - 1) * 0.5;
                const baseScore = LINE_SCORES[linesCleared] || 0;
                const totalScore = Math.floor(baseScore * comboMultiplier);
                this.score += totalScore;

                // Flash animation
                this.flashRows = clearedRows;
                this.flashTime = Date.now();

                // Screen shake for tetris
                if (linesCleared >= 4) {
                    this.shakeAmount = 8;
                    this.shakeTime = Date.now();
                } else if (linesCleared >= 2) {
                    this.shakeAmount = 4;
                    this.shakeTime = Date.now();
                }

                // Show line clear popup
                showLineClear(this.playerNum, LINE_NAMES[linesCleared], linesCleared);

                // Show combo popup
                if (this.combo >= 2) {
                    showComboPop(this.playerNum, this.combo);
                }

                // Remove rows after flash
                setTimeout(() => {
                    for (const row of clearedRows.sort((a, b) => b - a)) {
                        this.grid.splice(row, 1);
                        this.grid.unshift(Array(COLS).fill(null));
                    }
                    this.flashRows = null;
                }, 200);

                this.lines += linesCleared;
                this.level = Math.floor(this.lines / 10) + 1;
                this.dropInterval = LEVEL_SPEEDS[Math.min(this.level - 1, LEVEL_SPEEDS.length - 1)];
            } else {
                // Reset combo when no lines cleared
                this.combo = 0;
            }

            this.updateUI();
        }

        updateUI() {
            document.getElementById(`score-${this.playerNum}`).textContent = this.score.toLocaleString();
            document.getElementById(`lines-${this.playerNum}`).textContent = this.lines;
            document.getElementById(`level-${this.playerNum}`).textContent = this.level;

            const comboEl = document.getElementById(`combo-${this.playerNum}`);
            const comboBox = document.getElementById(`combo-box-${this.playerNum}`);
            comboEl.textContent = this.combo;

            if (this.combo >= 2) {
                comboBox.classList.add('active');
            } else {
                comboBox.classList.remove('active');
            }
        }

        handleAction(action) {
            if (this.gameOver) return;
            switch (action) {
                case 'MOVE_LEFT': this.moveLeft(); break;
                case 'MOVE_RIGHT': this.moveRight(); break;
                case 'ROTATE': this.rotatePiece(); break;
                case 'DROP': this.softDrop(); break;
            }
        }

        update(timestamp) {
            if (this.gameOver) return;
            if (timestamp - this.lastDrop >= this.dropInterval) {
                if (!this.moveDown()) {
                    this.lockPiece();
                }
                this.lastDrop = timestamp;
            }

            // Fade shake
            if (this.shakeAmount > 0) {
                const elapsed = Date.now() - this.shakeTime;
                if (elapsed > 300) this.shakeAmount = 0;
            }
        }

        // === RENDERING ===
        draw() {
            const ctx = this.ctx;
            const bs = this.blockSize;
            const w = this.canvas.width;
            const h = this.canvas.height;

            // Apply shake
            ctx.save();
            if (this.shakeAmount > 0) {
                const sx = (Math.random() - 0.5) * this.shakeAmount;
                const sy = (Math.random() - 0.5) * this.shakeAmount;
                ctx.translate(sx, sy);
            }

            // Clear
            ctx.fillStyle = 'rgba(8, 8, 16, 0.97)';
            ctx.fillRect(0, 0, w, h);

            // Grid
            this.drawGrid(ctx, bs);

            // Locked pieces
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (this.grid[r][c]) {
                        const isFlashing = this.flashRows && this.flashRows.includes(r);
                        if (isFlashing) {
                            const elapsed = Date.now() - this.flashTime;
                            ctx.globalAlpha = Math.sin(elapsed / 25) > 0 ? 1 : 0.2;
                            // Flash white
                            this.drawBlock(ctx, c, r, '#ffffff', bs);
                            ctx.globalAlpha = 1;
                        } else {
                            this.drawBlock(ctx, c, r, this.grid[r][c], bs);
                        }
                    }
                }
            }

            // Ghost piece
            if (this.currentPiece && !this.gameOver) {
                this.drawGhost(ctx, bs);
            }

            // Current piece
            if (this.currentPiece && !this.gameOver) {
                for (let r = 0; r < this.currentPiece.length; r++) {
                    for (let c = 0; c < this.currentPiece[r].length; c++) {
                        if (this.currentPiece[r][c]) {
                            this.drawBlock(ctx, this.currentX + c, this.currentY + r, this.currentColor, bs);
                        }
                    }
                }
            }

            // Game over overlay
            if (this.gameOver) {
                ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
                ctx.fillRect(0, 0, w, h);
                ctx.font = `${bs * 0.7}px "Press Start 2P"`;
                ctx.fillStyle = '#ff3355';
                ctx.textAlign = 'center';
                ctx.fillText('GAME', w / 2, h / 2 - bs * 0.6);
                ctx.fillText('OVER', w / 2, h / 2 + bs * 0.6);
            }

            ctx.restore();
        }

        drawGrid(ctx, bs) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.lineWidth = 0.5;
            for (let r = 0; r <= ROWS; r++) {
                ctx.beginPath();
                ctx.moveTo(0, r * bs);
                ctx.lineTo(COLS * bs, r * bs);
                ctx.stroke();
            }
            for (let c = 0; c <= COLS; c++) {
                ctx.beginPath();
                ctx.moveTo(c * bs, 0);
                ctx.lineTo(c * bs, ROWS * bs);
                ctx.stroke();
            }
        }

        drawBlock(ctx, x, y, color, bs) {
            const px = x * bs;
            const py = y * bs;
            const inset = 1;

            // Main fill
            ctx.fillStyle = color;
            ctx.fillRect(px + inset, py + inset, bs - inset * 2, bs - inset * 2);

            // Inner highlight (top + left)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(px + inset, py + inset, bs - inset * 2, 2);
            ctx.fillRect(px + inset, py + inset, 2, bs - inset * 2);

            // Inner shadow (bottom + right)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(px + inset, py + bs - inset - 2, bs - inset * 2, 2);
            ctx.fillRect(px + bs - inset - 2, py + inset, 2, bs - inset * 2);
        }

        drawGhost(ctx, bs) {
            let ghostY = this.currentY;
            while (!this.collides(this.currentPiece, this.currentX, ghostY + 1)) {
                ghostY++;
            }
            if (ghostY === this.currentY) return;

            for (let r = 0; r < this.currentPiece.length; r++) {
                for (let c = 0; c < this.currentPiece[r].length; c++) {
                    if (this.currentPiece[r][c]) {
                        const px = (this.currentX + c) * bs;
                        const py = (ghostY + r) * bs;
                        ctx.strokeStyle = this.currentColor;
                        ctx.globalAlpha = 0.2;
                        ctx.lineWidth = 1;
                        ctx.strokeRect(px + 3, py + 3, bs - 6, bs - 6);
                        ctx.globalAlpha = 1;
                    }
                }
            }
        }

        drawNext() {
            const ctx = this.nextCtx;
            const canvas = this.nextCanvas;
            const nbs = 18;
            ctx.fillStyle = 'rgba(8, 8, 16, 0.97)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (!this.nextPieceType) return;
            const piece = TETROMINOES[this.nextPieceType];
            const shape = piece.shape;
            const color = piece.color;

            const offsetX = (canvas.width - shape[0].length * nbs) / 2;
            const offsetY = (canvas.height - shape.length * nbs) / 2;

            for (let r = 0; r < shape.length; r++) {
                for (let c = 0; c < shape[r].length; c++) {
                    if (shape[r][c]) {
                        const px = offsetX + c * nbs;
                        const py = offsetY + r * nbs;
                        ctx.fillStyle = color;
                        ctx.fillRect(px + 1, py + 1, nbs - 2, nbs - 2);
                        ctx.fillStyle = 'rgba(255,255,255,0.2)';
                        ctx.fillRect(px + 1, py + 1, nbs - 2, 2);
                    }
                }
            }
        }
    }

    // === FLOATING EFFECTS ===
    function showLineClear(playerNum, text, count) {
        const canvas = document.getElementById(`board-${playerNum}`);
        const rect = canvas.getBoundingClientRect();

        const el = document.createElement('div');
        el.className = 'line-clear-text';
        el.textContent = text;
        el.style.top = `${rect.top + rect.height / 2}px`;

        const colors = { 1: '#00e5ff', 2: '#00ff88', 3: '#ff8800', 4: '#ff3355' };
        el.style.color = colors[count] || '#fff';
        el.style.textShadow = `0 0 15px ${colors[count] || '#fff'}`;

        if (playerNum === 1) {
            el.style.left = `${rect.right + 10}px`;
        } else {
            el.style.right = `${window.innerWidth - rect.left + 10}px`;
        }

        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    }

    function showComboPop(playerNum, combo) {
        const canvas = document.getElementById(`board-${playerNum}`);
        const rect = canvas.getBoundingClientRect();

        const el = document.createElement('div');
        el.className = 'combo-pop';
        el.textContent = `${combo}× COMBO!`;
        el.style.left = `${rect.left + rect.width / 2 - 60}px`;
        el.style.top = `${rect.top + rect.height / 3}px`;
        el.style.color = combo >= 5 ? '#ff3355' : combo >= 3 ? '#ff8800' : '#ffdd00';
        el.style.textShadow = `0 0 20px ${el.style.color}`;
        el.style.fontSize = `${Math.min(1.5 + combo * 0.1, 2.5)}rem`;

        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1200);
    }

    // === GESTURE INDICATORS ===
    const gestureIcons = {
        'MOVE_LEFT': '👈 LEFT',
        'MOVE_RIGHT': '☝️ RIGHT',
        'ROTATE': '🤙 ROTATE',
        'DROP': '✋ DROP'
    };

    function showGestureIndicator(playerNum, action) {
        const el = document.getElementById(`gesture-ind-${playerNum}`);
        if (el) {
            el.textContent = gestureIcons[action] || action;
            el.classList.add('show');
            clearTimeout(el._timeout);
            el._timeout = setTimeout(() => el.classList.remove('show'), 400);
        }
    }

    // === GAME MANAGER ===
    let board1, board2;
    let gameRunning = false;

    function init() {
        board1 = new TetrisBoard(1);

        if (gameMode === '2p') {
            board2 = new TetrisBoard(2);
        } else {
            // Single player: hide player 2 elements and VS divider
            const p2Board = document.getElementById('player2-board');
            if (p2Board) p2Board.style.display = 'none';
            const vsDivider = document.querySelector('.vs-divider');
            if (vsDivider) vsDivider.style.display = 'none';
            // Center player 1 board
            const gameArea = document.querySelector('.game-area');
            if (gameArea) {
                gameArea.style.gridTemplateColumns = '1fr';
                gameArea.style.justifyItems = 'center';
            }
            // Update header for solo mode
            const header = document.querySelector('.game-logo h1');
            if (header) header.textContent = 'GASTRO TETRIS — SOLO';
        }

        // Handle resize
        window.addEventListener('resize', () => {
            if (board1) board1.resize();
            if (board2) board2.resize();
        });

        // Socket events
        socket.on('gesture', (data) => {
            if (!gameRunning) return;
            if (gameMode === '1p') {
                // In single player, all gestures go to board1
                board1.handleAction(data.action);
                showGestureIndicator(1, data.action);
            } else {
                const board = data.playerNum === 1 ? board1 : board2;
                board.handleAction(data.action);
                showGestureIndicator(data.playerNum, data.action);
            }
        });

        socket.on('player-disconnected', (data) => {
            console.log(`Player ${data.playerNum} disconnected`);
        });

        // Keyboard fallback
        document.addEventListener('keydown', (e) => {
            if (!gameRunning) return;
            // Arrows always control board 1
            switch (e.key) {
                case 'ArrowLeft': board1.handleAction('MOVE_LEFT'); showGestureIndicator(1, 'MOVE_LEFT'); break;
                case 'ArrowRight': board1.handleAction('MOVE_RIGHT'); showGestureIndicator(1, 'MOVE_RIGHT'); break;
                case 'ArrowUp': board1.handleAction('ROTATE'); showGestureIndicator(1, 'ROTATE'); break;
                case 'ArrowDown': board1.handleAction('DROP'); showGestureIndicator(1, 'DROP'); break;
            }
            // WASD only for player 2 in 2P mode
            if (gameMode === '2p' && board2) {
                switch (e.key.toLowerCase()) {
                    case 'a': board2.handleAction('MOVE_LEFT'); showGestureIndicator(2, 'MOVE_LEFT'); break;
                    case 'd': board2.handleAction('MOVE_RIGHT'); showGestureIndicator(2, 'MOVE_RIGHT'); break;
                    case 'w': board2.handleAction('ROTATE'); showGestureIndicator(2, 'ROTATE'); break;
                    case 's': board2.handleAction('DROP'); showGestureIndicator(2, 'DROP'); break;
                }
            }
        });

        // CRITICAL: Rejoin session as laptop (socket from lobby disconnected during navigation)
        if (sessionId) {
            console.log(`[Tetris] Rejoining session ${sessionId} as laptop (mode: ${gameMode})...`);
            socket.emit('rejoin-laptop', { sessionId }, (response) => {
                if (response && response.error) {
                    console.error('[Tetris] Failed to rejoin session:', response.error);
                    alert('Session expired! Redirecting to lobby...');
                    window.location.href = 'index.html';
                    return;
                }
                console.log(`[Tetris] Rejoined session ${sessionId}. State: ${response.state}, Players: ${response.players.length}`);
                // Instructions are already visible, wait for READY click
            });
        } else {
            console.warn('[Tetris] No session ID — starting in standalone mode');
            // Instructions are already visible, wait for READY click
        }
    }

    // Global function for instruction dismiss button
    window.dismissInstructions = function () {
        document.getElementById('instruction-overlay').classList.add('hidden');
        document.getElementById('countdown-overlay').style.display = 'flex';
        startCountdown();
    };

    function startCountdown() {
        const overlay = document.getElementById('countdown-overlay');
        const text = document.getElementById('countdown-text');
        let count = 3;

        const interval = setInterval(() => {
            if (count > 0) {
                text.textContent = count;
                text.style.color = 'var(--accent-cyan)';
                text.style.animation = 'none';
                text.offsetHeight;
                text.style.animation = 'countPulse 1s ease-in-out';
                count--;
            } else {
                text.textContent = 'GO!';
                text.style.color = 'var(--accent-green)';
                text.style.animation = 'none';
                text.offsetHeight;
                text.style.animation = 'countPulse 1s ease-in-out';

                setTimeout(() => {
                    overlay.style.display = 'none';
                    gameRunning = true;
                    board1.lastDrop = performance.now();
                    if (board2) board2.lastDrop = performance.now();
                    gameLoop(performance.now());
                }, 600);

                clearInterval(interval);
            }
        }, 1000);
    }

    function gameLoop(timestamp) {
        if (!gameRunning) return;
        board1.update(timestamp);
        board1.draw();

        if (gameMode === '2p' && board2) {
            board2.update(timestamp);
            board2.draw();
        }

        // Check game over
        if (gameMode === '1p') {
            if (board1.gameOver) {
                endGame();
                return;
            }
        } else {
            if (board1.gameOver || board2.gameOver) {
                endGame();
                return;
            }
        }

        requestAnimationFrame(gameLoop);
    }

    function endGame() {
        gameRunning = false;

        const overlay = document.getElementById('game-over-overlay');
        const winnerText = document.getElementById('winner-text');

        document.getElementById('final-score-1').textContent = board1.score.toLocaleString();

        if (gameMode === '1p') {
            // Single player — show personal best style
            winnerText.textContent = 'GAME OVER!';
            winnerText.className = 'winner';
            winnerText.style.color = 'var(--accent-cyan)';

            // Hide P2 score
            const p2ScoreEl = document.getElementById('final-score-2');
            if (p2ScoreEl) p2ScoreEl.parentElement.style.display = 'none';

            const statsEl = document.getElementById('final-stats');
            statsEl.innerHTML = `
              <div class="final-stat">
                <div class="fst-label">LINES</div>
                <div class="fst-value">${board1.lines}</div>
              </div>
              <div class="final-stat">
                <div class="fst-label">LEVEL</div>
                <div class="fst-value">${board1.level}</div>
              </div>
              <div class="final-stat">
                <div class="fst-label">MAX COMBO</div>
                <div class="fst-value">${board1.maxCombo}×</div>
              </div>
              <div class="final-stat">
                <div class="fst-label">PIECES</div>
                <div class="fst-value">${board1.totalPieces}</div>
              </div>
            `;
        } else {
            // Two player — winner determination
            document.getElementById('final-score-2').textContent = board2.score.toLocaleString();

            if (board1.gameOver && board2.gameOver) {
                if (board1.score > board2.score) {
                    winnerText.textContent = 'PLAYER 1 WINS!';
                    winnerText.className = 'winner p1-win';
                } else if (board2.score > board1.score) {
                    winnerText.textContent = 'PLAYER 2 WINS!';
                    winnerText.className = 'winner p2-win';
                } else {
                    winnerText.textContent = "IT'S A TIE!";
                    winnerText.style.color = 'var(--accent-yellow)';
                }
            } else if (board1.gameOver) {
                winnerText.textContent = 'PLAYER 2 WINS!';
                winnerText.className = 'winner p2-win';
            } else {
                winnerText.textContent = 'PLAYER 1 WINS!';
                winnerText.className = 'winner p1-win';
            }

            const statsEl = document.getElementById('final-stats');
            statsEl.innerHTML = `
              <div class="final-stat">
                <div class="fst-label">P1 LINES</div>
                <div class="fst-value">${board1.lines}</div>
              </div>
              <div class="final-stat">
                <div class="fst-label">P1 MAX COMBO</div>
                <div class="fst-value">${board1.maxCombo}×</div>
              </div>
              <div class="final-stat">
                <div class="fst-label">P1 PIECES</div>
                <div class="fst-value">${board1.totalPieces}</div>
              </div>
              <div class="final-stat" style="border-left: 1px solid rgba(255,255,255,0.1); padding-left: 40px;">
                <div class="fst-label">P2 LINES</div>
                <div class="fst-value">${board2.lines}</div>
              </div>
              <div class="final-stat">
                <div class="fst-label">P2 MAX COMBO</div>
                <div class="fst-value">${board2.maxCombo}×</div>
              </div>
              <div class="final-stat">
                <div class="fst-label">P2 PIECES</div>
                <div class="fst-value">${board2.totalPieces}</div>
              </div>
            `;

            board2.draw();
        }

        board1.draw();
        overlay.classList.add('visible');

        socket.emit('game-over', {
            scores: { 1: board1.score, 2: board2 ? board2.score : 0 },
            winner: board2 ? (board1.score >= board2.score ? 1 : 2) : 1
        });
    }

    // === INIT ===
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
