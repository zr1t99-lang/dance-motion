// TEST-ONLY recording stub of the subset of three.js that the game uses.
// It implements the real vector/quaternion/matrix maths so avatar placement can be checked for NaNs,
// but draws nothing. The real 3D look can only be judged on a device with real three.js.
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  divideScalar(s) { return this.multiplyScalar(1 / s); }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { return this.divideScalar(this.length() || 1); }
  crossVectors(a, b) {
    const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
    this.x = x; this.y = y; this.z = z; return this;
  }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
}
export class Matrix4 {
  constructor() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  identity() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; return this; }
  makeBasis(x, y, z) {
    this.elements = [x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1];
    return this;
  }
}
export class Quaternion {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
  identity() { this.x = this.y = this.z = 0; this.w = 1; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  setFromUnitVectors(a, b) {
    let r = a.dot(b) + 1;
    if (r < 1e-6) {
      r = 0;
      if (Math.abs(a.x) > Math.abs(a.z)) { this.x = -a.y; this.y = a.x; this.z = 0; } else { this.x = 0; this.y = -a.z; this.z = a.y; }
    } else { this.x = a.y * b.z - a.z * b.y; this.y = a.z * b.x - a.x * b.z; this.z = a.x * b.y - a.y * b.x; }
    this.w = r;
    const l = Math.hypot(this.x, this.y, this.z, this.w) || 1;
    this.x /= l; this.y /= l; this.z /= l; this.w /= l;
    return this;
  }
  setFromRotationMatrix(m) {
    const e = m.elements, m11 = e[0], m12 = e[4], m13 = e[8], m21 = e[1], m22 = e[5], m23 = e[9], m31 = e[2], m32 = e[6], m33 = e[10];
    const tr = m11 + m22 + m33;
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); this.w = 0.25 / s; this.x = (m32 - m23) * s; this.y = (m13 - m31) * s; this.z = (m21 - m12) * s; }
    else if (m11 > m22 && m11 > m33) { const s = 2 * Math.sqrt(1 + m11 - m22 - m33); this.w = (m32 - m23) / s; this.x = 0.25 * s; this.y = (m12 + m21) / s; this.z = (m13 + m31) / s; }
    else if (m22 > m33) { const s = 2 * Math.sqrt(1 + m22 - m11 - m33); this.w = (m13 - m31) / s; this.x = (m12 + m21) / s; this.y = 0.25 * s; this.z = (m23 + m32) / s; }
    else { const s = 2 * Math.sqrt(1 + m33 - m11 - m22); this.w = (m21 - m12) / s; this.x = (m13 + m31) / s; this.y = (m23 + m32) / s; this.z = 0.25 * s; }
    return this;
  }
}
class Object3D {
  constructor() { this.children = []; this.position = new Vector3(); this.scale = new Vector3(1, 1, 1); this.quaternion = new Quaternion(); this.rotation = { x: 0, y: 0, z: 0 }; this.visible = true; this.renderOrder = 0; }
  add(...o) { this.children.push(...o); return this; }
  remove(o) { this.children = this.children.filter((c) => c !== o); }
  traverse(fn) { fn(this); this.children.forEach((c) => c.traverse(fn)); }
  lookAt() {}
}
export class Group extends Object3D {}
export class Scene extends Object3D {}
export class Mesh extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; } }
export class PerspectiveCamera extends Object3D { constructor(fov) { super(); this.fov = fov; this.aspect = 1; } updateProjectionMatrix() {} }
class Geo { constructor(...a) { this.args = a; } dispose() { window.__disposed = (window.__disposed || 0) + 1; } }
export class CylinderGeometry extends Geo {} export class SphereGeometry extends Geo {} export class BoxGeometry extends Geo {}
export class PlaneGeometry extends Geo {} export class TorusGeometry extends Geo {} export class CircleGeometry extends Geo {}
class Mat { constructor(o = {}) { Object.assign(this, o); if (typeof o.color === 'number') this.color = { set() {} }; if (o.emissive !== undefined) this.emissive = { set() {} }; } dispose() { window.__disposed = (window.__disposed || 0) + 1; } }
export class MeshStandardMaterial extends Mat {} export class MeshBasicMaterial extends Mat {}
export class CanvasTexture { constructor(c) { this.image = c; this.repeat = { set() {} }; } dispose() { window.__disposed = (window.__disposed || 0) + 1; } }
export class HemisphereLight extends Object3D {} export class DirectionalLight extends Object3D {}
export class Color {}
export const BackSide = 1, AdditiveBlending = 2, RepeatWrapping = 3, SRGBColorSpace = "srgb";

export class WebGLRenderer {
  constructor(o) { this.canvas = o.canvas; window.__rendererCreated = (window.__rendererCreated || 0) + 1; window.__rendererLive = (window.__rendererLive || 0) + 1; this.live = true; }
  setClearColor() {} setPixelRatio() {} setSize() {}
  render(scene) {
    window.__renders = (window.__renders || 0) + 1;
    let nan = 0, hash = 0, meshes = 0;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      for (const v of [o.position.x, o.position.y, o.position.z, o.scale.x, o.scale.y, o.scale.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w])
        if (Number.isNaN(v)) nan++;
      hash += o.position.x * 3.1 + o.position.y * 5.7 + o.position.z * 7.3 + o.scale.y;
    });
    window.__nan = Math.max(window.__nan || 0, nan);
    window.__meshes = meshes;
    window.__sceneHash = hash;
    window.__scene = scene;
  }
  dispose() { this.live = false; window.__rendererLive--; }
  forceContextLoss() {}
}
