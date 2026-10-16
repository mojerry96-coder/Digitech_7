/* Review Desk — one persistent simulated desktop with one application window (spec §9 state model). */
(function () {
  "use strict";

  const D = window.ReviewDeskData;
  const params = new URLSearchParams(location.search);
  const DEMO = params.get("demo") === "render";
  const CASE = DEMO ? D.DEMO_CASE : D.CASE;
  const DOCS = CASE.documents;
  const STORE_KEY = "review-desk-session-v1";
  const TIMING = DEMO ? { scan: 1500, check: 1400 } : { scan: 1300, check: 1500 };
  const EXIT_MS = 140;
  const failOnce = new Set((params.get("fail") || "").split(",").filter(Boolean)); // debug: ?fail=scan,check

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const later = (ms, fn) => setTimeout(fn, ms);
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  /* ---------- assets: minimal line icons (icons.js) and flat squircle badges ---------- */
  const ALIAS = { document: "doc", handouts: "folder", "hero-final": "doc" };
  const icon = (name, size = 20, cls = "ln-icon") => window.RDIcon(ALIAS[name] || name, size, cls);
  const badge = (kind, size = 22) => `<span class="badge badge-${kind}" aria-hidden="true">${window.RDIcon(kind, size)}</span>`;
  const CHEVRON = window.RDIcon("chevron", 18, "tile-chevron");
  const CLOSE_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>`;

  /* ---------- state ---------- */
  function freshRecord() {
    return {
      imported: false, accuracyRun: false, representationRun: false, checkLog: [],
      verdictDraft: null, verdictSubmitted: null, fixDraft: "", fixAttempts: [], fixSubmitted: null,
      practiceFixAccepted: false, finalSubmitted: false, finalAssessment: null
    };
  }
  function freshState() {
    const records = {};
    Object.keys(DOCS).forEach((id) => (records[id] = freshRecord()));
    return {
      version: 1, caseId: CASE.id, appOpen: false, minimised: false, maximised: false,
      stage: "review", activeDocumentId: null, finalFileAvailable: false, reportSelected: null,
      finished: false, startedAt: new Date().toISOString(),
      rubricVersion: D.ASSESSMENT.rubricVersion, verdictLabelSet: params.get("labels") === "proposed" ? "proposed" : CASE.verdictLabelSet, records
    };
  }
  function load() {
    if (!CASE.persist) return null;
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.version === 1 && s.caseId === CASE.id && s.records) return s;
    } catch (e) { /* storage unavailable */ }
    return null;
  }
  function save() {
    if (!CASE.persist) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }
  if (params.has("reset")) { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }

  let state = load() || freshState();
  let overlay = { kind: "none" };
  let opSeq = 0;
  const fixFeedback = {};
  let picker = null;

  const rec = (id) => state.records[id];
  /* Verdict wording is fixed per session and stored on the record (state.verdictLabelSet).
   * ?labels=proposed starts a session with the proposed wording awaiting author sign-off (data.js). */
  const verdictLabels = () => (state.verdictLabelSet === "proposed" ? D.VERDICT_LABELS_PROPOSED : CASE.verdictLabels);
  const hasProgress = () => Object.values(state.records).some((r) => r.imported) || state.appOpen;

  /* ---------- DOM refs ---------- */
  const desktopRoot = $("#desktop-root");
  const win = $("#app-window");
  const host = $("#workspace");
  const toolbar = $("#doc-toolbar");
  const layer = $("#modal-layer");
  const slot = $("#modal-slot");
  const live = $("#live");

  function announce(text) { live.textContent = ""; later(30, () => (live.textContent = text)); }

  /* ---------- derived view ---------- */
  function computeView() {
    if (state.stage === "complete") return "report";
    if (overlay.kind === "scanning") return "blank";
    const id = state.activeDocumentId;
    if (!id) return "empty";
    const doc = DOCS[id], r = rec(id);
    if (!(r.accuracyRun && r.representationRun)) return "checks";
    if (doc.final) return "final";
    if (!r.verdictSubmitted) return "verdict";
    if (state.stage !== "review" && doc.needsFix) return r.practiceFixAccepted ? "fix-saved" : "fix";
    return "saved";
  }
  const remainingReview = () => CASE.reviewDocs.some((id) => !rec(id).verdictSubmitted);
  const pendingFixes = () => CASE.fixDocs.filter((id) => !rec(id).practiceFixAccepted);

  /* ---------- rendering ---------- */
  let wsShape = null;
  function setRegion(el, html, animate = true) {
    if (!el || el._html === html) return false;
    el.innerHTML = html;
    if (animate && el._html !== undefined) { el.classList.remove("region-enter"); void el.offsetWidth; el.classList.add("region-enter"); }
    el._html = html;
    return true;
  }

  function render() {
    renderWindow();
    renderToolbar();
    renderWorkspace();
  }

  function renderWindow() {
    const visible = state.appOpen && !state.minimised;
    if (visible && win.hidden) { win.hidden = false; replayClass(win, "is-opening"); }
    if (!visible && !win.hidden && !win.classList.contains("is-closing") && !win.classList.contains("is-minimising")) win.hidden = true;
    win.classList.toggle("is-maximised", !!state.maximised);
    $('[data-win="maximise"]').setAttribute("aria-label", state.maximised ? "Restore" : "Maximise");
    const task = $("#task-app");
    task.classList.toggle("is-running", state.appOpen);
    task.classList.toggle("is-active", visible);
  }
  function replayClass(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  function renderToolbar() {
    const view = computeView();
    const id = overlay.kind === "scanning" ? overlay.documentId : state.activeDocumentId;
    if (view === "report") {
      toolbar.hidden = false;
      $("#toolbar-icon").innerHTML = icon("report", 20);
      $("#toolbar-name").textContent = "Audit report";
      $("#toolbar-import").hidden = true;
    } else if (id) {
      toolbar.hidden = false;
      $("#toolbar-icon").innerHTML = icon("doc", 20);
      $("#toolbar-name").textContent = DOCS[id].file;
      $("#toolbar-import").hidden = false;
    } else toolbar.hidden = true;
  }

  function renderWorkspace() {
    const view = computeView();
    const id = state.activeDocumentId;
    const shape = view === "empty" || view === "blank" || view === "report" ? view : "doc:" + id;
    if (shape !== wsShape) {
      wsShape = shape;
      if (view === "empty") host.innerHTML = `<div class="ws-empty ws-enter stagger">` +
        `<button class="cta-orb" type="button" data-action="import" aria-label="Import document"><span class="cta-pulse" aria-hidden="true"></span><span class="cta-face">${icon("import", 40)}<span>Import</span></span></button>` +
        `<h1 class="hero-title">Review the handouts</h1><p class="hero-sub">Import a handout to start your audit.</p></div>`;
      else if (view === "blank") host.innerHTML = "";
      else if (view === "report") host.innerHTML = `<div class="report ws-enter"><section class="report-main" id="report-main"></section><aside class="report-side" id="report-side"></aside></div>`;
      else host.innerHTML = `<div class="workspace ws-enter"><section class="source-region" aria-label="Source"><article class="paper"><header class="paper-head">${icon("doc", 18)}<span>${esc(DOCS[id].file)}</span></header><p class="source-text">${esc(DOCS[id].text)}</p></article><div id="source-extra"></div></section><section class="action-region" id="action-region" aria-label="Actions"></section></div>`;
    }
    if (view === "report") { renderReport(); return; }
    if (shape.startsWith("doc:")) {
      setRegion($("#source-extra"), sourceExtraHTML(id));
      const act = $("#action-region");
      act.classList.toggle("is-final", view === "final");
      if (setRegion(act, actionHTML(view, id))) hydrateAction(view, id);
    }
  }

  function findingHTML(id, kind) {
    const f = DOCS[id][kind];
    return `<li><button class="finding-row" type="button" data-action="reopen" data-check="${kind}" aria-label="${cap(kind)}: ${esc(f.status)}. Reopen finding">` +
      `${badge(kind, 20)}<span class="finding-line"><span class="finding-kind">${cap(kind)}</span><span class="finding-status tone-${f.tone}">${esc(f.status)}</span></span>` +
      (f.detail ? `<span class="finding-detail">${esc(f.detail)}</span>` : `<span></span>`) + `</button></li>`;
  }
  function sourceExtraHTML(id) {
    const r = rec(id);
    const rows = ["accuracy", "representation"].filter((k) => r[k + "Run"]).map((k) => findingHTML(id, k)).join("");
    let html = rows ? `<ul class="findings" aria-label="Findings">${rows}</ul>` : "";
    if (r.verdictSubmitted && !DOCS[id].final) html += `<p class="saved-verdict">Your verdict: <strong>${esc(r.verdictSubmitted)}</strong></p>`;
    return html;
  }

  function actionHTML(view, id) {
    const r = rec(id);
    const nextImport = `<button class="secondary-button next-import" type="button" data-action="import">${icon("import", 20)}Import document</button>`;
    const PROMPT = { accuracy: "Do the facts hold up?", representation: "Whose contexts are included?" };
    switch (view) {
      case "checks": {
        const btn = (k) => r[k + "Run"] ? "" : `<button class="check-tile" type="button" data-action="check" data-check="${k}">${badge(k, 24)}<span><strong>Check ${k}</strong><small>${PROMPT[k]}</small></span>${CHEVRON}</button>`;
        return `<p class="action-eyebrow">Run both checks</p><div class="check-stack stagger">${btn("accuracy")}${btn("representation")}</div>`;
      }
      case "verdict":
        return `<h2 class="form-heading" id="verdict-heading">Your verdict</h2>` +
          `<div class="verdict-options stagger" role="radiogroup" aria-labelledby="verdict-heading">` +
          verdictLabels().map((l, i) => `<label class="verdict-option"><input type="radio" name="verdict" value="${esc(l)}" ${r.verdictDraft === l ? "checked" : ""} id="v${i}"><span class="radio-glyph" aria-hidden="true"></span><span>${esc(l)}</span></label>`).join("") +
          `</div><button class="primary-button verdict-save" type="button" data-action="save-verdict" ${r.verdictDraft ? "" : "disabled"}>Save verdict</button>`;
      case "fix":
        return `<div class="fix-head"><label class="field-label" for="fix-input">Your fix</label></div><textarea id="fix-input" class="fix-input" data-fix="${id}" spellcheck="true"></textarea>` +
          `<div class="fix-actions">${fixFeedback[id] ? `<p class="fix-feedback" role="status">${esc(fixFeedback[id])}</p>` : ""}<button class="primary-button" type="button" data-action="save-fix">Save fix</button></div>`;
      case "fix-saved":
        return `<div class="fix-head"><p class="field-label">Your fix</p><span class="saved-chip">${icon("check", 16)}Saved</span></div><p class="saved-fix">${esc(r.fixSubmitted)}</p>` + nextImport;
      case "saved": {
        // a calm confirmation so the column isn't empty; the next step is the only action
        const next = state.stage === "review" ? "Import the next handout to continue."
          : state.stage === "practice-fixes" ? (DOCS[id].needsFix ? "Import a handout that needs a fix." : "This handout needs no fix. Import one that does.")
          : "Import the final document when you’re ready.";
        return `<div class="saved-card stagger"><span class="saved-badge" aria-hidden="true">${icon("check", 26)}</span><h2 class="form-heading">Verdict saved</h2><p class="saved-sub">${next}</p>${nextImport}</div>`;
      }
      case "final":
        return `<label class="field-label" for="final-verdict">Your verdict</label><div class="select-wrap"><select id="final-verdict" data-final-verdict>` +
          `<option value="" ${r.verdictDraft ? "" : "selected"} disabled>Choose a verdict</option>` +
          verdictLabels().map((l) => `<option ${r.verdictDraft === l ? "selected" : ""}>${esc(l)}</option>`).join("") +
          `</select><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></div>` +
          `<label class="field-label" for="fix-input">Your fix</label><textarea id="fix-input" class="fix-input" data-fix="${id}" spellcheck="true"></textarea>` +
          `<div class="fix-actions"><button class="primary-button full-width" type="button" data-action="submit-final">Submit review</button></div>`;
    }
    return "";
  }

  function hydrateAction(view, id) {
    const ta = $("#fix-input");
    if (ta) ta.value = rec(id).fixDraft;
    syncSubmitState(id);
  }
  function syncSubmitState(id) {
    const r = rec(id);
    const fixBtn = $('[data-action="save-fix"]');
    if (fixBtn) fixBtn.disabled = !r.fixDraft.trim();
    const submit = $('[data-action="submit-final"]');
    if (submit) submit.disabled = !canSubmitFinal(r);
  }
  const canSaveVerdict = (r) => r.accuracyRun && r.representationRun && r.verdictDraft !== null && !r.finalSubmitted;
  const canSubmitFinal = (r) => canSaveVerdict(r) && r.fixDraft.trim().length > 0 && !r.finalSubmitted;

  function renderReport() {
    const ids = Object.keys(DOCS).filter((id) => CASE.reviewDocs.includes(id) || id === CASE.finalDoc);
    if (!state.reportSelected || !ids.includes(state.reportSelected)) state.reportSelected = CASE.finalDoc || CASE.fixDocs[CASE.fixDocs.length - 1];
    const main = `<h2 class="report-heading">Audit report</h2><table class="report-table"><thead><tr><th scope="col">Document</th><th scope="col">Accuracy</th><th scope="col">Representation</th><th scope="col">Fix</th></tr></thead><tbody>` +
      ids.map((id) => {
        const d = DOCS[id], sel = state.reportSelected === id;
        const fix = d.needsFix
          ? `<button class="secondary-button view-button" type="button" data-action="view" data-id="${id}" aria-pressed="${sel}">${icon("eye", 18)}View</button>`
          : `<span aria-label="No fix needed">—</span>`;
        return `<tr data-row="${id}" class="${sel ? "is-selected" : ""}"><td><span class="doc-cell">${icon("doc", 20)}${esc(d.title)}</span></td><td class="tone-${d.accuracy.tone}">${esc(d.accuracy.status)}</td><td class="tone-${d.representation.tone}">${esc(d.representation.status)}</td><td>${fix}</td></tr>`;
      }).join("") + `</tbody></table>`;
    const changed = setRegion($("#report-main"), main, false);
    const id = state.reportSelected, d = DOCS[id], r = rec(id);
    let detail = `<div class="record-detail" aria-live="polite"><h3>${d.needsFix ? "Recorded fix" : "Recorded review"}</h3><dl class="record-meta">` +
      `<dt>Document</dt><dd>${esc(d.file)}</dd><dt>Your verdict</dt><dd>${esc(r.verdictSubmitted || "Not recorded")}</dd>` +
      `<dt>Accuracy</dt><dd>${esc(d.accuracy.status)}</dd><dt>Representation</dt><dd>${esc(d.representation.status)}</dd></dl>`;
    if (!d.needsFix) detail += `<p class="record-fix">No fix was needed.</p>`;
    else detail += `<p class="record-fix">${esc(r.fixSubmitted || "No fix recorded.")}</p>`;
    if (d.final && r.finalAssessment) detail += `<p class="record-note">${esc(r.finalAssessment.note)}</p>`;
    detail += `</div><button class="primary-button finish-button" type="button" data-action="finish">Finish</button>`;
    setRegion($("#report-side"), detail, !changed);
  }

  /* ---------- overlays (one at a time) ----------
   * One dark central card. While a scan or check runs, a dot cloud swirls above a status line that
   * changes once part-way through (the Digi-Teach "work happens out of sight, then the reply lands"
   * pattern). When the result lands the dots gather and calm, and the finding rises in line by line. */
  const PHRASES = {
    scanning: ["Reading the file\u2026", "Laying out the text\u2026"],
    accuracy: ["Reading the claims\u2026", "Comparing with the reference\u2026"],
    representation: ["Reading the examples\u2026", "Looking at the range of contexts\u2026"]
  };
  const PHRASE_SWAP_MS = 700;
  const cloudMode = (kind) => (kind === "scanning" || kind === "working" ? "work" : "rest");
  function dialogVisual(kind) {
    const doc = kind === "final-ready" ? `<span class="cloud-doc">${icon("doc", 40)}</span>` : "";
    return `<canvas class="dot-cloud-canvas" aria-hidden="true"></canvas>${doc}`;
  }
  function dialogBody(o) {
    switch (o.kind) {
      case "scanning":
        return `<div class="dialog-status"><h2 id="dlg-title">Scanning document</h2><p class="dialog-sub" data-phrase>${PHRASES.scanning[0]}</p></div>`;
      case "working":
        return `<div class="dialog-status"><h2 id="dlg-title">Checking ${o.check}</h2><p class="dialog-sub" data-phrase>${PHRASES[o.check][0]}</p></div>`;
      case "finding": {
        const f = DOCS[o.documentId][o.check];
        const title = f.heading || f.status;
        const eyebrow = f.heading ? DOCS[o.documentId].file : cap(o.check);
        return `<div class="dialog-body dialog-reveal"><span class="dialog-eyebrow">${esc(eyebrow)}</span><h2 id="dlg-title" class="${f.heading ? "" : "tone-" + f.tone}">${esc(title)}</h2>` +
          (f.detail ? `<p>${esc(f.detail)}</p>` : "") +
          `<div class="dialog-actions"><button class="light-button" type="button" data-action="dialog-continue">Continue</button></div></div>`;
      }
      case "final-ready":
        return `<div class="dialog-body dialog-center dialog-reveal"><h2 id="dlg-title">Final document ready</h2><p class="dialog-eyebrow">${esc(DOCS[CASE.finalDoc].file)}</p>` +
          `<div class="dialog-actions"><button class="light-button" type="button" data-action="choose-final">Choose file</button></div></div>`;
      case "error":
        return `<div class="dialog-body dialog-center dialog-reveal"><h2 id="dlg-title">${esc(o.message)}</h2><div class="dialog-actions">` +
          `<button class="light-button" type="button" data-action="error-retry">Retry</button><button class="ghost-button" type="button" data-action="error-cancel">Cancel</button></div></div>`;
    }
    return "";
  }
  const dismissible = (o) => o.kind === "finding" || o.kind === "final-ready" || o.kind === "picker";

  function showOverlay(o) {
    const prev = overlay;
    o.trigger = o.trigger || prev.trigger || (document.activeElement !== document.body ? document.activeElement : null);
    overlay = o;
    desktopRoot.inert = true;
    layer.hidden = false;
    layer.classList.remove("is-closing");
    if (o.kind === "picker") { renderPicker(); render(); return; }
    let dlg = slot.querySelector(".dialog");
    const busy = cloudMode(o.kind) === "work";
    const close = dismissible(o) ? `<button class="dialog-close" type="button" data-action="dialog-close" aria-label="Close">${CLOSE_SVG}</button>` : "";
    if (dlg && prev.kind !== "picker" && prev.kind !== "none") {
      // same central card: the cloud keeps running and changes mode; the text crossfades
      dlg.style.animation = "none";
      dlg.querySelector(".cloud-doc")?.remove();
      if (o.kind === "final-ready") dlg.querySelector(".dialog-visual").insertAdjacentHTML("beforeend", `<span class="cloud-doc">${icon("doc", 40)}</span>`);
      dlg.querySelector(".dialog-close")?.remove();
      if (close) dlg.insertAdjacentHTML("afterbegin", close);
      dlg.querySelector(".dialog-content").outerHTML = `<div class="dialog-content">${dialogBody(o)}</div>`;
    } else {
      slot.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" tabindex="-1">` +
        close + `<div class="dialog-visual">${dialogVisual(o.kind)}</div><div class="dialog-content">${dialogBody(o)}</div></div>`;
      dlg = slot.querySelector(".dialog");
      dlg._cloud = window.DotCloud ? window.DotCloud(dlg.querySelector("canvas"), { mode: cloudMode(o.kind), seed: 97 }) : null;
    }
    dlg.classList.toggle("is-busy", busy);
    dlg.classList.toggle("is-resting", !busy);
    if (dlg._cloud) dlg._cloud.setMode(cloudMode(o.kind));
    if (busy) {
      const op = o.operationId, key = o.kind === "scanning" ? "scanning" : o.check;
      later(PHRASE_SWAP_MS, () => {
        if (overlay.operationId !== op || overlay.kind !== o.kind) return;
        const line = slot.querySelector("[data-phrase]");
        if (line) line.textContent = PHRASES[key][1];
      });
    }
    (dlg.querySelector(".dialog-content button") || dlg).focus({ preventScroll: true });
    render();
  }

  function closeOverlay(after) {
    const trigger = overlay.trigger;
    overlay = { kind: "none" };
    picker = null;
    layer.classList.add("is-closing");
    later(EXIT_MS, () => {
      if (overlay.kind !== "none") return;
      layer.hidden = true;
      layer.classList.remove("is-closing");
      slot.innerHTML = "";
      desktopRoot.inert = false;
      if (trigger && trigger.isConnected && trigger.offsetParent !== null) trigger.focus({ preventScroll: true });
      else focusWorkspace();
      after && after();
    });
    render();
  }
  function focusWorkspace() {
    const target = host.querySelector("#action-region button:not(:disabled), #action-region textarea, #action-region input, #action-region select, .ws-empty button, .report button");
    if (target && !win.hidden) target.focus({ preventScroll: true });
  }

  /* ---------- operations ---------- */
  function importDocument(id) {
    if (!DOCS[id]) return;
    if (state.stage === "complete") { openApp(); return; }
    openApp();
    const r = rec(id);
    if (r.imported) {
      state.activeDocumentId = id; save(); render();
      announce(`${DOCS[id].file} opened`); focusWorkspace();
      return;
    }
    const op = ++opSeq;
    showOverlay({ kind: "scanning", documentId: id, operationId: op, trigger: null });
    announce("Scanning document");
    later(TIMING.scan, () => {
      if (overlay.kind !== "scanning" || overlay.operationId !== op) return; // late or cancelled completion
      if (failOnce.delete("scan")) { showOverlay({ kind: "error", message: "The document could not be scanned.", retry: () => importDocument(id) }); return; }
      r.imported = true; r.importedAt = new Date().toISOString();
      state.activeDocumentId = id; save();
      closeOverlay(() => announce(`${DOCS[id].file} loaded`));
    });
  }

  function runCheck(kind) {
    const id = state.activeDocumentId;
    if (!id || overlay.kind !== "none") return;
    const r = rec(id);
    if (r[kind + "Run"]) { openFinding(id, kind); return; }
    const op = ++opSeq;
    showOverlay({ kind: "working", documentId: id, check: kind, operationId: op });
    announce(`Checking ${kind}`);
    later(TIMING.check, () => {
      if (overlay.kind !== "working" || overlay.operationId !== op || overlay.documentId !== id) return;
      if (failOnce.delete("check")) { showOverlay({ kind: "error", message: `The ${kind} check could not finish.`, retry: () => { closeOverlay(() => runCheck(kind)); } }); return; }
      r[kind + "Run"] = true;
      r.checkLog.push({ check: kind, at: new Date().toISOString() });
      save();
      showOverlay({ kind: "finding", documentId: id, check: kind });
      announce(`${cap(kind)} finding: ${DOCS[id][kind].heading || DOCS[id][kind].status}`);
    });
  }
  function openFinding(id, kind) { showOverlay({ kind: "finding", documentId: id, check: kind }); }

  function saveVerdict() {
    const id = state.activeDocumentId, r = rec(id);
    if (!canSaveVerdict(r) || r.verdictSubmitted) return;
    r.verdictSubmitted = r.verdictDraft;
    r.verdictSavedAt = new Date().toISOString();
    if (state.stage === "review" && !remainingReview()) {
      state.stage = "practice-fixes";
      if (!DOCS[id].needsFix) state.activeDocumentId = pendingFixes()[0];
    }
    save(); render(); focusWorkspace();
    announce("Verdict saved");
  }

  function saveFix() {
    const id = state.activeDocumentId, r = rec(id), d = DOCS[id];
    const text = r.fixDraft.trim();
    if (!text || state.stage !== "practice-fixes" || r.practiceFixAccepted) return;
    const result = D.checkPractice(d.fixRule, text);
    r.fixAttempts.push({ text, accepted: result.accepted, at: new Date().toISOString() });
    if (!result.accepted) {
      fixFeedback[id] = result.feedback; save(); render();
      $("#fix-input")?.focus();
      announce(result.feedback);
      return;
    }
    delete fixFeedback[id];
    r.fixSubmitted = text; r.practiceFixAccepted = true;
    const next = pendingFixes();
    if (next.length) {
      state.activeDocumentId = next[0];
      save(); render(); focusWorkspace(); announce("Fix saved");
    } else if (CASE.finalDoc) {
      state.stage = "independent"; state.finalFileAvailable = true;
      save(); render(); announce("Fix saved. Final document ready");
      showOverlay({ kind: "final-ready", trigger: $("#toolbar-import") });
    } else {
      state.stage = "complete"; save(); render(); focusWorkspace(); announce("Fix saved");
    }
  }

  function submitFinal() {
    const id = state.activeDocumentId, r = rec(id);
    if (!DOCS[id].final || !canSubmitFinal(r)) return;
    // atomic, one-time
    r.verdictSubmitted = r.verdictDraft;
    r.fixSubmitted = r.fixDraft.trim();
    r.finalSubmitted = true;
    r.submittedAt = new Date().toISOString();
    r.finalAssessment = D.assessFinal(r.fixSubmitted);
    state.stage = "complete";
    state.reportSelected = id;
    save(); render(); focusWorkspace();
    announce("Review submitted. Audit report shown");
  }

  function finish() {
    state.finished = true; save();
    closeApp();
    const detail = getRecord();
    window.dispatchEvent(new CustomEvent("review-desk:finish", { detail }));
  }
  function getRecord() {
    return JSON.parse(JSON.stringify({ ...state, assessmentWeights: D.ASSESSMENT.weights, speedScoring: false }));
  }

  /* ---------- window behaviour ---------- */
  function openApp() {
    if (state.appOpen && !state.minimised) return;
    if (!state.appOpen) replayClass($("#task-app"), "is-bouncing"); // the Dock icon bounces on launch
    state.appOpen = true; state.minimised = false;
    win.classList.remove("is-closing", "is-minimising");
    save(); render();
    later(0, () => { if (overlay.kind === "none") focusWorkspace(); });
  }
  function closeApp() {
    if (!state.appOpen) return;
    replayClass(win, "is-closing");
    later(EXIT_MS, () => {
      win.classList.remove("is-closing");
      state.appOpen = false; state.minimised = false; save(); win.hidden = true; render();
      $("#shortcut-app").focus({ preventScroll: true });
    });
  }
  function minimiseApp() {
    if (!state.appOpen || state.minimised) return;
    replayClass(win, "is-minimising");
    later(160, () => { win.classList.remove("is-minimising"); state.minimised = true; save(); win.hidden = true; render(); $("#task-app").focus({ preventScroll: true }); });
  }
  function toggleMaximise() { state.maximised = !state.maximised; save(); render(); }

  /* ---------- simulated file picker ---------- */
  const FOLDERS = { Home: ["Documents", "Pictures", "Music", "Videos"], Documents: ["Handouts"], Pictures: [], Music: [], Videos: [], Handouts: [] };
  const PARENT = { Documents: "Home", Pictures: "Home", Music: "Home", Videos: "Home", Handouts: "Documents", Home: null };
  function folderItems(name) {
    const folders = (FOLDERS[name] || []).map((f) => ({ type: "folder", id: "folder:" + f, name: f }));
    const files = name === "Handouts" ? CASE.folder.filter((id) => !DOCS[id].final || state.finalFileAvailable).map((id) => ({ type: "file", id, name: DOCS[id].file, modified: DOCS[id].modified })) : [];
    let items = folders.concat(files);
    if (picker.search) items = items.filter((i) => i.name.toLowerCase().includes(picker.search.toLowerCase()));
    return items;
  }
  function openPicker(mode, trigger) {
    picker = { mode, folder: "Handouts", back: [], forward: [], selected: null, search: "", fileName: "" };
    showOverlay({ kind: "picker", trigger: trigger || document.activeElement });
    $("#picker-list").focus({ preventScroll: true });
  }
  function navigate(folder, record = true) {
    if (record) { picker.back.push(picker.folder); picker.forward = []; }
    picker.folder = folder; picker.selected = null; picker.search = ""; picker.fileName = "";
    renderPicker(); $("#picker-list").focus({ preventScroll: true });
  }
  function crumbs(folder) { const out = []; for (let f = folder; f; f = PARENT[f]) out.unshift(f); return out.length > 1 ? out.slice(1) : out; }

  function renderPicker() {
    const items = folderItems(picker.folder);
    const title = picker.mode === "handouts" ? "Handouts" : "Open";
    const sel = items.find((i) => i.id === picker.selected);
    const resolved = resolvePickerTarget(items);
    slot.innerHTML = `<div class="picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">` +
      `<div class="picker-title"><span class="traffic-lights"><button class="window-control light-close" type="button" data-action="picker-cancel" aria-label="Close"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/></svg></button><span class="light-dot"></span><span class="light-dot"></span></span><span id="picker-title">${title}</span></div>` +
      `<div class="picker-nav"><button class="nav-button" type="button" data-action="nav-back" aria-label="Back" ${picker.back.length ? "" : "disabled"}>${icon("back", 18)}</button>` +
      `<button class="nav-button" type="button" data-action="nav-forward" aria-label="Forward" ${picker.forward.length ? "" : "disabled"}>${icon("forward", 18)}</button>` +
      `<button class="nav-button" type="button" data-action="nav-up" aria-label="Up one level" ${PARENT[picker.folder] ? "" : "disabled"}>${icon("up", 18)}</button>` +
      `<nav class="breadcrumb" aria-label="Location"><img src="assets/icons/folder.svg" alt="" width="18" height="18">${crumbs(picker.folder).map((c, i, a) => (i ? `<span class="sep" aria-hidden="true">›</span>` : "") + `<button type="button" data-action="nav-to" data-folder="${c}" ${i === a.length - 1 ? 'aria-current="location"' : ""}>${c}</button>`).join("")}</nav>` +
      `<input class="picker-search" type="search" placeholder="Search ${picker.folder}" aria-label="Search ${picker.folder}" value="${esc(picker.search)}" data-picker-search></div>` +
      `<div class="picker-body"><div class="picker-side"><p class="side-heading">Favourites</p><ul aria-label="Places">${[["Home", "home"], ["Documents", "folder"], ["Pictures", "image"], ["Music", "music"], ["Videos", "film"]].map(([p, ic]) => `<li><button type="button" data-action="nav-to" data-folder="${p}" aria-current="${crumbs(picker.folder)[0] === p || picker.folder === p}">${icon(ic, 17)}${p}</button></li>`).join("")}</ul></div>` +
      `<div class="picker-files"><div class="file-head" aria-hidden="true"><span>Name</span><span>Date modified</span></div>` +
      `<ul class="file-list" id="picker-list" role="listbox" tabindex="0" aria-label="${picker.folder}" ${sel ? `aria-activedescendant="row-${cssId(sel.id)}"` : ""}>` +
      (items.length ? items.map((i) => `<li class="file-row" role="option" id="row-${cssId(i.id)}" data-item="${esc(i.id)}" aria-selected="${i.id === picker.selected}">${i.type === "folder" ? `<img src="assets/icons/folder.svg" alt="" width="22" height="22">` : `<span class="file-doc">${icon("doc", 20)}</span>`}<span>${esc(i.name)}</span><span class="file-date">${esc(i.modified || "")}</span></li>`).join("")
        : `<li class="file-empty" role="presentation">This folder is empty.</li>`) +
      `</ul></div></div>` +
      `<div class="picker-foot"><label for="picker-name">File name:</label><input id="picker-name" type="text" autocomplete="off" value="${esc(picker.fileName)}" data-picker-name>` +
      `<button class="secondary-button" type="button" data-action="picker-cancel">Cancel</button><button class="primary-button" type="button" data-action="picker-open" ${resolved ? "" : "disabled"}>Open</button></div></div>`;
  }
  const cssId = (s) => s.replace(/[^\w-]/g, "_");
  function resolvePickerTarget(items) {
    items = items || folderItems(picker.folder);
    if (picker.selected) return items.find((i) => i.id === picker.selected) || null;
    const n = picker.fileName.trim().toLowerCase();
    if (!n) return null;
    return items.find((i) => i.name.toLowerCase() === n || (i.type === "file" && i.name.toLowerCase().replace(/\.docx$/, "") === n)) || null;
  }
  function pickerSelect(id) {
    picker.selected = id;
    const item = folderItems(picker.folder).find((i) => i.id === id);
    picker.fileName = item && item.type === "file" ? item.name : "";
    const list = $("#picker-list");
    list.querySelectorAll(".file-row").forEach((row) => row.setAttribute("aria-selected", String(row.dataset.item === id)));
    if (item) { list.setAttribute("aria-activedescendant", "row-" + cssId(id)); $("#row-" + cssId(id))?.scrollIntoView({ block: "nearest" }); }
    $("#picker-name").value = picker.fileName;
    $('[data-action="picker-open"]').disabled = !resolvePickerTarget();
  }
  function pickerOpen() {
    const target = resolvePickerTarget();
    if (!target) return;
    if (target.type === "folder") { navigate(target.name); return; }
    if (state.stage === "complete") { closeOverlay(openApp); return; }
    if (rec(target.id).imported) { closeOverlay(() => importDocument(target.id)); return; }
    // hand the picked file straight to the scan in the same modal layer (no scrim flicker)
    overlay = { kind: "none", trigger: overlay.trigger }; picker = null; slot.innerHTML = "";
    importDocument(target.id);
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    const row = e.target.closest(".report-table tbody tr");
    if (!t && row) { state.reportSelected = row.dataset.row; save(); renderReport(); return; }
    const fileRow = e.target.closest(".file-row[data-item]");
    if (fileRow && picker) { pickerSelect(fileRow.dataset.item); return; }
    if (!t) return;
    const a = t.dataset.action;
    switch (a) {
      case "import": openPicker("import", t); break;
      case "check": runCheck(t.dataset.check); break;
      case "reopen": openFinding(state.activeDocumentId, t.dataset.check); break;
      case "dialog-continue": case "dialog-close": closeOverlay(); break;
      case "choose-final": openPicker("import", overlay.trigger); break;
      case "save-verdict": saveVerdict(); break;
      case "save-fix": saveFix(); break;
      case "submit-final": submitFinal(); break;
      case "view": state.reportSelected = t.dataset.id; save(); renderReport(); $(`[data-action="view"][data-id="${t.dataset.id}"]`)?.focus(); break;
      case "finish": finish(); break;
      case "picker-cancel": closeOverlay(); break;
      case "picker-open": pickerOpen(); break;
      case "nav-back": if (picker.back.length) { picker.forward.push(picker.folder); navigate(picker.back.pop(), false); } break;
      case "nav-forward": if (picker.forward.length) { picker.back.push(picker.folder); navigate(picker.forward.pop(), false); } break;
      case "nav-up": if (PARENT[picker.folder]) navigate(PARENT[picker.folder]); break;
      case "nav-to": if (t.dataset.folder !== picker.folder) navigate(t.dataset.folder); break;
      case "error-retry": { const retry = overlay.retry; overlay = { kind: "none" }; retry && retry(); break; }
      case "error-cancel": closeOverlay(); break;
    }
  });
  document.addEventListener("dblclick", (e) => {
    const fileRow = e.target.closest(".file-row[data-item]");
    if (fileRow && picker) { pickerSelect(fileRow.dataset.item); pickerOpen(); return; }
    if (e.target.closest(".titlebar") && !e.target.closest(".window-control")) toggleMaximise();
  });
  document.addEventListener("change", (e) => {
    const id = state.activeDocumentId;
    if (e.target.name === "verdict") {
      rec(id).verdictDraft = e.target.value; save();
      $('[data-action="save-verdict"]').disabled = !canSaveVerdict(rec(id));
    } else if (e.target.matches("[data-final-verdict]")) {
      rec(id).verdictDraft = e.target.value || null; save(); syncSubmitState(id);
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.matches("[data-fix]")) {
      const id = e.target.dataset.fix;
      if (rec(id).finalSubmitted || rec(id).practiceFixAccepted) return;
      rec(id).fixDraft = e.target.value; save(); syncSubmitState(id);
    } else if (e.target.matches("[data-picker-search]")) {
      picker.search = e.target.value; picker.selected = null;
      const pos = e.target.selectionStart; renderPicker();
      const s = $("[data-picker-search]"); s.focus(); s.setSelectionRange(pos, pos);
    } else if (e.target.matches("[data-picker-name]")) {
      picker.fileName = e.target.value; picker.selected = null;
      $("#picker-list").querySelectorAll(".file-row").forEach((r) => r.setAttribute("aria-selected", "false"));
      $('[data-action="picker-open"]').disabled = !resolvePickerTarget();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (overlay.kind !== "none") {
      if (e.key === "Escape" && dismissible(overlay)) { e.preventDefault(); closeOverlay(); return; }
      if (e.key === "Tab") trapFocus(e);
      if (picker && e.target.id === "picker-list") pickerKeys(e);
      if (picker && e.key === "Enter" && e.target.matches("[data-picker-name]")) { e.preventDefault(); pickerOpen(); }
      return;
    }
    const open = document.querySelector(".menu-panel:not([hidden])");
    if (e.key === "Escape" && open) { const t = closeMenus(); t && t.focus(); return; }
    if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const items = [...open.querySelectorAll("button:not(:disabled)")];
      const i = items.indexOf(document.activeElement);
      const n = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[n]?.focus();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "o" || e.key === "O") && state.stage !== "complete") { e.preventDefault(); openPicker(state.appOpen && !state.minimised ? "import" : "handouts", document.activeElement); }
    if (mod && (e.key === "w" || e.key === "W") && state.appOpen && !state.minimised) { e.preventDefault(); closeApp(); }
  });
  function pickerKeys(e) {
    const items = folderItems(picker.folder);
    if (!items.length) return;
    const idx = items.findIndex((i) => i.id === picker.selected);
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const n = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx < 0 ? 0 : idx - 1);
      pickerSelect(items[n].id);
    } else if (e.key === "Enter") { e.preventDefault(); if (picker.selected) pickerOpen(); }
    else if (e.key === "Backspace" && PARENT[picker.folder]) { e.preventDefault(); navigate(PARENT[picker.folder]); }
  }
  function trapFocus(e) {
    const f = [...slot.querySelectorAll('button:not(:disabled), input, select, textarea, [tabindex="0"]')].filter((n) => n.offsetParent !== null);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !slot.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !slot.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }

  // window controls
  win.addEventListener("click", (e) => {
    const c = e.target.closest("[data-win]");
    if (!c) return;
    ({ minimise: minimiseApp, maximise: toggleMaximise, close: closeApp })[c.dataset.win]();
  });
  $("#toolbar-import").addEventListener("click", (e) => openPicker("import", e.currentTarget));

  // desktop shortcuts: select, double-click / Enter to open
  const shortcuts = [...document.querySelectorAll(".desktop-icon")];
  function selectShortcut(el) { shortcuts.forEach((s) => s.setAttribute("aria-selected", String(s === el))); }
  function activateShortcut(el) { selectShortcut(el); el.dataset.open === "app" ? openApp() : openPicker("handouts", el); }
  shortcuts.forEach((el) => {
    el.addEventListener("click", () => selectShortcut(el));
    el.addEventListener("dblclick", () => activateShortcut(el));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); activateShortcut(el); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = shortcuts[(shortcuts.indexOf(el) + (e.key === "ArrowDown" ? 1 : shortcuts.length - 1)) % shortcuts.length]; n.focus(); selectShortcut(n); }
    });
  });
  $(".wallpaper").addEventListener("click", () => selectShortcut(null));

  // Dock: clicking a running, visible app does nothing (as on a Mac); otherwise it opens or restores it
  $("#task-app").addEventListener("click", () => { if (!state.appOpen || state.minimised) openApp(); });
  $("#task-handouts").addEventListener("click", (e) => openPicker("handouts", e.currentTarget));

  // Menu bar: File and Help
  function closeMenus() {
    let trigger = null;
    document.querySelectorAll(".menu-panel").forEach((p) => {
      if (!p.hidden) trigger = document.querySelector(`[data-menu-open="${p.dataset.menuPanel}"]`);
      p.hidden = true;
    });
    document.querySelectorAll("[data-menu-open]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    return trigger;
  }
  document.querySelectorAll("[data-menu-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = document.querySelector(`[data-menu-panel="${btn.dataset.menuOpen}"]`);
      const wasOpen = !panel.hidden;
      closeMenus();
      if (!wasOpen) {
        panel.hidden = false; btn.setAttribute("aria-expanded", "true");
        const fileImport = panel.querySelector('[data-menu="import"]'), fileClose = panel.querySelector('[data-menu="close"]');
        if (fileImport) fileImport.disabled = state.stage === "complete";
        if (fileClose) fileClose.disabled = !state.appOpen || state.minimised;
        panel.querySelector("button:not(:disabled)")?.focus();
      }
    });
  });
  document.addEventListener("click", (e) => {
    const item = e.target.closest("[data-menu]");
    if (!item) return;
    closeMenus();
    if (item.dataset.menu === "walkthrough") showOrientation(true);
    else if (item.dataset.menu === "import") openPicker(state.appOpen && !state.minimised ? "import" : "handouts", item);
    else if (item.dataset.menu === "close") closeApp();
  });
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".menu")) closeMenus(); });

  // pause loops when the tab is hidden
  document.addEventListener("visibilitychange", () => document.documentElement.classList.toggle("is-hidden", document.hidden));

  // clock
  function tick() {
    if (DEMO) return;
    const d = new Date();
    $("#clock").textContent = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "") + "  " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  tick(); if (!DEMO) setInterval(tick, 15000);

  /* ---------- orientation (narrated walkthrough) ----------
   * Plays once with sound: the opener's Begin click is the user gesture that lets audio start.
   * If the browser still blocks sound it plays muted (captions switch on) and offers Sound on;
   * if it blocks playback altogether, the poster shows with Play. Ends on Replay rather than looping. */
  const orientation = $("#orientation");
  const video = $("#walkthrough");
  const playBtn = $("#orientation-play");
  const soundBtn = $("#orientation-sound");
  const ccBtn = $("#orientation-cc");
  const captionEl = $("#orientation-caption");
  const CUES = window.WALKTHROUGH_CUES || [];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let orientationReplay = false;
  let captionsOn = false;
  function setSound(on) {
    video.muted = !on;
    soundBtn.setAttribute("aria-pressed", String(on));
    soundBtn.querySelector("span").textContent = on ? "Sound on" : "Sound off";
  }
  function setCaptions(on) {
    captionsOn = on;
    ccBtn.setAttribute("aria-pressed", String(on));
    updateCaption();
  }
  function updateCaption() {
    const t = video.currentTime;
    const cue = captionsOn ? CUES.find((c) => t >= c.s && t <= c.e) : null;
    captionEl.hidden = !cue;
    if (cue && captionEl.textContent !== cue.t) captionEl.textContent = cue.t;
  }
  function showPlay(label) { playBtn.querySelector("span").textContent = label; playBtn.hidden = false; }
  function startVideo() {
    playBtn.hidden = true;
    setSound(true);
    const p = video.play();
    if (p && p.catch) p.catch(() => {
      // sound blocked: try muted with captions, otherwise wait for a click
      setSound(false); setCaptions(true);
      video.play().catch(() => showPlay("Play"));
    });
  }
  function showOrientation(replay) {
    orientationReplay = replay;
    $("#orientation-start").textContent = replay ? "Return to desktop" : "Start review";
    orientation.hidden = false;
    desktopRoot.inert = true;
    playBtn.hidden = true;
    video.currentTime = 0;
    if (reduceMotion.matches) { video.pause(); showPlay("Play"); }
    else startVideo();
    $("#orientation-start").focus({ preventScroll: true });
  }
  playBtn.addEventListener("click", () => { if (video.ended) video.currentTime = 0; startVideo(); });
  soundBtn.addEventListener("click", () => setSound(video.muted));
  ccBtn.addEventListener("click", () => setCaptions(!captionsOn));
  video.addEventListener("timeupdate", updateCaption);
  video.addEventListener("seeked", updateCaption);
  video.addEventListener("pause", () => { if (!orientation.hidden && !video.ended) showPlay("Play"); });
  video.addEventListener("ended", () => { captionEl.hidden = true; if (!orientation.hidden) showPlay("Replay"); });
  video.addEventListener("play", () => (playBtn.hidden = true));
  $("#orientation-start").addEventListener("click", () => {
    video.pause();
    orientation.hidden = true;
    captionEl.hidden = true;
    if (!orientationReplay) { state = freshState(); save(); wsShape = null; }
    desktopRoot.hidden = false; desktopRoot.inert = overlay.kind !== "none";
    render();
    $("#shortcut-app").focus({ preventScroll: true });
  });

  /* ---------- boot ----------
   * Fresh learners: opener (intro.js) → Begin → walkthrough → Start review → desktop.
   * Returning learners, ?skip-walkthrough and the render demo bypass the opener and the walkthrough. */
  const resumedAtBoot = DEMO || params.has("skip-walkthrough") || hasProgress();
  desktopRoot.hidden = false;
  if (!resumedAtBoot) desktopRoot.inert = true; // the opener is modal
  render();
  function startFromOpener() {
    if (resumedAtBoot) return;
    showOrientation(false);
  }

  window.ReviewDesk = {
    get state() { return state; }, get overlay() { return overlay; },
    getRecord, demo: DEMO, timing: TIMING,
    resumed: resumedAtBoot, start: startFromOpener,
    reset() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } state = freshState(); wsShape = null; render(); }
  };
  if (DEMO) { document.documentElement.classList.add("is-demo"); const s = document.createElement("script"); s.src = "tools/demo-timeline.js"; document.body.appendChild(s); }
})();
