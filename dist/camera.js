export class CameraError extends Error {
    code;
    detail;
    constructor(code, message, detail) {
        super(message);
        this.code = code;
        this.detail = detail;
        this.name = "CameraError";
    }
}
function mapError(e) {
    const name = e?.name ?? "";
    const detail = `${name}${e?.message ? ": " + e.message : ""}`;
    if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError")
        return new CameraError("denied", "Camera permission was denied. Allow camera access for this site in your browser settings, then try again.", detail);
    if (name === "NotFoundError" || name === "DevicesNotFoundError")
        return new CameraError("notfound", "No camera was found on this device.", detail);
    if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError")
        return new CameraError("busy", "The camera is in use by another app or could not be started.", detail);
    return new CameraError("unknown", "The camera could not be started.", detail);
}
/**
 * Opens a camera. Must be called from a user gesture handler (a tap) and needs HTTPS or localhost.
 * Uses a modest 640x480 @30 request: the pose model works on a ~256 px input, so higher
 * resolutions only cost CPU/battery.
 */
export async function openCamera(facing) {
    if (!window.isSecureContext)
        throw new CameraError("insecure", "Camera access needs a secure page. Open this game over HTTPS (or http://localhost).");
    if (!navigator.mediaDevices?.getUserMedia)
        throw new CameraError("unsupported", "This browser does not support camera access (getUserMedia).");
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
        });
    }
    catch (e) {
        if (e?.name === "OverconstrainedError" || e?.name === "ConstraintNotSatisfiedError") {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
            }
            catch (e2) {
                throw mapError(e2);
            }
        }
        else
            throw mapError(e);
    }
    const track = stream.getVideoTracks()[0];
    const s = track.getSettings();
    let note;
    if (facing === "environment" && s.facingMode !== "environment")
        note = "No rear camera was reported by this device/browser, so the available camera is being used instead.";
    if (facing === "user" && s.facingMode === "environment")
        note = "The browser gave the rear camera instead of the front camera.";
    return {
        stream,
        requested: facing,
        actualFacing: s.facingMode,
        label: track.label || "camera",
        width: s.width ?? 0,
        height: s.height ?? 0,
        frameRate: s.frameRate,
        note,
    };
}
export function stopStream(stream) {
    stream?.getTracks().forEach((t) => t.stop());
}
