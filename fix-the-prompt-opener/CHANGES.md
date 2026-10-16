# Fix the Prompt opener — revision 2 changes

16 October 2026. Drop-in replacement for the opener as first built (kept in `original/`). Same markup structure, class names, timings and look; the fixes below make it pass every check in OPENER.md §8.

## Bugs fixed

| # | Problem in the original | Fix |
|---|---|---|
| 1 | **The chevron motif sat behind the logos.** Measured share of motif pixels under a logo: Tunji Olowolafe 10% at 1920px, 90% at 1366px; MIVA 100% at 375px. | The motif is masked so it only appears to the right of the content column. `intro.js` measures the column's right edge (`--motif-clear`) and keeps it current on resize. Now 0% at every size, logos and title included. |
| 2 | **Skip, then resize, threw the line off-centre** (252px at desktop width). `showBegin()` never updated the "logos shown" count, so a resize re-centred on the first logo only. | `showBegin()` sets the count to all three. |
| 3 | **Skip before the logos loaded restarted the animation.** `play()` only checked `finished`, so once the 474 KB crest arrived it ran the timeline again behind a visible Begin button, measuring a collapsed row. | A separate "at end" flag stops `play()`. Once the files arrive, the finished line is re-measured instead. |
| 4 | **Reduced motion still animated.** The timeline was skipped, but CSS transitions still ran (the title was only half visible 120ms after load). | A reduced-motion rule turns off every transition and animation inside the opener. |
| 5 | **The finished line sat up to 2px off-centre.** `offsetLeft`/`offsetWidth` round to whole pixels. | Sub-pixel measurement with the entry scale divided out (see OPENER.md §4). Each stage now settles 0.0px off. |
| 6 | **Entry scale started late.** Logos sat at 1.1 for 700ms, then shrank — the spec has scale run with the fade. | Opacity, blur and scale start together (scale 800ms, the others 700ms ease-out, as specified). |

## Tidying

- Comments now describe the actual behaviour ("the row slides; the logos do not fly"); the old "fly to the centre" description, which the spec calls the original bug, is gone.
- Duplicate `letter-spacing` on the title removed (−0.025em kept, as specified).
- The Begin arrow is an inline SVG; the Phosphor icon font is no longer needed.
- `intro.css` is self-contained: brand tokens are scoped to `.intro` and fall back to the host's own `--navy`, `--amber`, `--ease` and font variables when those exist. Begin has its full styling (48px, fully rounded, cream focus ring) without relying on a host `.primary-cta` class.
- The Skip button becomes hidden (not just transparent) once Begin appears, so keyboard users don't tab to an invisible control.
- The motif is an `<img>` in the markup rather than a CSS `url()`, so its path resolves from the page like the logos.
- The opener sits at `z-index: 1000` so it covers any host overlays.
- Host hook generalised: `data-host="FixThePrompt"` names the global to call; an `intro:begin` event is also dispatched. Behaviour for Fix the Prompt is unchanged.

## Font note

The title uses Afacad at weight 650, which needs the variable Afacad font. `preview.html` loads it from `assets/fonts/fonts.css`; the host app should load the variable font too (e.g. `@fontsource-variable/afacad`), or the browser will round to the nearest static weight.

## Verification

`cd tools && npm install && npm run verify` — 28 passed, 0 failed, no page errors (1920 × 1080, 1366 × 768, 375 × 812, plus slow-loading logos, reduced motion, Begin and `?skipintro`).
