# Sunshine Shake — song & choreography brief

Original song + dance for **Dance Copy** mode. Everything (music, lyrics, melody, choreography) was written for this project; nothing is copied from an existing song.

## What is in this build — and what is NOT

| Part | Status |
|---|---|
| Original lyrics (English) | Written, shown on screen in time with the beat |
| Instrumental (drums, funk bass, chord stabs, pads, arpeggio, lead melody) | Generated in code (`src/synth.ts`), 128 BPM, 1:48.75 (+4 beat tail). Verified technically (length, no clipping, beat grid). **Nobody has listened to it by ear in the test environment — judge it yourself.** |
| **Sung vocals** | **NOT generated.** The sandbox has no singing-voice model. The melody is played by a synth lead; the lyrics are text only. Nothing in the app pretends otherwise. |
| Optional real vocal stem | Supported: put `songs/sunshine-shake-vocals.mp3` in the repo (see below) and it plays on top, in sync. |

## Structure (128 BPM, 4/4, beat = 0.4688 s, 8-count = 3.750 s)

| Section | Start | 8-counts |
|---|---|---|
| Intro | 0:00.00 (beat 0) | 2 |
| Verse 1 | 0:07.50 (beat 16) | 4 |
| Pre-Chorus | 0:22.50 (beat 48) | 2 |
| Chorus | 0:30.00 (beat 64) | 4 |
| Verse 2 | 0:45.00 (beat 96) | 4 |
| Pre-Chorus | 1:00.00 (beat 128) | 2 |
| Chorus | 1:07.50 (beat 144) | 4 |
| Bridge | 1:22.50 (beat 176) | 2 |
| Final Chorus | 1:30.00 (beat 192) | 4 |
| Outro | 1:45.00 (beat 224) | 1 |

Total 29 eight-counts = 232 beats = 108.75 s.

## Lyrics with timing (beat from start of song / seconds, F = female lead, M = male lead, B = both)

```
 12 (5.63s) [B] Hey! Let's go!
 16 (7.50s) [F] Morning light is on my floor
 24 (11.25s) [F] Got my sneakers by the door
 32 (15.00s) [F] Heartbeat drumming, feeling right
 40 (18.75s) [F] Nothing's gonna stop tonight
 48 (22.50s) [F] Can you feel it? Rising higher!
 56 (26.25s) [B] Three, two, one... set the fire!
 64 (30.00s) [B] Shake, shake, sunshine shake!
 72 (33.75s) [B] Reach up high, let the sky awake!
 80 (37.50s) [B] Shake, shake, sunshine shake!
 88 (41.25s) [B] We're all dancing, no mistake!
 96 (45.00s) [M] Look at you, you've got the groove
104 (48.75s) [M] Left foot, right foot, find your move
112 (52.50s) [M] Throw your arms up to the sun
120 (56.25s) [M] Dancing's only just begun
128 (60.00s) [F] Can you feel it? Rising higher!
136 (63.75s) [B] Three, two, one... set the fire!
144 (67.50s) [B] Shake, shake, sunshine shake!
152 (71.25s) [B] Reach up high, let the sky awake!
160 (75.00s) [B] Shake, shake, sunshine shake!
168 (78.75s) [B] We're all dancing, no mistake!
176 (82.50s) [F] Hold on, take a breath with me
184 (86.25s) [M] One more time, wild and free!
192 (90.00s) [B] Shake, shake, sunshine shake!
200 (93.75s) [B] Reach up high, let the sky awake!
208 (97.50s) [B] Shake, shake, sunshine shake!
216 (101.25s) [B] Shake it till the sun awakes!
224 (105.00s) [B] Sunshine shake! Hey!
```

## Style prompt for generating the real vocals (Suno / Udio / a singer / a vocal synth)

> Energetic English dance-pop with a pop-rock and funk feel, **128 BPM**, A minor, bright and joyful, catchy and very repetitive chorus with group shouts ("Hey!"), tight funky bass, clean drums, sparkling synth arpeggio. Female lead on verse 1 and bridge, male lead on verse 2, both together on pre-chorus and chorus. 4/4, 29 eight-counts (1:49), starts with a 2-bar instrumental intro of 4 s... The vocal take must start exactly on the first beat of the grid.

Chord loop: chorus **Am – F – C – G** (4 beats each); verses Am–Am–F–G; pre-chorus F–G–F–G.

## Adding the real vocals

1. Export the instrumental to line the singer up: `node tools/export-wav.mjs` → `song-instrumental.wav` (same grid the game uses). Give it to the vocalist/AI as the backing track.
2. Record/generate the vocals **to that WAV**, export a vocal-only file of the **same length starting at 0:00** (no extra silence at the start).
3. Save it as `songs/sunshine-shake-vocals.mp3` in the repo root and push. The game looks for it automatically; when found, the ready screen says "Music + sung vocals loaded". If the vocal file is not in sync, use Settings → Audio offset.

## Choreography (original, beginner friendly)

Two moves per 8-count: each move is reached on count 2 (scored) and **held for about 2 seconds** (4 beats) with a small beat bounce and sway, so there is time to copy it. The first 8-count is an unscored "watch" bar. Chorus signature: **side steps with arm swings**, **alternating sky punches**, **overhead clap + knee bend**; verses add disco points, hands on hips, arm sweeps and cactus arms. The dancer also bounces and sways on every beat (decoration only — not scored).

| 8-count | Moves (4 beats each) |
|---|---|
| 1 | Arms out wide → Cactus arms |
| 2 | Point right → Point left |
| 3 | Step right → Step left |
| 4 | Disco point right → Disco point left |
| 5 | Hands on hips → Sweep arms right |
| 6 | Sweep arms left → Both hands up |
| 7 | Bend knees → V arms |
| 8 | Bend knees → Both hands up |
| 9 | Swing right → Swing left |
| 10 | Sky punch right → Sky punch left |
| 11 | Sweep arms right → Sweep arms left |
| 12 | Overhead clap → Bend knees |
| 13 | Point right → Point left |
| 14 | Cactus arms → Arms out wide |
| 15 | Arm up + step right → Arm up + step left |
| 16 | Hands on hips → Both hands up |
| 17 | Bend knees → V arms |
| 18 | Bend knees → Both hands up |
| 19 | Swing right → Swing left |
| 20 | Sky punch right → Sky punch left |
| 21 | Sweep arms right → Sweep arms left |
| 22 | Overhead clap → Bend knees |
| 23 | Disco point right → Disco point left |
| 24 | Bend knees → Both hands up |
| 25 | Swing right → Swing left |
| 26 | Sky punch right → Sky punch left |
| 27 | Sweep arms right → Sweep arms left |
| 28 | Overhead clap → Arms up, feet wide |
| 29 | Both hands up → Arms up, feet wide |

What the camera scores: arm and leg angles, relative joint positions, sideways step, knee bend, timing (±0.42 s window, centred 0.15 s after the beat to allow for human reaction). **Not scored:** shoulder bounce and hip sway (they are decoration on the 3D dancer; 2D camera tracking can't judge them reliably).

