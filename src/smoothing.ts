import { POSE_LANDMARK_COUNT, type Pose } from "./types.js";

class LowPass {
  private y = 0;
  private ready = false;
  filter(x: number, alpha: number) {
    this.y = this.ready ? alpha * x + (1 - alpha) * this.y : x;
    this.ready = true;
    return this.y;
  }
  get last() {
    return this.y;
  }
  get has() {
    return this.ready;
  }
}

/** One Euro filter (Casiez et al.): heavy smoothing at rest, light smoothing (low lag) in fast motion. */
export class OneEuro {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT = -1;
  constructor(
    public minCutoff: number,
    public beta: number,
    public dCutoff = 1,
  ) {}
  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(v: number, t: number) {
    if (this.lastT < 0 || t <= this.lastT) {
      this.lastT = t;
      return this.x.filter(v, 1);
    }
    const dt = t - this.lastT;
    this.lastT = t;
    const prev = this.x.last;
    const d = (v - prev) / dt;
    const ed = this.dx.filter(d, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(ed);
    return this.x.filter(v, this.alpha(cutoff, dt));
  }
}

export interface SmoothParams {
  minCutoff: number;
  beta: number;
}

/** Smooths all 33 landmarks (x, y, z). Visibility is passed through unchanged. */
export class PoseSmoother {
  private f: OneEuro[] = [];
  constructor(private params: SmoothParams) {
    this.reset();
  }
  reset() {
    this.f = Array.from({ length: POSE_LANDMARK_COUNT * 3 }, () => new OneEuro(this.params.minCutoff, this.params.beta));
  }
  apply(pose: Pose, tSeconds: number): Pose {
    return pose.map((l, i) => ({
      x: this.f[i * 3].filter(l.x, tSeconds),
      y: this.f[i * 3 + 1].filter(l.y, tSeconds),
      z: this.f[i * 3 + 2].filter(l.z, tSeconds),
      visibility: l.visibility,
    }));
  }
}
