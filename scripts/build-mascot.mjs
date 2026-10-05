// Generates the Pip cursor mascot: 5 states x light/dark/mono + a tray glyph. Run: node scripts/build-mascot.mjs
import fs from "node:fs";
const OUT = "docs/brand/mascot"; fs.mkdirSync(OUT, { recursive: true });
const ARROW = "M14 8 L14 51 L25 41 L33 58 L40.5 54.5 L32.5 38 L47 38 Z", FOLD = "M38.5 38 L47 38 L40 30.5 Z";
const states = {
  idle:     { eyes: "open",   badge: "" },
  listening:{ eyes: "wide",   badge: '<circle cx="52" cy="14" r="4" fill="ORANGE"/><circle cx="52" cy="14" r="8" fill="none" stroke="ORANGE" stroke-width="2" opacity=".5"/>' },
  keeping:  { eyes: "happy",  badge: '<path d="M46 14 l4 4 l8 -9" fill="none" stroke="ORANGE" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  sleeping: { eyes: "closed", badge: '<text x="46" y="16" font-family="Inter,sans-serif" font-weight="700" font-size="11" fill="ORANGE">z</text>' },
  alert:    { eyes: "wide",   badge: '<path d="M52 5 v9 M52 18 v2" stroke="ORANGE" stroke-width="3.5" stroke-linecap="round"/>' },
};
const eyes = (k, c) => ({
  open: `<circle cx="22" cy="30" r="2.6" fill="${c}"/><circle cx="30" cy="30" r="2.6" fill="${c}"/>`,
  wide: `<circle cx="22" cy="30" r="3.6" fill="${c}"/><circle cx="30" cy="30" r="3.6" fill="${c}"/>`,
  happy: `<path d="M19 31 q3 -5 6 0 M27 31 q3 -5 6 0" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,
  closed: `<path d="M19 30 h6 M27 30 h6" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,
})[k];
const themes = { light: { body: "#FFFFFF", line: "#20232B", ink: "#20232B", orange: "#FF7828", fold: "#FFD9BF" }, dark: { body: "#2B2F3A", line: "#F7F1E6", ink: "#F7F1E6", orange: "#FF7828", fold: "#5A3A28" } };
const svg = (inner, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256" role="img" aria-label="${label}">${inner}</svg>\n`;
let n = 0;
for (const [name, s] of Object.entries(states)) {
  for (const [tn, t] of Object.entries(themes)) {
    fs.writeFileSync(`${OUT}/pip-${name}-${tn}.svg`, svg(`<path d="${ARROW}" fill="${t.body}" stroke="${t.line}" stroke-width="3" stroke-linejoin="round"/><path d="${FOLD}" fill="${t.fold}"/>${eyes(s.eyes, t.ink)}${s.badge.replaceAll("ORANGE", t.orange)}`, `Pip ${name}`)); n++;
  }
  const id = `m-${name}`; // mono: one colour, eyes and badge punched out through a per-state mask
  fs.writeFileSync(`${OUT}/pip-${name}-mono.svg`, svg(`<mask id="${id}"><rect width="64" height="64" fill="#fff"/>${eyes(s.eyes, "#000")}</mask><path d="${ARROW}" fill="#000" stroke="#000" stroke-width="3" stroke-linejoin="round" mask="url(#${id})"/>${s.badge.replaceAll("ORANGE", "#000")}`, `Pip ${name} mono`)); n++;
}
fs.writeFileSync(`${OUT}/pip-tray.svg`, svg(`<path d="${ARROW}" fill="#000" stroke="#000" stroke-width="3" stroke-linejoin="round"/>`, "Pip tray")); n++;
const sheet = `<!doctype html><meta charset=utf-8><body style="margin:0;font:14px Inter,sans-serif;background:#FBF6EC">` + ["light", "dark", "mono"].map(tn => `<div style="padding:16px;background:${tn === "dark" ? "#1C1F27" : "#FBF6EC"};color:${tn === "dark" ? "#F7F1E6" : "#20232B"}"><b>${tn}</b><div style="display:flex;gap:20px">${Object.keys(states).map(s => `<figure style="margin:0;text-align:center"><img width=128 src="pip-${s}-${tn}.svg"><figcaption>${s}</figcaption></figure>`).join("")}</div></div>`).join("");
fs.writeFileSync(`${OUT}/contact-sheet.html`, sheet);
console.log(n, "svg files + contact-sheet.html");
