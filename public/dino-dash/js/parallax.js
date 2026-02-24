// ============================================
// PARALLAX.JS — Layered Background using Oak Woods Assets
// ============================================

export class ParallaxBackground {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.groundY = Math.floor(h * 0.78);
        this.loaded = false;

        // Layer config: [image path, scroll speed multiplier]
        this.layerDefs = [
            { src: '/dino-dash/assets/background_layer_1.png', speed: 0.1 },  // far sky/fog
            { src: '/dino-dash/assets/background_layer_2.png', speed: 0.3 },  // mid trees
            { src: '/dino-dash/assets/background_layer_3.png', speed: 0.5 },  // close trees
        ];

        this.layers = [];
        this.tilesetImg = null;
        this.groundTileReady = false;

        // Ground layer tile buffer (built from tileset)
        this.groundBuffer = null;
        this.groundScrollX = 0;
        this.groundSpeed = 1.0;
    }

    async loadAssets() {
        // Load parallax background images
        const loadImg = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${src}`));
            img.src = src;
        });

        const images = await Promise.all(this.layerDefs.map(def => loadImg(def.src)));

        this.layers = images.map((img, i) => ({
            img: img,
            scrollX: 0,
            speed: this.layerDefs[i].speed,
            // Image natural size (320×180); we'll scale to fill canvas height
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight
        }));

        // Load tileset for ground
        try {
            this.tilesetImg = await loadImg('/dino-dash/assets/oak_woods_tileset.png');
            this.buildGroundBuffer();
            this.groundTileReady = true;
        } catch (e) {
            console.warn('Tileset not loaded, using solid ground');
        }

        this.loaded = true;
    }

    buildGroundBuffer() {
        // Build a ground strip from tileset tiles
        // The tileset is 504×360. The ground middle tiles are approx at (0, 288) sized 24×24
        // We'll pick a nice repeating ground tile row
        const tileSize = 24;
        const groundHeight = this.h - this.groundY; // pixels below ground line
        const tilesNeeded = Math.ceil(this.w / tileSize) + 2;

        const buf = document.createElement('canvas');
        buf.width = tilesNeeded * tileSize;
        buf.height = groundHeight + 8; // extra for surface
        const ctx = buf.getContext('2d');

        // Surface tiles (grass-topped ground) — tileset row ~12, col 0-1
        // The top of ground with grass edge is around (0, 288) in the tileset
        const surfaceSX = 0;
        const surfaceSY = 288;

        // Fill tiles — solid dirt below surface at (0, 312)
        const fillSX = 0;
        const fillSY = 312;

        for (let i = 0; i < tilesNeeded; i++) {
            const dx = i * tileSize;
            // Draw surface tile (top row)
            ctx.drawImage(this.tilesetImg, surfaceSX, surfaceSY, tileSize, tileSize, dx, 0, tileSize, tileSize);
            // Fill below with dirt tiles
            for (let row = 1; row * tileSize < buf.height; row++) {
                ctx.drawImage(this.tilesetImg, fillSX, fillSY, tileSize, tileSize, dx, row * tileSize, tileSize, tileSize);
            }
        }

        this.groundBuffer = buf;
        this.groundTileWidth = buf.width;
    }

    getGroundY() {
        return this.groundY;
    }

    update(speed) {
        for (const layer of this.layers) {
            layer.scrollX += speed * layer.speed;
        }
        this.groundScrollX += speed * this.groundSpeed;
    }

    draw(ctx) {
        if (!this.loaded) {
            // Fallback: solid dark bg
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, this.w, this.h);
            // Ground line
            ctx.fillStyle = '#4a4a5e';
            ctx.fillRect(0, this.groundY, this.w, 3);
            ctx.fillStyle = '#2a2a3a';
            ctx.fillRect(0, this.groundY + 3, this.w, this.h - this.groundY);
            return;
        }

        // Draw each parallax layer, scaled to fill entire canvas
        for (const layer of this.layers) {
            // Scale image to fill canvas height, maintaining aspect ratio
            const scale = this.h / layer.naturalH;
            const drawW = layer.naturalW * scale;
            const drawH = this.h;

            // Wrap scroll
            const sx = layer.scrollX % drawW;

            // Draw enough copies to fill width
            let x = -sx;
            while (x < this.w) {
                ctx.drawImage(layer.img, x, 0, drawW, drawH);
                x += drawW;
            }
        }

        // Draw tiled ground layer
        if (this.groundTileReady && this.groundBuffer) {
            const sx = this.groundScrollX % this.groundTileWidth;
            let x = -sx;
            while (x < this.w) {
                ctx.drawImage(this.groundBuffer, x, this.groundY);
                x += this.groundTileWidth;
            }
        } else {
            // Fallback ground
            ctx.fillStyle = '#4a4a5e';
            ctx.fillRect(0, this.groundY, this.w, 3);
            ctx.fillStyle = '#2a2a3a';
            ctx.fillRect(0, this.groundY + 3, this.w, this.h - this.groundY);
        }
    }
}
