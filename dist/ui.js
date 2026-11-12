import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { MAIN_POINTS, POSE_CONNECTIONS } from "./types.js";
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
export function PreviewBox(props) {
    const host = useRef(null);
    const cv = useRef(null);
    const overlayRef = useRef(props.overlay);
    overlayRef.current = props.overlay;
    useEffect(() => {
        const h = host.current;
        const v = props.engine.video;
        v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
        h.insertBefore(v, h.firstChild);
        v.play().catch(() => { });
        return () => {
            if (v.parentNode === h)
                h.removeChild(v);
        };
    }, [props.engine]);
    useEffect(() => {
        let raf = 0;
        const draw = () => {
            raf = requestAnimationFrame(draw);
            const c = cv.current;
            if (!c)
                return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.round(c.clientWidth * dpr);
            const h = Math.round(c.clientHeight * dpr);
            if (c.width !== w || c.height !== h) {
                c.width = w;
                c.height = h;
            }
            const ctx = c.getContext("2d");
            ctx.clearRect(0, 0, w, h);
            const f = props.engine.latest;
            const v = props.engine.video;
            if (!overlayRef.current || !f || !f.pose || props.engine.trackingLost() || !v.videoWidth)
                return;
            // object-fit: cover mapping
            const s = Math.max(w / v.videoWidth, h / v.videoHeight);
            const ox = (w - v.videoWidth * s) / 2;
            const oy = (h - v.videoHeight * s) / 2;
            const P = (i) => ({ x: f.pose[i].x * v.videoWidth * s + ox, y: f.pose[i].y * v.videoHeight * s + oy, v: f.pose[i].visibility });
            ctx.lineWidth = Math.max(2, w * 0.012);
            ctx.lineCap = "round";
            ctx.strokeStyle = "#39ff88";
            ctx.shadowColor = "#39ff88";
            ctx.shadowBlur = w * 0.03;
            for (const [a, b] of POSE_CONNECTIONS) {
                const A = P(a);
                const B = P(b);
                if (A.v < 0.5 || B.v < 0.5)
                    continue;
                ctx.beginPath();
                ctx.moveTo(A.x, A.y);
                ctx.lineTo(B.x, B.y);
                ctx.stroke();
            }
            ctx.fillStyle = "#b6ffd0";
            for (const i of MAIN_POINTS) {
                const A = P(i);
                if (A.v < 0.5)
                    continue;
                ctx.beginPath();
                ctx.arc(A.x, A.y, Math.max(2.5, w * 0.014), 0, 6.283);
                ctx.fill();
            }
        };
        draw();
        return () => cancelAnimationFrame(raf);
    }, [props.engine]);
    return (_jsxs("div", { className: "preview " + (props.className ?? "") + (props.lost ? " lost" : ""), children: [_jsx("div", { className: "preview-inner", ref: host, style: { transform: props.mirror ? "scaleX(-1)" : "none" }, children: _jsx("canvas", { ref: cv, className: "preview-overlay" }) }), _jsxs("div", { className: "preview-label", children: [_jsx("span", { className: "dot " + (props.lost ? "red" : "green") }), " ", props.label ?? "You"] }), props.lost && _jsx("div", { className: "preview-lost", children: props.lostText ?? "TRACKING LOST" })] }));
}
/* ---------- small things ---------- */
export function Stars({ n }) {
    return (_jsx("div", { className: "stars", children: [0, 1, 2].map((i) => (_jsx("svg", { viewBox: "0 0 24 24", className: i < n ? "on" : "", children: _jsx("path", { d: "M12 2.2l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17l-6 3.3 1.3-6.6L2.4 9.1l6.7-.8z" }) }, i))) }));
}
/** Mini skeleton icon of a reference pose (drawn from the same skeleton the scorer uses). */
export function StickFigure({ pose, active }) {
    const col = active ? "#39ff88" : "#b69cff";
    const X = (i) => -pose[i].x; // mirrored, like the instructor on screen
    const Y = (i) => pose[i].y;
    return (_jsxs("svg", { viewBox: "-1.5 -1.8 3 3.9", className: "stick " + (active ? "active" : ""), children: [_jsx("g", { stroke: col, strokeWidth: 0.13, strokeLinecap: "round", fill: "none", children: POSE_CONNECTIONS.map(([a, b]) => (_jsx("line", { x1: X(a), y1: Y(a), x2: X(b), y2: Y(b) }, a + "-" + b))) }), _jsx("circle", { cx: X(0), cy: Y(0) - 0.02, r: 0.22, fill: col })] }));
}
export function Toast({ msg }) {
    if (!msg)
        return null;
    return _jsx("div", { className: "toast", children: msg });
}
/* ---------- debug panel ---------- */
const MAIN_NAMES = ["L shoulder", "R shoulder", "L elbow", "R elbow", "L wrist", "R wrist", "L hip", "R hip", "L knee", "R knee", "L ankle", "R ankle"];
export function DebugPanel(props) {
    const [, force] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => force((n) => n + 1), 250);
        return () => clearInterval(id);
    }, []);
    const s = props.engine.getStats();
    const f = props.engine.latest;
    const ex = props.getExtra?.() ?? {};
    const lost = props.engine.trackingLost();
    const n = (v, d = 1, unit = "") => (v === null || v === undefined || Number.isNaN(v) ? "n/a" : v.toFixed(d) + unit);
    return (_jsxs("div", { className: "debug", children: [_jsxs("div", { className: "debug-head", children: [_jsx("b", { children: "TRACKING DEBUG" }), _jsx("button", { onClick: props.onClose, children: "\u2715" })] }), _jsx("table", { children: _jsxs("tbody", { children: [_jsxs("tr", { children: [_jsx("td", { children: "Camera FPS" }), _jsx("td", { children: n(s.cameraFps, 1) })] }), _jsxs("tr", { children: [_jsx("td", { children: "Pose FPS" }), _jsx("td", { children: n(s.poseFps, 1) })] }), _jsxs("tr", { children: [_jsx("td", { children: "Inference time" }), _jsx("td", { children: n(s.inferMs, 1, " ms") })] }), _jsxs("tr", { children: [_jsx("td", { children: "Capture\u2192result" }), _jsx("td", { children: s.latencyMs === null ? "not exposed by browser" : n(s.latencyMs, 0, " ms") })] }), _jsxs("tr", { children: [_jsx("td", { children: "Confidence" }), _jsx("td", { children: f && !lost ? Math.round(f.confidence * 100) + "%" : "—" })] }), _jsxs("tr", { children: [_jsx("td", { children: "Landmarks" }), _jsx("td", { children: f && !lost ? f.visibleCount + " / 12" : "0 / 12" })] }), _jsxs("tr", { children: [_jsx("td", { children: "Status" }), _jsx("td", { className: lost ? "bad" : "good", children: lost ? "TRACKING LOST" : "tracking" })] }), ex.refName !== undefined && _jsxs("tr", { children: [_jsx("td", { children: "Reference pose" }), _jsx("td", { children: ex.refName })] }), ex.refName !== undefined && (_jsxs("tr", { children: [_jsx("td", { children: "Pose accuracy" }), _jsx("td", { children: ex.liveAccuracy === null || ex.liveAccuracy === undefined ? (ex.baselineOk === false ? "no baseline" : "—") : Math.round(ex.liveAccuracy * 100) + "%" })] })), _jsxs("tr", { children: [_jsx("td", { children: "Camera" }), _jsxs("td", { children: [s.facingRequested === "user" ? "front" : "back", " (", s.facingActual ?? "unreported", ")"] })] }), _jsxs("tr", { children: [_jsx("td", { children: "Resolution" }), _jsx("td", { children: s.videoW ? `${s.videoW}×${s.videoH}` : "—" })] }), _jsxs("tr", { children: [_jsx("td", { children: "Model" }), _jsxs("td", { children: [s.model ?? "—", " / ", s.delegate ?? "—"] })] })] }) }), _jsx("div", { className: "chips", children: MAIN_NAMES.map((name, i) => {
                    const ok = !lost && !!f?.pose && f.pose[MAIN_POINTS[i]].visibility >= 0.5;
                    return _jsx("span", { className: "chip " + (ok ? "ok" : "no"), children: name }, name);
                }) }), s.cameraNote && _jsx("div", { className: "note", children: s.cameraNote }), _jsxs("div", { className: "debug-btns", children: [_jsx("button", { className: props.facing === "user" ? "sel" : "", onClick: () => props.onSwitch("user"), children: "Front" }), _jsx("button", { className: props.facing === "environment" ? "sel" : "", onClick: () => props.onSwitch("environment"), children: "Back" }), _jsx("button", { onClick: () => props.onSwitch(props.facing === "user" ? "environment" : "user"), children: "Switch" })] })] }));
}
/* ---------- settings ---------- */
function Seg(props) {
    return (_jsx("div", { className: "seg", children: props.options.map((o) => (_jsx("button", { className: o.v === props.value ? "sel" : "", onClick: () => props.onChange(o.v), children: o.label }, String(o.v)))) }));
}
export function SettingsPanel(props) {
    const s = props.settings;
    const set = (p) => props.onChange({ ...s, ...p });
    return (_jsx("div", { className: "overlay", onClick: props.onClose, children: _jsxs("div", { className: "panel settings", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "panel-head", children: [_jsx("h2", { children: "Settings" }), _jsx("button", { className: "x", onClick: props.onClose, children: "\u2715" })] }), _jsxs("div", { className: "rows", children: [_jsxs("div", { className: "row", children: [_jsx("label", { children: "Camera" }), _jsx(Seg, { value: s.facing, options: [{ v: "user", label: "Front" }, { v: "environment", label: "Back" }], onChange: (f) => (props.cameraActive ? props.onSwitchCamera(f) : set({ facing: f, mirror: f === "user" })) })] }), _jsxs("div", { className: "row", children: [_jsx("label", { children: "Mirror view" }), _jsx(Seg, { value: s.mirror, options: [{ v: true, label: "On" }, { v: false, label: "Off" }], onChange: (v) => set({ mirror: v }) })] }), _jsxs("div", { className: "row", children: [_jsx("label", { children: "Skeleton overlay" }), _jsx(Seg, { value: s.overlay, options: [{ v: true, label: "On" }, { v: false, label: "Off" }], onChange: (v) => set({ overlay: v }) })] }), _jsxs("div", { className: "row", children: [_jsx("label", { children: "Timing tolerance" }), _jsxs("div", { className: "stepper", children: [_jsx("button", { onClick: () => set({ tolerance: Math.max(0.3, Math.round((s.tolerance - 0.1) * 10) / 10) }), children: "\u2212" }), _jsxs("span", { children: ["\u00B1", s.tolerance.toFixed(1), " s"] }), _jsx("button", { onClick: () => set({ tolerance: Math.min(1.2, Math.round((s.tolerance + 0.1) * 10) / 10) }), children: "+" })] })] }), _jsxs("div", { className: "row", children: [_jsx("label", { children: "Backing beat" }), _jsx(Seg, { value: s.music, options: [{ v: true, label: "On" }, { v: false, label: "Off" }], onChange: (v) => set({ music: v }) })] }), _jsxs("div", { className: "row", children: [_jsx("label", { children: "Pose inference cap" }), _jsx(Seg, { value: s.maxFps, options: [{ v: 15, label: "15" }, { v: 24, label: "24" }, { v: 30, label: "30" }, { v: 60, label: "Max" }], onChange: (v) => set({ maxFps: v }) })] }), _jsxs("div", { className: "row", children: [_jsx("label", { children: "Pose model" }), _jsx(Seg, { value: s.model, options: [{ v: "lite", label: "Lite (fast)" }, { v: "full", label: "Full (accurate)" }], onChange: (v) => set({ model: v }) })] }), _jsxs("div", { className: "row", children: [_jsx("label", { children: "Floor reflections" }), _jsx(Seg, { value: s.reflections, options: [{ v: true, label: "On" }, { v: false, label: "Off" }], onChange: (v) => set({ reflections: v }) })] })] }), _jsx("p", { className: "hint", children: "Model and reflection changes apply the next time you start a mode. Lowering the inference cap or turning reflections off helps older phones." })] }) }));
}
/* ---------- TV mode ---------- */
export function TVPanel(props) {
    const hasPresentation = typeof window.PresentationRequest !== "undefined";
    const hasWake = "wakeLock" in navigator;
    return (_jsx("div", { className: "overlay", onClick: props.onClose, children: _jsxs("div", { className: "panel tv", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "panel-head", children: [_jsx("h2", { children: "TV Mode" }), _jsx("button", { className: "x", onClick: props.onClose, children: "\u2715" })] }), _jsxs("p", { children: ["Your ", _jsx("b", { children: "phone stays the camera and motion tracker" }), ". To play on a big screen, mirror the phone's screen to the TV with a method your phone supports. This game cannot connect to a TV by itself."] }), _jsxs("div", { className: "cols", children: [_jsxs("div", { children: [_jsx("h3", { children: "Mirror the screen" }), _jsxs("ul", { children: [_jsxs("li", { children: [_jsx("b", { children: "iPhone / iPad:" }), " Control Center \u2192 Screen Mirroring \u2192 pick an Apple TV / AirPlay-capable TV."] }), _jsxs("li", { children: [_jsx("b", { children: "Android:" }), " Quick Settings \u2192 Cast / Smart View / Screen cast \u2192 pick a Chromecast, Google TV or Miracast TV."] }), _jsxs("li", { children: [_jsx("b", { children: "Cable:" }), " USB-C to HDMI adapter (DisplayPort-capable phones) or Lightning/USB-C to HDMI."] })] }), _jsx("h3", { children: "Phone placement" }), _jsxs("ul", { children: [_jsxs("li", { children: ["Prop the phone in ", _jsx("b", { children: "landscape" }), " below the TV, camera facing you, at about 2\u20133 m."] }), _jsx("li", { children: "The whole body, feet included, must be in view (use Calibration)." }), _jsxs("li", { children: ["Keep the screen awake: this game requests a screen wake-lock ", hasWake ? "(supported here)" : "(not supported by this browser — disable auto-lock in system settings)", "."] })] })] }), _jsxs("div", { children: [_jsx("h3", { children: "TV layout" }), _jsx("p", { className: "hint", children: "Shrinks the camera preview, hides debug text and keeps the 16:9 layout." }), _jsx(Seg, { value: props.settings.tvMode, options: [{ v: false, label: "Off" }, { v: true, label: "On" }], onChange: (v) => props.onChange({ ...props.settings, tvMode: v }) }), _jsx("button", { className: "btn small", onClick: props.onFullscreen, children: "Go fullscreen" }), _jsx("h3", { children: "Status" }), _jsxs("ul", { className: "status", children: [_jsxs("li", { children: ["Browser Presentation API: ", _jsx("b", { children: hasPresentation ? "present (not used by this prototype)" : "not available" })] }), _jsxs("li", { children: ["Automatic TV connection: ", _jsx("b", { children: "not supported" }), " \u2014 use the mirroring steps on the left."] })] })] })] })] }) }));
}
