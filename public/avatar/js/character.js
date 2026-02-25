/**
 * Character Renderer — Pixel Art Canvas Engine
 * Draws customizable characters with animation states.
 */

class CharacterRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.scale = options.scale || 4;
        this.x = options.x || 0;
        this.y = options.y || 0;

        // Character config
        this.config = {
            bodyType: 'balanced',  // slim, balanced, athletic
            hairStyle: 'spiky',    // spiky, short, long, mohawk, ponytail, bun, afro, bald
            outfit: 'sporty',      // sporty, ninja, scifi, knight, casual
            accessory: 'none',     // headband, wristband, cape, none
            powerType: 'strength', // strength, speed, balance, endurance
            skinTone: '#c8956c',
            hairColor: '#2d1b00',
            outfitColor: '#00e5ff'
        };

        // Animation
        this.frame = 0;
        this.animState = 'idle'; // idle, attack, fly, shield, run, climb
        this.animTimer = 0;

        // Skill effects
        this.effects = [];
        this.xp = 0;
        this.level = 1;
    }

    setConfig(config) {
        Object.assign(this.config, config);
    }

    setState(state) {
        if (this.animState !== state) {
            this.animState = state;
            this.frame = 0;
        }
    }

    addEffect(type) {
        this.effects.push({ type, timer: 60, alpha: 1 });
    }

    update() {
        this.animTimer++;
        if (this.animTimer % 8 === 0) {
            this.frame = (this.frame + 1) % 4;
        }

        // Update effects
        this.effects = this.effects.filter(e => {
            e.timer--;
            e.alpha = e.timer / 60;
            return e.timer > 0;
        });
    }

    draw(x, y) {
        const ctx = this.ctx;
        const s = this.scale;
        const px = x || this.x;
        const py = y || this.y;

        ctx.save();
        ctx.translate(px, py);

        // Body offset for animations
        let bodyOffsetY = 0;
        let armAngle = 0;
        let legSpread = 0;

        switch (this.animState) {
            case 'idle':
                bodyOffsetY = Math.sin(this.animTimer * 0.05) * 2;
                break;
            case 'attack':
                armAngle = Math.sin(this.frame * Math.PI / 2) * 30;
                bodyOffsetY = -Math.abs(Math.sin(this.frame * Math.PI / 2)) * 4;
                break;
            case 'fly':
                bodyOffsetY = -10 + Math.sin(this.animTimer * 0.08) * 6;
                armAngle = 45;
                break;
            case 'shield':
                armAngle = 90;
                break;
            case 'run':
                legSpread = Math.sin(this.animTimer * 0.15) * 4;
                bodyOffsetY = Math.abs(Math.sin(this.animTimer * 0.15)) * -3;
                break;
            case 'climb':
                armAngle = 60 + Math.sin(this.animTimer * 0.1) * 30;
                bodyOffsetY = Math.sin(this.animTimer * 0.1) * 3;
                break;
        }

        ctx.translate(0, bodyOffsetY);

        // === LEGS ===
        this._drawLegs(ctx, s, legSpread);

        // === BODY ===
        this._drawBody(ctx, s);

        // === ARMS ===
        this._drawArms(ctx, s, armAngle);

        // === HEAD ===
        this._drawHead(ctx, s);

        // === HAIR ===
        this._drawHair(ctx, s);

        // === ACCESSORY ===
        this._drawAccessory(ctx, s);

        // === EFFECTS ===
        this._drawEffects(ctx, s);

        ctx.restore();
    }

    _drawLegs(ctx, s, spread) {
        const outfitColors = this._getOutfitColors();
        ctx.fillStyle = outfitColors.pants;

        // Left leg
        ctx.fillRect(-3 * s - spread, 8 * s, 2.5 * s, 6 * s);
        // Right leg
        ctx.fillRect(0.5 * s + spread, 8 * s, 2.5 * s, 6 * s);

        // Boots
        ctx.fillStyle = outfitColors.boots;
        ctx.fillRect(-3.5 * s - spread, 13 * s, 3.5 * s, 2 * s);
        ctx.fillRect(0 * s + spread, 13 * s, 3.5 * s, 2 * s);
    }

    _drawBody(ctx, s) {
        const outfitColors = this._getOutfitColors();
        const bodyWidth = this.config.bodyType === 'slim' ? 7 : this.config.bodyType === 'athletic' ? 9 : 8;
        const hw = bodyWidth / 2;

        // Torso
        ctx.fillStyle = outfitColors.main;
        ctx.fillRect(-hw * s, -2 * s, bodyWidth * s, 10 * s);

        // Belt / detail stripe
        ctx.fillStyle = outfitColors.accent;
        ctx.fillRect(-hw * s, 5 * s, bodyWidth * s, 1.5 * s);
    }

    _drawArms(ctx, s, angle) {
        const outfitColors = this._getOutfitColors();
        ctx.fillStyle = this.config.skinTone;

        ctx.save();
        // Left arm
        ctx.save();
        ctx.translate(-4.5 * s, -1 * s);
        ctx.rotate((-angle * Math.PI) / 180);
        ctx.fillStyle = outfitColors.main;
        ctx.fillRect(-1 * s, 0, 2 * s, 5 * s);
        ctx.fillStyle = this.config.skinTone;
        ctx.fillRect(-1 * s, 5 * s, 2 * s, 2.5 * s); // hand
        ctx.restore();

        // Right arm
        ctx.save();
        ctx.translate(4.5 * s, -1 * s);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.fillStyle = outfitColors.main;
        ctx.fillRect(-1 * s, 0, 2 * s, 5 * s);
        ctx.fillStyle = this.config.skinTone;
        ctx.fillRect(-1 * s, 5 * s, 2 * s, 2.5 * s); // hand
        ctx.restore();

        ctx.restore();
    }

    _drawHead(ctx, s) {
        // Head
        ctx.fillStyle = this.config.skinTone;
        ctx.fillRect(-3 * s, -9 * s, 6 * s, 7 * s);

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2 * s, -7 * s, 1.5 * s, 1.5 * s);
        ctx.fillRect(0.5 * s, -7 * s, 1.5 * s, 1.5 * s);
        ctx.fillStyle = '#111';
        ctx.fillRect(-1.5 * s, -6.5 * s, 1 * s, 1 * s);
        ctx.fillRect(1 * s, -6.5 * s, 1 * s, 1 * s);

        // Mouth (slight smile)
        ctx.fillStyle = '#111';
        ctx.fillRect(-1 * s, -4 * s, 2 * s, 0.5 * s);
    }

    _drawHair(ctx, s) {
        ctx.fillStyle = this.config.hairColor;

        switch (this.config.hairStyle) {
            case 'spiky':
                ctx.fillRect(-3.5 * s, -12 * s, 7 * s, 3.5 * s);
                // Spikes
                ctx.fillRect(-2 * s, -14 * s, 1.5 * s, 3 * s);
                ctx.fillRect(0 * s, -15 * s, 1.5 * s, 4 * s);
                ctx.fillRect(2 * s, -13 * s, 1.5 * s, 2 * s);
                break;
            case 'short':
                ctx.fillRect(-3.5 * s, -11 * s, 7 * s, 2.5 * s);
                break;
            case 'long':
                ctx.fillRect(-3.5 * s, -11 * s, 7 * s, 3 * s);
                ctx.fillRect(-4 * s, -8 * s, 2 * s, 8 * s);
                ctx.fillRect(2 * s, -8 * s, 2 * s, 8 * s);
                break;
            case 'mohawk':
                ctx.fillRect(-1 * s, -15 * s, 2 * s, 6 * s);
                break;
            case 'ponytail':
                ctx.fillRect(-3.5 * s, -11 * s, 7 * s, 2.5 * s);
                ctx.fillRect(2 * s, -10 * s, 2 * s, 10 * s);
                break;
            case 'bun':
                ctx.fillRect(-3.5 * s, -11 * s, 7 * s, 2.5 * s);
                ctx.beginPath();
                ctx.arc(0, -12 * s, 2.5 * s, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'afro':
                ctx.beginPath();
                ctx.arc(0, -10 * s, 5 * s, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'bald':
                break;
        }
    }

    _drawAccessory(ctx, s) {
        switch (this.config.accessory) {
            case 'headband':
                ctx.fillStyle = this.config.outfitColor;
                ctx.fillRect(-3.5 * s, -8 * s, 7 * s, 1 * s);
                break;
            case 'wristband':
                ctx.fillStyle = this.config.outfitColor;
                ctx.fillRect(-6 * s, 3 * s, 1.5 * s, 1 * s);
                ctx.fillRect(4.5 * s, 3 * s, 1.5 * s, 1 * s);
                break;
            case 'cape':
                ctx.fillStyle = this.config.outfitColor;
                ctx.globalAlpha = 0.7;
                ctx.fillRect(-5 * s, -2 * s, 1.5 * s, 14 * s);
                ctx.fillRect(3.5 * s, -2 * s, 1.5 * s, 14 * s);
                ctx.fillRect(-5 * s, 10 * s, 10 * s, 2 * s);
                ctx.globalAlpha = 1;
                break;
        }
    }

    _drawEffects(ctx, s) {
        for (const effect of this.effects) {
            ctx.globalAlpha = effect.alpha;
            switch (effect.type) {
                case 'stamina_aura':
                    ctx.strokeStyle = '#00ff88';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, (20 + effect.timer * 0.3) * s / 4, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                case 'speed_boost':
                    ctx.fillStyle = '#00e5ff';
                    for (let i = 0; i < 3; i++) {
                        ctx.fillRect(
                            (-8 - i * 4) * s,
                            (Math.sin(this.animTimer * 0.1 + i) * 3 - 2) * s,
                            2 * s, 0.5 * s
                        );
                    }
                    break;
                case 'agility_mode':
                    ctx.strokeStyle = '#ff00e5';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath();
                    ctx.arc(0, 0, 15 * s / 4, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    break;
            }
            ctx.globalAlpha = 1;
        }
    }

    _getOutfitColors() {
        const outfits = {
            sporty: { main: '#2d98da', accent: '#0984e3', pants: '#2d3436', boots: '#636e72' },
            ninja: { main: '#2d3436', accent: '#636e72', pants: '#1e272e', boots: '#0a0a0a' },
            scifi: { main: '#6c5ce7', accent: '#00cec9', pants: '#2d3436', boots: '#636e72' },
            knight: { main: '#636e72', accent: '#b2bec3', pants: '#2d3436', boots: '#823723' },
            casual: { main: '#e17055', accent: '#fab1a0', pants: '#2d98da', boots: '#dfe6e9' }
        };
        return outfits[this.config.outfit] || outfits.sporty;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CharacterRenderer };
}
