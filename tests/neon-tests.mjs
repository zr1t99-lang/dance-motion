// "Neon Crush": original K-pop-style song + dance. Data sanity, the music render, and the scoring logic with synthetic players.
// It does NOT judge how the music sounds or whether the dance is fun - that needs a human.
import assert from "node:assert/strict";
import { buildNeonCrush, DANCE, POSES, BPM, TOTAL_BEATS, SECTIONS } from "../dist/songs/neonCrush.js";
import { buildNeonCrushScore } from "../dist/songs/neonCrushScore.js";
import { renderSong } from "../dist/synth.js";
import { Choreography, buildRefPose, NEUTRAL } from "../dist/choreography.js";
import { computeFeatures } from "../dist/poseMath.js";
import { ChallengeScorer } from "../dist/scoring.js";

let pass = 0;
const test = (n, f) => { f(); pass++; console.log("  ok  " + n); };
const def = buildNeonCrush();
const ch = new Choreography(def.moves, def.choreo);
const BEAT = 60 / BPM;
const NSC = ch.scoredMoves.length;

console.log("Structure");
test("120 BPM, 30 eight-counts = 240 beats = exactly 2:00; sections tile the song with no gap or overlap", () => {
  assert.equal(def.bpm, 120); assert.equal(TOTAL_BEATS, 240); assert.ok(Math.abs(TOTAL_BEATS * BEAT - 120) < 1e-9);
  let b = 0; for (const s of SECTIONS) { assert.equal(s.startBeat, b, s.name); b += s.beats; } assert.equal(b, TOTAL_BEATS);
});
test("every 8-count of the dance holds exactly 8 beats of moves and uses known poses", () => {
  assert.equal(DANCE.length, 30);
  for (const bar of DANCE) { const t = bar.moves.split(" "); assert.equal(t.length * bar.beats, 8, bar.moves); for (const k of t) assert.ok(POSES[k], k); }
});
test("moves land on the beat grid, strictly increasing, all inside the song; the first 8-count is an unscored watch bar", () => {
  const a = ch.moves.map((m) => m.at);
  for (let i = 1; i < a.length; i++) assert.ok(a[i] > a[i - 1], "order " + i);
  for (const m of ch.moves.filter((x) => x.id !== "finish")) { const n = m.at / (BEAT / 2); assert.ok(Math.abs(n - Math.round(n)) < 1e-9, m.id); assert.ok(m.at < TOTAL_BEATS * BEAT); }
  assert.ok(ch.scoredMoves[0].at >= 8 * BEAT);
  assert.ok(NSC >= 55 && NSC <= 90, "scored " + NSC);
});
test("variety: no two consecutive moves are the same pose, and each of the 3 choruses has a different second half", () => {
  const toks = DANCE.flatMap((b) => b.moves.split(" "));
  for (let i = 1; i < toks.length; i++) assert.notEqual(toks[i], toks[i - 1], "repeat at " + i);
  const ch1 = DANCE.slice(7, 11).map((b) => b.moves).join("|"), ch2 = DANCE.slice(18, 22).map((b) => b.moves).join("|"), ch3 = DANCE.slice(24, 28).map((b) => b.moves).join("|");
  assert.notEqual(ch1, ch2); assert.notEqual(ch2, ch3); assert.notEqual(ch1, ch3);
  assert.ok(new Set(toks).size >= 20, "distinct poses " + new Set(toks).size);
});
test("every move is within sane limits and the dance really uses arms, legs, hips and knee bends", () => {
  for (const m of ch.moves) {
    for (const k of ["rUpper", "rFore", "lUpper", "lFore", "rThigh", "rShin", "lThigh", "lShin"]) assert.ok(Number.isFinite(m.spec[k]) && Math.abs(m.spec[k]) <= 180, m.id + k);
    assert.ok(m.spec.bend >= 0 && m.spec.bend <= 1 && Math.abs(m.spec.hipShift) <= 1.2, m.id);
  }
  const mv = ch.moves.filter((x) => x.id !== "finish");
  assert.ok(mv.some((m) => m.spec.rUpper > 120) && mv.some((m) => m.spec.bend > 0.9) && mv.some((m) => Math.abs(m.spec.hipShift) > 0.5) && mv.some((m) => m.spec.rFore < -100));
});
test("lyrics lie inside the song and in order", () => {
  let last = -1; for (const l of def.lyrics) { assert.ok(l.beat >= last && l.beat + l.len <= TOTAL_BEATS + 8, l.text); last = l.beat; }
});

console.log("Music (synthesised, original)");
const r = renderSong(buildNeonCrushScore(), 32000);
test("renders 120 s + 2 s tail, finite, peak < 0.95, deterministic", () => {
  assert.ok(Math.abs(r.seconds - (TOTAL_BEATS + 4) * BEAT) < 1e-9);
  let peak = 0; for (let i = 0; i < r.left.length; i++) { assert.ok(Number.isFinite(r.left[i]) && Number.isFinite(r.right[i])); peak = Math.max(peak, Math.abs(r.left[i]), Math.abs(r.right[i])); }
  assert.ok(peak > 0.5 && peak < 0.95, "peak " + peak);
  const b = renderSong(buildNeonCrushScore(), 32000);
  assert.equal(Buffer.compare(Buffer.from(r.left.buffer), Buffer.from(b.left.buffer)), 0);
});
test("the song has dynamics: chorus clearly louder than the bridge and the intro; the music never goes silent in the middle", () => {
  const rms = (a, b) => { let s = 0, n = 0; for (let i = Math.floor(a * BEAT * 32000); i < Math.floor(b * BEAT * 32000); i++) { s += r.left[i] ** 2; n++; } return Math.sqrt(s / n); };
  assert.ok(rms(56, 88) > rms(176, 192) * 1.3, `${rms(56, 88)} vs ${rms(176, 192)}`);
  assert.ok(rms(56, 88) > rms(0, 8) * 1.3);
  for (let b = 8; b < 238; b += 4) assert.ok(rms(b, b + 4) > 0.02, "silent at beat " + b);
});
test("kicks sit exactly on the beat grid (sample accurate)", () => {
  const s = buildNeonCrushScore();
  for (const k of s.kick) { const n = k.beat * 4; assert.ok(Math.abs(n - Math.round(n)) < 1e-9, "kick " + k.beat); }
  assert.ok(s.kick.length > 150 && s.sub.length > 100 && s.shout.length > 10 && s.lead.length > 100);
});

console.log("Scoring with synthetic players");
const feat = (spec) => computeFeatures(buildRefPose(spec).map((l) => ({ x: (l.x * 0.18) / (4 / 3) + 0.5, y: l.y * 0.18 + 0.45, z: 0, visibility: l.visibility ? 0.95 : 0 })), 4 / 3);
function run(playerAt) {
  const sc = new ChallengeScorer(ch, def.scoring);
  const base = feat(NEUTRAL);
  for (let t = -3; t <= TOTAL_BEATS * BEAT + 1; t += 1 / 30) { const p = playerAt(t); sc.pushFrame(t, p === null ? base : feat(p)); sc.tick(t); }
  sc.tick(1e9);
  return sc;
}
test("a player who copies the dancers 0.4 s behind -> nearly every move PERFECT/GREAT/GOOD, accuracy high", () => {
  const sc = run((t) => ch.specAt(Math.max(0, t - 0.4)));
  const good = sc.counts.PERFECT + sc.counts.GREAT + sc.counts.GOOD;
  assert.ok(good >= NSC * 0.9, JSON.stringify(sc.counts) + " of " + NSC);
  assert.ok(sc.finalAccuracy > 70, "acc " + sc.finalAccuracy);
});
test("a player who stands still scores 0", () => { const sc = run(() => NEUTRAL); assert.equal(sc.score, 0, JSON.stringify(sc.counts)); });
test("one wrong pose held all song -> far below the right player", () => {
  const right = run((t) => ch.specAt(Math.max(0, t - 0.4)));
  const wrong = run(() => ({ ...NEUTRAL, rUpper: 160, rFore: 170, lUpper: 160, lFore: 170 }));
  assert.ok(wrong.score < right.score * 0.35, `${wrong.score} vs ${right.score}`);
});
test("copying 2.6 s late (grace over) -> many misses", () => {
  const sc = run((t) => ch.specAt(Math.max(0, t - 2.6)));
  assert.ok(sc.counts.MISS >= NSC * 0.3, JSON.stringify(sc.counts));
});
console.log(`\n${pass} neon tests passed`);
