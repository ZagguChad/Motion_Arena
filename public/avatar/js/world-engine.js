/**
 * Virtual World Engine
 * 2D parallax scrolling world with themed environments and action mapping.
 */

class WorldEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;

        // World state
        this.theme = 'fantasy'; // fantasy, space, dojo, jungle
        this.scrollX = 0;
        this.scrollSpeed = 0;
        this.running = false;

        // Player
        this.playerAction = 'idle';
        this.playerY = 0;
        this.playerVelY = 0;

        // Entities
        this.enemies = [];
        this.particles = [];
        this.obstacles = [];
        this.pickups = [];
        this.lastSpawnTime = 0;

        // Stats
        this.xp = 0;
        this.level = 1;
        this.xpToNext = 100;
        this.score = 0;
        this.combo = 0;
        this.achievements = [];
        this.unlockedSkills = {};

        // Theme configurations
        this.themes = {
            fantasy: {
                name: '🏯 Fantasy Kingdom',
                bgColors: ['#1a0f2e', '#2a1a4e', '#3d2266'],
                groundColor: '#2d5a27',
                groundDetail: '#1e3d1a',
                entityTypes: ['🐉', '🦇', '👹', '🧟'],
                pickupTypes: ['⭐', '💎', '🍄'],
                description: 'Fight monsters with push-ups!'
            },
            space: {
                name: '🚀 Space Mission',
                bgColors: ['#000011', '#000022', '#0a0a2e'],
                groundColor: '#333355',
                groundDetail: '#222244',
                entityTypes: ['👾', '🛸', '☄️', '🤖'],
                pickupTypes: ['⭐', '🔋', '🛡️'],
                description: 'Squats power the spaceship!'
            },
            dojo: {
                name: '🥋 Martial Arts Dojo',
                bgColors: ['#1a0a00', '#2a1500', '#3d2200'],
                groundColor: '#8B7355',
                groundDetail: '#6B5335',
                entityTypes: ['🥷', '👊', '🦾', '🏴‍☠️'],
                pickupTypes: ['⭐', '🍵', '📿'],
                description: 'Shadow boxing for combat!'
            },
            jungle: {
                name: '🧗 Jungle Survival',
                bgColors: ['#0a1a0a', '#0f2a0f', '#1a3d1a'],
                groundColor: '#4a3728',
                groundDetail: '#3a2718',
                entityTypes: ['🐍', '🦂', '🕷️', '🐊'],
                pickupTypes: ['⭐', '🍌', '💧'],
                description: 'Climb to escape danger!'
            }
        };
    }

    setTheme(theme) {
        if (this.themes[theme]) {
            this.theme = theme;
        }
    }

    start() {
        this.running = true;
        this.loop();
    }

    stop() {
        this.running = false;
    }

    loop() {
        if (!this.running) return;
        this.update();
        this.render();
        requestAnimationFrame(() => this.loop());
    }

    // Action mapping from sensor input
    setAction(action) {
        const prevAction = this.playerAction;
        this.playerAction = action;

        switch (action) {
            case 'squat': // attack
                this.attackNearbyEnemy();
                break;
            case 'jump': // fly/jump
                this.playerVelY = -12;
                break;
            case 'plank': // shield
                // Shield is passive
                break;
            case 'run': // explore
                this.scrollSpeed = 4;
                break;
            case 'idle':
                this.scrollSpeed = 1;
                break;
        }
    }

    attackNearbyEnemy() {
        const attackRange = 100;
        const playerX = this.width * 0.3;
        const playerBaseY = this.height - 120 + this.playerY;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const dx = Math.abs(e.x - this.scrollX - playerX);
            const dy = Math.abs(e.y - playerBaseY);
            if (dx < attackRange && dy < attackRange) {
                // Destroy enemy
                this.spawnParticles(e.x - this.scrollX, e.y, 8, '#ff6644');
                this.enemies.splice(i, 1);
                this.xp += 20;
                this.score += 50 * (1 + this.combo * 0.1);
                this.combo++;
                this.checkLevelUp();
                break;
            }
        }
    }

    checkLevelUp() {
        if (this.xp >= this.xpToNext) {
            this.level++;
            this.xp -= this.xpToNext;
            this.xpToNext = Math.floor(this.xpToNext * 1.5);

            // Unlock skills
            if (this.level === 3) {
                this.unlockedSkills.stamina_aura = true;
                this.achievements.push('Stamina Aura Unlocked!');
            }
            if (this.level === 5) {
                this.unlockedSkills.speed_boost = true;
                this.achievements.push('Speed Boost Unlocked!');
            }
            if (this.level === 8) {
                this.unlockedSkills.agility_mode = true;
                this.achievements.push('Agility Mode Unlocked!');
            }

            this.spawnParticles(this.width * 0.3, this.height - 120, 20, '#ffd700');
        }
    }

    update() {
        // Scroll world
        this.scrollX += this.scrollSpeed;

        // Player gravity
        this.playerVelY += 0.6;
        this.playerY += this.playerVelY;
        if (this.playerY > 0) {
            this.playerY = 0;
            this.playerVelY = 0;
        }

        // Spawn enemies
        if (Date.now() - this.lastSpawnTime > 3000) {
            this.spawnEnemy();
            this.lastSpawnTime = Date.now();
        }

        // Spawn pickups
        if (Math.random() < 0.005) {
            this.spawnPickup();
        }

        // Update enemies
        for (const e of this.enemies) {
            e.x -= this.scrollSpeed * 0.3; // enemies move slower
        }

        // Update pickups
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const p = this.pickups[i];
            const px = p.x - this.scrollX;
            const playerX = this.width * 0.3;
            if (Math.abs(px - playerX) < 40 && Math.abs(p.y - (this.height - 120 + this.playerY)) < 40) {
                this.xp += 10;
                this.score += 25;
                this.spawnParticles(px, p.y, 5, '#ffd700');
                this.pickups.splice(i, 1);
                this.checkLevelUp();
            }
        }

        // Update particles
        this.particles = this.particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;
            p.life--;
            return p.life > 0;
        });

        // Reset combo if idle
        if (this.playerAction === 'idle') {
            this.combo = Math.max(0, this.combo - 0.02);
        }

        // Clean offscreen enemies
        this.enemies = this.enemies.filter(e => e.x - this.scrollX > -200);
    }

    render() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const t = this.themes[this.theme];

        // Background layers (parallax)
        t.bgColors.forEach((color, i) => {
            ctx.fillStyle = color;
            const layerH = h * 0.4;
            const y = h * 0.15 * i;
            ctx.fillRect(0, y, w, layerH);
        });

        // Stars/particles for space theme
        if (this.theme === 'space') {
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 50; i++) {
                const sx = ((i * 97 + this.scrollX * 0.1) % w + w) % w;
                const sy = (i * 43) % (h * 0.7);
                const size = (i % 3 === 0) ? 2 : 1;
                ctx.fillRect(sx, sy, size, size);
            }
        }

        // Mountains/trees (mid-ground parallax)
        this._drawMidground(ctx, w, h, t);

        // Ground
        ctx.fillStyle = t.groundColor;
        ctx.fillRect(0, h - 60, w, 60);
        // Ground detail
        ctx.fillStyle = t.groundDetail;
        for (let x = 0; x < w; x += 30) {
            const gx = ((x + this.scrollX * 0.5) % 30);
            ctx.fillRect(x - gx, h - 60, 15, 3);
        }

        // Enemies
        ctx.font = '32px serif';
        ctx.textAlign = 'center';
        for (const e of this.enemies) {
            const ex = e.x - this.scrollX;
            if (ex > -50 && ex < w + 50) {
                ctx.fillText(e.type, ex, e.y);
                // Health bar
                ctx.fillStyle = '#ff3355';
                ctx.fillRect(ex - 15, e.y - 40, 30, 4);
                ctx.fillStyle = '#00ff88';
                ctx.fillRect(ex - 15, e.y - 40, 30 * (e.hp / e.maxHp), 4);
            }
        }

        // Pickups
        ctx.font = '24px serif';
        for (const p of this.pickups) {
            const px = p.x - this.scrollX;
            if (px > -50 && px < w + 50) {
                ctx.fillText(p.type, px, p.y + Math.sin(Date.now() * 0.003 + p.x) * 5);
            }
        }

        // Particles
        for (const p of this.particles) {
            ctx.globalAlpha = p.life / 30;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        // UI Overlay
        this._drawUI(ctx, w, h);
    }

    _drawMidground(ctx, w, h, theme) {
        ctx.fillStyle = theme.bgColors[2] || theme.bgColors[1];
        // Procedural hills
        for (let x = 0; x < w + 100; x += 80) {
            const mx = ((x + this.scrollX * 0.3) % (w + 200)) - 100;
            const mh = 40 + Math.sin(mx * 0.02) * 30;
            ctx.beginPath();
            ctx.arc(mx, h - 60, mh, Math.PI, 0);
            ctx.fill();
        }
    }

    _drawUI(ctx, w, h) {
        // XP Bar
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(10, 10, 200, 20);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(10, 10, 200 * (this.xp / this.xpToNext), 20);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.strokeRect(10, 10, 200, 20);

        // Level
        ctx.fillStyle = '#fff';
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`LVL ${this.level}`, 15, 25);

        // Score
        ctx.textAlign = 'right';
        ctx.fillText(`SCORE: ${Math.floor(this.score)}`, w - 15, 25);

        // Combo
        if (this.combo > 1) {
            ctx.fillStyle = '#ff6644';
            ctx.textAlign = 'center';
            ctx.font = '14px "Press Start 2P", monospace';
            ctx.fillText(`${Math.floor(this.combo)}x COMBO!`, w / 2, 25);
        }

        // Action indicator
        const actionIcons = {
            idle: '🧍', squat: '⚔️', jump: '🦅', plank: '🛡️', run: '🏃', climb: '🧗'
        };
        ctx.font = '28px serif';
        ctx.textAlign = 'left';
        ctx.fillText(actionIcons[this.playerAction] || '🧍', 10, h - 15);

        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(this.playerAction.toUpperCase(), 45, h - 18);

        // Achievement toasts
        if (this.achievements.length > 0) {
            const ach = this.achievements[this.achievements.length - 1];
            ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`🏆 ${ach}`, w / 2, 55);
        }
    }

    spawnEnemy() {
        const t = this.themes[this.theme];
        const types = t.entityTypes;
        this.enemies.push({
            type: types[Math.floor(Math.random() * types.length)],
            x: this.scrollX + this.width + 100,
            y: this.height - 80 - Math.random() * 60,
            hp: 1 + this.level * 0.5,
            maxHp: 1 + this.level * 0.5,
            speed: 1 + Math.random()
        });
    }

    spawnPickup() {
        const t = this.themes[this.theme];
        const types = t.pickupTypes;
        this.pickups.push({
            type: types[Math.floor(Math.random() * types.length)],
            x: this.scrollX + this.width + 50,
            y: this.height - 100 - Math.random() * 80
        });
    }

    spawnParticles(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 1) * 5,
                size: 2 + Math.random() * 3,
                color,
                life: 20 + Math.floor(Math.random() * 20)
            });
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WorldEngine };
}
