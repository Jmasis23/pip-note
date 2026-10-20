/** Tiny safe calculator for inline answers. No eval. Supports + - * / ^ %, parentheses, "of", named values. */
type Tok = { t: "n"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };
const tokenize = (src: string): Tok[] | null => {
  const s = src.replace(/(\d),(?=\d{3}(\D|$))/g, "$1").replace(/[×x](?=\s*[\d(])/gi, (m, o: number) => (/\d|\)|\s/.test(src[o - 1] ?? "") ? "*" : m)).replace(/÷/g, "/").replace(/[−–]/g, "-");
  const out: Tok[] = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (num) { out.push({ t: "n", v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (id) { out.push({ t: "id", v: id[0].toLowerCase() }); i += id[0].length; continue; }
    if ("+-*/^()%".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    return null;
  }
  return out;
};

export function evaluate(src: string, vars: Record<string, number> = {}): number | null {
  const toks = tokenize(src); if (!toks || !toks.length) return null;
  let p = 0; let bad = false;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === "op" && (peek() as { v: string }).v === v;
  const expr = (): number => { let a = term(); for (;;) { if (isOp("+")) { p++; a += term(); } else if (isOp("-")) { p++; a -= term(); } else return a; } };
  const term = (): number => {
    let a = power();
    for (;;) {
      if (isOp("*")) { p++; a *= power(); }
      else if (isOp("/")) { p++; const b = power(); if (b === 0) bad = true; a /= b; }
      else if (peek()?.t === "id" && (peek() as { v: string }).v === "of") { p++; a *= power(); }
      else return a;
    }
  };
  const power = (): number => { const b = unary(); if (isOp("^")) { p++; return Math.pow(b, power()); } return b; };
  const unary = (): number => { if (isOp("-")) { p++; return -unary(); } if (isOp("+")) { p++; return unary(); } return post(); };
  const post = (): number => { let a = atom(); while (isOp("%")) { p++; a /= 100; } return a; };
  const atom = (): number => {
    const t = peek(); if (!t) { bad = true; return 0; }
    if (t.t === "n") { p++; return t.v; }
    if (t.t === "id") { p++; if (t.v in vars) return vars[t.v]; bad = true; return 0; }
    if (isOp("(")) { p++; const v = expr(); if (isOp(")")) p++; else bad = true; return v; }
    bad = true; p++; return 0;
  };
  const v = expr();
  if (bad || p !== toks.length || !Number.isFinite(v)) return null;
  return v;
}

export function format(n: number): string {
  const r = Math.round(n * 1e8) / 1e8;
  return r.toLocaleString("en-US", { maximumFractionDigits: 8, useGrouping: true });
}

const DEF = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*$/;
/** `lines` are the note's lines up to and including the one ending in "=". Returns the answer or null. */
export function answer(lines: string[]): string | null {
  const last = lines[lines.length - 1] ?? "";
  if (!/=\s*$/.test(last)) return null;
  const vars: Record<string, number> = {};
  for (const l of lines.slice(0, -1)) {
    const m = DEF.exec(l.replace(/=\s*[\d.,]+\s*$/, "")); if (!m) continue;
    const v = evaluate(m[2], vars); if (v !== null) vars[m[1].toLowerCase()] = v;
  }
  let body = last.replace(/=\s*$/, "").trim();
  const d = DEF.exec(body); if (d) body = d[2];
  if (!/[-+*/^%()]|\bof\b|[A-Za-z_]/.test(body.replace(/^-/, ""))) return null; // a lone number is not a sum
  const v = evaluate(body, vars);
  return v === null ? null : format(v);
}
