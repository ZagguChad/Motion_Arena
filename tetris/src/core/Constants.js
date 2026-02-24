/**
 * Constants for Motion Arena AI v2
 */

// Grid
export const COLS = 8;
export const ROWS = 16;

// Timing
export const INITIAL_DROP_MS = 800;
export const SPEED_INCREASE_LINES = 10;
export const DROP_SPEED_FACTOR = 0.85;
export const LOCK_DELAY_MS = 400;

// Gesture
export const GESTURE_COOLDOWN_MS = 250;
export const NO_HAND_TIMEOUT_MS = 500;
export const GESTURE_THROTTLE_FPS = 30;

// WebSocket
export const WS_PORT = 3001;

// Combo / Attack
export const COMBO_GARBAGE = { 1: 0, 2: 1, 3: 2, 4: 4 };
export const COMBO_BONUS_PER_STREAK = 1;

// Scoring
export const LINE_SCORES = [0, 100, 300, 500, 800];

// Countdown
export const COUNTDOWN_DURATION = 3;

// Colors — vibrant neon arcade
export const COLORS = {
  bg: '#0a0a1a',
  boardBg: '#0d0d22',
  gridLine: 'rgba(255,255,255,0.04)',
  divider: '#1a1a3a',
  I: '#00e5ff',
  O: '#ffd600',
  T: '#d500f9',
  S: '#00e676',
  Z: '#ff1744',
  L: '#ff9100',
  J: '#2979ff',
  ghost: 'rgba(255,255,255,0.08)',
  locked: 'rgba(255,255,255,0.04)',
  neonGlow: '#0ff',
  comboColors: ['#0ff', '#0f0', '#ff0', '#f0f', '#f00'],
  garbage: '#3a3a3a',
};

// Block rendering
export const BLOCK_RADIUS = 3;
export const BLOCK_INSET = 1.5;
export const GLOW_BLUR = 8;

// Screen shake
export const SHAKE_INTENSITY = 6;
export const SHAKE_DURATION = 200;
