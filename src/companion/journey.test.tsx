// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";
import { content } from "./storage";
let root: Root;
let host: HTMLDivElement;
const tick = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
};
const click = async (label: string) => {
  const b = [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  expect(b, `button ${label}`).toBeTruthy();
  await act(async () => {
    b!.click();
  });
  await tick();
};
const type = async (label: string, value: string) => {
  const l = [...host.querySelectorAll("label")].find(
    (x) => x.firstChild?.textContent === label,
  );
  const el = l?.querySelector("input,textarea") as HTMLInputElement;
  expect(el, `field ${label}`).toBeTruthy();
  const proto =
    el.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
beforeEach(async () => {
  localStorage.clear();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<App />);
  });
  await tick();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
describe("local companion journeys", () => {
  it("captures, saves, retrieves and edits after restarting the interface", async () => {
    await click("＋ Keep a thought");
    await type("Title", "Client launch");
    await type("Your thought", "Send the QA checklist.");
    await click("Keep it");
    expect(host.textContent).toContain("Got it. Saved.");
    const close = host.querySelector(
      '[aria-label="Close tool"]',
    ) as HTMLButtonElement;
    await act(async () => close.click());
    await tick();
    expect(host.querySelector(".item-card")?.textContent).toContain(
      "Client launch",
    );
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<App />));
    await tick();
    expect(host.querySelector(".item-card")?.textContent).toContain(
      "Send the QA checklist.",
    );
  });
  it("preserves an unfinished draft across dismissal and exposes it in the library", async () => {
    await click("＋ Keep a thought");
    await type("Title", "Unfinished");
    await type("Your thought", "Remember this");
    await act(async () => {
      (
        host.querySelector('[aria-label="Close tool"]') as HTMLButtonElement
      ).click();
    });
    await tick();
    expect(host.textContent).toContain("Unfinished thoughts");
    await click("Unfinished");
    expect(
      (host.querySelector(".tool-panel textarea") as HTMLTextAreaElement).value,
    ).toBe("Remember this");
  });
  it("navigates every main page without account or network setup", async () => {
    for (const p of [
      "Projects",
      "Snippets",
      "Follow-ups",
      "Landmarks",
      "Settings",
      "Library",
    ]) {
      const b = [...host.querySelectorAll("nav button")].find((x) =>
        x.textContent?.includes(p),
      )!;
      await act(async () => (b as HTMLButtonElement).click());
      await tick();
      expect(host.querySelector("h1")?.textContent).toBe(p);
    }
    expect(host.textContent).not.toContain("Sign in");
  });
  it("shows stale-edit failure and preserves user text", async () => {
    let n: any;
    await act(async () => {
      n = await content.keep({
        kind: "note",
        title: "Shared",
        body: "original",
        project: "",
      });
    });
    await tick();
    await click("Edit");
    await type("Your thought", "my pending edit");
    await act(async () => {
      await content.keep({ ...n, body: "other window" });
    });
    await click("Keep it");
    expect(host.textContent).toContain("changed in another window");
    expect(
      (host.querySelector(".tool-panel textarea") as HTMLTextAreaElement).value,
    ).toBe("my pending edit");
  });
});
