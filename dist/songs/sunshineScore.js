import { BPM, SECTIONS, TOTAL_BEATS } from "./structure.js";
/** Original composition "Sunshine Shake": A minor, 128 BPM. Chords Am-F-C-G. */
const CH = {
    Am: { root: 45, stab: [57, 60, 64], pad: [45, 57, 60, 64] },
    F: { root: 41, stab: [57, 60, 65], pad: [41, 53, 60, 65] },
    C: { root: 48, stab: [60, 64, 67], pad: [48, 55, 60, 64] },
    G: { root: 43, stab: [59, 62, 67], pad: [43, 55, 59, 62] },
};
const sec = (name, nth = 0) => SECTIONS.filter((s) => s.name === name)[nth];
/** Chords per 4-beat bar for each section kind (2 bars = 1 eight-count). */
const PROG_VERSE = ["Am", "Am", "F", "G", "Am", "Am", "F", "G"];
const PROG_PRE = ["F", "G", "F", "G"];
const PROG_CHORUS = ["Am", "F", "C", "G", "Am", "F", "C", "G"];
const PROG_BRIDGE = ["F", "G", "F", "G"];
const LINE_VERSE = [[0, 1, 69], [1.5, 0.5, 72], [2, 1, 76], [3.5, 0.5, 74], [4, 1, 72], [5.5, 0.5, 69], [6, 1.5, 67]];
const LINE_PRE_A = [[0, 1, 72], [1, 1, 74], [2, 1, 76], [3, 1, 77], [4, 1, 79], [5, 1, 81], [6, 2, 84]];
const LINE_PRE_B = [[0, 0.5, 76], [0.5, 0.5, 76], [1, 0.5, 79], [1.5, 0.5, 79], [2, 0.5, 81], [2.5, 0.5, 81], [3, 1, 84], [4, 0.5, 83], [4.5, 0.5, 83], [5, 0.5, 84], [5.5, 0.5, 86], [6, 2, 88]];
// "Shake, shake, sun-shine shake!"
const HOOK_1 = [[0, 0.75, 76], [1, 0.75, 76], [2, 0.5, 79], [2.5, 0.5, 81], [3, 1.5, 79], [5, 0.5, 77], [5.5, 0.5, 76], [6, 1, 74], [7, 1, 72]];
// "Reach up high, let the sky awake"
const HOOK_2 = [[0, 0.5, 79], [0.5, 0.5, 79], [1, 1, 81], [2, 0.5, 79], [2.5, 0.5, 76], [3, 1, 79], [4, 0.5, 74], [4.5, 0.5, 76], [5, 1, 79], [6, 0.5, 81], [6.5, 0.5, 79], [7, 1, 76]];
// "We're all dancing, no mistake"
const HOOK_4 = [[0, 0.5, 72], [0.5, 0.5, 76], [1, 0.5, 79], [1.5, 0.5, 76], [2, 1, 84], [3, 1, 79], [4, 0.5, 74], [4.5, 0.5, 79], [5, 0.5, 83], [5.5, 0.5, 81], [6, 2, 79]];
const LINE_BRIDGE = [[0, 1.5, 69], [2, 1.5, 72], [4, 1.5, 76], [6, 2, 74]];
export function buildSunshineScore() {
    const kick = [], snare = [], clap = [], hatC = [], hatO = [], crash = [];
    const bass = [], stabs = [], pads = [], arp = [], lead = [];
    const risers = [];
    const duck = [];
    const bars = TOTAL_BEATS / 4;
    const progAt = (bar) => {
        const beat = bar * 4;
        const inSec = (n, i) => {
            const s = sec(n, i);
            return s && beat >= s.startBeat && beat < s.startBeat + s.beats ? (beat - s.startBeat) / 4 : -1;
        };
        for (const i of [0, 1]) {
            let k = inSec("Verse 1", 0);
            if (i === 1)
                k = inSec("Verse 2", 0);
            if (k >= 0)
                return PROG_VERSE[k];
        }
        for (const i of [0, 1]) {
            const k = inSec("Pre-Chorus", i);
            if (k >= 0)
                return PROG_PRE[k];
        }
        for (const n of ["Chorus", "Final Chorus"])
            for (const i of [0, 1]) {
                const k = inSec(n, i);
                if (k >= 0)
                    return PROG_CHORUS[k];
            }
        const kb = inSec("Bridge", 0);
        if (kb >= 0)
            return PROG_BRIDGE[kb];
        return "Am"; // intro / outro
    };
    const kindAt = (beat) => {
        const s = SECTIONS.find((x) => beat >= x.startBeat && beat < x.startBeat + x.beats);
        return s.name;
    };
    for (let bar = 0; bar < bars; bar++) {
        const b0 = bar * 4;
        const name = kindAt(b0);
        const chord = CH[progAt(bar)];
        const isChorus = name === "Chorus" || name === "Final Chorus";
        const isVerse = name.startsWith("Verse");
        const isPre = name === "Pre-Chorus";
        const isBridge = name === "Bridge";
        const isIntro = name === "Intro";
        const isOutro = name === "Outro";
        const sectionStart = SECTIONS.find((x) => b0 >= x.startBeat && b0 < x.startBeat + x.beats);
        const barInSec = (b0 - sectionStart.startBeat) / 4;
        const lastBarOfSec = barInSec === sectionStart.beats / 4 - 1;
        // ---- drums
        const kicks = isIntro ? (b0 >= 8 ? [0, 1, 2, 3] : []) : isBridge && !lastBarOfSec ? [] : isOutro && bar * 4 >= 228 ? [] : [0, 1, 2, 3];
        for (const k of kicks) {
            kick.push({ beat: b0 + k, vel: k === 0 ? 1 : 0.92 });
            duck.push(b0 + k);
        }
        if (isChorus || isVerse || isPre || isBridge || (isOutro && b0 < 228)) {
            if (!(isBridge && !lastBarOfSec && barInSec === 0)) {
                clap.push({ beat: b0 + 1, vel: 0.9 }, { beat: b0 + 3, vel: 0.95 });
            }
        }
        if (isChorus || isVerse || isOutro)
            snare.push({ beat: b0 + 3, vel: isChorus ? 0.35 : 0.2 });
        if (isPre && lastBarOfSec)
            for (let i = 0; i < 8; i++)
                snare.push({ beat: b0 + 2 + i * 0.25, vel: 0.35 + i * 0.09 });
        if (isPre && !lastBarOfSec)
            snare.push({ beat: b0 + 3, vel: 0.4 });
        // hats: 8ths, open hat on the off-beat after counts 2 and 4, 16ths in choruses' last bars
        const hatOn = !isBridge || lastBarOfSec;
        if (hatOn) {
            for (let i = 0; i < 8; i++) {
                const t = b0 + i * 0.5;
                const off = i % 2 === 1;
                if (off && (i === 3 || i === 7) && (isChorus || isVerse || isOutro))
                    hatO.push({ beat: t, vel: 0.8 });
                else
                    hatC.push({ beat: t, vel: off ? 0.7 : 0.5 });
                if (isChorus && (barInSec % 2 === 1) && off)
                    hatC.push({ beat: t + 0.25, vel: 0.45 });
            }
        }
        if (isIntro && b0 < 8)
            for (let i = 0; i < 8; i++)
                hatC.push({ beat: b0 + i * 0.5, vel: 0.4 });
        if (barInSec === 0 && (isChorus || (isOutro)))
            crash.push({ beat: b0, vel: isOutro ? 0.9 : 0.85 });
        if (barInSec === 0 && name === "Pre-Chorus")
            crash.push({ beat: b0, vel: 0.35 });
        // ---- bass: funk groove (silent in the bridge until the last bar, light in the intro start)
        const playBass = !(isBridge && !lastBarOfSec) && !(isIntro && b0 < 8) && !(isOutro && b0 >= 228);
        if (playBass) {
            const pat = [[0, 0.5, 0], [0.75, 0.25, 0], [1.5, 0.5, 12], [2, 0.5, 0], [2.75, 0.25, 7], [3.25, 0.5, 0]];
            for (const [o, d, st] of pat)
                bass.push({ beat: b0 + o, dur: d * 0.9, midi: chord.root + st, vel: isChorus ? 1 : 0.9 });
        }
        // ---- funk stabs on the "and"s
        if (isVerse || isChorus || isPre) {
            const offs = isChorus ? [0.5, 1.75, 2.5, 3.75] : [0.75, 2.75];
            for (const o of offs)
                stabs.push({ beat: b0 + o, dur: 0.22, notes: [...chord.stab], vel: isChorus ? 1 : 0.8 });
        }
        // ---- pads
        if (!isOutro || b0 < 228)
            pads.push({ beat: b0, dur: 3.9, notes: [...chord.pad], vel: isBridge ? 1.3 : isIntro ? 0.9 : 0.8 });
        // ---- sparkle arpeggio in the choruses and intro
        if (isChorus || (isIntro && b0 >= 8)) {
            const tones = [chord.stab[0] + 12, chord.stab[1] + 12, chord.stab[2] + 12, chord.stab[1] + 12];
            for (let i = 0; i < 8; i++)
                arp.push({ beat: b0 + i * 0.5, dur: 0.25, midi: tones[i % 4] + (i >= 4 ? 12 : 0), vel: 0.6 });
        }
    }
    // ---- melody ("the vocal line", played by a lead synth: there are no sung vocals in this render)
    const place = (start, notes, vel = 1) => notes.forEach(([o, d, m]) => lead.push({ beat: start + o, dur: d * 0.9, midi: m, vel }));
    const v1 = sec("Verse 1"), v2 = sec("Verse 2");
    for (const v of [v1, v2])
        for (let i = 0; i < 4; i++)
            place(v.startBeat + i * 8, LINE_VERSE, 0.8);
    for (const p of [sec("Pre-Chorus", 0), sec("Pre-Chorus", 1)]) {
        place(p.startBeat, LINE_PRE_A, 0.85);
        place(p.startBeat + 8, LINE_PRE_B, 0.9);
    }
    for (const c of [sec("Chorus", 0), sec("Chorus", 1), sec("Final Chorus")]) {
        place(c.startBeat, HOOK_1);
        place(c.startBeat + 8, HOOK_2);
        place(c.startBeat + 16, HOOK_1);
        place(c.startBeat + 24, HOOK_4);
    }
    const br = sec("Bridge");
    place(br.startBeat, LINE_BRIDGE, 0.8);
    place(br.startBeat + 8, LINE_BRIDGE.map(([o, d, m]) => [o, d, m + 2]), 0.85);
    // intro call + outro tag
    place(12, [[0, 0.5, 76], [1, 0.5, 79], [2, 0.5, 81], [3, 1, 84]], 0.8);
    place(sec("Outro").startBeat, [[0, 0.75, 76], [1, 0.75, 76], [2, 0.5, 79], [2.5, 0.5, 81], [3, 1, 79], [4, 1, 76], [6, 2, 69]], 1);
    // ---- risers into the chorus and into the final chorus + the end hit
    risers.push({ beat: sec("Pre-Chorus", 0).startBeat + 8, dur: 8 }, { beat: sec("Pre-Chorus", 1).startBeat + 8, dur: 8 }, { beat: br.startBeat + 8, dur: 8 });
    // final button
    kick.push({ beat: TOTAL_BEATS, vel: 1 });
    duck.push(TOTAL_BEATS);
    crash.push({ beat: TOTAL_BEATS, vel: 1 });
    stabs.push({ beat: TOTAL_BEATS, dur: 1.5, notes: [...CH.Am.stab, 69], vel: 1.2 });
    bass.push({ beat: TOTAL_BEATS, dur: 2, midi: 33, vel: 1 });
    return { bpm: BPM, totalBeats: TOTAL_BEATS, tailBeats: 4, kick, snare, clap, hatC, hatO, crash, bass, stabs, pads, arp, lead, risers, duckKicks: duck };
}
