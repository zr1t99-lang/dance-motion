import { LM } from "./types.js";
import type { Look } from "./avatar3d.js";

/** One figure to draw: final joint positions (metres, y up) plus where it stands and its look. */
export interface FigureState {
  J: { x: number; y: number }[];
  ox: number;
  oy: number;
  scale: number;
  look: Required<Pick<Look, "skin" | "jacket" | "shirt" | "pants" | "shoes" | "hair" | "pony" | "baggy">> & { headband: number | null; face: HTMLCanvasElement | null; longHair?: boolean };
}

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
function shade(n: number, k: number) {
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * k)));
  return `rgb(${r},${g},${b})`;
}
const INK = "#1a0d3a";

/**
 * Cartoon "cut-out puppet" renderer: draws a figure with outlines, shading and an outfit on a 2D canvas, posed by the
 * same joints that drive the 3D avatars. Everything is vector drawing in code (no image assets).
 */
export class Cutout {
  private ctx: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  begin(): { w: number; h: number } {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.ctx.clearRect(0, 0, w, h);
    return { w, h };
  }

  /** Draw a figure. `map` converts metres (scene x,y) to canvas pixels; `ppm` = pixels per metre. */
  figure(f: FigureState, map: (x: number, y: number) => [number, number], ppm: number, reflect = true) {
    const g = this.ctx;
    const P = (i: number): [number, number] => {
      const j = f.J[i];
      return map(f.ox + f.scale * j.x, f.oy + f.scale * j.y);
    };
    const floor = map(f.ox, 0)[1];
    // ground shadow
    g.save();
    g.fillStyle = "rgba(10,0,40,0.35)";
    g.beginPath();
    g.ellipse(map(f.ox, 0)[0], floor, ppm * f.scale * 0.5, ppm * f.scale * 0.07, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    if (reflect) {
      g.save();
      g.globalAlpha = 0.16;
      g.translate(0, floor * 2);
      g.scale(1, -1);
      this.draw(f, P, ppm * f.scale);
      g.restore();
    }
    this.draw(f, P, ppm * f.scale);
  }

  private limb(a: [number, number], b: [number, number], r: number, fill: string, ink = true, r2 = r) {
    const g = this.ctx;
    g.lineCap = "round";
    g.lineJoin = "round";
    if (ink) {
      g.strokeStyle = INK;
      g.lineWidth = Math.max(r, r2) * 2 + 4;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
    if (r === r2) {
      g.strokeStyle = fill;
      g.lineWidth = r * 2;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    } else {
      // tapered: draw as a polygon with round ends
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(a[0] + nx * r, a[1] + ny * r);
      g.lineTo(b[0] + nx * r2, b[1] + ny * r2);
      g.lineTo(b[0] - nx * r2, b[1] - ny * r2);
      g.lineTo(a[0] - nx * r, a[1] - ny * r);
      g.closePath();
      g.fill();
      for (const [p, rr] of [[a, r], [b, r2]] as const) {
        g.beginPath();
        g.arc(p[0], p[1], rr, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  private shine(a: [number, number], b: [number, number], r: number) {
    const g = this.ctx;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    g.strokeStyle = "rgba(255,255,255,0.32)";
    g.lineWidth = Math.max(1.5, r * 0.4);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(a[0] + nx * r * 0.45 + dx * 0.08, a[1] + ny * r * 0.45 + dy * 0.08);
    g.lineTo(b[0] + nx * r * 0.45 - dx * 0.08, b[1] + ny * r * 0.45 - dy * 0.08);
    g.stroke();
  }

  private star(cx: number, cy: number, r: number, fill: string) {
    const g = this.ctx;
    g.fillStyle = fill;
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }

  private draw(f: FigureState, P: (i: number) => [number, number], m: number) {
    const g = this.ctx;
    const L = f.look;
    const skin = hex(L.skin), jacket = hex(L.jacket), shirt = hex(L.shirt), pants = hex(L.pants), shoes = hex(L.shoes), hair = hex(L.hair);
    const ls = P(LM.L_SHOULDER), rs = P(LM.R_SHOULDER), lh = P(LM.L_HIP), rh = P(LM.R_HIP);
    const le = P(LM.L_ELBOW), re = P(LM.R_ELBOW), lw = P(LM.L_WRIST), rw = P(LM.R_WRIST);
    const lk = P(LM.L_KNEE), rk = P(LM.R_KNEE), la = P(LM.L_ANKLE), ra = P(LM.R_ANKLE);
    const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const sh = mid(ls, rs), hip = mid(lh, rh);
    const lear = P(LM.L_EAR), rear = P(LM.R_EAR);
    const head0 = mid(lear, rear);
    const head: [number, number] = [head0[0] + 0, head0[1] - 0.03 * m];
    const tilt = Math.atan2(lear[1] - rear[1], lear[0] - rear[0]);
    const hm = m * 1.5;
    const legR = (L.baggy ? 0.105 : 0.075) * m;
    const legR2 = (L.baggy ? 0.115 : 0.062) * m;

    // ---- ponytail (behind everything)
    if (L.pony) {
      g.save();
      g.translate(head[0], head[1]);
      g.rotate(tilt + Math.PI);
      g.fillStyle = hair;
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0.05 * hm, -0.05 * hm);
      g.bezierCurveTo(0.2 * hm, -0.25 * hm, 0.34 * hm, 0.0, 0.3 * hm, 0.28 * hm);
      g.bezierCurveTo(0.24 * hm, 0.1 * hm, 0.14 * hm, 0.1 * hm, 0.04 * hm, 0.04 * hm);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }

    // ---- long wavy hair hanging behind the body
    if (L.longHair) {
      const w = 0.15 * hm, top = head[1] - 0.12 * hm, bot = head[1] + 0.62 * m;
      g.fillStyle = hair;
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(head[0] - w, head[1]);
      g.bezierCurveTo(head[0] - w * 1.5, top, head[0] + w * 1.5, top, head[0] + w, head[1]);
      g.bezierCurveTo(head[0] + w * 1.45, head[1] + 0.2 * m, head[0] + w * 1.1, bot - 0.15 * m, head[0] + w * 1.25, bot - 0.05 * m);
      g.bezierCurveTo(head[0] + w * 0.8, bot + 0.04 * m, head[0] + w * 0.5, bot - 0.06 * m, head[0] + w * 0.2, bot + 0.03 * m);
      g.bezierCurveTo(head[0] - w * 0.3, bot - 0.06 * m, head[0] - w * 0.6, bot + 0.04 * m, head[0] - w * 1.0, bot - 0.04 * m);
      g.bezierCurveTo(head[0] - w * 1.2, bot - 0.15 * m, head[0] - w * 1.5, head[1] + 0.2 * m, head[0] - w, head[1]);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.14)";
      g.lineWidth = Math.max(2, 0.012 * m);
      for (const k of [-0.6, 0, 0.6]) {
        g.beginPath();
        g.moveTo(head[0] + w * k, head[1] + 0.05 * m);
        g.bezierCurveTo(head[0] + w * (k + 0.5), head[1] + 0.22 * m, head[0] + w * (k - 0.5), head[1] + 0.4 * m, head[0] + w * k, bot - 0.08 * m);
        g.stroke();
      }
    }

    // ---- legs: baggy pants + chunky sneakers
    const leg = (hp: [number, number], kn: [number, number], an: [number, number], toeDir: number) => {
      this.limb(hp, kn, legR, pants, true, legR * 1.02);
      this.limb(kn, an, legR2 * 1.0, pants, true, legR2 * 1.12);
      this.shine(hp, kn, legR);
      // side stripe in the jacket colour
      const dx = kn[0] - hp[0], dy = kn[1] - hp[1], Ln = Math.hypot(dx, dy) || 1;
      g.strokeStyle = jacket;
      g.globalAlpha = 0.9;
      g.lineWidth = Math.max(2, 0.018 * m);
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(hp[0] + (-dy / Ln) * legR * 0.7, hp[1] + (dx / Ln) * legR * 0.7);
      g.lineTo(an[0] + (-dy / Ln) * legR2 * 0.7, an[1] + (dx / Ln) * legR2 * 0.7);
      g.stroke();
      g.globalAlpha = 1;
      // sneaker
      g.save();
      g.translate(an[0] + toeDir * 0.06 * m, an[1] + 0.07 * m);
      g.fillStyle = shoes;
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, 0, 0.115 * m, 0.062 * m, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = jacket;
      g.beginPath();
      g.ellipse(-toeDir * 0.02 * m, 0.012 * m, 0.06 * m, 0.022 * m, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };
    leg(lh, lk, la, la[0] >= lh[0] ? 1 : -1);
    leg(rh, rk, ra, ra[0] >= rh[0] ? 1 : -1);

    // ---- torso: pants waist, crop top, belt
    const tdx = sh[0] - hip[0], tdy = sh[1] - hip[1], tl = Math.hypot(tdx, tdy) || 1;
    const ux = tdx / tl, uy = tdy / tl; // up along the spine
    const along = (t: number, side: number, w: number): [number, number] => [hip[0] + tdx * t + (-uy) * side * w, hip[1] + tdy * t + ux * side * w];
    const shW = Math.hypot(ls[0] - rs[0], ls[1] - rs[1]) / 2;
    const hpW = Math.hypot(lh[0] - rh[0], lh[1] - rh[1]) / 2;
    // pelvis / waistband
    g.fillStyle = pants;
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    for (const [t, s, w] of [[-0.05, -1, hpW * 1.55], [-0.05, 1, hpW * 1.55], [0.3, 1, hpW * 1.35], [0.3, -1, hpW * 1.35]] as [number, number, number][]) {
      const p = along(t, s, w);
      g.lineTo(p[0], p[1]);
    }
    g.closePath();
    g.fill();
    g.stroke();
    // crop top
    g.fillStyle = shirt;
    g.beginPath();
    const poly: [number, number, number][] = [[1, -1, shW * 1.0], [1, 1, shW * 1.0], [0.62, 1, hpW * 1.25], [0.34, 1, hpW * 1.2], [0.34, -1, hpW * 1.2], [0.62, -1, hpW * 1.25]];
    for (const [t, s, w] of poly) {
      const p = along(t, s, w);
      g.lineTo(p[0], p[1]);
    }
    g.closePath();
    g.fill();
    g.stroke();
    // midriff strip
    g.fillStyle = skin;
    g.beginPath();
    for (const [t, s, w] of [[0.34, -1, hpW * 1.2], [0.34, 1, hpW * 1.2], [0.3, 1, hpW * 1.35], [0.3, -1, hpW * 1.35]] as [number, number, number][]) {
      const p = along(t, s, w);
      g.lineTo(p[0], p[1]);
    }
    g.closePath();
    g.fill();
    // belt
    g.strokeStyle = "#0e0820";
    g.lineWidth = 0.028 * m;
    g.beginPath();
    const b1 = along(0.28, -1, hpW * 1.4), b2 = along(0.28, 1, hpW * 1.4);
    g.moveTo(b1[0], b1[1]);
    g.lineTo(b2[0], b2[1]);
    g.stroke();
    // emblem
    const c = along(0.75, 0, 0);
    this.star(c[0], c[1], 0.055 * m, hex(L.jacket));
    // jacket panels (open jacket over the top)
    g.fillStyle = jacket;
    g.strokeStyle = INK;
    g.lineWidth = 3;
    for (const s of [-1, 1]) {
      g.beginPath();
      const pts: [number, number, number][] = [[1.0, s, shW * 1.05], [1.0, s, shW * 0.5], [0.5, s, hpW * 1.05], [0.45, s, hpW * 1.35]];
      for (const [t, sd, w] of pts) {
        const p = along(t, sd, w);
        g.lineTo(p[0], p[1]);
      }
      g.closePath();
      g.fill();
      g.stroke();
    }

    // ---- arms: puffy jacket sleeves, skin forearm below the cuff, hands
    const arm = (s: [number, number], e: [number, number], w: [number, number]) => {
      this.limb(s, e, 0.058 * m, jacket, true, 0.066 * m);
      this.shine(s, e, 0.06 * m);
      // forearm: sleeve to cuff then bare skin
      const k = 0.62;
      const cuff: [number, number] = [e[0] + (w[0] - e[0]) * k, e[1] + (w[1] - e[1]) * k];
      this.limb(e, cuff, 0.062 * m, jacket, true, 0.054 * m);
      this.limb(cuff, w, 0.04 * m, skin, true, 0.036 * m);
      // white cuff
      g.fillStyle = "#fff";
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cuff[0], cuff[1], 0.05 * m, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      // hand
      const dx = w[0] - e[0], dy = w[1] - e[1], Ln = Math.hypot(dx, dy) || 1;
      g.fillStyle = skin;
      g.beginPath();
      g.arc(w[0] + (dx / Ln) * 0.035 * m, w[1] + (dy / Ln) * 0.035 * m, 0.048 * m, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = jacket;
      g.beginPath();
      g.arc(s[0], s[1], 0.075 * m, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    };
    arm(ls, le, lw);
    arm(rs, re, rw);

    if (L.longHair) {
      g.fillStyle = hair;
      g.strokeStyle = INK;
      g.lineWidth = 3;
      for (const sd of [-1, 1]) {
        const x0 = head[0] + sd * 0.12 * hm, y0 = head[1] - 0.02 * hm;
        g.beginPath();
        g.moveTo(x0, y0);
        g.bezierCurveTo(x0 + sd * 0.06 * hm, y0 + 0.2 * m, x0 + sd * 0.1 * hm, y0 + 0.4 * m, x0 + sd * 0.02 * hm, y0 + 0.5 * m);
        g.bezierCurveTo(x0 - sd * 0.07 * hm, y0 + 0.42 * m, x0 - sd * 0.1 * hm, y0 + 0.2 * m, x0 - sd * 0.06 * hm, y0 + 0.05 * m);
        g.closePath();
        g.fill();
        g.stroke();
      }
    }
    // ---- neck + head
    const nk = [sh[0] + ux * 0.04 * hm, sh[1] + uy * 0.04 * hm] as [number, number];
    this.limb(nk, head, 0.04 * m, skin, true);
    g.save();
    g.translate(head[0], head[1]);
    g.rotate(tilt + Math.PI); // ears line -> level
    // back hair
    g.fillStyle = hair;
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(0, -0.012 * hm, 0.125 * hm, 0.14 * hm, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // face
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(0, 0.012 * hm, 0.105 * hm, 0.118 * hm, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (L.face) {
      const s2 = 0.205 * hm;
      g.save();
      g.beginPath();
      g.ellipse(0, 0.012 * hm, 0.102 * hm, 0.115 * hm, 0, 0, Math.PI * 2);
      g.clip();
      g.drawImage(L.face, -s2 / 2, 0.012 * hm - s2 / 2, s2, s2);
      g.restore();
    }
    // fringe + headband
    g.fillStyle = hair;
    g.beginPath();
    g.moveTo(-0.112 * hm, -0.01 * hm);
    g.bezierCurveTo(-0.11 * hm, -0.15 * hm, 0.11 * hm, -0.15 * hm, 0.112 * hm, -0.01 * hm);
    g.bezierCurveTo(0.08 * hm, -0.07 * hm, 0.02 * hm, -0.045 * hm, -0.015 * hm, -0.075 * hm);
    g.bezierCurveTo(-0.045 * hm, -0.04 * hm, -0.09 * hm, -0.05 * hm, -0.112 * hm, -0.01 * hm);
    g.closePath();
    g.fill();
    g.stroke();
    if (L.longHair) this.star(0.085 * hm, -0.07 * hm, 0.032 * hm, hex(L.jacket));
    if (L.headband !== null) {
      g.strokeStyle = INK;
      g.lineWidth = 0.05 * hm + 3;
      g.lineCap = "butt";
      g.beginPath();
      g.arc(0, 0.01 * hm, 0.108 * hm, Math.PI * 1.12, Math.PI * 1.88);
      g.stroke();
      g.strokeStyle = hex(L.headband);
      g.lineWidth = 0.05 * hm;
      g.stroke();
    }
    g.restore();
  }
}
