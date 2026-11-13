import { useEffect, useMemo, useRef, useState } from "react";
import { Engine } from "./engine.js";
import { CameraError } from "./camera.js";
import { TrackerError } from "./tracker.js";
import { Stage3D, StageError } from "./stage3d.js";
import { Cutout } from "./cutout.js";
import { INSTRUCTOR_STYLE, INSTRUCTOR2_STYLE, PLAYER_STYLE, type AvatarStyle } from "./avatar3d.js";
import { COACH_SETS, cartoonFace, OUTFITS, loadCoachSet, outfitLook, saveCoachSet } from "./coaches.js";
import { HAIR_COLORS, captureCharacter, faceCanvas, loadCharacter, saveCharacter, type Character } from "./character.js";
import { MusicPlayer, type MusicStatus } from "./songPlayer.js";
import { buildSunshineShake } from "./songs/sunshineShake.js";
import { buildTestRoutine } from "./songs/testRoutine.js";
import { buildZumbaControl } from "./songs/zumbaControl.js";
import type { SongDef } from "./songs/types.js";
import { Choreography, buildRefPose, refComparable } from "./choreography.js";
import { BODY_GROUPS, computeFeatures, groupInFrame, type Features } from "./poseMath.js";
import { ChallengeScorer, type MoveResult } from "./scoring.js";
import { setLang, tr, isAr } from "./i18n.js";
import { loadSettings, saveSettings, type Settings } from "./settings.js";
import { LM, type Facing, type Judgment } from "./types.js";
import { DebugPanel, PreviewBox, SettingsPanel, Stars, StickFigure, Toast, TVPanel, useStageBox } from "./ui.js";

/* ------------------------------------------------------------------ errors */

interface AppError {
  title: string;
  message: string;
  detail?: string;
  kind: string;
}

function toAppError(e: any): AppError {
  if (e instanceof CameraError) {
    const titles: Record<string, string> = {
      denied: "Camera permission denied",
      notfound: "No camera found",
      insecure: "HTTPS required",
      busy: "Camera unavailable",
      unsupported: "Camera not supported",
    };
    return { title: titles[e.code] ?? "Camera problem", message: e.message, detail: e.detail, kind: e.code };
  }
  if (e instanceof TrackerError) return { title: "Pose model failed to load", message: e.message, detail: e.detail, kind: "model" };
  if (e instanceof StageError) return { title: "3D graphics unavailable", message: e.message, kind: "webgl" };
  return { title: "Something went wrong", message: String(e?.message ?? e), kind: "unknown" };
}

/* ------------------------------------------------------------ 3D canvas */

function StageCanvas(props: {
  style: AvatarStyle;
  reflections: boolean;
  dancers?: AvatarStyle[];
  cutout?: boolean;
  /** Called when the official GLB dancer is on stage (true) or could not be loaded (false: fallback look stays). */
  onGlb?: (ok: boolean) => void;
  onStage: (s: Stage3D | null) => void;
  onError: (e: any) => void;
}) {
  const ref = useRef(null as HTMLCanvasElement | null);
  const ref2 = useRef(null as HTMLCanvasElement | null);
  useEffect(() => {
    let stage: Stage3D;
    try {
      stage = new Stage3D(ref.current!, { style: props.style, reflection: props.reflections, antialias: true, maxPixelRatio: 1.5, dancers: props.dancers });
    } catch (e) {
      props.onError(e);
      return;
    }
    (window as any).__dm = { stage };
    props.onStage(stage);
    if (props.cutout && ref2.current) {
      const cv = ref2.current;
      const cut = new Cutout(cv);
      stage.setCutoutMode(true);
      stage.postFrame = () => {
        const { w, h } = cut.begin();
        const cw = cv.clientWidth || 1, ch = cv.clientHeight || 1;
        const k = w / cw;
        const list = [...stage.dancers, stage.avatar];
        for (const a of list) {
          const f = a.figureState();
          if (!f || (a === stage.avatar && stage.playerHidden)) continue;
          const base = stage.project(f.ox, 0, cw, ch);
          const map = (x: number, y: number): [number, number] => {
            const q = stage.project(x, y, cw, ch);
            return [q.px * k, q.py * k];
          };
          if (a === stage.avatar) f.scale *= 0.9;
          cut.figure(f as any, map, base.ppm * k);
        }
      };
    }
    let gone = false;
    (async () => {
      try {
        const m = await import("./glbDancer.js");
        const tpl = await m.loadDancer();
        if (gone) return;
        stage.useGlb(() => new m.GlbBody(tpl));
        const c2 = ref2.current;
        if (c2) c2.getContext("2d")?.clearRect(0, 0, c2.width, c2.height);
        props.onGlb?.(true);
      } catch (e) {
        console.warn("GLB dancer not loaded, keeping the fallback character:", e);
        if (!gone) props.onGlb?.(false);
      }
    })();
    stage.start();
    return () => {
      gone = true;
      props.onStage(null);
      stage.dispose();
    };
  }, []);
  return (
    <>
      <canvas ref={ref} className="stage3d" />
      {props.cutout && <canvas ref={ref2} className="stage2d" />}
    </>
  );
}

/* -------------------------------------------------------------- screens */

function Menu(props: { lang: "en" | "ar"; onLang: () => void; onStart: (m: "mirror" | "challenge" | "control") => void; onSettings: () => void; onTV: () => void; onFullscreen: () => void }) {
  const insecure = !window.isSecureContext;
  return (
    <div className="screen menu">
      <div className="menu-title" dir="ltr">
        <span>DANCE</span>
        <span className="alt">MOTION</span>
      </div>
      <div className="menu-sub">{tr("Real camera body-tracking · prototype · ")}<span dir="ltr">build glb1</span></div>
      {insecure && (
        <div className="warn">
          {tr("This page is not served over HTTPS, so the browser will block the camera. Open it via HTTPS or http://localhost (see README).")}
        </div>
      )}
      <div className="menu-cards">
        <button className="card pink" onClick={() => props.onStart("challenge")}>
          <div className="card-t">{tr("DANCE COPY")}</div>
          <div className="card-d">{tr("Copy the dancer to an original song. Scored on joint angles, position and timing.")}</div>
        </button>
        <button className="card green" onClick={() => props.onStart("control")}>
          <div className="card-t">{tr("DANCE CONTROL")}</div>
          <div className="card-d">{tr("You drive the dancer with your real moves, on the beat. Private 60 s test (needs your own audio file).")}</div>
        </button>
        <button className="card blue" onClick={() => props.onStart("mirror")}>
          <div className="card-t">{tr("MOTION MIRROR")}</div>
          <div className="card-d">{tr("A 3D avatar that mirrors your body live from the camera. No pre-made animation.")}</div>
        </button>
      </div>
      <div className="menu-row">
        <button className="pill" onClick={props.onSettings}>{tr("⚙ Settings")}</button>
        <button className="pill" onClick={props.onTV}>{tr("📺 TV Mode")}</button>
        <button className="pill" onClick={props.onFullscreen}>{tr("⛶ Fullscreen")}</button>
        <button className="pill" onClick={props.onLang}>{props.lang === "ar" ? "English" : "العربية"}</button>
      </div>
      <div className="menu-foot">{tr("The camera only starts after you tap a mode. Video never leaves your device: pose detection runs locally in the browser.")}</div>
    </div>
  );
}

function Loading({ msg }: { msg: string }) {
  return (
    <div className="screen center">
      <div className="spinner" />
      <div className="big-msg">{tr(msg)}</div>
      <div className="dim">{tr("First start downloads the pose model (a few MB). Needs an internet connection.")}</div>
    </div>
  );
}

function ErrorScreen(props: { err: AppError; onRetry: () => void; onBack: () => void }) {
  const { err } = props;
  const hints: Record<string, string[]> = {
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
  return (
    <div className="screen center">
      <div className="err-title">{tr(err.title)}</div>
      <div className="big-msg">{err.message}</div>
      <ul className="hints">{(hints[err.kind] ?? []).map((h) => <li key={h}>{tr(h)}</li>)}</ul>
      {err.detail && <div className="dim mono">{err.detail}</div>}
      <div className="btn-row">
        <button className="btn" onClick={props.onRetry}>{tr("Try again")}</button>
        <button className="btn ghost" onClick={props.onBack}>{tr("Back")}</button>
      </div>
    </div>
  );
}

function Calibration(props: {
  engine: Engine;
  settings: Settings;
  facing: Facing;
  onDone: () => void;
  onBack: () => void;
  onSwitch: (f: Facing) => void;
}) {
  const { engine } = props;
  const [st, setSt] = useState({ checks: BODY_GROUPS.map(() => false), progress: 0, lost: true, hint: "" });
  useEffect(() => {
    let okSince = 0;
    let done = false;
    const id = window.setInterval(() => {
      const f = engine.latest;
      const now = performance.now();
      const lost = engine.trackingLost(now) || !f || !f.pose;
      const checks = BODY_GROUPS.map((g) => !lost && groupInFrame(f!.pose!, g.ids));
      const all = checks.every(Boolean);
      if (all) okSince = okSince || now;
      else okSince = 0;
      const progress = okSince ? Math.min(1, (now - okSince) / 1200) : 0;
      let hint = tr("Stand back until your entire body is visible.");
      if (lost) hint = tr("No body detected yet. ") + hint;
      else if (!checks[5] || !checks[6]) hint = tr("Step back: your knees / feet are not fully in view.");
      else if (!checks[3] || !checks[2]) hint = tr("Make sure your arms are in view and not hidden.");
      else if (all) hint = tr("Hold still…");
      setSt({ checks, progress, lost, hint });
      if (progress >= 1 && !done) {
        done = true;
        props.onDone();
      }
    }, 100);
    return () => clearInterval(id);
  }, [engine]);

  return (
    <div className="screen calib">
      <div className="calib-cam">
        <PreviewBox engine={engine} mirror={props.settings.mirror} overlay={true} lost={st.lost} lostText={tr("NO BODY DETECTED")} label={tr("Camera")} className="big" />
      </div>
      <div className="calib-side">
        <div className="calib-title">{tr("CALIBRATION")}</div>
        <div className="calib-hint">{st.hint}</div>
        <div className="checks">
          {BODY_GROUPS.map((g, i) => (
            <div key={g.label} className={"check " + (st.checks[i] ? "ok" : "")}>
              <span>{st.checks[i] ? "✓" : "○"}</span> {tr(g.label)}
            </div>
          ))}
        </div>
        <div className="bar"><div style={{ width: st.progress * 100 + "%" }} /></div>
        <div className="btn-row">
          <button className="btn small ghost" onClick={() => props.onSwitch(props.facing === "user" ? "environment" : "user")}>{tr("⟲ Switch camera")}</button>
          <button className="btn small ghost" onClick={props.onBack}>{tr("Back")}</button>
        </div>
        <div className="dim">{tr("Landmarks must be detected with confidence and inside the frame. Nothing is skipped or simulated.")}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- Motion Mirror */

function MirrorScreen(props: {
  engine: Engine;
  settings: Settings;
  facing: Facing;
  showDebug: boolean;
  onToggleDebug: () => void;
  onSwitch: (f: Facing) => void;
  onSettings: () => void;
  onMirror: () => void;
  onExit: () => void;
  onFatal: (e: any) => void;
}) {
  const { engine, settings } = props;
  const stageRef = useRef(null as Stage3D | null);
  const lastSeq = useRef(-1);
  const hadPose = useRef(false);
  const lastInfo = useRef(0);
  const [info, setInfo] = useState({ lost: true, conf: 0, cam: null as number | null, pose: 0, had: false });
  const setRef = useRef(settings);
  setRef.current = settings;

  const frame = (dt: number, now: number) => {
    const stage = stageRef.current;
    if (!stage) return;
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

  return (
    <>
      <StageCanvas
        style={PLAYER_STYLE}
        reflections={settings.reflections}
        onStage={(s) => {
          stageRef.current = s;
          if (s) s.onFrame = (dt, now) => frameRef.current(dt, now);
        }}
        onError={props.onFatal}
      />
      <div className="hud">
        <div className="badge top-left">
          <div className="badge-t">{tr("MOTION MIRROR")}</div>
          <div className="badge-s">
            {info.lost ? "—" : `Confidence ${Math.round(info.conf * 100)}%`} · Cam {info.cam === null ? "n/a" : info.cam.toFixed(0)} fps · Pose {info.pose.toFixed(0)} fps
          </div>
        </div>
        <PreviewBox engine={engine} mirror={settings.mirror} overlay={settings.overlay} lost={info.lost && info.had} className="side" />
        {info.lost && info.had && <div className="lost-banner">{tr("TRACKING LOST")}</div>}
        {!info.had && <div className="wait-banner">{tr("Step into view: waiting for your body to be detected…")}</div>}
        <div className="toolbar">
          <button onClick={() => props.onSwitch(props.facing === "user" ? "environment" : "user")}>{tr("⟲ Camera")}</button>
          <button onClick={props.onMirror}>{settings.mirror ? tr("Mirror: On") : tr("Mirror: Off")}</button>
          <button onClick={() => props.onSettings()}>⚙</button>
          <button className={props.showDebug ? "sel" : ""} onClick={props.onToggleDebug}>Debug</button>
          <button onClick={props.onExit}>{tr("✕ Exit")}</button>
        </div>
        {props.showDebug && <DebugPanel engine={engine} facing={props.facing} onSwitch={props.onSwitch} onClose={props.onToggleDebug} />}
      </div>
    </>
  );
}

/* -------------------------------------------------------- Dance Challenge */

type Phase = "ready" | "countdown" | "playing" | "paused" | "done";

interface Hud {
  t: number;
  score: number;
  combo: number;
  acc: number;
  stars: number;
  nextIdx: number;
  counts: Record<Judgment, number>;
  last: { j: Judgment; text: string; key: number } | null;
}
const HUD0: Hud = { t: 0, score: 0, combo: 0, acc: 0, stars: 0, nextIdx: 0, counts: { PERFECT: 0, GREAT: 0, GOOD: 0, KEEP: 0, MISS: 0 }, last: null };

interface Results {
  score: number;
  accuracy: number;
  maxCombo: number;
  counts: Record<Judgment, number>;
  moves: MoveResult[];
  stars: number;
}

function currentLyric(song: SongDef, beat: number) {
  const L = song.lyrics;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (beat >= l.beat && beat < l.beat + l.len + 0.5) return { line: l, progress: Math.min(1, Math.max(0, (beat - l.beat) / l.len)), next: L[i + 1] ?? null };
    if (beat < l.beat) return beat > l.beat - 4 ? { line: l, progress: 0, next: L[i + 1] ?? null } : null;
  }
  return null;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function ChallengeScreen(props: {
  engine: Engine;
  settings: Settings;
  facing: Facing;
  showDebug: boolean;
  onToggleDebug: () => void;
  onSwitch: (f: Facing) => void;
  onSettings: () => void;
  onExit: () => void;
  onFatal: (e: any) => void;
  /** Dance Control: no dancers perform; the character is driven only by the player's camera pose. */
  control?: boolean;
}) {
  const { engine, settings } = props;
  const control = !!props.control;
  const songs = useMemo(() => (control ? [buildZumbaControl()] : [buildSunshineShake(), buildTestRoutine()]) as SongDef[], [control]);
  const [songId, setSongId] = useState(songs[0].id);
  const song = songs.find((x) => x.id === songId) ?? songs[0];
  const choreo = useMemo(() => new Choreography(song.moves, song.choreo), [song]);
  const scored = choreo.scoredMoves;
  const endT = song.audio === "beat" ? choreo.duration : song.totalBeats * song.beatSec;
  const musicRef = useRef(null as MusicPlayer | null);
  if (!musicRef.current) musicRef.current = new MusicPlayer();
  const [music, setMusic] = useState({ instrumental: "idle", vocals: false } as MusicStatus);
  const [soundMsg, setSoundMsg] = useState("");

  const scorerRef = useRef(null as ChallengeScorer | null);
  const stageRef = useRef(null as Stage3D | null);
  const phaseRef = useRef("ready" as Phase);
  const [phase, setPhaseState] = useState("ready" as Phase);
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const startRef = useRef(0); // performance.now() at choreography t = 0
  const pausedT = useRef(0);
  const lastFeat = useRef(null as Features | null);
  const lastHudAt = useRef(0);
  const keyRef = useRef(0);
  const countRef = useRef(null as number | null);
  const [count, setCount] = useState(null as number | null);
  const [hud, setHud] = useState(HUD0);
  const [results, setResults] = useState(null as Results | null);
  const [lost, setLost] = useState(false);
  /** true once the official GLB dancer is on stage (her outfit/face are then fixed: no recolouring or photo) */
  const [glb, setGlb] = useState(false);
  const lostRef = useRef(false);
  const lastJudge = useRef(null as Hud["last"]);
  const tRef = useRef(0);
  const lastSeq = useRef(-1);

  // ---- the player's own character (face photo + colours), kept only in this browser
  const [character, setCharacter] = useState(loadCharacter() as Character | null);
  const faceRef = useRef(null as HTMLCanvasElement | null);
  const [charMsg, setCharMsg] = useState("");
  const [charBusy, setCharBusy] = useState(0 as number); // countdown seconds while taking the photo
  const charRef = useRef(character);
  charRef.current = character;
  const [coachSet, setCoachSet] = useState(loadCoachSet());
  const coachRef = useRef(coachSet);
  coachRef.current = coachSet;
  const applyCoaches = (stage: Stage3D) => {
    const pair = COACH_SETS[coachRef.current].pair;
    stage.dancers.forEach((d, i) => d.setLook(outfitLook(OUTFITS[pair[i % 2]])));
  };
  const applyLook = (stage: Stage3D) => {
    applyCoaches(stage);
    const c = charRef.current;
    if (!c) {
      stage.avatar.setLook({ face: cartoonFace(PLAYER_STYLE.skin, true), jacket: 0x7a3cff, shirt: 0x15111f, pants: 0x1a1428, baggy: true, longHair: true });
      return;
    }
    stage.avatar.setLook({ skin: c.skin, jacket: c.jacket, hair: c.hair, baggy: true, longHair: true });
    const go = (cv: HTMLCanvasElement) => stage.avatar.setLook({ face: cv });
    if (faceRef.current) go(faceRef.current);
    else faceCanvas(c).then((cv) => { faceRef.current = cv; go(cv); }).catch(() => {});
  };
  const updateCharacter = (c: Character | null, cv?: HTMLCanvasElement | null) => {
    setCharacter(c);
    charRef.current = c;
    saveCharacter(c);
    faceRef.current = cv ?? null;
    const stage = stageRef.current;
    if (!stage) return;
    if (c) applyLook(stage);
    else {
      stage.avatar.setLook({ face: cartoonFace(PLAYER_STYLE.skin, true), skin: PLAYER_STYLE.skin, hair: PLAYER_STYLE.hair, jacket: 0x7a3cff, shirt: 0x15111f, pants: 0x1a1428, baggy: true, longHair: true });
    }
  };
  const takePhoto = () => {
    setCharMsg(tr("Look straight at the camera…"));
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
        setCharMsg(tr("Done! This is your character now. Retake if you don't like it."));
      });
    };
    window.setTimeout(tick, 1000);
  };

  const finish = () => {
    const sc = scorerRef.current!;
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
    scorerRef.current = new ChallengeScorer(choreo, { ...song.scoring, timingTolerance: song.scoring.timingTolerance });
    startRef.current = performance.now() + choreo.leadIn * 1000 + 100; // +100 ms: audio is scheduled slightly ahead
    lastJudge.current = null;
    keyRef.current = 0;
    setResults(null);
    setHud(HUD0);
    musicRef.current!.stop();
    setSoundMsg("");
    musicRef.current!.onProblem = (m) => setSoundMsg(m);
    if (settings.music) musicRef.current!.start(song, startRef.current, settings.audioOffsetMs);
    countRef.current = null;
    setCount(null);
    setPhase("countdown");
  };

  const pause = () => {
    if (phaseRef.current !== "playing" && phaseRef.current !== "countdown") return;
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
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // real pose frames -> scorer
  useEffect(
    () =>
      engine.subscribe((fr) => {
        if (fr.pose && fr.valid) {
          const f = computeFeatures(fr.pose, fr.aspect);
          lastFeat.current = f;
          const ph = phaseRef.current;
          if (f && scorerRef.current && (ph === "countdown" || ph === "playing")) scorerRef.current.pushFrame((fr.t - startRef.current) / 1000, f);
        } else lastFeat.current = null;
      }),
    [engine],
  );

  useEffect(() => () => musicRef.current?.stop(), []);

  // render the instrumental (in a worker) as soon as a song is selected
  useEffect(() => {
    let alive = true;
    setMusic({ instrumental: song.audio === "synth" || song.audio === "file" ? "rendering" : "ready", vocals: false });
    musicRef.current!.prepare(song).then((st) => alive && setMusic({ ...st }));
    return () => {
      alive = false;
    };
  }, [song]);

  const frame = (dt: number, now: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const ph = phaseRef.current;
    let t = 0;
    if (ph === "countdown" || ph === "playing") t = (now - startRef.current) / 1000;
    else if (ph === "paused") t = pausedT.current;
    tRef.current = t;

    // The two dancers perform exactly the reference poses used by the scorer; the centre avatar is the player.
    const ref = choreo.poseAt(Math.max(0, t));
    for (const d of stage.dancers) d.setFromReference(ref);
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
    stage.playerHidden = isLost;
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
      if (t >= 0) setPhase("playing");
    }
    if (ph === "playing") {
      if (countRef.current !== null && t > 0.8) {
        countRef.current = null;
        setCount(null);
      }
      const sc = scorerRef.current!;
      const events = sc.tick(t);
      for (const ev of events) lastJudge.current = { j: ev.judgment, text: ev.text, key: ++keyRef.current };
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
      if (t >= endT) finish();
    }
  };
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const getExtra = () => {
    const t = tRef.current;
    let cur = null as null | (typeof choreo.moves)[number];
    for (const m of scored) if (m.at - 1 <= t) cur = m;
    const sc = scorerRef.current;
    const live = sc && cur ? sc.live(lastFeat.current, refComparable(choreo.specAt(Math.max(0, t))), cur.weights) : null;
    return { refName: cur ? cur.name : "Neutral", liveAccuracy: live, baselineOk: sc ? !!sc.baseline : false };
  };

  const upcoming = [hud.nextIdx, hud.nextIdx + 1, hud.nextIdx + 2].map((i) => scored[i]).filter(Boolean);
  const playing = phase === "playing" || phase === "paused";
  const beatNow = hud.t / song.beatSec;
  const section = song.sections.find((x) => beatNow >= x.startBeat && beatNow < x.startBeat + x.beats)?.name ?? "";
  const lyric = playing || phase === "countdown" ? currentLyric(song, beatNow) : null;
  const judgeColor: Record<Judgment, string> = { PERFECT: "perfect", GREAT: "great", GOOD: "good", KEEP: "keep", MISS: "miss" };

  return (
    <>
      <StageCanvas
        style={PLAYER_STYLE}
        dancers={control ? [] : [INSTRUCTOR_STYLE, INSTRUCTOR2_STYLE]}
        cutout
        onGlb={setGlb}
        reflections={settings.reflections}
        onStage={(s) => {
          stageRef.current = s;
          if (s) {
            s.onFrame = (dt, now) => frameRef.current(dt, now);
            if (control) s.avatar.setLateralLimit(0.8);
            applyLook(s);
          }
        }}
        onError={props.onFatal}
      />
      <div className="hud">
        {/* top-left: routine + progress */}
        <div className="song">
          <div className="song-ic">♪</div>
          <div className="song-body">
            <div className="song-t">{tr(song.title)}</div>
            <div className="song-s">{playing ? tr(section) : tr(song.artist)}</div>
            <div className="song-bar">
              <div className="bar"><div style={{ width: Math.min(100, (hud.t / endT) * 100) + "%" }} /></div>
              <span>{fmtTime(hud.t)} / {fmtTime(endT)}</span>
            </div>
          </div>
        </div>
        {/* top-center: stars + score */}
        <div className="top-center">
          <Stars n={hud.stars} />
          <div className="score"><small>{tr("SCORE")}</small> {hud.score.toLocaleString()}</div>
        </div>
        {/* top-right: accuracy */}
        <div className="acc">
          <div className="acc-l">{tr("Accuracy")}</div>
          <div className="acc-v">{playing || phase === "done" ? Math.round(hud.acc) : 0}%</div>
        </div>

        {/* left: judgment popup + ladder */}
        {hud.last && <div key={hud.last.key} className={"popup " + judgeColor[hud.last.j]}>{tr(hud.last.text)}</div>}
        <div className="ladder">
          {(["PERFECT", "GREAT", "GOOD", "KEEP", "MISS"] as Judgment[]).map((j) => (
            <div key={j} className={"lad " + judgeColor[j] + (hud.last?.j === j ? " on" : "")}>
              {tr(j)}<b>{hud.counts[j]}</b>
            </div>
          ))}
        </div>

        {/* lyrics (original words; shown as text, they are NOT sung unless a vocal stem is shipped) */}
        {lyric && (
          <div className="lyrics" dir="ltr" data-who={lyric.line.who}>
            <div className="lyr-now" style={{ ["--p" as any]: Math.round(lyric.progress * 100) + "%" }}>{lyric.line.text}</div>
            {lyric.next && <div className="lyr-next">{lyric.next.text}</div>}
          </div>
        )}

        {/* bottom-left: combo */}
        <div className="combo"><small>{tr("Combo")}</small><span key={hud.combo}>x{hud.combo}</span></div>

        {/* right: camera preview + next moves */}
        <PreviewBox engine={engine} mirror={settings.mirror} overlay={settings.overlay} lost={lost} className="side" />
        <div className="next">
          <div className="next-t">{tr("Coming up")}</div>
          <div className="next-row">
            {upcoming.length === 0 && <div className="dim">{phase === "done" ? tr("Finished") : tr("Last move")}</div>}
            {upcoming.map((m, i) => (
              <div key={m.id} className={"next-i " + (i === 0 ? "first" : "")}>
                <StickFigure pose={buildRefPose(m.spec)} active={i === 0} />
              </div>
            ))}
          </div>
          <div className="next-n">{upcoming[0] ? tr(upcoming[0].name) : ""}</div>
        </div>

        {!control && <div className="copy-tag l">{tr("COPY ME ▼")}</div>}
        <div className="copy-tag c">{tr("YOU ▼")}</div>
        {!control && <div className="copy-tag r">{tr("COPY ME ▼")}</div>}
        {lost && playing && <div className="lost-banner">{tr("TRACKING LOST")}</div>}
        {soundMsg && phase !== "ready" && <div className="wait-banner" onClick={() => setSoundMsg("")}>{soundMsg}</div>}

        {/* controls */}
        <div className="toolbar">
          {phase === "playing" && <button onClick={pause}>{tr("❚❚ Pause")}</button>}
          {phase === "paused" && <button onClick={resume}>{tr("▶ Play")}</button>}
          {(phase === "playing" || phase === "paused" || phase === "countdown") && <button onClick={start}>{tr("↻ Restart")}</button>}
          <button onClick={() => props.onSwitch(props.facing === "user" ? "environment" : "user")}>{tr("⟲ Camera")}</button>
          <button className={props.showDebug ? "sel" : ""} onClick={props.onToggleDebug}>Debug</button>
          <button onClick={props.onSettings}>⚙</button>
          <button onClick={props.onExit}>{tr("✕ Exit")}</button>
        </div>

        {props.showDebug && <DebugPanel engine={engine} getExtra={getExtra} facing={props.facing} onSwitch={props.onSwitch} onClose={props.onToggleDebug} />}

        {/* overlays */}
        {phase === "ready" && (
          <div className="overlay clear">
            <div className="panel ready">
              <h2>{tr(control ? "Dance Control" : "Dance Copy")}</h2>
              <div className="ready-cols">
              <div className="rc-left">
              <div className="song-pick">
                {songs.map((x) => (
                  <button key={x.id} className={"sp" + (x.id === song.id ? " sel" : "")} onClick={() => setSongId(x.id)}>
                    <b>{tr(x.title)}</b>
                    <span>{tr(x.blurb)}</span>
                  </button>
                ))}
              </div>
              <p className="hint">
                {music.instrumental === "rendering" && tr("Preparing the music… ")}
                {music.instrumental === "error" && `Music failed to build: ${music.error}. `}
                {song.audio === "synth" && music.instrumental === "ready" && (music.vocals ? "Music + sung vocals loaded. " : "Music ready (instrumental + synth melody — no sung vocals in this build; the lyrics are shown on screen). ")}
              </p>
              {song.audio === "file" && (
                <div className="char-box">
                  <div className="char-head">
                    <b>{tr("🎵 Audio file (private test)")}</b>
                    <span className="hint">{tr("remembered on this device only")}</span>
                  </div>
                  <p className="hint">{music.fileInfo ? (isAr() ? `تم التحميل: ${music.fileInfo}.` : `Loaded: ${music.fileInfo}.`) : tr("Choose your 60-second clip (mp3/m4a/wav) once. Only the first 60 s are used. It is remembered in this browser only and never uploaded.")}</p>
                  <input
                    type="file"
                    accept="audio/*,video/mp4"
                    onChange={async (e: any) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setMusic({ instrumental: "rendering", vocals: false });
                      setMusic({ ...(await musicRef.current!.loadFile(f)) });
                    }}
                  />
                  {music.fileInfo && (
                    <button className="btn ghost small" onClick={async () => setMusic({ ...(await musicRef.current!.forget()) })}>
                      {tr("Forget the saved clip")}
                    </button>
                  )}
                </div>
              )}
              {song.audio !== "beat" && (
                <div>
                  <button
                    className="btn ghost small"
                    disabled={music.instrumental !== "ready" || !settings.music}
                    onClick={async () => setSoundMsg(await musicRef.current!.preview(song))}
                  >
                    {tr("🔊 Test music")}
                  </button>
                  {!settings.music && <p className="hint">{tr("Music is turned off in ⚙ Settings.")}</p>}
                  {soundMsg && <p className="hint">{soundMsg}</p>}
                </div>
              )}
              {!control && !glb && (
              <div className="char-box">
                <div className="char-head">
                  <b>{tr("🎨 Coaches")}</b>
                  <span className="hint">{tr("optional outfits")}</span>
                </div>
                <div className="coach-row">
                  {COACH_SETS.map((c, i) => (
                    <button
                      key={c.name}
                      className={"chip" + (i === coachSet ? " sel" : "")}
                      onClick={() => {
                        setCoachSet(i);
                        coachRef.current = i;
                        saveCoachSet(i);
                        if (stageRef.current) applyCoaches(stageRef.current);
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
              )}
              {!glb && (
              <div className="char-box">
                <div className="char-head">
                  <b>{tr("👤 Your character")}</b>
                  <span className="hint">{tr("Photo stays on this device only.")}</span>
                </div>
                <div className="char-row">
                  {character ? <img className="char-face" src={character.face} alt="your face" /> : <div className="char-face empty">?</div>}
                  <div className="char-btns">
                    <button className="btn ghost small" disabled={charBusy > 0} onClick={takePhoto}>
                      {charBusy > 0 ? `📸 ${charBusy}…` : character ? tr("📸 Retake") : tr("📸 Take photo")}
                    </button>
                    {character && <button className="btn ghost small" onClick={() => updateCharacter(null)}>{tr("Reset")}</button>}
                  </div>
                  <div className="hair-row" title="Hair colour">
                    {HAIR_COLORS.map((h) => (
                      <button
                        key={h}
                        className={"hair" + ((character?.hair ?? PLAYER_STYLE.hair) === h ? " sel" : "")}
                        style={{ background: "#" + h.toString(16).padStart(6, "0") }}
                        onClick={() => {
                          stageRef.current?.avatar.setLook({ hair: h });
                          if (character) {
                            const c = { ...character, hair: h };
                            setCharacter(c);
                            charRef.current = c;
                            saveCharacter(c);
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
                {charMsg && <div className="hint">{charMsg}</div>}
              </div>
              )}
              </div>
              <div className="rc-right">
              {isAr() ? (
                control ? (
                  <p><b>طريقة اللعب (تحكّم بالرقصة):</b> ما فيه راقص تقلّدينه. الشخصية على الشاشة <b>هي إنتي</b>: تتحرك بس لما تتحركين. الشكل الأخضر الصغير تحت <b>الحركة الجاية</b> يوريك الحركة اللي تسوينها على النبضة الجاية. سوّيها على الإيقاع عشان تاخذين نقاط، والوقوف بدون حركة ما يجيب نقاط. قفي في مكان تظهرين فيه <b>كاملة</b> للكاميرا، وخلي ذراعيك مرتخيين على جنبك وقت العد التنازلي. الخطوات الجانبية تحرّك الشخصية يمين ويسار.</p>
                ) : (
                  <>
                    <p><b>طريقة اللعب:</b> <b>الراقصتين على الجنبين</b> هم المدربات: قلّديهم. الشخصية <b>اللي في النص هي إنتي</b> (تتبع حركتك من الكاميرا). الأشكال الخضراء الصغيرة على اليمين مجرد معاينة للحركة <i>الجاية</i>.</p>
                    <p>قفي في مكان تظهرين فيه <b>كاملة</b> للكاميرا. وقت العد التنازلي قفي مرتاحة وذراعيك على جنبك: اللعبة تسجّل وقفتك العادية عشان طولك وحجمك وموضعك ما تأثر على النقاط.</p>
                    <p>قلّدي الراقص مثل المرآة: ذراعك <b>اليمين</b> هي اللي على <b>يمين الشاشة</b>. كل حركة تتقيّم حسب زوايا المفاصل والمواضع والتوقيت. {song.audio === "synth" ? "تقلّدين بعد الراقصين: عندك لين ثانيتين بعد ما يسوون الحركة، والحركة الصحيحة المتأخرة تنحسب. ما يلزم تكونين دقيقة: حتى النسخة التقريبية تاخذ نقاط." : "الحركة الصحيحة تنحسب حتى لو تأخرتي ثانيتين، والتقريبية تاخذ نقاط."}</p>
                  </>
                )
              ) : (
              <>
              {control ? (
                <p><b>How to play (Dance Control):</b> there is <b>no dancer to copy</b>. The character on screen <b>is you</b>: it moves only when you move. The small green figure under <b>Coming up</b> shows the move to do on the next beat. Hit it on the beat to score; standing still scores nothing. Stand where the camera sees your <b>whole body</b>, arms relaxed by your sides during the countdown. Side steps move the character left and right.</p>
              ) : (
              <>
              <p><b>How to play:</b> the <b>two dancers on the sides</b> are the instructors: copy them. The character in the <b>middle is you</b> (it follows your camera). The small green figures at the right are only a preview of the <i>next</i> move.</p>
              <p>Stand where the camera sees your <b>whole body</b>. During the countdown, stand relaxed with your arms by your sides: the game records your neutral stance so body size, height and position never count against you.</p>
              <p>Copy the dancer like a mirror: your <b>right</b> arm is the arm on the <b>right side of the screen</b>. Each move is scored on joint angles, relative positions and timing. {song.audio === "synth" ? "You copy AFTER the dancers: you have up to 2 s after they strike a pose, and a late but correct move still counts. You don't need to be exact: an approximate version of the move scores too." : "A correct move still counts up to 2 s late, and an approximate version scores too."}</p>
              </>
              )}
              </>
              )}
              <button className="btn" disabled={music.instrumental === "rendering" || music.instrumental === "error" || !!music.needsFile} onClick={start}>{tr("START")}</button>
              </div>
              </div>
            </div>
          </div>
        )}
        {phase === "countdown" && count !== null && count > 0 && <div key={count} className="count">{count}</div>}
        {phase === "playing" && count === 0 && <div className="count go">GO!</div>}
        {phase === "paused" && (
          <div className="overlay clear">
            <div className="panel ready">
              <h2>Paused</h2>
              <div className="btn-row">
                <button className="btn" onClick={resume}>Resume</button>
                <button className="btn ghost" onClick={start}>Restart</button>
                <button className="btn ghost" onClick={props.onExit}>Quit</button>
              </div>
            </div>
          </div>
        )}
        {phase === "done" && results && (
          <div className="overlay clear">
            <div className="panel results">
              <h2>{song.title} complete</h2>
              <Stars n={results.stars} />
              <div className="res-top">
                <div><small>SCORE</small><b>{results.score.toLocaleString()}</b></div>
                <div><small>ACCURACY</small><b>{Math.round(results.accuracy)}%</b></div>
                <div><small>MAX COMBO</small><b>x{results.maxCombo}</b></div>
              </div>
              <div className="res-counts">
                {(["PERFECT", "GREAT", "GOOD", "KEEP", "MISS"] as Judgment[]).map((j) => (
                  <span key={j} className={judgeColor[j]}>{j} {results.counts[j]}</span>
                ))}
              </div>
              <div className="res-moves">
                {results.moves.map((r) => (
                  <div key={r.move.id} className="res-m">
                    <span>{r.move.name}</span>
                    <span className={judgeColor[r.judgment ?? "MISS"]}>{r.judgment}</span>
                    <span>{Math.round(r.best * 100)}%</span>
                    <span className="dim">{r.bestDt === null ? "not detected" : `${r.bestDt >= 0 ? "+" : ""}${Math.round(r.bestDt * 1000)} ms`}</span>
                  </div>
                ))}
              </div>
              <div className="btn-row">
                <button className="btn" onClick={() => setPhase("ready")}>Play again</button>
                <button className="btn ghost" onClick={props.onExit}>Menu</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ App */

type Screen = "menu" | "loading" | "error" | "calibrate" | "mirror" | "challenge";

export function App() {
  const box = useStageBox();
  // start downloading the 15 MB dancer model while the player is still in the menu
  useEffect(() => {
    import("./glbDancer.js").then((m) => m.loadDancer()).catch(() => {});
  }, []);
  const engine = useMemo(() => new Engine(), []);
  const [settings, setSettingsState] = useState(loadSettings);
  setLang(settings.lang); // module-level language, read by tr() while rendering
  const [screen, setScreen] = useState("menu" as Screen);
  const [mode, setMode] = useState("challenge" as "mirror" | "challenge" | "control");
  const [loadMsg, setLoadMsg] = useState("");
  const [err, setErr] = useState(null as AppError | null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTV, setShowTV] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [toast, setToast] = useState(null as string | null);
  const toastTimer = useRef(0);

  const setSettings = (s: Settings) => {
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

  const flash = (m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  };

  /* keep the screen awake while a mode is open */
  useEffect(() => {
    if (screen === "menu" || screen === "error") return;
    let lock: any = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if ("wakeLock" in navigator) lock = await (navigator as any).wakeLock.request("screen");
        if (cancelled) lock?.release?.();
      } catch {
        /* not available or denied: harmless */
      }
    };
    acquire();
    const onVis = () => {
      if (!document.hidden) acquire();
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

  const begin = async (m: "mirror" | "challenge" | "control") => {
    setMode(m);
    setErr(null);
    setScreen("loading");
    setLoadMsg("Requesting camera…");
    try {
      // called straight from the tap, so the permission prompt is allowed
      await engine.start(settings.facing, settings.model, setLoadMsg);
      setScreen("calibrate");
    } catch (e) {
      engine.stop();
      setErr(toAppError(e));
      setScreen("error");
    }
  };

  const switchCamera = async (f: Facing) => {
    const prev = settings.facing;
    if (f === prev && engine.getStats().running) return;
    try {
      await engine.switchCamera(f);
      setSettings({ ...settings, facing: f, mirror: f === "user" });
      const note = engine.getStats().cameraNote;
      if (note) flash(note);
    } catch (e) {
      flash(toAppError(e).message);
      try {
        await engine.switchCamera(prev);
      } catch {
        /* original camera also gone: tracking-lost state will show */
      }
    }
  };

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        // Orientation lock only works in fullscreen, and only on browsers that support it (Android Chrome).
        await (window.screen as any).orientation?.lock?.("landscape").catch(() => {});
      }
    } catch {
      flash("Fullscreen isn't available in this browser (on iPhone, use Share → Add to Home Screen).");
    }
  };

  const fatal = (e: any) => {
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

  return (
    <div className="app" dir={settings.lang === "ar" ? "rtl" : "ltr"}>
      <div className={"stage" + (settings.tvMode ? " tv" : "")} style={{ width: box.w, height: box.h, "--u": box.w / 100 + "px" }}>
        {screen === "menu" && <Menu lang={settings.lang} onLang={() => setSettings({ ...settings, lang: settings.lang === "ar" ? "en" : "ar" })} onStart={begin} onSettings={() => setShowSettings(true)} onTV={() => setShowTV(true)} onFullscreen={fullscreen} />}
        {screen === "loading" && <Loading msg={loadMsg} />}
        {screen === "error" && err && <ErrorScreen err={err} onRetry={() => begin(mode)} onBack={goMenu} />}
        {screen === "calibrate" && (
          <Calibration
            engine={engine}
            settings={settings}
            facing={settings.facing}
            onDone={() => setScreen(mode === "mirror" ? "mirror" : "challenge")}
            onBack={goMenu}
            onSwitch={switchCamera}
          />
        )}
        {screen === "mirror" && (
          <MirrorScreen {...common} onMirror={() => setSettings({ ...settings, mirror: !settings.mirror })} />
        )}
        {screen === "challenge" && <ChallengeScreen key={mode} {...common} control={mode === "control"} />}

        {showSettings && (
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            onSwitchCamera={switchCamera}
            cameraActive={screen === "calibrate" || screen === "mirror" || screen === "challenge"}
            onClose={() => setShowSettings(false)}
          />
        )}
        {showTV && <TVPanel settings={settings} onChange={setSettings} onFullscreen={fullscreen} onClose={() => setShowTV(false)} />}
        <Toast msg={toast} />
      </div>
      {box.portrait && (
        <div className="rotate">
          <div className="rotate-ic">⟳</div>
          <div>{tr("Rotate your phone to landscape")}</div>
          <small>{tr("Dance Motion is a landscape game. Unlock screen rotation if nothing happens.")}</small>
        </div>
      )}
    </div>
  );
}
