// Stub for three/addons in the stubbed-three e2e runs: the GLB cannot be loaded, so the game must fall back to the 2D cut-out character.
export class GLTFLoader { load(url, ok, prog, err) { setTimeout(() => err(new Error("stub: no GLB loader")), 0); } }
export function clone(o) { return o; }
