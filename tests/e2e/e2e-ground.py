"""
The player's character must stand like a balanced person: on the floor (never flying), the supporting foot planted
(no skating while the body sways or a foot kicks), travelling sideways only when the player really steps.
REAL three.js + the REAL GLB dancer in headless Chrome; MediaPipe stubbed with a scripted *physical* player
(image landmarks and world landmarks built from the same metre-space skeleton).
    THREE_DIR=/path/to/three.js python3 tests/e2e/e2e-ground.py
Not real pose-estimation noise, not a real phone.
"""
import os, sys, time, json, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
import e2e
THREE = Path(os.environ.get("THREE_DIR", ""))
if not (THREE / "build" / "three.module.js").exists():
    print("SKIP: set THREE_DIR to a three.js r170 checkout"); sys.exit(0)
ROOT, OUT, PORT = e2e.ROOT, e2e.OUT, 8785
res = []
def check(n, c, extra=""):
    res.append(bool(c)); print(("  PASS  " if c else "  FAIL  ") + n + (f"   [{extra}]" if extra else ""), flush=True)
server = subprocess.Popen(["node", str(ROOT / "serve.mjs"), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)

# physical player: metre-space skeleton (x right, y down) built from the neutral reference; scenario(t) -> per-joint offsets
SETUP = """async () => {
  const { buildRefPose, NEUTRAL } = await import('/dist/choreography.js');
  const ref0 = buildRefPose(NEUTRAL), A = 4 / 3, M = 0.5; // 1 reference unit = 0.5 m
  window.__sc = { name: 'stand' };
  const FEET = [27, 28, 29, 30, 31, 32], KNEES = [25, 26];
  window.__synthFn = (now) => {
    const sc = window.__sc, t = sc.freeze !== undefined ? sc.freeze : (now - (window.__t0 || now)) / 1000;
    const ref = ref0;
    const X = ref.map((l) => l.x * M), Y = ref.map((l) => l.y * M);
    const Z = ref.map(() => 0);
    let hipDx = 0, liftImg = 0;
    if (sc.name === 'sway') hipDx = 0.06 * Math.sin(t * 2.2);                 // body sways, FEET STAY
    if (sc.name === 'step') { hipDx = Math.min(sc.d, Math.max(0, (t - 0.5) * sc.d)); }   // whole body (feet too) travels
    if (sc.name === 'imgrise') liftImg = Math.min(1, t / 0.4) * 0.07;          // feet drift UP in the picture only
    for (let i = 0; i < 33; i++) {
      let dx = hipDx;
      if (sc.name === 'sway' && FEET.includes(i)) dx = 0; else if (sc.name === 'sway' && KNEES.includes(i)) dx = hipDx / 2;
      X[i] += dx;
    }
    if (sc.name === 'kick') {                                                    // left leg (screen-left landmark 27) swings out and up; right foot planted
      const ph = Math.max(0, Math.sin(t * 2.0));
      X[27] += 0.4 * ph * ph; Y[27] -= 0.28 * ph; X[29] += 0.4 * ph * ph; Y[29] -= 0.28 * ph; X[31] += 0.4 * ph * ph; Y[31] -= 0.28 * ph; X[25] += 0.2 * ph * ph; Y[25] -= 0.1 * ph;
    }
    if (sc.name === 'squat') {                                                   // real 3D squat: hips drop, knees go forward (toward the camera), ankles stay on the floor
      const drop = 0.17 * (0.5 - 0.5 * Math.cos(t * 2.5));
      const ank = [Y[27], Y[28]];
      for (let i = 0; i < 33; i++) if (![27, 28, 29, 30, 31, 32].includes(i)) Y[i] += drop;
      for (const [h, k, a] of [[23, 25, 27], [24, 26, 28]]) {
        const dx = X[a] - X[h], dy = ank[a === 27 ? 0 : 1] - Y[h], d = Math.hypot(dx, dy), la = 0.475, lb = 0.45;
        const along = (la * la - lb * lb + d * d) / (2 * d), perp = Math.sqrt(Math.max(0, la * la - along * along));
        X[k] = X[h] + dx / d * along; Y[k] = Y[h] + dy / d * along; Z[k] = -perp;
      }
    }
    const hx = (X[23] + X[24]) / 2, hy = (Y[23] + Y[24]) / 2;
    const lm = X.map((x, i) => ({ x: 0.5 + (x / M) * 0.17 / A, y: (Y[i] / M) * 0.17 + 0.45 - (FEET.includes(i) || KNEES.includes(i) ? liftImg * (FEET.includes(i) ? 1 : 0.5) : 0), z: 0, visibility: ref[i].visibility ? 0.95 : 0 }));
    const wl = X.map((x, i) => ({ x: x - hx, y: Y[i] - hy, z: Z[i], visibility: ref[i].visibility ? 0.95 : 0 }));
    return { landmarks: [lm], worldLandmarks: [wl] };
  };
}"""
RUN = """async ([name, extra, ms]) => {
  window.__sc = Object.assign({ name }, extra); window.__t0 = performance.now();
  const s = window.__dm.stage, a = s.avatar, out = [];
  const t0 = performance.now();
  await new Promise((res) => { const f = () => { const t = performance.now() - t0;
    const L = a.bonePos('LeftFoot'), R = a.bonePos('RightFoot'), H = a.bonePos('Hips');
    out.push({ t, gy: a.group.position.y, gx: a.group.position.x, Lx: L.x, Ly: L.y, Rx: R.x, Ry: R.y, Hy: H.y, Hx: H.x });
    if (t < ms) requestAnimationFrame(f); else res(); }; f(); });
  return out;
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
        ctx, page = e2e.new_page(b, viewport=(1000, 460))
        page.route("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js", e2e.fulfill(THREE / "build/three.module.js"))
        def addon(route):
            rel = route.request.url.split("/examples/jsm/")[-1]
            route.fulfill(status=200, content_type="text/javascript", body=(THREE / "examples/jsm" / rel).read_text(), headers={"Access-Control-Allow-Origin": "*"})
        page.route("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/**", addon)
        page.add_init_script("window.__synth = { mode: 'neutral' };")
        page.goto(f"http://localhost:{PORT}/"); page.click(".card.green"); page.wait_for_selector(".panel.ready", timeout=30000)
        page.wait_for_function("window.__dm && window.__dm.stage.glbActive", timeout=120000)
        page.evaluate(SETUP); page.evaluate("window.__synth = { mode: 'fn' }"); time.sleep(2.5)
        def run(name, extra=None, ms=3500):
            rows = page.evaluate(RUN, [name, extra or {}, ms])
            return [r for r in rows if r["t"] > 350]   # skip the first frames: the previous scenario's pose is still settling
        spread = lambda rows, k: max(r[k] for r in rows) - min(r[k] for r in rows)

        st = run("stand", ms=2500)
        base = {k: sum(r[k] for r in st) / len(st) for k in ("Ly", "Ry", "Hy")}
        check("standing: both ankles at one steady height above the floor (spread < 1 cm) and the body does not bob (hips y spread < 1 cm)", spread(st, "Ly") < 0.01 and spread(st, "Ry") < 0.01 and spread(st, "Hy") < 0.01, f"ankle y L {base['Ly']:.3f} R {base['Ry']:.3f}; spreads L {spread(st,'Ly'):.4f} hips {spread(st,'Hy'):.4f}")
        check("standing: character does not drift sideways (< 2 cm)", spread(st, "gx") < 0.02, f"{spread(st,'gx'):.4f}")

        ir = run("imgrise", ms=3500)
        check("feet rising in the camera image (what used to make her fly) -> she stays on the floor (group y == 0, hips y spread < 2 cm)", max(abs(r["gy"]) for r in ir) < 1e-6 and spread(ir, "Hy") < 0.02, f"gy max {max(abs(r['gy']) for r in ir):.4f} hips spread {spread(ir,'Hy'):.4f}")

        sw = run("sway", ms=4500)
        late = [r for r in sw if r["t"] > 800]
        check("swaying the body with the feet fixed -> BOTH feet stay planted (x spread < 3 cm)", spread(late, "Lx") < 0.03 and spread(late, "Rx") < 0.03, f"L {spread(late,'Lx'):.3f} R {spread(late,'Rx'):.3f}")

        kk = run("kick", ms=4200)
        late = [r for r in kk if r["t"] > 600]
        kicked, planted = ("L", "R") if spread(late, "Lx") > spread(late, "Rx") else ("R", "L")
        check("kicking one leg out sideways -> the character does not slide (planted foot x spread < 3 cm, group x spread < 3 cm)", spread(late, planted + "x") < 0.03 and spread(late, "gx") < 0.03, f"planted {planted}: {spread(late, planted+'x'):.3f}, kicked {kicked}: {spread(late, kicked+'x'):.3f}, group {spread(late,'gx'):.3f}")
        check("kicking: the kicked foot really lifts and swings out (shows the kick) while the planted foot stays on the floor and the hips stay level (< 3 cm)", spread(late, kicked + "y") > 0.1 and spread(late, kicked + "x") > 0.2 and spread(late, planted + "y") < 0.02 and spread(late, "Hy") < 0.03, f"kicked y {spread(late, kicked+'y'):.3f} x {spread(late, kicked+'x'):.3f}; planted y {spread(late, planted+'y'):.3f}; hips {spread(late,'Hy'):.3f}")

        sq = run("squat", ms=3800)
        check("squatting: the hips really go down (> 12 cm) while both feet stay on the floor (ankle y spread < 4 cm: it is the ankle bone, the foot tilts) and do not slide (< 3 cm)", spread(sq, "Hy") > 0.12 and spread(sq, "Ly") < 0.04 and spread(sq, "Ry") < 0.04 and spread([r for r in sq if r["t"] > 500], "Lx") < 0.03, f"hips {spread(sq,'Hy'):.3f}, ankle y L {spread(sq,'Ly'):.3f} R {spread(sq,'Ry'):.3f}, foot x {spread([r for r in sq if r['t'] > 500],'Lx'):.3f}")

        sp = run("step", {"d": 0.5}, ms=3500)
        d = sp[-1]["gx"] - sp[0]["gx"]
        check("a real side step of 0.5 m -> the character travels about that far (0.38..0.62 m) and stays on the floor", 0.38 < abs(d) < 0.62 and max(abs(r["Ly"] - base["Ly"]) for r in sp) < 0.02, f"moved {d:+.3f} m")
        mv = max(abs(sp[i]["gx"] - sp[i - 1]["gx"]) / max(1e-3, (sp[i]["t"] - sp[i - 1]["t"]) / 1000) for i in range(1, len(sp)))
        check("the travel is smooth: never faster than 3.6 m/s", mv < 3.6, f"max speed {mv:.2f} m/s")
        page.add_style_tag(content=".panel.ready{display:none !important}")   # screenshots only: show the stage
        for nm, ex, tt in (("kick", {"freeze": 0.785}, 51), ("squat", {"freeze": 1.256}, 52), ("stand", {}, 53)):
            page.evaluate("([n, e]) => { window.__sc = Object.assign({ name: n }, e); }", [nm, ex]); time.sleep(1.5)
            page.screenshot(path=str(OUT / f"{tt}-ground-{nm}.png"))
        b.close()
finally:
    server.kill()
print(f"\n{sum(res)}/{len(res)} grounding checks passed"); sys.exit(0 if all(res) else 1)
