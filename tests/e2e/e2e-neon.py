"""
Real-time (~125 s) headless-Chrome run of the NEW original song "Neon Crush" (Dance Copy) with the REAL UI, scorer, music player
(the music is synthesised in the page) and clocks. Stubbed: three.js (nothing drawn) and MediaPipe (a scripted player that copies each
move 0.4 s AFTER the dancers). Verifies plumbing, sync and scoring; NOT how the music sounds, NOT the 3D look, NOT real pose quality.
Run:  python3 tests/e2e/e2e-neon.py
"""
import re, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
import e2e
ROOT, OUT, PORT = e2e.ROOT, e2e.OUT, 8786
res = []
def check(name, cond, extra=""):
    res.append((name, bool(cond))); print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{extra}]" if extra else ""), flush=True)
server = subprocess.Popen(["node", str(ROOT / "serve.mjs"), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8); url = f"http://localhost:{PORT}/"
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
        ctx, page = e2e.new_page(browser)
        page.add_init_script("window.__synth = { mode: 'neutral' };")
        page.goto(url); page.click(".card.pink"); page.wait_for_selector(".panel.ready", timeout=20000)
        sel = page.inner_text(".song-pick .sel") if page.query_selector(".song-pick .sel") else ""
        check("Neon Crush is the first / selected song in Dance Copy", "Neon Crush" in sel, sel.replace("\n", " "))
        t_wait = time.time()
        page.wait_for_selector(".panel.ready .btn:not(.ghost):not([disabled])", timeout=60000)
        check("the 2-minute song renders in the page and START becomes available (< 30 s)", time.time() - t_wait < 30, f"{time.time() - t_wait:.1f} s")
        page.screenshot(path=str(OUT / "60-neon-ready.png"))
        t_click = page.evaluate("performance.now()")
        page.click(".panel.ready .btn:not(.ghost)")
        t0 = t_click + 3000 + 100 + 8
        page.evaluate(f"window.__synth = {{ mode: 'copy', song: 'neon', t0: {t0}, lag: 0.4, noise: 0.0015 }}")
        page.wait_for_selector(".count", timeout=3000)
        started = time.time()
        def drift():
            return page.evaluate("""() => { const d = window.__songDebug; if (!d) return null;
                const audio = d.ctxNow() - d.scheduledFor; const chor = (performance.now() - d.startPerf) / 1000 + d.latency;
                return { diff: audio - chor, state: d.ctxState ? d.ctxState() : '' }; }""")
        shots = {16: "verse1", 26: "pre", 35: "chorus1", 50: "break", 105: "final"}   # wall-clock seconds = song time + 3 s countdown
        seen = {}; d_early = None; d_mid = None
        while time.time() - started < 140:
            if page.query_selector(".panel.results"): break
            el = time.time() - started
            for k in list(shots):
                if el > k:
                    page.screenshot(path=str(OUT / f"61-neon-{shots[k]}.png"))
                    ly = page.query_selector(".lyrics .lyr-now"); sec = page.inner_text(".song-s") if page.query_selector(".song-s") else ""
                    seen[shots[k]] = (ly.inner_text() if ly else None, sec)
                    if shots[k] == "verse1": d_early = drift()
                    if shots[k] == "chorus1": d_mid = drift()
                    shots.pop(k)
            time.sleep(0.25)
        print("      checkpoints:", seen)
        check("lyrics are shown during a verse and a chorus", all(seen.get(k, (None,))[0] for k in ["verse1", "chorus1"]), str(seen))
        check("section labels follow the song (Verse, Pre-Chorus, Chorus, Dance Break, Final Chorus)", "Verse" in seen.get("verse1", (0, ""))[1] and "Pre" in seen.get("pre", (0, ""))[1] and "Chorus" in seen.get("chorus1", (0, ""))[1] and "Break" in seen.get("break", (0, ""))[1] and "Final" in seen.get("final", (0, ""))[1], str({k: v[1] for k, v in seen.items()}))
        for nm, d in (("early", d_early), ("in the chorus", d_mid)):
            if d: check(f"audio clock matches the choreography clock {nm} (< 60 ms)", abs(d["diff"]) < 0.06, f"{d['diff']*1000:.1f} ms, {d['state']}")
        page.wait_for_selector(".panel.results", timeout=30000)
        page.screenshot(path=str(OUT / "62-neon-results.png"))
        txt = page.inner_text(".panel.results"); print("      results:", " | ".join(txt.split("\n")[:12]))
        check("run finishes and shows 'Neon Crush complete'", "Neon Crush complete" in txt)
        g = lambda k: int(re.search(k + r" (\d+)", txt).group(1)) if re.search(k + r" (\d+)", txt) else -1
        good = g("PERFECT") + g("GREAT") + g("GOOD")
        check("synthetic dancer copying 0.4 s behind: at least 90% of the moves PERFECT/GREAT/GOOD through the real clock/camera loop", good >= 0.9 * 86, f"P{g('PERFECT')} G{g('GREAT')} OK{g('GOOD')} KEEP{g('KEEP')} MISS{g('MISS')}")
        check("no NaN transforms in the dancer animation", page.evaluate("window.__nan || 0") == 0)
        errs = [l for l in page.logs if ("[pageerror]" in l or "[error]" in l) and "404" not in l]
        check("no JS errors during the full song", not errs, "; ".join(errs)[:300])
        ctx.close(); browser.close()
finally:
    server.kill()
bad = [n for n, ok in res if not ok]
print(f"\n{len(res) - len(bad)}/{len(res)} neon e2e checks passed"); sys.exit(1 if bad else 0)
