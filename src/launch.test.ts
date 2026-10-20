import { describe, expect, it } from "vitest";
import main from "./main.tsx?raw";
import desk from "./dirs/DirB.tsx?raw";
import settings from "./components/Settings.tsx?raw";
import editor from "./components/Editor.tsx?raw";
import rust from "../src-tauri/src/lib.rs?raw";
import capture from "./components/Capture.tsx?raw";
import cargo from "../src-tauri/core/Cargo.toml?raw";
const sources: Record<string,string> = { "src/main.tsx":main, "src/dirs/DirB.tsx":desk, "src/components/Settings.tsx":settings, "src/components/Editor.tsx":editor, "src-tauri/src/lib.rs":rust, "src/components/Capture.tsx":capture, "src-tauri/core/Cargo.toml":cargo };
const read = (p: string) => sources[p];
describe("no-AI launch boundary", () => {
  it("keeps the old model code out (Pip AI lives in src/ai)", () => {
    for (const file of ["src/main.tsx", "src/dirs/DirB.tsx"])
      expect(read(file)).not.toMatch(/initAi|useAi|AskPanel|suggestMeta|Connect ChatGPT|AI tools|ai-set/);
  });
  it("has no native inference/configuration commands", () => {
    const rust = read("src-tauri/src/lib.rs");
    expect(rust).not.toMatch(/ai_configure|ai_test|chatgpt_models|chatgpt_set_model|list_models/);
    expect(rust).toContain("assist::ai_complete");
    expect(rust).not.toMatch(/api[_-]?key\s*[:=]\s*"/i);
    expect(rust).toContain("oauth_browser");
    expect(rust).toContain("clipboard::clipboard_status");
  });
  it("retains clipboard and deterministic capture arrangement", () => {
    expect(read("src/dirs/DirB.tsx")).toContain("<Clipboard");
    expect(read("src/components/Capture.tsx")).toContain("capturedNote");
    expect(read("src-tauri/core/Cargo.toml")).toContain("default = []");
  });
});
