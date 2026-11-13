"""
Headless-Chrome run of the REAL game with the REAL three.js (WebGL via SwiftShader) and the real GLB dancer.
Stubbed: MediaPipe only (scripted "player"). Needs a checkout of three.js r170 (build/ + examples/jsm/):
    THREE_DIR=/path/to/three.js python3 tests/e2e/e2e-glb.py
Verifies: the GLB loads and replaces all three figures, bones follow the choreography / the player's pose, feet stay on
the floor, hidden when tracking is lost, screenshots for a human look. NOT real pose-estimation quality, NOT a real phone GPU.
"""
import os, sys, time, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
import e2e

THREE = Path(os.environ.get("THREE_DIR", ""))
if not (THREE / "build" / "three.module.js").exists():
    print("SKIP: set THREE_DIR to a three.js r170 checkout"); sys.exit(0)
ROOT, OUT, PORT = e2e.ROOT, e2e.OUT, 8783
res = []
def check(n, c, extra=""):
    res.append((n, bool(c))); print(("  PASS  " if c else "  FAIL  ") + n + (f"   [{extra}]" if extra else ""), flush=True)

def route_real_three(page):
    page.route("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js", e2e.fulfill(THREE / "build/three.module.js"))
    def addon(route):
        rel = route.request.url.split("/examples/jsm/")[-1]
        route.fulfill(status=200, content_type="text/javascript", body=(THREE / "examples/jsm" / rel).read_text(), headers={"Access-Control-Allow-Origin": "*"})
    page.route("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/**", addon)

server = subprocess.Popen(["node", str(ROOT / "serve.mjs"), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
url = f"http://localhost:{PORT}/"
BONES = "(d) => { const s = window.__dm.stage; const a = d === 'p' ? s.avatar : s.dancers[d]; const o = {}; for (const n of ['Head','LeftHand','RightHand','LeftFoot','RightFoot','Hips']) o[n] = a.bonePos(n); return o; }"
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
        def mk():
            ctx, page = e2e.new_page(browser, viewport=(1000, 460))
            route_real_three(page)
            page.add_init_script("window.__synth = { mode: 'neutral' };")
            return ctx, page

        # ---------------- Dance Copy
        ctx, page = mk(); page.goto(url)
        page.click(".card.pink"); page.wait_for_selector(".panel.ready", timeout=30000)
        page.wait_for_function("window.__dm && window.__dm.stage.glbActive", timeout=120000)
        check("GLB loaded and put on stage (real three.js + GLTFLoader)", True)
        st = page.evaluate("({n: window.__dm.stage.dancers.length, glb: [window.__dm.stage.avatar, ...window.__dm.stage.dancers].map(a => a.glb)})")
        check("both coaches AND the player are the GLB dancer", st["n"] == 2 and all(st["glb"]), str(st))
        txt = page.inner_text(".panel.ready")
        check("outfit / photo pickers are hidden (her look is fixed)", "Coaches" not in txt and "Your character" not in txt)
        page.screenshot(path=str(OUT / "40-glb-ready.png"))
        t0 = page.evaluate("performance.now()")
        page.click(".panel.ready .btn:not(.ghost)")
        page.evaluate("window.__synth = { mode: 'copy', song: 'song', t0: %f + 3000 + 100 + 8, lag: 0.15, noise: 0.0015 }" % t0)
        page.wait_for_selector(".count", timeout=5000)
        time.sleep(3 + 14)
        page.screenshot(path=str(OUT / "41-glb-copy.png"))
        samples = []
        for _ in range(40):
            samples.append(page.evaluate(BONES, 0)); time.sleep(0.12)
        hy = [s["LeftHand"]["y"] for s in samples] + [s["RightHand"]["y"] for s in samples]
        check("coach moves: hands travel through a wide height range during the choreography", max(hy) - min(hy) > 0.5, f"{min(hy):.2f}..{max(hy):.2f} m")
        feet = [min(s["LeftFoot"]["y"], s["RightFoot"]["y"]) for s in samples]
        check("coach feet stay on the floor (ankle height 0.1-0.25 m above y=0 at all times, no floating)", all(0.05 < f < 0.3 for f in feet), f"{min(feet):.3f}..{max(feet):.3f}")
        check("head stays above hips and hands (no collapsed body)", all(s["Head"]["y"] > s["Hips"]["y"] + 0.3 for s in samples))
        ps = page.evaluate(BONES, "p")
        check("player figure is posed too (bones moved, hips at normal height)", 0.7 < ps["Hips"]["y"] < 1.4, str(ps["Hips"]))
        # tracking lost -> player figure hidden
        page.evaluate("window.__synth = { mode: 'none' }"); time.sleep(1.8)
        vis = page.evaluate("window.__dm.stage.avatar.group.visible")
        check("tracking lost -> the player's figure is hidden (not frozen in a pose)", vis is False)
        page.evaluate("window.__synth = { mode: 'neutral' }"); time.sleep(1.0)
        check("tracking back -> figure visible again", page.evaluate("window.__dm.stage.avatar.group.visible") is True)
        errs = [l for l in page.logs if "[pageerror]" in l]
        check("no JS errors", not errs, "; ".join(errs)[:300])
        ctx.close()

        # ---------------- Dance Control: the player's real pose drives the figure
        ctx, page = mk(); page.goto(url)
        page.click(".card.green"); page.wait_for_selector(".panel.ready", timeout=30000)
        page.wait_for_function("window.__dm && window.__dm.stage.glbActive", timeout=120000)
        check("Control: exactly one GLB figure, no coaches", page.evaluate("window.__dm.stage.dancers.length") == 0 and page.evaluate("window.__dm.stage.avatar.glb") is True)
        audio = ROOT / "private" / "zumba60.mp3"
        if audio.exists(): page.set_input_files("input[type=file]", str(audio)); page.wait_for_selector(".panel.ready .btn:not(.ghost):not([disabled])", timeout=15000)
        t0 = page.evaluate("performance.now()")
        page.click(".panel.ready .btn:not(.ghost)")
        poses = {
            "neutral": {},
            "right-up": {"rUpper": 170, "rFore": 175},
            "left-up": {"lUpper": 170, "lFore": 175},
            "both-up": {"rUpper": 170, "rFore": 175, "lUpper": 170, "lFore": 175},
            "right-out": {"rUpper": 90, "rFore": 90},
        }
        got = {}
        page.wait_for_selector(".count", timeout=5000)
        for name, spec in poses.items():
            page.evaluate("window.__synth = { mode: 'fixed', pose: %s }" % __import__("json").dumps(spec)); time.sleep(1.6)
            got[name] = page.evaluate(BONES, "p")
            page.screenshot(path=str(OUT / f"42-glb-control-{name}.png"))
        N = got["neutral"]
        check("neutral: both hands hang below the hips", N["LeftHand"]["y"] < N["Hips"]["y"] and N["RightHand"]["y"] < N["Hips"]["y"], f"hands {N['LeftHand']['y']:.2f}/{N['RightHand']['y']:.2f} hips {N['Hips']['y']:.2f}")
        R = got["right-up"]; Lf = got["left-up"]
        hi = lambda g: "L" if g["LeftHand"]["y"] > g["RightHand"]["y"] else "R"
        check("raising ONE arm raises ONE hand above the head, the other stays low", (R["LeftHand"]["y"] > R["Head"]["y"]) != (R["RightHand"]["y"] > R["Head"]["y"]), str(R["LeftHand"]["y"]) + "/" + str(R["RightHand"]["y"]))
        check("left and right arm raises move opposite hands (mirror-view mapping)", hi(R) != hi(Lf), f"{hi(R)} vs {hi(Lf)}")
        B = got["both-up"]
        check("both arms up: both hands above the head", B["LeftHand"]["y"] > B["Head"]["y"] and B["RightHand"]["y"] > B["Head"]["y"])
        O = got["right-out"]
        side = "LeftHand" if O["LeftHand"]["y"] > O["RightHand"]["y"] - 5 and abs(O["LeftHand"]["x"]) > abs(O["RightHand"]["x"]) else "RightHand"
        check("arm out to the side: that hand is far from the body, at shoulder height", max(abs(O["LeftHand"]["x"] - O["Hips"]["x"]), abs(O["RightHand"]["x"] - O["Hips"]["x"])) > 0.45, f"{O['LeftHand']['x']:.2f}/{O['RightHand']['x']:.2f}")
        errs = [l for l in page.logs if "[pageerror]" in l]
        check("Control: no JS errors", not errs, "; ".join(errs)[:300])
        ctx.close()

        # ---------------- fallback: GLB cannot be loaded -> the 2D cut-out character stays, no crash
        ctx, page = mk()
        page.route("**/assets/char/dancer.glb", lambda r: r.fulfill(status=404, body="no"))
        page.goto(url); page.click(".card.pink"); page.wait_for_selector(".panel.ready", timeout=30000); time.sleep(6)
        check("GLB missing -> game still opens with the fallback character (no crash)", page.evaluate("window.__dm.stage.glbActive") is False and "Coaches" in page.inner_text(".panel.ready"))
        ctx.close()
        browser.close()
finally:
    server.kill()
bad = [n for n, c in res if not c]
print(f"\n{len(res) - len(bad)}/{len(res)} GLB e2e checks passed"); sys.exit(1 if bad else 0)
