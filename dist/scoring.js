import { angleDiff, BaselineCapture, toComparable } from "./poseMath.js";
import { refComparable } from "./choreography.js";
export const DEFAULT_SCORING = {
    timingTolerance: 0.7,
    perfect: 0.85,
    great: 0.7,
    good: 0.5,
    minVisibleForScoring: 10,
    angleTol: 12,
    angleMax: 60,
    posTol: 0.12,
    posMax: 0.6,
    shiftTol: 0.1,
    shiftMax: 0.5,
    heightTol: 0.05,
    heightMax: 0.3,
    confFull: 0.7,
    confZero: 0.35,
    timingOffset: 0,
    gateStrength: 0.4,
};
/** Scoring settings for music-driven dances (moves every ~0.94 s): small, centred timing windows. */
export const SONG_SCORING = { ...DEFAULT_SCORING, timingOffset: 0.15, gateStrength: 0.2 };
/** Share of the angle/position score taken from the worse arm (rest = weighted mean of all limbs). */
const ARM_MIN_BLEND = 0.7;
const falloff = (err, tol, max) => Math.min(1, Math.max(0, 1 - (err - tol) / (max - tol)));
/** Pure comparison of a player's pose to a reference pose (0..1). No randomness. */
export function similarity(ref, player, w, cfg, segVis) {
    // Joint angle differences
    const segScore = [];
    let aNum = 0;
    let aDen = 0;
    for (let i = 0; i < 8; i++) {
        const wi = i < 4 ? w.arm : w.leg;
        let s = falloff(angleDiff(player.angles[i], ref.angles[i]), cfg.angleTol, cfg.angleMax);
        if (segVis && segVis[i] < 0.5)
            s = 0;
        segScore.push(s);
        aNum += wi * s;
        aDen += wi;
    }
    const aMean = aDen ? aNum / aDen : 0;
    // Relative landmark positions (torso-normalised, so body size doesn't matter)
    const ptScore = [];
    let pNum = 0;
    let pDen = 0;
    for (let i = 0; i < 8; i++) {
        const wi = i < 4 ? w.arm : w.leg;
        const e = Math.hypot(player.rel[2 * i] - ref.rel[2 * i], player.rel[2 * i + 1] - ref.rel[2 * i + 1]);
        const s = falloff(e, cfg.posTol, cfg.posMax);
        ptScore.push(s);
        pNum += wi * s;
        pDen += wi;
    }
    const pMean = pDen ? pNum / pDen : 0;
    // A wrong arm must not be averaged away by three right limbs: blend the mean with the
    // worst arm. (Legs are only in the mean: their 2D angles are less reliable face-on.)
    let angle = aMean;
    let position = pMean;
    if (w.arm >= 0.5) {
        const armA = Math.min((segScore[0] + segScore[1]) / 2, (segScore[2] + segScore[3]) / 2);
        const armP = Math.min((ptScore[0] + ptScore[2]) / 2, (ptScore[1] + ptScore[3]) / 2);
        angle = ARM_MIN_BLEND * armA + (1 - ARM_MIN_BLEND) * aMean;
        position = ARM_MIN_BLEND * armP + (1 - ARM_MIN_BLEND) * pMean;
    }
    const shift = falloff(Math.abs(player.shift - ref.shift), cfg.shiftTol, cfg.shiftMax);
    const height = falloff(Math.abs(player.legRel - ref.legRel), cfg.heightTol, cfg.heightMax);
    const wsum = w.angle + w.pos + w.shift + w.height;
    // Gate: body travel / squat depth that doesn't match the reference (e.g. stepping sideways or
    // squatting when the move is "just raise an arm") scales the whole score down.
    const gate = 1 - cfg.gateStrength + cfg.gateStrength * Math.min(shift, height);
    const total = ((angle * w.angle + position * w.pos + shift * w.shift + height * w.height) / wsum) * gate;
    return { total, angle, position, shift, height };
}
export function confidenceFactor(conf, cfg) {
    return Math.min(1, Math.max(0, (conf - cfg.confZero) / (cfg.confFull - cfg.confZero)));
}
/** 1 inside the central 35% of the window, falling linearly to 0.7 at its edge. */
export function timingFactor(dt, tol) {
    const a = Math.abs(dt);
    const core = tol * 0.35;
    if (a <= core)
        return 1;
    return 1 - 0.3 * Math.min(1, (a - core) / (tol - core));
}
export function classify(score, cfg) {
    if (score >= cfg.perfect)
        return "PERFECT";
    if (score >= cfg.great)
        return "GREAT";
    if (score >= cfg.good)
        return "GOOD";
    return "MISS";
}
export const BASE_POINTS = { PERFECT: 1000, GREAT: 700, GOOD: 400, MISS: 0 };
export class ChallengeScorer {
    choreo;
    cfg;
    results;
    baseline = null;
    score = 0;
    combo = 0;
    maxCombo = 0;
    counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
    capture = new BaselineCapture();
    targets;
    constructor(choreo, cfg = DEFAULT_SCORING) {
        this.choreo = choreo;
        this.cfg = cfg;
        const scored = choreo.scoredMoves;
        this.results = scored.map((move) => ({
            move, judged: false, judgment: null, best: 0, bestParts: null, bestDt: null, frames: 0, points: 0,
        }));
        this.targets = scored.map((m) => refComparable(m.spec));
        // spacing to the neighbouring scored moves: windows must never overlap, or one held pose could score twice
        this.gap = scored.map((m, i) => Math.min(i > 0 ? m.at - scored[i - 1].at : Infinity, i < scored.length - 1 ? scored[i + 1].at - m.at : Infinity));
    }
    gap;
    /** Half-width (s) of move i's timing window: the configured tolerance, capped to 45% of the spacing. */
    windowOf(i) {
        return Math.min(this.cfg.timingTolerance, 0.45 * this.gap[i]);
    }
    /**
     * Feed a detected pose. `t` is choreography time in seconds (negative during the countdown,
     * where the player's neutral stance is captured). Not-detected frames are simply not fed:
     * they earn nothing.
     */
    pushFrame(t, f) {
        if (!f || f.visibleCount < this.cfg.minVisibleForScoring)
            return;
        if (t < 0) {
            this.capture.add(f);
            return;
        }
        if (!this.baseline)
            this.baseline = this.capture.result();
        if (!this.baseline)
            return; // never saw the player standing: cannot score honestly
        const cf = confidenceFactor(f.confidence, this.cfg);
        if (cf <= 0)
            return;
        const comp = toComparable(f, this.baseline);
        for (let i = 0; i < this.results.length; i++) {
            const r = this.results[i];
            if (r.judged)
                continue;
            const dt = t - r.move.at; // real offset from the beat (reported in results)
            const tol = this.windowOf(i);
            const dtc = dt - this.cfg.timingOffset; // offset from the centre of the window
            if (Math.abs(dtc) > tol)
                continue;
            const parts = similarity(this.targets[i], comp, r.move.weights, this.cfg, f.segVis);
            const total = parts.total * cf * timingFactor(dtc, tol);
            r.frames++;
            if (total > r.best) {
                r.best = total;
                r.bestParts = parts;
                r.bestDt = dt;
            }
        }
    }
    /** Closes timing windows that have passed and returns the judgments produced. */
    tick(t) {
        const out = [];
        for (let i = 0; i < this.results.length; i++) {
            const r = this.results[i];
            if (r.judged || t <= r.move.at + this.cfg.timingOffset + this.windowOf(i))
                continue;
            r.judged = true;
            r.judgment = classify(r.best, this.cfg);
            this.counts[r.judgment]++;
            if (r.judgment === "MISS")
                this.combo = 0;
            else
                this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            const mult = 1 + Math.min(Math.floor(this.combo / 3), 4) * 0.25;
            r.points = Math.round(BASE_POINTS[r.judgment] * mult);
            this.score += r.points;
            out.push({ index: i, move: r.move, judgment: r.judgment, accuracy: r.best, points: r.points, combo: this.combo });
        }
        return out;
    }
    /** Running accuracy (0..100): mean best-score of the moves judged so far. */
    get accuracy() {
        const j = this.results.filter((r) => r.judged);
        if (!j.length)
            return 0;
        return (j.reduce((s, r) => s + r.best, 0) / j.length) * 100;
    }
    /** Final accuracy over every scored move. */
    get finalAccuracy() {
        return (this.results.reduce((s, r) => s + r.best, 0) / this.results.length) * 100;
    }
    /** Live similarity (0..1) of a detected pose against an arbitrary reference pose, for the debug panel. */
    live(f, ref, w) {
        if (!f || !this.baseline || f.visibleCount < this.cfg.minVisibleForScoring)
            return null;
        const cf = confidenceFactor(f.confidence, this.cfg);
        return similarity(ref, toComparable(f, this.baseline), w, this.cfg, f.segVis).total * cf;
    }
    /** Stars from running accuracy. */
    get stars() {
        const a = this.accuracy;
        return a >= 80 ? 3 : a >= 60 ? 2 : a >= 40 ? 1 : 0;
    }
}
