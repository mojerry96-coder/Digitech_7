// Checks an opener page against the OPENER.md sign-off checklist.
// Usage: node verify-opener.mjs <page.html> [--query=?reset=1]
//   node verify-opener.mjs ../../fix-the-prompt-opener/preview.html
//   node verify-opener.mjs ../index.html --query=?reset=1
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const page_ = process.argv[2];
const query = (process.argv.find((a) => a.startsWith("--query=")) || "--query=").slice(8);
const URL = pathToFileURL(resolve(page_)).href + query;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
let passed = 0; const failures = []; const errors = [];
const ok = (c, m) => { c ? passed++ : failures.push(m); console.log((c ? "  ✓ " : "  ✗ ") + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// In-page sampler: every animation frame, record visible logos' extent, overlap and stage.
const SAMPLER = `(() => {
  window.__samples = []; window.__begun = false;
  window.addEventListener("intro:begin", () => (window.__begun = true));
  const tick = () => {
    const intro = document.getElementById("intro");
    if (intro) {
      const logos = [...intro.querySelectorAll(".intro-logo")];
      const vis = logos.map((e) => ({ op: +getComputedStyle(e).opacity, r: e.getBoundingClientRect() })).filter((l) => l.op > 0.02);
      let overlap = false;
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) if (vis[i].r.right > vis[j].r.left + 0.5 && vis[j].r.right > vis[i].r.left + 0.5) overlap = true;
      const arrived = logos.filter((e) => e.classList.contains("in")).length;
      const off = vis.length ? (vis[0].r.left + vis[vis.length - 1].r.right) / 2 - innerWidth / 2 : 0;
      window.__samples.push({ t: performance.now(), arrived, n: vis.length, off, overlap });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

async function open(w, h, opts = {}) {
  const p = await browser.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.setViewport({ width: w, height: h });
  if (opts.reduced) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  if (opts.slowLogo) {
    await p.setRequestInterception(true);
    p.on("request", (r) => (r.url().endsWith("ekiti.svg") ? setTimeout(() => r.continue(), opts.slowLogo) : r.continue()));
  }
  await p.evaluateOnNewDocument(SAMPLER);
  await p.goto(URL + (opts.extra || ""), { waitUntil: opts.slowLogo ? "domcontentloaded" : "load" });
  return p;
}
const settledOffsets = (s) => {
  // stage k is settled ~950 ms after logo k arrives (the 900 ms slide), just before the next one
  const firstIn = s.find((x) => x.arrived >= 1)?.t;
  if (firstIn === undefined) return null;
  return [950, 1950, 2950].map((dt, k) => { const near = s.filter((x) => x.t >= firstIn + dt - 10 && x.t <= firstIn + dt + 40 && x.arrived === k + 1); return near.length ? Math.max(...near.map((x) => Math.abs(x.off))) : NaN; });
};
async function motifUnderContent(p) {
  const boxes = await p.evaluate(() => [...document.querySelectorAll("#intro .intro-logo, #intro .intro-title")].map((e) => { const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(innerWidth - Math.max(0, r.left), r.width), height: r.height }; }));
  await p.addStyleTag({ content: "#intro .intro-inner{visibility:hidden!important}#intro{background:#000!important}" });
  await sleep(80);
  let worst = 0;
  for (const b of boxes) {
    const png = await p.screenshot({ clip: b, encoding: "base64" });
    const pct = await p.evaluate(async (src) => { const i = new Image(); i.src = "data:image/png;base64," + src; await i.decode(); const c = new OffscreenCanvas(i.width, i.height); const g = c.getContext("2d"); g.drawImage(i, 0, 0); const d = g.getImageData(0, 0, i.width, i.height).data; let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k + 2] > 12) n++; return (100 * n) / (d.length / 4); }, png);
    worst = Math.max(worst, pct);
  }
  return worst;
}

for (const [w, h] of [[1920, 1080], [1366, 768], [375, 812]]) {
  console.log(`\n${w} × ${h}`);
  const p = await open(w, h);
  await p.waitForFunction(() => document.querySelector("#intro.st-begin"), { timeout: 10000 });
  await sleep(1700); // let the motif finish fading
  const s = await p.evaluate(() => window.__samples);
  ok(!s.some((x) => x.overlap), "no two logos overlap at any sampled frame");
  const st = settledOffsets(s);
  ok(st && st.every((v) => v <= 1), `each stage settles centred (offsets ${st && st.map((v) => v.toFixed(1)).join(" / ")} px)`);
  const mid = Math.max(...s.filter((x) => x.n > 0).map((x) => Math.abs(x.off)));
  console.log(`    info: largest transient offset while a newcomer fades in mid-slide: ${mid.toFixed(0)} px`);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll");
  ok(await p.$eval("#intro .intro-motif", (e) => +getComputedStyle(e).opacity <= 0.7), "motif opacity ≤ 0.7");
  ok(await p.$$eval("#intro .intro-logo img", (imgs) => imgs.map((i) => i.alt).join("|") === "Government of Ekiti State, Nigeria|MIVA Open University|Tunji Olowolafe Foundation"), "each logo keeps its institution's alt text");
  ok(await p.evaluate(() => document.activeElement?.classList.contains("intro-begin") && getComputedStyle(document.activeElement).outlineStyle !== "none"), "Begin takes focus with a visible focus ring");
  const lit = await motifUnderContent(p);
  ok(lit === 0, `motif never sits behind a logo or the title (${lit.toFixed(1)}% lit)`);
  await p.close();

  const q = await open(w, h);
  await sleep(1500); await q.keyboard.press("Escape"); await sleep(300);
  await q.setViewport({ width: Math.max(360, w - 240), height: h }); await sleep(1100);
  const off = await q.evaluate(() => { const l = [...document.querySelectorAll("#intro .intro-logo")].map((e) => e.getBoundingClientRect()); return (l[0].left + l[2].right) / 2 - innerWidth / 2; });
  ok(Math.abs(off) <= 1 && (await q.$("#intro.st-begin")), `Esc mid-sequence, then resize: line stays centred (${off.toFixed(1)} px)`);
  await q.close();
}

console.log("\nSkip before the logos have loaded (crest delayed 1.5 s)");
{
  const p = await open(1366, 768, { slowLogo: 1500 });
  await sleep(150); await p.keyboard.press("Escape");
  await sleep(2600);
  const s = await p.evaluate(() => window.__samples);
  const after = s.filter((x) => x.t > s[s.length - 1].t - 800);
  ok(after.every((x) => x.arrived === 3 && Math.abs(x.off) <= 1), "finished line re-measured and centred once the logos arrive; timeline does not restart");
  await p.close();
}

console.log("\nReduced motion");
{
  const p = await open(1366, 768, { reduced: true });
  await sleep(60);
  const r = await p.evaluate(() => ({ title: +getComputedStyle(document.querySelector("#intro .intro-title")).opacity, running: document.getAnimations().filter((a) => a.effect?.target?.closest?.("#intro")).length, begin: document.querySelector("#intro.st-begin") !== null }));
  ok(r.title === 1 && r.running === 0 && r.begin, `finished frame immediately, nothing animating (title opacity ${r.title}, running ${r.running})`);
  await p.close();
}

console.log("\nBegin and bypass");
{
  const p = await open(1366, 768);
  await p.waitForFunction(() => document.querySelector("#intro.st-begin"), { timeout: 10000 });
  await p.click("#intro .intro-begin"); await sleep(900);
  ok(await p.evaluate(() => window.__begun && document.getElementById("intro").classList.contains("gone")), "Begin hands over to the host and removes the opener");
  await p.close();
  const b = await open(1366, 768, { extra: (query ? "&" : "?") + "skipintro" });
  await sleep(200);
  ok(await b.evaluate(() => document.getElementById("intro").classList.contains("gone")), "?skipintro bypasses the opener");
  await b.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed${errors.length ? ", page errors: " + errors.join(" | ") : ", no page errors"}`);
if (failures.length || errors.length) process.exit(1);
