import type { ChoreoOptions, Move } from "../choreography.js";
import type { ScoringConfig } from "../scoring.js";

export interface LyricLine {
  /** Start, in beats from the beginning of the song. */
  beat: number;
  /** Length in beats. */
  len: number;
  /** F = female lead, M = male lead, B = both / group. */
  who: "F" | "M" | "B";
  text: string;
}

export interface SongSection {
  name: string;
  startBeat: number;
  beats: number;
}

export interface SongDef {
  id: string;
  title: string;
  artist: string;
  blurb: string;
  bpm: number;
  totalBeats: number;
  /** Seconds per beat. */
  beatSec: number;
  sections: SongSection[];
  lyrics: LyricLine[];
  moves: Move[];
  choreo: ChoreoOptions;
  scoring: ScoringConfig;
  /** "synth" = the song is rendered by src/synth.ts; "beat" = the plain practice metronome beat. */
  audio: "synth" | "beat" | "file";
  /**
   * Optional real vocal stem (mp3/wav), exactly aligned to the instrumental (same 128 BPM grid, starting at beat 0).
   * If the file exists it is played on top of the instrumental. See SONG_BRIEF.md.
   */
  vocalsUrl?: string;
  /** audio:"file": local-only audio file tried at this URL (git-ignored); the player can also pick a file. */
  audioUrl?: string;
  audioOffset?: number;
}
