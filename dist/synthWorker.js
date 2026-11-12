/** Renders the song off the main thread so the UI never freezes while the music is prepared. */
import { renderSong } from "./synth.js";
import { buildSunshineScore } from "./songs/sunshineScore.js";
const ctx = self;
ctx.onmessage = (e) => {
    try {
        const r = renderSong(buildSunshineScore(), e.data.sampleRate);
        ctx.postMessage({ ok: true, left: r.left, right: r.right, sampleRate: r.sampleRate, seconds: r.seconds }, [r.left.buffer, r.right.buffer]);
    }
    catch (err) {
        ctx.postMessage({ ok: false, error: String(err?.message ?? err) });
    }
};
