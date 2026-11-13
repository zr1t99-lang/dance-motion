// Writes tools/analysis/soda-pop-60s.json from src/songs/zumbaControl.ts (build first: tsc -p .)
import fs from "node:fs";
import { ZUMBA_REF as R, beatTime } from "../../dist/songs/zumbaControl.js";
const out = {
  source: "first 60 s of the supplied Zumba video (155 s, 1920x1080, 30 fps, AAC 48 kHz). The audio/video are NOT in the repo.",
  method: {
    tempo: "MEASURED: onset-envelope grid fit on the audio (ffmpeg + numpy) -> 126 BPM, first beat 0.27 s",
    cuts_and_black: "MEASURED: frame differencing at 30 fps",
    moves: "JUDGED BY EYE from contact sheets (2 frames/s). No pose model was available offline, so there was no automatic skeleton extraction. Each move is the nearest of the game's trackable poses, not a frame-accurate transcription.",
  },
  bpm: R.bpm, firstBeatSec: R.firstBeatSec, danceStartsSec: R.danceStartsSec, cutsSec: R.cutsSec, blackSec: R.blackSec,
  moves: R.moves.map(([beat, pose, seen]) => ({ beat, timeSec: +beatTime(beat).toFixed(2), pose, seen })),
};
fs.writeFileSync(new URL("./soda-pop-60s.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(out.moves.length + " moves written");
