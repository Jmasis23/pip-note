// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { plainToRich, richToMarkdown, richToPlain, sanitizeRich } from "./rich";

describe("rich text", () => {
  it("keeps allowed formatting, maps highlight spans to mark, drops scripts and attributes", () => {
    const out = sanitizeRich('<b onclick="x()">hi</b> <span style="background-color: rgb(255, 211, 187)">yo</span><script>alert(1)</script><a href="javascript:x">l</a><img src=x onerror=y>');
    expect(out).toBe("<b>hi</b> <mark>yo</mark>l");
  });
  it("keeps big and small, drops empty ones", () => {
    expect(sanitizeRich("<big>a</big><small></small>")).toBe("<big>a</big>");
    expect(sanitizeRich('<big onclick="x()">a</big>')).toBe("<big>a</big>");
  });
  it("styled spans become semantic tags", () => { expect(sanitizeRich('<span style="font-weight: bold;font-style: italic">x</span>')).toBe("<mark></mark>".slice(0,0) + "<b><i>x</i></b>"); });
  it("transparent background is not a highlight", () => { expect(sanitizeRich('<span style="background-color: transparent">a</span>')).toBe("a"); });
  it("normalizes strong/em and removes empty marks", () => { expect(sanitizeRich("<strong>a</strong><em>b</em><mark></mark>")).toBe("<b>a</b><i>b</i>"); });
  it("escapes text", () => { expect(sanitizeRich("a &lt;b&gt; & c")).toBe("a &lt;b&gt; &amp; c"); });
  it("plain <-> rich keeps lines and unicode", () => {
    const t = "naïve 日本語 🦄\n\nline <3"; expect(richToPlain(plainToRich(t))).toBe(t);
  });
  it("markdown export", () => {
    expect(richToMarkdown("<b>bold</b> <i>it</i> <mark>hi</mark><ul><li>a</li><li>b</li></ul><ol><li>x</li></ol>")).toBe("**bold** *it* ==hi==\n\n- a\n- b\n\n1. x");
  });
});
