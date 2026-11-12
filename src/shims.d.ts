// Minimal type shims. React, Three.js and MediaPipe are loaded from CDNs through the
// import map in index.html, so their @types packages are not installed here.
// (Run `npm i -D @types/react @types/react-dom @types/three` and delete this file to get full typing.)

declare module "react" {
  export function useState<T>(init: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void];
  export function useRef<T>(init: T): { current: T };
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
  export type ReactNode = any;
  export type CSSProperties = Record<string, any>;
}
declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
declare module "react-dom/client" {
  export function createRoot(el: Element): { render(node: any): void; unmount(): void };
}
declare module "@mediapipe/tasks-vision" {
  export const FilesetResolver: any;
  export const PoseLandmarker: any;
}
declare module "three" {
  export const WebGLRenderer: any;
  export const Scene: any;
  export const PerspectiveCamera: any;
  export const Group: any;
  export const Mesh: any;
  export const CylinderGeometry: any;
  export const SphereGeometry: any;
  export const BoxGeometry: any;
  export const PlaneGeometry: any;
  export const TorusGeometry: any;
  export const CircleGeometry: any;
  export const MeshStandardMaterial: any;
  export const MeshBasicMaterial: any;
  export const Vector3: any;
  export const Quaternion: any;
  export const Matrix4: any;
  export const Color: any;
  export const CanvasTexture: any;
  export const HemisphereLight: any;
  export const DirectionalLight: any;
  export const BackSide: any;
  export const AdditiveBlending: any;
  export const RepeatWrapping: any;
  export const SRGBColorSpace: any;
}
declare namespace JSX {
  type Element = any;
  interface IntrinsicElements {
    [name: string]: any;
  }
  interface IntrinsicAttributes {
    key?: any;
  }
  interface ElementChildrenAttribute {
    children: {};
  }
}
