import { MOVES } from "../choreography.js";
import { DEFAULT_SCORING } from "../scoring.js";
/** The original 30-second deterministic test routine (120 BPM click beat), kept for e2e tests and quick calibration. */
export function buildTestRoutine() {
    return {
        id: "test-routine",
        title: "30 s Test Routine",
        artist: "Practice beat",
        blurb: "9 moves · 120 BPM click · quick check",
        bpm: 120,
        totalBeats: 60,
        beatSec: 0.5,
        sections: [{ name: "Routine", startBeat: 0, beats: 60 }],
        lyrics: [],
        moves: MOVES,
        choreo: {},
        scoring: DEFAULT_SCORING,
        audio: "beat",
    };
}
