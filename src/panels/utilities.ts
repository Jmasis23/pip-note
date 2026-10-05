/** Quick Utilities: small text transforms for whatever is on the clipboard. Pure, so they are tested without a window. */
export type Util = { id: string; label: string; run: (s: string) => string };
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-_/(])([a-z\u00e0-\u024f])/g, (_m, a: string, b: string) => a + b.toUpperCase());
export const UTILS: Util[] = [
  { id: "upper", label: "UPPERCASE", run: s => s.toUpperCase() },
  { id: "lower", label: "lowercase", run: s => s.toLowerCase() },
  { id: "title", label: "Title Case", run: titleCase },
  { id: "trim", label: "Trim spaces", run: s => s.split("\n").map(l => l.trim().replace(/[ \t]{2,}/g, " ")).join("\n").trim() },
  { id: "lines", label: "Remove blank lines", run: s => s.split("\n").filter(l => l.trim()).join("\n") },
  { id: "sort", label: "Sort lines A-Z", run: s => s.split("\n").sort((a, b) => a.localeCompare(b)).join("\n") },
  { id: "dedupe", label: "Remove duplicate lines", run: s => [...new Set(s.split("\n"))].join("\n") },
  { id: "slug", label: "Make a slug", run: s => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") },
];
export function counts(s: string): { words: number; chars: number; lines: number } {
  const t = s.trim(); return { words: t ? t.split(/\s+/).length : 0, chars: s.length, lines: s ? s.split("\n").length : 0 };
}
