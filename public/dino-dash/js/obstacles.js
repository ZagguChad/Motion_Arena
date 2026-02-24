// ============================================
// OBSTACLES.JS — Oak Woods Decoration-Based Obstacles
// ============================================
// Uses: rock_1/2/3.png, fence_1/2.png, sign.png, lamp.png

const OBSTACLE_DEFS = [
    // Ground obstacles — ALL must be shorter than jump arc (83px max)
    // Target: max ~55px so player clears with ~28px margin
    { name: 'rock_1', src: '/dino-dash/assets/rock_1.png', natW: 20, natH: 11, scale: 3.0, ground: true },  // 33px
    { name: 'rock_2', src: '/dino-dash/assets/rock_2.png', natW: 27, natH: 12, scale: 2.8, ground: true },  // 34px
    { name: 'rock_3', src: '/dino-dash/assets/rock_3.png', natW: 45, natH: 18, scale: 2.5, ground: true },  // 45px
    { name: 'fence_1', src: '/dino-dash/assets/fence_1.png', natW: 73, natH: 19, scale: 2.0, ground: true },// 38px
    { name: 'fence_2', src: '/dino-dash/assets/fence_2.png', natW: 72, natH: 19, scale: 2.0, ground: true },// 38px
    { name: 'sign', src: '/dino-dash/assets/sign.png', natW: 22, natH: 31, scale: 1.5, ground: true },      // 47px
];

export class ObstacleManager {
    constructor(logicalWidth) {
        this.logicalWidth = logicalWidth;
        this.obstacles = [];
        this.spawnTimer = 0;
        this.minSpawnInterval = 70;
        this.maxSpawnInterval = 140;
        this.nextSpawnAt = this.randomSpawnTime();
        this.speed = 4;

        // Image cache
        this.images = {};
        this.loaded = false;
    }

    async loadAssets() {
        const loadImg = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${src}`));
            img.src = src;
        });

        const promises = OBSTACLE_DEFS.map(async (def) => {
            try {
                const img = await loadImg(def.src);
                this.images[def.name] = img;
            } catch (e) {
                console.warn(`Obstacle asset not loaded: ${def.name}`);
            }
        });

        await Promise.all(promises);
        this.loaded = true;
    }

    randomSpawnTime() {
        return this.minSpawnInterval + Math.random() * (this.maxSpawnInterval - this.minSpawnInterval);
    }

    setDifficulty(speed) {
        this.speed = speed;
        this.minSpawnInterval = Math.max(40, 75 - speed * 2);
        this.maxSpawnInterval = Math.max(80, 145 - speed * 3);
    }

    spawn(groundY) {
        // Filter to defs that have loaded images
        const available = OBSTACLE_DEFS.filter(d => this.images[d.name]);
        if (available.length === 0) return;

        const def = available[Math.floor(Math.random() * available.length)];
        const drawW = Math.floor(def.natW * def.scale);
        const drawH = Math.floor(def.natH * def.scale);

        const obstacle = {
            def: def,
            x: this.logicalWidth + 20,
            y: groundY - drawH,
            width: drawW,
            height: drawH,
            passed: false
        };

        this.obstacles.push(obstacle);
    }

    update(groundY) {
        this.spawnTimer++;
        if (this.spawnTimer >= this.nextSpawnAt) {
            this.spawn(groundY);
            this.spawnTimer = 0;
            this.nextSpawnAt = this.randomSpawnTime();
        }

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.x -= this.speed;

            if (obs.x + obs.width < -30) {
                this.obstacles.splice(i, 1);
            }
        }
    }

    checkCollision(playerHitbox) {
        const pad = 8; // forgiving padding
        for (const obs of this.obstacles) {
            const ox = obs.x + pad;
            const oy = obs.y + pad;
            const ow = obs.width - pad * 2;
            const oh = obs.height - pad * 2;

            if (
                playerHitbox.x < ox + ow &&
                playerHitbox.x + playerHitbox.width > ox &&
                playerHitbox.y < oy + oh &&
                playerHitbox.y + playerHitbox.height > oy
            ) {
                return true;
            }
        }
        return false;
    }

    draw(ctx) {
        for (const obs of this.obstacles) {
            const img = this.images[obs.def.name];
            if (!img) continue;

            ctx.drawImage(
                img,
                Math.floor(obs.x), Math.floor(obs.y),
                obs.width, obs.height
            );
        }
    }

    reset() {
        this.obstacles = [];
        this.spawnTimer = 0;
        this.nextSpawnAt = this.randomSpawnTime();
    }
}
