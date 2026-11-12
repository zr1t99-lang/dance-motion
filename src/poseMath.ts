import { LM, MAIN_POINTS, type Pose } from "./types.js";

/** A landmark counts as "visible" at or above this MediaPipe visibility score. */
export const VIS_OK = 0.5;

export interface SegmentDef {
  name: string;
  a: number;
  b: number;
  side: "R" | "L";
  group: "arm" | "leg";
}

/** Limb segments compared by angle. Order matters: 0-3 arms, 4-7 legs. */
export const SEGMENTS: SegmentDef[] = [
  { name: "R upper arm", a: LM.R_SHOULDER, b: LM.R_ELBOW, side: "R", group: "arm" },
  { name: "R forearm", a: LM.R_ELBOW, b: LM.R_WRIST, side: "R", group: "arm" },
  { name: "L upper arm", a: LM.L_SHOULDER, b: LM.L_ELBOW, side: "L", group: "arm" },
  { name: "L forearm", a: LM.L_ELBOW, b: LM.L_WRIST, side: "L", group: "arm" },
  { name: "R thigh", a: LM.R_HIP, b: LM.R_KNEE, side: "R", group: "leg" },
  { name: "R shin", a: LM.R_KNEE, b: LM.R_ANKLE, side: "R", group: "leg" },
  { name: "L thigh", a: LM.L_HIP, b: LM.L_KNEE, side: "L", group: "leg" },
  { name: "L shin", a: LM.L_KNEE, b: LM.L_ANKLE, side: "L", group: "leg" },
];

/** Points compared by torso-normalised position. Order matters: 0-3 arms, 4-7 legs. */
export const REL_POINTS: { idx: number; origin: "shoulder" | "hip" }[] = [
  { idx: LM.R_WRIST, origin: "shoulder" },
  { idx: LM.L_WRIST, origin: "shoulder" },
  { idx: LM.R_ELBOW, origin: "shoulder" },
  { idx: LM.L_ELBOW, origin: "shoulder" },
  { idx: LM.R_KNEE, origin: "hip" },
  { idx: LM.L_KNEE, origin: "hip" },
  { idx: LM.R_ANKLE, origin: "hip" },
  { idx: LM.L_ANKLE, origin: "hip" },
];

export interface Features {
  /** Torso length (shoulder-centre to hip-centre) in image-plane units. */
  torso: number;
  /** Limb direction angles (deg). 0 = hanging down, 90 = out sideways, 180 = straight up. */
  angles: number[];
  /** Min visibility of both end points per segment. */
  segVis: number[];
  /** Torso-normalised offsets (x,y pairs) for REL_POINTS. */
  rel: number[];
  /** (ankle-centre y - hip-centre y) / torso. Drops when the knees bend. */
  legRatio: number;
  /** Hip-centre x in image-plane units (aspect corrected). */
  hipX: number;
  confidence: number;
  visibleCount: number;
}

export function visibleMainCount(pose: Pose, thr = VIS_OK): number {
  let n = 0;
  for (const i of MAIN_POINTS) if ((pose[i]?.visibility ?? 0) >= thr) n++;
  return n;
}

export function meanMainVisibility(pose: Pose): number {
  let s = 0;
  for (const i of MAIN_POINTS) s += pose[i]?.visibility ?? 0;
  return s / MAIN_POINTS.length;
}

export function segmentAngle(dx: number, dy: number, side: "R" | "L"): number {
  // Right-side limbs point to image-LEFT (-x) when abducted, left-side limbs to image-right.
  return (Math.atan2(side === "R" ? -dx : dx, dy) * 180) / Math.PI;
}

export function angleDiff(a: number, b: number): number {
  const d = ((((a - b) % 360) + 540) % 360) - 180;
  return Math.abs(d);
}

/**
 * @param aspect videoWidth / videoHeight. MediaPipe's normalised x and y use different
 *               scales, so x must be multiplied by the aspect ratio before measuring angles.
 */
export function computeFeatures(pose: Pose, aspect: number): Features | null {
  const px = (i: number) => pose[i].x * aspect;
  const py = (i: number) => pose[i].y;
  const shx = (px(LM.L_SHOULDER) + px(LM.R_SHOULDER)) / 2;
  const shy = (py(LM.L_SHOULDER) + py(LM.R_SHOULDER)) / 2;
  const hpx = (px(LM.L_HIP) + px(LM.R_HIP)) / 2;
  const hpy = (py(LM.L_HIP) + py(LM.R_HIP)) / 2;
  const torso = Math.hypot(shx - hpx, shy - hpy);
  if (!(torso > 1e-4)) return null;

  const angles: number[] = [];
  const segVis: number[] = [];
  for (const s of SEGMENTS) {
    angles.push(segmentAngle(px(s.b) - px(s.a), py(s.b) - py(s.a), s.side));
    segVis.push(Math.min(pose[s.a].visibility ?? 0, pose[s.b].visibility ?? 0));
  }
  const rel: number[] = [];
  for (const r of REL_POINTS) {
    const ox = r.origin === "shoulder" ? shx : hpx;
    const oy = r.origin === "shoulder" ? shy : hpy;
    rel.push((px(r.idx) - ox) / torso, (py(r.idx) - oy) / torso);
  }
  const ankleY = (py(LM.L_ANKLE) + py(LM.R_ANKLE)) / 2;
  return {
    torso,
    angles,
    segVis,
    rel,
    legRatio: (ankleY - hpy) / torso,
    hipX: hpx,
    confidence: meanMainVisibility(pose),
    visibleCount: visibleMainCount(pose),
  };
}

/** The player's own neutral stance, used so body size / position / proportions don't matter. */
export interface Baseline {
  hipX: number;
  legRatio: number;
  torso: number;
}

export interface Comparable {
  angles: number[];
  rel: number[];
  /** Sideways hip travel in baseline-torso lengths (image-left negative). */
  shift: number;
  /** Leg-height ratio relative to the neutral stance (1 = standing, < 1 = knees bent). */
  legRel: number;
}

export function toComparable(f: Features, base: Baseline): Comparable {
  return {
    angles: f.angles,
    rel: f.rel,
    shift: (f.hipX - base.hipX) / base.torso,
    legRel: f.legRatio / base.legRatio,
  };
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Collects neutral-stance samples (during the countdown) and returns median values. */
export class BaselineCapture {
  private hip: number[] = [];
  private leg: number[] = [];
  private torso: number[] = [];
  add(f: Features) {
    this.hip.push(f.hipX);
    this.leg.push(f.legRatio);
    this.torso.push(f.torso);
    if (this.hip.length > 120) {
      this.hip.shift();
      this.leg.shift();
      this.torso.shift();
    }
  }
  get count() {
    return this.hip.length;
  }
  reset() {
    this.hip = [];
    this.leg = [];
    this.torso = [];
  }
  result(minSamples = 8): Baseline | null {
    if (this.hip.length < minSamples) return null;
    return { hipX: median(this.hip), legRatio: median(this.leg), torso: median(this.torso) };
  }
}

export const BODY_GROUPS: { label: string; ids: number[] }[] = [
  { label: "Head", ids: [LM.NOSE] },
  { label: "Shoulders", ids: [LM.L_SHOULDER, LM.R_SHOULDER] },
  { label: "Elbows", ids: [LM.L_ELBOW, LM.R_ELBOW] },
  { label: "Wrists", ids: [LM.L_WRIST, LM.R_WRIST] },
  { label: "Hips", ids: [LM.L_HIP, LM.R_HIP] },
  { label: "Knees", ids: [LM.L_KNEE, LM.R_KNEE] },
  { label: "Ankles", ids: [LM.L_ANKLE, LM.R_ANKLE] },
];

/** True when every landmark in the group is confidently detected AND inside the camera frame. */
export function groupInFrame(pose: Pose, ids: number[], thr = 0.6, margin = 0.01): boolean {
  return ids.every((i) => {
    const p = pose[i];
    return (
      !!p &&
      p.visibility >= thr &&
      p.x > margin &&
      p.x < 1 - margin &&
      p.y > margin &&
      p.y < 1 - margin
    );
  });
}
