import { LM, emptyPose, type Pose } from "./types.js";
import { computeFeatures, toComparable, type Baseline, type Comparable } from "./poseMath.js";

/**
 * A pose is described by limb direction angles (same convention the scorer measures):
 * 0 = hanging down, 90 = straight out sideways, 180 = straight up, negative = crossing the body.
 * "R" means the PLAYER'S right limb. The instructor is shown mirror-style, so the player's
 * right arm is the arm on the right side of the screen.
 *
 * Reference skeletons are built from these specs with forward kinematics, and the very same
 * skeleton drives both the 3D instructor and the scoring target.
 */
export interface PoseSpec {
  rUpper: number;
  rFore: number;
  lUpper: number;
  lFore: number;
  rThigh: number;
  rShin: number;
  lThigh: number;
  lShin: number;
  /** Sideways hip travel in torso lengths; negative = player's right (image-left). */
  hipShift: number;
  /** 0..1 knee bend (shortens the projected legs, lowering the hips). */
  bend: number;
}

export const NEUTRAL: PoseSpec = {
  rUpper: 8, rFore: 4, lUpper: 8, lFore: 4,
  rThigh: 3, rShin: 2, lThigh: 3, lShin: 2,
  hipShift: 0, bend: 0,
};

export interface Weights {
  angle: number;
  pos: number;
  shift: number;
  height: number;
  /** Per-group multipliers for the angle / position terms. */
  arm: number;
  leg: number;
}

export const W_DEFAULT: Weights = { angle: 0.45, pos: 0.3, shift: 0.15, height: 0.1, arm: 1, leg: 1 };

export interface Move {
  id: string;
  name: string;
  /** Time (s) the pose must be reached, measured from the end of the countdown. */
  at: number;
  spec: PoseSpec;
  weights: Weights;
  scored: boolean;
}

const BODY = {
  shoulderHalf: 0.45,
  hipHalf: 0.28,
  upper: 0.62,
  fore: 0.55,
  thigh: 0.95,
  shin: 0.9,
  headY: -1.44,
  earHalf: 0.14,
};
/** y (image-down, torso = 1) of the floor level for a standing figure. */
export const GROUND_Y = BODY.thigh + BODY.shin;
/** Rough metres per torso unit, for scaling the 3D instructor. */
export const METERS_PER_UNIT = 0.5;

function dir(side: "R" | "L", deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: (side === "R" ? -1 : 1) * Math.sin(a), y: Math.cos(a) };
}

/** Forward-kinematics skeleton (33 landmark slots, image convention, aspect = 1, torso = 1). */
export function buildRefPose(spec: PoseSpec): Pose {
  const p = emptyPose();
  const set = (i: number, x: number, y: number) => {
    p[i] = { x, y, z: 0, visibility: 1 };
  };
  const sx = spec.hipShift;
  const rS = { x: sx - BODY.shoulderHalf, y: -1 };
  const lS = { x: sx + BODY.shoulderHalf, y: -1 };
  const rH = { x: sx - BODY.hipHalf, y: 0 };
  const lH = { x: sx + BODY.hipHalf, y: 0 };

  const arm = (s: { x: number; y: number }, side: "R" | "L", up: number, fo: number) => {
    const d1 = dir(side, up);
    const e = { x: s.x + d1.x * BODY.upper, y: s.y + d1.y * BODY.upper };
    const d2 = dir(side, fo);
    return { e, w: { x: e.x + d2.x * BODY.fore, y: e.y + d2.y * BODY.fore } };
  };
  const thighLen = BODY.thigh * (1 - 0.38 * spec.bend);
  const shinLen = BODY.shin * (1 - 0.1 * spec.bend);
  const leg = (h: { x: number; y: number }, side: "R" | "L", th: number, sh: number) => {
    const d1 = dir(side, th);
    const k = { x: h.x + d1.x * thighLen, y: h.y + d1.y * thighLen };
    const d2 = dir(side, sh);
    return { k, a: { x: k.x + d2.x * shinLen, y: k.y + d2.y * shinLen } };
  };

  const ra = arm(rS, "R", spec.rUpper, spec.rFore);
  const la = arm(lS, "L", spec.lUpper, spec.lFore);
  const rl = leg(rH, "R", spec.rThigh, spec.rShin);
  const ll = leg(lH, "L", spec.lThigh, spec.lShin);

  // Keep the feet planted on the floor, so bending the knees lowers the whole body.
  const dy = GROUND_Y - (rl.a.y + ll.a.y) / 2;

  set(LM.R_SHOULDER, rS.x, rS.y + dy);
  set(LM.L_SHOULDER, lS.x, lS.y + dy);
  set(LM.R_ELBOW, ra.e.x, ra.e.y + dy);
  set(LM.L_ELBOW, la.e.x, la.e.y + dy);
  set(LM.R_WRIST, ra.w.x, ra.w.y + dy);
  set(LM.L_WRIST, la.w.x, la.w.y + dy);
  set(LM.R_HIP, rH.x, rH.y + dy);
  set(LM.L_HIP, lH.x, lH.y + dy);
  set(LM.R_KNEE, rl.k.x, rl.k.y + dy);
  set(LM.L_KNEE, ll.k.x, ll.k.y + dy);
  set(LM.R_ANKLE, rl.a.x, rl.a.y + dy);
  set(LM.L_ANKLE, ll.a.x, ll.a.y + dy);
  set(LM.NOSE, sx, BODY.headY + 0.02 + dy);
  set(LM.R_EAR, sx - BODY.earHalf, BODY.headY + dy);
  set(LM.L_EAR, sx + BODY.earHalf, BODY.headY + dy);
  return p;
}

const REF_STANDING = computeFeatures(buildRefPose(NEUTRAL), 1)!;
/** Baseline of the reference dancer's own neutral stance. */
export const REF_BASELINE: Baseline = { hipX: 0, legRatio: REF_STANDING.legRatio, torso: REF_STANDING.torso };

export function refComparable(spec: PoseSpec): Comparable {
  const f = computeFeatures(buildRefPose(spec), 1)!;
  return toComparable(f, REF_BASELINE);
}

export function mk(
  id: string,
  name: string,
  at: number,
  over: Partial<PoseSpec>,
  weights: Partial<Weights> = {},
  scored = true,
): Move {
  return { id, name, at, spec: { ...NEUTRAL, ...over }, weights: { ...W_DEFAULT, ...weights }, scored };
}

const RELAXED = { rUpper: 30, rFore: 18, lUpper: 30, lFore: 18 };

/** Deterministic 30-second test routine: 9 scored moves on 3 s spacing (120 BPM => 6 beats). */
export const MOVES: Move[] = [
  mk("raise-right", "Raise right arm", 3, { rUpper: 155, rFore: 170 }),
  mk("raise-left", "Raise left arm", 6, { lUpper: 155, lFore: 170 }),
  mk("both-out", "Extend both arms", 9, { rUpper: 90, rFore: 90, lUpper: 90, lFore: 90 }),
  mk(
    "step-right", "Side-step right", 12,
    { ...RELAXED, rThigh: 22, rShin: 14, lThigh: -10, lShin: -4, hipShift: -0.55 },
    { angle: 0.3, pos: 0.2, shift: 0.35, height: 0.15, arm: 0.8, leg: 0.6 },
  ),
  mk(
    "step-left", "Side-step left", 15,
    { ...RELAXED, lThigh: 22, lShin: 14, rThigh: -10, rShin: -4, hipShift: 0.55 },
    { angle: 0.3, pos: 0.2, shift: 0.35, height: 0.15, arm: 0.8, leg: 0.6 },
  ),
  mk(
    "bend-knees", "Bend knees", 18,
    { rUpper: 50, rFore: 35, lUpper: 50, lFore: 35, rThigh: 25, rShin: 5, lThigh: 25, lShin: 5, bend: 1 },
    { angle: 0.25, pos: 0.2, shift: 0.1, height: 0.45, arm: 0.8, leg: 0.4 },
  ),
  mk(
    "combo-1", "Right arm up + step right", 21,
    { rUpper: 155, rFore: 170, lUpper: 12, lFore: 8, rThigh: 22, rShin: 14, lThigh: -10, lShin: -4, hipShift: -0.5 },
    { angle: 0.4, pos: 0.2, shift: 0.3, height: 0.1, arm: 1, leg: 0.6 },
  ),
  mk(
    "combo-2", "Left arm up + bend knees", 24,
    { lUpper: 155, lFore: 170, rUpper: 12, rFore: 8, rThigh: 25, rShin: 5, lThigh: 25, lShin: 5, bend: 1 },
    { angle: 0.35, pos: 0.2, shift: 0.1, height: 0.35, arm: 1, leg: 0.4 },
  ),
  mk(
    "finale", "Both arms up, feet wide", 27,
    { rUpper: 145, rFore: 155, lUpper: 145, lFore: 155, rThigh: 14, rShin: 10, lThigh: 14, lShin: 10 },
    { leg: 0.8 },
  ),
  mk("finish", "Rest", 30, {}, {}, false),
];

/** Time the instructor spends moving into each pose (ends exactly at the move's `at`). */
export const TRANSITION = 1.0;

const KEYS = Object.keys(NEUTRAL) as (keyof PoseSpec)[];
function lerpSpec(a: PoseSpec, b: PoseSpec, u: number): PoseSpec {
  const o = {} as PoseSpec;
  for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * u;
  return o;
}
const smooth = (u: number) => u * u * (3 - 2 * u);

export interface ChoreoOptions {
  /** Time (s) the dancer spends moving into each pose (capped to 85% of the gap between keyframes). */
  transition?: number;
  /** Seconds of countdown before t = 0. */
  leadIn?: number;
  /** Seconds per beat. Enables the beat-locked body bounce and hip sway (zero exactly on every beat). */
  beatSec?: number;
  /** Knee-bend amount added at the middle of every beat (0..1). */
  bounce?: number;
  /** Sideways hip sway (torso lengths) alternating every beat. */
  sway?: number;
}

export class Choreography {
  readonly moves: Move[];
  readonly duration: number;
  /** Seconds of neutral-stance countdown before t = 0 (used to calibrate the baseline). */
  readonly leadIn: number;
  private keys: { at: number; spec: PoseSpec }[];

  constructor(
    moves: Move[] = MOVES,
    private opts: ChoreoOptions = {},
  ) {
    this.moves = moves;
    this.duration = moves[moves.length - 1].at;
    this.leadIn = opts.leadIn ?? 3;
    this.keys = [{ at: 0, spec: NEUTRAL }, ...moves.map((m) => ({ at: m.at, spec: m.spec }))];
  }

  get scoredMoves() {
    return this.moves.filter((m) => m.scored);
  }

  /** Deterministic pose spec at time t (seconds). Keyframes are always hit exactly at their time. */
  specAt(t: number): PoseSpec {
    const base = this.baseSpecAt(t);
    const { beatSec, bounce, sway } = this.opts;
    if (!beatSec || t <= 0 || (!bounce && !sway)) return base;
    const x = t / beatSec;
    const ph = x - Math.floor(x);
    // both terms are exactly 0 at every beat boundary, so scored poses are never altered
    const b = bounce ? bounce * (1 - Math.cos(2 * Math.PI * ph)) * 0.5 : 0;
    const s = sway ? sway * Math.sin(Math.PI * x) : 0;
    return { ...base, bend: Math.min(1, base.bend + b), hipShift: base.hipShift + s };
  }

  private baseSpecAt(t: number): PoseSpec {
    const k = this.keys;
    if (t <= 0) return k[0].spec;
    const tr = this.opts.transition ?? TRANSITION;
    for (let i = 1; i < k.length; i++) {
      if (t <= k[i].at) {
        const prev = k[i - 1];
        const next = k[i];
        const dur = Math.min(tr, 0.85 * (next.at - prev.at));
        const start = next.at - dur;
        if (t <= start) return prev.spec;
        return lerpSpec(prev.spec, next.spec, smooth((t - start) / dur));
      }
    }
    return k[k.length - 1].spec;
  }

  poseAt(t: number): Pose {
    return buildRefPose(this.specAt(t));
  }

  /** Current / upcoming scored move index for UI (first scored move whose window hasn't closed). */
  nextMoveIndex(t: number, tolerance: number): number {
    const s = this.scoredMoves;
    for (let i = 0; i < s.length; i++) if (t <= s[i].at + tolerance) return i;
    return s.length;
  }
}
