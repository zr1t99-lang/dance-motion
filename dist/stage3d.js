import * as THREE from "three";
import { Avatar } from "./avatar3d.js";
export class StageError extends Error {
}
function lcg(seed) {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
/**
 * Neon dance-stage scene: arch, skyline, glossy grid floor, and one Avatar in the centre.
 * Rendering is capped to a modest pixel ratio and uses no shadows to stay light on phones.
 */
export class Stage3D {
    canvas;
    avatar;
    /** Instructor avatars flanking the player (empty in Motion Mirror). */
    dancers = [];
    /** Called every render frame before drawing: (dtSeconds, rAF timestamp ms). */
    onFrame = null;
    /** Called after each render (used by the 2D cut-out overlay). */
    postFrame = null;
    /** Set by the game while the player's pose is not being tracked (the 2D player is then hidden). */
    playerHidden = false;
    /** Hide the 3D avatars (the 2D cut-out characters are drawn instead). */
    setCutoutMode(on) {
        for (const a of [this.avatar, ...this.dancers])
            a.hideMesh(on);
    }
    /** Project scene metres (x,y at z=0) to canvas CSS pixels, plus pixels-per-metre there. */
    project(x, y, w, h) {
        const cam = this.camera;
        const cy = 1.1, cz = cam.position.z;
        const fy = -0.1, fz = -cz, fl = Math.hypot(fy, fz);
        const f = [0, fy / fl, fz / fl];
        const up = [0, -f[2], f[1]];
        const dy = y - cy, dz = -cz;
        const depth = dy * f[1] + dz * f[2];
        const yu = dy * up[1] + dz * up[2];
        const t = Math.tan((cam.fov * Math.PI) / 360);
        const ppm = h / 2 / (depth * t);
        return { px: w / 2 + x * ppm, py: h / 2 - yu * ppm, ppm };
    }
    renderer;
    scene = new THREE.Scene();
    camera;
    raf = 0;
    last = 0;
    ro;
    arch;
    glow;
    disposed = false;
    textures = [];
    constructor(canvas, opts) {
        this.canvas = canvas;
        try {
            this.renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: opts.antialias,
                alpha: true,
                powerPreference: "high-performance",
            });
        }
        catch (e) {
            throw new StageError("WebGL is not available in this browser, so the 3D stage cannot be drawn. " + (e?.message ?? ""));
        }
        const r = this.renderer;
        r.setClearColor(0x000000, 0);
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio));
        r.outputColorSpace = THREE.SRGBColorSpace;
        this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 60);
        this.camera.position.set(0, 1.1, opts.dancers?.length ? 6.1 : 5.0);
        this.camera.lookAt(0, 1.0, 0);
        this.buildEnvironment();
        // lights
        this.scene.add(new THREE.HemisphereLight(0xcfa8ff, 0x1a0a40, 1.15));
        const pink = new THREE.DirectionalLight(0xff55cc, 1.5);
        pink.position.set(-2.5, 3, 3);
        const blue = new THREE.DirectionalLight(0x33ccff, 1.2);
        blue.position.set(3, 2, 2.5);
        this.scene.add(pink, blue);
        this.avatar = new Avatar(opts.style, opts.reflection);
        this.scene.add(this.avatar.group);
        if (this.avatar.reflection)
            this.scene.add(this.avatar.reflection);
        if (opts.dancers?.length) {
            const n = opts.dancers.length;
            opts.dancers.forEach((st, i) => {
                const d = new Avatar(st, opts.reflection);
                d.place(n === 1 ? 0 : (i === 0 ? -1 : 1) * 1.45, 0.88);
                this.scene.add(d.group);
                if (d.reflection)
                    this.scene.add(d.reflection);
                this.dancers.push(d);
            });
            this.avatar.setLateralLimit(0.35);
        }
        this.ro = new ResizeObserver(() => this.resize());
        this.ro.observe(canvas);
        this.resize();
    }
    tex(t) {
        this.textures.push(t);
        return t;
    }
    buildEnvironment() {
        const scene = this.scene;
        // Floor: neon grid, slightly transparent so the reflection shows through.
        const gridTex = this.tex(canvasTex(512, 512, (c) => {
            c.fillStyle = "#12063a";
            c.fillRect(0, 0, 512, 512);
            const g = c.createLinearGradient(0, 0, 512, 512);
            g.addColorStop(0, "#ff3df2");
            g.addColorStop(1, "#2dd7ff");
            c.strokeStyle = g;
            c.lineWidth = 3;
            for (let i = 0; i <= 512; i += 64) {
                c.beginPath();
                c.moveTo(i, 0);
                c.lineTo(i, 512);
                c.stroke();
                c.beginPath();
                c.moveTo(0, i);
                c.lineTo(512, i);
                c.stroke();
            }
        }));
        gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
        gridTex.repeat.set(7, 5);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, opacity: 0.8, depthWrite: false }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, -1.5);
        floor.renderOrder = 1;
        scene.add(floor);
        // Pink spot glow under the dancer
        const glowTex = this.tex(canvasTex(256, 256, (c) => {
            const g = c.createRadialGradient(128, 128, 4, 128, 128, 128);
            g.addColorStop(0, "rgba(255,90,240,0.95)");
            g.addColorStop(0.5, "rgba(140,60,255,0.35)");
            g.addColorStop(1, "rgba(60,20,200,0)");
            c.fillStyle = g;
            c.fillRect(0, 0, 256, 256);
        }));
        this.glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.glow.rotation.x = -Math.PI / 2;
        this.glow.position.set(0, 0.012, 0);
        this.glow.renderOrder = 2;
        scene.add(this.glow);
        // Neon arch
        this.arch = new THREE.Group();
        const ring = (radius, tube, color, opacity = 1) => {
            const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 72, Math.PI), new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }));
            this.arch.add(m);
        };
        ring(2.75, 0.045, 0x4de3ff);
        ring(2.55, 0.025, 0xff5cf2);
        ring(2.8, 0.12, 0x4de3ff, 0.12);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(2.5, 48, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3a46ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.arch.add(disc);
        this.arch.position.set(0, 0, -2.6);
        scene.add(this.arch);
        // Skyline (deterministic pseudo-random so it is identical every run)
        const winTex = this.tex(canvasTex(64, 128, (c) => {
            c.fillStyle = "#170a45";
            c.fillRect(0, 0, 64, 128);
            const rnd = lcg(7);
            for (let y = 6; y < 124; y += 10)
                for (let x = 6; x < 60; x += 10) {
                    c.fillStyle = rnd() > 0.35 ? "#ffffff" : "#2b1670";
                    c.fillRect(x, y, 6, 6);
                }
        }));
        const rnd = lcg(42);
        const tints = [0x39e5ff, 0xff4fd8, 0x9b5cff, 0x4d7bff];
        for (let i = 0; i < 18; i++) {
            const w = 0.4 + rnd() * 0.4;
            const h = 0.9 + rnd() * 1.9;
            const x = -5 + (i / 17) * 10 + (rnd() - 0.5) * 0.3;
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), new THREE.MeshBasicMaterial({ map: winTex, color: tints[i % tints.length] }));
            m.position.set(x, h / 2, -4.2 - rnd() * 0.5);
            scene.add(m);
        }
    }
    resize() {
        if (this.disposed)
            return;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        if (!w || !h)
            return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        // Keep the whole body (feet to raised hands) in view even on narrower-than-16:9 windows.
        this.camera.fov = w / h < 16 / 9 ? 30 * (16 / 9 / (w / h)) ** 0.9 : 30;
        this.camera.updateProjectionMatrix();
    }
    /** Subtle beat pulse on the arch. */
    pulse(amount) {
        const s = 1 + 0.018 * amount;
        this.arch.scale.set(s, s, 1);
    }
    start() {
        if (this.raf || this.disposed)
            return;
        this.last = performance.now();
        const loop = (now) => {
            if (this.disposed)
                return;
            this.raf = requestAnimationFrame(loop);
            const dt = Math.min(0.1, (now - this.last) / 1000);
            this.last = now;
            this.onFrame?.(dt, now);
            this.renderer.render(this.scene, this.camera);
            this.postFrame?.();
        };
        this.raf = requestAnimationFrame(loop);
    }
    dispose() {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.ro.disconnect();
        this.avatar.dispose();
        this.dancers.forEach((d) => d.dispose());
        this.scene.traverse((o) => {
            o.geometry?.dispose?.();
            const m = o.material;
            if (m)
                (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.());
        });
        this.textures.forEach((t) => t.dispose?.());
        this.renderer.dispose();
        this.renderer.forceContextLoss?.();
    }
}
