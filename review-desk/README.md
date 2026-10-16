# Review Desk — Audit an AI Answer

AI Literacy for Teaching and Research · Unit 2.6. A browser simulation of one desktop with one application window: the learner imports four AI-drafted handouts, runs separate accuracy and representation checks, records their own verdicts, writes fixes and audits a final document independently. No backend and no live AI; findings are authored.

## Run it

Open `index.html` in Chrome, Edge or Safari (works from `file://`; fonts and captions are embedded), or serve the folder, e.g. `python3 -m http.server 8080` (also configured in `../.claude/launch.json`).

| URL option | Effect |
|---|---|
| `?reset=1` | Clears the saved session (local storage, this browser only) |
| `?skipintro` | Skips the logo opener |
| `?skip-walkthrough` | Goes straight to the desktop |
| `?reset=1&labels=proposed` | Starts a session with the proposed verdict wording (see “Open before an assessed release”) |
| `?fail=scan,check` | Debug: the first scan/check fails, to exercise Retry / Cancel |
| `?demo=render` | Walkthrough demo mode (Sample.docx, no persistence); used only by the renderer |

On **Finish** the app closes to the desktop and dispatches `review-desk:finish` on `window` with the learner record (`window.ReviewDesk.getRecord()` returns it any time).

## Flow

Opener (partner logos, "Audit an AI Answer", Begin) → narrated walkthrough (Sound / Captions, Replay, Start review) → desktop → Review Desk. Returning learners skip the opener and walkthrough.

## Design

- **macOS desktop:** a translucent menu bar with working File (Import Document… ⌘O, Close Window ⌘W) and Help (Replay walkthrough) menus, navigable with the arrow keys; desktop icons at the top right; a Dock that magnifies on hover, shows running dots and bounces on launch; light windows with red/yellow/green traffic lights, a centred title and a unified toolbar; a Finder-style Open panel with Favourites, path and search.
- **Brand:** the MIVA palette as the accent — flat navy `#09314F` primary buttons, amber `#EE9B01` highlights, cream paper for the handout, Afacad headings and Manrope text. The wallpaper uses the MIVA chevron, matching the opener. All button fills are flat; there are no gradients on controls.
- **Icons:** one minimal line-icon family (`icons.js`, 24 px grid, 1.6 px rounded strokes) plus flat squircle badges in navy and amber for the two checks, and flat app and folder icons (`assets/icons`). The earlier 3D art is kept, unused, in `../_archive/`.
- **Motion:** springy, staggered entrances for findings, verdict options, report rows and file rows; the handout lands as a sheet of paper; a big round Import button with a spinning amber ring and a soft pulse; tiles that lift and tilt on hover; a genie-like minimise into the Dock; soft drifting light inside the window.
- **AI working pop-up:** a navy card with a swirling dot cloud (white, amber and sky dots with depth blur; `dotcloud.js`), a status line that pulses and changes part-way through, then the dots gather and the result rises in line by line.
- Saved states confirm calmly ("Verdict saved", "Saved" chip on a fix) and offer the one next action.
- Reduced motion turns all of this off; loops pause when the tab is hidden.

## Walkthrough (narrated)

`assets/media/review-desk-walkthrough.mp4` — 1920 × 1080, 30 fps, H.264 + AAC narration, about 73 s, rendered frame by frame from the real interface with the separate Sample.docx dataset. Nine beats, one per narration line, each timed to its audio. Captions: `review-desk-walkthrough-captions.js` (used by the player) and `.vtt`; transcript in `tools/narration/transcript.md`.

**Narrator:** ElevenLabs "Ifeoma Odumodu - Nigerian Narrator" (`reGkImJki7uJOve2F4A0`), eleven_multilingual_v2, stability 0.6, similarity 0.8 — the same voice and settings as the other MIVA films. One file per line in `tools/narration/` (`n1.mp3` … `n9.mp3`, text in `script.json`); replace any file and run `npm run render` and the film retimes itself to the voice; the render also refreshes the `?v=` tags in `index.html` so browsers fetch the new video. An earlier stand-in voice is kept in `tools/narration/standin-joy/`.

## Rebuild and verify

```bash
cd tools && npm install
npm run assets    # embedded fonts
npm run render    # narrated walkthrough, poster, captions, transcript (~7 min)
npm run verify    # 71 end-to-end checks; screenshots in tools/verify-shots/
node verify-opener.mjs ../index.html "--query=?reset=1"   # 28 opener checklist checks
```

Requires Google Chrome and ffmpeg (libx264, libwebp).

## Open before an assessed release

1. **Verdict labels vs. the heart excerpt.** The storyboard's four labels can't express the heart's "Not applicable" representation finding. Proposed wording is in `VERDICT_LABELS_PROPOSED` in `data.js`, awaiting author sign-off; preview it with `?reset=1&labels=proposed`. Once approved, set `verdictLabels` in `CASE` to the proposed set. Verdicts are recorded verbatim and never marked right or wrong.
2. **Rubric.** Weights 35 / 35 / 30, no speed scoring, no numeric score. Fixes use a bounded keyword rubric (`prototype-keyword-rubric-0.1`), not a semantic evaluator.
3. **Storage.** `localStorage` only; a server-backed learner record is a separate integration.
