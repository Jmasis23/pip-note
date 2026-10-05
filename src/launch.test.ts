import { describe, it, expect } from "vitest";
import main from "./main.tsx?raw";
import native from "../src-tauri/src/lib.rs?raw";
import config from "../src-tauri/tauri.conf.json";
describe("offline runtime entry boundary", () => {
  it("loads the local companion without authentication or automatic inference", () => {
    expect(main).toContain("./companion/App");
    expect(main).not.toMatch(/cloud\/Gate|loadSession|ai\/client/);
    expect(native).not.toMatch(
      /assist::ai_complete|oauth_browser|chatgpt_sign_in/,
    );
  });
  it("exposes clipboard commands but blocks remote content in the webview", () => {
    expect(native).toContain("clipboard::clipboard_status");
    expect(config.app.security.csp).toContain("default-src 'self'");
    expect(config.plugins).toEqual({});
  });
});
