// Builds assets/fonts/fonts.css: Afacad (variable) + Manrope embedded as data URIs, so index.html also works from
// file:// (also written to ../fix-the-prompt-opener/assets/fonts for the opener preview).
// Icons are hand-authored: line icons in icons.js, flat app and folder icons in assets/icons/*.svg.
// Usage: npm run assets
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(ROOT, "assets/fonts");
const faces = readdirSync(dir).filter((f) => f.endsWith(".woff2")).map((f) => {
  const [, fam, w] = f.match(/^(\w+)-latin-(\d+|wght)-normal\.woff2$/);
  const family = fam[0].toUpperCase() + fam.slice(1);
  const b64 = readFileSync(join(dir, f)).toString("base64");
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${w === "wght" ? "400 700" : w};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
});
const css = "/* Afacad (variable) and Manrope (SIL Open Font License 1.1), latin subset, embedded for offline/file:// use. */\n" + faces.join("\n") + "\n";
writeFileSync(join(dir, "fonts.css"), css);
console.log("wrote assets/fonts/fonts.css");
try { writeFileSync(join(ROOT, "../fix-the-prompt-opener/assets/fonts/fonts.css"), css); console.log("wrote ../fix-the-prompt-opener/assets/fonts/fonts.css"); } catch { /* opener package not present */ }
