// Deterministic checks of the pose-comparison and scoring logic (no camera, no random scores).
// Synthetic "players" are built from the reference skeleton and then distorted, so this tests the
// scoring maths, NOT camera/MediaPipe quality.
import assert from "node:assert/strict";
import { Choreography, MOVES, buildRefPose, refComparable, NEUTRAL, W_DEFAULT } from "../dist/choreography.js";
import { computeFeatures, toComparable, BaselineCapture } from "../dist/poseMath.js";
import { ChallengeScorer, DEFAULT_SCORING, similarity } from "../dist/scoring.js";
import { PoseSmoother } from "../dist/smoothing.js";

let pass = 0;
const test = (name, fn) => {
  fn();
  pass++;
  console.log("  ok  " + name);
};

// Tiny seeded PRNG so the noise in tests is reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
function gauss(r) {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}

/** Place a reference skeleton into a "camera image": different body size, position, aspect, noise. */
function asCameraPose(refPose, { scale = 0.18, cx = 0.5, cy = 0.45, aspect = 16 / 9, noise = 0, seed = 1, vis = 0.95, dropVis = [] } = {}) {
  const r = rng(seed);
  return refPose.map((l, i) => ({
    x: (l.x * scale) / aspect + cx + (noise ? (gauss(r) * noise) / aspect : 0),
    y: l.y * scale + cy + (noise ? gauss(r) * noise : 0),
    z: 0,
    visibility: l.visibility ? (dropVis.includes(i) ? 0.05 : vis) : 0,
  }));
}

const choreo = new Choreography();
const scored = choreo.scoredMoves;
const standingBase = (opts) => {
  const f = computeFeatures(asCameraPose(buildRefPose(NEUTRAL), opts), opts?.aspect ?? 16 / 9);
  const c = new BaselineCapture();
  for (let i = 0; i < 10; i++) c.add(f);
  return c.result();
};

console.log("Pose comparison");
test("each reference pose scores ~1 against itself", () => {
  for (const m of scored) {
    const t = refComparable(m.spec);
    const s = similarity(t, t, m.weights, DEFAULT_SCORING, null);
    assert.ok(s.total > 0.999, `${m.id}: ${s.total}`);
  }
});

test("a different body size / camera position / aspect ratio still matches (normalisation)", () => {
  for (const opts of [
    { scale: 0.12, cx: 0.3, cy: 0.5, aspect: 16 / 9 },
    { scale: 0.26, cx: 0.65, cy: 0.4, aspect: 4 / 3 },
    { scale: 0.2, cx: 0.5, cy: 0.5, aspect: 9 / 16 },
  ]) {
    const base = standingBase(opts);
    for (const m of scored) {
      const f = computeFeatures(asCameraPose(buildRefPose(m.spec), opts), opts.aspect);
      const s = similarity(refComparable(m.spec), toComparable(f, base), m.weights, DEFAULT_SCORING, f.segVis);
      assert.ok(s.total > 0.97, `${m.id} @${JSON.stringify(opts)}: ${s.total.toFixed(3)}`);
    }
  }
});

test("a wrong pose scores low (cross-matrix: every other move < 0.7 of its own)", () => {
  const base = standingBase({});
  let worst = 0;
  for (const a of scored) {
    const f = computeFeatures(asCameraPose(buildRefPose(a.spec), {}), 16 / 9);
    for (const b of scored) {
      if (a.id === b.id) continue;
      const s = similarity(refComparable(b.spec), toComparable(f, base), b.weights, DEFAULT_SCORING, f.segVis).total;
      worst = Math.max(worst, s);
    }
  }
  console.log(`        highest wrong-pose similarity across all pairs: ${worst.toFixed(3)}`);
  assert.ok(worst < DEFAULT_SCORING.great, "a wrong move must never reach GREAT: " + worst);
});

test("raise-right vs raise-left are clearly distinguished (left/right not confused)", () => {
  const base = standingBase({});
  const R = scored.find((m) => m.id === "raise-right");
  const L = scored.find((m) => m.id === "raise-left");
  const fR = computeFeatures(asCameraPose(buildRefPose(R.spec), {}), 16 / 9);
  const asR = similarity(refComparable(R.spec), toComparable(fR, base), R.weights, DEFAULT_SCORING, null).total;
  const asL = similarity(refComparable(L.spec), toComparable(fR, base), L.weights, DEFAULT_SCORING, null).total;
  assert.ok(asR > 0.97 && asL < 0.65, `asR ${asR.toFixed(2)} asL ${asL.toFixed(2)}`);
});

test("moderate landmark jitter (~1% of image) still reaches PERFECT on every move", () => {
  const base = standingBase({});
  for (const m of scored) {
    const f = computeFeatures(asCameraPose(buildRefPose(m.spec), { noise: 0.004, seed: 7 }), 16 / 9);
    const s = similarity(refComparable(m.spec), toComparable(f, base), m.weights, DEFAULT_SCORING, f.segVis).total;
    assert.ok(s >= DEFAULT_SCORING.perfect, `${m.id}: ${s.toFixed(3)}`);
  }
});

console.log("Choreography");
test("deterministic: same time => identical pose", () => {
  const a = JSON.stringify(choreo.poseAt(7.3));
  const b = JSON.stringify(new Choreography().poseAt(7.3));
  assert.equal(a, b);
});
test("instructor holds the exact scoring pose at each move time", () => {
  for (const m of scored) {
    const got = JSON.stringify(choreo.poseAt(m.at));
    assert.equal(got, JSON.stringify(buildRefPose(m.spec)), m.id);
  }
});
test("routine is 30 s with the 7 required move types", () => {
  assert.equal(choreo.duration, 30);
  const ids = scored.map((m) => m.id).join(",");
  for (const k of ["raise-right", "raise-left", "both-out", "step-right", "step-left", "bend-knees", "combo"]) assert.ok(ids.includes(k), k);
});

console.log("ChallengeScorer end-to-end (30 fps simulation)");
function simulate(playerAt, { latency = 0, startVisible = true } = {}) {
  const sc = new ChallengeScorer(choreo, DEFAULT_SCORING);
  const events = [];
  const aspect = 16 / 9;
  for (let t = -3; t <= 31; t += 1 / 30) {
    const pose = playerAt(t - latency);
    const f = pose ? computeFeatures(pose, aspect) : null;
    sc.pushFrame(t, f);
    events.push(...sc.tick(t));
  }
  return { sc, events };
}

test("player copies the instructor perfectly (with 0.15 s lag) -> all moves PERFECT, score > 0", () => {
  const { sc, events } = simulate((t) => asCameraPose(choreo.poseAt(Math.max(0, t)), { noise: 0.002, seed: 3 }), { latency: 0.15 });
  assert.equal(events.length, 9);
  assert.equal(sc.counts.PERFECT, 9, JSON.stringify(sc.counts));
  assert.equal(sc.maxCombo, 9);
  assert.ok(sc.score > 9000);
  console.log(`        score ${sc.score}, accuracy ${sc.finalAccuracy.toFixed(1)}%`);
});

test("late by 0.5 s (inside tolerance) still scores, but lower than on-time", () => {
  const on = simulate((t) => asCameraPose(choreo.poseAt(Math.max(0, t)), {}), { latency: 0 });
  const late = simulate((t) => asCameraPose(choreo.poseAt(Math.max(0, t)), {}), { latency: 0.5 });
  assert.ok(late.sc.finalAccuracy < on.sc.finalAccuracy);
  assert.ok(late.sc.finalAccuracy > 50);
  console.log(`        on-time ${on.sc.finalAccuracy.toFixed(1)}%  vs 0.5 s late ${late.sc.finalAccuracy.toFixed(1)}%`);
});

test("late by 1.5 s (outside the tolerance window) is penalised heavily", () => {
  const late = simulate((t) => asCameraPose(choreo.poseAt(Math.max(0, t)), {}), { latency: 1.5 });
  assert.ok(late.sc.counts.PERFECT < 4, JSON.stringify(late.sc.counts));
});

test("player NOT DETECTED the whole time -> zero points, all MISS, accuracy 0", () => {
  const { sc, events } = simulate(() => null);
  assert.equal(events.length, 9);
  assert.equal(sc.counts.MISS, 9);
  assert.equal(sc.score, 0);
  assert.equal(sc.finalAccuracy, 0);
});

test("landmarks present but invisible (visibility 0.05) -> zero points", () => {
  const { sc } = simulate((t) => asCameraPose(choreo.poseAt(Math.max(0, t)), { vis: 0.05 }));
  assert.equal(sc.score, 0);
  assert.equal(sc.counts.MISS, 9);
});

test("tracking lost for part of the routine -> only those moves are lost", () => {
  const { sc, events } = simulate((t) => (t > 10 && t < 17 ? null : asCameraPose(choreo.poseAt(Math.max(0, t)), {})));
  const missed = events.filter((e) => e.judgment === "MISS").map((e) => e.move.id);
  console.log("        missed while hidden:", missed.join(", "));
  assert.deepEqual(missed.sort(), ["step-left", "step-right"]); // bend-knees window opens at 17.3 s, after tracking returned at 17 s
  assert.equal(sc.combo >= 0, true);
});

test("player stands still in neutral pose -> no PERFECT/GREAT anywhere", () => {
  const { sc } = simulate(() => asCameraPose(buildRefPose(NEUTRAL), {}));
  console.log(`        counts ${JSON.stringify(sc.counts)}, accuracy ${sc.finalAccuracy.toFixed(1)}%`);
  assert.equal(sc.counts.PERFECT + sc.counts.GREAT, 0);
});

test("scoring is deterministic (two identical runs -> identical results)", () => {
  const run = () => simulate((t) => asCameraPose(choreo.poseAt(Math.max(0, t)), { noise: 0.003, seed: 11 }), { latency: 0.1 }).sc;
  const a = run();
  const b = run();
  assert.equal(a.score, b.score);
  assert.equal(a.finalAccuracy, b.finalAccuracy);
});

test("no baseline captured (player never seen during countdown) -> cannot score", () => {
  const sc = new ChallengeScorer(choreo, DEFAULT_SCORING);
  for (let t = 0; t <= 31; t += 1 / 30) {
    sc.pushFrame(t, computeFeatures(asCameraPose(choreo.poseAt(t), {}), 16 / 9));
    sc.tick(t);
  }
  assert.equal(sc.score, 0);
});

console.log("Smoothing");
test("one-euro filter reduces jitter on a static pose but follows fast motion", () => {
  const sm = new PoseSmoother({ minCutoff: 1.2, beta: 4 });
  const r = rng(5);
  const base = asCameraPose(buildRefPose(NEUTRAL), {});
  let rawVar = 0, smVar = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const noisy = base.map((l) => ({ ...l, x: l.x + gauss(r) * 0.005, y: l.y + gauss(r) * 0.005 }));
    const out = sm.apply(noisy, i / 30);
    if (i > 30) {
      rawVar += (noisy[16].x - base[16].x) ** 2;
      smVar += (out[16].x - base[16].x) ** 2;
      n++;
    }
  }
  console.log(`        wrist jitter RMS: raw ${Math.sqrt(rawVar / n).toFixed(4)} -> smoothed ${Math.sqrt(smVar / n).toFixed(4)}`);
  assert.ok(smVar < rawVar * 0.5);
  // fast step: after 0.2 s the filter should be most of the way there
  const sm2 = new PoseSmoother({ minCutoff: 1.2, beta: 4 });
  const a = base, b = base.map((l) => ({ ...l, x: l.x + 0.3 }));
  for (let i = 0; i < 20; i++) sm2.apply(a, i / 30);
  let out;
  for (let i = 20; i < 27; i++) out = sm2.apply(b, i / 30);
  assert.ok(out[16].x - a[16].x > 0.25, "filter lag too high: " + (out[16].x - a[16].x));
});

console.log("Free-movement retargeting");
import { Retargeter, Locomotion, RIG } from "../dist/retarget.js";
{
  const V = () => Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  const seenAll = new Array(33).fill(true);
  // A "tracked" skeleton with deliberately WRONG limb lengths (like noisy depth) and an arbitrary dance pose.
  function tracked(scale, r) {
    const J = V();
    const set = (i, x, y, z) => (J[i] = { x, y, z });
    set(23, 0.1, 0, 0); set(24, -0.1, 0, 0);
    set(11, 0.2, 0.5, 0.05); set(12, -0.2, 0.5, -0.05);
    set(13, 0.5 * scale, 0.7, 0.2); set(15, 0.9 * scale, 0.9, 0.5);       // left arm up-and-out, long
    set(14, -0.3, 0.3, 0.1); set(16, -0.35, 0.05, 0.3);                    // right arm down-forward
    set(25, 0.12, -0.45, 0.1); set(27, 0.13, -0.9, 0.0);
    set(26, -0.2, -0.4, 0.3); set(28, -0.25, -0.8, 0.5);                   // right leg kicked forward
    set(7, 0.07, 0.72, 0.0); set(8, -0.07, 0.72, 0.0); set(0, 0.0, 0.72, 0.12);
    set(29, 0.13, -0.95, -0.05); set(31, 0.13, -0.96, 0.15); set(30, -0.25, -0.85, 0.45); set(32, -0.25, -0.86, 0.65);
    return J;
  }
  const len = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const unit = (a, b) => { const l = len(a, b) || 1; return [(b.x - a.x) / l, (b.y - a.y) / l, (b.z - a.z) / l]; };

  test("retargeted bones always have the rig's fixed lengths (no stretching)", () => {
    for (const k of [0.6, 1, 1.7]) {
      const J = tracked(k), out = V(), rt = new Retargeter();
      rt.solve(J, out, seenAll);
      for (const [a, b, L] of [[11, 13, RIG.upper], [13, 15, RIG.fore], [12, 14, RIG.upper], [14, 16, RIG.fore], [23, 25, RIG.thigh], [25, 27, RIG.shin], [24, 26, RIG.thigh], [26, 28, RIG.shin]])
        assert.ok(Math.abs(len(out[a], out[b]) - L) < 1e-9, `bone ${a}-${b}: ${len(out[a], out[b])}`);
    }
  });
  test("bone DIRECTIONS (the dance movement) are copied exactly from the player", () => {
    const J = tracked(1), out = V();
    new Retargeter().solve(J, out, seenAll);
    for (const [a, b] of [[13, 15], [14, 16], [25, 27], [26, 28]]) {
      const d0 = unit(J[a], J[b]), d1 = unit(out[a], out[b]);
      assert.ok(Math.abs(d0[0] - d1[0]) + Math.abs(d0[1] - d1[1]) + Math.abs(d0[2] - d1[2]) < 1e-9, `dir ${a}-${b}`);
    }
  });
  test("a limb pointing the other way produces the opposite direction (left/right/up/down not confused)", () => {
    const J = tracked(1), J2 = tracked(1);
    J2[15] = { x: J[13].x + 0.3, y: J[13].y - 0.5, z: J[13].z };            // forearm now points DOWN instead of up
    const a = V(), b = V();
    new Retargeter().solve(J, a, seenAll); new Retargeter().solve(J2, b, seenAll);
    assert.ok(a[15].y > a[13].y && b[15].y < b[13].y);
  });
  test("degenerate input (all joints identical / missing feet / unseen face) never produces NaN", () => {
    const J = V(), out = V(), rt = new Retargeter();
    rt.solve(J, out, new Array(33).fill(false));
    for (const p of out) assert.ok(Number.isFinite(p.x + p.y + p.z));
    for (const f of [rt.face, rt.footL, rt.footR]) assert.ok(Number.isFinite(f.x + f.y + f.z) && Math.abs(Math.hypot(f.x, f.y, f.z) - 1) < 1e-6);
  });
  test("head turns with the nose; feet follow heel->toe", () => {
    const J = tracked(1), out = V(), rt = new Retargeter();
    J[0] = { x: 0.11, y: 0.72, z: 0.02 };                                   // nose far to the player's left => head yawed
    for (let i = 0; i < 12; i++) rt.solve(J, out, seenAll);
    assert.ok(rt.face.x > 0.8, "face.x " + rt.face.x);
    assert.ok(rt.footR.z > 0.9 && rt.footL.z > 0.9);
    J[31] = { x: 0.6, y: J[29].y, z: J[29].z };                             // left toe pointing sideways
    for (let i = 0; i < 12; i++) rt.solve(J, out, seenAll);
    assert.ok(rt.footL.x > 0.9, "footL.x " + rt.footL.x);
  });

  const img = (ankleY, hipX = 0.5) => {
    const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    p[11] = { x: hipX + 0.03, y: 0.3, visibility: 1 }; p[12] = { x: hipX - 0.03, y: 0.3, visibility: 1 };
    p[23] = { x: hipX + 0.02, y: 0.5, visibility: 1 }; p[24] = { x: hipX - 0.02, y: 0.5, visibility: 1 };
    p[27] = { x: hipX + 0.02, y: ankleY, visibility: 1 }; p[28] = { x: hipX - 0.02, y: ankleY, visibility: 1 };
    return p;
  };
  test("standing still -> no lift; jumping -> avatar rises; landing -> back to 0", () => {
    const lo = new Locomotion();
    let t = 0, last;
    for (; t < 2; t += 1 / 30) last = lo.update(img(0.9), 4 / 3, t);
    assert.ok(last.lift < 0.01, "still " + last.lift);
    let peak = 0;
    for (let k = 0; k < 10; k++, t += 1 / 30) peak = Math.max(peak, lo.update(img(0.9 - 0.08 * Math.sin((k / 9) * Math.PI)), 4 / 3, t).lift);
    assert.ok(peak > 0.15, "peak " + peak);
    for (let k = 0; k < 6; k++, t += 1 / 30) last = lo.update(img(0.9), 4 / 3, t);
    assert.ok(last.lift < 0.03, "landed " + last.lift);
  });
  test("stepping on one foot (other foot raised) is NOT a jump", () => {
    const lo = new Locomotion();
    let t = 0;
    for (; t < 1.5; t += 1 / 30) lo.update(img(0.9), 4 / 3, t);
    const p = img(0.9); p[27].y = 0.8; // one ankle lifted
    assert.ok(lo.update(p, 4 / 3, t).lift < 0.01);
  });
  test("walking away from the camera slowly (feet drift up the image) is not a jump", () => {
    const lo = new Locomotion();
    let t = 0, worst = 0;
    for (let k = 0; k < 120; k++, t += 1 / 30) worst = Math.max(worst, lo.update(img(0.9 - k * 0.0008), 4 / 3, t).lift);
    assert.ok(worst < 0.08, "worst " + worst);
  });
  test("sideways travel scales with the body and is signed", () => {
    const lo = new Locomotion();
    const a = lo.update(img(0.9, 0.7), 4 / 3, 0).x, b = lo.update(img(0.9, 0.3), 4 / 3, 0.03).x;
    assert.ok(a > 0.5 && b < -0.5, `${a} ${b}`);
  });
}

console.log(`\n${pass} tests passed`);
