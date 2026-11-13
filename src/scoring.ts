import { angleDiff, BaselineCapture, toComparable, type Baseline, type Comparable, type Features } from "./poseMath.js";
import { Choreography, refComparable, type Move, type Weights } from "./choreography.js";
import type { Judgment } from "./types.js";

export interface ScoringConfig {
  /** Half-width (s) of the timing window around each move. Configurable in Settings. */
  timingTolerance: number;
  perfect: number;
  great: number;
  good: number;
  /** "KEEP GOING" floor: 50..69 % similarity still earns points and keeps the combo. Below it = MISS. */
  keep: number;
  /** Grace period (s) AFTER the move's time during which a correct move is still accepted. */
  graceAfter: number;
  /** Seconds BEFORE the move's time during which an early (anticipated) move already counts. */
  graceBefore: number;
  /** Once a pose reaches `keep`, the move is judged after this many seconds (best similarity in between wins). */
  settle: number;
  /** Seconds of tracked frames a move needs before it can be judged at all; otherwise it is skipped (no MISS). */
  minCoverage: number;
  /** Late moves: no penalty up to this many seconds after the move; `timingEdge` is reached at graceAfter. */
  lateFree: number;
  /** Frames with fewer visible main landmarks than this are ignored (no points). */
  minVisibleForScoring: number;
  angleTol: number; // deg of error forgiven
  angleMax: number; // deg of error at which the segment scores 0
  posTol: number; // torso lengths
  posMax: number;
  shiftTol: number;
  shiftMax: number;
  heightTol: number;
  heightMax: number;
  /** Mean landmark visibility at/above which the confidence factor is 1. */
  confFull: number;
  /** ...and below which it is 0. */
  confZero: number;
  /**
   * Typical human reaction + camera/inference delay (s). The timing window is centred on
   * move.at + timingOffset, so a player who is naturally ~0.15 s behind the dancer isn't penalised for it.
   */
  timingOffset: number;
  /** 0..1: how strongly un-requested body travel / squat depth scales the score down (0.4 = classic). */
  gateStrength: number;
  /** Fraction of the timing window (around its centre) that earns full timing credit. */
  timingCore: number;
  /** Timing multiplier at the very edge of the window (1 = no timing penalty at all). */
  timingEdge: number;
  /** Close a move's window early as soon as it already scored PERFECT (feedback appears right away). */
  earlyPerfect: boolean;
}

export const DEFAULT_SCORING: ScoringConfig = {
  timingTolerance: 0.7,
  // Party-game thresholds on the 0..1 similarity (95 / 85 / 70 / 50 %).
  perfect: 0.95,
  great: 0.85,
  good: 0.7,
  keep: 0.5,
  graceAfter: 2,
  graceBefore: 0.3,
  settle: 0.6,
  minCoverage: 0.5,
  lateFree: 0.8,
  minVisibleForScoring: 10,
  // Forgiving comparison: ~20 deg of joint-angle difference and ~0.18 torso lengths of position difference are
  // "the same pose" (different arm length, flexibility, camera angle).
  angleTol: 20,
  angleMax: 75,
  posTol: 0.18,
  posMax: 0.7,
  shiftTol: 0.15,
  shiftMax: 0.6,
  heightTol: 0.09,
  heightMax: 0.35,
  confFull: 0.7,
  confZero: 0.35,
  timingOffset: 0,
  gateStrength: 0.4,
  timingCore: 0.35,
  timingEdge: 0.96,
  earlyPerfect: true,
};

/**
 * Scoring for "follow the dancers" songs: the player copies a move AFTER the dancers have started it, so the
 * window opens right after the dancers arrive (about 0.1 s) and stays open for ~1.7 s (until just before the next
 * move is due). Anything in the middle 75% of that window gets full timing credit; the edges lose at most 15%.
 */
export const SONG_SCORING: ScoringConfig = {
  ...DEFAULT_SCORING,
  timingTolerance: 0.9,
  timingOffset: 0.95,
  gateStrength: 0.2,
};

/** Share of the angle/position score taken from the worse arm (rest = weighted mean of all limbs). */
const ARM_MIN_BLEND = 0.7;

const falloff = (err: number, tol: number, max: number) => Math.min(1, Math.max(0, 1 - (err - tol) / (max - tol)));

export interface FrameScore {
  total: number;
  angle: number;
  position: number;
  shift: number;
  height: number;
}

/** Pure comparison of a player's pose to a reference pose (0..1). No randomness. */
export function similarity(
  ref: Comparable,
  player: Comparable,
  w: Weights,
  cfg: ScoringConfig,
  segVis: number[] | null,
): FrameScore {
  // Joint angle differences
  const segScore: number[] = [];
  let aNum = 0;
  let aDen = 0;
  for (let i = 0; i < 8; i++) {
    const wi = i < 4 ? w.arm : w.leg;
    let s = falloff(angleDiff(player.angles[i], ref.angles[i]), cfg.angleTol, cfg.angleMax);
    if (segVis && segVis[i] < 0.5) s = 0;
    segScore.push(s);
    aNum += wi * s;
    aDen += wi;
  }
  const aMean = aDen ? aNum / aDen : 0;
  // Relative landmark positions (torso-normalised, so body size doesn't matter)
  const ptScore: number[] = [];
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
  let total = ((angle * w.angle + position * w.pos + shift * w.shift + height * w.height) / wsum) * gate;
  // Intent: if the move's signature element (a component carrying >= 30 % of its weight, e.g. the sideways shift of
  // a step or the depth of a squat) is clearly absent, the move was not performed, however well the rest matches.
  const comps: [number, number][] = [[angle, w.angle], [position, w.pos], [shift, w.shift], [height, w.height]];
  for (const [score, wt] of comps) if (wt / wsum >= 0.3 && score < 0.25) total = Math.min(total, cfg.keep - 0.05);
  return { total, angle, position, shift, height };
}

export function confidenceFactor(conf: number, cfg: ScoringConfig): number {
  return Math.min(1, Math.max(0, (conf - cfg.confZero) / (cfg.confFull - cfg.confZero)));
}

/** 1 inside the central 35% of the window, falling linearly to 0.7 at its edge. */
export function timingFactor(dt: number, tol: number, coreFrac = 0.35, edge = 0.7): number {
  const a = Math.abs(dt);
  const core = tol * coreFrac;
  if (a <= core) return 1;
  return 1 - (1 - edge) * Math.min(1, (a - core) / (tol - core));
}

export function classify(score: number, cfg: ScoringConfig): Judgment {
  if (score >= cfg.perfect) return "PERFECT";
  if (score >= cfg.great) return "GREAT";
  if (score >= cfg.good) return "GOOD";
  if (score >= cfg.keep) return "KEEP";
  return "MISS";
}

/** 1 while the move is on time or up to `lateFree` s late, easing to `timingEdge` at the end of the grace period. */
export function lateFactor(dt: number, cfg: ScoringConfig): number {
  if (dt <= cfg.lateFree) return 1;
  const k = Math.min(1, (dt - cfg.lateFree) / Math.max(1e-6, cfg.graceAfter - cfg.lateFree));
  return 1 - (1 - cfg.timingEdge) * k;
}

/** Encouraging on-screen text for a judgment (varies with the move index so it doesn't repeat every time). */
export function popupText(j: Judgment, index: number): string {
  switch (j) {
    case "PERFECT": return index % 2 === 0 ? "PERFECT!" : "AMAZING!";
    case "GREAT": return "GREAT!";
    case "GOOD": return index % 2 === 0 ? "GOOD!" : "NICE MOVE!";
    case "KEEP": return index % 2 === 0 ? "KEEP GOING!" : "YOU GOT THIS!";
    default: return "MISS";
  }
}

export const BASE_POINTS: Record<Judgment, number> = { PERFECT: 1000, GREAT: 700, GOOD: 400, KEEP: 200, MISS: 0 };

export interface MoveResult {
  move: Move;
  judged: boolean;
  judgment: Judgment | null;
  /** Best combined frame score inside the timing window, 0..1 (0 when never detected). */
  best: number;
  bestParts: FrameScore | null;
  /** Timing offset (s) of the best frame relative to the move time (negative = early). */
  bestDt: number | null;
  frames: number;
  points: number;
  /** Seconds of tracked frames seen inside the window. */
  coverage: number;
  /** Time the pose first reached the KEEP level (the move is "registered" from then on, once). */
  detectedAt: number | null;
  /** True when the player was not tracked long enough to judge the move: no MISS, no points, combo untouched. */
  skipped: boolean;
}

export interface ScoreEvent {
  index: number;
  move: Move;
  judgment: Judgment;
  text: string;
  accuracy: number;
  points: number;
  combo: number;
}

export class ChallengeScorer {
  readonly results: MoveResult[];
  baseline: Baseline | null = null;
  score = 0;
  combo = 0;
  maxCombo = 0;
  counts: Record<Judgment, number> = { PERFECT: 0, GREAT: 0, GOOD: 0, KEEP: 0, MISS: 0 };
  /** Moves not judged because the player was not tracked (never counted as MISS). */
  skippedCount = 0;
  private lastPushT: number | null = null;
  private ema: number[] = [];
  /** armed[i] false = move i must not reuse the pose that already registered the preceding identical move. */
  private armed: boolean[] = [];
  private twin: number[][] = [];
  private capture = new BaselineCapture();
  private targets: Comparable[];

  constructor(
    readonly choreo: Choreography,
    public cfg: ScoringConfig = DEFAULT_SCORING,
  ) {
    const scored = choreo.scoredMoves;
    this.results = scored.map((move) => ({
      move, judged: false, judgment: null, best: 0, bestParts: null, bestDt: null, frames: 0, points: 0,
      coverage: 0, detectedAt: null, skipped: false,
    }));
    this.targets = scored.map((m) => refComparable(m.spec));
    this.ema = scored.map(() => -1);
    this.armed = scored.map(() => true);
    // Windows overlap now (2 s grace). A held pose must still only score ONE move, so a move that looks like one of
    // the two moves before it (e.g. two squats in a row) is only fed after the player has left that pose.
    this.twin = scored.map((m, i) => {
      const out: number[] = [];
      for (let j = Math.max(0, i - 2); j < i; j++) {
        if (similarity(this.targets[j], this.targets[i], m.weights, cfg, null).total >= 0.8) out.push(j);
      }
      return out;
    });
  }

  /**
   * Feed a detected pose. `t` is choreography time in seconds (negative during the countdown,
   * where the player's neutral stance is captured). Not-detected frames are simply not fed:
   * they earn nothing.
   */
  pushFrame(t: number, f: Features | null) {
    if (!f || f.visibleCount < this.cfg.minVisibleForScoring) return;
    if (t < 0) {
      this.capture.add(f);
      return;
    }
    if (!this.baseline) this.baseline = this.capture.result();
    if (!this.baseline) return; // never saw the player standing: cannot score honestly
    const cf = confidenceFactor(f.confidence, this.cfg);
    if (cf <= 0) return;
    const comp = toComparable(f, this.baseline);
    const fdt = this.lastPushT === null ? 0 : Math.min(0.1, Math.max(0, t - this.lastPushT));
    this.lastPushT = t;
    for (let i = 0; i < this.results.length; i++) {
      const r = this.results[i];
      if (r.judged) continue;
      const dt = t - r.move.at; // offset from the move time (negative = early, positive = late)
      if (dt < -this.cfg.graceBefore || dt > this.cfg.graceAfter) continue;
      r.coverage += fdt; // the player is tracked, even if this frame cannot be used for move i
      if (!this.armed[i]) {
        // The pose that registered the identical move before this one cannot also be credited early to this one:
        // wait until the player has left it, or until this move's own nominal time (when the choreography itself
        // asks for the same pose again, e.g. a held squat).
        const leftAll = this.twin[i].every((j) => similarity(this.targets[j], comp, this.results[j].move.weights, this.cfg, f.segVis).total < this.cfg.keep);
        if (leftAll || dt >= -0.1) this.armed[i] = true;
        else continue;
      }
      const parts = similarity(this.targets[i], comp, r.move.weights, this.cfg, f.segVis);
      // light temporal smoothing: one noisy frame can neither create nor destroy a detection
      const raw = parts.total * cf * lateFactor(dt, this.cfg);
      this.ema[i] = this.ema[i] < 0 ? raw : 0.6 * this.ema[i] + 0.4 * raw;
      const total = Math.min(raw, this.ema[i] + 0.02) ;
      r.frames++;
      if (total > r.best) {
        r.best = total;
        r.bestParts = parts;
        r.bestDt = dt;
      }
      if (r.detectedAt === null && r.best >= this.cfg.keep) {
        r.detectedAt = t;
        // from now on this pose belongs to move i: later identical moves must wait for the player to leave it
        for (let k = i + 1; k < this.results.length; k++) if (this.twin[k].includes(i)) this.armed[k] = false;
      }
    }
  }

  /** Closes timing windows that have passed and returns the judgments produced. */
  tick(t: number): ScoreEvent[] {
    const out: ScoreEvent[] = [];
    for (let i = 0; i < this.results.length; i++) {
      const r = this.results[i];
      if (r.judged) continue;
      const closed = t > r.move.at + this.cfg.graceAfter;
      const settled = r.detectedAt !== null && (t - r.detectedAt >= this.cfg.settle || (this.cfg.earlyPerfect && r.best >= this.cfg.perfect));
      if (!closed && !settled) continue;
      r.judged = true;
      if (r.detectedAt === null && r.coverage < this.cfg.minCoverage) {
        // Not tracked (or barely): that is the camera's problem, not a missed move.
        r.skipped = true;
        this.skippedCount++;
        continue;
      }
      r.judgment = classify(r.best, this.cfg);
      this.counts[r.judgment]++;
      if (r.judgment === "MISS") this.combo = 0;
      else this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const mult = 1 + Math.min(Math.floor(this.combo / 3), 4) * 0.25;
      r.points = Math.round(BASE_POINTS[r.judgment] * mult);
      this.score += r.points;
      out.push({ index: i, move: r.move, judgment: r.judgment, text: popupText(r.judgment, i), accuracy: r.best, points: r.points, combo: this.combo });
    }
    return out;
  }

  /** Running accuracy (0..100): mean best-score of the moves judged so far. */
  get accuracy(): number {
    const j = this.results.filter((r) => r.judged && !r.skipped);
    if (!j.length) return 0;
    return (j.reduce((s, r) => s + r.best, 0) / j.length) * 100;
  }

  /** Final accuracy over every scored move. */
  get finalAccuracy(): number {
    const j = this.results.filter((r) => !r.skipped);
    return j.length ? (j.reduce((s, r) => s + r.best, 0) / j.length) * 100 : 0;
  }

  /** Live similarity (0..1) of a detected pose against an arbitrary reference pose, for the debug panel. */
  live(f: Features | null, ref: Comparable, w: Weights): number | null {
    if (!f || !this.baseline || f.visibleCount < this.cfg.minVisibleForScoring) return null;
    const cf = confidenceFactor(f.confidence, this.cfg);
    return similarity(ref, toComparable(f, this.baseline), w, this.cfg, f.segVis).total * cf;
  }

  /** Stars from running accuracy. */
  get stars(): number {
    const a = this.accuracy;
    return a >= 75 ? 3 : a >= 55 ? 2 : a >= 35 ? 1 : 0;
  }
}
