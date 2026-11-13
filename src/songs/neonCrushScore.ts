import type { Chord, Hit, Note, Riser, SongScore } from "../synth.js";
import { BPM, SECTIONS, TOTAL_BEATS } from "./neonCrush.js";

/** Original composition "Neon Crush": C minor, 120 BPM, trap-style drums + 808, K-pop chant hook. Chords Cm - Ab - Eb - Bb. */
const CH = {
  Cm: { root: 36, stab: [60, 63, 67], pad: [48, 60, 63, 67] },
  Ab: { root: 32, stab: [60, 63, 68], pad: [44, 56, 60, 63] },
  Eb: { root: 39, stab: [58, 63, 67], pad: [39, 55, 58, 63] },
  Bb: { root: 34, stab: [58, 62, 65], pad: [46, 58, 62, 65] },
} as const;
type Ch = keyof typeof CH;

const PROG: Record<string, Ch[]> = {
  Intro: ["Cm", "Cm", "Cm", "Cm"],
  "Verse 1": ["Cm", "Cm", "Ab", "Ab", "Bb", "Bb"],
  "Verse 2": ["Cm", "Cm", "Ab", "Ab", "Bb", "Bb"],
  "Pre-Chorus": ["Ab", "Bb", "Ab", "Bb"],
  Chorus: ["Cm", "Ab", "Eb", "Bb", "Cm", "Ab", "Eb", "Bb"],
  "Final Chorus": ["Cm", "Ab", "Eb", "Bb", "Cm", "Ab", "Eb", "Bb"],
  "Dance Break": ["Cm", "Cm", "Ab", "Bb"],
  Bridge: ["Ab", "Eb", "Bb", "Bb"],
  Outro: ["Cm", "Ab", "Eb", "Cm"],
};

type N = [off: number, dur: number, midi: number];
// the chant hook "Neon, neon, crush on me! / Light it up, we're running free!" (C minor; 79 = G5, 82 = Bb5, 75 = Eb5, 77 = F5, 80 = Ab5, 84 = C6)
const H1: N[] = [[0, 0.5, 79], [0.5, 0.5, 79], [1, 0.5, 79], [1.5, 0.5, 82], [2, 1, 79], [3.5, 0.5, 75], [4, 0.5, 80], [4.5, 0.5, 80], [5, 0.5, 80], [5.5, 0.5, 84], [6, 1.5, 80]];
const H2: N[] = [[0, 0.5, 82], [0.5, 0.5, 82], [1, 0.5, 79], [1.5, 0.5, 77], [2, 1, 79], [3.5, 0.5, 75], [4, 0.5, 77], [4.5, 0.5, 79], [5, 1, 82], [6, 1, 79], [7, 0.5, 77]];
const H3: N[] = [[0, 0.5, 79], [0.5, 0.5, 79], [1, 0.5, 79], [1.5, 0.5, 82], [2, 1, 84], [3, 0.5, 82], [3.5, 0.5, 79], [4, 0.5, 80], [4.5, 0.5, 82], [5, 0.5, 84], [5.5, 0.5, 87], [6, 2, 84]];
const H4: N[] = [[0, 0.5, 82], [0.5, 0.5, 79], [1, 0.5, 77], [1.5, 0.5, 75], [2, 1, 77], [3, 1, 79], [4, 0.5, 75], [4.5, 0.5, 77], [5, 0.5, 79], [5.5, 0.5, 82], [6, 2, 79]];
const VERSE_LINE: N[] = [[0, 0.75, 67], [1, 0.5, 70], [1.5, 0.5, 72], [2.5, 0.75, 70], [4, 0.75, 67], [5, 0.5, 63], [5.5, 0.5, 65], [6.5, 1, 67]];
const PRE_A: N[] = [[0, 0.5, 72], [1, 0.5, 74], [2, 0.5, 75], [3, 0.5, 77], [4, 0.5, 79], [5, 0.5, 80], [6, 2, 82]];
const BRIDGE_LINE: N[] = [[0, 1.5, 72], [2, 1.5, 75], [4, 1.5, 79], [6, 2, 77]];

export function buildNeonCrushScore(): SongScore {
  const kick: Hit[] = [], snare: Hit[] = [], clap: Hit[] = [], hatC: Hit[] = [], hatO: Hit[] = [], crash: Hit[] = [];
  const bass: Note[] = [], sub: Note[] = [], stabs: Chord[] = [], pads: Chord[] = [], arp: Note[] = [], lead: Note[] = [], shout: Note[] = [];
  const risers: Riser[] = [];
  const duck: number[] = [];
  const bars = TOTAL_BEATS / 4;

  const secAt = (beat: number) => SECTIONS.find((x) => beat >= x.startBeat && beat < x.startBeat + x.beats)!;

  for (let bar = 0; bar < bars; bar++) {
    const b0 = bar * 4;
    const sec = secAt(b0);
    const name = sec.name;
    const barInSec = (b0 - sec.startBeat) / 4;
    const lastBar = barInSec === sec.beats / 4 - 1;
    const prog = PROG[name];
    const chordName = prog[barInSec % prog.length];
    const chord = CH[chordName];
    const isChorus = name === "Chorus" || name === "Final Chorus";
    const isVerse = name.startsWith("Verse");
    const isPre = name === "Pre-Chorus";
    const isBreak = name === "Dance Break";
    const isBridge = name === "Bridge";
    const isIntro = name === "Intro";
    const isOutro = name === "Outro";
    const finalBar = isOutro && lastBar;

    // ---- drums: half-time trap in verses (snare/clap on 3), full "four on the floor + claps" energy in choruses and the break
    let kicks: number[];
    if (isIntro) kicks = b0 >= 8 ? [0, 2.5] : [];
    else if (isChorus || isBreak) kicks = [0, 1, 1.75, 2.5, 3.25];
    else if (isBridge) kicks = lastBar ? [0, 1, 2, 3] : [];
    else if (isPre) kicks = [0, 1.5, 2.5, 3];
    else kicks = [0, 1.75, 2.5];
    if (isPre && lastBar) kicks = [0, 1, 2, 2.5, 3, 3.5];
    for (const k of kicks) {
      kick.push({ beat: b0 + k, vel: k === 0 ? 1 : Number.isInteger(k) ? 0.85 : 0.65 });
      duck.push(b0 + k);
    }
    if (isChorus || isBreak) clap.push({ beat: b0 + 1, vel: 0.85 }, { beat: b0 + 3, vel: 0.95 });
    else if (isVerse || isPre || (isOutro && !finalBar) || (isIntro && b0 >= 8)) clap.push({ beat: b0 + 2, vel: 0.95 });
    if (isChorus || isBreak || isVerse) snare.push({ beat: b0 + 2, vel: isChorus ? 0.5 : 0.7 });
    if (isPre && lastBar) for (let i = 0; i < 12; i++) snare.push({ beat: b0 + 2 + i / 6, vel: 0.25 + i * 0.07 }); // snare roll into the drop
    // hats: steady 8ths, trap 16th / triplet rolls at phrase ends
    const hatOn = !(isBridge && !lastBar) && !(isIntro && b0 < 8);
    if (hatOn) {
      for (let i = 0; i < 8; i++) {
        const t = b0 + i * 0.5;
        if (i === 7 && (isVerse || isChorus || isBreak)) hatO.push({ beat: t, vel: 0.7 });
        else hatC.push({ beat: t, vel: i % 2 ? 0.8 : 1.1 });
      }
      if (lastBar && (isVerse || isChorus || isBreak)) for (let i = 0; i < 6; i++) hatC.push({ beat: b0 + 3 + i / 12 * 2 * 0.5 * 2, vel: 0.35 + i * 0.07 }); // roll
    }
    if (isIntro && b0 < 8) for (let i = 0; i < 4; i++) hatC.push({ beat: b0 + i, vel: 0.4 });
    if (barInSec === 0 && (isChorus || isBreak || isOutro)) crash.push({ beat: b0, vel: 0.85 });

    // ---- 808 + bass
    const silentBeat = isPre && lastBar ? 3.5 : 99; // one breath of silence before the drop
    const playLow = !(isBridge && !lastBar) && !(isIntro && b0 < 8) && !finalBar;
    if (playLow) {
      const pat: [number, number][] = isChorus || isBreak ? [[0, 1.2], [1.5, 0.4], [2.5, 0.6], [3.25, 0.6]] : isPre ? [[0, 1.5], [2.5, 1]] : [[0, 1.5], [1.75, 0.5], [2.5, 1.2]];
      for (const [o, d] of pat) if (o < silentBeat) sub.push({ beat: b0 + o, dur: d, midi: chord.root, vel: isChorus || isBreak ? 1 : 0.9 });
      // a light plucky bass on top in the loud parts so it is not only sub
      if (isChorus || isBreak) for (const o of [0, 1.5, 2.5]) bass.push({ beat: b0 + o, dur: 0.35, midi: chord.root + 24, vel: 0.55 });
    }
    // ---- stabs / pads / arp
    if (isChorus || isBreak) for (const o of isBreak ? [0, 0.75, 1.5, 2.5] : [0, 0.75, 1.5, 2.25, 3]) stabs.push({ beat: b0 + o, dur: 0.22, notes: [...chord.stab], vel: 1.5 });
    else if (isVerse) for (const o of [0.75, 2.75]) stabs.push({ beat: b0 + o, dur: 0.2, notes: [...chord.stab], vel: 1.0 });
    if (!finalBar) pads.push({ beat: b0, dur: 3.9, notes: [...chord.pad], vel: isBridge ? 1.3 : 0.8 });
    if (isChorus || (isIntro && b0 >= 8) || isOutro) {
      const tones = [chord.stab[0] + 12, chord.stab[1] + 12, chord.stab[2] + 12, chord.stab[1] + 12];
      for (let i = 0; i < 8; i++) arp.push({ beat: b0 + i * 0.5, dur: 0.25, midi: tones[i % 4] + (i >= 4 ? 12 : 0), vel: 0.8 });
    }
  }

  // ---- melody: the chant hook plays on the lead; the verses get a gentle line
  const place = (start: number, notes: N[], vel = 1) => notes.forEach(([o, d, m]) => lead.push({ beat: start + o, dur: d * 0.9, midi: m, vel: vel * 1.35 }));
  for (const sec of SECTIONS) {
    if (sec.name === "Chorus" || sec.name === "Final Chorus") {
      place(sec.startBeat, H1);
      place(sec.startBeat + 8, H2);
      place(sec.startBeat + 16, H3);
      place(sec.startBeat + 24, H4);
      // group "hey!" after each phrase
      for (const o of [7.5, 15.5, 23.5, 31.5]) shout.push({ beat: sec.startBeat + o, dur: 0.4, midi: 62, vel: 0.8 });
      shout.push({ beat: sec.startBeat, dur: 0.4, midi: 60, vel: 0.9 });
    } else if (sec.name.startsWith("Verse")) {
      for (let i = 0; i < sec.beats / 8; i++) place(sec.startBeat + i * 8, VERSE_LINE, 0.75);
    } else if (sec.name === "Pre-Chorus") {
      place(sec.startBeat, PRE_A, 0.85);
      place(sec.startBeat + 8, PRE_A.map(([o, d, m]) => [o, d, m + 2] as N), 0.9);
    } else if (sec.name === "Bridge") {
      place(sec.startBeat, BRIDGE_LINE, 0.8);
      place(sec.startBeat + 8, BRIDGE_LINE.map(([o, d, m]) => [o, d, m + 2] as N), 0.85);
    } else if (sec.name === "Dance Break") {
      for (let i = 0; i < 4; i++) for (const o of [0, 1.5]) shout.push({ beat: sec.startBeat + i * 4 + o + 2 * (i % 2), dur: 0.4, midi: 59 + (i % 2) * 3, vel: 0.85 });
    } else if (sec.name === "Outro") {
      place(sec.startBeat, H1.slice(0, 5), 0.9);
      place(sec.startBeat + 8, [[0, 0.5, 79], [0.5, 0.5, 79], [1, 1, 84]], 1);
    }
  }
  place(12, [[0, 0.5, 79], [1, 0.5, 82], [2, 0.5, 84], [3, 1, 87]], 0.8); // intro call
  shout.push({ beat: 15.5, dur: 0.4, midi: 64, vel: 0.9 });

  // ---- risers into each drop and into the bridge's end, + end hit
  for (const sec of SECTIONS) if (sec.name === "Pre-Chorus") risers.push({ beat: sec.startBeat + 8, dur: 8 });
  const bridge = SECTIONS.find((x) => x.name === "Bridge")!;
  risers.push({ beat: bridge.startBeat + 8, dur: 8 });
  kick.push({ beat: TOTAL_BEATS, vel: 1 });
  duck.push(TOTAL_BEATS);
  crash.push({ beat: TOTAL_BEATS, vel: 1 });
  stabs.push({ beat: TOTAL_BEATS, dur: 1.5, notes: [...CH.Cm.stab, 72], vel: 1.2 });
  sub.push({ beat: TOTAL_BEATS, dur: 2, midi: 36, vel: 1 });
  shout.push({ beat: TOTAL_BEATS, dur: 0.5, midi: 60, vel: 1 });

  return { bpm: BPM, totalBeats: TOTAL_BEATS, tailBeats: 4, kick, snare, clap, hatC, hatO, crash, bass, sub, shout, stabs, pads, arp, lead, risers, duckKicks: duck };
}
