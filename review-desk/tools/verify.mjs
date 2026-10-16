// End-to-end check of the real case in headless Chrome. Captures the twelve reference states and asserts the
// progressive-interaction rules from the spec. Usage: npm run verify   (screenshots -> tools/verify-shots/)
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "tools/verify-shots");
mkdirSync(SHOTS, { recursive: true });
const URL = pathToFileURL(join(ROOT, "index.html")).href;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

let passed = 0; const failures = [];
const ok = (cond, msg) => { if (cond) passed++; else failures.push(msg); console.log((cond ? "  ✓ " : "  ✗ ") + msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => page.screenshot({ path: join(SHOTS, name + ".png") });
const st = () => page.evaluate(() => window.ReviewDesk.state);
const ov = () => page.evaluate(() => window.ReviewDesk.overlay.kind);
const exists = (sel) => page.$(sel).then(Boolean);
const click = (sel) => page.click(sel);
async function waitOverlay(kind, timeout = 4000) { await page.waitForFunction((k) => window.ReviewDesk.overlay.kind === k, { timeout }, kind); await sleep(260); }
async function waitNone() { await page.waitForFunction(() => window.ReviewDesk.overlay.kind === "none" && document.getElementById("modal-layer").hidden, { timeout: 5000 }); await sleep(220); }
async function importDoc(file) {
  await page.evaluate(() => [...document.querySelectorAll('#toolbar-import, .ws-empty [data-action="import"], .next-import')].find((b) => b.offsetParent !== null).click());
  await waitOverlay("picker");
  await page.evaluate((f) => [...document.querySelectorAll(".file-row")].find((r) => r.textContent.includes(f)).click(), file);
  await click('[data-action="picker-open"]');
}
async function runCheck(kind) {
  await click(`[data-action="check"][data-check="${kind}"]`);
  await waitOverlay("working");
  await waitOverlay("finding", 4000);
}
async function checkBoth() {
  await runCheck("accuracy"); await click('[data-action="dialog-continue"]'); await waitNone();
  await runCheck("representation"); await click('[data-action="dialog-continue"]'); await waitNone();
}
async function typeFix(text) { await page.$eval("#fix-input", (t) => { t.value = ""; t.dispatchEvent(new Event("input", { bubbles: true })); }); await page.type("#fix-input", text, { delay: 2 }); }
async function fitsAt(w, h, sel, name) {
  await page.setViewport({ width: w, height: h }); await sleep(250);
  const r = await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); const ws = document.querySelector("#workspace").getBoundingClientRect(); return { b: b.bottom, ws: ws.bottom, sc: document.querySelector("#workspace").scrollHeight - document.querySelector("#workspace").clientHeight }; }, sel);
  await shot(name);
  await page.setViewport({ width: 1920, height: 1080 }); await sleep(150);
  return r.b <= r.ws && r.sc <= 1;
}

console.log("Opener");
await page.goto(URL + "?reset=1", { waitUntil: "load" });
await page.waitForSelector("#intro.st-begin", { timeout: 8000 });
ok(await page.$eval("#intro .intro-title", (e) => e.textContent === "Audit an AI Answer"), "opener shows the Review Desk title");
ok(await page.$eval("#intro .intro-sub", (e) => e.textContent === "AI Literacy · Unit 2.6"), "opener shows Unit 2.6");
ok(await page.$eval("#orientation", (e) => e.hidden), "walkthrough waits for Begin");
await shot("00a_opener");
await click("#intro .intro-begin"); await sleep(900);
ok(await page.$eval("#intro", (e) => e.classList.contains("gone")), "Begin removes the opener");

console.log("Orientation");
await sleep(400);
ok(!(await page.$eval("#orientation", (e) => e.hidden)), "orientation view shown before the desktop task");
ok(await page.$eval("#walkthrough", (v) => v.readyState >= 2 && v.duration > 60), "narrated walkthrough loads (about a minute)");
ok(await page.$eval("#walkthrough", (v) => !v.paused && !v.muted), "walkthrough plays with sound after Begin");
await click("#orientation-cc"); await page.waitForFunction(() => !document.getElementById("orientation-caption").hidden, { timeout: 4000 });
ok(await page.$eval("#orientation-caption", (e) => e.textContent.startsWith("Welcome to the Review Desk")), "captions follow the narration");
await click("#orientation-sound");
ok(await page.$eval("#walkthrough", (v) => v.muted), "Sound toggle mutes the narration");
await shot("00_orientation");
await click("#orientation-start");
ok(await page.$eval("#walkthrough", (v) => v.paused), "Start review stops the video");
ok((await st()).records.photosynthesis.imported === false && (await st()).stage === "review", "Start review opens a clean session");

console.log("Desktop and window");
await sleep(200); await shot("01_desktop");
ok(await page.$eval("#app-window", (e) => e.hidden), "desktop starts with the app closed");
await page.click("#shortcut-app", { count: 2 }); await sleep(800);
ok(!(await page.$eval("#app-window", (e) => e.hidden)), "double-click opens Review Desk");
const wr = await page.$eval("#app-window", (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
ok(wr[0] === 140 && wr[1] === 44 && wr[3] === 944, `Mac window bounds x140 y44 h944 (got ${wr.join(",")})`);
ok(!(await exists('[data-action="check"]')) && (await exists('.ws-empty [data-action="import"]')), "fresh app shows only Import document");
ok(await exists(".ws-empty .cta-orb") && !(await exists("img[src*='assets/art']")), "empty app shows the round Import action; no 3D art remains");
ok(await exists(".menubar") && await exists(".dock #task-app") && await exists(".traffic-lights .light-close"), "macOS chrome: menu bar, Dock and traffic lights");
await shot("02_empty_app");

console.log("Picker");
await click('.ws-empty [data-action="import"]'); await waitOverlay("picker");
const files = await page.$$eval(".file-row", (rs) => rs.map((r) => r.textContent));
ok(files.length === 3 && !files.join().includes("Malaria"), "picker lists the three initial documents only");
ok(await page.$eval('[data-action="picker-open"]', (b) => b.disabled), "Open requires a selection");
await page.focus("#picker-list"); await page.keyboard.press("ArrowDown");
ok(await page.$eval("#picker-name", (i) => i.value === "Photosynthesis.docx"), "arrow keys select a file row");
await shot("03_file_picker");
await page.keyboard.press("Escape"); await waitNone();
ok((await st()).activeDocumentId === null && (await exists(".ws-empty")), "cancelling the picker leaves state intact");

console.log("Import and scan");
await importDoc("Photosynthesis.docx");
await page.waitForFunction(() => window.ReviewDesk.overlay.kind === "scanning"); await sleep(450);
ok(!(await exists('[data-action="check"]')) && !(await exists(".source-text")), "source and checks concealed while scanning");
ok(await page.$eval("#dlg-title", (e) => e.textContent === "Scanning document"), "scan label is 'Scanning document'");
const dlg = await page.$eval(".dialog", (e) => [e.getBoundingClientRect().width, !!e.querySelector("canvas.dot-cloud-canvas"), !e.querySelector(".dialog-visual-bg, .scan-art, .orb-particle")]);
ok(dlg[0] === 420 && dlg[1] && dlg[2], `dark 420 px pop-up with the dot cloud and no image band (got ${dlg})`);
ok(await page.$eval("[data-phrase]", (e) => e.textContent === "Reading the file…"), "status line starts with the first phrase");
await sleep(500);
ok(await page.$eval("[data-phrase]", (e) => e.textContent === "Laying out the text…"), "status line changes part-way through");
ok(await page.$eval(".dot-cloud-canvas", (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n > 50; }), "dot cloud is drawing");
await shot("04_document_scan");
await waitNone();
let s = await st();
ok(!s.records.photosynthesis.accuracyRun && !s.records.photosynthesis.representationRun, "import does not count as a check");
ok((await exists('[data-check="accuracy"]')) && (await exists('[data-check="representation"]')) && !(await exists(".verdict-options")), "loaded document shows two independent checks, no verdict");
await shot("05_document_loaded");

console.log("Checks");
await click('[data-check="representation"]'); await waitOverlay("working");
ok(await page.$eval("#dlg-title", (e) => e.textContent === "Checking representation"), "working label names only the active operation");
ok(await page.$eval(".dialog", (e) => e.classList.contains("is-busy")) && (await page.$$(".dialog canvas")).length === 1, "one dot cloud, in its working mode");
await shot("06_ai_working");
await waitOverlay("finding");
ok(await page.$eval(".dialog", (e) => e.classList.contains("is-resting") && !!e.querySelector(".dialog-reveal")), "result lands in the same card: cloud rests, finding rises in");
s = await st();
ok(s.records.photosynthesis.representationRun && !s.records.photosynthesis.accuracyRun, "requesting one check does not run the other");
await shot("07_result_reveal");
await click('[data-action="dialog-continue"]'); await waitNone();
ok(!(await exists(".verdict-options")) && (await exists('[data-action="check"][data-check="accuracy"]')) && !(await exists('[data-action="check"][data-check="representation"]')), "remaining check shown; verdict still hidden");
await click('[data-action="reopen"][data-check="representation"]');
await sleep(60);
ok((await ov()) === "finding", "reopening a finding is immediate (no fake analysis)");
await page.keyboard.press("Escape"); await waitNone();
ok(await page.evaluate(() => document.activeElement?.dataset.action === "reopen"), "Escape returns focus to the trigger");
await runCheck("accuracy"); await click('[data-action="dialog-continue"]'); await waitNone();
ok(await exists(".verdict-options"), "verdict appears after both checks");
ok(await page.$eval('[data-action="save-verdict"]', (b) => b.disabled) && !(await page.$('input[name="verdict"]:checked')), "no default verdict; Save disabled");
await shot("08_verdict");
ok(await fitsAt(1366, 768, '[data-action="save-verdict"]', "08_verdict_1366"), "verdict action visible at 1366 × 768");
await page.click(".verdict-option:nth-child(2)"); await click('[data-action="save-verdict"]'); await sleep(250);
ok((await st()).records.photosynthesis.verdictSubmitted === "Accurate but Narrow" && !(await exists("#fix-input")), "verdict saved; no fix before all three verdicts");

console.log("Remaining practice documents");
await importDoc("Human heart.docx"); await waitOverlay("scanning"); await waitNone(); await checkBoth();
await page.click(".verdict-option:nth-child(3)"); await click('[data-action="save-verdict"]'); await sleep(250);
ok((await st()).stage === "review", "two verdicts do not unlock practice fixes");
await importDoc("Classroom debate.docx"); await waitOverlay("scanning"); await waitNone(); await checkBoth();
await page.click(".verdict-option:nth-child(1)"); await click('[data-action="save-verdict"]'); await sleep(300);
s = await st();
ok(s.stage === "practice-fixes" && s.activeDocumentId === "photosynthesis", "third verdict unlocks fixes and brings a flawed excerpt forward");
ok(await page.$eval("#fix-input", (t) => t.value === ""), "fix field starts empty");
await shot("09_write_fix");

console.log("Practice fixes");
await typeFix("Add more examples from other places."); await click('[data-action="save-fix"]'); await sleep(250);
ok(await page.$eval(".fix-feedback", (e) => e.textContent === "Name a specific example."), "generic fix gets contextual feedback after saving");
await importDoc("Human heart.docx"); await sleep(400);
await importDoc("Photosynthesis.docx"); await sleep(400);
ok(await page.$eval("#fix-input", (t) => t.value === "Add more examples from other places."), "draft preserved across file switching");
await typeFix("Add tropical examples such as cassava and oil palm, which also photosynthesise using chlorophyll."); await click('[data-action="save-fix"]'); await sleep(350);
ok((await st()).activeDocumentId === "heart", "accepted fix brings the other correction into the workspace");
await typeFix("The heart has four chambers, not three."); await click('[data-action="save-fix"]'); await sleep(250);
ok(await page.$eval(".fix-feedback", (e) => e.textContent === "State the corrected fact."), "incomplete heart correction is not accepted");
await typeFix("The heart does not have four chambers and two ventricles."); await click('[data-action="save-fix"]'); await sleep(250);
ok(await exists(".fix-feedback"), "negated correction is not accepted");
await typeFix("The human heart has four chambers: two atria and two ventricles."); await click('[data-action="save-fix"]');
await waitOverlay("final-ready");
s = await st();
ok(s.stage === "independent" && s.finalFileAvailable && !s.records.malaria.imported, "final document announced but not auto-loaded");
await shot("10_document_update");
await page.keyboard.press("Escape"); await waitNone();
await click("#toolbar-import"); await waitOverlay("picker");
ok((await page.$$eval(".file-row", (rs) => rs.map((r) => r.textContent).join())).includes("Malaria.docx"), "dismissed notice keeps Malaria.docx available");
await page.keyboard.press("Escape"); await waitNone();

console.log("Independent final review");
await importDoc("Malaria.docx"); await waitOverlay("scanning"); await waitNone();
ok(!(await exists(".fix-feedback")) && !(await exists("#fix-input")), "final document starts with checks only, no hints");
await checkBoth();
await page.select("#final-verdict", "Inaccurate and Narrow");
ok(await page.$eval('[data-action="submit-final"]', (b) => b.disabled), "submit needs a non-empty fix");
ok(await page.$eval("#fix-input", (t) => t.value === ""), "final fix field starts empty");
await shot("11_independent_review");
ok(await fitsAt(1366, 768, '[data-action="submit-final"]', "11_independent_review_1366"), "Submit review visible at 1366 × 768");
await typeFix("Malaria is caused by a Plasmodium parasite spread by mosquitoes and is treated with antimalarial medicines such as artemisinin combination therapy.");
await click('[data-action="submit-final"]'); await sleep(400);
s = await st();
ok(s.records.malaria.finalSubmitted && s.stage === "complete", "one final submission recorded");
ok(!(await exists('[data-action="submit-final"]')) && !(await exists("#fix-input")), "no post-submission retry");
ok(await page.$eval("#toolbar-name", (e) => e.textContent === "Audit report"), "toolbar context is Audit report");
ok(await page.$eval(".record-note", (e) => e.textContent === "The factual correction is recorded. Regional representation was not addressed."), "missed dimension stated plainly");
await shot("12_report");
ok(await fitsAt(1366, 768, ".finish-button", "12_report_1366"), "Finish visible at 1366 × 768");
await click('[data-action="view"][data-id="heart"]'); await sleep(200);
ok(await page.$eval(".record-meta", (e) => e.textContent.includes("Inaccurate but Representative")), "report shows the learner's own verdict, not the expected one");
ok(await page.$eval(".record-fix", (e) => e.textContent.startsWith("The human heart has four chambers")), "selected row shows the learner's actual fix");

console.log("Window continuity");
await click('[data-win="minimise"]'); await sleep(450);
ok(await page.$eval("#app-window", (e) => e.hidden), "minimise hides the window");
await click("#task-app"); await sleep(800);
ok(!(await page.$eval("#app-window", (e) => e.hidden)), "taskbar restores the window");
await click('[data-win="maximise"]'); await sleep(100);
ok(await page.$eval("#app-window", (e) => e.getBoundingClientRect().width === 1920), "zoom fills the screen between menu bar and Dock");
await click('[data-win="maximise"]');
await click('[data-win="close"]'); await sleep(300);
await page.goto(URL, { waitUntil: "load" }); await sleep(500);
ok(await page.$eval("#orientation", (e) => e.hidden), "reload with progress skips orientation");
await page.click("#shortcut-app", { count: 2 }); await sleep(400);
ok(await exists(".report-table"), "reopening restores the recorded session");

console.log("Reduced motion");
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await page.goto(URL + "?reset=1", { waitUntil: "load" }); await sleep(500);
ok(await page.$eval("#intro", (e) => e.classList.contains("st-begin")), "reduced motion: opener shows its finished frame");
await click("#intro .intro-begin"); await sleep(100);
ok(await page.$eval("#walkthrough", (v) => v.paused) && !(await page.$eval("#orientation-play", (b) => b.hidden)), "reduced motion shows the poster with Play");
await click("#orientation-start"); await page.click("#shortcut-app", { count: 2 }); await sleep(200);
await importDoc("Photosynthesis.docx"); await page.waitForFunction(() => window.ReviewDesk.overlay.kind === "scanning");
ok(await page.$eval("[data-phrase]", (b) => getComputedStyle(b).animationName === "none") && await page.$eval("#dlg-title", (e) => e.textContent === "Scanning document"), "reduced motion: still dot cloud, label preserved");

console.log("Proposed verdict wording");
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
await page.goto(URL + "?reset=1&labels=proposed&skipintro&skip-walkthrough", { waitUntil: "load" }); await sleep(400);
await page.click("#shortcut-app", { count: 2 }); await sleep(800);
await importDoc("Human heart.docx"); await waitOverlay("scanning"); await waitNone(); await checkBoth();
const labels = await page.$$eval(".verdict-option", (els) => els.map((e) => e.textContent.trim()));
ok(labels.join("|") === "Accurate; no representation issue|Accurate but narrow|Inaccurate; no representation issue|Inaccurate and narrow", "?labels=proposed shows the proposed wording");
ok((await st()).verdictLabelSet === "proposed", "the wording used is stored on the learner record");

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed${errors.length ? ", page errors: " + errors.join(" | ") : ", no page errors"}`);
if (failures.length || errors.length) process.exit(1);
