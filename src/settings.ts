import type { Facing } from "./types.js";
import type { ModelVariant } from "./tracker.js";

export interface Settings {
  facing: Facing;
  /** Mirror the preview + player avatar left/right (selfie view). */
  mirror: boolean;
  model: ModelVariant;
  /** Max pose inferences per second (lower = cooler phone, longer battery). */
  maxFps: number;
  /** How closely the avatar follows quick movements (Fast = least lag). */
  responsiveness: "smooth" | "balanced" | "fast";
  /** Half-width of the timing window around each move, seconds. */
  tolerance: number;
  music: boolean;
  /** Shifts the song relative to the dancer (ms; + = later). Compensates Bluetooth/speaker latency. */
  audioOffsetMs: number;
  reflections: boolean;
  /** Draw the detected skeleton over the camera preview. */
  overlay: boolean;
  tvMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  facing: "user",
  mirror: true,
  model: "lite",
  maxFps: 60,
  responsiveness: "fast",
  tolerance: 0.7,
  music: true,
  audioOffsetMs: 0,
  reflections: true,
  overlay: true,
  tvMode: false,
};

const KEY = "dance-motion.settings.v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage may be unavailable (private mode) */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
