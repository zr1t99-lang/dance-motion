/** Avatar proportions in metres (same as the instructor: torso 0.5 m). */
export const RIG = {
    torso: 0.5,
    shHalf: 0.225,
    hipHalf: 0.14,
    upper: 0.31,
    fore: 0.275,
    thigh: 0.475,
    shin: 0.45,
    head: 0.22,
    earHalf: 0.07,
};
const L_SHOULDER = 11, R_SHOULDER = 12, L_ELBOW = 13, R_ELBOW = 14, L_WRIST = 15, R_WRIST = 16;
const L_HIP = 23, R_HIP = 24, L_KNEE = 25, R_KNEE = 26, L_ANKLE = 27, R_ANKLE = 28;
const NOSE = 0, L_EAR = 7, R_EAR = 8, L_HEEL = 29, R_HEEL = 30, L_TOE = 31, R_TOE = 32;
function unitInto(dst, x, y, z, fb) {
    const l = Math.hypot(x, y, z);
    if (l < 1e-6) {
        dst.x = fb.x;
        dst.y = fb.y;
        dst.z = fb.z;
        return;
    }
    dst.x = x / l;
    dst.y = y / l;
    dst.z = z / l;
}
const DOWN = { x: 0, y: -1, z: 0 };
const FWD = { x: 0, y: 0, z: 1 };
const UPV = { x: 0, y: 1, z: 0 };
export class Retargeter {
    /** Direction the face points (unit). */
    face = { x: 0, y: 0, z: 1 };
    /** Keep the head facing the screen (like the coaches): the nose never turns the character's head left/right. */
    lockFace = false;
    footL = { x: 0, y: 0, z: 1 };
    footR = { x: 0, y: 0, z: 1 };
    d = { x: 0, y: 0, z: 0 };
    t = { x: 0, y: 1, z: 0 };
    s = { x: 1, y: 0, z: 0 };
    h = { x: 1, y: 0, z: 0 };
    hu = { x: 0, y: 1, z: 0 };
    /**
     * @param J    smoothed tracked joints (scene space: metres, y up), 33 entries
     * @param out  33 entries that receive the retargeted skeleton
     * @param seen which landmarks have ever been confidently observed
     */
    solve(J, out, seen) {
        const { d, t, s, h, hu } = this;
        // pelvis
        const hx = (J[L_HIP].x + J[R_HIP].x) / 2, hy = (J[L_HIP].y + J[R_HIP].y) / 2, hz = (J[L_HIP].z + J[R_HIP].z) / 2;
        unitInto(h, J[L_HIP].x - J[R_HIP].x, J[L_HIP].y - J[R_HIP].y, J[L_HIP].z - J[R_HIP].z, { x: 1, y: 0, z: 0 });
        set(out[L_HIP], hx + h.x * RIG.hipHalf, hy + h.y * RIG.hipHalf, hz + h.z * RIG.hipHalf);
        set(out[R_HIP], hx - h.x * RIG.hipHalf, hy - h.y * RIG.hipHalf, hz - h.z * RIG.hipHalf);
        // spine
        const scx = (J[L_SHOULDER].x + J[R_SHOULDER].x) / 2, scy = (J[L_SHOULDER].y + J[R_SHOULDER].y) / 2, scz = (J[L_SHOULDER].z + J[R_SHOULDER].z) / 2;
        unitInto(t, scx - hx, scy - hy, scz - hz, UPV);
        const sx = hx + t.x * RIG.torso, sy = hy + t.y * RIG.torso, sz = hz + t.z * RIG.torso;
        unitInto(s, J[L_SHOULDER].x - J[R_SHOULDER].x, J[L_SHOULDER].y - J[R_SHOULDER].y, J[L_SHOULDER].z - J[R_SHOULDER].z, { x: 1, y: 0, z: 0 });
        set(out[L_SHOULDER], sx + s.x * RIG.shHalf, sy + s.y * RIG.shHalf, sz + s.z * RIG.shHalf);
        set(out[R_SHOULDER], sx - s.x * RIG.shHalf, sy - s.y * RIG.shHalf, sz - s.z * RIG.shHalf);
        // arms
        this.limb(J, out, L_SHOULDER, L_ELBOW, RIG.upper);
        this.limb(J, out, L_ELBOW, L_WRIST, RIG.fore);
        this.limb(J, out, R_SHOULDER, R_ELBOW, RIG.upper);
        this.limb(J, out, R_ELBOW, R_WRIST, RIG.fore);
        // legs
        this.limb(J, out, L_HIP, L_KNEE, RIG.thigh);
        this.limb(J, out, L_KNEE, L_ANKLE, RIG.shin);
        this.limb(J, out, R_HIP, R_KNEE, RIG.thigh);
        this.limb(J, out, R_KNEE, R_ANKLE, RIG.shin);
        // head: direction from the shoulder centre to the ear centre; yaw from the nose offset
        const ex = (J[L_EAR].x + J[R_EAR].x) / 2, ey = (J[L_EAR].y + J[R_EAR].y) / 2, ez = (J[L_EAR].z + J[R_EAR].z) / 2;
        unitInto(hu, ex - scx, ey - scy, ez - scz, UPV);
        if (hu.y < 0.3)
            unitInto(hu, hu.x, 0.3 + hu.y * 0, hu.z, UPV); // never let the head point sideways/down
        const hdx = sx + hu.x * RIG.head, hdy = sy + hu.y * RIG.head, hdz = sz + hu.z * RIG.head;
        set(out[L_EAR], hdx + s.x * RIG.earHalf, hdy + s.y * RIG.earHalf, hdz + s.z * RIG.earHalf);
        set(out[R_EAR], hdx - s.x * RIG.earHalf, hdy - s.y * RIG.earHalf, hdz - s.z * RIG.earHalf);
        set(out[NOSE], hdx, hdy, hdz);
        let fx = 0, fy = 0, fz = 1;
        if (seen[NOSE] && seen[L_EAR] && seen[R_EAR]) {
            const vx = J[NOSE].x - ex, vy = J[NOSE].y - ey, vz = J[NOSE].z - ez;
            const dp = vx * hu.x + vy * hu.y + vz * hu.z;
            const px = vx - hu.x * dp, py = vy - hu.y * dp, pz = vz - hu.z * dp;
            if (Math.hypot(px, py, pz) > 0.03) {
                const l = Math.hypot(px, py, pz);
                fx = px / l;
                fy = py / l;
                fz = pz / l;
            }
        }
        // blend toward the new facing a little each call so a flickering nose doesn't spin the head
        if (this.lockFace) {
            fx = 0;
            fy = 0;
            fz = 1;
            this.face.x = 0;
            this.face.y = 0;
            this.face.z = 1;
        }
        this.face.x += (fx - this.face.x) * 0.5;
        this.face.y += (fy - this.face.y) * 0.5;
        this.face.z += (fz - this.face.z) * 0.5;
        unitInto(this.face, this.face.x, this.face.y, this.face.z, FWD);
        // feet: heel -> toe direction (flattened so a foot never points straight up/down)
        this.foot(J, seen, L_HEEL, L_TOE, this.footL);
        this.foot(J, seen, R_HEEL, R_TOE, this.footR);
        void d;
    }
    limb(J, out, a, b, len) {
        const d = this.d;
        unitInto(d, J[b].x - J[a].x, J[b].y - J[a].y, J[b].z - J[a].z, DOWN);
        set(out[b], out[a].x + d.x * len, out[a].y + d.y * len, out[a].z + d.z * len);
    }
    foot(J, seen, heel, toe, dst) {
        let x = 0, y = 0, z = 1;
        if (seen[heel] && seen[toe]) {
            const dx = J[toe].x - J[heel].x, dy = (J[toe].y - J[heel].y) * 0.4, dz = J[toe].z - J[heel].z;
            const l = Math.hypot(dx, dy, dz);
            if (l > 0.04) {
                x = dx / l;
                y = dy / l;
                z = dz / l;
            }
        }
        dst.x += (x - dst.x) * 0.3;
        dst.y += (y - dst.y) * 0.3;
        dst.z += (z - dst.z) * 0.3;
        unitInto(dst, dst.x, dst.y, dst.z, FWD);
    }
}
function set(p, x, y, z) {
    p.x = x;
    p.y = y;
    p.z = z;
}
/**
 * Whole-body sideways travel from the IMAGE landmarks. The character never leaves the floor: there is no
 * "lift" (a foot rising in the image can be a step, a kick, a camera tilt or walking away - never a flight).
 * Distance is in metres. The scale (metres per image height) comes from the torso's size in the image divided
 * by its length in MediaPipe's metric world coordinates, both measured in the image plane, so leaning or
 * bending forward does not change the scale and the character does not slide when the player bends.
 */
export class Locomotion {
    lastT = -1;
    scale = null; // metres per image-height unit (smoothed)
    x = 0;
    reset() {
        this.lastT = -1;
        this.scale = null;
        this.x = 0;
    }
    /** @param world optional MediaPipe world landmarks (metres) used only to calibrate the scale. */
    update(p, aspect, tSec, world) {
        const dt = this.lastT < 0 ? 0.033 : Math.min(0.2, Math.max(0.001, tSec - this.lastT));
        this.lastT = tSec;
        const shx = (p[L_SHOULDER].x + p[R_SHOULDER].x) / 2, shy = (p[L_SHOULDER].y + p[R_SHOULDER].y) / 2;
        const hpx = (p[L_HIP].x + p[R_HIP].x) / 2, hpy = (p[L_HIP].y + p[R_HIP].y) / 2;
        const torso = Math.hypot((shx - hpx) * aspect, shy - hpy);
        if (!(torso > 0.02))
            return { x: this.x };
        let sc = null;
        if (world && world[L_SHOULDER] && world[L_HIP]) {
            const wx = (world[L_SHOULDER].x + world[R_SHOULDER].x - world[L_HIP].x - world[R_HIP].x) / 2;
            const wy = (world[L_SHOULDER].y + world[R_SHOULDER].y - world[L_HIP].y - world[R_HIP].y) / 2;
            const wl = Math.hypot(wx, wy); // the torso as the camera sees it, in metres
            if (wl > 0.3 && torso > 0.08)
                sc = wl / torso;
        }
        if (sc === null && this.scale === null)
            sc = RIG.torso / torso; // first frames without usable world data: assume 0.5 m
        if (sc !== null) {
            sc = Math.min(Math.max(sc, 0.6), 6); // sane range: 0.6..6 m per image height
            this.scale = this.scale === null ? sc : this.scale + (sc - this.scale) * (1 - Math.exp(-dt / 0.4));
        }
        this.x = (hpx - 0.5) * aspect * this.scale;
        return { x: this.x };
    }
}
