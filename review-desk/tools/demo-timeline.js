/* Walkthrough timeline — loaded only with index.html?demo=render (Sample.docx dataset, no persistence).
 * The film is built from nine beats, one per narration line (tools/narration/script.json). The renderer
 * measures each voice file and passes the schedule in as window.__demoSchedule = { beats: [{ id, start, dur }] };
 * each beat's actions are timed from its start (positive offsets) or from its end (negative offsets),
 * so the cursor always acts on the spoken words. The real interface runs under a virtual clock. */
(function () {
  "use strict";
  const FPS = 30;
  const REST = { x: 1540, y: 660 };
  const $ = (s) => document.querySelector(s);
  // aim slightly right/below centre so the pointer never sits on a label for the whole shot
  const aim = (sel, dx = 0.2, dy = 0.15) => () => {
    const el = $(sel); if (!el) throw new Error("demo target missing: " + sel);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width * (0.5 + dx), y: r.top + r.height * (0.5 + dy) };
  };
  const click = (sel) => () => $(sel).click();
  const dbl = (sel) => () => $(sel).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

  // per beat: [offsetSeconds (negative = from the beat's end), kind, ...args]
  const BEATS = {
    welcome: [
      [-1.5, "move", 0.5, aim("#shortcut-app .desktop-icon-art", 0.15, 0.2)],
      [-0.75, "click", click("#shortcut-app")],
      [-0.6, "click", dbl("#shortcut-app")]
    ],
    import: [
      [0.5, "move", 0.45, aim('.ws-empty [data-action="import"]', 0.12, 0.2)],
      [1.2, "click", click('.ws-empty [data-action="import"]')],
      [2.3, "move", 0.4, aim('.file-row[data-item="sample"]', -0.2, 0.15)],
      [2.9, "click", click('.file-row[data-item="sample"]')],
      [-1.0, "move", 0.35, aim('[data-action="picker-open"]', 0.18, 0.2)],
      [-0.35, "click", click('[data-action="picker-open"]')]   // the scan then runs under line 3
    ],
    scan: [],
    accuracy: [
      [0.2, "move", 0.4, aim('[data-action="check"][data-check="accuracy"]', 0.2, 0.2)],
      [0.8, "click", click('[data-action="check"][data-check="accuracy"]')]
    ],
    representation: [
      [0.3, "move", 0.35, aim('[data-action="dialog-continue"]', 0.2, 0.2)],
      [0.8, "click", click('[data-action="dialog-continue"]')],
      [1.3, "move", 0.4, aim('[data-action="check"][data-check="representation"]', 0.2, 0.2)],
      [1.9, "click", click('[data-action="check"][data-check="representation"]')],
      [-1.2, "move", 0.35, aim('[data-action="dialog-continue"]', 0.2, 0.2)],
      [-0.6, "click", click('[data-action="dialog-continue"]')]
    ],
    verdict: [
      [1.4, "move", 0.4, aim(".verdict-option:nth-child(2)", 0.1, 0.15)],
      [2.1, "click", click(".verdict-option:nth-child(2)")],
      [-1.6, "move", 0.4, aim('[data-action="save-verdict"]', 0.2, 0.2)],
      [-0.9, "click", click('[data-action="save-verdict"]')]
    ],
    fix: [
      [0.5, "move", 0.4, aim("#fix-input", 0.3, 0.3)],
      [1.0, "click", () => $("#fix-input").focus()],
      [1.2, "type", 2.2, "#fix-input", "State a specific correction here."],
      [-1.3, "move", 0.35, aim('[data-action="save-fix"]', 0.2, 0.2)],
      [-0.7, "click", click('[data-action="save-fix"]')]
    ],
    report: [
      [1.2, "move", 0.45, aim('[data-action="view"][data-id="sample"]', 0.2, 0.2)],
      [2.0, "click", click('[data-action="view"][data-id="sample"]')]
    ],
    close: [
      [1.6, "move", 0.45, aim('[data-win="close"]', 0.1, 0.1)],
      [2.3, "click", click('[data-win="close"]')],
      [3.0, "move", 0.6, () => REST],
      [3.9, "click", () => { $(".wallpaper").click(); document.activeElement && document.activeElement.blur(); }]
    ]
  };

  function buildSteps(schedule) {
    const steps = [];
    for (const b of schedule.beats) {
      for (const [off, kind, a, b2, c] of BEATS[b.id] || []) {
        steps.push([b.start + (off < 0 ? b.dur + off : off), kind, a, b2, c]);
      }
    }
    return steps.sort((x, y) => x[0] - y[0]);
  }

  // cursor and click ring are demo-only overlays
  const cursor = document.createElement("div");
  cursor.innerHTML = '<svg width="22" height="30" viewBox="0 0 20 28"><path d="M1.5 1.5v21.2l5.3-5.1 3.6 8.2 3.4-1.5-3.6-8 7.3-.4z" fill="#fff" stroke="#06243C" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  Object.assign(cursor.style, { position: "fixed", left: "0", top: "0", zIndex: 100000, pointerEvents: "none", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45))", willChange: "transform" });
  const ring = document.createElement("div");
  Object.assign(ring.style, { position: "fixed", left: "-16px", top: "-16px", width: "32px", height: "32px", borderRadius: "50%", border: "2px solid rgba(255,183,46,.95)", boxShadow: "0 0 12px rgba(238,155,1,.6)", zIndex: 99999, pointerEvents: "none", opacity: 0 });
  document.body.append(ring, cursor);

  const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const seen = new WeakMap();
  let STEPS = null, pos = { ...REST }, move = null, lastClick = null, typing = null, stepIndex = 0;

  function syncAnimations(t) {
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) seen.set(a, t);
      a.pause();
      a.currentTime = t - seen.get(a);
    }
  }

  function frame(f) {
    if (!STEPS) STEPS = buildSteps(window.__demoSchedule);
    const t = (f * 1000) / FPS;
    while (stepIndex < STEPS.length && STEPS[stepIndex][0] * 1000 <= t) {
      const [s, kind, a, b, c] = STEPS[stepIndex++];
      const at = s * 1000;
      window.__vt.advance(at);
      if (kind === "move") { const from = move ? pointAt(at) : pos; move = { t0: at, dur: a * 1000, from, to: b() }; }
      else if (kind === "click") { a(); lastClick = { t: at, p: pointAt(at) }; }
      else if (kind === "type") typing = { t0: at, dur: a * 1000, el: $(b), text: c, shown: -1 };
    }
    window.__vt.advance(t);
    if (typing) {
      const n = Math.min(typing.text.length, Math.floor(((t - typing.t0) / typing.dur) * typing.text.length));
      if (n !== typing.shown && n >= 0) {
        typing.shown = n; typing.el.value = typing.text.slice(0, n);
        typing.el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (n >= typing.text.length) typing = null;
    }
    syncAnimations(t);
    const p = pointAt(t);
    cursor.style.transform = `translate(${p.x - 1.5}px, ${p.y - 1.5}px)`;
    if (lastClick && t - lastClick.t <= 320) {
      const u = (t - lastClick.t) / 320;
      ring.style.opacity = String(0.85 * (1 - u));
      ring.style.transform = `translate(${lastClick.p.x}px, ${lastClick.p.y}px) scale(${0.5 + 0.9 * u})`;
    } else ring.style.opacity = "0";
    return { t, overlay: window.ReviewDesk.overlay.kind };
  }
  function pointAt(t) {
    if (!move) return pos;
    const u = Math.max(0, Math.min(1, (t - move.t0) / move.dur));
    const k = ease(u);
    const p = { x: move.from.x + (move.to.x - move.from.x) * k, y: move.from.y + (move.to.y - move.from.y) * k };
    if (u >= 1) pos = p;
    return p;
  }

  window.__demo = { frame, FPS, ready: true };
})();
