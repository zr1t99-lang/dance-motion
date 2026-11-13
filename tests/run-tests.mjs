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

test("late by 0.5 s -> no meaningful penalty (same judgments, accuracy within 3 points)", () => {
  const on = simulate((t) => asCameraPose(choreo.poseAt(Math.max(0, t)), {}), { latency: 0 });
  const late = simulate((t) => asCameraPose(choreo.poseAt(Math.max(0, t)), {}), { latency: 0.5 });
  assert.ok(on.sc.finalAccuracy - late.sc.finalAccuracy < 3, `${on.sc.finalAccuracy} vs ${late.sc.finalAccuracy}`);
  assert.equal(late.sc.counts.PERFECT, on.sc.counts.PERFECT);
  assert.equal(late.sc.counts.MISS, 0);
  console.log(`        on-time ${on.sc.finalAccuracy.toFixed(1)}%  vs 0.5 s late ${late.sc.finalAccuracy.toFixed(1)}%`);
});

test("late by 1.0 s and by 1.9 s (inside the 2 s grace) -> every move accepted, combo never broken", () => {
  for (const latency of [1.0, 1.9]) {
    const late = simulate((t) => asCameraPose(choreo.poseAt(Math.max(0, t)), {}), { latency });
    assert.equal(late.sc.counts.MISS, 0, `${latency}: ${JSON.stringify(late.sc.counts)}`);
    assert.equal(late.sc.maxCombo, 9);
    assert.ok(late.sc.counts.PERFECT + late.sc.counts.GREAT + late.sc.counts.GOOD >= 8, JSON.stringify(late.sc.counts));
    console.log(`        ${latency} s late: ${JSON.stringify(late.sc.counts)} accuracy ${late.sc.finalAccuracy.toFixed(1)}%`);
  }
});

test("late by 2.6 s (well past the grace period) -> the moves are missed", () => {
  const late = simulate((t) => asCameraPose(choreo.poseAt(Math.max(0, t)), {}), { latency: 2.6 });
  assert.ok(late.sc.counts.MISS >= 6, JSON.stringify(late.sc.counts));
});

test("MISS is never shown before the grace period is over", () => {
  const sc = new ChallengeScorer(choreo, DEFAULT_SCORING);
  const f0 = computeFeatures(asCameraPose(buildRefPose(NEUTRAL), {}), 16 / 9);
  const first = scored[0];
  for (let t = -3; t <= first.at + 1.95; t += 1 / 30) {
    sc.pushFrame(t, f0);
    const ev = sc.tick(t);
    assert.equal(ev.filter((e) => e.index === 0).length, 0, `judged at ${t.toFixed(2)}`);
  }
  let missAt = null;
  for (let t = first.at + 1.95; t <= first.at + 2.3; t += 1 / 30) {
    sc.pushFrame(t, f0);
    for (const e of sc.tick(t)) if (e.index === 0) missAt = t - first.at;
  }
  assert.ok(missAt !== null && missAt > 2.0, `MISS at ${missAt}`);
  assert.equal(sc.results[0].judgment === "MISS" || sc.results[0].judgment === null, true);
});

test("player NOT DETECTED the whole time -> no points, but NO MISS either (moves skipped)", () => {
  const { sc, events } = simulate(() => null);
  assert.equal(events.length, 0);
  assert.equal(sc.counts.MISS, 0);
  assert.equal(sc.skippedCount, 9);
  assert.equal(sc.score, 0);
});

test("landmarks present but invisible (visibility 0.05) -> zero points, no MISS", () => {
  const { sc } = simulate((t) => asCameraPose(choreo.poseAt(Math.max(0, t)), { vis: 0.05 }));
  assert.equal(sc.score, 0);
  assert.equal(sc.counts.MISS, 0);
});

test("tracking lost for 7 s -> the moves inside the gap are skipped (combo kept), the rest are judged", () => {
  const { sc } = simulate((t) => (t > 10 && t < 17 ? null : asCameraPose(choreo.poseAt(Math.max(0, t)), {})));
  console.log("        counts", JSON.stringify(sc.counts), "skipped", sc.skippedCount, "maxCombo", sc.maxCombo);
  assert.equal(sc.counts.MISS, 0);
  assert.ok(sc.skippedCount >= 1);
});

test("a short tracking drop (0.6 s) during a move does not turn it into a MISS", () => {
  const { sc } = simulate((t) => (t > 4.0 && t < 4.6 ? null : asCameraPose(choreo.poseAt(Math.max(0, t)), {})));
  assert.equal(sc.counts.MISS, 0);
  assert.equal(sc.maxCombo, 9);
});

test("player does nothing at all (stands in neutral, tracked) -> MISS only after the grace period, never PERFECT/GREAT", () => {
  const { sc } = simulate(() => asCameraPose(buildRefPose(NEUTRAL), {}));
  console.log(`        counts ${JSON.stringify(sc.counts)}, accuracy ${sc.finalAccuracy.toFixed(1)}%`);
  assert.equal(sc.counts.PERFECT + sc.counts.GREAT, 0);
  assert.ok(sc.counts.MISS >= 6, JSON.stringify(sc.counts));
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
import { Stance, STANCE } from "../dist/stance.js";
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

  test("lockFace: the head keeps facing the screen however the nose/ears turn", () => {
    const rt = new Retargeter(); rt.lockFace = true;
    const J = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 })); const out = J.map(() => ({ x: 0, y: 0, z: 0 }));
    J[11] = { x: 0.2, y: 0.5, z: 0 }; J[12] = { x: -0.2, y: 0.5, z: 0 }; J[23] = { x: 0.1, y: 0, z: 0 }; J[24] = { x: -0.1, y: 0, z: 0 };
    J[7] = { x: 0.07, y: 0.72, z: 0 }; J[8] = { x: -0.07, y: 0.72, z: 0 }; J[0] = { x: 0.5, y: 0.72, z: 0.1 }; // nose far to the side
    const seen = Array(33).fill(true);
    for (let i = 0; i < 20; i++) rt.solve(J, out, seen);
    assert.ok(rt.face.z > 0.999 && Math.abs(rt.face.x) < 1e-6, `face ${rt.face.x},${rt.face.z}`);
  });
  const img = (ankleY, hipX = 0.5) => {
    const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    p[11] = { x: hipX + 0.03, y: 0.3, visibility: 1 }; p[12] = { x: hipX - 0.03, y: 0.3, visibility: 1 };
    p[23] = { x: hipX + 0.02, y: 0.5, visibility: 1 }; p[24] = { x: hipX - 0.02, y: 0.5, visibility: 1 };
    p[27] = { x: hipX + 0.02, y: ankleY, visibility: 1 }; p[28] = { x: hipX - 0.02, y: ankleY, visibility: 1 };
    return p;
  };
  test("the character has no lift at all: a foot rising in the image can never float her", () => {
    const lo = new Locomotion();
    let t = 0, last;
    for (; t < 2; t += 1 / 30) last = lo.update(img(0.9), 4 / 3, t);
    for (let k = 0; k < 10; k++, t += 1 / 30) last = lo.update(img(0.9 - 0.08 * Math.sin((k / 9) * Math.PI)), 4 / 3, t);
    assert.equal(last.lift, undefined);
    assert.ok(Math.abs(last.x) < 1e-6, "x " + last.x);
  });
  test("leaning / bending forward does not slide the character (scale comes from the image-plane torso in metres)", () => {
    const lo = new Locomotion();
    const world = (len) => { const w = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
      w[11] = { x: 0.1, y: -len, z: 0, visibility: 1 }; w[12] = { x: -0.1, y: -len, z: 0, visibility: 1 }; w[23] = { x: 0.08, y: 0, z: 0, visibility: 1 }; w[24] = { x: -0.08, y: 0, z: 0, visibility: 1 }; return w; };
    let t = 0, x0;
    const frame = (torsoImg, len) => { const p = img(0.9, 0.62); p[11].y = p[12].y = 0.5 - torsoImg; return lo.update(p, 4 / 3, (t += 1 / 30), world(len)).x; };
    for (let k = 0; k < 60; k++) x0 = frame(0.2, 0.5);
    let worst = 0;
    for (let k = 0; k < 20; k++) worst = Math.max(worst, Math.abs(frame(0.2 * 0.6, 0.5 * 0.6) - x0)); // torso projected 40 % shorter on screen AND in world
    assert.ok(worst < 0.08, `slid ${worst} m while leaning`);
  });
  test("sideways travel scales with the body and is signed", () => {
    const lo = new Locomotion();
    const a = lo.update(img(0.9, 0.7), 4 / 3, 0).x, b = lo.update(img(0.9, 0.3), 4 / 3, 0.03).x;
    assert.ok(a > 0.5 && b < -0.5, `${a} ${b}`);
  });
}

console.log("Planted-foot stance (the character stands on the floor and does not skate)");
{
  const run = (frames, dt = 1 / 30) => { const s = new Stance(); const out = []; for (const f of frames) out.push({ g: s.update(f.p, f.ax, f.ay, dt), f }); return { s, out }; };
  const rng = (() => { let a = 12345; return () => ((a = (a * 1664525 + 1013904223) % 4294967296) / 4294967296) - 0.5; })();
  const footX = (o, i) => o.g + o.f.ax[i];
  test("swaying the body over two planted feet (feet truly fixed) -> feet stay put within 1 cm", () => {
    const fr = []; for (let k = 0; k < 240; k++) { const sway = 0.06 * Math.sin(k / 12); fr.push({ p: sway, ax: [0.1 - sway, -0.1 - sway], ay: [0, 0] }); }
    const { out } = run(fr); const xs = out.map((o) => footX(o, 0));
    assert.ok(Math.max(...xs) - Math.min(...xs) < 0.01, "spread " + (Math.max(...xs) - Math.min(...xs)));
  });
  test("tracking noise (1 cm hips, 2 cm ankles) -> pelvis jitter < 1.5 cm", () => {
    const fr = []; for (let k = 0; k < 300; k++) fr.push({ p: rng() * 0.02, ax: [0.1 + rng() * 0.04, -0.1 + rng() * 0.04], ay: [rng() * 0.02, rng() * 0.02] });
    const { out } = run(fr); const gs = out.slice(30).map((o) => o.g); const m = gs.reduce((a, b) => a + b) / gs.length;
    const sd = Math.sqrt(gs.reduce((a, b) => a + (b - m) ** 2, 0) / gs.length);
    assert.ok(sd < 0.015, "sd " + sd);
  });
  test("one foot kicked 40 cm sideways and back while the other is planted -> the character does not move (<1.5 cm)", () => {
    const fr = []; for (let k = 0; k < 120; k++) { const ph = Math.max(0, Math.sin((k / 119) * Math.PI)); fr.push({ p: 0, ax: [0.1 + 0.4 * ph * ph, -0.1], ay: [0.25 * ph, 0] }); }
    const { out } = run(fr); const gs = out.map((o) => o.g);
    assert.ok(Math.max(...gs.map(Math.abs)) < 0.015, "moved " + Math.max(...gs.map(Math.abs)));
  });
  test("a straight-leg kick (foot lifts only 4 cm but swings 30 cm out in 0.5 s) does not drag the body (< 1.5 cm)", () => {
    const fr = []; for (let k = 0; k < 150; k++) { const ph = Math.max(0, Math.sin(((k - 20) / 30) * Math.PI)); fr.push({ p: 0, ax: [0.1 + 0.3 * ph, -0.1], ay: [0.04 * ph, 0] }); }
    const { out } = run(fr); const m = Math.max(...out.map((o) => Math.abs(o.g)));
    assert.ok(m < 0.015, "dragged " + m);
  });
  test("a real side step of 0.6 m -> the character follows and lands within 8 cm; never faster than the speed cap", () => {
    const fr = []; for (let k = 0; k < 150; k++) { const p = Math.min(0.6, Math.max(0, (k - 30) / 30 * 0.6)); fr.push({ p, ax: [0.1, -0.1], ay: [0, 0] }); }
    const { out } = run(fr); const end = out[out.length - 1].g;
    assert.ok(Math.abs(end - 0.6) < 0.08, "end " + end);
    for (let i = 1; i < out.length; i++) assert.ok(Math.abs(out[i].g - out[i - 1].g) <= STANCE.MAX_SPEED / 30 + 1e-9, "speed at " + i);
  });
  test("stepping: weight moves to the other foot (support switches) -> no jump bigger than 6 cm in one frame", () => {
    const fr = []; for (let k = 0; k < 200; k++) { const ph = k / 200; const p = 0.4 * ph;
      // right foot (index 1) is planted first, then left; the free foot is raised 12 cm
      const leftUp = k < 100 ? 0.12 : 0, rightUp = k < 100 ? 0 : 0.12;
      fr.push({ p, ax: [0.1, -0.1], ay: [leftUp, rightUp] }); }
    const { out } = run(fr);
    for (let i = 1; i < out.length; i++) assert.ok(Math.abs(out[i].g - out[i - 1].g) < 0.06, `jump at ${i}: ${out[i].g - out[i - 1].g}`);
  });
  test("a bouncing foot near the planting threshold does not make the character twitch", () => {
    const fr = []; for (let k = 0; k < 240; k++) fr.push({ p: 0, ax: [0.1, -0.1], ay: [0.045 + 0.03 * Math.sin(k / 3), 0] });
    const { out } = run(fr); assert.ok(Math.max(...out.map((o) => Math.abs(o.g))) < 0.01);
  });
}

console.log(`\n${pass} tests passed`);
