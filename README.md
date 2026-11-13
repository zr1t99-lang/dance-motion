# DANCE MOTION: Kinect-style mobile dance game (prototype)

A landscape, camera-driven dance game that runs in a phone browser.

- **Motion Mirror**: a 3D avatar driven live by your body (MediaPipe Pose Landmarker → Three.js). No pre-made animation.
- **Dance Challenge**: copy a 30-second, 9-move instructor routine. Scored on joint angles, relative positions and timing; PERFECT / GREAT / GOOD / MISS, score, combo, stars.

React + TypeScript + Three.js + MediaPipe. All pose detection runs **on the device**; video never leaves the phone.

## كيف تلعب (بالعربي، أسهل طريقة: GitHub Pages)

1. ادخل github.com ← **New repository** ← سمّه `dance-motion` ← خليه **Public** ← Create.
2. في صفحة الـ repo اضغط **uploading an existing file** وارفع **كل محتويات** هذا المجلد (بما فيها مجلد `dist` وملف `index.html` و`.nojekyll`) ← **Commit changes**.
3. روح **Settings ← Pages**. تحت Source اختر **Deploy from a branch**، الفرع `main`، المجلد `/ (root)` ← **Save**.
4. انتظر دقيقة أو دقيقتين، ويطلع لك رابط مثل `https://اسمك.github.io/dance-motion/` .
5. افتح الرابط **من جوالك** (Chrome على أندرويد أو Safari على آيفون) وخلّ الجوال **أفقي**.
6. اضغط **Dance Challenge** ← اسمح للكاميرا ← قف بعيد 2-3 متر لين يبين جسمك كله ← اضغط **START**.

ملاحظة: يحتاج إنترنت، لأن المكتبات والموديل تتحمّل من الإنترنت أول مرة.

## Run it

```bash
npm run build        # tsc -> dist/   (TypeScript compiler only; no bundler needed)
node serve.mjs       # http://localhost:8080
```

React, Three.js and MediaPipe are loaded from CDNs through the import map in `index.html` (versions pinned), so the device needs **internet** on first load. The pose model (~5 MB) is downloaded from `storage.googleapis.com`.

Optional (nicer editor types): `npm i -D @types/react @types/react-dom @types/three typescript` and delete `src/shims.d.ts`.

## Testing on a real phone (camera needs HTTPS)

Browsers only allow `getUserMedia` on **HTTPS** pages (or `localhost`). Pick one:

1. **Static host (simplest):** upload this whole folder (including `dist/`) to GitHub Pages, Netlify Drop, or Cloudflare Pages and open the https URL on the phone.
2. **Tunnel:** `node serve.mjs`, then `npx localtunnel --port 8080` (or `cloudflared tunnel --url http://localhost:8080`) and open the https URL it prints.
3. **Android + USB cable:** enable USB debugging, open `chrome://inspect` on the desktop → *Port forwarding* `8080 → localhost:8080`, then open `http://localhost:8080` **on the phone** (localhost counts as secure).

Then: landscape, phone propped 2-3 m away at about waist height, whole body (feet included) in view.

> **Claude preview limitation:** inside the Claude chat preview the page is sandboxed and its camera permission and CDN access are not guaranteed, so use one of the routes above.

## Motion Mirror: free dance (Kinect-Adventures style)

The avatar copies the **direction of every bone** (arms, forearms, thighs, shins, torso lean/twist, head turn, feet) from the camera, on a rig with fixed proportions, so limbs never stretch. It also follows **sideways steps** and **jumps**. For the closest copy: Settings -> *Pose model: Heavy (best)* (or Full) and *Movement response: Fast* (default). If the phone lags, use Full/Lite or lower the inference cap.
Limits: one camera sees in 2D, so depth (an arm pointing at the camera), spinning fully around, and fingers are approximate or not tracked.

## Controls / flow

Menu → tap a mode (camera + model start only now) → **Calibration** ("Stand back until your entire body is visible.", every body group must be confidently detected *inside the frame* for ~1.2 s) → mode.

Challenge: **START** → 3-s countdown (your neutral stance is recorded as the baseline) → 30 s routine → results with per-move score, judgment and timing offset (ms).
Copy the dancer like a mirror: **your right arm = the arm on the right side of the screen**.

Toolbar: switch camera, mirror view, debug panel, settings, exit. Settings: front/back camera, mirror, skeleton overlay, timing tolerance (±0.3-1.2 s), backing beat, inference cap (15/24/30/max), model (lite/full), reflections.

## How scoring works (src/scoring.ts, src/poseMath.ts)

- The instructor and the scorer share the same reference skeletons (forward kinematics from joint-angle specs in `src/choreography.ts`).
- Per frame, the player's landmarks are compared with the move's reference using
  limb **direction angles** (8 segments), **torso-normalised positions** (wrists, elbows, knees, ankles), **sideways hip travel** and **squat depth**, the last two relative to the player's own neutral-stance baseline, so height, distance to the camera and proportions don't matter. A wrong arm can't be hidden by correct limbs (worst-arm blend), and unrequested stepping/squatting scales the score down.
- **Timing:** each move has a window of ±tolerance (default 0.7 s). The best frame in the window counts; being off-centre costs up to 30 %.
- **Tracking confidence:** frames with fewer than 10 of 12 main landmarks visible are ignored; low mean visibility scales the score down. Not detected = 0 points.
- No randomness anywhere: the same input always gives the same result (unit-tested).
- Thresholds (PERFECT ≥ 0.85, GREAT ≥ 0.70, GOOD ≥ 0.50) and tolerances are in `DEFAULT_SCORING`: **initial values, not yet tuned on real players**.

## Tests

```bash
npm test                      # compiles, then scoring/choreography/smoothing tests + 17 song tests
python3 tests/e2e/e2e.py      # headless Chrome integration test (needs playwright + Chrome)
python3 tests/e2e/e2e-song.py # full real-time 112 s Sunshine Shake run + pause/restart (~3 min)
```
The e2e test boots the real `index.html` + `dist/`, uses Chrome's fake *camera device*, and stubs only **three.js** (recording stub) and **MediaPipe** (scripted poses). It verifies flow, error handling, tracking-lost behaviour, real-time scoring and cleanup. It does **not** judge 3D visuals or real pose-estimation quality.

## Feature status

| Area | Status |
|---|---|
| Landscape game shell + neon HUD (accuracy, score, stars, combo, judgment ladder, popup, camera preview, Next Move, progress) | **Working** (layout verified in headless Chrome) |
| Portrait guard / orientation changes | **Working** |
| Camera: request only after a tap, permission-denied / no-camera / HTTPS / busy errors, front/back/switch, graceful fallback when no rear camera | **Working** (verified with Chrome fake camera + injected errors) |
| Calibration gate (needs a genuinely detected, in-frame body) | **Working** (logic verified; real detection needs a phone) |
| Tracking-lost handling (TRACKING LOST, avatar frozen, no points) | **Working** (verified) |
| Challenge: deterministic 30 s routine, instructor performs the exact scored poses, PERFECT/GREAT/GOOD/MISS, score, combo, results | **Working** (unit + e2e verified; thresholds untuned) |
| Debug panel: camera FPS, pose FPS, inference ms, landmarks, confidence, reference pose, live accuracy; capture→result latency **only when the browser exposes it**, else "not exposed" | **Working** |
| Resource cleanup (camera tracks, WebGL renderer/geometries/textures, landmarker, audio, wake-lock) | **Working** (verified) |
| **Real MediaPipe pose detection** (model load from CDN, GPU→CPU fallback, accuracy, FPS on phones) | **Implemented, not run here**: needs a real device (my sandbox cannot reach the CDNs) |
| **3D avatar + instructor rendering** (Three.js: look, reflections, performance) | **Implemented, not rendered here**: Three.js could not be loaded in my sandbox; transforms were checked for NaNs only |
| Avatar axis conventions from MediaPipe *world* landmarks (y is auto-oriented from the data; z sign assumed) | **Unverified**: if depth looks inverted on device, flip the sign in `Avatar.setFromWorld` |
| Rear-camera tracking quality | **Depends on the device/browser**; compare with the debug panel's Front/Back buttons |
| Smoothing (One-Euro: minCutoff 1.2, beta 4/3) | **Unit-tested on synthetic jitter; tune on device** |
| **Dance Copy: original song "Sunshine Shake"** (128 BPM, 1:49, intro/verses/pre-chorus/chorus/bridge/final chorus/outro), 112 scored moves, 8-count choreography with chorus signature moves, on-screen lyrics, Play/Pause/Restart, song picker, audio-offset setting | **Working** (17 node tests + 18 browser checks, incl. a full real-time run with a scripted dancer: 112/112 PERFECT, audio clock within 5 ms of the dance clock) |
| Instrumental music (generated in code, `src/synth.ts`, rendered in a Web Worker, exportable with `node tools/export-wav.mjs`) | **Working technically**; **how it sounds has not been judged by ear** in my environment |
| **Sung vocals** | **NOT generated** (no singing model available). Lyrics are shown as text; the melody is a synth lead. A real vocal stem can be dropped in (`songs/sunshine-shake-vocals.mp3`), see `SONG_BRIEF.md` |
| Shoulder bounce / hip sway in the choreography | Animated on the 3D dancer, **not scored** (2D camera can't judge them reliably) |
| **Two backup dancers + you in the middle** (instructors on both sides, your character follows your camera in the centre) | **Implemented**; layout logic tested, **the real 3D look has not been seen** (Three.js not available in my sandbox) |
| **Character from your sheet** (all three figures) | The front view of your character sheet is cut into body pieces (`assets/char/`, built from the image) and animated by the skeleton in `src/cutout.ts`. It is the real artwork (face, hair, jacket, pants), but **flat 2D**: no turning, no photo-face on the middle figure yet, small cut-out blemishes remain. Screenshot-verified in headless Chrome. The 3D primitive avatars are hidden. |
| **My character from a photo** (face photo cropped from your camera frame onto the avatar's head; skin and shirt colour sampled; hair colour chosen) | **Implemented**; photo capture/storage tested in headless Chrome with a fake camera; **how the face looks on the 3D head is unverified**; not a 3D face scan: it is a flat photo "face plate" |
| **Coach outfits** (pink/purple coaches in cartoon style + 3 optional outfit pairs: wide cargo pants, chunky sneakers, ponytail/headband, cartoon face) | **Implemented as colours/shapes on the simple 3D figures**; it does **not** look like a painted 3D-cartoon render; for that, rigged character models (GLB) are needed |
| Choreography: each move is held ~2 s (4 beats), 56 scored moves | **Working** (tests) |
| Backing click beat (120 BPM) for the 30 s test routine | **Implemented** |
| TV Mode: TV layout, fullscreen, screen wake-lock, mirroring instructions | **Partial by design**: the phone stays the camera/tracker; you mirror its screen with AirPlay / Cast / HDMI. **No automatic TV connection is claimed or implemented.** |
| Fullscreen / landscape lock | Works where supported (Android Chrome); not on iPhone Safari |

## Known limits of this prototype

- Scoring is 2D (image plane): moves are designed to be seen face-on, since an arm pointing at the camera is foreshortened. One player, front-facing.
- Leg poses are weighted less than arm poses because they are harder to read face-on.
- Original choreography, visuals and beat only: no third-party songs or assets.

## Dance Control (private 60 s test)

A third mode next to Dance Copy and Motion Mirror. **There is no dancer to copy**: the character on screen is the player, driven only by the camera pose, and a timeline of 22 moves (icons under "Coming up") is scored on the beat. Standing still scores 0 and the character does not dance by itself.

- Reference: the first 60 s of a supplied Zumba video. Analysis: `tools/analysis/soda-pop-60s.json` (tempo/beat grid and cuts were **measured**; which move is danced when was **judged by eye**, not extracted automatically; see `src/songs/zumbaControl.ts`).
- Audio: **not in this repository** (copyrighted; `private/` is git-ignored). The mode needs the 60 s clip, which the player picks in the ready panel (it stays on the device) or which is read from `private/zumba60.mp3` when running locally. Replace or license before any release.
- Tests: `node tests/control-tests.mjs`, `python3 tests/e2e/e2e-control.py` (needs the local clip).
- Not done: the character does not play a separate canned animation when a move is recognised; it mirrors the player live. It is the flat 2D art from the character sheet, not a rigged 3D model.

## Arabic (العربية)
The UI has an Arabic mode (menu pill / Settings → Language; default Arabic when the phone language is Arabic). Translated: menu, calibration, errors, HUD, judgments, pose names, ready panel and how-to-play, results, settings. Right-to-left layout. Not translated: Debug panel, TV-mode long text, English song lyrics. Checked in headless Chrome screenshots only, not on a real device.

## Party-game scoring (build fun1)
Applies to Dance Copy and Dance Control (same scorer). Similarity thresholds: PERFECT 95-100 %, GREAT 85-94, GOOD 70-84, KEEP GOING 50-69 (still points, combo kept), MISS < 50. A move is judged over a window from 0.3 s before to 2 s after its time (best similarity wins; no penalty up to 0.8 s late, at most 4 % at 2 s). MISS only appears once the 2 s grace is over. A move registers once; the same held pose cannot be credited early to the next identical move. Tracking loss is never a MISS: if the player was not tracked for the window the move is skipped (no points, combo untouched). Comparison tolerances were widened (about 20 deg per joint, 0.18 torso lengths), and a move whose signature element (e.g. the sideways shift of a step) is absent cannot reach 50 %. Settings no longer has a "Timing tolerance" row. Tested with synthetic players (tests/forgiving-tests.mjs), not with a real person and a real camera.
