// Party-game scoring: thresholds, 2 s grace, one registration per move, tracking loss != MISS.
// Synthetic players built from the reference skeleton: this tests the scoring LOGIC, not camera/MediaPipe quality.
import assert from "node:assert/strict";
import { Choreography, buildRefPose, refComparable, NEUTRAL } from "../dist/choreography.js";
import { computeFeatures, toComparable, BaselineCapture } from "../dist/poseMath.js";
import { ChallengeScorer, DEFAULT_SCORING, SONG_SCORING, classify, similarity, lateFactor, popupText } from "../dist/scoring.js";
import { ZUMBA_REF, buildZumbaControl, buildZumbaMovesByEye } from "../dist/songs/zumbaControl.js";

let pass = 0;
const test = (n, f) => { f(); pass++; console.log("  ok  " + n); };
const choreo = new Choreography();
const moves = choreo.scoredMoves;
const cam = (pose) => pose.map((l) => ({ x: (l.x * 0.18) / (16 / 9) + 0.5, y: l.y * 0.18 + 0.45, z: 0, visibility: l.visibility ? 0.95 : 0 }));
const feat = (spec) => computeFeatures(cam(buildRefPose(spec)), 16 / 9);
const NEUT = feat(NEUTRAL);
const KEYS = ["rUpper", "rFore", "lUpper", "lFore", "rThigh", "rShin", "lThigh", "lShin"];
const distort = (spec, d) => { const o = { ...spec }; for (const k of KEYS) o[k] = spec[k] + d; return o; };

function sim(target, played, w) {
  const c = new BaselineCapture(); for (let i = 0; i < 10; i++) c.add(NEUT);
  return similarity(refComparable(target), toComparable(feat(played), c.result()), w, DEFAULT_SCORING, null).total;
}
/** The distortion (deg) of move i whose similarity is closest to `want`. */
function distortionFor(i, want) {
  const m = moves[i]; let best = 0, bd = 9;
  for (let d = 0; d <= 90; d += 0.5) { const e = Math.abs(sim(m.spec, distort(m.spec, d), m.weights) - want); if (e < bd) { bd = e; best = d; } }
  return { d: best, s: sim(m.spec, distort(m.spec, best), m.weights) };
}
/** Plays move `i`: neutral, then `played` pose from `from` s after the move for `hold` s, then neutral. */
function playOne(i, played, from, hold, cfg = DEFAULT_SCORING, loseFrom = null, loseTo = null) {
  const sc = new ChallengeScorer(choreo, cfg);
  const m = moves[i]; const fp = feat(played); const events = [];
  const end = m.at + cfg.graceAfter + 1;
  for (let t = -3; t <= end; t += 1 / 30) {
    const on = t >= m.at + from && t < m.at + from + hold;
    const lost = loseFrom !== null && t >= m.at + loseFrom && t < m.at + loseTo;
    sc.pushFrame(t, lost ? null : on ? fp : NEUT);
    events.push(...sc.tick(t));
  }
  return { sc, r: sc.results[i], events: events.filter((e) => e.index === i) };
}

console.log("Thresholds (95 / 85 / 70 / 50 %)");
test("classify: boundaries", () => {
  const c = (x) => classify(x, DEFAULT_SCORING);
  assert.deepEqual([1, 0.95, 0.949, 0.85, 0.849, 0.8, 0.7, 0.699, 0.5, 0.499, 0].map(c),
    ["PERFECT", "PERFECT", "GREAT", "GREAT", "GOOD", "GOOD", "GOOD", "KEEP", "KEEP", "MISS", "MISS"]);
});
test("a move with ~80 % similarity is GOOD (not MISS) through the full scorer", () => {
  const { d, s } = distortionFor(0, 0.8);
  assert.ok(s > 0.76 && s < 0.84, `similarity ${s}`);
  const { r, events } = playOne(0, distort(moves[0].spec, d), 0.5, 1.0);
  console.log(`        distortion ${d} deg -> similarity ${(s * 100).toFixed(0)} %, scorer best ${(r.best * 100).toFixed(0)} % -> ${r.judgment}`);
  assert.equal(r.judgment, "GOOD");
  assert.equal(events.length, 1);
});
test("~60 % similarity -> KEEP GOING (points + combo kept, not MISS); ~90 % -> GREAT", () => {
  const k = distortionFor(0, 0.6), g = distortionFor(0, 0.9);
  const rk = playOne(0, distort(moves[0].spec, k.d), 0.5, 1.0);
  const rg = playOne(0, distort(moves[0].spec, g.d), 0.5, 1.0);
  console.log(`        ${(k.s * 100).toFixed(0)} % -> ${rk.r.judgment} (${rk.sc.score} pts, combo ${rk.sc.combo}); ${(g.s * 100).toFixed(0)} % -> ${rg.r.judgment}`);
  assert.equal(rk.r.judgment, "KEEP"); assert.ok(rk.sc.score > 0 && rk.sc.combo === 1);
  assert.equal(rg.r.judgment, "GREAT");
});
test("the move not performed at all (still tracked) -> MISS, and only at the end of the grace period", () => {
  const { r, events } = playOne(0, NEUTRAL, 0, 0);
  assert.equal(r.judgment, "MISS");
  assert.ok(events[0].text === "MISS");
});

console.log("Grace period");
test("correct move 0.5 s late -> same judgment as on time (PERFECT), no meaningful penalty", () => {
  const on = playOne(0, moves[0].spec, 0.1, 1.0), late = playOne(0, moves[0].spec, 0.5, 1.0);
  assert.equal(on.r.judgment, "PERFECT"); assert.equal(late.r.judgment, "PERFECT");
  assert.ok(Math.abs(on.r.best - late.r.best) < 0.01);
});
test("correct move 1 s late and 2 s late -> accepted", () => {
  const a = playOne(0, moves[0].spec, 1.0, 1.0), b = playOne(0, moves[0].spec, 1.85, 0.6);
  console.log(`        1 s late ${a.r.judgment} ${(a.r.best * 100).toFixed(1)} %,  ~2 s late ${b.r.judgment} ${(b.r.best * 100).toFixed(1)} %`);
  assert.ok(["PERFECT", "GREAT", "GOOD"].includes(a.r.judgment) && a.r.judgment === "PERFECT");
  assert.ok(["PERFECT", "GREAT", "GOOD"].includes(b.r.judgment));
});
test("lateFactor: 1 up to 0.8 s late, never below 0.96 inside the 2 s window", () => {
  for (const x of [-0.3, 0, 0.5, 0.8]) assert.equal(lateFactor(x, DEFAULT_SCORING), 1);
  assert.ok(lateFactor(2, DEFAULT_SCORING) >= 0.96 - 1e-9);
});
test("late but correct move does not break the combo", () => {
  const sc = new ChallengeScorer(choreo, DEFAULT_SCORING);
  for (let t = -3; t <= 31; t += 1 / 30) {
    sc.pushFrame(t, feat(choreo.specAt(Math.max(0, t - 1.7)))); sc.tick(t);
  }
  assert.equal(sc.counts.MISS, 0); assert.equal(sc.maxCombo, 9);
});

console.log("Tracking loss");
test("player outside the camera for the whole window -> no MISS, no combo reset, move skipped", () => {
  const sc = new ChallengeScorer(choreo, DEFAULT_SCORING);
  for (let t = -3; t <= 31; t += 1 / 30) {
    const lost = t > moves[3].at - 0.5 && t < moves[3].at + 2.5;
    sc.pushFrame(t, lost ? null : feat(choreo.specAt(Math.max(0, t - 0.2)))); sc.tick(t);
  }
  assert.equal(sc.counts.MISS, 0); assert.equal(sc.skippedCount, 1);
  assert.equal(sc.results[3].judgment, null);
  assert.equal(sc.maxCombo, 8);
});
test("no MISS popup while the player is out of view", () => {
  const { events } = playOne(0, NEUTRAL, 0, 0, DEFAULT_SCORING, -1, 99);
  assert.equal(events.length, 0);
});

console.log("One registration per move");
test("one pose cannot be credited early to the next identical move (two squats in a row)", () => {
  const def = buildZumbaControl(); const ch = new Choreography(buildZumbaMovesByEye(), def.choreo);
  const sq = ch.scoredMoves.filter((m) => m.id.includes("SQUAT"));
  assert.equal(sq.length, 2, "expects the two consecutive squats of the Zumba routine");
  const run = (until) => {
    const sc = new ChallengeScorer(ch, def.scoring);
    for (let t = -3; t <= 60.5; t += 1 / 30) {
      sc.pushFrame(t, feat(t >= sq[0].at && t < until ? sq[0].spec : NEUTRAL)); sc.tick(t);
    }
    sc.tick(1e9);
    return sc.results.filter((r) => sq.includes(r.move)).map((r) => r.judgment);
  };
  const once = run(sq[0].at + 1.0);          // one squat, then stands up
  const hold = run(sq[1].at + 1.0);          // squat held through the second squat's scheduled time (what the routine shows)
  console.log("        one squat:", once.join(", "), "| squat held through both:", hold.join(", "));
  assert.equal(once.filter((j) => j && j !== "MISS").length, 1, "one squat must not score twice");
  assert.equal(hold.filter((j) => j && j !== "MISS").length, 2);
});
test("the registered move scores exactly once (one event per move)", () => {
  const sc = new ChallengeScorer(choreo, DEFAULT_SCORING); let n = 0;
  for (let t = -3; t <= 31; t += 1 / 30) { sc.pushFrame(t, feat(choreo.specAt(Math.max(0, t - 0.15)))); n += sc.tick(t).length; }
  assert.equal(n, 9);
});

console.log("Feedback text");
test("encouraging texts only; MISS is the only negative text", () => {
  const all = new Set(); for (const j of ["PERFECT", "GREAT", "GOOD", "KEEP", "MISS"]) for (let i = 0; i < 2; i++) all.add(popupText(j, i));
  assert.deepEqual([...all].sort(), ["AMAZING!", "GOOD!", "GREAT!", "KEEP GOING!", "MISS", "NICE MOVE!", "PERFECT!", "YOU GOT THIS!"]);
});
console.log(`\n${pass} forgiving-scoring tests passed`);
