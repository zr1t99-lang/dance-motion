// Checks of the Dance Copy song: music rendering, beat alignment, choreography timing and scoring with synthetic players.
// These verify numbers and logic, NOT how the music sounds and NOT real camera/MediaPipe behaviour.
import assert from "node:assert/strict";
import { renderSong } from "../dist/synth.js";
import { buildSunshineScore } from "../dist/songs/sunshineScore.js";
import { buildSunshineShake, POSES, DANCE } from "../dist/songs/sunshineShake.js";
import { Choreography, buildRefPose, NEUTRAL } from "../dist/choreography.js";
import { computeFeatures } from "../dist/poseMath.js";
import { ChallengeScorer } from "../dist/scoring.js";

let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log("  ok  " + name); };

const song = buildSunshineShake();
const BEAT = 60 / 128;

console.log("Song structure");
test("128 BPM, 29 eight-counts = 232 beats = 108.75 s (inside 90-120 s)", () => {
  assert.equal(song.bpm, 128);
  assert.equal(song.totalBeats, 232);
  assert.ok(Math.abs(song.totalBeats * song.beatSec - 108.75) < 1e-9);
  assert.equal(DANCE.length, 29);
  assert.deepEqual(song.sections.map((s) => s.name), ["Intro", "Verse 1", "Pre-Chorus", "Chorus", "Verse 2", "Pre-Chorus", "Chorus", "Bridge", "Final Chorus", "Outro"]);
  const last = song.sections.at(-1);
  assert.equal(last.startBeat + last.beats, 232);
});
test("lyrics: inside the song, ordered, no overlap, chorus repeats verbatim", () => {
  let end = 0;
  for (const l of song.lyrics) { assert.ok(l.beat >= end - 1e-9, l.text); end = l.beat + l.len; }
  assert.ok(end <= 232 + 1e-9);
  const hook = song.lyrics.filter((l) => l.text === "Shake, shake, sunshine shake!");
  assert.equal(hook.length, 6, "hook sung twice per chorus x3 choruses");
});

console.log("Choreography");
const moves = song.moves;
const scored = moves.filter((m) => m.scored);
test("112 scored moves + unscored first watch-bar; every move lands on an odd beat", () => {
  assert.equal(scored.length, 112);
  assert.equal(moves.filter((m) => !m.scored).length, 5); // 4 watch moves + finish
  for (const m of moves.slice(0, -1)) {
    const beat = m.at / BEAT;
    assert.ok(Math.abs(beat - Math.round(beat)) < 1e-9 && Math.round(beat) % 2 === 1, `${m.id} at beat ${beat}`);
  }
});
test("moves ~0.94 s apart; scorer windows never overlap", () => {
  const c = new Choreography(moves, song.choreo);
  const sc = new ChallengeScorer(c, song.scoring);
  for (let i = 1; i < scored.length; i++) assert.ok(Math.abs(scored[i].at - scored[i - 1].at - 2 * BEAT) < 1e-9);
  for (let i = 1; i < scored.length; i++) {
    const aEnd = scored[i - 1].at + sc.cfg.timingOffset + sc.windowOf(i - 1);
    const bStart = scored[i].at + sc.cfg.timingOffset - sc.windowOf(i);
    assert.ok(aEnd <= bStart + 1e-9, `window ${i}`);
  }
  assert.ok(sc.windowOf(5) > 0.35 && sc.windowOf(5) <= 0.4219, String(sc.windowOf(5)));
});
test("keyframe poses are reached exactly on the beat; decoration (bounce/sway) is zero on beats", () => {
  const c = new Choreography(moves, song.choreo);
  for (const m of scored.slice(0, 40)) {
    const s = c.specAt(m.at);
    for (const k of Object.keys(m.spec)) assert.ok(Math.abs(s[k] - m.spec[k]) < 1e-6, `${m.id} ${k}`);
  }
});
test("dancer is moving smoothly: max pose change between 30 fps frames is small", () => {
  const c = new Choreography(moves, song.choreo);
  let prev = c.specAt(0), worst = 0;
  for (let t = 1 / 30; t < 109; t += 1 / 30) {
    const s = c.specAt(t);
    for (const k of ["rUpper", "lUpper", "rFore", "lFore"]) worst = Math.max(worst, Math.abs(s[k] - prev[k]));
    prev = s;
  }
  assert.ok(worst < 40, `max arm jump per frame ${worst.toFixed(1)}°`);
});
test("chorus signature moves present (side step + arm swing, alternating sky punches, overhead clap)", () => {
  const ids = scored.map((m) => m.id).join(" ");
  for (const k of ["SWING_R", "SWING_L", "SKY_R", "SKY_L", "CLAP", "SQUAT", "WIDE"]) assert.ok(ids.includes(k), k);
  assert.equal(DANCE[8], DANCE[18]); assert.equal(DANCE[9], DANCE[19]); // chorus 1 == chorus 2
});
test("every pose in the library is a distinct, buildable pose", () => {
  const seen = new Map();
  for (const [k, p] of Object.entries(POSES)) {
    const f = computeFeatures(buildRefPose({ ...NEUTRAL, ...p.spec }), 1);
    assert.ok(f, k);
    const key = JSON.stringify(Object.values({ ...NEUTRAL, ...p.spec }));
    assert.ok(!seen.has(key), `${k} duplicates ${seen.get(key)}`);
    seen.set(key, k);
  }
});

console.log("Music rendering");
const rendered = renderSong(buildSunshineScore(), 32000);
test("duration = song + 4 beat tail; no NaN; no clipping; not silent", () => {
  assert.ok(Math.abs(rendered.seconds - 236 * BEAT) < 1e-9);
  assert.equal(rendered.left.length, Math.ceil(rendered.seconds * 32000));
  let peak = 0;
  for (let i = 0; i < rendered.left.length; i++) {
    assert.ok(Number.isFinite(rendered.left[i]) && Number.isFinite(rendered.right[i]));
    peak = Math.max(peak, Math.abs(rendered.left[i]), Math.abs(rendered.right[i]));
  }
  assert.ok(peak > 0.5 && peak <= 1, String(peak));
});
test("deterministic: two renders are bit-identical", () => {
  const b = renderSong(buildSunshineScore(), 32000);
  assert.equal(Buffer.compare(Buffer.from(rendered.left.buffer), Buffer.from(b.left.buffer)), 0);
});
test("kick drum onsets sit on the beat grid (energy jumps right at each four-on-the-floor beat)", () => {
  const sr = 32000, win = Math.round(0.004 * sr);
  const e = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += rendered.left[i] ** 2; return s; };
  let ok = 0, n = 0;
  for (let beat = 32; beat < 220; beat++) { // verses / choruses: kick on every beat
    const n0 = Math.round(beat * BEAT * sr);
    n++;
    if (e(n0, n0 + win) > 3 * e(n0 - win, n0) + 1e-6) ok++;
  }
  assert.ok(ok / n > 0.9, `${ok}/${n}`);
});
test("every 8-count of the song contains sound (no accidental silence); bridge starts quieter than the chorus", () => {
  const rms = [];
  for (let e = 0; e < 29; e++) {
    const a = Math.round(e * 8 * BEAT * 32000), b = Math.round((e + 1) * 8 * BEAT * 32000);
    let s = 0; for (let i = a; i < b; i++) s += rendered.left[i] ** 2;
    rms.push(Math.sqrt(s / (b - a)));
  }
  assert.ok(rms.every((r) => r > 0.02), rms.map((r) => r.toFixed(2)).join(" "));
  assert.ok(rms[22] < rms[8] * 0.6, `bridge ${rms[22]} vs chorus ${rms[8]}`);
});

console.log("Scoring through the whole song (synthetic players, 30 fps)");
function asCameraPose(ref) {
  const aspect = 16 / 9;
  return ref.map((l) => ({ x: (l.x * 0.18) / aspect + 0.5, y: l.y * 0.18 + 0.45, z: 0, visibility: l.visibility ? 0.95 : 0 }));
}
function run(playerAt) {
  const c = new Choreography(moves, song.choreo);
  const sc = new ChallengeScorer(c, song.scoring);
  const events = [];
  for (let t = -3; t <= 110; t += 1 / 30) {
    const pose = playerAt(c, t);
    sc.pushFrame(t, pose ? computeFeatures(pose, 16 / 9) : null);
    events.push(...sc.tick(t));
  }
  events.push(...sc.tick(1e9));
  return { sc, events };
}
test("player copies every move with a realistic 0.15 s lag -> (nearly) all PERFECT", () => {
  const { sc } = run((c, t) => asCameraPose(c.poseAt(Math.max(0, t - 0.15))));
  assert.equal(sc.results.length, 112);
  assert.ok(sc.counts.PERFECT >= 110, JSON.stringify(sc.counts));
  assert.equal(sc.counts.MISS, 0);
  assert.equal(sc.maxCombo, 112);
  assert.ok(sc.finalAccuracy > 85);
});
test("a 0.35 s late player is still credited; a 0.6 s late player loses points (timing counts)", () => {
  const a = run((c, t) => asCameraPose(c.poseAt(Math.max(0, t - 0.35)))).sc;
  const b = run((c, t) => asCameraPose(c.poseAt(Math.max(0, t - 0.6)))).sc;
  assert.ok(a.counts.MISS < 10, JSON.stringify(a.counts));
  assert.ok(b.score < a.score * 0.7, `${a.score} vs ${b.score}`);
});
test("standing still the whole song -> no credit for the moves that differ from neutral (no fake score)", () => {
  const { sc } = run(() => asCameraPose(buildRefPose(NEUTRAL)));
  const nonRest = sc.results.filter((r) => !/REST/.test(r.move.id));
  const credited = nonRest.filter((r) => r.judgment !== "MISS").length;
  assert.ok(credited / nonRest.length < 0.1, `${credited}/${nonRest.length} credited`);
});
test("tracking lost for 12 s: those moves are MISS, the dance goes on and scoring resumes afterwards, combo restarts", () => {
  const { sc, events } = run((c, t) => (t > 30 && t < 42 ? null : asCameraPose(c.poseAt(Math.max(0, t - 0.15)))));
  const missed = events.filter((e) => e.judgment === "MISS");
  assert.ok(missed.length >= 10 && missed.length <= 15, String(missed.length));
  assert.ok(events.at(-1).judgment === "PERFECT");
  assert.ok(sc.maxCombo > 50);
  assert.ok(sc.combo > 30 && sc.combo < 112, String(sc.combo));
  assert.ok(missed.every((e) => e.points === 0));
});
test("no camera at all -> 0 points, every move MISS, but the run still completes", () => {
  const { sc, events } = run(() => null);
  assert.equal(sc.score, 0);
  assert.equal(events.length, 112);
  assert.equal(sc.counts.MISS, 112);
});

console.log(`\n${pass} song tests passed`);
