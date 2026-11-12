import { mk, NEUTRAL, type Move, type PoseSpec, type Weights } from "../choreography.js";
import { SONG_SCORING } from "../scoring.js";
import { BEAT_SEC, BPM, SECTIONS, TOTAL_BEATS } from "./structure.js";
import type { LyricLine, SongDef } from "./types.js";

/* ------------------------------------------------------------------ pose library */
const STEP_W: Partial<Weights> = { angle: 0.3, pos: 0.2, shift: 0.35, height: 0.15, arm: 0.8, leg: 0.6 };
const SQUAT_W: Partial<Weights> = { angle: 0.25, pos: 0.2, shift: 0.1, height: 0.45, arm: 0.8, leg: 0.4 };
const COMBO_W: Partial<Weights> = { angle: 0.4, pos: 0.2, shift: 0.3, height: 0.1, arm: 1, leg: 0.6 };
const RELAXED = { rUpper: 30, rFore: 18, lUpper: 30, lFore: 18 };
const LEGS_R = { rThigh: 22, rShin: 14, lThigh: -10, lShin: -4, hipShift: -0.55 };
const LEGS_L = { lThigh: 22, lShin: 14, rThigh: -10, rShin: -4, hipShift: 0.55 };
const LEGS_WIDE = { rThigh: 14, rShin: 10, lThigh: 14, lShin: 10 };

interface PoseDef {
  name: string;
  spec: Partial<PoseSpec>;
  w?: Partial<Weights>;
}

export const POSES: Record<string, PoseDef> = {
  REST: { name: "Relax", spec: {} },
  OUT: { name: "Arms out wide", spec: { rUpper: 90, rFore: 90, lUpper: 90, lFore: 90 } },
  CACTUS: { name: "Cactus arms", spec: { rUpper: 90, rFore: 160, lUpper: 90, lFore: 160 } },
  PT_R: { name: "Point right", spec: { rUpper: 90, rFore: 90 } },
  PT_L: { name: "Point left", spec: { lUpper: 90, lFore: 90 } },
  SKY_R: { name: "Sky punch right", spec: { rUpper: 160, rFore: 172 } },
  SKY_L: { name: "Sky punch left", spec: { lUpper: 160, lFore: 172 } },
  SKY: { name: "Both hands up", spec: { rUpper: 155, rFore: 168, lUpper: 155, lFore: 168 } },
  CLAP: { name: "Overhead clap", spec: { rUpper: 165, rFore: 178, lUpper: 165, lFore: 178 } },
  V_UP: { name: "V arms", spec: { rUpper: 130, rFore: 135, lUpper: 130, lFore: 135 } },
  STEP_R: { name: "Step right", spec: { ...RELAXED, ...LEGS_R }, w: STEP_W },
  STEP_L: { name: "Step left", spec: { ...RELAXED, ...LEGS_L }, w: STEP_W },
  SWING_R: { name: "Swing right", spec: { rUpper: 100, rFore: 105, lUpper: -25, lFore: -15, ...LEGS_R }, w: STEP_W },
  SWING_L: { name: "Swing left", spec: { lUpper: 100, lFore: 105, rUpper: -25, rFore: -15, ...LEGS_L }, w: STEP_W },
  COMBO_R: { name: "Arm up + step right", spec: { rUpper: 155, rFore: 170, lUpper: 12, lFore: 8, ...LEGS_R, hipShift: -0.5 }, w: COMBO_W },
  COMBO_L: { name: "Arm up + step left", spec: { lUpper: 155, lFore: 170, rUpper: 12, rFore: 8, ...LEGS_L, hipShift: 0.5 }, w: COMBO_W },
  SQUAT: {
    name: "Bend knees",
    spec: { rUpper: 50, rFore: 35, lUpper: 50, lFore: 35, rThigh: 25, rShin: 5, lThigh: 25, lShin: 5, bend: 1 },
    w: SQUAT_W,
  },
  WIDE: { name: "Arms up, feet wide", spec: { rUpper: 145, rFore: 155, lUpper: 145, lFore: 155, ...LEGS_WIDE }, w: { leg: 0.8 } },
};

/* ------------------------------------------------------------------ choreography: one string of 4 poses per 8-count */
/** The 4 poses land on counts 2, 4, 6, 8 (beats 1, 3, 5, 7 of each 8-count), i.e. every 0.9375 s. */
const CHORUS_A = "SWING_R SWING_L SWING_R SWING_L"; // side steps with arm swings (signature move)
const CHORUS_B = "SKY_R SKY_L SKY_R SKY_L"; // alternating sky punches
const CHORUS_C = "SWING_R SWING_L SWING_R SWING_L";
const CHORUS_D = "CLAP SQUAT CLAP V_UP"; // overhead clap + squat
const CHORUS_D_END = "CLAP SQUAT CLAP WIDE";

export const DANCE: string[] = [
  // Intro (2): the first 8-count is a free "watch" bar, not scored
  "OUT REST OUT REST",
  "PT_R PT_L PT_R PT_L",
  // Verse 1 (4)
  "STEP_R STEP_L PT_R PT_L",
  "OUT CACTUS OUT CACTUS",
  "STEP_R STEP_L SQUAT REST",
  "SKY_R SKY_L SKY REST",
  // Pre-chorus (2)
  "SQUAT V_UP SQUAT V_UP",
  "SQUAT V_UP SKY SKY",
  // Chorus (4)
  CHORUS_A, CHORUS_B, CHORUS_C, CHORUS_D,
  // Verse 2 (4)
  "PT_R PT_L SWING_R SWING_L",
  "CACTUS OUT CACTUS OUT",
  "COMBO_R COMBO_L COMBO_R COMBO_L",
  "SQUAT SKY SQUAT SKY",
  // Pre-chorus 2 (2)
  "SQUAT V_UP SQUAT V_UP",
  "SQUAT V_UP SKY SKY",
  // Chorus 2 (4)
  CHORUS_A, CHORUS_B, CHORUS_C, CHORUS_D,
  // Bridge (2)
  "PT_R SKY_L PT_L SKY_R",
  "SQUAT REST SKY SKY",
  // Final chorus (4)
  CHORUS_A, CHORUS_B, CHORUS_C, CHORUS_D_END,
  // Outro (1)
  "SKY_R SKY_L CLAP WIDE",
];

export function buildMoves(): Move[] {
  const out: Move[] = [];
  DANCE.forEach((bar, e) => {
    bar.split(" ").forEach((tok, k) => {
      const def = POSES[tok];
      if (!def) throw new Error(`unknown pose ${tok}`);
      const beat = e * 8 + 1 + 2 * k;
      out.push(mk(`${e}.${k}-${tok}`, def.name, beat * BEAT_SEC, def.spec, def.w ?? {}, e !== 0));
    });
  });
  out.push(mk("finish", "Finish", TOTAL_BEATS * BEAT_SEC + 0.5, {}, {}, false));
  return out;
}

/* ------------------------------------------------------------------ original lyrics (beats from song start) */
const L = (beat: number, len: number, who: LyricLine["who"], text: string): LyricLine => ({ beat, len, who, text });
const CHORUS_LYR = (b: number, last?: string): LyricLine[] => [
  L(b, 8, "B", "Shake, shake, sunshine shake!"),
  L(b + 8, 8, "B", "Reach up high, let the sky awake!"),
  L(b + 16, 8, "B", "Shake, shake, sunshine shake!"),
  L(b + 24, 8, "B", last ?? "We're all dancing, no mistake!"),
];
const PRE_LYR = (b: number): LyricLine[] => [
  L(b, 8, "F", "Can you feel it? Rising higher!"),
  L(b + 8, 8, "B", "Three, two, one... set the fire!"),
];

export const LYRICS: LyricLine[] = [
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
export function lyricsByBeat(): string {
  return LYRICS.map((l) => `${String(l.beat).padStart(3)} (${(l.beat * BEAT_SEC).toFixed(2)}s) [${l.who}] ${l.text}`).join("\n");
}

export function buildSunshineShake(): SongDef {
  return {
    id: "sunshine-shake",
    title: "Sunshine Shake",
    artist: "Dance Motion Originals",
    blurb: "128 BPM · 1:49 · side steps, sky punches, overhead claps",
    bpm: BPM,
    totalBeats: TOTAL_BEATS,
    beatSec: BEAT_SEC,
    sections: SECTIONS,
    lyrics: LYRICS,
    moves: buildMoves(),
    choreo: { transition: 0.3, leadIn: 3, beatSec: BEAT_SEC, bounce: 0.12, sway: 0.05 },
    scoring: SONG_SCORING,
    audio: "synth",
    vocalsUrl: "songs/sunshine-shake-vocals.mp3",
  };
}

export { NEUTRAL };
