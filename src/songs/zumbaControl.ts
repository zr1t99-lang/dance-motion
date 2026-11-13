import { mk, type Move } from "../choreography.js";
import { DEFAULT_SCORING, type ScoringConfig } from "../scoring.js";
import { POSES } from "./sunshineShake.js";
import type { SongDef } from "./types.js";

/**
 * PRIVATE DEVELOPMENT TEST (Dance Control mode only).
 *
 * Reference: first 60 s of a Zumba video ("Soda Pop"), supplied by the project owner for local testing.
 * The audio is NOT part of this repository (`private/` is git-ignored); it is loaded from a file the player picks, or from
 * private/zumba60.mp3 when running locally. It must be replaced or licensed before any release.
 *
 * What was measured vs. what was judged by eye:
 *  - MEASURED (audio, ffmpeg + numpy): tempo 126 BPM, first beat at 0.27 s (onset-grid fit over 60 s).
 *  - MEASURED (frame differencing): hard cuts at 4.1, 5.8, 7.5, 9.6, 10.9, 27.0, 29.4, 36.7, 42.0, 43.7, 51.9, 57.0, 58.8 s;
 *    black frames at 27.0-29.3 s and 42.0-43.6 s.
 *  - JUDGED BY EYE (contact sheets at 2 frames/s): which move is danced when. There was no pose model available to extract
 *    the skeleton automatically (HIPS was deliberately not used: a player standing still already scored GREAT on it), and the footage is an edit (wide group shot, close-ups, cutaways), so each entry below is the
 *    closest of our 20 trackable poses to what is visible near that beat, NOT a frame-accurate transcription.
 */
export const ZUMBA_REF = {
  bpm: 126,
  firstBeatSec: 0.27,
  cutsSec: [4.1, 5.8, 7.5, 9.6, 10.9, 27.0, 29.4, 36.7, 42.0, 43.7, 51.9, 57.0, 58.8],
  blackSec: [[27.0, 29.3], [42.0, 43.6]] as [number, number][],
  danceStartsSec: 11,
  /** beat (from the first beat), our pose, what was visible in the video around that time */
  moves: [
    [24, "OUT", "11.7 s: lead opens both arms wide, group standing"],
    [28, "STEP_L", "13.6 s: weight shift to the side, hands low"],
    [32, "SWING_R", "15.5 s: big stride to the right with arm swing"],
    [36, "CACTUS", "17.4 s: bounce, hands bent in front (nearest distinct pose: elbows bent)"],
    [40, "SWING_L", "19.3 s: wide stride to the left, arm out"],
    [44, "PT_R", "21.2-22 s: step and point at the camera"],
    [48, "V_UP", "23.1 s: close-up, both arms up in a V, shoulders"],
    [52, "CACTUS", "25.0 s: close-up, elbows bent, double arm pump"],
    [64, "SKY_R", "30.7 s: close-up, right arm reaches up diagonally"],
    [68, "STEP_R", "32.6 s: group steps to the right"],
    [72, "OUT", "34.6 s: wide crouched stance, arms out"],
    [76, "PT_L", "36.5 s: close-up, one arm out to the side"],
    [80, "STEP_R", "38.4 s: knee lifts, side shift"],
    [84, "DISCO_L", "40.3 s: wide stance, arm diagonal up"],
    [92, "STEP_L", "44.1 s: group bounce, weight to the left"],
    [96, "STEP_R", "46.0 s: group bounce, weight to the right"],
    [100, "SWEEP_R", "47.9 s: wide stance, arms sweep diagonally"],
    [104, "OUT", "49.8 s: arms out in a wide stance"],
    [108, "DISCO_R", "51.7 s: one arm up, one low, sway (nearest distinct pose)"],
    [112, "SQUAT", "53.6 s: new camera angle, wide knees-bent stance"],
    [116, "SQUAT", "55.5 s: same stance, sway"],
    [120, "STEP_R", "57.4 s: stride to the right"],
  ] as [number, string, string][],
};

/** Dance Control: the player moves ON the beat (no dancer to follow), so the timing window is tight. */
export const CONTROL_SCORING: ScoringConfig = {
  ...DEFAULT_SCORING,
  timingTolerance: 0.6,
  timingOffset: 0.2,
  gateStrength: 0.2,
};

export const beatTime = (b: number) => ZUMBA_REF.firstBeatSec + (b * 60) / ZUMBA_REF.bpm;

export function buildZumbaMoves(): Move[] {
  const out: Move[] = [];
  for (const [beat, key, note] of ZUMBA_REF.moves) {
    const def = POSES[key];
    if (!def) throw new Error("unknown pose " + key);
    out.push(mk(`b${beat}-${key}`, def.name, beatTime(beat), def.spec, def.w ?? {}, true));
    void note;
  }
  out.push(mk("finish", "Finish", 61, {}, {}, false));
  return out;
}

export function buildZumbaControl(): SongDef {
  const beatSec = 60 / ZUMBA_REF.bpm;
  return {
    id: "zumba-control-60",
    title: "Soda Pop · Control",
    artist: "Private reference video — local test only",
    blurb: "126 BPM · first 60 s · you move, the dancer follows YOU",
    bpm: ZUMBA_REF.bpm,
    totalBeats: Math.floor(60 / beatSec),
    beatSec,
    sections: [
      { name: "Video intro (no dancing)", startBeat: 0, beats: 24 },
      { name: "Dance", startBeat: 24, beats: 102 },
    ],
    lyrics: [],
    moves: buildZumbaMoves(),
    choreo: { transition: 0.5, leadIn: 3, beatSec, bounce: 0, sway: 0 },
    scoring: CONTROL_SCORING,
    audio: "file",
    audioUrl: "private/zumba60.mp3",
    audioOffset: 0,
  };
}
