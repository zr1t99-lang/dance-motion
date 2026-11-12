import * as THREE from "three";
import { LM, POSE_LANDMARK_COUNT } from "./types.js";
import { GROUND_Y, METERS_PER_UNIT } from "./choreography.js";
export const INSTRUCTOR_STYLE = {
    jacket: 0xff2fb4, pants: 0x2b1b92, skin: 0xf6cfe0, shoes: 0xffffff, glove: 0xf4ff4a, hair: 0x1d1047, rim: 0xff7bf2, shades: true,
};
export const PLAYER_STYLE = {
    jacket: 0x2aa8ff, pants: 0x261c86, skin: 0xf1d3c4, shoes: 0xffffff, glove: 0x6cf2ff, hair: 0x140b36, rim: 0x6cf2ff, shades: false,
};
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
/** A solid mesh plus (optionally) a slightly larger back-face "neon rim" shell. */
class Part {
    core;
    rim = null;
    constructor(kind, color, rimColor, reflect, geos) {
        const mat = reflect
            ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false })
            : new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, emissive: color, emissiveIntensity: 0.18 });
        this.core = new THREE.Mesh(geos[kind], mat);
        if (reflect)
            this.core.renderOrder = 0;
        if (!reflect) {
            this.rim = new THREE.Mesh(geos[kind], new THREE.MeshBasicMaterial({ color: rimColor, side: THREE.BackSide }));
        }
    }
    addTo(g) {
        g.add(this.core);
        if (this.rim)
            g.add(this.rim);
    }
    /** Place a unit-height cylinder from a to b with radius r. */
    bone(a, b, r) {
        _a.subVectors(b, a);
        const len = Math.max(_a.length(), 1e-4);
        const dir = _a.divideScalar(len);
        _q.setFromUnitVectors(UP, dir);
        for (const m of [this.core, this.rim]) {
            if (!m)
                continue;
            const k = m === this.rim ? 1.3 : 1;
            m.position.copy(a).add(b).multiplyScalar(0.5);
            m.quaternion.copy(_q);
            m.scale.set(r * k, len + (m === this.rim ? r * 0.2 : 0), r * k);
        }
    }
    ball(p, r) {
        for (const m of [this.core, this.rim]) {
            if (!m)
                continue;
            m.position.copy(p);
            m.quaternion.identity();
            m.scale.setScalar(m === this.rim ? r * 1.3 : r);
        }
    }
    /** Oriented box. */
    box(center, ex, ey, ez, w, h, d) {
        _m.makeBasis(ex, ey, ez);
        _q.setFromRotationMatrix(_m);
        for (const m of [this.core, this.rim]) {
            if (!m)
                continue;
            const k = m === this.rim ? 1.1 : 1;
            m.position.copy(center);
            m.quaternion.copy(_q);
            m.scale.set(w * k + (m === this.rim ? 0.01 : 0), h * k + (m === this.rim ? 0.01 : 0), d * k + (m === this.rim ? 0.01 : 0));
        }
    }
}
/** Skeleton-driven humanoid made of capsule-ish primitives. */
class Body {
    style;
    reflect;
    group = new THREE.Group();
    parts = {};
    ex = new THREE.Vector3();
    ey = new THREE.Vector3();
    ez = new THREE.Vector3();
    tmp = new THREE.Vector3();
    tmp2 = new THREE.Vector3();
    sh = new THREE.Vector3();
    hip = new THREE.Vector3();
    head = new THREE.Vector3();
    constructor(style, reflect, geos) {
        this.style = style;
        this.reflect = reflect;
        const s = style;
        const P = (name, kind, color) => {
            const p = new Part(kind, color, s.rim, reflect, geos);
            p.addTo(this.group);
            this.parts[name] = p;
        };
        P("torso", "box", s.jacket);
        P("pelvis", "box", s.pants);
        P("neck", "cyl", s.skin);
        P("head", "sph", s.skin);
        P("hair", "sph", s.hair);
        P("pony", "cyl", s.hair);
        P("shades", "box", 0x120a2a);
        for (const side of ["L", "R"]) {
            P(`uarm${side}`, "cyl", s.jacket);
            P(`farm${side}`, "cyl", s.skin);
            P(`shoulder${side}`, "sph", s.jacket);
            P(`elbow${side}`, "sph", s.jacket);
            P(`hand${side}`, "sph", s.glove);
            P(`thigh${side}`, "cyl", s.pants);
            P(`shin${side}`, "cyl", s.pants);
            P(`knee${side}`, "sph", s.pants);
            P(`hipj${side}`, "sph", s.pants);
            P(`shoe${side}`, "box", s.shoes);
        }
        this.parts.shades.core.visible = s.shades;
        if (this.parts.shades.rim)
            this.parts.shades.rim.visible = s.shades;
        this.parts.pony.core.visible = s.shades;
        if (this.parts.pony.rim)
            this.parts.pony.rim.visible = s.shades;
    }
    /** J: 33 scene-space joint positions (metres, y up, +z toward the viewer). */
    layout(J) {
        const p = this.parts;
        const { ex, ey, ez, tmp, tmp2, sh, hip, head } = this;
        sh.copy(J[LM.L_SHOULDER]).add(J[LM.R_SHOULDER]).multiplyScalar(0.5);
        hip.copy(J[LM.L_HIP]).add(J[LM.R_HIP]).multiplyScalar(0.5);
        const shW = J[LM.L_SHOULDER].distanceTo(J[LM.R_SHOULDER]);
        const hipW = J[LM.L_HIP].distanceTo(J[LM.R_HIP]);
        // torso (box between shoulders and hips, oriented by the shoulder line)
        ey.subVectors(sh, hip);
        const torsoLen = ey.length();
        ey.normalize();
        ex.subVectors(J[LM.L_SHOULDER], J[LM.R_SHOULDER]);
        ex.addScaledVector(ey, -ex.dot(ey)).normalize();
        ez.crossVectors(ex, ey);
        tmp.copy(sh).add(hip).multiplyScalar(0.5);
        p.torso.box(tmp, ex, ey, ez, shW * 1.18 + 0.04, torsoLen * 0.78, 0.2);
        tmp.copy(hip).addScaledVector(ey, 0.03);
        p.pelvis.box(tmp, ex, ey, ez, hipW * 1.5 + 0.04, 0.2, 0.21);
        // head & neck
        head.copy(J[LM.L_EAR]).add(J[LM.R_EAR]).multiplyScalar(0.5);
        head.y += 0.02;
        tmp.copy(sh).addScaledVector(ey, 0.02);
        p.neck.bone(tmp, head, 0.04);
        p.head.ball(head, 0.105);
        tmp.copy(head);
        tmp.y += 0.035;
        tmp.z -= 0.012;
        p.hair.ball(tmp, 0.112);
        tmp.copy(head);
        tmp.z -= 0.13;
        tmp.y -= 0.01;
        tmp2.copy(head);
        tmp2.z -= 0.2;
        tmp2.y -= 0.17;
        p.pony.bone(tmp, tmp2, 0.032);
        tmp.copy(head);
        tmp.z += 0.098;
        tmp.y += 0.012;
        _a.set(1, 0, 0);
        _b.set(0, 1, 0);
        const _c = this.tmp2.set(0, 0, 1);
        p.shades.box(tmp, _a, _b, _c, 0.19, 0.04, 0.03);
        // limbs
        const sides = [
            ["L", LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST, LM.L_HIP, LM.L_KNEE, LM.L_ANKLE, 0, 0],
            ["R", LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE, 0, 0],
        ];
        for (const [sd, iS, iE, iW, iH, iK, iA] of sides) {
            p[`uarm${sd}`].bone(J[iS], J[iE], 0.046);
            p[`farm${sd}`].bone(J[iE], J[iW], 0.036);
            p[`shoulder${sd}`].ball(J[iS], 0.062);
            p[`elbow${sd}`].ball(J[iE], 0.044);
            tmp.subVectors(J[iW], J[iE]).normalize().multiplyScalar(0.065).add(J[iW]);
            p[`hand${sd}`].ball(tmp, 0.052);
            p[`thigh${sd}`].bone(J[iH], J[iK], 0.078);
            p[`shin${sd}`].bone(J[iK], J[iA], 0.064);
            p[`knee${sd}`].ball(J[iK], 0.07);
            p[`hipj${sd}`].ball(J[iH], 0.085);
            tmp.copy(J[iA]);
            tmp.y -= 0.035;
            tmp.z += 0.06;
            _a.set(1, 0, 0);
            _b.set(0, 1, 0);
            _m.identity();
            p[`shoe${sd}`].box(tmp, _a, _b, this.tmp2.set(0, 0, 1), 0.1, 0.075, 0.24);
        }
    }
}
export class Avatar {
    group = new THREE.Group();
    joints = Array.from({ length: POSE_LANDMARK_COUNT }, () => new THREE.Vector3());
    target = Array.from({ length: POSE_LANDMARK_COUNT }, () => new THREE.Vector3());
    body;
    reflBody = null;
    reflGroup = null;
    geos;
    floorOffset = 0;
    lateral = 0;
    seen = new Array(POSE_LANDMARK_COUNT).fill(false);
    yDown = true;
    constructor(style, reflection) {
        this.geos = {
            cyl: new THREE.CylinderGeometry(1, 1, 1, 14, 1),
            sph: new THREE.SphereGeometry(1, 16, 12),
            box: new THREE.BoxGeometry(1, 1, 1),
        };
        this.body = new Body(style, false, this.geos);
        this.group.add(this.body.group);
        if (reflection) {
            this.reflBody = new Body(style, true, this.geos);
            this.reflGroup = new THREE.Group();
            this.reflGroup.scale.y = -1;
            this.reflGroup.add(this.reflBody.group);
        }
    }
    /** Extra scene object to add alongside `group` (floor reflection), or null. */
    get reflection() {
        return this.reflGroup;
    }
    /**
     * Instructor: drive from the reference skeleton (torso = 1 unit). Always shown mirror-style:
     * the player's right limb appears on the right of the screen.
     */
    setFromReference(ref) {
        for (let i = 0; i < POSE_LANDMARK_COUNT; i++) {
            const l = ref[i];
            if (!l || l.visibility < 0.5)
                continue;
            this.joints[i].set(-l.x * METERS_PER_UNIT, (GROUND_Y - l.y) * METERS_PER_UNIT, l.z * METERS_PER_UNIT);
            this.seen[i] = true;
        }
        this.apply(1, 0, true);
    }
    /**
     * Player: drive from MediaPipe world landmarks (metres, hip-centred, y down, z away from camera).
     * Joints whose visibility is too low keep their last value, so invalid data never moves the avatar.
     * `hipImageX` (0..1) lets the avatar travel sideways when the player steps.
     */
    setFromWorld(world, mirror, hipImageX) {
        const sx = mirror ? -1 : 1;
        // Self-orient the vertical axis from the data itself: a standing body has its ankles below
        // its shoulders. (MediaPipe's world y points down; this guards against assuming wrongly.)
        const sh = world[LM.L_SHOULDER];
        const an = world[LM.L_ANKLE];
        if (sh && an && sh.visibility > 0.5 && an.visibility > 0.5 && Math.abs(an.y - sh.y) > 0.4) {
            this.yDown = an.y > sh.y;
        }
        const sy = this.yDown ? -1 : 1;
        for (let i = 0; i < POSE_LANDMARK_COUNT; i++) {
            const l = world[i];
            if (!l || l.visibility < 0.4)
                continue;
            this.target[i].set(sx * l.x, sy * l.y, -l.z);
            this.seen[i] = true;
        }
        if (hipImageX !== null)
            this.lateral = Math.max(-1.6, Math.min(1.6, (hipImageX - 0.5) * 2.4 * sx));
    }
    /** Per-render-frame step: eases toward the latest tracked joints (hides the 30 Hz inference cadence). */
    step(dt) {
        const k = 1 - Math.exp(-dt * 30);
        for (let i = 0; i < POSE_LANDMARK_COUNT; i++) {
            if (!this.seen[i])
                continue;
            this.joints[i].lerp(this.target[i], k);
        }
        this.apply(k, dt, false);
    }
    apply(_k, dt, instructor) {
        if (!instructor) {
            // draw nothing until every main joint has been confidently seen at least once
            for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28])
                if (!this.seen[i])
                    return;
        }
        // Head placement when the ears are not (yet) reliably detected: fall back to the nose, or to
        // a point above the shoulders if the face isn't visible either.
        if (!this.seen[LM.L_EAR] || !this.seen[LM.R_EAR]) {
            const l = this.joints[LM.L_EAR];
            const r = this.joints[LM.R_EAR];
            if (this.seen[LM.NOSE]) {
                l.copy(this.joints[LM.NOSE]);
                r.copy(this.joints[LM.NOSE]);
                l.z -= 0.08;
                r.z -= 0.08;
            }
            else {
                l.copy(this.joints[LM.L_SHOULDER]).add(this.joints[LM.R_SHOULDER]).multiplyScalar(0.5);
                l.y += 0.24;
                r.copy(l);
            }
        }
        if (!instructor) {
            // keep the feet on the floor: lowest ankle sits at y = 0 (squats lower the whole body)
            const low = Math.min(this.joints[LM.L_ANKLE].y, this.joints[LM.R_ANKLE].y) - 0.02;
            const kk = 1 - Math.exp(-Math.max(dt, 0.001) * 12);
            this.floorOffset += (-low - this.floorOffset) * kk;
            this.group.position.y = this.floorOffset;
            this.group.position.x = this.lateral;
            if (this.reflGroup) {
                this.reflGroup.position.y = -this.floorOffset;
                this.reflGroup.position.x = this.lateral;
            }
        }
        this.body.layout(this.joints);
        this.reflBody?.layout(this.joints);
    }
    dispose() {
        for (const g of Object.values(this.geos))
            g.dispose();
        for (const body of [this.body, this.reflBody]) {
            body?.group.traverse((o) => {
                if (o.material)
                    o.material.dispose();
            });
        }
    }
}
