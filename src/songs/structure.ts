import type { SongSection } from "./types.js";

/** "Sunshine Shake": 128 BPM, 4/4, 29 eight-counts = 232 beats = 108.75 s. */
export const BPM = 128;
export const BEAT_SEC = 60 / BPM;
export const EIGHT = 8;

const s = (name: string, start8: number, count8: number): SongSection => ({ name, startBeat: start8 * EIGHT, beats: count8 * EIGHT });

export const SECTIONS: SongSection[] = [
  s("Intro", 0, 2),
  s("Verse 1", 2, 4),
  s("Pre-Chorus", 6, 2),
  s("Chorus", 8, 4),
  s("Verse 2", 12, 4),
  s("Pre-Chorus", 16, 2),
  s("Chorus", 18, 4),
  s("Bridge", 22, 2),
  s("Final Chorus", 24, 4),
  s("Outro", 28, 1),
];

export const TOTAL_BEATS = 29 * EIGHT; // 232
