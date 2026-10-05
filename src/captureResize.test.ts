import { describe, it, expect } from "vitest";
import native from "../src-tauri/src/lib.rs?raw";
import permissions from "../src-tauri/capabilities/default.json";
describe("compact window wiring", () => {
  it("permits only application windows to use window APIs", () => {
    expect(permissions.windows).toEqual([
      "main",
      "tool",
      "reference-*",
      "overlay-*",
    ]);
    expect(permissions.permissions).not.toContain("shell:default");
  });
  it("dispatches gestures only to the tool window", () => {
    const dispatch = native.slice(
      native.indexOf("pub fn open_tool"),
      native.indexOf("pub fn open_capture"),
    );
    expect(dispatch).toContain('get_webview_window("tool")');
    expect(dispatch).not.toContain("show_main");
  });
});
