/**
 * Planted-foot stance for the player's character (pure maths, no three.js).
 *
 * Goal: the character stands on the floor like a balanced person. A foot that is on the floor and not moving
 * stays exactly where it is (no skating while the player sways, waves her arms or the tracking jitters), a foot
 * that is lifted or swinging (a kick, a step) is free and never drags the body, and the character travels
 * sideways only when the player really steps.
 *
 * Each foot has an anchor (its held scene x). How firmly it is held (`weight`) depends on how low it is (next
 * to the lowest ankle) and how still it is. The held radius is DEADZONE * weight, so a foot that starts moving
 * is released smoothly. The character's x is the weighted mean of what each held foot says it should be.
 *
 * Inputs each frame (scene metres, +x = screen right):
 *  - `pelvisX`  where the player's pelvis is, from the camera image (travel);
 *  - `ankleX`   each ankle's x relative to the character's origin (from the retargeted skeleton);
 *  - `ankleY`   each ankle's height (y up, any common origin).
 */
export const STANCE = {
    /** A planted foot must move this far (m) before the character follows; smaller shifts are tracking noise. */
    DEADZONE: 0.05,
    /** An ankle this much above the lowest one (m) is no longer planted at all (fades in from 0). */
    HEIGHT: 0.06,
    /** A foot faster than this (m/s) is moving, not planted (fades in from 0). */
    SPEED: 0.35,
    /** Smoothing rate (1/s) of the output and the fastest the character may travel (m/s). */
    RATE: 24,
    MAX_SPEED: 3.5,
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export class Stance {
    /** The character's origin x (smoothed). */
    x = 0;
    A = [0, 0];
    last = [0, 0];
    v = [0, 0];
    w = [1, 1];
    ready = false;
    reset() {
        this.ready = false;
        this.x = 0;
    }
    /** How firmly each foot is planted right now, 0..1 (diagnostics / tests). */
    get planted() {
        return this.w.slice();
    }
    update(pelvisX, ankleX, ankleY, dt) {
        const d = Math.max(dt, 0.001);
        const low = Math.min(ankleY[0], ankleY[1]);
        const F = [pelvisX + ankleX[0], pelvisX + ankleX[1]];
        if (!this.ready) {
            this.ready = true;
            this.x = pelvisX;
            this.A = F.slice();
            this.last = F.slice();
            this.v = [0, 0];
        }
        let sw = 0, sg = 0;
        for (let f = 0; f < 2; f++) {
            const raw = Math.abs(F[f] - this.last[f]) / d;
            this.last[f] = F[f];
            this.v[f] += (raw - this.v[f]) * (1 - Math.exp(-d / 0.12));
            const w = clamp01(1 - (ankleY[f] - low) / STANCE.HEIGHT) * clamp01(1 - this.v[f] / STANCE.SPEED);
            this.w[f] = w;
            const r = STANCE.DEADZONE * w; // how far the foot may wander from its anchor without the character following
            const off = Math.max(-r, Math.min(r, this.A[f] - F[f]));
            this.A[f] = F[f] + off;
            sw += w;
            sg += w * (this.A[f] - ankleX[f]);
        }
        const EPS = 0.04; // both feet free (a hop): fall back to the pelvis' own position
        const target = (sg + EPS * pelvisX) / (sw + EPS);
        let step = (target - this.x) * (1 - Math.exp(-d * STANCE.RATE));
        const cap = STANCE.MAX_SPEED * d;
        if (step > cap)
            step = cap;
        else if (step < -cap)
            step = -cap;
        this.x += step;
        return this.x;
    }
}
