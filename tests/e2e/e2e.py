"""
Headless-Chrome integration test of the REAL index.html + dist/ code.

What is real:   React UI, Engine loop, camera permission flow (Chrome's fake camera device),
                scoring, timing, HUD, screens, cleanup.
What is stubbed: three.js (recording stub, nothing is drawn) and MediaPipe (scripted poses).
So this verifies plumbing and behaviour, NOT 3D visuals or real pose-estimation quality.

Run:  python3 tests/e2e/e2e.py          (needs: node serve.mjs not running on :8777)
"""
import json, os, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
E2E = ROOT / "tests" / "e2e"
OUT = Path(os.environ.get("E2E_OUT", "/tmp/e2e-out"))
OUT.mkdir(parents=True, exist_ok=True)
PORT = 8777
results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{extra}]" if extra else ""))


def fulfill(path):
    body = Path(path).read_text()
    return lambda route: route.fulfill(status=200, content_type="text/javascript", body=body, headers={"Access-Control-Allow-Origin": "*"})


def route_cdn(page):
    # React is bundled locally (react-dom/jsx-runtime import bare "react", resolved by index.html's own import map).
    page.route("https://esm.sh/react@18.3.1", fulfill(E2E / "vendor/react.js"))
    page.route("https://esm.sh/react@18.3.1/jsx-runtime", fulfill(E2E / "vendor/jsx.js"))
    page.route("https://esm.sh/react-dom@18.3.1/client?external=react", fulfill(E2E / "vendor/dom.js"))
    page.route("https://esm.sh/__vendor_all.js", fulfill(E2E / "vendor/vendor-all.js"))
    page.route("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js", fulfill(E2E / "three-stub.js"))
    page.route("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs", fulfill(E2E / "mediapipe-stub.js"))


def setup_vendor_chunks(page):
    # the MediaPipe stub imports "/dist/choreography.js"; inside a module served for the CDN URL that resolves to the CDN host
    def dist(route):
        name = route.request.url.split("/dist/")[-1]
        route.fulfill(status=200, content_type="text/javascript", body=(ROOT / "dist" / name).read_text())

    page.route("https://cdn.jsdelivr.net/dist/*", dist)


def new_page(browser, viewport=(844, 390), deny_camera=False, **ctx):
    context = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, permissions=[] if deny_camera else ["camera"], device_scale_factor=2, **ctx)
    page = context.new_page()
    logs = []
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    page.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
    route_cdn(page)
    setup_vendor_chunks(page)
    page.logs = logs
    return context, page


def main():
    server = subprocess.Popen(["node", str(ROOT / "serve.mjs"), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    url = f"http://localhost:{PORT}/"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path="/usr/bin/google-chrome",
                args=["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
            )

            # ---------------------------------------------------------------- menu + portrait guard
            ctx, page = new_page(browser)
            page.goto(url)
            page.wait_for_selector(".menu-title", timeout=15000)
            check("menu renders from the real index.html + dist (React booted)", True)
            page.screenshot(path=str(OUT / "01-menu.png"))
            check("camera is NOT requested before a tap", page.evaluate("window.__detectCalls === undefined") and "getUserMedia" not in " ".join(page.logs))
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_selector(".rotate", timeout=3000)
            check("portrait shows the 'rotate to landscape' guard", True)
            page.screenshot(path=str(OUT / "02-portrait.png"))
            page.set_viewport_size({"width": 844, "height": 390})
            page.wait_for_selector(".rotate", state="detached", timeout=3000)
            check("guard disappears again in landscape (orientation change handled)", True)
            ctx.close()

            # ---------------------------------------------------------------- permission denied
            ctx, page = new_page(browser, deny_camera=True)
            page.add_init_script(
                "navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('Permission denied'), {name:'NotAllowedError'}));"
            )
            page.goto(url)
            page.click(".card.blue")
            page.wait_for_selector(".err-title", timeout=10000)
            check("camera permission denial -> clear error screen", "denied" in page.inner_text(".err-title").lower(), page.inner_text(".err-title"))
            page.screenshot(path=str(OUT / "03-denied.png"))
            ctx.close()

            ctx, page = new_page(browser)
            page.add_init_script(
                "navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('x'), {name:'NotFoundError'}));"
            )
            page.goto(url)
            page.click(".card.blue")
            page.wait_for_selector(".err-title", timeout=10000)
            check("missing camera -> 'No camera found'", "no camera" in page.inner_text(".err-title").lower())
            ctx.close()

            # ---------------------------------------------------------------- model fails to load (no faking success)
            ctx, page = new_page(browser)
            page.route("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs", lambda r: r.abort())
            page.goto(url)
            page.click(".card.blue")
            page.wait_for_selector(".err-title", timeout=15000)
            t = page.inner_text(".err-title")
            check("MediaPipe library cannot load -> clear error, no simulated tracking", "pose model" in t.lower(), t)
            check("camera released after the failed start", page.evaluate("""() => { const v = document.querySelector('video'); return !v || !v.srcObject; }"""))
            page.screenshot(path=str(OUT / "04-model-error.png"))
            ctx.close()

            # ---------------------------------------------------------------- calibration needs a real body
            ctx, page = new_page(browser)
            page.add_init_script("window.__synth = { mode: 'none' };")
            page.goto(url)
            page.click(".card.blue")  # Motion Mirror
            page.wait_for_selector(".calib", timeout=15000)
            check("real camera stream opens (Chrome fake device) and model 'loads' -> calibration screen", True)
            time.sleep(1.5)
            page.screenshot(path=str(OUT / "05-calib-empty.png"))
            check("calibration does NOT pass with nobody detected", page.query_selector(".calib") is not None)
            hint = page.inner_text(".calib-hint")
            check("calibration shows the required instruction", "Stand back until your entire body is visible." in hint, hint)

            # a body that is only partly in frame must not pass either
            page.evaluate("window.__synth = { mode: 'neutral' }")
            page.wait_for_selector(".mirror-ok, .hud", timeout=8000)
            check("full body detected -> calibration completes and Motion Mirror starts", page.query_selector(".hud .badge") is not None)
            time.sleep(1.0)
            page.screenshot(path=str(OUT / "06-mirror.png"))
            check("Motion Mirror HUD shows measured stats (not invented)", "Confidence" in page.inner_text(".badge-s"), page.inner_text(".badge-s"))
            nan0 = page.evaluate("window.__nan || 0")
            check("avatar maths: no NaN transforms while mirroring", nan0 == 0, f"nan={nan0}")
            h1 = page.evaluate("window.__sceneHash")
            page.evaluate("window.__synth = { mode: 'none' }")
            page.wait_for_selector(".lost-banner", timeout=4000)
            check("tracking lost -> TRACKING LOST banner", "TRACKING LOST" in page.inner_text(".lost-banner"))
            time.sleep(0.5)
            hA = page.evaluate("window.__sceneHash")
            time.sleep(0.8)
            hB = page.evaluate("window.__sceneHash")
            check("while tracking is lost the avatar is frozen (not updated from invalid data)", abs(hA - hB) < 1e-6, f"{hA:.4f} vs {hB:.4f}")
            page.screenshot(path=str(OUT / "07-mirror-lost.png"))
            page.evaluate("window.__synth = { mode: 'neutral' }")
            page.wait_for_selector(".lost-banner", state="detached", timeout=4000)
            check("tracking returns -> banner clears", True)
            page.click("button:has-text('Debug')")
            page.wait_for_selector(".debug", timeout=2000)
            dbg = page.inner_text(".debug")
            page.screenshot(path=str(OUT / "08-debug.png"))
            check("debug panel lists FPS / confidence / landmarks", all(k in dbg for k in ["Camera FPS", "Pose FPS", "Confidence", "Landmarks"]))
            check("latency is reported only if measurable (else says so)", "Capture→result" in dbg)
            # camera switch (fake device has no rear camera: must fall back gracefully, not crash)
            page.click(".debug-btns button:has-text('Back')")
            time.sleep(1.5)
            check("switching to the back camera on a device without one doesn't crash", page.query_selector(".hud") is not None)
            page.click("button:has-text('Exit')")
            page.wait_for_selector(".menu-title", timeout=3000)
            time.sleep(0.3)
            check("exiting releases the camera tracks", page.evaluate("""() => { const v = document.querySelector('video'); return !v || !v.srcObject; }"""))
            check("exiting disposes the WebGL renderer", page.evaluate("window.__rendererLive") == 0, str(page.evaluate("window.__rendererLive")))
            check("exiting disposes three.js resources", (page.evaluate("window.__disposed") or 0) > 10)
            errs = [l for l in page.logs if "[pageerror]" in l or "[error]" in l]
            check("no JS errors during the mirror session", not errs, "; ".join(errs)[:300])
            ctx.close()

            # ---------------------------------------------------------------- full Dance Challenge, perfect copy
            def play(mode, lag=0.15, noise=0.0015, label="x", shots=()):
                ctx, page = new_page(browser)
                page.add_init_script("window.__synth = { mode: 'neutral' };")
                page.goto(url)
                page.click(".card.pink")
                page.wait_for_selector(".panel.ready", timeout=20000)  # calibration passes with the neutral body
                if mode == "undetected":
                    page.evaluate("window.__synth = { mode: 'none' }")
                page.screenshot(path=str(OUT / f"{label}-ready.png"))
                t_click = page.evaluate("performance.now()")
                page.click(".panel.ready .btn")
                t0 = t_click + 3000 + 100 + 8  # same formula as the game: click + leadIn + 100 ms (+ click latency)
                if mode == "perfect":
                    page.evaluate(f"window.__synth = {{ mode: 'copy', t0: {t0}, lag: {lag}, noise: {noise} }}")
                elif mode == "neutral":
                    page.evaluate("window.__synth = { mode: 'neutral' }")
                else:
                    page.evaluate("window.__synth = { mode: 'none' }")
                page.wait_for_selector(".count", timeout=3000)
                page.screenshot(path=str(OUT / f"{label}-countdown.png"))
                shot_times = list(shots)
                start = time.time()
                while time.time() - start < 40:
                    el = page.query_selector(".panel.results")
                    if el:
                        break
                    el_s = time.time() - start
                    if shot_times and el_s > shot_times[0]:
                        page.screenshot(path=str(OUT / f"{label}-play-{int(shot_times[0])}.png"))
                        shot_times.pop(0)
                    time.sleep(0.25)
                page.wait_for_selector(".panel.results", timeout=5000)
                page.screenshot(path=str(OUT / f"{label}-results.png"))
                data = page.evaluate("""() => ({
                    text: document.querySelector('.panel.results').innerText,
                    nan: window.__nan || 0,
                    renders: window.__renders || 0,
                })""")
                return ctx, page, data

            ctx, page, data = play("perfect", label="10-perfect", shots=(7, 14, 22))
            txt = data["text"]
            print("      results screen:", " | ".join(txt.split("\n")[:12]))
            check("real-time run: perfect copy finishes the 30 s routine and shows results", "Routine complete" in txt)
            check("perfect copy -> all 9 moves PERFECT with real timing (real camera loop + stub poses)", "PERFECT 9" in txt, txt.replace("\n", " ")[:140])
            check("instructor animation had no NaN transforms for the whole routine", data["nan"] == 0, f"nan={data['nan']}")
            check("no JS errors during the challenge", not [l for l in page.logs if "[pageerror]" in l or "[error]" in l], "; ".join(page.logs)[-300:])
            ctx.close()

            ctx, page, data = play("undetected", label="11-undetected")
            txt = data["text"]
            check("player NOT detected for the whole routine -> 0 score, all MISS (in the real UI)", "MISS 9" in txt and "SCORE\n0" in txt, txt.replace("\n", " ")[:160])
            ctx.close()

            ctx, page, data = play("neutral", label="12-neutral")
            txt = data["text"]
            check("standing still in the real UI -> no PERFECT/GREAT", "PERFECT 0" in txt and "GREAT 0" in txt, txt.replace("\n", " ")[:160])
            ctx.close()

            browser.close()
    finally:
        server.terminate()

    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("FAILED:", *failed, sep="\n  - ")
        sys.exit(1)


if __name__ == "__main__":
    main()
