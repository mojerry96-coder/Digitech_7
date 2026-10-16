# Fix the Prompt — Opener Animation

> **Revision 2 (16 October 2026).** The opener now passes every check in §8. What changed and why is in [CHANGES.md](CHANGES.md); the build as first supplied is kept in `original/`.

Specification for the opening sequence of the **Fix the Prompt** simulation (Module 2 · AI Literacy for Teaching and Research · Unit 2.2).

The opener runs for about **4.5 seconds** and ends on a still frame with a **Begin** button. Three partner logos arrive one at a time, centred on screen, and line up. The whole sequence is skippable.

---

## 1. Contents of this package

```
OPENER.md                  this document
CHANGES.md                 what revision 2 fixed, with test results
opener.html                the markup (fixed)
intro.css                  the styles (fixed, self-contained)
intro.js                   the timeline (fixed)
preview.html               a standalone page that plays the opener
assets/logos/ekiti.svg     Government of Ekiti State, Nigeria (crest)
assets/logos/miva.svg      MIVA Open University (white lockup)
assets/logos/tof.svg       Tunji Olowolafe Foundation (cream lockup)
assets/logos/chevrons.svg  background motif, drawn from the MIVA chevron
assets/fonts/fonts.css     Afacad (variable) and Manrope, for the preview only
tools/verify-opener.mjs    automated check of §8 in headless Chrome
original/                  the markup, styles and timeline as first built
```

The logo files are cut from the supplied brand artwork. MIVA and the Foundation arrived as a single combined lockup; they were split into separate files so each can be animated on its own. Nothing was redrawn.

---

## 2. Background

A single flat navy field with a soft lift in the centre, so the logos sit on the brightest part.

```css
background: radial-gradient(ellipse at 50% 40%,
  #0C3F66 0%,      /* lifted centre */
  #09314F 52%,     /* brand navy */
  #06243C 100%);   /* darkened edge */
```

### The chevron motif

`logos/chevrons.svg` is the MIVA chevron enlarged into a background pattern, as on the brand deck cover. It is decoration only and must never compete with the logos.

| Property | Value |
| --- | --- |
| Position | Right edge, vertically centred: `top: 50%; right: -14%; transform: translateY(-50%)` |
| Size | `width: min(980px, 105vh)`, square aspect ratio |
| Colour | `#0E4571` (one step lighter than the navy ground) |
| Opacity | `0.7`, and never above that |
| Clearance | Masked so it only appears to the right of the content column (logos, title, Begin), fading in over 120px. `intro.js` sets the edge as `--motif-clear` and updates it on resize. At narrow widths the motif is simply hidden behind the mask. |
| Markup | An `<img class="intro-motif-art">` inside `.intro-motif`, so its path resolves from the page like the logos |
| Entry | Fades in over `1600ms` once the three logos have lined up (not before) |
| Overflow | Clipped by the opener container; it is allowed to run off the right edge |

Keep it behind the content: the container sits at the back of the stacking order and is `aria-hidden="true"`.

---

## 3. Logos

Order, left to right, with the width each one is drawn at:

| Slot | Asset | Width | Notes |
| --- | --- | --- | --- |
| 1 | `ekiti.svg` | `clamp(46px, 7vw, 74px)` | Full-colour crest. Holds a bitmap inside the SVG (474 KB), so it is the heaviest asset on this screen. A vector version would load faster. |
| 2 | `miva.svg` | `clamp(96px, 15vw, 164px)` | White. Vector paths, scales cleanly. |
| 3 | `tof.svg` | `clamp(70px, 11vw, 118px)` | Cream. Holds a bitmap inside the SVG. |

**Separators:** a 1px vertical rule between each pair, `rgba(255, 255, 255, 0.34)`, height `clamp(30px, 5vw, 52px)`. They appear only after all three logos have settled, growing from `scaleY(0.4)` to `scaleY(1)` over 700ms.

**Gaps:** `clamp(24px, 4.2vw, 46px)` between items.

Every logo keeps its own alt text, since these identify real institutions:
- "Government of Ekiti State, Nigeria"
- "MIVA Open University"
- "Tunji Olowolafe Foundation"

---

## 4. The movement

### The rule that matters

**The row slides; the logos do not fly.** Each logo fades in at its own place in the line, and the row as a whole re-centres every time a new one joins. So whatever has arrived is always centred on screen, and no two logos ever occupy the same space.

This is worth stating plainly because the obvious approach — flying each logo to the centre of the screen and then out to its slot — **does not work here**. The centre of the screen is exactly where the middle logo's final slot is, so a third logo arriving at the centre lands on top of the second one. That was the original bug.

### The slide

For the first `n` logos revealed, offset the row by:

```
shift = (row centre) − (centre of the revealed logos' slots)
```

Measured with sub-pixel precision **with the entry scale removed**: each logo's centre comes from `getBoundingClientRect()` (a scale keeps the centre where it is) and its unscaled half-width is the rect width divided by the current scale. The row's own translate is shared by the row and its logos, so it cancels out. (`offsetLeft` / `offsetWidth` also ignore the scale, but they round to whole pixels and left the finished line up to 2px off.) At full reveal the shift is `0`, so the finished line is centred.

Transition: `transform 900ms cubic-bezier(0.22, 1, 0.36, 1)`.

### Each logo's entry

| Property | From | To | Duration |
| --- | --- | --- | --- |
| `opacity` | 0 | 1 | 700ms ease-out |
| `transform: scale()` | 1.1 | 1 | 800ms `cubic-bezier(0.22, 1, 0.36, 1)` |
| `filter: blur()` | 8px | 0 | 700ms ease-out |

The scale stays modest at 1.1. A larger entry scale makes a logo's box wide enough to clip its neighbour even when the positions are correct.

### Timeline

Times are from the start of the sequence.

| Time | Event |
| --- | --- |
| 350ms | Ekiti crest fades in, centred |
| 1050ms | Crest finishes settling |
| 1350ms | Row slides left; MIVA fades in beside it; the pair is centred |
| 2050ms | MIVA settles |
| 2350ms | Row slides again; Tunji Olowolafe fades in; all three centred |
| 3050ms | Line complete |
| 3550ms | Dividers grow in; chevron motif begins its fade |
| 3800ms | Title and unit label rise in |
| 4450ms | **Begin** appears and takes keyboard focus; Skip fades out |

---

## 5. Type and the title

| Element | Treatment |
| --- | --- |
| Tagline | "Study. Anywhere. Anyone. Anytime." — 12px, weight 700, `letter-spacing: 0.22em`, uppercase, cream `#FCEBCC` at 85% opacity |
| Title | "FIX THE PROMPT" — Afacad, weight 650, `clamp(40px, 6.4vw, 72px)`, uppercase, `letter-spacing: -0.025em`, white, with **"PROMPT" in amber `#EE9B01`** |
| Unit label | "AI Literacy · Unit 2.2" — 13px, weight 700, `letter-spacing: 0.14em`, uppercase, `rgba(214, 228, 250, 0.72)` |

Accenting one word of the title follows the brand deck cover, which sets "MIVA **CAMPUS**" the same way.

---

## 6. Controls

The Begin arrow is an inline SVG, so the opener needs no icon font.

**Begin** — amber `#EE9B01` with brown `#472E00` text, hover `#FFB01F`, minimum height 48px, fully rounded. Amber is the action colour here because the ground is navy; white text on amber would fail contrast, and navy on navy would disappear.

**Skip** (bottom right) — a quiet outlined button, `Skip` with an `Esc` key hint. It jumps to the finished frame rather than skipping the opener outright, because the **Begin** click is what allows the narration to play with sound later. Browsers block audio until the viewer has interacted with the page.

---

## 7. Behaviour

- **Skip / Esc before the logos have loaded** shows the finished frame, then re-measures it once the files arrive. The timeline does not restart.
- **Resizing after Skip** keeps the full line centred.
- **Reduced motion** switches off every transition inside the opener, not just the timeline.
- **Host hook:** `data-host` on `#intro` names the global the opener calls (`window[data-host].start(info)` on Begin, `.resumed` to bypass). An `intro:begin` event is also dispatched on `window`.

- **Esc** does the same as Skip.
- **Reduced motion** (`prefers-reduced-motion: reduce`): the finished frame is shown immediately, with no movement.
- **Returning learners** who reload mid-session bypass the opener entirely.
- **Begin** hands over to the loading screen, then the walkthrough.
- The sequence only starts once all three logo files have loaded. Starting earlier measures a collapsed row and the centring is wrong.
- The opener is a modal region: `role="dialog"`, `aria-modal="true"`, `aria-label="Fix the Prompt"`.

---

## 8. Checks before sign-off

Run `node tools/verify-opener.mjs preview.html` (after `npm install` in `tools/`). Results for revision 2, at 1920 × 1080, 1366 × 768 and 375 × 812: **28 passed, 0 failed.**

- [x] No two logos overlap at any point. Sampled on every animation frame.
- [x] Whatever is on screen stays centred at each stage: 0.0px off when each stage settles. *Note:* while a new logo fades in and the row is still sliding, the group is briefly off-centre (up to about 120px at desktop width, under a second). This is inherent to a 900ms slide; the newcomer is still mostly transparent at that point.
- [x] All three logos fit at 375px width with no sideways scroll.
- [x] The chevron motif stays at or below 0.7 opacity and never crosses a logo or the title (0% of motif pixels under them at all three sizes).
- [x] Each logo keeps its institution's alt text.
- [x] Begin has visible keyboard focus (cream ring, 3px).
- [x] With reduced motion on, the final frame appears with no animation (nothing running after load).

## 9. Palette reference

From the Miva Campus brand deck:

| Colour | Hex | Role in the opener |
| --- | --- | --- |
| Navy | `#09314F` | Background ground |
| Navy (lift) | `#0C3F66` | Centre of the background gradient |
| Navy (edge) | `#06243C` | Outer edge of the gradient |
| Chevron | `#0E4571` | Background motif |
| Amber | `#EE9B01` | "PROMPT" in the title, Begin button |
| Brown | `#472E00` | Text on the amber button |
| Cream | `#FCEBCC` | Tagline |
