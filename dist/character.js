import { LM } from "./types.js";
export const HAIR_COLORS = [0x140b36, 0x3b2314, 0x8a5a2b, 0xd9b44a, 0xb5301f, 0xe8e8f0, 0xff4fd8, 0x2dd7ff];
const KEY = "dance-motion.character.v1";
export function loadCharacter() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return null;
        const c = JSON.parse(raw);
        if (typeof c?.face === "string" && c.face.startsWith("data:image/"))
            return c;
    }
    catch {
        /* storage unavailable */
    }
    return null;
}
export function saveCharacter(c) {
    try {
        if (c)
            localStorage.setItem(KEY, JSON.stringify(c));
        else
            localStorage.removeItem(KEY);
    }
    catch {
        /* ignore */
    }
}
/** Decode the stored face picture into a canvas (for the 3D head). */
export function faceCanvas(c) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const cv = document.createElement("canvas");
            cv.width = cv.height = 128;
            cv.getContext("2d").drawImage(img, 0, 0, 128, 128);
            resolve(cv);
        };
        img.onerror = () => reject(new Error("The saved face picture could not be read."));
        img.src = c.face;
    });
}
const rgbToInt = (r, g, b) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
function avgColor(ctx, cx, cy, half) {
    const x = Math.max(0, Math.round(cx - half)), y = Math.max(0, Math.round(cy - half));
    const w = Math.max(1, Math.round(half * 2)), h = Math.max(1, Math.round(half * 2));
    try {
        const d = ctx.getImageData(x, y, w, h).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
            r += d[i];
            g += d[i + 1];
            b += d[i + 2];
            n++;
        }
        return n ? [r / n, g / n, b / n] : null;
    }
    catch {
        return null;
    }
}
/**
 * Grab the current camera frame and build the character from it. Uses the pose landmarks (nose, ears,
 * shoulders, hips) to find the face and the shirt; no extra model is needed. Needs a clearly visible face.
 */
export function captureCharacter(video, pose, mirror, hair) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh)
        return { ok: false, reason: "The camera picture is not ready yet." };
    if (!pose)
        return { ok: false, reason: "No body detected. Stand where the camera sees you and try again." };
    const nose = pose[LM.NOSE], le = pose[LM.L_EAR], re = pose[LM.R_EAR];
    if (!nose || !le || !re || nose.visibility < 0.5 || le.visibility < 0.4 || re.visibility < 0.4)
        return { ok: false, reason: "Your face was not clearly found. Look straight at the camera, with your head and shoulders in view." };
    const full = document.createElement("canvas");
    full.width = vw;
    full.height = vh;
    const fctx = full.getContext("2d", { willReadFrequently: true });
    fctx.drawImage(video, 0, 0, vw, vh);
    const earDist = Math.abs(le.x - re.x) * vw;
    const size = Math.max(40, earDist * 1.9);
    const cx = nose.x * vw, cy = nose.y * vh - size * 0.05;
    const out = document.createElement("canvas");
    out.width = out.height = 128;
    const o = out.getContext("2d");
    o.save();
    o.beginPath();
    o.arc(64, 64, 62, 0, Math.PI * 2);
    o.clip();
    if (mirror) {
        o.translate(128, 0);
        o.scale(-1, 1); // show it like the selfie preview the player is used to
    }
    o.drawImage(full, cx - size / 2, cy - size / 2, size, size, 0, 0, 128, 128);
    o.restore();
    // skin: average of both cheeks
    const cheeks = [avgColor(fctx, nose.x * vw - size * 0.22, nose.y * vh + size * 0.06, size * 0.05), avgColor(fctx, nose.x * vw + size * 0.22, nose.y * vh + size * 0.06, size * 0.05)].filter(Boolean);
    let skin = 0xf1d3c4;
    if (cheeks.length) {
        const m = [0, 1, 2].map((i) => cheeks.reduce((s, c) => s + c[i], 0) / cheeks.length);
        skin = rgbToInt(Math.min(255, m[0] * 1.05), Math.min(255, m[1] * 1.05), Math.min(255, m[2] * 1.05));
    }
    // shirt: patch in the middle of the torso
    let jacket = 0x2aa8ff;
    const ls = pose[LM.L_SHOULDER], rs = pose[LM.R_SHOULDER], lh = pose[LM.L_HIP], rh = pose[LM.R_HIP];
    if (ls && rs && lh && rh && [ls, rs, lh, rh].every((p) => p.visibility > 0.5)) {
        const tx = ((ls.x + rs.x + lh.x + rh.x) / 4) * vw;
        const ty = (ls.y * 0.6 + rs.y * 0.6 + lh.y * 0.4 + rh.y * 0.4) / 2 * vh;
        const half = Math.abs(ls.x - rs.x) * vw * 0.12;
        const c = avgColor(fctx, tx, ty, Math.max(4, half));
        if (c) {
            // keep the shirt vivid enough to read on the dark neon stage
            const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
            const k = lum < 70 ? 70 / Math.max(lum, 1) : 1;
            jacket = rgbToInt(Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k));
        }
    }
    return { ok: true, character: { face: out.toDataURL("image/png"), skin, jacket, hair } };
}
