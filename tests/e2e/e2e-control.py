"""
Headless-Chrome run of DANCE CONTROL (private 60 s Zumba test) with the REAL UI, scorer, music player and clocks.
Stubbed: three.js (the 3D scene draws nothing; the 2D cut-out character IS real) and MediaPipe (scripted "player").
Needs private/zumba60.mp3 (git-ignored, the 60 s clip of the supplied video).
Verifies plumbing, sync, scoring logic and that the on-screen character follows the player's pose; NOT how it sounds, NOT real pose quality.
Run:  python3 tests/e2e/e2e-control.py
"""
import subprocess, sys, time, re
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
import e2e

ROOT, OUT, PORT = e2e.ROOT, e2e.OUT, 8779
AUDIO = ROOT / "private" / "zumba60.mp3"
res = []
def check(name, cond, extra=""):
    res.append((name, bool(cond)))
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{extra}]" if extra else ""), flush=True)

server = subprocess.Popen(["node", str(ROOT / "serve.mjs"), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
url = f"http://localhost:{PORT}/"

# bounding box of the visible character pixels on the 2D overlay: [w, h, count]
BBOX = """() => { const c = document.querySelector('canvas.stage2d'); if (!c) return null; const g = c.getContext('2d');
  const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data; let x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 40) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return n ? { w: x1 - x0, h: y1 - y0, n, cx: (x0 + x1) / 2, top: y0 } : { w: 0, h: 0, n: 0, cx: 0, top: 0 }; }"""

def open_control(browser, block_private=True):
    ctx, page = e2e.new_page(browser)
    page.add_init_script("window.__synth = { mode: 'neutral' };")
    if block_private:
        page.route("**/private/**", lambda r: r.fulfill(status=404, body="no"))
    page.goto(url)
    return ctx, page

def start_run(page, synth_js):
    t_click = page.evaluate("performance.now()")
    page.click(".panel.ready .btn:not(.ghost)")
    t0 = t_click + 3000 + 100 + 8
    page.evaluate("window.__synth = " + synth_js.replace("T0", str(t0)))
    page.wait_for_selector(".count", timeout=3000)
    return time.time()

def score(page):
    return int(page.inner_text(".score").replace("SCORE", "").replace(",", "").strip() or 0)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome",
            args=["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])

        # ---------- menu + audio-file flow (the clip is NOT served: the player has to choose it)
        ctx, page = open_control(browser)
        cards = page.inner_text(".menu-cards")
        check("menu shows DANCE COPY, DANCE CONTROL and MOTION MIRROR as three separate modes", all(k in cards for k in ["DANCE COPY", "DANCE CONTROL", "MOTION MIRROR"]))
        page.click(".card.green")
        page.wait_for_selector(".panel.ready", timeout=20000)
        txt = page.inner_text(".panel.ready")
        check("Control screen is titled Dance Control and says there is no dancer to copy", "Dance Control" in txt and "no dancer to copy" in txt)
        time.sleep(0.5)
        check("START is disabled until the audio file is chosen (audio is not bundled)", page.is_disabled(".panel.ready .btn:not(.ghost)"))
        check("no Coaches picker / COPY ME tags in Control", "Coaches" not in txt and page.query_selector(".copy-tag.l") is None)
        page.set_input_files("input[type=file]", str(AUDIO))
        page.wait_for_selector(".panel.ready .btn:not(.ghost):not([disabled])", timeout=15000)
        hint = page.inner_text(".panel.ready")
        m = re.search(r"\((\d+\.\d) s\)", hint)
        check("chosen file decodes as ~60 s of audio", m and 59.5 < float(m.group(1)) < 60.6, m.group(0) if m else hint[:120])
        page.screenshot(path=str(OUT / "30-control-ready.png"))

        # ---------- RUN A: a player who does every move on the beat (0.15 s reaction)
        started = start_run(page, "{ mode: 'copy', song: 'control', t0: T0, lag: 0.15, noise: 0.0015 }")
        sd = page.evaluate("window.__songDebug ? {sched: window.__songDebug.scheduledFor, lat: window.__songDebug.latency} : null")
        check("music player scheduled the clip for choreography t = 0", sd is not None, str(sd))
        sizes = {}
        d_early = None
        while time.time() - started < 70:
            if page.query_selector(".panel.results"): break
            el = time.time() - started
            for k, nm in [(8, "neutral"), (22.5, "arm-up"), (33, "sky"), (52, "late")]:
                if el > k and nm not in sizes:
                    sizes[nm] = (page.evaluate(BBOX), page.inner_text(".next-n"), page.inner_text(".song-s"), score(page))
                    page.screenshot(path=str(OUT / f"31-control-{nm}.png"))
                    if nm == "arm-up":
                        d_early = page.evaluate("""() => { const d = window.__songDebug; const audio = d.ctxNow() - d.scheduledFor; const chor = (performance.now() - d.startPerf) / 1000 + d.latency; return { diff: audio - chor, state: d.ctxState() }; }""")
            time.sleep(0.25)
        print("      checkpoints:", sizes)
        check("audio clock matches the choreography clock (<60 ms) and AudioContext is running", d_early and abs(d_early["diff"]) < 0.06 and d_early["state"] == "running", str(d_early))
        n = sizes.get("neutral", (None,))[0]
        a = sizes.get("arm-up", (None,))[0]
        check("only ONE character is drawn (no side dancers)", n and n["n"] > 500 and n["w"] < 700, str(n))
        check("character is visible and follows the player's pose (neutral vs arms raised differ)", n and a and (abs(a["h"] - n["h"]) > 20 or abs(a["w"] - n["w"]) > 20), f"neutral={n} arm-up={a}")
        check("score is still 0 before the first move (the 'video intro' section does nothing)", sizes.get("neutral", (0, 0, 0, -1))[3] == 0, str(sizes.get("neutral", [None]*4)[3]))
        page.wait_for_selector(".panel.results", timeout=25000)
        page.screenshot(path=str(OUT / "32-control-results.png"))
        rt = page.inner_text(".panel.results")
        print("      results:", " | ".join(rt.split("\n")[:14]))
        perfect = int(re.search(r"PERFECT (\d+)", rt).group(1)); great = int(re.search(r"GREAT (\d+)", rt).group(1)); miss = int(re.search(r"MISS (\d+)", rt).group(1))
        check("right player: all 22 moves PERFECT/GREAT through the real clock/camera loop", perfect + great >= 20 and miss <= 2, f"P={perfect} G={great} M={miss}")
        errs = [l for l in page.logs if ("[pageerror]" in l or "[error]" in l) and "404" not in l]
        check("no JS errors during the run", not errs, "; ".join(errs)[:300])
        ctx.close()

        # ---------- RUN B: standing still for 30 s (moves 1-8 pass) -> nothing scores, the character doesn't dance by itself
        ctx, page = open_control(browser)
        page.click(".card.green"); page.wait_for_selector(".panel.ready", timeout=20000)
        page.set_input_files("input[type=file]", str(AUDIO))
        page.wait_for_selector(".panel.ready .btn:not(.ghost):not([disabled])", timeout=15000)
        started = start_run(page, "{ mode: 'neutral' }")
        boxes = []
        while time.time() - started < 30:
            if time.time() - started > 6: boxes.append(page.evaluate(BBOX))
            time.sleep(1.0)
        sc_b = score(page)
        hs = [b["h"] for b in boxes if b]; ws = [b["w"] for b in boxes if b]
        check("standing still for 30 s: score stays 0", sc_b == 0, str(sc_b))
        check("standing still: the character does NOT perform the choreography by itself (size stays constant)", hs and max(hs) - min(hs) < 12 and max(ws) - min(ws) < 12, f"h {min(hs)}..{max(hs)} w {min(ws)}..{max(ws)}")
        ctx.close()

        # ---------- RUN C: one wrong pose (both arms up) held for 30 s -> far lower than the right player
        ctx, page = open_control(browser)
        page.click(".card.green"); page.wait_for_selector(".panel.ready", timeout=20000)
        page.set_input_files("input[type=file]", str(AUDIO))
        page.wait_for_selector(".panel.ready .btn:not(.ghost):not([disabled])", timeout=15000)
        started = start_run(page, "{ mode: 'fixed', pose: { rUpper: 160, rFore: 170, lUpper: 160, lFore: 170 } }")
        while time.time() - started < 30: time.sleep(1.0)
        sc_c = score(page)
        check("wrong pose held for 30 s earns a small fraction of the right player's points", sc_c < 8000, f"{sc_c}")
        ctx.close()

        # ---------- pause / restart
        ctx, page = open_control(browser)
        page.click(".card.green"); page.wait_for_selector(".panel.ready", timeout=20000)
        page.set_input_files("input[type=file]", str(AUDIO))
        page.wait_for_selector(".panel.ready .btn:not(.ghost):not([disabled])", timeout=15000)
        page.click(".panel.ready .btn:not(.ghost)")
        time.sleep(7)
        tbar = lambda: page.inner_text(".song-bar span").split("/")[0].strip()
        page.click(".toolbar button:has-text('Pause')")
        page.wait_for_selector(".panel:has-text('Paused')", timeout=2000)
        a1 = tbar(); time.sleep(2.5); b1 = tbar()
        st = page.evaluate("window.__songDebug.ctxState()")
        check("Pause freezes the clock and suspends the music", a1 == b1 and st == "suspended", f"{a1}->{b1} {st}")
        page.click(".panel button:has-text('Resume')"); time.sleep(2.2)
        check("Resume continues", tbar() != b1)
        page.click(".toolbar button:has-text('Restart')"); time.sleep(1.0)
        check("Restart returns to the countdown, clock 0:00", page.query_selector(".count") is not None and tbar() == "0:00", tbar())
        ctx.close()
        browser.close()
finally:
    server.kill()

bad = [n for n, ok in res if not ok]
print(f"\n{len(res) - len(bad)}/{len(res)} control e2e checks passed")
sys.exit(1 if bad else 0)
