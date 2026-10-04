// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_PREFS } from "./domain";
import CapturePopup from "./CapturePopup";

const mocks = vi.hoisted(() => ({
  call: vi.fn(), show: undefined as (() => void) | undefined,
  resize: vi.fn(async () => { window.dispatchEvent(new Event("blur")); }),
  saveDraft: vi.fn(async () => "draft-1"),
}));
vi.mock("./native", () => ({
  isNative: () => true, initStorage: async () => {}, call: mocks.call,
  onNativeEvent: async (_name: string, callback: () => void) => { mocks.show = callback; return () => {}; },
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ startResizeDragging: mocks.resize }) }));
vi.mock("./captureService", () => ({ captureModelEnabled: false, suggestCapture: vi.fn() }));
vi.mock("./useNotes", () => ({ repo: {
  getPrefs: async () => ({ ...DEFAULT_PREFS, reducedMotion: true }),
  list: async () => [], listDrafts: async () => [], saveDraft: mocks.saveDraft,
} }));
let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(<CapturePopup />); });
  await act(async () => { mocks.show?.(); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.documentElement.classList.remove("cap-win"); });
const write = async (text: string) => {
  await act(async () => {
    const textarea = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

it("keeps capture open and preserves text through native resize and focus loss", async () => {
  await write("A thought that must survive resizing");
  await act(async () => { host.querySelector(".capture-edge.se")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); });
  expect(mocks.resize).toHaveBeenCalledWith("SouthEast");
  await act(async () => { window.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("blur")); });
  expect(host.querySelector("textarea")!.value).toBe("A thought that must survive resizing");
  expect(mocks.call).not.toHaveBeenCalledWith("capture_hide");
  expect(mocks.saveDraft).not.toHaveBeenCalled();
});

it("keeps the draft before explicitly closing, and stays open if draft saving fails", async () => {
  await write("Keep this draft");
  mocks.saveDraft.mockRejectedValueOnce(new Error("Disk full"));
  const close = host.querySelector<HTMLButtonElement>('[aria-label="Keep draft and close"]')!;
  await act(async () => { close.click(); });
  expect(mocks.call).not.toHaveBeenCalledWith("capture_hide");
  expect(host.textContent).toContain("Couldn't keep your draft");
  expect(host.querySelector("textarea")!.value).toBe("Keep this draft");
  await act(async () => { close.click(); });
  expect(mocks.saveDraft).toHaveBeenLastCalledWith("Keep this draft", undefined, "");
  expect(mocks.call).toHaveBeenCalledWith("capture_hide");
});
