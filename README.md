# ⚔ Motion Arena — Tower Siege

A **2-player push-up battle game** powered by real-time pose estimation. Do real push-ups in front of your phone camera to spawn soldiers and capture towers on a strategy map displayed on PC.

## 🎮 How It Works

1. **PC** opens the game display (`http://localhost:3000`)
2. **Phone** scans the QR code to open the mobile controller
3. Phone camera uses **MediaPipe PoseLandmarker** to detect your body
4. **Elbow angle calculation** (shoulder→elbow→wrist) counts push-ups
5. Each push-up spawns **4 soldiers** at your home base
6. Soldiers auto-deploy to capture towers on the map
7. Player with most territory when timer ends **wins!**

## 🧠 Core Pose Estimation

- **MediaPipe PoseLandmarker** — 33 body landmark detection at ~30fps
- **Elbow Angle State Machine** — EMA-smoothed (α=0.3) with UP/DOWN thresholds
- **Head Tracking** — Nose-to-shoulder yaw for manual troop targeting
- **No-Person Detection** — 5-second timeout auto-forfeit
- **Anti-Cheat** — Server rejects push-ups faster than 800ms

## 🚀 Quick Start

```bash
npm install
npm start
```

Then open `http://localhost:3000` on PC and scan the QR code with your phone.

> **Note:** Phone camera requires HTTPS. The server auto-generates self-signed certs and runs on `https://<your-ip>:3443`.

## 📁 Project Structure

```
Motion_Arena/
├── package.json
├── start_game.bat          # Windows launcher
├── server/
│   └── server.js           # Game server + WebSocket + AI opponent
└── public/
    ├── game/
    │   ├── index.html      # PC display page
    │   ├── game.js         # Canvas tower siege renderer
    │   ├── sprites.js      # Pixel art character sprites
    │   ├── story.js        # Intro cutscene animations
    │   └── style.css
    └── mobile/
        ├── index.html      # Mobile controller page
        ├── controller.js   # Pose estimation + push-up counting
        └── style.css
```

## 🎯 Game Modes

- **1v1 PvP** — Two players compete head-to-head
- **VS AI (The Horde)** — Adaptive AI that mirrors your effort

## 🛠 Tech Stack

- **MediaPipe Tasks Vision** — Pose landmark detection
- **WebSocket (ws)** — Real-time mobile ↔ PC communication
- **HTML5 Canvas** — Retro pixel-art game rendering
- **Node.js** — Game server with HTTP/HTTPS

## 📄 License

MIT
