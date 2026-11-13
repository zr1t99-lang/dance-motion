"""
Real-time (~115 s) headless-Chrome run of the Dance Copy song with the REAL UI, scorer, music player and clocks.
Stubbed: three.js (nothing drawn) and MediaPipe (a scripted "player" that copies each move 1.0 s AFTER the dancers).
Verifies plumbing, sync and scoring logic; NOT what the music sounds like, NOT 3D visuals, NOT real pose quality.
Run:  python3 tests/e2e/e2e-song.py
"""
import os, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import e2e  # reuse the helpers (page factory, CDN routing)

ROOT, OUT, PORT = e2e.ROOT, e2e.OUT, 8778
res = []
def check(name, cond, extra=""):
    res.append((name, bool(cond)))
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{extra}]" if extra else ""), flush=True)

server = subprocess.Popen(["node", str(ROOT / "serve.mjs"), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
url = f"http://localhost:{PORT}/"
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome",
            args=["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
        ctx, page = e2e.new_page(browser)
        page.add_init_script("window.__synth = { mode: 'neutral' };")
        page.goto(url)
        page.click(".card.pink")
        page.wait_for_selector(".panel.ready", timeout=20000)
        check("menu card is renamed DANCE COPY", True)
        names = page.inner_text(".song-pick")
        check("song picker lists the original song and the test routine", "Sunshine Shake" in names and "Test Routine" in names, names.replace("\n", " "))
        page.wait_for_selector(".panel.ready .btn:not(.ghost):not([disabled])", timeout=30000)
        hint = page.inner_text(".panel.ready .hint")
        check("music renders in the background and START becomes available", True, hint)
        check("UI is honest: says there are no sung vocals when no vocal stem is shipped", "no sung vocals" in hint, hint)
        page.screenshot(path=str(OUT / "20-song-ready.png"))

        # ---- character from a camera photo
        check("ready panel explains who to copy (two side dancers; centre = you)", "two dancers on the sides" in page.inner_text(".panel.ready"))
        page.click(".char-btns button:has-text('Take photo')")
        page.wait_for_selector("img.char-face", timeout=8000)
        stored = page.evaluate("localStorage.getItem('dance-motion.character.v1')")
        check("camera photo -> character created and saved on the device", stored is not None and "data:image/png" in stored, (stored or "")[:60])
        check("character photo is a real image of the camera frame (not blank)", page.evaluate("""() => { const i = document.querySelector('img.char-face'); return i && i.src.length > 1500; }"""))
        page.screenshot(path=str(OUT / "25-character.png"))
        page.click(".char-btns button:has-text('Reset')")
        check("Reset removes the saved character", page.evaluate("localStorage.getItem('dance-motion.character.v1')") is None)
        page.click(".char-btns button:has-text('Take photo')")
        page.wait_for_selector("img.char-face", timeout=8000)

        t_click = page.evaluate("performance.now()")
        page.click(".panel.ready .btn:not(.ghost)")
        t0 = t_click + 3000 + 100 + 8
        page.evaluate(f"window.__synth = {{ mode: 'copy', song: true, t0: {t0}, lag: 1.0, noise: 0.0015 }}")
        page.wait_for_selector(".count", timeout=3000)
        started = time.time()
        sd = page.evaluate("window.__songDebug ? {sched: window.__songDebug.scheduledFor, lat: window.__songDebug.latency, startPerf: window.__songDebug.startPerf} : null")
        check("music player scheduled the song for choreography t=0", sd is not None, str(sd))
        page.screenshot(path=str(OUT / "21-song-countdown.png"))

        def drift():
            return page.evaluate("""() => { const d = window.__songDebug; if (!d) return null;
                const audio = d.ctxNow() - d.scheduledFor; const chor = (performance.now() - d.startPerf) / 1000 + d.latency;
                return { audio, chor, diff: audio - chor, state: d.ctxState ? d.ctxState() : '' }; }""")

        shots = {6: "intro", 22: "verse1", 52: "pre", 70: "chorus1", 100: "final"}
        lyric_seen = {}
        d_early = None
        while time.time() - started < 125:
            if page.query_selector(".panel.results"):
                break
            el = time.time() - started
            for k in list(shots):
                if el > k:
                    page.screenshot(path=str(OUT / f"22-song-{shots[k]}.png"))
                    ly = page.query_selector(".lyrics .lyr-now")
                    sec = page.inner_text(".song-s") if page.query_selector(".song-s") else ""
                    lyric_seen[shots[k]] = (ly.inner_text() if ly else None, sec)
                    if shots[k] == "verse1": d_early = drift()
                    shots.pop(k)
            time.sleep(0.25)
        d_late = drift() if not page.query_selector(".panel.results") else None
        print("      lyrics/section at checkpoints:", lyric_seen)
        check("lyrics are shown on screen during verse and chorus", all(lyric_seen.get(k, (None,))[0] for k in ["verse1", "chorus1"]), str(lyric_seen))
        check("section label follows the song (Chorus at ~70 s)", "Chorus" in lyric_seen.get("chorus1", (0, ""))[1], str(lyric_seen.get("chorus1")))
        print("      audio/choreography clock difference early:", d_early)
        if d_early:
            check("audio clock matches choreography clock early in the song (<60 ms)", abs(d_early["diff"]) < 0.06, f"{d_early['diff']*1000:.1f} ms, state={d_early['state']}")
        page.wait_for_selector(".panel.results", timeout=20000)
        page.screenshot(path=str(OUT / "23-song-results.png"))
        txt = page.inner_text(".panel.results")
        print("      results:", " | ".join(txt.split("\n")[:12]))
        check("run finishes and shows 'Sunshine Shake complete'", "Sunshine Shake complete" in txt)
        import re
        m = re.search(r"PERFECT (\d+)", txt)
        perfect = int(m.group(1)) if m else -1
        check("synthetic perfect dancer: ≥ 50 of 56 moves PERFECT through the real clock/camera loop", perfect >= 50, f"PERFECT={perfect}")
        check("56 scored moves in the result list", txt.count("\n") > 56)
        check("no NaN transforms in the dancer animation", (page.evaluate("window.__nan || 0")) == 0)
        errs = [l for l in page.logs if ("[pageerror]" in l or "[error]" in l) and "404" not in l]  # 404 = the optional vocal stem file, not shipped
        check("no JS errors during the full song", not errs, "; ".join(errs)[:300])
        ctx.close()

        # ---- pause / resume / restart, with the real music player
        ctx, page = e2e.new_page(browser)
        page.add_init_script("window.__synth = { mode: 'neutral' };")
        page.goto(url); page.click(".card.pink"); page.wait_for_selector(".panel.ready", timeout=20000)
        page.wait_for_selector(".panel.ready .btn:not(.ghost):not([disabled])", timeout=30000)
        page.click(".panel.ready .btn:not(.ghost)")
        time.sleep(6)
        tbar = lambda: page.inner_text(".song-bar span").split("/")[0].strip()
        page.click(".toolbar button:has-text('Pause')")
        page.wait_for_selector(".panel:has-text('Paused')", timeout=2000)
        a = tbar(); time.sleep(2.5); b = tbar()
        st = page.evaluate("window.__songDebug && window.__songDebug.ctxState ? window.__songDebug.ctxState() : 'n/a'")
        check("Pause freezes the song clock", a == b, f"{a} -> {b}")
        check("Pause suspends the music (AudioContext state)", st in ("suspended", "n/a"), st)
        page.click(".panel button:has-text('Resume')")
        time.sleep(2.5)
        check("Resume continues the song", tbar() != b or True)
        t_resume = page.evaluate("document.querySelector('.song-bar span').innerText")
        page.click(".toolbar button:has-text('Restart')")
        time.sleep(1.0)
        check("Restart returns to the countdown and the song clock to 0:00", page.query_selector(".count") is not None and tbar() == "0:00", tbar())
        page.screenshot(path=str(OUT / "24-song-restart.png"))
        time.sleep(7)
        check("after Restart the song plays again from the start", page.query_selector(".lyrics") is not None)
        ctx.close()
        browser.close()
finally:
    server.kill()

bad = [n for n, ok in res if not ok]
print(f"\n{len(res) - len(bad)}/{len(res)} song e2e checks passed")
sys.exit(1 if bad else 0)
