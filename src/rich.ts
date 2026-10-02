/** Rich text helpers. Browser-only (uses DOM). Stored HTML is restricted to a small allowlist. */
const KEEP = new Set(["B", "STRONG", "I", "EM", "U", "MARK", "UL", "OL", "LI", "P", "DIV", "BR"]);
const hasBg = (el: HTMLElement) => {
  const v = el.style.backgroundColor;
  return !!v && v !== "transparent" && v !== "inherit" && v !== "initial" && !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(v);
};
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function clean(node: Node, out: string[]) {
  node.childNodes.forEach(c => {
    if (c.nodeType === Node.TEXT_NODE) { out.push(esc(c.textContent ?? "")); return; }
    if (c.nodeType !== Node.ELEMENT_NODE) return;
    const el = c as HTMLElement, tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE") return;
    if (tag === "SPAN" || tag === "FONT") {
      const st = el.style, wrap: string[] = [];
      if (hasBg(el)) wrap.push("mark");
      if (st.fontWeight === "bold" || Number(st.fontWeight) >= 600) wrap.push("b");
      if (st.fontStyle === "italic") wrap.push("i");
      if (/underline/.test(st.textDecoration || st.textDecorationLine)) wrap.push("u");
      wrap.forEach(t => out.push(`<${t}>`)); clean(el, out); wrap.reverse().forEach(t => out.push(`</${t}>`));
      return;
    }
    if (tag === "BR") { out.push("<br>"); return; }
    if (!KEEP.has(tag)) { clean(el, out); return; }
    const t = tag === "STRONG" ? "b" : tag === "EM" ? "i" : tag.toLowerCase();
    out.push(`<${t}>`); clean(el, out); out.push(`</${t}>`);
  });
}
export function sanitizeRich(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out: string[] = []; clean(doc.body, out);
  let r = out.join(""), prev = "";
  while (r !== prev) { prev = r; r = r.replace(/<(b|i|u|mark)><\/\1>/g, ""); }
  return r;
}
export const plainToRich = (text: string) => text.split("\n").map(l => `<div>${l ? esc(l) : "<br>"}</div>`).join("");
export const richToPlain = (html: string) => {
  const el = document.createElement("div"); el.innerHTML = html;
  let out = "";
  const walk = (n: Node) => n.childNodes.forEach(c => {
    if (c.nodeType === Node.TEXT_NODE) { out += c.textContent ?? ""; return; }
    if (c.nodeType !== Node.ELEMENT_NODE) return;
    const e = c as HTMLElement, t = e.tagName;
    if (t === "BR") { out += "\n"; return; }
    if (t === "DIV" || t === "P" || t === "LI") { if (out && !out.endsWith("\n")) out += "\n"; walk(e); return; }
    walk(e);
  });
  walk(el);
  return out.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, "");
};
export function richToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walk = (n: Node, listType = "", idx = { i: 0 }): string => Array.from(n.childNodes).map(c => {
    if (c.nodeType === Node.TEXT_NODE) return c.textContent ?? "";
    const el = c as HTMLElement, tag = el.tagName;
    const inner = () => walk(el, listType, idx);
    if (tag === "B") return `**${inner()}**`;
    if (tag === "I") return `*${inner()}*`;
    if (tag === "U") return `<u>${inner()}</u>`;
    if (tag === "MARK") return `==${inner()}==`;
    if (tag === "BR") return "\n";
    if (tag === "UL" || tag === "OL") { const ix = { i: 0 }; return "\n\n" + walk(el, tag, ix) + "\n"; }
    if (tag === "LI") { idx.i++; return `${listType === "OL" ? idx.i + "." : "-"} ${walk(el, "", { i: 0 }).trim()}\n`; }
    if (tag === "DIV" || tag === "P") return "\n" + inner();
    return inner();
  }).join("");
  return walk(doc.body).replace(/\n{3,}/g, "\n\n").trim();
}
