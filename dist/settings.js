export const DEFAULT_SETTINGS = {
    facing: "user",
    mirror: true,
    model: "lite",
    maxFps: 60,
    responsiveness: "fast",
    tolerance: 0.7,
    music: true,
    reflections: true,
    overlay: true,
    tvMode: false,
};
const KEY = "dance-motion.settings.v1";
export function loadSettings() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw)
            return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
    catch {
        /* storage may be unavailable (private mode) */
    }
    return { ...DEFAULT_SETTINGS };
}
export function saveSettings(s) {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    }
    catch {
        /* ignore */
    }
}
