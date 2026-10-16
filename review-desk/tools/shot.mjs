// Screenshot helper: node shot.mjs <url-or-path> <out.png> [width] [height]
import puppeteer from "puppeteer-core";
import { resolve } from "node:path";
const [, , target, out, w = "1920", h = "1080"] = process.argv;
const url = /^https?:|^file:/.test(target) ? target : "file://" + resolve(target);
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: +w, height: +h });
p.on("console", (m) => console.log("console:", m.text())); p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto(url, { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 600));
await p.screenshot({ path: out, fullPage: true }); await b.close();
