import { BeatAudio } from "./audio.js";
import { renderSong, type Rendered } from "./synth.js";
import { buildSunshineScore } from "./songs/sunshineScore.js";
import type { SongDef } from "./songs/types.js";

export interface MusicStatus {
  /** "ready" once the instrumental is rendered. */
  instrumental: "idle" | "rendering" | "ready" | "error";
  /** true only when a real vocal stem file was found and decoded. */
  vocals: boolean;
  /** audio:"file" songs: no local audio found yet, the player has to choose the file. */
  needsFile?: boolean;
  /** audio:"file": name and length of the decoded clip. */
  fileInfo?: string;
  error?: string;
}

let rendered: Rendered | null = null;
let renderPromise: Promise<Rendered> | null = null;

/** Render (once) the instrumental in a Web Worker; falls back to the main thread if workers are unavailable. */
export function prepareInstrumental(sampleRate = 32000): Promise<Rendered> {
  if (rendered) return Promise.resolve(rendered);
  if (renderPromise) return renderPromise;
  renderPromise = new Promise<Rendered>((resolve, reject) => {
    const mainThread = () => {
      try {
        rendered = renderSong(buildSunshineScore(), sampleRate);
        resolve(rendered);
      } catch (e) {
        reject(e);
      }
    };
    try {
      const w = new Worker(new URL("./synthWorker.js", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent) => {
        w.terminate();
        if (e.data.ok) {
          rendered = { left: e.data.left, right: e.data.right, sampleRate: e.data.sampleRate, seconds: e.data.seconds };
          resolve(rendered);
        } else mainThread();
      };
      w.onerror = () => {
        w.terminate();
        mainThread();
      };
      w.postMessage({ sampleRate });
    } catch {
      mainThread();
    }
  }).catch((e) => {
    renderPromise = null;
    throw e;
  });
  return renderPromise;
}

/**
 * Plays a song (or the practice click beat) and keeps it sample-aligned with the choreography clock:
 * start() is given the performance.now() timestamp of choreography t = 0 and the music's beat 0 is
 * scheduled for exactly that moment (minus the device's reported output latency, plus the user offset).
 */
/** A 3-minute silent mono WAV (8-bit, 4 kHz, ~720 KB) as a blob URL. Not looped: a tiny looping clip makes some browsers spin. */
function silentWavUrl(): string {
  const sr = 4000, n = sr * 180;
  const b = new Uint8Array(44 + n).fill(128);
  const dv = new DataView(b.buffer);
  const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  w(36, "data"); dv.setUint32(40, n, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

/**
 * iPhone/iPad: Web Audio is muted by the silent switch unless the page is in the "playback" audio session.
 * Must run inside a tap. Harmless (no-op) on browsers that lack these APIs.
 */
function unlockAudioSession(): HTMLAudioElement | null {
  try {
    (navigator as any).audioSession.type = "playback";
  } catch {
    /* not supported */
  }
  try {
    const a = new Audio(silentWavUrl());
    (a as any).playsInline = true;
    a.play().catch(() => {});
    return a;
  } catch {
    return null;
  }
}

export class MusicPlayer {
  private keepAlive: HTMLAudioElement | null = null;
  /** Called when the browser refuses to start sound (shown to the player; never silently ignored). */
  onProblem: ((msg: string) => void) | null = null;

  private beat: BeatAudio | null = null;
  private ctx: AudioContext | null = null;
  private srcs: AudioBufferSourceNode[] = [];
  status: MusicStatus = { instrumental: "idle", vocals: false };
  private vocalBuf: AudioBuffer | null = null;
  private fileBuf: AudioBuffer | null = null;

  /** Decode an audio (or video) file the player picked. Stays in memory only: nothing is stored or uploaded. */
  async loadFile(f: File): Promise<MusicStatus> {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const tmp = new AC();
      this.fileBuf = await tmp.decodeAudioData(await f.arrayBuffer());
      tmp.close();
      this.status = { instrumental: "ready", vocals: false, fileInfo: `${f.name} (${this.fileBuf.duration.toFixed(1)} s)` };
    } catch (e: any) {
      this.fileBuf = null;
      this.status = { instrumental: "error", vocals: false, error: "Could not decode that file as audio. Pick the .mp3/.m4a/.wav clip. " + String(e?.message ?? e) };
    }
    return this.status;
  }

  /** Prepare the song's audio (render instrumental, look for an optional vocal stem). */
  async prepare(def: SongDef): Promise<MusicStatus> {
    if (def.audio === "file") {
      if (!this.fileBuf && def.audioUrl) {
        try {
          const res = await fetch(def.audioUrl);
          if (res.ok && !(res.headers.get("content-type") ?? "").includes("text/html")) {
            const AC = window.AudioContext || (window as any).webkitAudioContext;
            const tmp = new AC();
            this.fileBuf = await tmp.decodeAudioData(await res.arrayBuffer());
            tmp.close();
          }
        } catch {
          this.fileBuf = null;
        }
      }
      this.status = this.fileBuf
        ? { instrumental: "ready", vocals: false, fileInfo: `${def.audioUrl} (${this.fileBuf.duration.toFixed(1)} s)` }
        : { instrumental: "idle", vocals: false, needsFile: true };
      return this.status;
    }
    if (def.audio !== "synth") {
      this.status = { instrumental: "ready", vocals: false };
      return this.status;
    }
    this.status = { instrumental: "rendering", vocals: false };
    try {
      await prepareInstrumental();
      this.status = { instrumental: "ready", vocals: false };
    } catch (e: any) {
      this.status = { instrumental: "error", vocals: false, error: String(e?.message ?? e) };
      return this.status;
    }
    if (def.vocalsUrl) {
      try {
        const res = await fetch(def.vocalsUrl);
        if (res.ok && !(res.headers.get("content-type") ?? "").includes("text/html")) {
          const bytes = await res.arrayBuffer();
          const AC = window.AudioContext || (window as any).webkitAudioContext;
          const tmp = new AC();
          this.vocalBuf = await tmp.decodeAudioData(bytes);
          tmp.close();
          this.status.vocals = true;
        }
      } catch {
        this.vocalBuf = null; // no stem shipped: the instrumental plays alone (and the UI says so)
      }
    }
    return this.status;
  }

  /** Must be called from a user gesture. `startPerf` = performance.now() of choreography t = 0. */
  start(def: SongDef, startPerf: number, offsetMs = 0) {
    this.stop();
    this.keepAlive = unlockAudioSession();
    if (def.audio === "beat") {
      this.beat = new BeatAudio();
      this.beat.start();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (def.audio === "file" ? !this.fileBuf : !rendered) return;
    const ctx: AudioContext = def.audio === "file" ? new AC() : new AC({ sampleRate: rendered!.sampleRate });
    this.ctx = ctx;
    let buf: AudioBuffer;
    if (def.audio === "file") buf = this.fileBuf!;
    else {
      buf = ctx.createBuffer(2, rendered!.left.length, rendered!.sampleRate);
      buf.copyToChannel(rendered!.left as any, 0);
      buf.copyToChannel(rendered!.right as any, 1);
    }
    const maxDur = def.audio === "file" ? def.totalBeats * def.beatSec + 0.5 : undefined; // only the first 60 s of a longer file
    const lat = Math.max(0, (ctx as any).outputLatency || ctx.baseLatency || 0);
    let when = ctx.currentTime + (startPerf - performance.now()) / 1000 - lat + offsetMs / 1000;
    const mk = (b: AudioBuffer, gain: number) => {
      const s = ctx.createBufferSource();
      s.buffer = b;
      const g = ctx.createGain();
      g.gain.value = gain;
      s.connect(g).connect(ctx.destination);
      let skip = 0;
      if (when < ctx.currentTime) {
        skip = ctx.currentTime - when;
        when = ctx.currentTime;
      }
      if (maxDur !== undefined) s.start(when, skip, Math.max(0, maxDur - skip));
      else s.start(when, skip);
      this.srcs.push(s);
    };
    const w0 = when;
    mk(buf, 0.9);
    if (this.vocalBuf) {
      when = w0;
      mk(this.vocalBuf, 1);
    }
    ctx.resume?.().then(() => {
      if (ctx.state !== "running") this.onProblem?.("The browser blocked the sound. Tap the 🔊 button, check the volume / silent switch, then press Restart.");
    });
    (window as any).__songDebug = { ctxTimeAtStart: ctx.currentTime, scheduledFor: w0, latency: lat, perfAtStart: performance.now(), startPerf, ctxNow: () => ctx.currentTime, ctxState: () => ctx.state };
  }

  /** Plays 6 s of the chorus so the player can check volume / silent switch BEFORE the game starts. Call from a tap. */
  async preview(def: SongDef): Promise<string> {
    this.stop();
    this.keepAlive = unlockAudioSession();
    if (def.audio === "beat") return "This routine only has a click beat; it plays when you press START.";
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return "This browser has no Web Audio support.";
    if (def.audio === "file") {
      if (!this.fileBuf) return "Choose the audio file first.";
      const c: AudioContext = new AC();
      this.ctx = c;
      await c.resume();
      if (c.state !== "running") return "The browser blocked the sound (check volume and the silent switch).";
      const sr = c.createBufferSource();
      sr.buffer = this.fileBuf;
      sr.connect(c.destination);
      sr.start(0, 11, 6);
      this.srcs.push(sr);
      return "Playing 6 s of your clip… if you hear nothing: raise the volume and switch off the silent mode.";
    }
    if (!rendered) return "The music is not ready yet.";
    const ctx: AudioContext = new AC({ sampleRate: rendered.sampleRate });
    this.ctx = ctx;
    await ctx.resume();
    if (ctx.state !== "running") return "The browser blocked the sound (check volume and the silent switch).";
    const buf = ctx.createBuffer(2, rendered.left.length, rendered.sampleRate);
    buf.copyToChannel(rendered.left as any, 0);
    buf.copyToChannel(rendered.right as any, 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0, def.beatSec * 64, 6);
    this.srcs.push(src);
    return "Playing the chorus… if you hear nothing: raise the volume and switch off the silent mode.";
  }

  pause() {
    this.beat?.pause();
    this.ctx?.suspend();
  }
  resume() {
    this.beat?.resume();
    this.ctx?.resume();
  }
  stop() {
    this.beat?.stop();
    this.beat = null;
    for (const s of this.srcs) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.srcs = [];
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    try {
      this.keepAlive?.pause();
    } catch {
      /* ignore */
    }
    this.keepAlive = null;
  }
  /** Seconds of audio played so far (AudioContext clock), for drift checks. */
  get ctxTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}
