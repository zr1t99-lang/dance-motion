import { POSE_LANDMARK_COUNT, type Pose } from "./types.js";

// Pinned versions. The wasm runtime and the model are fetched from public CDNs at start-up
// (internet required). If either cannot be loaded, init() throws a TrackerError: tracking is never faked.
const TASKS_VERSION = "0.10.14";
export const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
export const MODEL_URLS = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
} as const;
export type ModelVariant = keyof typeof MODEL_URLS;

export class TrackerError extends Error {
  constructor(
    message: string,
    public detail?: string,
  ) {
    super(message);
    this.name = "TrackerError";
  }
}

export interface DetectResult {
  /** Normalised image landmarks (x right, y down, 0..1). */
  landmarks: Pose | null;
  /** Metric 3D landmarks, hip-centred (metres). */
  world: Pose | null;
}

function toPose(src: any[] | undefined): Pose | null {
  if (!src || src.length < POSE_LANDMARK_COUNT) return null;
  // Copy: MediaPipe may reuse its result buffers on the next call.
  return src.slice(0, POSE_LANDMARK_COUNT).map((l: any) => ({
    x: l.x,
    y: l.y,
    z: l.z ?? 0,
    visibility: l.visibility ?? 0,
  }));
}

export class PoseTracker {
  private lm: any = null;
  delegate: "GPU" | "CPU" | null = null;
  variant: ModelVariant | null = null;

  get ready() {
    return !!this.lm;
  }

  async init(variant: ModelVariant, onStatus?: (msg: string) => void) {
    if (this.lm && this.variant === variant) return;
    this.close();
    onStatus?.("Loading pose-tracking library…");
    let vision: any;
    try {
      vision = await import("@mediapipe/tasks-vision");
    } catch (e: any) {
      throw new TrackerError(
        "Could not load the MediaPipe pose library. Check your internet connection (it is downloaded from cdn.jsdelivr.net).",
        String(e?.message ?? e),
      );
    }
    let fileset: any;
    try {
      onStatus?.("Loading pose-tracking runtime (WASM)…");
      fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    } catch (e: any) {
      throw new TrackerError("Could not load the pose-tracking WASM runtime.", String(e?.message ?? e));
    }
    const make = (delegate: "GPU" | "CPU") =>
      vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URLS[variant], delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
    onStatus?.(`Loading ${variant} pose model…`);
    try {
      this.lm = await make("GPU");
      this.delegate = "GPU";
    } catch (gpuErr: any) {
      try {
        onStatus?.("GPU unavailable, using CPU…");
        this.lm = await make("CPU");
        this.delegate = "CPU";
      } catch (cpuErr: any) {
        throw new TrackerError(
          "Could not load the pose model. Check your internet connection (the model is downloaded from storage.googleapis.com).",
          `GPU: ${gpuErr?.message ?? gpuErr} | CPU: ${cpuErr?.message ?? cpuErr}`,
        );
      }
    }
    this.variant = variant;
  }

  /** Synchronous inference on the current video frame. `tsMs` must increase on every call. */
  detect(video: HTMLVideoElement, tsMs: number): DetectResult {
    if (!this.lm) return { landmarks: null, world: null };
    const res = this.lm.detectForVideo(video, tsMs);
    return { landmarks: toPose(res?.landmarks?.[0]), world: toPose(res?.worldLandmarks?.[0]) };
  }

  close() {
    try {
      this.lm?.close?.();
    } catch {
      /* ignore */
    }
    this.lm = null;
    this.delegate = null;
    this.variant = null;
  }
}
