// Renders the narrated walkthrough from the real interface (demo dataset) frame by frame.
// The film is timed to the voice: one beat per narration line in tools/narration/script.json, each as long as its
// audio (n1.mp3 … n9.mp3) plus a short breath. Missing audio falls back to an estimated length and a silent beat.
// Output: assets/media/review-desk-walkthrough.mp4 (1920×1080, 30 fps, H.264 + AAC narration, fast-start)
//         assets/media/review-desk-walkthrough-poster.webp
//         assets/media/review-desk-walkthrough-captions.js (+ .vtt) and tools/narration/transcript.md
//         tools/render-check/*.jpg  (one inspection frame per beat)
// Usage: npm run render     (requires Google Chrome and ffmpeg with libx264/libwebp)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MEDIA = join(ROOT, "assets/media");
const OUT = join(MEDIA, "review-desk-walkthrough.mp4");
const SILENT = join(MEDIA, ".walkthrough-video-only.mp4");
const POSTER = join(MEDIA, "review-desk-walkthrough-poster.webp");
const NARR = join(ROOT, "tools/narration");
const CHECK_DIR = join(ROOT, "tools/render-check");
const W = 1920, H = 1080, FPS = 30;
const LEAD = 0.5, BREATH = 0.9, TAIL = 0.8, VOICE_IN = 0.2;
const MIN_BEAT = { welcome: 4, import: 4.6, scan: 2.6, accuracy: 4.2, representation: 6.5, verdict: 5.2, fix: 6, report: 4.2, close: 5.2 };

/* ---------- schedule from the voice ---------- */
const script = JSON.parse(readFileSync(join(NARR, "script.json"), "utf8"));
const probe = (f) => parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.toString()) || null;
let t = LEAD;
const beats = script.lines.map((l) => {
  const file = ["mp3", "wav"].map((x) => join(NARR, `${l.id}.${x}`)).find(existsSync) || null;
  const voice = file ? probe(file) : null;
  const est = l.text.split(/\s+/).length / 2.6;
  const dur = Math.max(MIN_BEAT[l.beat] || 4, (voice || est) + BREATH);
  const b = { id: l.beat, line: l.id, text: l.text, file, voice, start: +t.toFixed(3), dur: +dur.toFixed(3) };
  t += dur;
  return b;
});
const TOTAL = t + TAIL;
const FRAMES = Math.ceil(TOTAL * FPS);
const voiced = beats.filter((b) => b.file).length;
console.log(`${beats.length} beats, ${voiced} voiced, ${TOTAL.toFixed(2)} s, ${FRAMES} frames`);

// Deterministic virtual clock: timers, rAF and Date/performance only move when the renderer advances them.
const VIRTUAL_TIME = `(() => {
  let now = 0, seq = 0; const timers = new Map(), rafs = new Map(); const t0 = Date.parse("2026-10-14T09:41:00");
  window.setTimeout = (fn, ms = 0, ...args) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, +ms || 0), fn, args }); return id; };
  window.clearTimeout = (id) => timers.delete(id);
  window.setInterval = (fn, ms, ...args) => { const id = ++seq; const arm = () => timers.set(id, { at: now + Math.max(1, +ms || 1), fn: () => { arm(); fn(...args); }, args: [] }); arm(); return id; };
  window.clearInterval = (id) => timers.delete(id);
  window.requestAnimationFrame = (fn) => { const id = ++seq; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => rafs.delete(id);
  performance.now = () => now; Date.now = () => t0 + now;
  window.__vt = { get now() { return now; }, advance(to) {
    for (;;) { let best = null, bid = 0;
      for (const [id, t] of timers) if (t.at <= to && (!best || t.at < best.at || (t.at === best.at && id < bid))) { best = t; bid = id; }
      if (!best) break; timers.delete(bid); now = Math.max(now, best.at);
      try { best.fn(...best.args); } catch (e) { console.error(e); } }
    now = Math.max(now, to); const fns = [...rafs.values()]; rafs.clear(); fns.forEach((f) => f(now)); } };
})();`;

const run = (args) => new Promise((res, rej) => spawn("ffmpeg", args, { stdio: "inherit" }).on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exited " + c)))));

mkdirSync(CHECK_DIR, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1"] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push(m.text()); });
await page.evaluateOnNewDocument(VIRTUAL_TIME);
await page.evaluateOnNewDocument(`window.__demoSchedule = ${JSON.stringify({ beats: beats.map(({ id, start, dur }) => ({ id, start, dur })) })};`);
await page.goto(pathToFileURL(join(ROOT, "index.html")).href + "?demo=render", { waitUntil: "load" });
await page.waitForFunction(() => window.__demo && window.__demo.ready && document.fonts.status === "loaded", { timeout: 15000 });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r))))));

const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-an", SILENT], { stdio: ["pipe", "inherit", "inherit"] });
const ffDone = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exited " + c)))));

// one inspection frame in the middle of each beat, plus the first and last frames
const inspect = new Map([[0, "00-start"], [FRAMES - 1, "99-final"]]);
beats.forEach((b, i) => inspect.set(Math.round((b.start + b.dur * 0.6) * FPS), `${String(i + 1).padStart(2, "0")}-${b.id}`));
const posterFrame = Math.round((beats.find((b) => b.id === "scan").start + beats.find((b) => b.id === "scan").dur * 0.7) * FPS);

const started = Date.now();
const log = [];
for (let f = 0; f < FRAMES; f++) {
  const info = await page.evaluate((n) => window.__demo.frame(n), f);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  if (inspect.has(f)) { await page.screenshot({ path: join(CHECK_DIR, inspect.get(f) + ".jpg"), type: "jpeg", quality: 86 }); log.push(`${inspect.get(f)}: frame ${f}, overlay=${info.overlay}`); }
  if (f === posterFrame) writeFileSync(join(CHECK_DIR, "_poster.png"), png);
  if (f % 150 === 0) process.stdout.write(`frame ${f}/${FRAMES}  ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
}
ff.stdin.end();
await ffDone;
await browser.close();

/* ---------- narration mix ---------- */
const withVoice = beats.filter((b) => b.file);
if (withVoice.length) {
  const inputs = withVoice.flatMap((b) => ["-i", b.file]);
  const chains = withVoice.map((b, i) => { const ms = Math.round((b.start + VOICE_IN) * 1000); return `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`; });
  const mix = `${chains.join(";")};${withVoice.map((_, i) => `[a${i}]`).join("")}amix=inputs=${withVoice.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]`;
  await run(["-loglevel", "error", "-y", "-i", SILENT, ...inputs, "-filter_complex", mix, "-map", "0:v", "-map", "[aout]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", OUT]);
} else {
  await run(["-loglevel", "error", "-y", "-i", SILENT, "-c:v", "copy", "-movflags", "+faststart", OUT]);
}
rmSync(SILENT, { force: true });
await run(["-loglevel", "error", "-y", "-i", join(CHECK_DIR, "_poster.png"), "-c:v", "libwebp", "-quality", "90", POSTER]);
rmSync(join(CHECK_DIR, "_poster.png"), { force: true });

/* ---------- captions + transcript ---------- */
const cues = beats.map((b) => ({ s: +(b.start + VOICE_IN).toFixed(2), e: +(b.start + VOICE_IN + (b.voice || b.dur - BREATH)).toFixed(2), t: b.text }));
const stamp = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(3).padStart(6, "0"); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${x}`; };
writeFileSync(join(MEDIA, "review-desk-walkthrough-captions.js"), `/* Generated by tools/render-walkthrough.mjs */\nwindow.WALKTHROUGH_CUES = ${JSON.stringify(cues)};\n`);
writeFileSync(join(MEDIA, "review-desk-walkthrough.vtt"), "WEBVTT\n\n" + cues.map((c, i) => `${i + 1}\n${stamp(c.s)} --> ${stamp(c.e)}\n${c.t}\n`).join("\n"));
writeFileSync(join(NARR, "transcript.md"), `# Walkthrough transcript: Review Desk\n\n${TOTAL.toFixed(1)} seconds · narrator: ${script.voice.split(" (")[0]}${voiced < beats.length ? " (some lines unvoiced)" : ""} · captions off by default\n\n` +
  cues.map((c) => `- **${Math.floor(c.s / 60)}:${(c.s % 60).toFixed(2).padStart(5, "0")}** ${c.t}`).join("\n") + "\n");

// cache-bust: point index.html at this render so browsers fetch the new video, poster and captions
const tag = createHash("md5").update(readFileSync(OUT)).digest("hex").slice(0, 10);
const indexPath = join(ROOT, "index.html");
writeFileSync(indexPath, readFileSync(indexPath, "utf8").replace(/(review-desk-walkthrough(?:\.mp4|-poster\.webp|-captions\.js))(\?v=[\w-]+)?/g, `$1?v=${tag}`));
console.log("index.html media version:", tag);

writeFileSync(join(CHECK_DIR, "render-log.txt"), [`${TOTAL.toFixed(2)} s, ${FRAMES} frames, ${voiced}/${beats.length} lines voiced`, ...beats.map((b) => `${b.line} ${b.id}: ${b.start.toFixed(2)}s +${b.dur.toFixed(2)}s voice=${b.voice ? b.voice.toFixed(2) + "s" : "none"}`), ...log, errors.length ? "errors:\n" + errors.join("\n") : "errors: none"].join("\n") + "\n");
console.log(log.join("\n"));
console.log(errors.length ? "PAGE ERRORS:\n" + errors.join("\n") : "no page errors");
console.log("wrote", OUT);
