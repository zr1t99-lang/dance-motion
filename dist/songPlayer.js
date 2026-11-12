import { BeatAudio } from "./audio.js";
import { renderSong } from "./synth.js";
import { buildSunshineScore } from "./songs/sunshineScore.js";
let rendered = null;
let renderPromise = null;
/** Render (once) the instrumental in a Web Worker; falls back to the main thread if workers are unavailable. */
export function prepareInstrumental(sampleRate = 32000) {
    if (rendered)
        return Promise.resolve(rendered);
    if (renderPromise)
        return renderPromise;
    renderPromise = new Promise((resolve, reject) => {
        const mainThread = () => {
            try {
                rendered = renderSong(buildSunshineScore(), sampleRate);
                resolve(rendered);
            }
            catch (e) {
                reject(e);
            }
        };
        try {
            const w = new Worker(new URL("./synthWorker.js", import.meta.url), { type: "module" });
            w.onmessage = (e) => {
                w.terminate();
                if (e.data.ok) {
                    rendered = { left: e.data.left, right: e.data.right, sampleRate: e.data.sampleRate, seconds: e.data.seconds };
                    resolve(rendered);
                }
                else
                    mainThread();
            };
            w.onerror = () => {
                w.terminate();
                mainThread();
            };
            w.postMessage({ sampleRate });
        }
        catch {
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
export class MusicPlayer {
    beat = null;
    ctx = null;
    srcs = [];
    status = { instrumental: "idle", vocals: false };
    vocalBuf = null;
    /** Prepare the song's audio (render instrumental, look for an optional vocal stem). */
    async prepare(def) {
        if (def.audio !== "synth") {
            this.status = { instrumental: "ready", vocals: false };
            return this.status;
        }
        this.status = { instrumental: "rendering", vocals: false };
        try {
            await prepareInstrumental();
            this.status = { instrumental: "ready", vocals: false };
        }
        catch (e) {
            this.status = { instrumental: "error", vocals: false, error: String(e?.message ?? e) };
            return this.status;
        }
        if (def.vocalsUrl) {
            try {
                const res = await fetch(def.vocalsUrl);
                if (res.ok && !(res.headers.get("content-type") ?? "").includes("text/html")) {
                    const bytes = await res.arrayBuffer();
                    const AC = window.AudioContext || window.webkitAudioContext;
                    const tmp = new AC();
                    this.vocalBuf = await tmp.decodeAudioData(bytes);
                    tmp.close();
                    this.status.vocals = true;
                }
            }
            catch {
                this.vocalBuf = null; // no stem shipped: the instrumental plays alone (and the UI says so)
            }
        }
        return this.status;
    }
    /** Must be called from a user gesture. `startPerf` = performance.now() of choreography t = 0. */
    start(def, startPerf, offsetMs = 0) {
        this.stop();
        if (def.audio === "beat") {
            this.beat = new BeatAudio();
            this.beat.start();
            return;
        }
        if (!rendered)
            return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC)
            return;
        const ctx = new AC({ sampleRate: rendered.sampleRate });
        this.ctx = ctx;
        const buf = ctx.createBuffer(2, rendered.left.length, rendered.sampleRate);
        buf.copyToChannel(rendered.left, 0);
        buf.copyToChannel(rendered.right, 1);
        const lat = Math.max(0, ctx.outputLatency || ctx.baseLatency || 0);
        let when = ctx.currentTime + (startPerf - performance.now()) / 1000 - lat + offsetMs / 1000;
        const mk = (b, gain) => {
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
            s.start(when, skip);
            this.srcs.push(s);
        };
        const w0 = when;
        mk(buf, 0.9);
        if (this.vocalBuf) {
            when = w0;
            mk(this.vocalBuf, 1);
        }
        ctx.resume?.();
        window.__songDebug = { ctxTimeAtStart: ctx.currentTime, scheduledFor: w0, latency: lat, perfAtStart: performance.now(), startPerf, ctxNow: () => ctx.currentTime, ctxState: () => ctx.state };
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
            }
            catch {
                /* already stopped */
            }
        }
        this.srcs = [];
        try {
            this.ctx?.close();
        }
        catch {
            /* ignore */
        }
        this.ctx = null;
    }
    /** Seconds of audio played so far (AudioContext clock), for drift checks. */
    get ctxTime() {
        return this.ctx ? this.ctx.currentTime : 0;
    }
}
