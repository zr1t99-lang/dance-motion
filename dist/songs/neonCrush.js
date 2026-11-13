import { mk } from "../choreography.js";
import { SONG_SCORING } from "../scoring.js";
/**
 * "Neon Crush" - an ORIGINAL song and an ORIGINAL dance in a modern K-pop / girl-crush style (trap beat, 808, chant hook).
 * Nothing here is taken from a real song or choreography. 120 BPM, 4/4, 30 eight-counts = 240 beats = 2:00.
 * The dance is built from the game's pose vocabulary (arm / leg angles seen from the front, weight shifts, knee bends), so it
 * is the "attitude" moves of the genre: boss hands-on-hips, crown, crossed arms, sharp points, power squats, step-touch sweeps.
 */
export const BPM = 120;
export const BEAT_SEC = 60 / BPM;
const EIGHT = 8;
const s = (name, start8, count8) => ({ name, startBeat: start8 * EIGHT, beats: count8 * EIGHT });
export const SECTIONS = [
    s("Intro", 0, 2),
    s("Verse 1", 2, 3),
    s("Pre-Chorus", 5, 2),
    s("Chorus", 7, 4),
    s("Dance Break", 11, 2),
    s("Verse 2", 13, 3),
    s("Pre-Chorus", 16, 2),
    s("Chorus", 18, 4),
    s("Bridge", 22, 2),
    s("Final Chorus", 24, 4),
    s("Outro", 28, 2),
];
export const TOTAL_BEATS = 30 * EIGHT; // 240
/* ------------------------------------------------------------------ pose library */
const STEP_W = { angle: 0.3, pos: 0.2, shift: 0.35, height: 0.15, arm: 0.8, leg: 0.6 };
const SQUAT_W = { angle: 0.25, pos: 0.2, shift: 0.1, height: 0.45, arm: 0.8, leg: 0.4 };
const COMBO_W = { angle: 0.4, pos: 0.2, shift: 0.3, height: 0.1, arm: 1, leg: 0.6 };
const LOW = { rUpper: 28, rFore: 16, lUpper: 28, lFore: 16 };
const LEG_R = { rThigh: 22, rShin: 14, lThigh: -10, lShin: -4, hipShift: -0.55 };
const LEG_L = { lThigh: 22, lShin: 14, rThigh: -10, rShin: -4, hipShift: 0.55 };
const POWER_LEGS = { rThigh: 16, rShin: 10, lThigh: 16, lShin: 10, bend: 0.45 };
export const POSES = {
    // ---- attitude poses
    BOSS: { name: "Boss: hands on hips, knees soft", spec: { rUpper: 72, rFore: -72, lUpper: 72, lFore: -72, rThigh: 20, rShin: 12, lThigh: 20, lShin: 12, bend: 0.75 }, w: COMBO_W },
    BOSS_R: { name: "Boss + pop right", spec: { rUpper: 40, rFore: -40, lUpper: 40, lFore: -40, ...LEG_R, hipShift: -0.6 }, w: STEP_W },
    BOSS_L: { name: "Boss + pop left", spec: { rUpper: 40, rFore: -40, lUpper: 40, lFore: -40, ...LEG_L, hipShift: 0.6 }, w: STEP_W },
    CROWN: { name: "Crown: hands over head", spec: { rUpper: 128, rFore: -152, lUpper: 128, lFore: -152 } },
    CROSS: { name: "Cross arms, hip pop", spec: { rUpper: 15, rFore: -135, lUpper: 15, lFore: -135, rThigh: 24, rShin: 12, lThigh: -10, lShin: -5, hipShift: -0.55, bend: 0.5 }, w: COMBO_W },
    SNAP_R: { name: "Sharp point up-right", spec: { rUpper: 138, rFore: 142, lUpper: 35, lFore: 22 }, w: COMBO_W },
    SNAP_L: { name: "Sharp point up-left", spec: { lUpper: 138, lFore: 142, rUpper: 35, rFore: 22 }, w: COMBO_W },
    POINT_R: { name: "Point right", spec: { rUpper: 90, rFore: 90, lUpper: 30, lFore: -40 } },
    POINT_L: { name: "Point left", spec: { lUpper: 90, lFore: 90, rUpper: 30, rFore: -40 } },
    OUT: { name: "Arms out wide", spec: { rUpper: 90, rFore: 90, lUpper: 90, lFore: 90 } },
    SKY: { name: "Both hands up", spec: { rUpper: 155, rFore: 168, lUpper: 155, lFore: 168 } },
    V_UP: { name: "V arms", spec: { rUpper: 130, rFore: 135, lUpper: 130, lFore: 135 } },
    CLAP: { name: "Overhead clap", spec: { rUpper: 165, rFore: 178, lUpper: 165, lFore: 178 } },
    X_UP: { name: "X above head", spec: { rUpper: 150, rFore: -170, lUpper: 150, lFore: -170 } },
    HEART_ARMS: { name: "Arms in a big circle", spec: { rUpper: 75, rFore: 165, lUpper: 75, lFore: 165 } },
    // ---- footwork
    STEP_R: { name: "Step right", spec: { ...LOW, ...LEG_R }, w: STEP_W },
    STEP_L: { name: "Step left", spec: { ...LOW, ...LEG_L }, w: STEP_W },
    SWEEP_R: { name: "Sweep arms right", spec: { rUpper: 135, rFore: 140, lUpper: -135, lFore: -140, ...LEG_R }, w: COMBO_W },
    SWEEP_L: { name: "Sweep arms left", spec: { lUpper: 135, lFore: 140, rUpper: -135, rFore: -140, ...LEG_L }, w: COMBO_W },
    SWING_R: { name: "Swing right", spec: { rUpper: 100, rFore: 105, lUpper: -25, lFore: -15, ...LEG_R }, w: STEP_W },
    SWING_L: { name: "Swing left", spec: { lUpper: 100, lFore: 105, rUpper: -25, rFore: -15, ...LEG_L }, w: STEP_W },
    LUNGE_R: { name: "Lunge right, arms up", spec: { rUpper: 150, rFore: 160, lUpper: 60, lFore: 70, rThigh: 34, rShin: 6, lThigh: -14, lShin: -6, hipShift: -0.7, bend: 0.55 }, w: COMBO_W },
    LUNGE_L: { name: "Lunge left, arms up", spec: { lUpper: 150, lFore: 160, rUpper: 60, rFore: 70, lThigh: 34, lShin: 6, rThigh: -14, rShin: -6, hipShift: 0.7, bend: 0.55 }, w: COMBO_W },
    // ---- power
    POWER: { name: "Power stance", spec: { rUpper: 62, rFore: 40, lUpper: 62, lFore: 40, rThigh: 26, rShin: 16, lThigh: 26, lShin: 16, bend: 0.75 }, w: SQUAT_W },
    SQUAT_CROWN: { name: "Squat + crown", spec: { rUpper: 128, rFore: -152, lUpper: 128, lFore: -152, rThigh: 25, rShin: 5, lThigh: 25, lShin: 5, bend: 1 }, w: SQUAT_W },
    SQUAT: { name: "Bend knees", spec: { rUpper: 50, rFore: 35, lUpper: 50, lFore: 35, rThigh: 25, rShin: 5, lThigh: 25, lShin: 5, bend: 1 }, w: SQUAT_W },
    WIDE: { name: "Arms up, feet wide", spec: { rUpper: 145, rFore: 155, lUpper: 145, lFore: 155, rThigh: 14, rShin: 10, lThigh: 14, lShin: 10 }, w: { leg: 0.8 } },
};
export const DANCE = [
    // Intro (2)
    { beats: 4, moves: "BOSS CROWN" },
    { beats: 4, moves: "CROSS POINT_R" },
    // Verse 1 (3)
    { beats: 4, moves: "STEP_R STEP_L" },
    { beats: 4, moves: "BOSS_R BOSS_L" },
    { beats: 4, moves: "POINT_L CROSS" },
    // Pre-chorus 1 (2)
    { beats: 4, moves: "SQUAT_CROWN V_UP" },
    { beats: 4, moves: "SQUAT SKY" },
    // Chorus 1 (4)
    { beats: 2, moves: "SNAP_R SNAP_L CROSS CROWN" },
    { beats: 2, moves: "STEP_R STEP_L SWEEP_R SWEEP_L" },
    { beats: 2, moves: "SNAP_L SNAP_R BOSS_R BOSS_L" },
    { beats: 2, moves: "SQUAT_CROWN POWER SKY CLAP" },
    // Dance break (2)
    { beats: 2, moves: "LUNGE_R LUNGE_L X_UP HEART_ARMS" },
    { beats: 2, moves: "SWING_R SWING_L POWER SQUAT" },
    // Verse 2 (3)
    { beats: 4, moves: "OUT CROSS" },
    { beats: 4, moves: "STEP_L STEP_R" },
    { beats: 4, moves: "BOSS_L CROWN" },
    // Pre-chorus 2 (2)
    { beats: 4, moves: "SQUAT_CROWN X_UP" },
    { beats: 4, moves: "SQUAT SKY" },
    // Chorus 2 (4): same hook, new second half
    { beats: 2, moves: "SNAP_R SNAP_L CROSS CROWN" },
    { beats: 2, moves: "SWING_R SWING_L SWEEP_R SWEEP_L" },
    { beats: 2, moves: "LUNGE_R LUNGE_L BOSS_R BOSS_L" },
    { beats: 2, moves: "POWER SQUAT_CROWN V_UP CLAP" },
    // Bridge (2)
    { beats: 4, moves: "HEART_ARMS POINT_R" },
    { beats: 4, moves: "POINT_L SQUAT" },
    // Final chorus (4): bigger
    { beats: 2, moves: "SNAP_R SNAP_L CROSS CROWN" },
    { beats: 2, moves: "LUNGE_R LUNGE_L SWEEP_R SWEEP_L" },
    { beats: 2, moves: "X_UP CROWN BOSS_R BOSS_L" },
    { beats: 2, moves: "SQUAT_CROWN POWER SKY WIDE" },
    // Outro (2)
    { beats: 4, moves: "BOSS CROSS" },
    { beats: 4, moves: "CROWN SKY" },
];
export function buildMoves() {
    const out = [];
    let beat = 0;
    let n = 0;
    DANCE.forEach((bar, e) => {
        const toks = bar.moves.split(" ");
        if (toks.length * bar.beats !== EIGHT)
            throw new Error(`8-count ${e} has ${toks.length * bar.beats} beats`);
        toks.forEach((tok) => {
            const def = POSES[tok];
            if (!def)
                throw new Error(`unknown pose ${tok}`);
            // the pose is reached one beat into the unit (count 2 / count 2 of the pair) and held; scored on arrival
            const arrive = (beat + (bar.beats === 4 ? 1 : 0.5)) * BEAT_SEC;
            out.push(mk(`${n}-${tok}`, def.name, arrive, def.spec, def.w ?? {}, e !== 0));
            if (bar.beats === 4)
                out.push(mk(`${n}h-${tok}`, def.name, (beat + 3) * BEAT_SEC, def.spec, def.w ?? {}, false));
            beat += bar.beats;
            n++;
        });
    });
    out.push(mk("finish", "Finish", TOTAL_BEATS * BEAT_SEC + 0.5, {}, {}, false));
    return out;
}
/* ------------------------------------------------------------------ original lyrics (beats from song start) */
const L = (beat, len, who, text) => ({ beat, len, who, text });
const CHORUS = (b, last) => [
    L(b, 8, "B", "Neon, neon, crush on me!"),
    L(b + 8, 8, "B", "Light it up, we're running free!"),
    L(b + 16, 8, "B", "Neon, neon, crush on me!"),
    L(b + 24, 8, "B", last ?? "Dance till the morning, you and me!"),
];
const PRE = (b) => [
    L(b, 8, "F", "Heartbeat rising, watch me move"),
    L(b + 8, 8, "B", "Three, two, one... feel the groove!"),
];
export const LYRICS = [
    L(12, 4, "B", "Lights down... hey!"),
    L(16, 8, "F", "Midnight city, feel the glow"),
    L(24, 8, "F", "Stepping in, I run the show"),
    L(32, 8, "F", "Eyes on me, I own this floor"),
    ...PRE(40),
    ...CHORUS(56),
    L(88, 4, "B", "Hey! Hey!"),
    L(92, 4, "B", "Hands up! Go!"),
    L(104, 8, "M", "Mirror, mirror, copy my style"),
    L(112, 8, "M", "Hit that pose and give a smile"),
    L(120, 8, "M", "Rhythm in my bones tonight"),
    ...PRE(128),
    ...CHORUS(144),
    L(176, 8, "F", "Shine so bright, we light the night"),
    L(184, 8, "B", "One more time, hearts on fire!"),
    ...CHORUS(192, "Neon crush, we never tire!"),
    L(224, 8, "B", "Neon crush! Hey!"),
];
export function buildNeonCrush() {
    return {
        id: "neon-crush",
        title: "Neon Crush",
        artist: "Dance Motion Originals",
        blurb: "K-pop style · 120 BPM · 2:00 · original song + dance",
        bpm: BPM,
        totalBeats: TOTAL_BEATS,
        beatSec: BEAT_SEC,
        sections: SECTIONS,
        lyrics: LYRICS,
        moves: buildMoves(),
        choreo: { transition: 0.5, leadIn: 3, beatSec: BEAT_SEC, bounce: 0.16, sway: 0.08 },
        scoring: SONG_SCORING,
        audio: "synth",
    };
}
