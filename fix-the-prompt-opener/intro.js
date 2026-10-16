/* ==========================================================
   OPENER — the row slides; the logos do not fly.
   Each logo fades in at its own slot while the whole row re-centres,
   so whatever has arrived is always centred and nothing overlaps.
   ~4.5 s, skippable (Skip / Esc jump to the finished frame).

   Host hook: <div id="intro" data-host="FixThePrompt"> calls
   window[data-host].start(info) on Begin (or when bypassed) and reads
   window[data-host].resumed to skip the opener for returning learners.
   An "intro:begin" event is also dispatched on window.
   ========================================================== */
(function () {
  "use strict";

  const intro = document.getElementById("intro");
  if (!intro) return;
  const row = intro.querySelector(".intro-logos");
  const inner = intro.querySelector(".intro-inner");
  const logos = [...intro.querySelectorAll(".intro-logo")];
  const beginBtn = intro.querySelector(".intro-begin");
  const skipBtn = intro.querySelector(".intro-skip");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const params = new URLSearchParams(location.search);
  const host = window[intro.dataset.host || "FixThePrompt"];
  const timers = [];
  let finished = false;
  let atEnd = false;      // finished frame shown (by the timeline, Skip, Esc or reduced motion)
  let shownCount = 1;

  const at = (ms, fn) => timers.push(setTimeout(fn, ms));

  /**
   * Slide the row so the logos that have arrived sit centred on screen.
   * Sub-pixel measurement with the entry scale removed: a scale keeps each logo's centre
   * but widens its rect, so the unscaled half-width is rect.width / scale. (offsetLeft and
   * offsetWidth avoid the scale too, but round to whole pixels and leave the line ~2 px off.)
   * Row and logos share the row's current translate, so it cancels out of the difference.
   */
  function edges(el) {
    const r = el.getBoundingClientRect();
    const t = getComputedStyle(el).transform;
    const s = (t === "none" ? 1 : new DOMMatrixReadOnly(t).a) || 1;
    const c = (r.left + r.right) / 2, half = r.width / s / 2;
    return [c - half, c + half];
  }
  function centreOn(count) {
    const shown = logos.slice(0, Math.max(count, 1));
    const mid = (edges(shown[0])[0] + edges(shown[shown.length - 1])[1]) / 2;
    const rr = row.getBoundingClientRect();
    row.style.setProperty("--shift", `${((rr.left + rr.right) / 2 - mid).toFixed(2)}px`);
  }

  /** Keep the chevron motif clear of the content column (logos, title, Begin). */
  function clearMotif() {
    const right = inner.offsetLeft + inner.offsetWidth + 24; // + room for the 1.1 entry scale
    intro.style.setProperty("--motif-clear", `${Math.round(right)}px`);
  }

  function showBegin() {
    atEnd = true;
    timers.forEach(clearTimeout);
    timers.length = 0;
    shownCount = logos.length;
    logos.forEach((el) => el.classList.add("in"));
    centreOn(shownCount);
    clearMotif();
    intro.classList.add("st-line", "st-title", "st-begin");
    beginBtn.focus({ preventScroll: true });
  }

  function finish(info) {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    if (host && typeof host.start === "function") host.start(info || {});
    window.dispatchEvent(new CustomEvent("intro:begin", { detail: info || {} }));
    intro.classList.add("out");
    const hide = () => { intro.classList.add("gone"); intro.setAttribute("aria-hidden", "true"); };
    reduced ? hide() : setTimeout(hide, 700);
  }

  beginBtn.addEventListener("click", () => finish());
  skipBtn.addEventListener("click", showBegin);
  document.addEventListener("keydown", (e) => {
    if (finished || atEnd || e.key !== "Escape") return;
    e.preventDefault();
    showBegin();
  });
  window.addEventListener("resize", () => { centreOn(shownCount); clearMotif(); });

  // Dev link, or returning mid-session: bypass the opener entirely
  if (params.has("skipintro") || (host && host.resumed)) {
    finish({ bypassed: true });
    intro.classList.add("gone");
    return;
  }

  function play() {
    if (finished || atEnd) return;
    centreOn(1);
    const ENTER = 350, GAP = 1000, HOLD = 700;
    logos.forEach((el, i) => {
      at(ENTER + i * GAP, () => {
        shownCount = i + 1;
        centreOn(shownCount);      // the row slides; the newcomer fades in at its own slot
        el.classList.add("in");
      });
    });
    const settled = ENTER + (logos.length - 1) * GAP + HOLD;   // 3050 ms
    at(settled + 500, () => { clearMotif(); intro.classList.add("st-line"); });
    at(settled + 750, () => intro.classList.add("st-title"));
    at(settled + 1400, () => { atEnd = true; intro.classList.add("st-begin"); beginBtn.focus({ preventScroll: true }); });
  }

  if (reduced) showBegin();

  // Logos (and the title font) must be laid out before any offset means anything.
  // If the learner skipped while they were still loading, re-measure the finished line now.
  const imgs = [...intro.querySelectorAll(".intro-logo img")];
  const ready = Promise.all(imgs.map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
  ready.then(() => requestAnimationFrame(() => {
    centreOn(shownCount);
    clearMotif();
    play();
  }));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(clearMotif);
})();
