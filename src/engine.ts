import { openCamera, stopStream, type OpenedCamera } from "./camera.js";
import { PoseTracker, type ModelVariant } from "./tracker.js";
import { PoseSmoother } from "./smoothing.js";
import { meanMainVisibility, visibleMainCount } from "./poseMath.js";
import type { Facing, Pose } from "./types.js";

export interface FrameData {
  /** performance.now() (ms) when the inference result was produced. */
  t: number;
  /** Smoothed normalised landmarks, or null when nothing was detected. */
  pose: Pose | null;
  /** Smoothed metric 3D landmarks (hip-centred), or null. */
  world: Pose | null;
  aspect: number;
  /** Main body landmarks (of 12) with visibility >= 0.5. */
  visibleCount: number;
  /** Mean visibility of the 12 main landmarks (0..1). */
  confidence: number;
  /** True when enough of the body is visible to drive the avatar. */
  valid: boolean;
  seq: number;
}

export interface EngineStats {
  /** Frames presented by the camera per second (measured), or null if the browser can't tell. */
  cameraFps: number | null;
  /** Completed pose inferences per second (measured). */
  poseFps: number;
  /** Duration of the last pose inference (measured with performance.now). */
  inferMs: number | null;
  /** Camera-capture → result time. Only available when the browser exposes the frame capture time. */
  latencyMs: number | null;
  videoW: number;
  videoH: number;
  facingRequested: Facing;
  facingActual: string | undefined;
  cameraLabel: string;
  cameraNote?: string;
  delegate: string | null;
  model: string | null;
  running: boolean;
}

/** Fewer visible main landmarks than this => the pose is not used to drive the avatar. */
export const MIN_VISIBLE_FOR_AVATAR = 8;
/** No valid pose for this long => TRACKING LOST. */
export const LOST_AFTER_MS = 350;

type Listener = (f: FrameData) => void;

const RESPONSE = {
  smooth: { minCutoff: 1.2, beta: 4 },
  balanced: { minCutoff: 2.0, beta: 9 },
  fast: { minCutoff: 3.5, beta: 20 },
};

/**
 * Owns camera + MediaPipe model + the inference loop. Everything here is real: if the camera or
 * model cannot start, start() rejects and nothing is simulated.
 */
export class Engine {
  readonly video: HTMLVideoElement;
  readonly tracker = new PoseTracker();
  latest: FrameData | null = null;
  lastValidAt = 0;
  maxFps = 30;
  private cam: OpenedCamera | null = null;
  private smoother = new PoseSmoother(RESPONSE.balanced);
  private smootherW = new PoseSmoother(RESPONSE.balanced);
  private listeners = new Set<Listener>();
  private running = false;
  private vfcHandle = 0;
  private rafHandle = 0;
  private lastVideoTime = -1;
  private lastInferAt = 0;
  private lastTs = 0;
  private seq = 0;
  private lastMeta: any = null;
  // stats windows
  private winStart = performance.now();
  private camFrames0: number | null = null;
  private camFrames = 0;
  private poseCount = 0;
  private stats: EngineStats;
  private inferMs: number | null = null;
  private latencyMs: number | null = null;
  private noPoseSince = 0;

  constructor() {
    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.muted = true;
    v.autoplay = true;
    this.video = v;
    this.stats = {
      cameraFps: null, poseFps: 0, inferMs: null, latencyMs: null, videoW: 0, videoH: 0,
      facingRequested: "user", facingActual: undefined, cameraLabel: "", delegate: null, model: null, running: false,
    };
  }

  /** Smooth = steadier but laggier; Fast = follows quick dance moves with minimal lag (a bit more jitter). */
  setResponsiveness(r: "smooth" | "balanced" | "fast") {
    const p = RESPONSE[r];
    this.smoother.setParams(p);
    this.smootherW.setParams(p);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getStats(): EngineStats {
    return { ...this.stats, running: this.running, delegate: this.tracker.delegate, model: this.tracker.variant };
  }

  /** True when no usable pose has been seen recently. */
  trackingLost(now = performance.now()): boolean {
    return now - this.lastValidAt > LOST_AFTER_MS;
  }

  /** Start camera first (so the permission prompt appears right after the tap), then load the model. */
  async start(facing: Facing, variant: ModelVariant, onStatus?: (m: string) => void) {
    onStatus?.("Requesting camera…");
    await this.attachCamera(facing);
    await this.tracker.init(variant, onStatus);
    this.startLoop();
  }

  async attachCamera(facing: Facing) {
    this.stopLoop();
    this.releaseCamera();
    const cam = await openCamera(facing);
    this.cam = cam;
    this.video.srcObject = cam.stream;
    try {
      await this.video.play();
    } catch (e: any) {
      stopStream(cam.stream);
      this.cam = null;
      throw new Error("The camera stream could not be played: " + (e?.message ?? e));
    }
    this.stats.facingRequested = facing;
    this.stats.facingActual = cam.actualFacing;
    this.stats.cameraLabel = cam.label;
    this.stats.cameraNote = cam.note;
    this.resetTracking();
  }

  /** Swap front/back camera without reloading the model. */
  async switchCamera(facing: Facing) {
    const wasRunning = this.running;
    await this.attachCamera(facing);
    if (wasRunning || this.tracker.ready) this.startLoop();
  }

  private resetTracking() {
    this.smoother.reset();
    this.smootherW.reset();
    this.latest = null;
    this.lastValidAt = 0;
    this.lastVideoTime = -1;
    this.noPoseSince = 0;
  }

  private releaseCamera() {
    if (this.cam) stopStream(this.cam.stream);
    this.cam = null;
    this.video.srcObject = null;
  }

  startLoop() {
    if (this.running) return;
    this.running = true;
    this.winStart = performance.now();
    this.camFrames0 = null;
    this.camFrames = 0;
    this.poseCount = 0;
    this.schedule();
  }

  stopLoop() {
    this.running = false;
    const v: any = this.video;
    if (this.vfcHandle && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(this.vfcHandle);
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.vfcHandle = 0;
    this.rafHandle = 0;
  }

  /** Stop camera + loop (keeps the loaded model so re-entering a mode is fast). */
  stop() {
    this.stopLoop();
    this.releaseCamera();
    this.resetTracking();
  }

  dispose() {
    this.stop();
    this.tracker.close();
    this.listeners.clear();
  }

  private schedule() {
    const v: any = this.video;
    if (typeof v.requestVideoFrameCallback === "function") {
      this.vfcHandle = v.requestVideoFrameCallback((_now: number, meta: any) => this.tick(meta));
    } else {
      this.rafHandle = requestAnimationFrame(() => this.tick(null));
    }
  }

  private tick(meta: any) {
    if (!this.running) return;
    this.schedule();
    const v = this.video;
    if (v.readyState < 2 || v.videoWidth === 0) return;

    // Camera FPS: count frames actually presented by the camera pipeline.
    const presented: number | null = meta && typeof meta.presentedFrames === "number" ? meta.presentedFrames : null;
    if (presented !== null) {
      const base: number = this.camFrames0 ?? presented;
      this.camFrames0 = base;
      this.camFrames = presented - base;
      this.lastMeta = meta;
    } else if (v.currentTime !== this.lastVideoTime) {
      this.camFrames++;
    }
    const nowMs = performance.now();
    if (nowMs - this.winStart >= 1000) {
      const dt = (nowMs - this.winStart) / 1000;
      this.stats.cameraFps = this.camFrames > 0 ? this.camFrames / dt : null;
      this.stats.poseFps = this.poseCount / dt;
      this.winStart = nowMs;
      this.camFrames = 0;
      this.poseCount = 0;
      this.camFrames0 = presented;
    }

    if (v.currentTime === this.lastVideoTime) return; // no new camera frame yet
    if (nowMs - this.lastInferAt < 1000 / this.maxFps - 1) return; // inference cap (mobile battery / heat)
    this.lastVideoTime = v.currentTime;
    this.lastInferAt = nowMs;

    let ts = nowMs;
    if (ts <= this.lastTs) ts = this.lastTs + 0.01; // MediaPipe needs strictly increasing timestamps
    this.lastTs = ts;

    let res;
    const t0 = performance.now();
    try {
      res = this.tracker.detect(v, ts);
    } catch (e) {
      console.error("Pose inference failed", e);
      return;
    }
    const t1 = performance.now();
    this.inferMs = t1 - t0;
    this.stats.inferMs = this.inferMs;
    this.poseCount++;
    // Capture→result latency is only reported if the browser tells us when the frame was captured.
    const cap = this.lastMeta?.captureTime;
    this.stats.latencyMs = typeof cap === "number" ? t1 - cap : null;
    this.stats.videoW = v.videoWidth;
    this.stats.videoH = v.videoHeight;

    const aspect = v.videoWidth / v.videoHeight;
    let frame: FrameData;
    if (res.landmarks) {
      const visibleCount = visibleMainCount(res.landmarks);
      const confidence = meanMainVisibility(res.landmarks);
      const valid = visibleCount >= MIN_VISIBLE_FOR_AVATAR;
      const sec = t1 / 1000;
      // Restart the filters after a gap so stale positions never blend into a returning body.
      if (this.noPoseSince && t1 - this.noPoseSince > 500) {
        this.smoother.reset();
        this.smootherW.reset();
      }
      this.noPoseSince = 0;
      const pose = this.smoother.apply(res.landmarks, sec);
      const world = res.world ? this.smootherW.apply(res.world, sec) : null;
      if (valid) this.lastValidAt = t1;
      frame = { t: t1, pose, world, aspect, visibleCount, confidence, valid, seq: ++this.seq };
    } else {
      if (!this.noPoseSince) this.noPoseSince = t1;
      frame = { t: t1, pose: null, world: null, aspect, visibleCount: 0, confidence: 0, valid: false, seq: ++this.seq };
    }
    this.latest = frame;
    for (const fn of this.listeners) fn(frame);
  }
}
