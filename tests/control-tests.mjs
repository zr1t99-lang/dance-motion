// Dance Control (private Zumba test): timeline sanity + scoring logic with synthetic players.
// The move list is POSE-TRACKED from the video (lead dancer, BlazePose world landmarks, 2D angles). These tests check the
// data's sanity and the scoring logic with synthetic players; they do not prove the tracking matches every frame.
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

const NSC = ch.scoredMoves.length;
test("tracked choreography: 126 BPM, 60 s clip, many scored moves, strictly increasing, all within sane angle limits", () => {
  assert.equal(def.bpm, 126);
  assert.ok(NSC >= 25 && NSC <= 100, "scored " + NSC);
  const a = ch.moves.map((m) => m.at);
  for (let i = 1; i < a.length; i++) assert.ok(a[i] > a[i - 1], "order " + i);
  for (const m of ch.moves) {
    for (const k of ["rUpper", "rFore", "lUpper", "lFore", "rThigh", "rShin", "lThigh", "lShin"]) assert.ok(Number.isFinite(m.spec[k]) && Math.abs(m.spec[k]) <= 180, m.id + k);
    assert.ok(m.spec.bend >= 0 && m.spec.bend <= 1 && Math.abs(m.spec.hipShift) <= 1.2, m.id);
  }
});
test("keyframes lie on the half-beat grid and scored moves on whole beats (0.27 s + n * 60/126)", () => {
  for (const m of ch.moves.filter((x) => x.id !== "finish")) {
    const n = (m.at - ZUMBA_REF.firstBeatSec) / (30 / 126);
    assert.ok(Math.abs(n - Math.round(n)) < 0.02, m.id);
  }
  for (const m of ch.scoredMoves) {
    const n = (m.at - ZUMBA_REF.firstBeatSec) / (60 / 126);
    assert.ok(Math.abs(n - Math.round(n)) < 0.02, m.id);
  }
});
test("the tracked dance is real movement: arms reach high and low, legs bend, hips shift", () => {
  const mv = ch.moves.filter((x) => x.id !== "finish");
  assert.ok(mv.some((m) => m.spec.rUpper > 120 || m.spec.lUpper > 120), "arm up");
  assert.ok(mv.some((m) => m.spec.bend > 0.4), "bend");
  assert.ok(mv.some((m) => Math.abs(m.spec.hipShift) > 0.3), "shift");
});
test("no move is placed inside the black cutaways or the pre-dance intro", () => {
  for (const m of ch.scoredMoves) {
    assert.ok(m.at >= ZUMBA_REF.danceStartsSec, m.id);
    for (const [a, b] of ZUMBA_REF.blackSec) assert.ok(!(m.at >= a && m.at <= b), m.id + " in black");
  }
});
test("all moves finish inside the 60 s clip with the timing window", () => {
  const last = ch.scoredMoves.at(-1).at;
  assert.ok(last + def.scoring.graceAfter < 60.5, String(last));
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

const feat = (spec) => computeFeatures(buildRefPose(spec).map((l) => ({ x: (l.x * 0.18) / (4 / 3) + 0.5, y: l.y * 0.18 + 0.45, z: 0, visibility: l.visibility ? 0.95 : 0 })), 4 / 3);
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
test("player does the moves on the beat (0.15 s reaction) -> nearly every move PERFECT/GREAT", () => {
  const sc = run((t) => ch.specAt(Math.max(0, t - 0.15)));
  assert.ok(sc.finalAccuracy > 85, "acc " + sc.finalAccuracy);
  assert.ok(sc.counts.PERFECT + sc.counts.GREAT >= NSC * 0.9, JSON.stringify(sc.counts) + " of " + NSC);
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
test("right moves but 1.2 s late -> still accepted (2 s grace), nothing missed", () => {
  const late = run((t) => ch.specAt(Math.max(0, t - 1.2)));
  assert.equal(late.counts.MISS, 0, JSON.stringify(late.counts));
  assert.ok(late.finalAccuracy > 75, "acc " + late.finalAccuracy);
});
test("right moves but 2.6 s late -> the grace period is over, moves are missed", () => {
  const late = run((t) => ch.specAt(Math.max(0, t - 2.6)));
  assert.ok(late.counts.MISS >= NSC * 0.2, JSON.stringify(late.counts));
});
console.log(`\n${pass} control tests passed`);
