import * as THREE from "three";
import { LM, POSE_LANDMARK_COUNT } from "./types.js";
import { GROUND_Y, METERS_PER_UNIT } from "./choreography.js";
import { Locomotion, Retargeter } from "./retarget.js";
export const INSTRUCTOR_STYLE = {
    jacket: 0xff2fb4, pants: 0x2b1b92, skin: 0xf6cfe0, shoes: 0xffffff, glove: 0xf4ff4a, hair: 0x1d1047, rim: 0xff7bf2, shades: true,
};
export const INSTRUCTOR2_STYLE = {
    jacket: 0x22e6c8, pants: 0x1b2a92, skin: 0xe9c7a4, shoes: 0xffffff, glove: 0xff6ad5, hair: 0xf5d84a, rim: 0x6cf2ff, shades: true,
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
    setColor(color) {
        this.core.material.color.set(color);
        if (this.core.material.emissive)
            this.core.material.emissive.set(color);
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
    hup = new THREE.Vector3();
    fwd = new THREE.Vector3();
    hx = new THREE.Vector3();
    fx = new THREE.Vector3();
    fy = new THREE.Vector3();
    fz = new THREE.Vector3();
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
        P("band", "cyl", 0xffffff);
        this.parts.band.core.visible = false;
        if (this.parts.band.rim)
            this.parts.band.rim.visible = false;
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
        // styled-outfit details (only shown once a coach/player look turns `baggy` on)
        P("hairBack", "sph", s.hair);
        P("hairSideL", "sph", s.hair);
        P("hairSideR", "sph", s.hair);
        P("clip", "sph", s.jacket);
        P("panelL", "box", s.jacket);
        P("panelR", "box", s.jacket);
        P("star", "box", 0x7a3cff);
        for (const sd of ["L", "R"])
            for (const k of ["T", "S"])
                P(`stripe${sd}${k}`, "cyl", s.jacket);
        for (const n of this.EXTRA)
            this.show(n, false);
        this.parts.shades.core.visible = s.shades;
        if (this.parts.shades.rim)
            this.parts.shades.rim.visible = s.shades;
        this.parts.pony.core.visible = s.shades;
        if (this.parts.pony.rim)
            this.parts.pony.rim.visible = s.shades;
    }
    EXTRA = ["hairBack", "hairSideL", "hairSideR", "clip", "panelL", "panelR", "star", "stripeLT", "stripeLS", "stripeRT", "stripeRS"];
    longHair = false;
    show(n, on) {
        const q = this.parts[n];
        q.core.visible = on;
        if (q.rim)
            q.rim.visible = on;
    }
    faceMesh = null;
    faceTex = null;
    legK = 1;
    chunky = false;
    /** Recolour the avatar (the player's own character). Any field may be omitted. */
    setLook(look) {
        const p = this.parts;
        if (look.skin !== undefined)
            for (const n of ["neck", "head", "farmL", "farmR"])
                p[n].setColor(look.skin);
        if (look.jacket !== undefined)
            for (const n of ["uarmL", "uarmR", "shoulderL", "shoulderR", "elbowL", "elbowR"])
                p[n].setColor(look.jacket);
        if (look.jacket !== undefined && look.shirt === undefined)
            p.torso.setColor(look.jacket);
        if (look.shirt !== undefined)
            p.torso.setColor(look.shirt);
        if (look.pants !== undefined)
            for (const n of ["pelvis", "thighL", "thighR", "shinL", "shinR", "kneeL", "kneeR", "hipjL", "hipjR"])
                p[n].setColor(look.pants);
        if (look.shoes !== undefined) {
            p.shoeL.setColor(look.shoes);
            p.shoeR.setColor(look.shoes);
        }
        if (look.glove !== undefined) {
            p.handL.setColor(look.glove);
            p.handR.setColor(look.glove);
        }
        if (look.pony !== undefined) {
            p.pony.core.visible = look.pony;
            if (p.pony.rim)
                p.pony.rim.visible = look.pony;
        }
        if (look.shades !== undefined) {
            p.shades.core.visible = look.shades;
            if (p.shades.rim)
                p.shades.rim.visible = look.shades;
        }
        if (look.headband !== undefined) {
            const on = look.headband !== null;
            p.band.core.visible = on;
            if (p.band.rim)
                p.band.rim.visible = on;
            if (on)
                p.band.setColor(look.headband);
        }
        if (look.baggy !== undefined) {
            this.legK = look.baggy ? 1.5 : 1;
            this.chunky = look.baggy;
            for (const n of ["panelL", "panelR", "star", "stripeLT", "stripeLS", "stripeRT", "stripeRS"])
                this.show(n, look.baggy);
        }
        if (look.longHair !== undefined) {
            this.longHair = look.longHair;
            for (const n of ["hairBack", "hairSideL", "hairSideR", "clip"])
                this.show(n, look.longHair);
            if (look.longHair)
                this.show("pony", false);
        }
        if (look.jacket !== undefined)
            for (const n of ["panelL", "panelR", "clip", "stripeLT", "stripeLS", "stripeRT", "stripeRS"])
                p[n].setColor(look.jacket);
        if (look.hair !== undefined)
            for (const n of ["hair", "pony", "hairBack", "hairSideL", "hairSideR"])
                p[n].setColor(look.hair);
        if (look.face !== undefined) {
            if (this.faceMesh) {
                this.group.remove(this.faceMesh);
                this.faceMesh.material.dispose();
                this.faceTex?.dispose();
                this.faceMesh = null;
                this.faceTex = null;
            }
            if (look.face && !this.reflect) {
                const t = new THREE.CanvasTexture(look.face);
                t.colorSpace = THREE.SRGBColorSpace;
                this.faceTex = t;
                this.faceMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
                this.group.add(this.faceMesh);
            }
        }
    }
    /** J: 33 scene-space joint positions (metres, y up, +z toward the viewer). */
    layout(J, fe) {
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
        if (this.legK > 1) {
            for (const [n, sg] of [["panelL", 1], ["panelR", -1]]) {
                tmp.copy(sh).add(hip).multiplyScalar(0.5).addScaledVector(ex, sg * (shW * 0.45 + 0.02)).addScaledVector(ez, 0.012);
                p[n].box(tmp, ex, ey, ez, shW * 0.27, torsoLen * 0.78, 0.215);
            }
            tmp.copy(sh).addScaledVector(ey, -torsoLen * 0.3).addScaledVector(ez, 0.108);
            p.star.box(tmp, ex, ey, ez, 0.07, 0.07, 0.012);
        }
        tmp.copy(hip).addScaledVector(ey, 0.03);
        p.pelvis.box(tmp, ex, ey, ez, hipW * 1.5 + 0.04 + (this.legK - 1) * 0.1, 0.2, 0.21 + (this.legK - 1) * 0.1);
        // head & neck (the head turns with the player's nose direction)
        head.copy(J[LM.L_EAR]).add(J[LM.R_EAR]).multiplyScalar(0.5);
        head.y += 0.02;
        tmp.copy(sh).addScaledVector(ey, 0.02);
        p.neck.bone(tmp, head, 0.04);
        p.head.ball(head, 0.105);
        const hup = this.hup.subVectors(head, sh).normalize();
        const fwd = this.fwd.set(fe.face.x, fe.face.y, fe.face.z);
        fwd.addScaledVector(hup, -fwd.dot(hup)).normalize();
        const hx = this.hx.crossVectors(hup, fwd);
        tmp.copy(head).addScaledVector(hup, 0.035).addScaledVector(fwd, -0.012);
        p.hair.ball(tmp, 0.112);
        tmp.copy(head).addScaledVector(fwd, -0.13).addScaledVector(hup, -0.01);
        tmp2.copy(head).addScaledVector(fwd, -0.2).addScaledVector(hup, -0.17);
        p.pony.bone(tmp, tmp2, 0.032);
        if (this.longHair) {
            tmp.copy(head).addScaledVector(fwd, -0.07).addScaledVector(hup, -0.13);
            p.hairBack.box(tmp, hx, hup, fwd, 0.13, 0.23, 0.075);
            for (const [n, sg] of [["hairSideL", 1], ["hairSideR", -1]]) {
                tmp.copy(head).addScaledVector(hx, sg * 0.1).addScaledVector(fwd, -0.02).addScaledVector(hup, -0.11);
                p[n].box(tmp, hx, hup, fwd, 0.04, 0.15, 0.05);
            }
            tmp.copy(head).addScaledVector(hx, 0.075).addScaledVector(hup, 0.075).addScaledVector(fwd, 0.075);
            p.clip.ball(tmp, 0.022);
        }
        tmp.copy(head).addScaledVector(fwd, 0.098).addScaledVector(hup, 0.012);
        p.shades.box(tmp, hx, hup, fwd, 0.19, 0.04, 0.03);
        if (this.parts.band.core.visible) {
            tmp.copy(head).addScaledVector(hup, 0.058).addScaledVector(fwd, 0.04).addScaledVector(hx, -0.112);
            tmp2.copy(head).addScaledVector(hup, 0.058).addScaledVector(fwd, 0.04).addScaledVector(hx, 0.112);
            p.band.bone(tmp, tmp2, 0.019);
        }
        if (this.faceMesh) {
            // the player's own photo, as a round "face plate" just in front of the head
            tmp.copy(head).addScaledVector(fwd, 0.118).addScaledVector(hup, 0.004);
            _m.makeBasis(hx, hup, fwd);
            this.faceMesh.quaternion.setFromRotationMatrix(_m);
            this.faceMesh.position.copy(tmp);
            this.faceMesh.scale.setScalar(0.092);
        }
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
            p[`thigh${sd}`].bone(J[iH], J[iK], 0.078 * this.legK);
            p[`shin${sd}`].bone(J[iK], J[iA], 0.064 * this.legK);
            p[`knee${sd}`].ball(J[iK], 0.07 * this.legK);
            p[`hipj${sd}`].ball(J[iH], 0.085 * Math.min(this.legK, 1.25));
            if (this.legK > 1) {
                const out = this.tmp2.copy(ex).multiplyScalar(sd === "L" ? 1 : -1);
                const o1 = 0.078 * this.legK * 0.97, o2 = 0.064 * this.legK * 0.97;
                this.fx.copy(J[iH]).addScaledVector(out, o1);
                this.fy.copy(J[iK]).addScaledVector(out, o1);
                p[`stripe${sd}T`].bone(this.fx, this.fy, 0.013);
                this.fx.copy(J[iK]).addScaledVector(out, o2);
                this.fy.copy(J[iA]).addScaledVector(out, o2);
                p[`stripe${sd}S`].bone(this.fx, this.fy, 0.013);
            }
            // shoe follows the player's heel -> toe direction
            const fd = sd === "L" ? fe.footL : fe.footR;
            const fz = this.fz.set(fd.x, fd.y, fd.z).normalize();
            const fy = this.fy.set(0, 1, 0).addScaledVector(fz, -fz.y).normalize();
            const fx = this.fx.crossVectors(fy, fz);
            tmp.copy(J[iA]);
            tmp.y -= 0.035;
            tmp.addScaledVector(fz, 0.06);
            p[`shoe${sd}`].box(tmp, fx, fy, fz, this.chunky ? 0.125 : 0.1, this.chunky ? 0.1 : 0.075, this.chunky ? 0.28 : 0.24);
        }
    }
}
export class Avatar {
    group = new THREE.Group();
    joints = Array.from({ length: POSE_LANDMARK_COUNT }, () => new THREE.Vector3());
    target = Array.from({ length: POSE_LANDMARK_COUNT }, () => new THREE.Vector3());
    body;
    /** True once the official GLB character replaced the primitive body. */
    glb = false;
    reflBody = null;
    reflGroup = null;
    geos;
    floorOffset = 0;
    lateral = 0;
    baseX = 0;
    latLimit = 1.8;
    lift = 0;
    liftTarget = 0;
    seen = new Array(POSE_LANDMARK_COUNT).fill(false);
    yDown = true;
    retarget = new Retargeter();
    loco = new Locomotion();
    /** Retargeted (fixed bone length) skeleton that is actually drawn for the player. */
    rt = Array.from({ length: POSE_LANDMARK_COUNT }, () => new THREE.Vector3());
    still = { face: { x: 0, y: 0, z: 1 }, footL: { x: 0, y: 0, z: 1 }, footR: { x: 0, y: 0, z: 1 } };
    constructor(style, reflection) {
        this.geos = {
            cyl: new THREE.CylinderGeometry(1, 1, 1, 14, 1),
            sph: new THREE.SphereGeometry(1, 16, 12),
            box: new THREE.BoxGeometry(1, 1, 1),
        };
        Object.assign(this.look, { skin: style.skin, jacket: style.jacket, shirt: style.jacket, pants: style.pants, shoes: style.shoes, hair: style.hair });
        this.body = new Body(style, false, this.geos);
        this.group.add(this.body.group);
        if (reflection) {
            this.reflBody = new Body(style, true, this.geos);
            this.reflGroup = new THREE.Group();
            this.reflGroup.scale.y = -1;
            this.reflGroup.add(this.reflBody.group);
        }
    }
    /** Everything the 2D cut-out renderer needs: the final joints, where the figure stands, and its look. */
    look = {
        skin: 0, jacket: 0, shirt: 0, pants: 0, shoes: 0, hair: 0, pony: false, baggy: false,
        headband: null, face: null,
    };
    ready = false;
    isInst = false;
    hideMesh(hidden) {
        this.group.visible = !hidden;
        if (this.reflGroup)
            this.reflGroup.visible = !hidden;
    }
    figureState() {
        if (!this.ready)
            return null;
        return { J: this.isInst ? this.joints : this.rt, ox: this.group.position.x, oy: this.group.position.y, scale: this.group.scale.x, look: this.look };
    }
    /** Diagnostics: world position of a GLB bone (null while the primitive body is used). */
    bonePos(name) {
        return this.glb ? this.body.bonePos(name) : null;
    }
    /** Swap the primitive body for the GLB character (floor-grounded by itself, no reflection copy). */
    useBody(body) {
        this.group.remove(this.body.group);
        this.body.setLook({ face: null });
        if (this.reflGroup) {
            this.reflGroup.parent?.remove(this.reflGroup);
            this.reflGroup = null;
        }
        this.reflBody = null;
        this.body = body;
        this.group.add(body.group);
        this.glb = true;
    }
    /** Put the avatar at x metres from the centre, scaled (used for the two backup dancers). */
    place(x, scale) {
        this.baseX = x;
        this.group.position.x = x;
        this.group.scale.setScalar(scale);
        if (this.reflGroup) {
            this.reflGroup.position.x = x;
            this.reflGroup.scale.set(scale, -scale, scale);
        }
    }
    /** Limit how far the player's avatar may travel sideways (so it doesn't walk into the dancers). */
    setLateralLimit(m) {
        this.latLimit = m;
    }
    /** Customise the look (the player's character: skin / shirt / hair colour and face photo). */
    setLook(look) {
        this.body.setLook(look);
        const L = this.look;
        for (const [k, v] of Object.entries(look))
            if (v !== undefined)
                L[k] = v;
        const { face, ...rest } = look;
        void face;
        this.reflBody?.setLook(rest);
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
     * `img` (the image-space landmarks) lets the avatar travel sideways and jump with the player.
     */
    setFromWorld(world, mirror, img) {
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
        if (img) {
            const l = this.loco.update(img.pose, img.aspect, img.t);
            this.lateral = Math.max(-this.latLimit, Math.min(this.latLimit, l.x * sx));
            this.liftTarget = l.lift;
        }
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
        this.ready = true;
        this.isInst = instructor;
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
            // Fixed-bone-length copy of the player's pose: angles are the player's, proportions are the rig's.
            this.retarget.solve(this.joints, this.rt, this.seen);
            // standing feet sit on the floor (squats lower the whole body); jumps add real height on top
            const low = Math.min(this.rt[LM.L_ANKLE].y, this.rt[LM.R_ANKLE].y) - 0.02;
            const d = Math.max(dt, 0.001);
            this.floorOffset += (-low - this.floorOffset) * (1 - Math.exp(-d * 14));
            this.lift += (this.liftTarget - this.lift) * (1 - Math.exp(-d * 28));
            const y = (this.glb ? 0 : this.floorOffset) + this.lift;
            this.group.position.y = y;
            this.group.position.x = this.baseX + this.lateral;
            if (this.reflGroup) {
                this.reflGroup.position.y = -y;
                this.reflGroup.position.x = this.baseX + this.lateral;
            }
            this.body.layout(this.rt, this.retarget);
            this.reflBody?.layout(this.rt, this.retarget);
            return;
        }
        this.body.layout(this.joints, this.still);
        this.reflBody?.layout(this.joints, this.still);
    }
    dispose() {
        this.body.setLook({ face: null });
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
