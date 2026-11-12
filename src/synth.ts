/**
 * Deterministic offline synthesiser (pure TypeScript, no WebAudio): turns a SongScore into stereo samples.
 * Because every note is written at a sample-exact position computed from the BPM, the music is perfectly
 * aligned to the choreography's beat grid. There are NO vocals: the sung melody is played by a lead synth.
 */
export interface Hit {
  beat: number;
  vel?: number;
}
export interface Note {
  beat: number;
  dur: number;
  midi: number;
  vel?: number;
}
export interface Chord {
  beat: number;
  dur: number;
  notes: number[];
  vel?: number;
}
export interface Riser {
  beat: number;
  dur: number;
}
export interface SongScore {
  bpm: number;
  totalBeats: number;
  /** Extra beats of ring-out after totalBeats. */
  tailBeats: number;
  kick: Hit[];
  snare: Hit[];
  clap: Hit[];
  hatC: Hit[];
  hatO: Hit[];
  crash: Hit[];
  bass: Note[];
  stabs: Chord[];
  pads: Chord[];
  arp: Note[];
  lead: Note[];
  risers: Riser[];
  /** Beats where the sidechain "pump" is triggered (usually the four-on-the-floor kicks). */
  duckKicks: number[];
}
export interface Rendered {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  seconds: number;
}

const TWO_PI = Math.PI * 2;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed * 2654435761) >>> 0 || 1;
  }
  next() {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 2147483648 - 1;
  }
}

function polyBlep(t: number, dt: number) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}
const saw = (ph: number, dt: number) => 2 * ph - 1 - polyBlep(ph, dt);
const square = (ph: number, dt: number) => (ph < 0.5 ? 1 : -1) + polyBlep(ph, dt) - polyBlep((ph + 0.5) % 1, dt);

export function renderSong(score: SongScore, sampleRate = 32000): Rendered {
  const sr = sampleRate;
  const beatSec = 60 / score.bpm;
  const seconds = (score.totalBeats + score.tailBeats) * beatSec;
  const N = Math.ceil(seconds * sr);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const at = (beat: number) => Math.round(beat * beatSec * sr);
  const lp = (fc: number) => 1 - Math.exp((-TWO_PI * fc) / sr);

  // sidechain pump: gain dips right after each kick and recovers
  const duckAt = score.duckKicks.map(at).sort((a, b) => a - b);
  const duckTau = 0.11 * sr;
  const duckGain = (n: number, depth: number) => {
    // binary search for the last kick <= n
    let lo = 0, hi = duckAt.length - 1, k = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (duckAt[mid] <= n) {
        k = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (k < 0) return 1;
    return 1 - depth * Math.exp(-(n - duckAt[k]) / duckTau);
  };

  const put = (n: number, v: number, pan: number) => {
    if (n < 0 || n >= N) return;
    // equal-power-ish pan, pan in -1..1
    const l = v * (pan > 0 ? 1 - pan * 0.7 : 1);
    const r = v * (pan < 0 ? 1 + pan * 0.7 : 1);
    L[n] += l;
    R[n] += r;
  };

  // ------------------------------------------------------------------ drums
  score.kick.forEach((h, idx) => {
    const n0 = at(h.beat), len = Math.floor(0.3 * sr), vel = h.vel ?? 1;
    const rng = new Rng(1000 + idx);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      ph += (TWO_PI * (46 + 110 * Math.exp(-t / 0.032))) / sr;
      const v = (Math.sin(ph) * Math.exp(-t / 0.115) + rng.next() * Math.exp(-t / 0.004) * 0.22) * 0.95 * vel;
      put(n0 + i, v, 0);
    }
  });
  score.snare.forEach((h, idx) => {
    const n0 = at(h.beat), len = Math.floor(0.24 * sr), vel = h.vel ?? 1;
    const rng = new Rng(2000 + idx);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const nz = rng.next();
      const hp = nz - prev * 0.6;
      prev = nz;
      const v = (hp * Math.exp(-t / 0.085) * 0.55 + Math.sin(TWO_PI * 190 * t) * Math.exp(-t / 0.055) * 0.45) * 0.62 * vel;
      put(n0 + i, v, 0);
    }
  });
  score.clap.forEach((h, idx) => {
    const n0 = at(h.beat), len = Math.floor(0.22 * sr), vel = h.vel ?? 1;
    const rng = new Rng(3000 + idx);
    let lpS = 0, prev = 0;
    const a = lp(4800);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const nz = rng.next();
      const hp = nz - prev * 0.75;
      prev = nz;
      lpS += a * (hp - lpS);
      let env = Math.exp(-t / 0.075) * 0.55;
      for (const off of [0, 0.009, 0.019, 0.029]) if (t >= off && t < off + 0.012) env = Math.max(env, 1 - (t - off) / 0.012);
      put(n0 + i, lpS * env * 0.8 * vel, 0);
    }
  });
  score.hatC.forEach((h, idx) => {
    const n0 = at(h.beat), len = Math.floor(0.07 * sr), vel = h.vel ?? 1;
    const rng = new Rng(4000 + idx);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const nz = rng.next();
      const hp = nz - prev * 0.9;
      prev = nz;
      put(n0 + i, hp * Math.exp(-(i / sr) / 0.018) * 0.2 * vel, 0.25);
    }
  });
  score.hatO.forEach((h, idx) => {
    const n0 = at(h.beat), len = Math.floor(0.3 * sr), vel = h.vel ?? 1;
    const rng = new Rng(5000 + idx);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const nz = rng.next();
      const hp = nz - prev * 0.9;
      prev = nz;
      put(n0 + i, hp * Math.exp(-(i / sr) / 0.09) * 0.17 * vel, 0.2);
    }
  });
  score.crash.forEach((h, idx) => {
    const n0 = at(h.beat), len = Math.floor(2.2 * sr), vel = h.vel ?? 1;
    const rl = new Rng(6000 + idx * 2), rr = new Rng(6001 + idx * 2);
    let pl = 0, pr = 0;
    for (let i = 0; i < len; i++) {
      const e = Math.exp(-(i / sr) / 0.65) * 0.2 * vel;
      const a = rl.next(), b = rr.next();
      const ha = a - pl * 0.92, hb = b - pr * 0.92;
      pl = a;
      pr = b;
      const n = n0 + i;
      if (n < N) {
        L[n] += ha * e;
        R[n] += hb * e;
      }
    }
  });

  // ------------------------------------------------------------------ bass (saw + sub, plucky filter)
  for (const nt of score.bass) {
    const n0 = at(nt.beat), vel = nt.vel ?? 1;
    const hold = nt.dur * beatSec, len = Math.floor((hold + 0.06) * sr);
    const f = mtof(nt.midi), dt = f / sr;
    let ph = 0, sub = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const fc = 260 + 1300 * Math.exp(-t / 0.11);
      const a = lp(fc);
      const x = saw(ph, dt) * 0.55;
      y1 += a * (x - y1);
      y2 += a * (y1 - y2);
      const env = Math.min(1, t / 0.004) * (t < hold ? 1 : Math.max(0, 1 - (t - hold) / 0.06)) * (0.55 + 0.45 * Math.exp(-t / 0.25));
      const v = (y2 + Math.sin(sub) * 0.5) * env * 0.62 * vel * duckGain(n0 + i, 0.3);
      put(n0 + i, v, 0);
      ph += dt;
      if (ph >= 1) ph -= 1;
      sub += (TWO_PI * f) / sr;
    }
  }

  // ------------------------------------------------------------------ funk stabs (detuned saws, short)
  for (const ch of score.stabs) {
    const n0 = at(ch.beat), vel = ch.vel ?? 1;
    const hold = ch.dur * beatSec, len = Math.floor((hold + 0.05) * sr);
    ch.notes.forEach((m, ni) => {
      const f1 = mtof(m) * 1.0035, f2 = mtof(m) / 1.0035;
      const d1 = f1 / sr, d2 = f2 / sr;
      let p1 = (ni * 0.13) % 1, p2 = (ni * 0.29) % 1, y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const a = lp(1100 + 2600 * Math.exp(-t / 0.05));
        const x = (saw(p1, d1) + saw(p2, d2)) * 0.5;
        y += a * (x - y);
        const env = Math.min(1, t / 0.002) * Math.exp(-t / 0.09) * (t < hold ? 1 : Math.max(0, 1 - (t - hold) / 0.05));
        put(n0 + i, y * env * 0.085 * vel * duckGain(n0 + i, 0.45), -0.3 + ni * 0.05);
        p1 += d1;
        if (p1 >= 1) p1 -= 1;
        p2 += d2;
        if (p2 >= 1) p2 -= 1;
      }
    });
  }

  // ------------------------------------------------------------------ pads (slow detuned saws)
  for (const ch of score.pads) {
    const n0 = at(ch.beat), vel = ch.vel ?? 1;
    const hold = ch.dur * beatSec, rel = 0.35, len = Math.floor((hold + rel) * sr);
    ch.notes.forEach((m, ni) => {
      const fs = [mtof(m), mtof(m) * 1.006, mtof(m) / 1.006];
      const ds = fs.map((f) => f / sr);
      const ps = [0.1 * ni, 0.4, 0.7];
      let y = 0;
      const a = lp(1500);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let x = 0;
        for (let k = 0; k < 3; k++) {
          x += saw(ps[k], ds[k]);
          ps[k] += ds[k];
          if (ps[k] >= 1) ps[k] -= 1;
        }
        y += a * (x / 3 - y);
        const env = Math.min(1, t / 0.25) * (t < hold ? 1 : Math.max(0, 1 - (t - hold) / rel));
        put(n0 + i, y * env * 0.075 * vel * duckGain(n0 + i, 0.5), ni % 2 ? 0.4 : -0.4);
      }
    });
  }

  // ------------------------------------------------------------------ sparkly arpeggio (plucks)
  for (const nt of score.arp) {
    const n0 = at(nt.beat), vel = nt.vel ?? 1;
    const len = Math.floor(0.22 * sr);
    const f = mtof(nt.midi), dt = f / sr;
    let ph = 0, y = 0;
    const a = lp(3200);
    const pan = ((Math.round(nt.beat * 4) % 2) ? 1 : -1) * 0.5;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      y += a * (saw(ph, dt) - y);
      put(n0 + i, y * Math.exp(-t / 0.07) * 0.1 * vel * duckGain(n0 + i, 0.3), pan);
      ph += dt;
      if (ph >= 1) ph -= 1;
    }
  }

  // ------------------------------------------------------------------ lead (plays the sung melody) + echoes
  const echoes: [number, number, number][] = [[0, 1, 0], [0.75, 0.33, 0.5], [1.5, 0.14, -0.5]];
  for (const nt of score.lead) {
    const vel = nt.vel ?? 1;
    const hold = nt.dur * beatSec;
    for (const [eb, eg, ep] of echoes) {
      const n0 = at(nt.beat + eb), len = Math.floor((hold + 0.07) * sr);
      const f = mtof(nt.midi), dt0 = f / sr;
      let ph = 0, y = 0;
      const a = lp(4200);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const vib = t > 0.12 ? Math.sin(TWO_PI * 5.6 * t) * 0.0145 * Math.min(1, (t - 0.12) / 0.2) : 0;
        const dt = dt0 * (1 + vib);
        const x = saw(ph, dt) * 0.5 + square(ph, dt) * 0.42;
        y += a * (x - y);
        const env = Math.min(1, t / 0.008) * (t < hold ? 1 : Math.max(0, 1 - (t - hold) / 0.07)) * (0.82 + 0.18 * Math.exp(-t / 0.3));
        put(n0 + i, y * env * 0.17 * vel * eg, ep);
        ph += dt;
        if (ph >= 1) ph -= 1;
      }
    }
  }

  // ------------------------------------------------------------------ risers (filtered noise sweeps)
  score.risers.forEach((rs, idx) => {
    const n0 = at(rs.beat), dur = rs.dur * beatSec, len = Math.floor(dur * sr);
    const rl = new Rng(9000 + idx * 2), rr = new Rng(9001 + idx * 2);
    let pl = 0, pr = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const k = 0.5 + 0.49 * u; // high-pass coefficient rises => brighter sweep
      const a = rl.next(), b = rr.next();
      const ha = a - pl * k, hb = b - pr * k;
      pl = a;
      pr = b;
      const env = u * u * 0.2;
      const n = n0 + i;
      if (n < N) {
        L[n] += ha * env;
        R[n] += hb * env;
      }
    }
  });

  // ------------------------------------------------------------------ master: soft clip + normalise
  const drive = 1.25;
  const norm = Math.tanh(drive);
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const l = Math.tanh(L[i] * drive) / norm, r = Math.tanh(R[i] * drive) / norm;
    L[i] = l;
    R[i] = r;
    const m = Math.max(Math.abs(l), Math.abs(r));
    if (m > peak) peak = m;
  }
  const g = peak > 0 ? 0.92 / peak : 1;
  for (let i = 0; i < N; i++) {
    L[i] *= g;
    R[i] *= g;
  }
  return { left: L, right: R, sampleRate: sr, seconds };
}

/** 16-bit PCM stereo WAV. */
export function encodeWav(r: Rendered): Uint8Array {
  const n = r.left.length;
  const bytes = new Uint8Array(44 + n * 4);
  const dv = new DataView(bytes.buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  dv.setUint32(4, 36 + n * 4, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, r.sampleRate, true);
  dv.setUint32(28, r.sampleRate * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  w(36, "data");
  dv.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    dv.setInt16(o, Math.max(-1, Math.min(1, r.left[i])) * 32767, true);
    dv.setInt16(o + 2, Math.max(-1, Math.min(1, r.right[i])) * 32767, true);
    o += 4;
  }
  return bytes;
}
