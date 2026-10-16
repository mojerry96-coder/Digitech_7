# Digi-Teach 7 — AI Literacy simulations

Two pieces for Module 2, *AI Literacy for Teaching and Research*:

| Folder | What it is |
|---|---|
| [`review-desk/`](review-desk/) | **Audit an AI Answer — The Pre-Class Review Desk** (Unit 2.6). A macOS-style desktop simulation: import AI-drafted handouts, run separate accuracy and representation checks, record a verdict, write fixes and audit a final document independently. Includes the partner-logo opener and a narrated walkthrough. See its [README](review-desk/README.md). |
| [`fix-the-prompt-opener/`](fix-the-prompt-opener/) | The fixed opener animation for **Fix the Prompt** (Unit 2.2): a drop-in replacement that passes its sign-off checklist. See [CHANGES.md](fix-the-prompt-opener/CHANGES.md). |

## Run

Open `review-desk/index.html` in a browser (it also works straight from the file), or serve it:

```bash
python3 -m http.server 8080 --directory review-desk
```

The opener preview is `fix-the-prompt-opener/preview.html`.

## Rebuild and test

```bash
cd review-desk/tools && npm install
npm run verify     # end-to-end checks
npm run render     # narrated walkthrough video
cd ../../fix-the-prompt-opener/tools && npm install && npm run verify
```

Requires Google Chrome and ffmpeg (libx264, libwebp).
