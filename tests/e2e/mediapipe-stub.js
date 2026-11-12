// TEST-ONLY stand-in for @mediapipe/tasks-vision. It does NOT look at the camera image: it returns
// poses scripted by the test page (window.__synth). It exists only so the real Engine loop, UI flow
// and scorer can be exercised offline. The shipped game never contains this file.
import { buildRefPose, NEUTRAL, Choreography } from "/dist/choreography.js";

const choreo = new Choreography();
const empty = () => Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));

function toCamera(ref, scale = 0.17, cx = 0.5, cy = 0.45, aspect = 4 / 3) {
  return ref.map((l) => ({ x: (l.x * scale) / aspect + cx, y: l.y * scale + cy, z: 0, visibility: l.visibility ? 0.95 : 0 }));
}
function toWorld(ref) {
  // metres, hip-centred, y DOWN (what MediaPipe reports)
  const hx = (ref[23].x + ref[24].x) / 2, hy = (ref[23].y + ref[24].y) / 2;
  return ref.map((l) => ({ x: (l.x - hx) * 0.5, y: (l.y - hy) * 0.5, z: 0, visibility: l.visibility ? 0.95 : 0 }));
}

export const FilesetResolver = { forVisionTasks: async () => ({}) };
export const PoseLandmarker = {
  createFromOptions: async (_fs, opts) => {
    window.__landmarkerOpts = { delegate: opts.baseOptions.delegate, model: opts.baseOptions.modelAssetPath };
    window.__landmarkerClosed = false;
    return {
      close() { window.__landmarkerClosed = true; },
      detectForVideo(video, ts) {
        window.__detectCalls = (window.__detectCalls || 0) + 1;
        const s = window.__synth || { mode: "none" };
        if (s.mode === "none") return { landmarks: [], worldLandmarks: [] };
        const now = performance.now();
        let spec;
        if (s.mode === "neutral") spec = NEUTRAL;
        else {
          const t = (now - s.t0) / 1000 - (s.lag || 0); // follow the instructor with a small lag
          spec = choreo.specAt(Math.max(0, t));
        }
        const ref = buildRefPose(spec);
        const noise = s.noise || 0;
        const lm = toCamera(ref).map((l) => ({ ...l, x: l.x + (Math.sin(ts * 0.37 + l.y * 91) * noise), y: l.y + (Math.cos(ts * 0.29 + l.x * 77) * noise) }));
        return { landmarks: [lm], worldLandmarks: [toWorld(ref)] };
      },
    };
  },
};
