// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_PREFS } from "./domain";
import CapturePopup from "./CapturePopup";

const NOTE = { id: "n1", title: "Untitled", body: "", checklist: [], createdAt: 1, updatedAt: 1, revision: 1, pinned: false, deletedAt: null };
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
  create: async () => NOTE, get: async () => NOTE, trash: async () => NOTE, deleteForever: async () => {},
} }));
let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  (document as unknown as { queryCommandState: () => boolean }).queryCommandState = () => false;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(<CapturePopup />); });
  await act(async () => { mocks.show?.(); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.documentElement.classList.remove("cap-win"); });
it("keeps the card open through native resize and focus loss, and resizes from the edges", async () => {
  await act(async () => { host.querySelector(".capture-edge.se")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); });
  expect(mocks.resize).toHaveBeenCalledWith("SouthEast");
  await act(async () => { window.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("blur")); });
  expect(host.querySelector(".fr-panel.pn")).not.toBeNull();
  expect(mocks.call).not.toHaveBeenCalled();
});

it("closes on Escape and drops the empty note", async () => {
  await act(async () => { host.querySelector(".fr-panel")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 200)); });
  expect(mocks.call).toHaveBeenCalledWith("capture_hide");
});
