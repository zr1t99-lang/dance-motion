export const OUTFITS = [
    { name: "Pink Pop", girl: true, skin: 0xf6cfb8, jacket: 0xf2338f, shirt: 0xffffff, pants: 0xf6f1ff, shoes: 0xffffff, hair: 0x2b1428, pony: true, headband: null },
    { name: "Purple Star", girl: false, skin: 0xf0c4a0, jacket: 0x6b2fff, shirt: 0xf4f0ff, pants: 0x15111f, shoes: 0xffffff, hair: 0x5b3a24, pony: false, headband: 0x8f5cff },
    { name: "Neon Lime", girl: true, skin: 0xc98d5f, jacket: 0xb6ff2e, shirt: 0x151515, pants: 0x1c1c26, shoes: 0xfff04a, hair: 0x201020, pony: true, headband: null },
    { name: "Sporty Blue", girl: false, skin: 0xe0b48a, jacket: 0x2d6bff, shirt: 0xffd23a, pants: 0x111426, shoes: 0xffffff, hair: 0x1a1208, pony: false, headband: 0xffd23a },
    { name: "Holo", girl: true, skin: 0xf3d1b8, jacket: 0xc9b8ff, shirt: 0xbff4ff, pants: 0xe6dcff, shoes: 0xffffff, hair: 0x1b1030, pony: true, headband: null },
    { name: "Red Rock", girl: false, skin: 0xd9a77c, jacket: 0xe01f2e, shirt: 0xffffff, pants: 0x15101a, shoes: 0xffffff, hair: 0x0d0a10, pony: false, headband: null },
    { name: "Gold Star", girl: true, skin: 0xefc7a0, jacket: 0xf2b632, shirt: 0x1a1020, pants: 0x1c1426, shoes: 0x111111, hair: 0x2a1a10, pony: true, headband: null },
    { name: "White Ice", girl: false, skin: 0xf1cfb0, jacket: 0xf2f6ff, shirt: 0x2d6bff, pants: 0xf2f6ff, shoes: 0xffffff, hair: 0x8a5a2b, pony: false, headband: 0x5ec8ff },
];
/** Left coach / right coach pairs offered in the ready screen. */
export const COACH_SETS = [
    { name: "Pink & Purple", pair: [0, 1] },
    { name: "Neon & Sporty", pair: [2, 3] },
    { name: "Holo & Red", pair: [4, 5] },
    { name: "Gold & Ice", pair: [6, 7] },
];
const hex = (n) => "#" + n.toString(16).padStart(6, "0");
/** Friendly cartoon face (eyes, brows, blush, smile) drawn on a canvas, used as the coach's face plate. */
export function cartoonFace(skin, girl) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fillStyle = hex(skin);
    g.fill();
    g.clip();
    // blush
    g.fillStyle = "rgba(255,90,120,0.35)";
    for (const x of [34, 94]) {
        g.beginPath();
        g.ellipse(x, 78, 12, 7, 0, 0, Math.PI * 2);
        g.fill();
    }
    // eyes
    for (const x of [44, 84]) {
        g.fillStyle = "#fff";
        g.beginPath();
        g.ellipse(x, 58, 11, 13, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#2a1408";
        g.beginPath();
        g.ellipse(x, 60, 7.5, 10, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(x + 3, 55, 3, 0, Math.PI * 2);
        g.fill();
        if (girl) {
            g.strokeStyle = "#1a0d06";
            g.lineWidth = 3;
            g.beginPath();
            g.arc(x, 56, 12, Math.PI * 1.1, Math.PI * 1.9);
            g.stroke();
        }
        g.strokeStyle = "#3a2010";
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(x - 11, 40);
        g.quadraticCurveTo(x, 34, x + 11, 40);
        g.stroke();
    }
    // smile
    g.strokeStyle = "#8a2230";
    g.lineWidth = 4;
    g.lineCap = "round";
    g.beginPath();
    g.arc(64, 82, 16, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
    return c;
}
export function outfitLook(o) {
    return {
        skin: o.skin, jacket: o.jacket, shirt: o.shirt, pants: o.pants, shoes: o.shoes, glove: o.skin, hair: o.hair,
        pony: o.pony && !o.girl, longHair: o.girl, shades: false, headband: o.headband, baggy: true, face: cartoonFace(o.skin, o.girl),
    };
}
const KEY = "dance-motion.coachset.v1";
export function loadCoachSet() {
    try {
        const n = Number(localStorage.getItem(KEY));
        if (Number.isInteger(n) && n >= 0 && n < COACH_SETS.length)
            return n;
    }
    catch {
        /* ignore */
    }
    return 0;
}
export function saveCoachSet(n) {
    try {
        localStorage.setItem(KEY, String(n));
    }
    catch {
        /* ignore */
    }
}
