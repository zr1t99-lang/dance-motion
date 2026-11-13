"""The Dance Control clip is chosen ONCE per browser: it is remembered (IndexedDB) and loaded on the next visit; Forget removes it.
Run:  python3 tests/e2e/e2e-saved.py   (needs private/zumba60.mp3 locally)"""
import subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
import e2e
ROOT, PORT = e2e.ROOT, 8781
AUDIO = ROOT / "private" / "zumba60.mp3"
server = subprocess.Popen(["node", str(ROOT / "serve.mjs"), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8); url = f"http://localhost:{PORT}/"; res = []
def check(n, c, x=""):
    res.append(bool(c)); print(("  PASS  " if c else "  FAIL  ") + n + (f"   [{x}]" if x else ""), flush=True)
START = ".panel.ready .btn:not(.ghost)"
def enter(page):
    page.goto(url); page.click(".card.green"); page.wait_for_selector(".panel.ready", timeout=20000); time.sleep(0.8)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
        ctx, page = e2e.new_page(b)
        page.add_init_script("window.__synth = { mode: 'neutral' };")
        page.route("**/private/**", lambda r: r.fulfill(status=404, body="no"))
        enter(page)
        check("first visit: START disabled until the file is chosen", page.is_disabled(START))
        page.set_input_files("input[type=file]", str(AUDIO))
        page.wait_for_selector(START + ":not([disabled])", timeout=15000)
        time.sleep(1.0)
        page.reload(); page.click(".card.green"); page.wait_for_selector(".panel.ready", timeout=20000)
        try:
            page.wait_for_selector("text=Loaded:", timeout=15000); page.wait_for_selector(START + ":not([disabled])", timeout=5000); ok = True
        except Exception: ok = False
        check("next visit (page reloaded, file NOT chosen again): the clip loads by itself and START is enabled", ok, page.inner_text(".panel.ready")[-160:].replace("\n", " "))
        page.click("text=Forget the saved clip", timeout=5000); time.sleep(0.5)
        check("Forget -> START disabled again", page.is_disabled(START))
        page.reload(); page.click(".card.green"); page.wait_for_selector(".panel.ready", timeout=20000); time.sleep(1.5)
        check("after Forget and reload the clip is gone", page.is_disabled(START))
        b.close()
finally:
    server.kill()
print(f"\n{sum(res)}/{len(res)} saved-clip checks passed"); sys.exit(0 if all(res) else 1)
