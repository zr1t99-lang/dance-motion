import { POSE_LANDMARK_COUNT } from "./types.js";
class LowPass {
    y = 0;
    ready = false;
    filter(x, alpha) {
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
    minCutoff;
    beta;
    dCutoff;
    x = new LowPass();
    dx = new LowPass();
    lastT = -1;
    constructor(minCutoff, beta, dCutoff = 1) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
    }
    alpha(cutoff, dt) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dt);
    }
    filter(v, t) {
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
/** Smooths all 33 landmarks (x, y, z). Visibility is passed through unchanged. */
export class PoseSmoother {
    params;
    f = [];
    constructor(params) {
        this.params = params;
        this.reset();
    }
    /** Change smoothing strength on the fly (restarts the filters). */
    setParams(p) {
        this.params = p;
        this.reset();
    }
    reset() {
        this.f = Array.from({ length: POSE_LANDMARK_COUNT * 3 }, () => new OneEuro(this.params.minCutoff, this.params.beta));
    }
    apply(pose, tSeconds) {
        return pose.map((l, i) => ({
            x: this.f[i * 3].filter(l.x, tSeconds),
            y: this.f[i * 3 + 1].filter(l.y, tSeconds),
            z: this.f[i * 3 + 2].filter(l.z, tSeconds),
            visibility: l.visibility,
        }));
    }
}
