# ⚔️ Knight Dash — Gyroscope Endless Runner

> **Jump in real life to make a knight dodge obstacles!**
> A standalone retro endless runner that uses your phone's gyroscope / accelerometer to detect real jumps.

---

## 🎮 How to Play

| Input | Action |
|-------|--------|
| 📱 Gyroscope | Jerk / tilt phone **UP** to jump |
| ⌨️ Keyboard | `SPACE` or `↑ Arrow` to jump |
| 🖱️ Mouse / Touch | Click or Tap anywhere |
| ⏸️ Pause | `P` or `Escape` |

- **Double jump** is supported — jump again mid-air!
- Dodge **rocks**, **cacti**, and **birds**
- Speed increases over time — how far can you go?

---

## 🚀 Launching

### Option 1 — `.bat` launcher (Windows, recommended)
Double-click **`launch_game.bat`** inside this folder.

> The .bat file auto-detects Chrome → Edge → Firefox and opens the game.

### Option 2 — Via Motion Arena server (for gyroscope on mobile)
```bash
# From the repo root
npm install
npm start
# Then open http://localhost:3000 and navigate to Knight Dash
```

### Option 3 — Manual browser
Open `index.html` directly in your browser.

> ⚠️ **Gyroscope Note**: `DeviceMotion` requires HTTPS or `localhost`.  
> For mobile gyroscope, use the Motion Arena server or a local HTTPS tool like `npx serve`.

---

## 📱 Gyroscope Setup (Mobile)

1. Open the game URL on your **phone browser** (Chrome/Safari)
2. Tap **"Enable Gyroscope Jump"** on the intro screen
3. On iOS 13+: grant motion sensor permission when prompted
4. Hold your phone **upright** (portrait mode)
5. **Jerk upward quickly** — the knight will jump!

---

## 📁 File Structure

```
KnightDash/
├── index.html       ← Main game page
├── style.css        ← Retro pixel art styles
├── game.js          ← Full game engine (canvas, gyro, input)
├── launch_game.bat  ← Windows one-click launcher
└── README.md        ← This file
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Rendering | HTML5 Canvas (pixel art, no sprites needed) |
| Physics | Custom gravity + jump engine |
| Gyroscope | `DeviceMotionEvent` Web API |
| Fonts | Google Fonts (Press Start 2P, Orbitron) |
| Storage | `localStorage` for high score |
| Server | **Not required** — fully standalone |

---

## 🎨 Game Features

- 🖼️ **Pixel art canvas rendering** — knight, obstacles, parallax mountains
- 🎆 **Particle effects** — dust on jump, explosion on death
- 🌙 **Parallax background** — stars, clouds, mountains
- 🐦 **3 obstacle types** — rocks, cacti, flying birds
- ⚡ **Speed ramp** — game gets faster over time
- 🔁 **Double jump** — jump twice in mid-air
- 💾 **High score persistence** — saved in browser localStorage
- 📊 **Live HUD** — score, high score, speed bar, jump gauge
- 📱 **Gyroscope debug bar** — shows real-time accelerometer value

---

## 🏟️ Part of Motion Arena

This game is part of the **[Motion Arena](https://github.com/ZagguChad/Motion_Arena)** platform — a gesture-controlled multiplayer gaming platform where players use their phones as motion controllers.

> Built for Hackathon — Amrita 2026
