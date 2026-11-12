// Usage (after `tsc -p tsconfig.json`):  node tools/export-wav.mjs [out.wav]
// Renders the Sunshine Shake instrumental with the exact same code the game uses.
import fs from "node:fs";
import { renderSong, encodeWav } from "../dist/synth.js";
import { buildSunshineScore } from "../dist/songs/sunshineScore.js";
const out = process.argv[2] ?? "song-instrumental.wav";
const r = renderSong(buildSunshineScore(), 32000);
fs.writeFileSync(out, encodeWav(r));
console.log(`wrote ${out} (${r.seconds.toFixed(2)} s, ${r.sampleRate} Hz stereo)`);
