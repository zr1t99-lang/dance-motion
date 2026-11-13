// Dance Control (private Zumba test): timeline sanity + scoring logic with synthetic players.
// Verifies numbers/logic. It does NOT verify that the move list matches the video frame-by-frame (that was judged by eye).
import assert from "node:assert/strict";
import fs from "node:fs";
import { ZUMBA_REF, buildZumbaControl, beatTime } from "../dist/songs/zumbaControl.js";
import { Choreography, buildRefPose, NEUTRAL } from "../dist/choreography.js";
import { computeFeatures } from "../dist/poseMath.js";
import { ChallengeScorer } from "../dist/scoring.js";

let pass = 0;
const test = (n, f) => { f(); pass++; console.log("  ok  " + n); };
const def = buildZumbaControl();
const ch = new Choreography(def.moves, def.choreo);

test("analysis: 126 BPM, 60 s clip, 22 scored moves, strictly increasing, >= 4 beats apart", () => {
  assert.equal(def.bpm, 126);
  assert.equal(ch.scoredMoves.length, 22);
  const a = ch.scoredMoves.map((m) => m.at);
  for (let i = 1; i < a.length; i++) assert.ok(a[i] - a[i - 1] >= 4 * 60 / 126 - 1e-9, "gap " + i);
});
test("every move lies on the measured beat grid (0.27 s + n * 60/126)", () => {
  for (const m of ch.scoredMoves) {
    const n = (m.at - ZUMBA_REF.firstBeatSec) / (60 / 126);
    assert.ok(Math.abs(n - Math.round(n)) < 1e-9, m.id);
  }
});
test("no move is placed inside the black cutaways or the pre-dance intro", () => {
  for (const m of ch.scoredMoves) {
    assert.ok(m.at >= ZUMBA_REF.danceStartsSec, m.id);
    for (const [a, b] of ZUMBA_REF.blackSec) assert.ok(!(m.at >= a - 0.5 && m.at <= b), m.id + " in black");
  }
});
test("all moves finish inside the 60 s clip with the timing window", () => {
  const last = ch.scoredMoves.at(-1).at;
  assert.ok(last + def.scoring.timingTolerance + def.scoring.timingOffset < 60.5, String(last));
});
test("audio: file-based, only first 60 s, no audio bundled in the repo", () => {
  assert.equal(def.audio, "file");
  assert.ok(Math.abs(def.totalBeats * def.beatSec - 60) < def.beatSec);
  assert.ok(fs.readFileSync(new URL("../.gitignore", import.meta.url), "utf8").includes("private/"));
  for (const d of ["../assets", "../dist"]) {
    const walk = (p) => fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(p + "/" + e.name) : [p + "/" + e.name]);
    const bad = walk(new URL(d, import.meta.url).pathname).filter((f) => /\.(mp3|m4a|wav|mp4|aac)$/i.test(f));
    assert.deepEqual(bad, [], d);
  }
});

const feat = (spec) => computeFeatures(buildRefPose(spec), 4 / 3);
function run(playerAt) {
  const sc = new ChallengeScorer(ch, def.scoring);
  const base = feat(NEUTRAL);
  for (let t = -3; t <= 60.5; t += 1 / 30) {
    sc.pushFrame(t, playerAt(t) === null ? base : feat(playerAt(t)));
    sc.tick(t);
  }
  sc.tick(1e9);
  return sc;
}
test("player does the moves on the beat (0.15 s reaction) -> every move PERFECT/GREAT, accuracy > 85", () => {
  const sc = run((t) => ch.specAt(Math.max(0, t - 0.15)));
  assert.ok(sc.finalAccuracy > 85, "acc " + sc.finalAccuracy);
  assert.equal(sc.counts.PERFECT + sc.counts.GREAT, 22, JSON.stringify(sc.counts));
  assert.ok(sc.counts.PERFECT >= 10, JSON.stringify(sc.counts));
});
test("player stands still -> score 0, no PERFECT/GREAT", () => {
  const sc = run(() => NEUTRAL);
  assert.equal(sc.score, 0);
  assert.equal(sc.counts.PERFECT + sc.counts.GREAT, 0);
});
test("player does one wrong pose all the time -> far below the right player", () => {
  const right = run((t) => ch.specAt(Math.max(0, t - 0.15)));
  const wrong = run(() => ({ ...NEUTRAL, rUpper: 160, rFore: 170, lUpper: 160, lFore: 170 }));
  assert.ok(wrong.score < right.score * 0.35, `${wrong.score} vs ${right.score}`);
});
test("right moves but 1.2 s late -> clearly penalised", () => {
  const right = run((t) => ch.specAt(Math.max(0, t - 0.15)));
  const late = run((t) => ch.specAt(Math.max(0, t - 1.2)));
  assert.ok(late.score < right.score * 0.6, `${late.score} vs ${right.score}`);
});
console.log(`\n${pass} control tests passed`);
