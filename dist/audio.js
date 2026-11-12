/**
 * Original synthesised backing beat (kick / snare / hat / bass), generated live with WebAudio.
 * No samples, no copyrighted music. 120 BPM = one beat every 0.5 s, so the choreography's
 * 3-second move spacing lands on beats.
 */
export class BeatAudio {
    ctx = null;
    timer = 0;
    next = 0;
    step = 0;
    master = null;
    noise = null;
    bpm = 120;
    /** Call from a user gesture. The first beat is scheduled ~0.1 s ahead. */
    start() {
        this.stop();
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC)
            return;
        const ctx = new AC();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(ctx.destination);
        const len = ctx.sampleRate;
        this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        let s = 12345;
        for (let i = 0; i < len; i++) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            d[i] = (s / 2 ** 32) * 2 - 1;
        }
        this.next = ctx.currentTime + 0.1;
        this.step = 0;
        this.timer = window.setInterval(() => this.pump(), 25);
    }
    pause() {
        this.ctx?.suspend();
    }
    resume() {
        this.ctx?.resume();
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = 0;
        try {
            this.ctx?.close();
        }
        catch {
            /* ignore */
        }
        this.ctx = null;
    }
    pump() {
        const ctx = this.ctx;
        if (!ctx)
            return;
        const eighth = 60 / this.bpm / 2;
        while (this.next < ctx.currentTime + 0.12) {
            this.play(this.step % 16, this.next);
            this.next += eighth;
            this.step++;
        }
    }
    play(step, t) {
        const ctx = this.ctx;
        const inBar = step % 8;
        if (inBar % 2 === 0)
            this.kick(t);
        if (inBar === 2 || inBar === 6)
            this.noiseHit(t, 0.12, 1800, 0.5);
        if (inBar % 2 === 1)
            this.noiseHit(t, 0.04, 7000, 0.22);
        const bass = [55, 55, 65.41, 55, 82.41, 55, 49, 55][inBar];
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        osc.type = "sawtooth";
        osc.frequency.value = bass;
        f.type = "lowpass";
        f.frequency.value = 420;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(f).connect(g).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.25);
    }
    kick(t) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        osc.connect(g).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.22);
    }
    noiseHit(t, dur, hp, vol) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = hp;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f).connect(g).connect(this.master);
        src.start(t);
        src.stop(t + dur + 0.02);
    }
}
