import { imageFrom, toDataUrl } from "../images";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { answer } from "../calc";
import { plainToRich, richToPlain } from "../rich";

type Cmd = { id: string; label: string; title: string; run: () => void; on?: boolean };
const exec = (c: string, v?: string) => document.execCommand(c, false, v);
const HL = "#FFE58A";

function highlight() {
  const sel = getSelection(); if (!sel || !sel.rangeCount) return;
  // Toggle: if the selection is already highlighted, clear it.
  const n = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
  const bgEl = n?.closest("mark, [style*='background']") as HTMLElement | null;
  const on = !!bgEl && (bgEl.tagName === "MARK" || (!!bgEl.style.backgroundColor && bgEl.style.backgroundColor !== "transparent"));
  exec("styleWithCSS", "true");
  exec("hiliteColor", on ? "transparent" : HL);
  exec("styleWithCSS", "false");
}

/** Make the selected text one step bigger or smaller. Steps stack up to two each way, and opposite steps cancel. */
function sizeStep(dir: 1 | -1, root: HTMLElement | null) {
  const sel = getSelection(); if (!root || !sel || !sel.rangeCount || sel.isCollapsed) return;
  let level = 0;
  for (let e = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement ?? null; e && e !== root; e = e.parentElement) { if (e.tagName === "BIG") level++; else if (e.tagName === "SMALL") level--; }
  if (Math.abs(level + dir) > 2) return;
  // The selection is exactly one existing size tag (what a previous click leaves behind): nest or cancel in place.
  const sc = sel.getRangeAt(0).commonAncestorContainer, host = sc instanceof Element ? sc : sc.parentElement;
  if (host && (host.tagName === "BIG" || host.tagName === "SMALL") && host !== root && sel.toString() === host.textContent) {
    const r = document.createRange();
    if ((host.tagName === "BIG") === (dir > 0)) { const n = document.createElement(host.tagName); n.append(...Array.from(host.childNodes)); host.append(n); r.selectNodeContents(n); }
    else { const kids = Array.from(host.childNodes); host.replaceWith(...kids); if (kids.length) { r.setStartBefore(kids[0]); r.setEndAfter(kids[kids.length - 1]); } }
    sel.removeAllRanges(); sel.addRange(r); return;
  }
  const d = document.createElement("div"); d.appendChild(sel.getRangeAt(0).cloneContents());
  d.querySelectorAll("big,small").forEach(e => e.replaceWith(...Array.from(e.childNodes)));
  const tag = dir > 0 ? "big" : "small";
  exec("insertHTML", `<${tag} id="pip-sz">${d.innerHTML}</${tag}>`);
  // Chrome rewrites <big>/<small> into styled spans on insert; turn them back into the real tags.
  root.querySelectorAll<HTMLElement>("span[style*='font-size']").forEach(sp => {
    const m = /font-size:\s*(1\.25em|0?\.8em|larger|smaller)/.exec(sp.getAttribute("style") ?? ""); if (!m) return;
    const t = document.createElement(/1\.25|larger/.test(m[1]) ? "big" : "small"); if (sp.id === "pip-sz") t.id = "pip-sz";
    t.append(...Array.from(sp.childNodes)); sp.replaceWith(t);
  });
  const el = root.querySelector("#pip-sz") ?? Array.from(root.querySelectorAll("big,small")).find(e => e.textContent === d.textContent); if (!el) return;
  el.removeAttribute("id");
  const r = document.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r); // keep it selected so the next click steps again
}

export type RichHandle = { replaceAll: (plain: string) => void };
export const RichBody = forwardRef<RichHandle, { html: string; onChange: (html: string) => void; disabled: boolean }>(function RichBody({ html, onChange, disabled }, handle) {
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(handle, () => ({ replaceAll: plain => { const el = ref.current; if (!el) return; el.focus(); exec("selectAll"); exec("insertHTML", plainToRich(plain)); } }), []);
  const [state, setState] = useState<Record<string, boolean>>({});
  const [bubble, setBubble] = useState<{ x: number; y: number; below?: boolean } | null>(null);

  useEffect(() => { if (ref.current) ref.current.innerHTML = html || "<div><br></div>"; try { exec("defaultParagraphSeparator", "div"); } catch { /* older engines */ } }, []); // uncontrolled: parent re-keys to reseed
  useEffect(() => {
    const on = () => {
      const el = ref.current, sel = getSelection();
      if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) { setBubble(null); return; }
      const hl = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      setState({ bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), underline: document.queryCommandState("underline"), ul: document.queryCommandState("insertUnorderedList"), ol: document.queryCommandState("insertOrderedList"), hl: (() => { const b = hl?.closest("mark, [style*='background']") as HTMLElement | null; return !!b && (b.tagName === "MARK" || (!!b.style.backgroundColor && b.style.backgroundColor !== "transparent")); })() });
      if (sel.isCollapsed) { setBubble(null); return; }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      const bar = el.parentElement?.querySelector(".rt-bar")?.getBoundingClientRect();
      if (bar && r.top - bar.bottom < 56) { setBubble(null); return; } // the toolbar is right there
      setBubble(r.width ? { x: r.left + r.width / 2, y: r.top } : null);
    };
    document.addEventListener("selectionchange", on); return () => document.removeEventListener("selectionchange", on);
  }, []);

  const emit = () => ref.current && onChange(ref.current.innerHTML);
  const act = (f: () => void) => { ref.current?.focus(); f(); emit(); };
  const cmds: Cmd[] = [
    { id: "bold", label: "B", title: "Bold (Ctrl+B)", run: () => exec("bold"), on: state.bold },
    { id: "italic", label: "I", title: "Italic (Ctrl+I)", run: () => exec("italic"), on: state.italic },
    { id: "underline", label: "U", title: "Underline (Ctrl+U)", run: () => exec("underline"), on: state.underline },
    { id: "hl", label: "H", title: "Highlight (Ctrl+Shift+H)", run: highlight, on: state.hl },
    { id: "ul", label: "•", title: "Bulleted list", run: () => exec("insertUnorderedList"), on: state.ul },
    { id: "ol", label: "1.", title: "Numbered list", run: () => exec("insertOrderedList"), on: state.ol },
  ];
  const Btn = (c: Cmd) => (
    <button key={c.id} type="button" className={`rt-${c.id} ${c.on ? "on" : ""}`} data-cmd={c.id} aria-pressed={!!c.on} title={c.title} aria-label={c.title.replace(/ \(.*/, "")}
      onMouseDown={e => e.preventDefault()} onClick={() => act(c.run)}>{c.label}</button>
  );
  return (
    <div className="rich">
      {!disabled && (
        <div className="rt-bar" role="toolbar" aria-label="Formatting">
          <button type="button" data-cmd="undo" title="Undo (Ctrl+Z)" aria-label="Undo" onMouseDown={e => e.preventDefault()} onClick={() => act(() => exec("undo"))}>↶</button>
          <button type="button" data-cmd="redo" title="Redo (Ctrl+Y)" aria-label="Redo" onMouseDown={e => e.preventDefault()} onClick={() => act(() => exec("redo"))}>↷</button>
          <i />{cmds.map(Btn)}
        </div>)}
      {bubble && !disabled && <div className={`rt-bubble${bubble.below ? " below" : ""}`} role="toolbar" aria-label="Format selection" style={{ left: bubble.x, top: bubble.y }}>{cmds.slice(0, 4).map(Btn)}
        <div className="ts-step" role="group" aria-label="Selection size">
          <button type="button" data-cmd="smaller" title="Smaller text" aria-label="Smaller selected text" onMouseDown={e => e.preventDefault()} onClick={() => act(() => sizeStep(-1, ref.current))}><svg viewBox="0 0 12 12" aria-hidden><path d="M2.5 6h7" /></svg></button>
          <button type="button" data-cmd="bigger" title="Larger text" aria-label="Larger selected text" onMouseDown={e => e.preventDefault()} onClick={() => act(() => sizeStep(1, ref.current))}><svg viewBox="0 0 12 12" aria-hidden><path d="M2.5 6h7M6 2.5v7" /></svg></button>
        </div></div>}
      <div ref={ref} className="ed-body rt-body" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Body" data-placeholder="Start typing. End a sum with = for the answer" spellCheck
        onInput={e => {
          const el = e.currentTarget;
          const f = el.firstChild; if (f && (f.nodeType === 3 || !/^(DIV|P|UL|OL)$/.test((f as Element).tagName))) exec("formatBlock", "div");
          // Markdown-ish shortcuts at line start: "- " / "* " / "1. " start a list.
          const sel = getSelection(); const t = sel?.anchorNode;
          if (t && t.nodeType === 3 && !t.parentElement?.closest("li") && (e.nativeEvent as InputEvent).inputType === "insertText") {
            const txt = t.textContent ?? ""; const m = /^(-|\*|1\.)\u00a0?\s?$/.exec(txt.replace(/\u00a0/g, " "));
            const prev = t.previousSibling; const lineStart = !prev || (prev as Element).nodeName === "BR" || (prev as Element).nodeName === "DIV";
            if (m && lineStart && (e.nativeEvent as InputEvent).data === " ") { for (let k = (t.textContent ?? "").length; k > 0; k--) exec("delete"); exec(m[1] === "1." ? "insertOrderedList" : "insertUnorderedList"); }
          }
          const ie = e.nativeEvent as InputEvent;
          if (ie.inputType === "insertText" && ie.data === "=") {
            const sl = getSelection();
            if (sl && sl.rangeCount && sl.isCollapsed) {
              const r = document.createRange(); r.selectNodeContents(el); r.setEnd(sl.anchorNode!, sl.anchorOffset);
              const tmp = document.createElement("div"); tmp.appendChild(r.cloneContents());
              const lines = richToPlain(tmp.innerHTML).split("\n");
              const a = answer(lines); if (a) exec("insertText", " " + a);
            }
          }
          onChange(el.innerHTML);
        }}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "h") { e.preventDefault(); act(highlight); } }}
        onPaste={e => {
          e.preventDefault();
          const img = imageFrom(e.clipboardData);
          const txt = e.clipboardData.getData("text/plain");
          if (img && !txt) { const el = e.currentTarget; void toDataUrl(img).then(src => { el.focus(); exec("insertHTML", `<img src="${src}" alt="">`); onChange(el.innerHTML); }); return; }
          exec("insertText", txt);
        }}
        onDrop={e => e.preventDefault()} />
    </div>
  );
});
