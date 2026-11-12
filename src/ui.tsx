import { useEffect, useRef, useState } from "react";
import type { Engine } from "./engine.js";
import { MAIN_POINTS, POSE_CONNECTIONS, type Facing, type Pose } from "./types.js";
import type { Settings } from "./settings.js";

/* ---------- stage sizing (16:9 letterbox, --u = 1% of stage width) ---------- */

export function useStageBox() {
  const [box, setBox] = useState({ w: 0, h: 0, portrait: false });
  useEffect(() => {
    const f = () => {
      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;
      const w = Math.min(vw, (vh * 16) / 9);
      setBox({ w: Math.floor(w), h: Math.floor((w * 9) / 16), portrait: vh > vw });
    };
    f();
    window.addEventListener("resize", f);
    window.addEventListener("orientationchange", f);
    window.visualViewport?.addEventListener("resize", f);
    return () => {
      window.removeEventListener("resize", f);
      window.removeEventListener("orientationchange", f);
      window.visualViewport?.removeEventListener("resize", f);
    };
  }, []);
  return box;
}

/* ---------- camera preview + skeleton overlay ---------- */

export function PreviewBox(props: {
  engine: Engine;
  mirror: boolean;
  overlay: boolean;
  lost: boolean;
  label?: string;
  lostText?: string;
  className?: string;
}) {
  const host = useRef(null as HTMLDivElement | null);
  const cv = useRef(null as HTMLCanvasElement | null);
  const overlayRef = useRef(props.overlay);
  overlayRef.current = props.overlay;

  useEffect(() => {
    const h = host.current!;
    const v = props.engine.video;
    v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
    h.insertBefore(v, h.firstChild);
    v.play().catch(() => {});
    return () => {
      if (v.parentNode === h) h.removeChild(v);
    };
  }, [props.engine]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = cv.current;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, w, h);
      const f = props.engine.latest;
      const v = props.engine.video;
      if (!overlayRef.current || !f || !f.pose || props.engine.trackingLost() || !v.videoWidth) return;
      // object-fit: cover mapping
      const s = Math.max(w / v.videoWidth, h / v.videoHeight);
      const ox = (w - v.videoWidth * s) / 2;
      const oy = (h - v.videoHeight * s) / 2;
      const P = (i: number) => ({ x: f.pose![i].x * v.videoWidth * s + ox, y: f.pose![i].y * v.videoHeight * s + oy, v: f.pose![i].visibility });
      ctx.lineWidth = Math.max(2, w * 0.012);
      ctx.lineCap = "round";
      ctx.strokeStyle = "#39ff88";
      ctx.shadowColor = "#39ff88";
      ctx.shadowBlur = w * 0.03;
      for (const [a, b] of POSE_CONNECTIONS) {
        const A = P(a);
        const B = P(b);
        if (A.v < 0.5 || B.v < 0.5) continue;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
      }
      ctx.fillStyle = "#b6ffd0";
      for (const i of MAIN_POINTS) {
        const A = P(i);
        if (A.v < 0.5) continue;
        ctx.beginPath();
        ctx.arc(A.x, A.y, Math.max(2.5, w * 0.014), 0, 6.283);
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [props.engine]);

  return (
    <div className={"preview " + (props.className ?? "") + (props.lost ? " lost" : "")}>
      <div className="preview-inner" ref={host} style={{ transform: props.mirror ? "scaleX(-1)" : "none" }}>
        <canvas ref={cv} className="preview-overlay" />
      </div>
      <div className="preview-label">
        <span className={"dot " + (props.lost ? "red" : "green")} /> {props.label ?? "You"}
      </div>
      {props.lost && <div className="preview-lost">{props.lostText ?? "TRACKING LOST"}</div>}
    </div>
  );
}

/* ---------- small things ---------- */

export function Stars({ n }: { n: number }) {
  return (
    <div className="stars">
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={i < n ? "on" : ""}>
          <path d="M12 2.2l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17l-6 3.3 1.3-6.6L2.4 9.1l6.7-.8z" />
        </svg>
      ))}
    </div>
  );
}

/** Mini skeleton icon of a reference pose (drawn from the same skeleton the scorer uses). */
export function StickFigure({ pose, active }: { pose: Pose; active?: boolean }) {
  const col = active ? "#39ff88" : "#b69cff";
  const X = (i: number) => -pose[i].x; // mirrored, like the instructor on screen
  const Y = (i: number) => pose[i].y;
  return (
    <svg viewBox="-1.5 -1.8 3 3.9" className={"stick " + (active ? "active" : "")}>
      <g stroke={col} strokeWidth={0.13} strokeLinecap="round" fill="none">
        {POSE_CONNECTIONS.map(([a, b]) => (
          <line key={a + "-" + b} x1={X(a)} y1={Y(a)} x2={X(b)} y2={Y(b)} />
        ))}
      </g>
      <circle cx={X(0)} cy={Y(0) - 0.02} r={0.22} fill={col} />
    </svg>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

/* ---------- debug panel ---------- */

const MAIN_NAMES = ["L shoulder", "R shoulder", "L elbow", "R elbow", "L wrist", "R wrist", "L hip", "R hip", "L knee", "R knee", "L ankle", "R ankle"];

export interface DebugExtra {
  refName?: string;
  liveAccuracy?: number | null;
  baselineOk?: boolean;
}

export function DebugPanel(props: {
  engine: Engine;
  getExtra?: () => DebugExtra;
  facing: Facing;
  onSwitch: (f: Facing) => void;
  onClose: () => void;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  const s = props.engine.getStats();
  const f = props.engine.latest;
  const ex = props.getExtra?.() ?? {};
  const lost = props.engine.trackingLost();
  const n = (v: number | null | undefined, d = 1, unit = "") => (v === null || v === undefined || Number.isNaN(v) ? "n/a" : v.toFixed(d) + unit);
  return (
    <div className="debug">
      <div className="debug-head">
        <b>TRACKING DEBUG</b>
        <button onClick={props.onClose}>✕</button>
      </div>
      <table>
        <tbody>
          <tr><td>Camera FPS</td><td>{n(s.cameraFps, 1)}</td></tr>
          <tr><td>Pose FPS</td><td>{n(s.poseFps, 1)}</td></tr>
          <tr><td>Inference time</td><td>{n(s.inferMs, 1, " ms")}</td></tr>
          <tr><td>Capture→result</td><td>{s.latencyMs === null ? "not exposed by browser" : n(s.latencyMs, 0, " ms")}</td></tr>
          <tr><td>Confidence</td><td>{f && !lost ? Math.round(f.confidence * 100) + "%" : "—"}</td></tr>
          <tr><td>Landmarks</td><td>{f && !lost ? f.visibleCount + " / 12" : "0 / 12"}</td></tr>
          <tr><td>Status</td><td className={lost ? "bad" : "good"}>{lost ? "TRACKING LOST" : "tracking"}</td></tr>
          {ex.refName !== undefined && <tr><td>Reference pose</td><td>{ex.refName}</td></tr>}
          {ex.refName !== undefined && (
            <tr><td>Pose accuracy</td><td>{ex.liveAccuracy === null || ex.liveAccuracy === undefined ? (ex.baselineOk === false ? "no baseline" : "—") : Math.round(ex.liveAccuracy * 100) + "%"}</td></tr>
          )}
          <tr><td>Camera</td><td>{s.facingRequested === "user" ? "front" : "back"} ({s.facingActual ?? "unreported"})</td></tr>
          <tr><td>Resolution</td><td>{s.videoW ? `${s.videoW}×${s.videoH}` : "—"}</td></tr>
          <tr><td>Model</td><td>{s.model ?? "—"} / {s.delegate ?? "—"}</td></tr>
        </tbody>
      </table>
      <div className="chips">
        {MAIN_NAMES.map((name, i) => {
          const ok = !lost && !!f?.pose && f.pose[MAIN_POINTS[i]].visibility >= 0.5;
          return <span key={name} className={"chip " + (ok ? "ok" : "no")}>{name}</span>;
        })}
      </div>
      {s.cameraNote && <div className="note">{s.cameraNote}</div>}
      <div className="debug-btns">
        <button className={props.facing === "user" ? "sel" : ""} onClick={() => props.onSwitch("user")}>Front</button>
        <button className={props.facing === "environment" ? "sel" : ""} onClick={() => props.onSwitch("environment")}>Back</button>
        <button onClick={() => props.onSwitch(props.facing === "user" ? "environment" : "user")}>Switch</button>
      </div>
    </div>
  );
}

/* ---------- settings ---------- */

function Seg<T extends string | number | boolean>(props: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {props.options.map((o) => (
        <button key={String(o.v)} className={o.v === props.value ? "sel" : ""} onClick={() => props.onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel(props: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onSwitchCamera: (f: Facing) => void;
  cameraActive: boolean;
  onClose: () => void;
}) {
  const s = props.settings;
  const set = (p: Partial<Settings>) => props.onChange({ ...s, ...p });
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="panel settings" onClick={(e: any) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Settings</h2>
          <button className="x" onClick={props.onClose}>✕</button>
        </div>
        <div className="rows">
          <div className="row">
            <label>Camera</label>
            <Seg
              value={s.facing}
              options={[{ v: "user" as Facing, label: "Front" }, { v: "environment" as Facing, label: "Back" }]}
              onChange={(f) => (props.cameraActive ? props.onSwitchCamera(f) : set({ facing: f, mirror: f === "user" }))}
            />
          </div>
          <div className="row">
            <label>Mirror view</label>
            <Seg value={s.mirror} options={[{ v: true, label: "On" }, { v: false, label: "Off" }]} onChange={(v) => set({ mirror: v })} />
          </div>
          <div className="row">
            <label>Skeleton overlay</label>
            <Seg value={s.overlay} options={[{ v: true, label: "On" }, { v: false, label: "Off" }]} onChange={(v) => set({ overlay: v })} />
          </div>
          <div className="row">
            <label>Timing tolerance</label>
            <div className="stepper">
              <button onClick={() => set({ tolerance: Math.max(0.3, Math.round((s.tolerance - 0.1) * 10) / 10) })}>−</button>
              <span>±{s.tolerance.toFixed(1)} s</span>
              <button onClick={() => set({ tolerance: Math.min(1.2, Math.round((s.tolerance + 0.1) * 10) / 10) })}>+</button>
            </div>
          </div>
          <div className="row">
            <label>Backing beat</label>
            <Seg value={s.music} options={[{ v: true, label: "On" }, { v: false, label: "Off" }]} onChange={(v) => set({ music: v })} />
          </div>
          <div className="row">
            <label>Pose inference cap</label>
            <Seg
              value={s.maxFps}
              options={[{ v: 15, label: "15" }, { v: 24, label: "24" }, { v: 30, label: "30" }, { v: 60, label: "Max" }]}
              onChange={(v) => set({ maxFps: v })}
            />
          </div>
          <div className="row">
            <label>Pose model</label>
            <Seg
              value={s.model}
              options={[{ v: "lite" as const, label: "Lite" }, { v: "full" as const, label: "Full" }, { v: "heavy" as const, label: "Heavy (best)" }]}
              onChange={(v) => set({ model: v })}
            />
          </div>
          <div className="row">
            <label>Movement response</label>
            <Seg
              value={s.responsiveness}
              options={[{ v: "smooth" as const, label: "Smooth" }, { v: "balanced" as const, label: "Balanced" }, { v: "fast" as const, label: "Fast" }]}
              onChange={(v) => set({ responsiveness: v })}
            />
          </div>
          <div className="row">
            <label>Floor reflections</label>
            <Seg value={s.reflections} options={[{ v: true, label: "On" }, { v: false, label: "Off" }]} onChange={(v) => set({ reflections: v })} />
          </div>
        </div>
        <p className="hint">Model changes apply the next time you start a mode (Heavy = most accurate, needs a fast phone; if it lags, use Full or Lite). Lowering the inference cap or turning reflections off helps older phones.</p>
      </div>
    </div>
  );
}

/* ---------- TV mode ---------- */

export function TVPanel(props: { settings: Settings; onChange: (s: Settings) => void; onFullscreen: () => void; onClose: () => void }) {
  const hasPresentation = typeof (window as any).PresentationRequest !== "undefined";
  const hasWake = "wakeLock" in navigator;
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="panel tv" onClick={(e: any) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>TV Mode</h2>
          <button className="x" onClick={props.onClose}>✕</button>
        </div>
        <p>
          Your <b>phone stays the camera and motion tracker</b>. To play on a big screen, mirror the phone's screen to the TV with a method your phone supports.
          This game cannot connect to a TV by itself.
        </p>
        <div className="cols">
          <div>
            <h3>Mirror the screen</h3>
            <ul>
              <li><b>iPhone / iPad:</b> Control Center → Screen Mirroring → pick an Apple TV / AirPlay-capable TV.</li>
              <li><b>Android:</b> Quick Settings → Cast / Smart View / Screen cast → pick a Chromecast, Google TV or Miracast TV.</li>
              <li><b>Cable:</b> USB-C to HDMI adapter (DisplayPort-capable phones) or Lightning/USB-C to HDMI.</li>
            </ul>
            <h3>Phone placement</h3>
            <ul>
              <li>Prop the phone in <b>landscape</b> below the TV, camera facing you, at about 2–3 m.</li>
              <li>The whole body, feet included, must be in view (use Calibration).</li>
              <li>Keep the screen awake: this game requests a screen wake-lock {hasWake ? "(supported here)" : "(not supported by this browser — disable auto-lock in system settings)"}.</li>
            </ul>
          </div>
          <div>
            <h3>TV layout</h3>
            <p className="hint">Shrinks the camera preview, hides debug text and keeps the 16:9 layout.</p>
            <Seg value={props.settings.tvMode} options={[{ v: false, label: "Off" }, { v: true, label: "On" }]} onChange={(v) => props.onChange({ ...props.settings, tvMode: v })} />
            <button className="btn small" onClick={props.onFullscreen}>Go fullscreen</button>
            <h3>Status</h3>
            <ul className="status">
              <li>Browser Presentation API: <b>{hasPresentation ? "present (not used by this prototype)" : "not available"}</b></li>
              <li>Automatic TV connection: <b>not supported</b> — use the mirroring steps on the left.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
