# 🏟️ Motion Arena

**A gesture-controlled multiplayer gaming platform where players use their phones as motion controllers — no apps required.**

> Scan a QR code, connect your phone, and play cooperatively or competitively on a shared laptop screen. Motion Arena transforms any phone into a game controller using built-in sensors like cameras, accelerometers, gyroscopes, and microphones.

---

## ✨ Features

- **Zero Install** — Players scan a QR code from their phone browser. No apps needed.
- **Real-time Multiplayer** — Socket.IO powers seamless, low-latency communication.
- **Multiple Input Modes** — Hand gestures (MediaPipe), accelerometer, gyroscope, microphone, and body movement.
- **9 Unique Games** — From puzzle to fitness, solo to co-op.
- **Auto HTTPS** — Self-signed certificates generated automatically for secure sensor access on mobile.
- **LAN Play** — Works over any local network (Wi-Fi / hotspot).

---

## 🎮 Games

### 🧘 Rest Mode (Low Intensity)

| Game | Description | Players | Input |
|------|-------------|---------|-------|
| **Gastro Tetris** | Classic Tetris controlled by hand gestures — fist, point, shaka | 1–2 | ✋ Hand Gestures |
| **Ghost of the Breath Temple** | Breathe to match sacred rhythms and keep a flame alive while a ghost disrupts you | 1 | 🎤 Microphone |

### 🏃 Active Mode (High Intensity)

| Game | Description | Players | Input |
|------|-------------|---------|-------|
| **Knight Dash** | Jump in real life to make a knight dodge obstacles in a retro endless runner | 1 | 🏃 Body Movement |
| **CPR Trainer** | Practice life-saving CPR compressions with real-time feedback on rate, depth & recoil | 1 | 📱 Accelerometer |
| **Tower Siege** | Do push-ups to spawn soldiers and capture 13 towers — vs a friend or AI General | 1–2 | 💪 Push-Ups |

### 🤝 Co-op Mode (2-Player Sync)

| Game | Description | Players | Input |
|------|-------------|---------|-------|
| **Gravity Bridge** | Crouch and stand together to control a floating bridge — collect orbs, dodge obstacles | 2 | 📱 Accelerometer |
| **Balance Duel** | Each player tilts a floating shard — keep a shared crystal balanced between you | 2 | 📱 Gyroscope |

### 🎓 Student Wellness

| Game | Description | Players | Input |
|------|-------------|---------|-------|
| **Focus Mode** | 25-minute Pomodoro timer with slouch detection, movement breaks & breathing exercises | 1 | 📱 Accelerometer |
| **Plank Wars** | 60-second plank challenge on a LAN leaderboard — phone on your back measures stability | 2+ | 📱 Accelerometer |

### 📊 Tools & Insights

| Tool | Description |
|------|-------------|
| **Emotional AI Lite** | Real-time breath & tremor analysis for stress detection with adaptive difficulty recommendations |
| **Corporate Dashboard** | Team health scores, activity heatmaps, burnout risk indicators for corporate wellness programs |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Server** | Node.js + Express |
| **Real-time** | Socket.IO (WebSockets) |
| **Mobile Sensors** | Device Orientation API, Accelerometer, Microphone (Web APIs) |
| **Hand Tracking** | MediaPipe Hands (on-device ML) |
| **QR Codes** | `qrcode` npm package |
| **HTTPS** | Auto-generated self-signed certs (OpenSSL / `selfsigned`) |

---

## 📁 Project Structure

```
Motion_Arena/
├── server.js              # Main server — Express + Socket.IO + game engines
├── package.json           # Dependencies & scripts
├── start.bat              # One-click Windows launcher
├── engines/               # Server-side game logic
│   ├── cpr-engine.js      # CPR Trainer simulation engine
│   ├── tower-siege-engine.js  # Tower Siege game engine
│   └── plank-engine.js    # Plank Wars engine
├── public/                # Static frontend files
│   ├── index.html         # Landing page — game selection
│   ├── lobby.html         # Game lobby — QR code & player connection
│   ├── controller.html    # Shared mobile controller (Tetris, Dino Dash)
│   ├── tetris.html        # Gastro Tetris game display
│   ├── css/               # Shared styles
│   ├── js/                # Shared scripts
│   ├── cpr-trainer/       # CPR Trainer (controller + game display)
│   ├── tower-siege/       # Tower Siege (controller + game display)
│   ├── ghost-breath/      # Ghost of the Breath Temple
│   ├── dino-dash/         # Knight Dash endless runner
│   ├── gravity-bridge/    # Gravity Bridge co-op
│   ├── balance-duel/      # Balance Duel co-op
│   ├── focus-mode/        # Focus Mode Pomodoro
│   ├── plank-wars/        # Plank Wars challenge
│   ├── emotional-ai/      # Emotional AI dashboard
│   └── dashboard/         # Corporate wellness dashboard
└── .certs/                # Auto-generated SSL certificates
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v16+ ([download](https://nodejs.org/))
- **OpenSSL** (optional but recommended — included with Git for Windows)

### Installation

```bash
# Clone the repository
git clone https://github.com/ZagguChad/Motion_Arena.git
cd Motion_Arena

# Install dependencies
npm install

# Start the server
npm start
```

### Quick Start (Windows)

Double-click **`start.bat`** — it will kill old processes, start the server, and open the browser automatically.

### Accessing the Platform

| Device | URL |
|--------|-----|
| **Laptop (game display)** | `http://localhost:3000` |
| **Phone (controller)** | Scan the QR code shown in the game lobby |

> ⚠️ **Phone Browser:** When you scan the QR code, your phone may show a security warning because of the self-signed certificate. Tap **"Advanced"** → **"Proceed"** to continue.

---

## 🎯 How to Play

1. **Open** `http://localhost:3000` on your laptop
2. **Choose** a game from the landing page
3. **Select** Solo or VS mode
4. **Scan** the QR code with your phone camera
5. **Accept** the HTTPS certificate warning on your phone
6. **Play!** — The game runs on the laptop, your phone is the controller

---

## 🔧 Configuration

| Setting | Default | Location |
|---------|---------|----------|
| HTTP Port | `3000` | `server.js` |
| HTTPS Port | `3443` | `server.js` |
| SSL Certs | Auto-generated | `.certs/` |

---

## 👥 Team

Built with ❤️ for **cooperative play** and **active gaming**.

---

## 📄 License

This project is built for the hackathon. All rights reserved.
