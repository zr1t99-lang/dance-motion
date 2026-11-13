import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Engine } from "./engine.js";
import { CameraError } from "./camera.js";
import { TrackerError } from "./tracker.js";
import { Stage3D, StageError } from "./stage3d.js";
import { INSTRUCTOR_STYLE, INSTRUCTOR2_STYLE, PLAYER_STYLE } from "./avatar3d.js";
import { HAIR_COLORS, captureCharacter, faceCanvas, loadCharacter, saveCharacter } from "./character.js";
import { MusicPlayer } from "./songPlayer.js";
import { buildSunshineShake } from "./songs/sunshineShake.js";
import { buildTestRoutine } from "./songs/testRoutine.js";
import { Choreography, buildRefPose, refComparable } from "./choreography.js";
import { BODY_GROUPS, computeFeatures, groupInFrame } from "./poseMath.js";
import { ChallengeScorer } from "./scoring.js";
import { loadSettings, saveSettings } from "./settings.js";
import { DebugPanel, PreviewBox, SettingsPanel, Stars, StickFigure, Toast, TVPanel, useStageBox } from "./ui.js";
function toAppError(e) {
    if (e instanceof CameraError) {
        const titles = {
            denied: "Camera permission denied",
            notfound: "No camera found",
            insecure: "HTTPS required",
            busy: "Camera unavailable",
            unsupported: "Camera not supported",
        };
        return { title: titles[e.code] ?? "Camera problem", message: e.message, detail: e.detail, kind: e.code };
    }
    if (e instanceof TrackerError)
        return { title: "Pose model failed to load", message: e.message, detail: e.detail, kind: "model" };
    if (e instanceof StageError)
        return { title: "3D graphics unavailable", message: e.message, kind: "webgl" };
    return { title: "Something went wrong", message: String(e?.message ?? e), kind: "unknown" };
}
/* ------------------------------------------------------------ 3D canvas */
function StageCanvas(props) {
    const ref = useRef(null);
    useEffect(() => {
        let stage;
        try {
            stage = new Stage3D(ref.current, { style: props.style, reflection: props.reflections, antialias: true, maxPixelRatio: 1.5, dancers: props.dancers });
        }
        catch (e) {
            props.onError(e);
            return;
        }
        props.onStage(stage);
        stage.start();
        return () => {
            props.onStage(null);
            stage.dispose();
        };
    }, []);
    return _jsx("canvas", { ref: ref, className: "stage3d" });
}
/* -------------------------------------------------------------- screens */
function Menu(props) {
    const insecure = !window.isSecureContext;
    return (_jsxs("div", { className: "screen menu", children: [_jsxs("div", { className: "menu-title", children: [_jsx("span", { children: "DANCE" }), _jsx("span", { className: "alt", children: "MOTION" })] }), _jsx("div", { className: "menu-sub", children: "Real camera body-tracking \u00B7 prototype" }), insecure && (_jsx("div", { className: "warn", children: "This page is not served over HTTPS, so the browser will block the camera. Open it via HTTPS or http://localhost (see README)." })), _jsxs("div", { className: "menu-cards", children: [_jsxs("button", { className: "card pink", onClick: () => props.onStart("challenge"), children: [_jsx("div", { className: "card-t", children: "DANCE COPY" }), _jsx("div", { className: "card-d", children: "Copy the dancer to an original song. Scored on joint angles, position and timing." })] }), _jsxs("button", { className: "card blue", onClick: () => props.onStart("mirror"), children: [_jsx("div", { className: "card-t", children: "MOTION MIRROR" }), _jsx("div", { className: "card-d", children: "A 3D avatar that mirrors your body live from the camera. No pre-made animation." })] })] }), _jsxs("div", { className: "menu-row", children: [_jsx("button", { className: "pill", onClick: props.onSettings, children: "\u2699 Settings" }), _jsx("button", { className: "pill", onClick: props.onTV, children: "\uD83D\uDCFA TV Mode" }), _jsx("button", { className: "pill", onClick: props.onFullscreen, children: "\u26F6 Fullscreen" })] }), _jsx("div", { className: "menu-foot", children: "The camera only starts after you tap a mode. Video never leaves your device: pose detection runs locally in the browser." })] }));
}
function Loading({ msg }) {
    return (_jsxs("div", { className: "screen center", children: [_jsx("div", { className: "spinner" }), _jsx("div", { className: "big-msg", children: msg }), _jsx("div", { className: "dim", children: "First start downloads the pose model (a few MB). Needs an internet connection." })] }));
}
function ErrorScreen(props) {
    const { err } = props;
    const hints = {
        insecure: [
            "Browsers only allow camera access on HTTPS pages or on localhost.",
            "Host this folder on any HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages), or",
            "Run `node serve.mjs` on your computer and use a tunnel (e.g. `npx localtunnel --port 8080` or a Cloudflare tunnel) to get an HTTPS link, or",
            "Android + USB: Chrome → chrome://inspect → Port forwarding 8080 → open http://localhost:8080 on the phone.",
        ],
        denied: ["Tap the lock / site-settings icon in the address bar → Camera → Allow, then press Try again.", "On iOS: Settings → Safari → Camera → Ask or Allow."],
        notfound: ["Connect or enable a camera, or open the game on a phone.", "Switch to the other camera in Settings if only one is detected."],
        busy: ["Close other apps/tabs that may be using the camera (video calls, camera apps), then Try again."],
        model: ["Check your connection and try again.", "The pose runtime comes from cdn.jsdelivr.net and the model from storage.googleapis.com — make sure neither is blocked."],
        webgl: ["Try a different browser, or enable hardware acceleration."],
    };
    return (_jsxs("div", { className: "screen center", children: [_jsx("div", { className: "err-title", children: err.title }), _jsx("div", { className: "big-msg", children: err.message }), _jsx("ul", { className: "hints", children: (hints[err.kind] ?? []).map((h) => _jsx("li", { children: h }, h)) }), err.detail && _jsx("div", { className: "dim mono", children: err.detail }), _jsxs("div", { className: "btn-row", children: [_jsx("button", { className: "btn", onClick: props.onRetry, children: "Try again" }), _jsx("button", { className: "btn ghost", onClick: props.onBack, children: "Back" })] })] }));
}
function Calibration(props) {
    const { engine } = props;
    const [st, setSt] = useState({ checks: BODY_GROUPS.map(() => false), progress: 0, lost: true, hint: "" });
    useEffect(() => {
        let okSince = 0;
        let done = false;
        const id = window.setInterval(() => {
            const f = engine.latest;
            const now = performance.now();
            const lost = engine.trackingLost(now) || !f || !f.pose;
            const checks = BODY_GROUPS.map((g) => !lost && groupInFrame(f.pose, g.ids));
            const all = checks.every(Boolean);
            if (all)
                okSince = okSince || now;
            else
                okSince = 0;
            const progress = okSince ? Math.min(1, (now - okSince) / 1200) : 0;
            let hint = "Stand back until your entire body is visible.";
            if (lost)
                hint = "No body detected yet. " + hint;
            else if (!checks[5] || !checks[6])
                hint = "Step back: your knees / feet are not fully in view.";
            else if (!checks[3] || !checks[2])
                hint = "Make sure your arms are in view and not hidden.";
            else if (all)
                hint = "Hold still…";
            setSt({ checks, progress, lost, hint });
            if (progress >= 1 && !done) {
                done = true;
                props.onDone();
            }
        }, 100);
        return () => clearInterval(id);
    }, [engine]);
    return (_jsxs("div", { className: "screen calib", children: [_jsx("div", { className: "calib-cam", children: _jsx(PreviewBox, { engine: engine, mirror: props.settings.mirror, overlay: true, lost: st.lost, lostText: "NO BODY DETECTED", label: "Camera", className: "big" }) }), _jsxs("div", { className: "calib-side", children: [_jsx("div", { className: "calib-title", children: "CALIBRATION" }), _jsx("div", { className: "calib-hint", children: st.hint }), _jsx("div", { className: "checks", children: BODY_GROUPS.map((g, i) => (_jsxs("div", { className: "check " + (st.checks[i] ? "ok" : ""), children: [_jsx("span", { children: st.checks[i] ? "✓" : "○" }), " ", g.label] }, g.label))) }), _jsx("div", { className: "bar", children: _jsx("div", { style: { width: st.progress * 100 + "%" } }) }), _jsxs("div", { className: "btn-row", children: [_jsx("button", { className: "btn small ghost", onClick: () => props.onSwitch(props.facing === "user" ? "environment" : "user"), children: "\u27F2 Switch camera" }), _jsx("button", { className: "btn small ghost", onClick: props.onBack, children: "Back" })] }), _jsx("div", { className: "dim", children: "Landmarks must be detected with confidence and inside the frame. Nothing is skipped or simulated." })] })] }));
}
/* ---------------------------------------------------------- Motion Mirror */
function MirrorScreen(props) {
    const { engine, settings } = props;
    const stageRef = useRef(null);
    const lastSeq = useRef(-1);
    const hadPose = useRef(false);
    const lastInfo = useRef(0);
    const [info, setInfo] = useState({ lost: true, conf: 0, cam: null, pose: 0, had: false });
    const setRef = useRef(settings);
    setRef.current = settings;
    const frame = (dt, now) => {
        const stage = stageRef.current;
        if (!stage)
            return;
        const lost = engine.trackingLost(now);
        const f = engine.latest;
        // Only valid, current pose data drives the avatar; when tracking is lost it simply holds still.
        if (!lost && f && f.valid && f.world && f.seq !== lastSeq.current) {
            lastSeq.current = f.seq;
            hadPose.current = true;
            stage.avatar.setFromWorld(f.world, setRef.current.mirror, f.pose ? { pose: f.pose, aspect: f.aspect, t: f.t / 1000 } : null);
        }
        stage.avatar.step(dt);
        if (now - lastInfo.current > 120) {
            lastInfo.current = now;
            const s = engine.getStats();
            setInfo({ lost, conf: f && !lost ? f.confidence : 0, cam: s.cameraFps, pose: s.poseFps, had: hadPose.current });
        }
    };
    const frameRef = useRef(frame);
    frameRef.current = frame;
    return (_jsxs(_Fragment, { children: [_jsx(StageCanvas, { style: PLAYER_STYLE, reflections: settings.reflections, onStage: (s) => {
                    stageRef.current = s;
                    if (s)
                        s.onFrame = (dt, now) => frameRef.current(dt, now);
                }, onError: props.onFatal }), _jsxs("div", { className: "hud", children: [_jsxs("div", { className: "badge top-left", children: [_jsx("div", { className: "badge-t", children: "MOTION MIRROR" }), _jsxs("div", { className: "badge-s", children: [info.lost ? "—" : `Confidence ${Math.round(info.conf * 100)}%`, " \u00B7 Cam ", info.cam === null ? "n/a" : info.cam.toFixed(0), " fps \u00B7 Pose ", info.pose.toFixed(0), " fps"] })] }), _jsx(PreviewBox, { engine: engine, mirror: settings.mirror, overlay: settings.overlay, lost: info.lost && info.had, className: "side" }), info.lost && info.had && _jsx("div", { className: "lost-banner", children: "TRACKING LOST" }), !info.had && _jsx("div", { className: "wait-banner", children: "Step into view: waiting for your body to be detected\u2026" }), _jsxs("div", { className: "toolbar", children: [_jsx("button", { onClick: () => props.onSwitch(props.facing === "user" ? "environment" : "user"), children: "\u27F2 Camera" }), _jsx("button", { onClick: props.onMirror, children: settings.mirror ? "Mirror: On" : "Mirror: Off" }), _jsx("button", { onClick: () => props.onSettings(), children: "\u2699" }), _jsx("button", { className: props.showDebug ? "sel" : "", onClick: props.onToggleDebug, children: "Debug" }), _jsx("button", { onClick: props.onExit, children: "\u2715 Exit" })] }), props.showDebug && _jsx(DebugPanel, { engine: engine, facing: props.facing, onSwitch: props.onSwitch, onClose: props.onToggleDebug })] })] }));
}
const HUD0 = { t: 0, score: 0, combo: 0, acc: 0, stars: 0, nextIdx: 0, counts: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 }, last: null };
function currentLyric(song, beat) {
    const L = song.lyrics;
    for (let i = 0; i < L.length; i++) {
        const l = L[i];
        if (beat >= l.beat && beat < l.beat + l.len + 0.5)
            return { line: l, progress: Math.min(1, Math.max(0, (beat - l.beat) / l.len)), next: L[i + 1] ?? null };
        if (beat < l.beat)
            return beat > l.beat - 4 ? { line: l, progress: 0, next: L[i + 1] ?? null } : null;
    }
    return null;
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function ChallengeScreen(props) {
    const { engine, settings } = props;
    const songs = useMemo(() => [buildSunshineShake(), buildTestRoutine()], []);
    const [songId, setSongId] = useState(songs[0].id);
    const song = songs.find((x) => x.id === songId) ?? songs[0];
    const choreo = useMemo(() => new Choreography(song.moves, song.choreo), [song]);
    const scored = choreo.scoredMoves;
    const endT = song.audio === "synth" ? song.totalBeats * song.beatSec : choreo.duration;
    const musicRef = useRef(null);
    if (!musicRef.current)
        musicRef.current = new MusicPlayer();
    const [music, setMusic] = useState({ instrumental: "idle", vocals: false });
    const [soundMsg, setSoundMsg] = useState("");
    const scorerRef = useRef(null);
    const stageRef = useRef(null);
    const phaseRef = useRef("ready");
    const [phase, setPhaseState] = useState("ready");
    const setPhase = (p) => {
        phaseRef.current = p;
        setPhaseState(p);
    };
    const startRef = useRef(0); // performance.now() at choreography t = 0
    const pausedT = useRef(0);
    const lastFeat = useRef(null);
    const lastHudAt = useRef(0);
    const keyRef = useRef(0);
    const countRef = useRef(null);
    const [count, setCount] = useState(null);
    const [hud, setHud] = useState(HUD0);
    const [results, setResults] = useState(null);
    const [lost, setLost] = useState(false);
    const lostRef = useRef(false);
    const lastJudge = useRef(null);
    const tRef = useRef(0);
    const lastSeq = useRef(-1);
    // ---- the player's own character (face photo + colours), kept only in this browser
    const [character, setCharacter] = useState(loadCharacter());
    const faceRef = useRef(null);
    const [charMsg, setCharMsg] = useState("");
    const [charBusy, setCharBusy] = useState(0); // countdown seconds while taking the photo
    const charRef = useRef(character);
    charRef.current = character;
    const applyLook = (stage) => {
        const c = charRef.current;
        if (!c)
            return;
        stage.avatar.setLook({ skin: c.skin, jacket: c.jacket, hair: c.hair });
        const go = (cv) => stage.avatar.setLook({ face: cv });
        if (faceRef.current)
            go(faceRef.current);
        else
            faceCanvas(c).then((cv) => { faceRef.current = cv; go(cv); }).catch(() => { });
    };
    const updateCharacter = (c, cv) => {
        setCharacter(c);
        charRef.current = c;
        saveCharacter(c);
        faceRef.current = cv ?? null;
        const stage = stageRef.current;
        if (!stage)
            return;
        if (c)
            applyLook(stage);
        else {
            stage.avatar.setLook({ face: null, skin: PLAYER_STYLE.skin, jacket: PLAYER_STYLE.jacket, hair: PLAYER_STYLE.hair });
        }
    };
    const takePhoto = () => {
        setCharMsg("Look straight at the camera…");
        let n = 3;
        setCharBusy(n);
        const tick = () => {
            n--;
            if (n > 0) {
                setCharBusy(n);
                window.setTimeout(tick, 1000);
                return;
            }
            setCharBusy(0);
            const r = captureCharacter(engine.video, engine.latest?.pose ?? null, settings.mirror, charRef.current?.hair ?? HAIR_COLORS[0]);
            if (!r.ok) {
                setCharMsg(r.reason);
                return;
            }
            faceCanvas(r.character).then((cv) => {
                updateCharacter(r.character, cv);
                setCharMsg("Done! This is your character now. Retake if you don't like it.");
            });
        };
        window.setTimeout(tick, 1000);
    };
    const finish = () => {
        const sc = scorerRef.current;
        sc.tick(1e9);
        musicRef.current?.stop();
        const acc = sc.finalAccuracy;
        setResults({
            score: sc.score,
            accuracy: acc,
            maxCombo: sc.maxCombo,
            counts: { ...sc.counts },
            moves: sc.results.map((r) => ({ ...r })),
            stars: acc >= 80 ? 3 : acc >= 60 ? 2 : acc >= 40 ? 1 : 0,
        });
        setPhase("done");
    };
    const start = () => {
        scorerRef.current = new ChallengeScorer(choreo, { ...song.scoring, timingTolerance: song.audio === "synth" ? Math.max(song.scoring.timingTolerance, settings.tolerance) : settings.tolerance });
        startRef.current = performance.now() + choreo.leadIn * 1000 + 100; // +100 ms: audio is scheduled slightly ahead
        lastJudge.current = null;
        keyRef.current = 0;
        setResults(null);
        setHud(HUD0);
        musicRef.current.stop();
        setSoundMsg("");
        musicRef.current.onProblem = (m) => setSoundMsg(m);
        if (settings.music)
            musicRef.current.start(song, startRef.current, settings.audioOffsetMs);
        countRef.current = null;
        setCount(null);
        setPhase("countdown");
    };
    const pause = () => {
        if (phaseRef.current !== "playing" && phaseRef.current !== "countdown")
            return;
        pausedT.current = tRef.current;
        musicRef.current?.pause();
        setPhase("paused");
    };
    const resume = () => {
        startRef.current = performance.now() - pausedT.current * 1000;
        musicRef.current?.resume();
        setPhase(pausedT.current < 0 ? "countdown" : "playing");
    };
    // pause automatically if the tab/app goes to the background
    useEffect(() => {
        const onVis = () => {
            if (document.hidden)
                pause();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, []);
    // real pose frames -> scorer
    useEffect(() => engine.subscribe((fr) => {
        if (fr.pose && fr.valid) {
            const f = computeFeatures(fr.pose, fr.aspect);
            lastFeat.current = f;
            const ph = phaseRef.current;
            if (f && scorerRef.current && (ph === "countdown" || ph === "playing"))
                scorerRef.current.pushFrame((fr.t - startRef.current) / 1000, f);
        }
        else
            lastFeat.current = null;
    }), [engine]);
    useEffect(() => () => musicRef.current?.stop(), []);
    // render the instrumental (in a worker) as soon as a song is selected
    useEffect(() => {
        let alive = true;
        setMusic({ instrumental: song.audio === "synth" ? "rendering" : "ready", vocals: false });
        musicRef.current.prepare(song).then((st) => alive && setMusic({ ...st }));
        return () => {
            alive = false;
        };
    }, [song]);
    const frame = (dt, now) => {
        const stage = stageRef.current;
        if (!stage)
            return;
        const ph = phaseRef.current;
        let t = 0;
        if (ph === "countdown" || ph === "playing")
            t = (now - startRef.current) / 1000;
        else if (ph === "paused")
            t = pausedT.current;
        tRef.current = t;
        // The two dancers perform exactly the reference poses used by the scorer; the centre avatar is the player.
        const ref = choreo.poseAt(Math.max(0, t));
        for (const d of stage.dancers)
            d.setFromReference(ref);
        const fr = engine.latest;
        if (!engine.trackingLost(now) && fr && fr.valid && fr.world && fr.seq !== lastSeq.current) {
            lastSeq.current = fr.seq;
            stage.avatar.setFromWorld(fr.world, settings.mirror, fr.pose ? { pose: fr.pose, aspect: fr.aspect, t: fr.t / 1000 } : null);
        }
        stage.avatar.step(dt);
        // decorative beat pulse on the arch only (never touches the instructor's pose)
        const bs = song.beatSec;
        const beatPhase = (((t % bs) + bs) % bs) / bs;
        stage.pulse(ph === "playing" || ph === "countdown" ? 1 - beatPhase : 0);
        const isLost = engine.trackingLost(now);
        if (isLost !== lostRef.current) {
            lostRef.current = isLost;
            setLost(isLost);
        }
        if (ph === "countdown") {
            const n = Math.ceil(-t);
            const show = t >= 0 ? 0 : n; // 0 => "GO!"
            if (countRef.current !== show) {
                countRef.current = show;
                setCount(show);
            }
            if (t >= 0)
                setPhase("playing");
        }
        if (ph === "playing") {
            if (countRef.current !== null && t > 0.8) {
                countRef.current = null;
                setCount(null);
            }
            const sc = scorerRef.current;
            const events = sc.tick(t);
            for (const ev of events)
                lastJudge.current = { j: ev.judgment, key: ++keyRef.current };
            if (events.length || now - lastHudAt.current > 66) {
                lastHudAt.current = now;
                setHud({
                    t: Math.max(0, t),
                    score: sc.score,
                    combo: sc.combo,
                    acc: sc.accuracy,
                    stars: sc.stars,
                    nextIdx: choreo.nextMoveIndex(t, song.audio === "synth" ? 0 : sc.cfg.timingTolerance),
                    counts: { ...sc.counts },
                    last: lastJudge.current,
                });
            }
            if (t >= endT)
                finish();
        }
    };
    const frameRef = useRef(frame);
    frameRef.current = frame;
    const getExtra = () => {
        const t = tRef.current;
        let cur = null;
        for (const m of scored)
            if (m.at - 1 <= t)
                cur = m;
        const sc = scorerRef.current;
        const live = sc && cur ? sc.live(lastFeat.current, refComparable(choreo.specAt(Math.max(0, t))), cur.weights) : null;
        return { refName: cur ? cur.name : "Neutral", liveAccuracy: live, baselineOk: sc ? !!sc.baseline : false };
    };
    const upcoming = [hud.nextIdx, hud.nextIdx + 1, hud.nextIdx + 2].map((i) => scored[i]).filter(Boolean);
    const playing = phase === "playing" || phase === "paused";
    const beatNow = hud.t / song.beatSec;
    const section = song.sections.find((x) => beatNow >= x.startBeat && beatNow < x.startBeat + x.beats)?.name ?? "";
    const lyric = playing || phase === "countdown" ? currentLyric(song, beatNow) : null;
    const judgeColor = { PERFECT: "perfect", GREAT: "great", GOOD: "good", MISS: "miss" };
    return (_jsxs(_Fragment, { children: [_jsx(StageCanvas, { style: PLAYER_STYLE, dancers: [INSTRUCTOR_STYLE, INSTRUCTOR2_STYLE], reflections: settings.reflections, onStage: (s) => {
                    stageRef.current = s;
                    if (s) {
                        s.onFrame = (dt, now) => frameRef.current(dt, now);
                        applyLook(s);
                    }
                }, onError: props.onFatal }), _jsxs("div", { className: "hud", children: [_jsxs("div", { className: "song", children: [_jsx("div", { className: "song-ic", children: "\u266A" }), _jsxs("div", { className: "song-body", children: [_jsx("div", { className: "song-t", children: song.title }), _jsx("div", { className: "song-s", children: playing ? section : song.artist }), _jsxs("div", { className: "song-bar", children: [_jsx("div", { className: "bar", children: _jsx("div", { style: { width: Math.min(100, (hud.t / endT) * 100) + "%" } }) }), _jsxs("span", { children: [fmtTime(hud.t), " / ", fmtTime(endT)] })] })] })] }), _jsxs("div", { className: "top-center", children: [_jsx(Stars, { n: hud.stars }), _jsxs("div", { className: "score", children: [_jsx("small", { children: "SCORE" }), " ", hud.score.toLocaleString()] })] }), _jsxs("div", { className: "acc", children: [_jsx("div", { className: "acc-l", children: "Accuracy" }), _jsxs("div", { className: "acc-v", children: [playing || phase === "done" ? Math.round(hud.acc) : 0, "%"] })] }), hud.last && _jsxs("div", { className: "popup " + judgeColor[hud.last.j], children: [hud.last.j, hud.last.j !== "MISS" ? "!" : ""] }, hud.last.key), _jsx("div", { className: "ladder", children: ["PERFECT", "GREAT", "GOOD", "MISS"].map((j) => (_jsxs("div", { className: "lad " + judgeColor[j] + (hud.last?.j === j ? " on" : ""), children: [j, _jsx("b", { children: hud.counts[j] })] }, j))) }), lyric && (_jsxs("div", { className: "lyrics", "data-who": lyric.line.who, children: [_jsx("div", { className: "lyr-now", style: { ["--p"]: Math.round(lyric.progress * 100) + "%" }, children: lyric.line.text }), lyric.next && _jsx("div", { className: "lyr-next", children: lyric.next.text })] })), _jsxs("div", { className: "combo", children: [_jsx("small", { children: "Combo" }), _jsxs("span", { children: ["x", hud.combo] }, hud.combo)] }), _jsx(PreviewBox, { engine: engine, mirror: settings.mirror, overlay: settings.overlay, lost: lost, className: "side" }), _jsxs("div", { className: "next", children: [_jsx("div", { className: "next-t", children: "Coming up" }), _jsxs("div", { className: "next-row", children: [upcoming.length === 0 && _jsx("div", { className: "dim", children: phase === "done" ? "Finished" : "Last move" }), upcoming.map((m, i) => (_jsx("div", { className: "next-i " + (i === 0 ? "first" : ""), children: _jsx(StickFigure, { pose: buildRefPose(m.spec), active: i === 0 }) }, m.id)))] }), _jsx("div", { className: "next-n", children: upcoming[0] ? upcoming[0].name : "" })] }), _jsx("div", { className: "copy-tag l", children: "COPY ME \u25BC" }), _jsx("div", { className: "copy-tag c", children: "YOU \u25BC" }), _jsx("div", { className: "copy-tag r", children: "COPY ME \u25BC" }), lost && playing && _jsx("div", { className: "lost-banner", children: "TRACKING LOST" }), soundMsg && phase !== "ready" && _jsx("div", { className: "wait-banner", onClick: () => setSoundMsg(""), children: soundMsg }), _jsxs("div", { className: "toolbar", children: [phase === "playing" && _jsx("button", { onClick: pause, children: "\u275A\u275A Pause" }), phase === "paused" && _jsx("button", { onClick: resume, children: "\u25B6 Play" }), (phase === "playing" || phase === "paused" || phase === "countdown") && _jsx("button", { onClick: start, children: "\u21BB Restart" }), _jsx("button", { onClick: () => props.onSwitch(props.facing === "user" ? "environment" : "user"), children: "\u27F2 Camera" }), _jsx("button", { className: props.showDebug ? "sel" : "", onClick: props.onToggleDebug, children: "Debug" }), _jsx("button", { onClick: props.onSettings, children: "\u2699" }), _jsx("button", { onClick: props.onExit, children: "\u2715 Exit" })] }), props.showDebug && _jsx(DebugPanel, { engine: engine, getExtra: getExtra, facing: props.facing, onSwitch: props.onSwitch, onClose: props.onToggleDebug }), phase === "ready" && (_jsx("div", { className: "overlay clear", children: _jsxs("div", { className: "panel ready", children: [_jsx("h2", { children: "Dance Copy" }), _jsxs("div", { className: "ready-cols", children: [_jsxs("div", { className: "rc-left", children: [_jsx("div", { className: "song-pick", children: songs.map((x) => (_jsxs("button", { className: "sp" + (x.id === song.id ? " sel" : ""), onClick: () => setSongId(x.id), children: [_jsx("b", { children: x.title }), _jsx("span", { children: x.blurb })] }, x.id))) }), _jsxs("p", { className: "hint", children: [music.instrumental === "rendering" && "Preparing the music… ", music.instrumental === "error" && `Music failed to build: ${music.error}. `, song.audio === "synth" && music.instrumental === "ready" && (music.vocals ? "Music + sung vocals loaded. " : "Music ready (instrumental + synth melody — no sung vocals in this build; the lyrics are shown on screen). ")] }), song.audio === "synth" && (_jsxs("div", { children: [_jsx("button", { className: "btn ghost small", disabled: music.instrumental !== "ready" || !settings.music, onClick: async () => setSoundMsg(await musicRef.current.preview(song)), children: "\uD83D\uDD0A Test music" }), !settings.music && _jsx("p", { className: "hint", children: "Music is turned off in \u2699 Settings." }), soundMsg && _jsx("p", { className: "hint", children: soundMsg })] })), _jsxs("div", { className: "char-box", children: [_jsxs("div", { className: "char-head", children: [_jsx("b", { children: "\uD83D\uDC64 Your character" }), _jsx("span", { className: "hint", children: "Photo stays on this device only." })] }), _jsxs("div", { className: "char-row", children: [character ? _jsx("img", { className: "char-face", src: character.face, alt: "your face" }) : _jsx("div", { className: "char-face empty", children: "?" }), _jsxs("div", { className: "char-btns", children: [_jsx("button", { className: "btn ghost small", disabled: charBusy > 0, onClick: takePhoto, children: charBusy > 0 ? `📸 ${charBusy}…` : character ? "📸 Retake" : "📸 Take photo" }), character && _jsx("button", { className: "btn ghost small", onClick: () => updateCharacter(null), children: "Reset" })] }), _jsx("div", { className: "hair-row", title: "Hair colour", children: HAIR_COLORS.map((h) => (_jsx("button", { className: "hair" + ((character?.hair ?? PLAYER_STYLE.hair) === h ? " sel" : ""), style: { background: "#" + h.toString(16).padStart(6, "0") }, onClick: () => {
                                                                            stageRef.current?.avatar.setLook({ hair: h });
                                                                            if (character) {
                                                                                const c = { ...character, hair: h };
                                                                                setCharacter(c);
                                                                                charRef.current = c;
                                                                                saveCharacter(c);
                                                                            }
                                                                        } }, h))) })] }), charMsg && _jsx("div", { className: "hint", children: charMsg })] })] }), _jsxs("div", { className: "rc-right", children: [_jsxs("p", { children: [_jsx("b", { children: "How to play:" }), " the ", _jsx("b", { children: "two dancers on the sides" }), " are the instructors: copy them. The character in the ", _jsx("b", { children: "middle is you" }), " (it follows your camera). The small green figures at the right are only a preview of the ", _jsx("i", { children: "next" }), " move."] }), _jsxs("p", { children: ["Stand where the camera sees your ", _jsx("b", { children: "whole body" }), ". During the countdown, stand relaxed with your arms by your sides: the game records your neutral stance so body size, height and position never count against you."] }), _jsxs("p", { children: ["Copy the dancer like a mirror: your ", _jsx("b", { children: "right" }), " arm is the arm on the ", _jsx("b", { children: "right side of the screen" }), ". Each move is scored on joint angles, relative positions and timing. ", song.audio === "synth" ? "You copy AFTER the dancers: you have about 1.7 s from the moment they strike a pose, so no need to be at the same time as them." : `Timing window ±${settings.tolerance.toFixed(1)} s.`] }), _jsx("button", { className: "btn", disabled: music.instrumental === "rendering" || music.instrumental === "error", onClick: start, children: "START" })] })] })] }) })), phase === "countdown" && count !== null && count > 0 && _jsx("div", { className: "count", children: count }, count), phase === "playing" && count === 0 && _jsx("div", { className: "count go", children: "GO!" }), phase === "paused" && (_jsx("div", { className: "overlay clear", children: _jsxs("div", { className: "panel ready", children: [_jsx("h2", { children: "Paused" }), _jsxs("div", { className: "btn-row", children: [_jsx("button", { className: "btn", onClick: resume, children: "Resume" }), _jsx("button", { className: "btn ghost", onClick: start, children: "Restart" }), _jsx("button", { className: "btn ghost", onClick: props.onExit, children: "Quit" })] })] }) })), phase === "done" && results && (_jsx("div", { className: "overlay clear", children: _jsxs("div", { className: "panel results", children: [_jsxs("h2", { children: [song.title, " complete"] }), _jsx(Stars, { n: results.stars }), _jsxs("div", { className: "res-top", children: [_jsxs("div", { children: [_jsx("small", { children: "SCORE" }), _jsx("b", { children: results.score.toLocaleString() })] }), _jsxs("div", { children: [_jsx("small", { children: "ACCURACY" }), _jsxs("b", { children: [Math.round(results.accuracy), "%"] })] }), _jsxs("div", { children: [_jsx("small", { children: "MAX COMBO" }), _jsxs("b", { children: ["x", results.maxCombo] })] })] }), _jsx("div", { className: "res-counts", children: ["PERFECT", "GREAT", "GOOD", "MISS"].map((j) => (_jsxs("span", { className: judgeColor[j], children: [j, " ", results.counts[j]] }, j))) }), _jsx("div", { className: "res-moves", children: results.moves.map((r) => (_jsxs("div", { className: "res-m", children: [_jsx("span", { children: r.move.name }), _jsx("span", { className: judgeColor[r.judgment ?? "MISS"], children: r.judgment }), _jsxs("span", { children: [Math.round(r.best * 100), "%"] }), _jsx("span", { className: "dim", children: r.bestDt === null ? "not detected" : `${r.bestDt >= 0 ? "+" : ""}${Math.round(r.bestDt * 1000)} ms` })] }, r.move.id))) }), _jsxs("div", { className: "btn-row", children: [_jsx("button", { className: "btn", onClick: () => setPhase("ready"), children: "Play again" }), _jsx("button", { className: "btn ghost", onClick: props.onExit, children: "Menu" })] })] }) }))] })] }));
}
export function App() {
    const box = useStageBox();
    const engine = useMemo(() => new Engine(), []);
    const [settings, setSettingsState] = useState(loadSettings);
    const [screen, setScreen] = useState("menu");
    const [mode, setMode] = useState("challenge");
    const [loadMsg, setLoadMsg] = useState("");
    const [err, setErr] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showTV, setShowTV] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(0);
    const setSettings = (s) => {
        setSettingsState(s);
        saveSettings(s);
        engine.maxFps = s.maxFps;
        engine.setResponsiveness(s.responsiveness);
    };
    useEffect(() => {
        engine.maxFps = settings.maxFps;
        engine.setResponsiveness(settings.responsiveness);
        return () => engine.dispose();
    }, []);
    const flash = (m) => {
        setToast(m);
        clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 3500);
    };
    /* keep the screen awake while a mode is open */
    useEffect(() => {
        if (screen === "menu" || screen === "error")
            return;
        let lock = null;
        let cancelled = false;
        const acquire = async () => {
            try {
                if ("wakeLock" in navigator)
                    lock = await navigator.wakeLock.request("screen");
                if (cancelled)
                    lock?.release?.();
            }
            catch {
                /* not available or denied: harmless */
            }
        };
        acquire();
        const onVis = () => {
            if (!document.hidden)
                acquire();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => {
            cancelled = true;
            document.removeEventListener("visibilitychange", onVis);
            lock?.release?.();
        };
    }, [screen]);
    const goMenu = () => {
        engine.stop();
        setShowDebug(false);
        setScreen("menu");
    };
    const begin = async (m) => {
        setMode(m);
        setErr(null);
        setScreen("loading");
        setLoadMsg("Requesting camera…");
        try {
            // called straight from the tap, so the permission prompt is allowed
            await engine.start(settings.facing, settings.model, setLoadMsg);
            setScreen("calibrate");
        }
        catch (e) {
            engine.stop();
            setErr(toAppError(e));
            setScreen("error");
        }
    };
    const switchCamera = async (f) => {
        const prev = settings.facing;
        if (f === prev && engine.getStats().running)
            return;
        try {
            await engine.switchCamera(f);
            setSettings({ ...settings, facing: f, mirror: f === "user" });
            const note = engine.getStats().cameraNote;
            if (note)
                flash(note);
        }
        catch (e) {
            flash(toAppError(e).message);
            try {
                await engine.switchCamera(prev);
            }
            catch {
                /* original camera also gone: tracking-lost state will show */
            }
        }
    };
    const fullscreen = async () => {
        try {
            if (document.fullscreenElement)
                await document.exitFullscreen();
            else {
                await document.documentElement.requestFullscreen();
                // Orientation lock only works in fullscreen, and only on browsers that support it (Android Chrome).
                await window.screen.orientation?.lock?.("landscape").catch(() => { });
            }
        }
        catch {
            flash("Fullscreen isn't available in this browser (on iPhone, use Share → Add to Home Screen).");
        }
    };
    const fatal = (e) => {
        engine.stop();
        setErr(toAppError(e));
        setScreen("error");
    };
    const common = {
        engine,
        settings,
        facing: settings.facing,
        showDebug,
        onToggleDebug: () => setShowDebug((v) => !v),
        onSwitch: switchCamera,
        onSettings: () => setShowSettings(true),
        onExit: goMenu,
        onFatal: fatal,
    };
    return (_jsxs("div", { className: "app", children: [_jsxs("div", { className: "stage" + (settings.tvMode ? " tv" : ""), style: { width: box.w, height: box.h, "--u": box.w / 100 + "px" }, children: [screen === "menu" && _jsx(Menu, { onStart: begin, onSettings: () => setShowSettings(true), onTV: () => setShowTV(true), onFullscreen: fullscreen }), screen === "loading" && _jsx(Loading, { msg: loadMsg }), screen === "error" && err && _jsx(ErrorScreen, { err: err, onRetry: () => begin(mode), onBack: goMenu }), screen === "calibrate" && (_jsx(Calibration, { engine: engine, settings: settings, facing: settings.facing, onDone: () => setScreen(mode), onBack: goMenu, onSwitch: switchCamera })), screen === "mirror" && (_jsx(MirrorScreen, { ...common, onMirror: () => setSettings({ ...settings, mirror: !settings.mirror }) })), screen === "challenge" && _jsx(ChallengeScreen, { ...common }), showSettings && (_jsx(SettingsPanel, { settings: settings, onChange: setSettings, onSwitchCamera: switchCamera, cameraActive: screen === "calibrate" || screen === "mirror" || screen === "challenge", onClose: () => setShowSettings(false) })), showTV && _jsx(TVPanel, { settings: settings, onChange: setSettings, onFullscreen: fullscreen, onClose: () => setShowTV(false) }), _jsx(Toast, { msg: toast })] }), box.portrait && (_jsxs("div", { className: "rotate", children: [_jsx("div", { className: "rotate-ic", children: "\u27F3" }), _jsx("div", { children: "Rotate your phone to landscape" }), _jsx("small", { children: "Dance Motion is a landscape game. Unlock screen rotation if nothing happens." })] }))] }));
}
