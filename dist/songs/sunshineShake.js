import { mk, NEUTRAL } from "../choreography.js";
import { SONG_SCORING } from "../scoring.js";
import { BEAT_SEC, BPM, SECTIONS, TOTAL_BEATS } from "./structure.js";
/* ------------------------------------------------------------------ pose library */
const STEP_W = { angle: 0.3, pos: 0.2, shift: 0.35, height: 0.15, arm: 0.8, leg: 0.6 };
const SQUAT_W = { angle: 0.25, pos: 0.2, shift: 0.1, height: 0.45, arm: 0.8, leg: 0.4 };
const COMBO_W = { angle: 0.4, pos: 0.2, shift: 0.3, height: 0.1, arm: 1, leg: 0.6 };
const RELAXED = { rUpper: 30, rFore: 18, lUpper: 30, lFore: 18 };
const LEGS_R = { rThigh: 22, rShin: 14, lThigh: -10, lShin: -4, hipShift: -0.55 };
const LEGS_L = { lThigh: 22, lShin: 14, rThigh: -10, rShin: -4, hipShift: 0.55 };
const LEGS_WIDE = { rThigh: 14, rShin: 10, lThigh: 14, lShin: 10 };
export const POSES = {
    // ---- accents (scored, land on counts 2-4-6-8)
    OUT: { name: "Arms out wide", spec: { rUpper: 90, rFore: 90, lUpper: 90, lFore: 90 } },
    CACTUS: { name: "Cactus arms", spec: { rUpper: 90, rFore: 160, lUpper: 90, lFore: 160 } },
    PT_R: { name: "Point right", spec: { rUpper: 90, rFore: 90 } },
    PT_L: { name: "Point left", spec: { lUpper: 90, lFore: 90 } },
    SKY_R: { name: "Sky punch right", spec: { rUpper: 160, rFore: 172 } },
    SKY_L: { name: "Sky punch left", spec: { lUpper: 160, lFore: 172 } },
    SKY: { name: "Both hands up", spec: { rUpper: 155, rFore: 168, lUpper: 155, lFore: 168 } },
    CLAP: { name: "Overhead clap", spec: { rUpper: 165, rFore: 178, lUpper: 165, lFore: 178 } },
    V_UP: { name: "V arms", spec: { rUpper: 130, rFore: 135, lUpper: 130, lFore: 135 } },
    HIPS: { name: "Hands on hips", spec: { rUpper: 40, rFore: -40, lUpper: 40, lFore: -40 } },
    DISCO_R: { name: "Disco point right", spec: { rUpper: 140, rFore: 145, lUpper: 40, lFore: 35 } },
    DISCO_L: { name: "Disco point left", spec: { lUpper: 140, lFore: 145, rUpper: 40, rFore: 35 } },
    STEP_R: { name: "Step right", spec: { ...RELAXED, ...LEGS_R }, w: STEP_W },
    STEP_L: { name: "Step left", spec: { ...RELAXED, ...LEGS_L }, w: STEP_W },
    SWING_R: { name: "Swing right", spec: { rUpper: 100, rFore: 105, lUpper: -25, lFore: -15, ...LEGS_R }, w: STEP_W },
    SWING_L: { name: "Swing left", spec: { lUpper: 100, lFore: 105, rUpper: -25, rFore: -15, ...LEGS_L }, w: STEP_W },
    SWEEP_R: { name: "Sweep arms right", spec: { rUpper: 135, rFore: 140, lUpper: -135, lFore: -140, ...LEGS_R }, w: COMBO_W },
    SWEEP_L: { name: "Sweep arms left", spec: { lUpper: 135, lFore: 140, rUpper: -135, rFore: -140, ...LEGS_L }, w: COMBO_W },
    COMBO_R: { name: "Arm up + step right", spec: { rUpper: 155, rFore: 170, lUpper: 12, lFore: 8, ...LEGS_R, hipShift: -0.5 }, w: COMBO_W },
    COMBO_L: { name: "Arm up + step left", spec: { lUpper: 155, lFore: 170, rUpper: 12, rFore: 8, ...LEGS_L, hipShift: 0.5 }, w: COMBO_W },
    SQUAT: {
        name: "Bend knees",
        spec: { rUpper: 50, rFore: 35, lUpper: 50, lFore: 35, rThigh: 25, rShin: 5, lThigh: 25, lShin: 5, bend: 1 },
        w: SQUAT_W,
    },
    WIDE: { name: "Arms up, feet wide", spec: { rUpper: 145, rFore: 155, lUpper: 145, lFore: 155, ...LEGS_WIDE }, w: { leg: 0.8 } },
    // ---- groove (the in-between beats: the dancer keeps moving, these are never scored)
    G_R: { name: "Groove right", spec: { rUpper: 35, rFore: 55, lUpper: 20, lFore: 35, rThigh: 12, rShin: 6, lThigh: -4, lShin: -2, hipShift: -0.25, bend: 0.2 } },
    G_L: { name: "Groove left", spec: { lUpper: 35, lFore: 55, rUpper: 20, rFore: 35, lThigh: 12, lShin: 6, rThigh: -4, rShin: -2, hipShift: 0.25, bend: 0.2 } },
    PUMP_R: { name: "Pump right", spec: { rUpper: 55, rFore: 135, lUpper: 20, lFore: 30, bend: 0.2 } },
    PUMP_L: { name: "Pump left", spec: { lUpper: 55, lFore: 135, rUpper: 20, rFore: 30, bend: 0.2 } },
    DIP: { name: "Dip", spec: { rUpper: 25, rFore: 60, lUpper: 25, lFore: 60, bend: 0.55 } },
};
/* ------------------------------------------------------------------ choreography: 2 moves per 8-count */
/**
 * Each move lasts 4 beats (1.9 s): the dancer reaches the pose on count 2 and HOLDS it (with a small beat
 * bounce and sway) until the next move starts. The scored moment is the arrival; a player has the whole
 * hold to copy it. Chorus: side steps with arm swings, alternating sky punches, overhead clap + squat.
 */
export const DANCE = [
    "OUT CACTUS", // Intro: first 8-count is a free "watch" bar, not scored
    "PT_R PT_L",
    // Verse 1 (4)
    "STEP_R STEP_L",
    "DISCO_R DISCO_L",
    "HIPS SWEEP_R",
    "SWEEP_L SKY",
    // Pre-chorus (2)
    "SQUAT V_UP",
    "SQUAT SKY",
    // Chorus (4)
    "SWING_R SWING_L",
    "SKY_R SKY_L",
    "SWEEP_R SWEEP_L",
    "CLAP SQUAT",
    // Verse 2 (4)
    "PT_R PT_L",
    "CACTUS OUT",
    "COMBO_R COMBO_L",
    "HIPS SKY",
    // Pre-chorus 2 (2)
    "SQUAT V_UP",
    "SQUAT SKY",
    // Chorus 2 (4)
    "SWING_R SWING_L",
    "SKY_R SKY_L",
    "SWEEP_R SWEEP_L",
    "CLAP SQUAT",
    // Bridge (2)
    "DISCO_R DISCO_L",
    "SQUAT SKY",
    // Final chorus (4)
    "SWING_R SWING_L",
    "SKY_R SKY_L",
    "SWEEP_R SWEEP_L",
    "CLAP WIDE",
    // Outro (1)
    "SKY WIDE",
];
/** Move length in beats; the pose is reached on beat 1 of each unit and held through beat 3. */
export const MOVE_BEATS = 4;
export function buildMoves() {
    const out = [];
    let u = 0;
    DANCE.forEach((bar, e) => {
        bar.split(" ").forEach((tok) => {
            const def = POSES[tok];
            if (!def)
                throw new Error(`unknown pose ${tok}`);
            const beat = u * MOVE_BEATS;
            // scored arrival on count 2, unscored hold keyframe on count 4 (same pose)
            out.push(mk(`${u}-${tok}`, def.name, (beat + 1) * BEAT_SEC, def.spec, def.w ?? {}, e !== 0));
            out.push(mk(`${u}h-${tok}`, def.name, (beat + 3) * BEAT_SEC, def.spec, def.w ?? {}, false));
            u++;
        });
    });
    out.push(mk("finish", "Finish", TOTAL_BEATS * BEAT_SEC + 0.5, {}, {}, false));
    return out;
}
/* ------------------------------------------------------------------ original lyrics (beats from song start) */
const L = (beat, len, who, text) => ({ beat, len, who, text });
const CHORUS_LYR = (b, last) => [
    L(b, 8, "B", "Shake, shake, sunshine shake!"),
    L(b + 8, 8, "B", "Reach up high, let the sky awake!"),
    L(b + 16, 8, "B", "Shake, shake, sunshine shake!"),
    L(b + 24, 8, "B", last ?? "We're all dancing, no mistake!"),
];
const PRE_LYR = (b) => [
    L(b, 8, "F", "Can you feel it? Rising higher!"),
    L(b + 8, 8, "B", "Three, two, one... set the fire!"),
];
export const LYRICS = [
    L(12, 4, "B", "Hey! Let's go!"),
    L(16, 8, "F", "Morning light is on my floor"),
    L(24, 8, "F", "Got my sneakers by the door"),
    L(32, 8, "F", "Heartbeat drumming, feeling right"),
    L(40, 8, "F", "Nothing's gonna stop tonight"),
    ...PRE_LYR(48),
    ...CHORUS_LYR(64),
    L(96, 8, "M", "Look at you, you've got the groove"),
    L(104, 8, "M", "Left foot, right foot, find your move"),
    L(112, 8, "M", "Throw your arms up to the sun"),
    L(120, 8, "M", "Dancing's only just begun"),
    ...PRE_LYR(128),
    ...CHORUS_LYR(144),
    L(176, 8, "F", "Hold on, take a breath with me"),
    L(184, 8, "M", "One more time, wild and free!"),
    ...CHORUS_LYR(192, "Shake it till the sun awakes!"),
    L(224, 8, "B", "Sunshine shake! Hey!"),
];
/** Plain-text lyrics for SONG_BRIEF.md / vocal generation. */
export function lyricsByBeat() {
    return LYRICS.map((l) => `${String(l.beat).padStart(3)} (${(l.beat * BEAT_SEC).toFixed(2)}s) [${l.who}] ${l.text}`).join("\n");
}
export function buildSunshineShake() {
    return {
        id: "sunshine-shake",
        title: "Sunshine Shake",
        artist: "Dance Motion Originals",
        blurb: "128 BPM · 1:49 · each move held ~2 s, repeated",
        bpm: BPM,
        totalBeats: TOTAL_BEATS,
        beatSec: BEAT_SEC,
        sections: SECTIONS,
        lyrics: LYRICS,
        moves: buildMoves(),
        choreo: { transition: 0.55, leadIn: 3, beatSec: BEAT_SEC, bounce: 0.14, sway: 0.07 },
        scoring: SONG_SCORING,
        audio: "synth",
        vocalsUrl: "songs/sunshine-shake-vocals.mp3",
    };
}
export { NEUTRAL };
