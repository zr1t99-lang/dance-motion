import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { LM } from "./types.js";
/**
 * The official dancer: Meshy "Starlight Streetwear" (GLB, Mixamo skeleton, one skinned mesh).
 *
 * The GLB contains only two animation clips (Running, Walking) and no dance clip, so nothing here plays a clip:
 * every frame the BONES are posed from a skeleton (the choreography's reference pose for the coaches, the
 * MediaPipe-retargeted player skeleton for the player). Only the DIRECTION of each bone is taken from the skeleton;
 * bone lengths, mesh, textures and proportions stay the model's own. Finger bones are never touched, the head
 * follows the facing direction only gently, and the feet are kept flat and planted on the floor.
 */
export const DANCER_URL = "assets/char/dancer.glb";
/** Uniform scale so the 1.64 m model stands as tall as the old stage avatars (the stage camera is framed for ~1.85 m). */
const MODEL_SCALE = 1.13;
let loading = null;
/** Download + parse the GLB once (shared by all figures). Rejects if the file cannot be loaded. */
export function loadDancer(url = DANCER_URL) {
    if (!loading) {
        loading = new Promise((resolve, reject) => {
            new GLTFLoader().load(url, (gltf) => {
                const clips = (gltf.animations ?? []).map((a) => ({ name: a.name, duration: a.duration }));
                resolve({ scene: gltf.scene, clips });
            }, undefined, (e) => {
                loading = null;
                reject(e instanceof Error ? e : new Error("Could not load " + url));
            });
        });
    }
    return loading;
}
const key = (s) => s.replace(/[:\s]/g, "").toLowerCase();
const Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
/** Orthonormal frame with the given up axis and forward axis (forward is made perpendicular to up). */
function frameUF(up, fwd, out) {
    _y.copy(up).normalize();
    _z.copy(fwd).addScaledVector(_y, -fwd.dot(_y));
    if (_z.lengthSq() < 1e-8)
        _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
    _z.normalize();
    _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z);
    return out.setFromRotationMatrix(_m);
}
/** Frame from an up axis and a sideways (+x = character's left) axis. */
function frameUS(up, side, out) {
    _y.copy(up).normalize();
    _x.copy(side).addScaledVector(_y, -side.dot(_y));
    if (_x.lengthSq() < 1e-8)
        _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
    _x.normalize();
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    return out.setFromRotationMatrix(_m);
}
export class GlbBody {
    group = new THREE.Group();
    root;
    b = {};
    hipsRestPos = new THREE.Vector3();
    restDir = {};
    restFrame = {};
    ankleH = 0.166;
    toeH = 0.074;
    /** For tests/diagnostics: the lowest foot point (model units) before grounding. */
    lastGroundShift = 0;
    constructor(template) {
        this.root = cloneSkinned(template.scene);
        this.group.add(this.root);
        this.group.scale.setScalar(MODEL_SCALE);
        this.root.traverse((o) => {
            if (o.isSkinnedMesh || o.isMesh) {
                o.frustumCulled = false; // bounds are those of the rest pose; the body moves outside them
                if (o.material) {
                    // keep the textures exactly as authored; nothing recoloured
                    o.material.envMapIntensity = 0.6;
                }
            }
        });
        this.group.updateMatrixWorld(true);
        const find = (n) => {
            let r = null;
            this.root.traverse((o) => {
                if (o.isBone && key(o.name) === key("mixamorig:" + n))
                    r = o;
            });
            if (!r)
                throw new Error("GLB is missing bone " + n);
            return r;
        };
        for (const n of [
            "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "HeadTop_End",
            "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand",
            "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "LeftToe_End", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase", "RightToe_End",
        ]) {
            const bone = find(n);
            const restQ = new THREE.Quaternion();
            bone.getWorldQuaternion(restQ);
            this.b[n] = { bone, restQ };
        }
        this.hipsRestPos.copy(this.b.Hips.bone.position);
        // rest positions in model units (before the uniform display scale)
        const P = (n) => this.group.worldToLocal(new THREE.Vector3().setFromMatrixPosition(this.b[n].bone.matrixWorld));
        const dir = (a, c) => P(c).sub(P(a)).normalize();
        this.restDir = {
            LeftArm: dir("LeftArm", "LeftForeArm"), LeftForeArm: dir("LeftForeArm", "LeftHand"),
            RightArm: dir("RightArm", "RightForeArm"), RightForeArm: dir("RightForeArm", "RightHand"),
            LeftUpLeg: dir("LeftUpLeg", "LeftLeg"), LeftLeg: dir("LeftLeg", "LeftFoot"),
            RightUpLeg: dir("RightUpLeg", "RightLeg"), RightLeg: dir("RightLeg", "RightFoot"),
        };
        const up = dir("Hips", "Neck");
        const pel = P("LeftUpLeg").sub(P("RightUpLeg"));
        const cst = P("LeftArm").sub(P("RightArm"));
        this.restFrame.pelvis = frameUS(up, pel, new THREE.Quaternion());
        this.restFrame.chest = frameUS(up, cst, new THREE.Quaternion());
        this.restFrame.head = frameUF(dir("Head", "HeadTop_End"), new THREE.Vector3(0, 0, 1), new THREE.Quaternion());
        for (const s of ["Left", "Right"]) {
            const f = P(s + "ToeBase").sub(P(s + "Foot"));
            const toeFwd = P(s + "Toe_End").sub(P(s + "ToeBase"));
            void f;
            toeFwd.y = 0;
            this.restFrame[s + "Foot"] = frameUF(Y, toeFwd, new THREE.Quaternion());
        }
        this.ankleH = P("LeftFoot").y;
        this.toeH = P("LeftToeBase").y;
    }
    /** The Avatar's colour/outfit editing does not apply: the official character keeps her exact look. */
    setLook(_look) { }
    setWorld(name, qw) {
        const bn = this.b[name].bone;
        bn.parent.updateWorldMatrix(true, false);
        bn.parent.matrixWorld.decompose(_t, _p, _s);
        bn.quaternion.copy(_p).invert().multiply(qw);
        bn.updateMatrix();
        bn.updateMatrixWorld(true);
    }
    /** Swing the bone so its rest direction points along `target` (no twist added). */
    aim(name, target) {
        _q.setFromUnitVectors(this.restDir[name], target.clone().normalize());
        this.setWorld(name, _q.multiply(this.b[name].restQ));
    }
    /** World rotation = targetFrame * restFrame^-1 * restWorld(bone). */
    frameTo(name, target, rest) {
        const q = target.clone().multiply(rest.clone().invert()).multiply(this.b[name].restQ);
        this.setWorld(name, q);
    }
    /** Smoothed ground contact (player only; the coaches' reference data is already smooth). */
    groundLow = null;
    /** @param dt seconds since the last call; when given, the floor contact is smoothed so the body never twitches up/down. */
    layout(J0, fe0, dt) {
        // The model's LEFT limbs live on +x. The stage shows the player as a mirror image, so whichever tracked limb
        // is on the +x side drives the model's left side (this works for the coaches' reference skeleton and the player alike).
        const flip = J0[LM.L_SHOULDER].x + J0[LM.L_HIP].x < J0[LM.R_SHOULDER].x + J0[LM.R_HIP].x;
        const SW = { [LM.L_SHOULDER]: LM.R_SHOULDER, [LM.R_SHOULDER]: LM.L_SHOULDER, [LM.L_ELBOW]: LM.R_ELBOW, [LM.R_ELBOW]: LM.L_ELBOW, [LM.L_WRIST]: LM.R_WRIST, [LM.R_WRIST]: LM.L_WRIST, [LM.L_HIP]: LM.R_HIP, [LM.R_HIP]: LM.L_HIP, [LM.L_KNEE]: LM.R_KNEE, [LM.R_KNEE]: LM.L_KNEE, [LM.L_ANKLE]: LM.R_ANKLE, [LM.R_ANKLE]: LM.L_ANKLE, [LM.L_EAR]: LM.R_EAR, [LM.R_EAR]: LM.L_EAR };
        const J = flip ? new Proxy(J0, { get: (t, k) => (typeof k === "string" && k in SW ? t[SW[Number(k)]] : t[k]) }) : J0;
        const fe = flip ? { face: fe0.face, footL: fe0.footR, footR: fe0.footL } : fe0;
        const L = (i) => J[i];
        const d = (a, c) => new THREE.Vector3().subVectors(J[c], J[a]);
        const hipC = new THREE.Vector3().addVectors(L(LM.L_HIP), L(LM.R_HIP)).multiplyScalar(0.5);
        const shC = new THREE.Vector3().addVectors(L(LM.L_SHOULDER), L(LM.R_SHOULDER)).multiplyScalar(0.5);
        const torso = new THREE.Vector3().subVectors(shC, hipC);
        if (torso.lengthSq() < 1e-6)
            torso.set(0, 1, 0);
        torso.normalize();
        const hipSide = d(LM.R_HIP, LM.L_HIP);
        const shSide = d(LM.R_SHOULDER, LM.L_SHOULDER);
        // hips: position (sideways travel; height is set after posing so that the feet stand on the floor)
        this.b.Hips.bone.position.set(this.hipsRestPos.x + hipC.x / MODEL_SCALE, this.hipsRestPos.y, this.hipsRestPos.z);
        this.b.Hips.bone.updateMatrix();
        this.b.Hips.bone.updateMatrixWorld(true);
        // pelvis stays closer to upright than the chest; spine bones share the bend
        const pelvisUp = new THREE.Vector3().copy(torso).multiplyScalar(0.45).addScaledVector(Y, 0.55);
        const qPel = frameUS(pelvisUp, hipSide, new THREE.Quaternion());
        const qChest = frameUS(torso, shSide, new THREE.Quaternion());
        const rp = this.restFrame.pelvis, rc = this.restFrame.chest;
        this.frameTo("Hips", qPel, rp);
        const sp = (k, n) => {
            const qt = qPel.clone().slerp(qChest, k);
            const qr = rp.clone().slerp(rc, k);
            this.frameTo(n, qt, qr);
        };
        sp(0.34, "Spine");
        sp(0.67, "Spine1");
        sp(1, "Spine2");
        // head: up from the ears, facing from the (smoothed) nose direction, softened so the face stays calm
        const earC = new THREE.Vector3().addVectors(L(LM.L_EAR), L(LM.R_EAR)).multiplyScalar(0.5);
        const hu = new THREE.Vector3().subVectors(earC, shC);
        if (hu.lengthSq() < 1e-6 || hu.normalize().y < 0.55)
            hu.set(torso.x * 0.5, 1, torso.z * 0.5).normalize();
        const face = new THREE.Vector3(fe.face.x, fe.face.y, fe.face.z);
        const qHeadRaw = frameUF(hu, face, new THREE.Quaternion());
        // the player's head stays steady (faces the screen); the coaches' head blends a little with the chest as before
        const qHead = dt !== undefined ? qHeadRaw : qChest.clone().slerp(qHeadRaw, 0.8);
        this.frameTo("Neck", qChest.clone().slerp(qHead, 0.45), rc.clone().slerp(this.restFrame.head, 0.45));
        this.frameTo("Head", qHead, this.restFrame.head);
        // arms (swing only; hands and fingers follow the forearm, so wrists never twist on their own)
        this.aim("LeftArm", d(LM.L_SHOULDER, LM.L_ELBOW));
        this.aim("LeftForeArm", d(LM.L_ELBOW, LM.L_WRIST));
        this.aim("RightArm", d(LM.R_SHOULDER, LM.R_ELBOW));
        this.aim("RightForeArm", d(LM.R_ELBOW, LM.R_WRIST));
        // legs
        this.aim("LeftUpLeg", d(LM.L_HIP, LM.L_KNEE));
        this.aim("LeftLeg", d(LM.L_KNEE, LM.L_ANKLE));
        this.aim("RightUpLeg", d(LM.R_HIP, LM.R_KNEE));
        this.aim("RightLeg", d(LM.R_KNEE, LM.R_ANKLE));
        // feet: flat, pointing where the player's foot points
        for (const [s, f] of [["Left", fe.footL], ["Right", fe.footR]]) {
            const fw = new THREE.Vector3(f.x, f.y * 0.5, f.z);
            if (fw.lengthSq() < 1e-6)
                fw.set(0, 0, 1);
            this.frameTo(s + "Foot", frameUF(Y, fw, new THREE.Quaternion()), this.restFrame[s + "Foot"]);
        }
        // stand on the floor: the lowest foot point touches y = 0 (squats lower the hips, planted feet stay put)
        let low = Infinity;
        for (const s of ["Left", "Right"]) {
            const foot = _v.setFromMatrixPosition(this.b[s + "Foot"].bone.matrixWorld);
            this.group.worldToLocal(foot);
            low = Math.min(low, foot.y - this.ankleH);
            const toe = _w.setFromMatrixPosition(this.b[s + "ToeBase"].bone.matrixWorld);
            this.group.worldToLocal(toe);
            low = Math.min(low, toe.y - this.toeH);
        }
        if (dt !== undefined) {
            // 1.2 cm dead band (tracking noise) + fast smoothing: feet stay on the floor but the pelvis does not jitter or hop
            if (this.groundLow === null)
                this.groundLow = low;
            const e = low - this.groundLow;
            const dz = 0.012;
            if (Math.abs(e) > dz)
                this.groundLow += (e - Math.sign(e) * dz) * (1 - Math.exp(-dt * 30));
            low = this.groundLow;
        }
        this.lastGroundShift = low;
        this.b.Hips.bone.position.y -= low;
        this.b.Hips.bone.updateMatrix();
        this.b.Hips.bone.updateMatrixWorld(true);
    }
    /** World position of a skeleton bone (for tests and diagnostics). */
    bonePos(name) {
        const v = new THREE.Vector3().setFromMatrixPosition(this.b[name].bone.matrixWorld);
        return { x: v.x, y: v.y, z: v.z };
    }
    dispose() {
        // geometry/textures are shared with the template; materials are shared too, so nothing to free per instance
        this.root.traverse((o) => o.skeleton?.dispose?.());
    }
}
