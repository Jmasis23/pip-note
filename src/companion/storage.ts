import { firstImage } from "../images";
import { call, isNative } from "../native";
import { createCompanionRepo, empty, type Snapshot, type Item } from "./model";
const KEY = "pip.companion.v1";
export const content = createCompanionRepo({
  read: () =>
    isNative()
      ? call<string | null>("companion_read")
      : Promise.resolve(localStorage.getItem(KEY)),
  write: async (expected, value) => {
    if (isNative()) await call("companion_write", { expected, value });
    else {
      if (localStorage.getItem(KEY) !== expected)
        throw Error(
          "This content changed in another window. Reload and try again.",
        );
      localStorage.setItem(KEY, value);
      window.dispatchEvent(new Event("pip:content"));
    }
  },
});
export async function migrate() {
  if (
    await (isNative()
      ? call("companion_read")
      : Promise.resolve(localStorage.getItem(KEY)))
  )
    return;
  const all = isNative()
    ? await call<Record<string, string>>("store_load")
    : Object.fromEntries(
        Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)!]),
      );
  const legacy = all["pip.store.v1"];
  if (!legacy) return;
  const raw = JSON.parse(legacy);
  if (raw.v !== 1 || !Array.isArray(raw.notes))
    throw Error(
      "Your previous library could not be read. Original data was preserved.",
    );
  const s: Snapshot = empty();
  s.items = raw.notes.map((n: any): Item => ({
    id: n.id,
    revision: n.revision ?? 1,
    kind: firstImage(n.rich)
      ? "image"
      : n.checklist?.length
        ? "checklist"
        : "note",
    image: firstImage(n.rich) || undefined,
    title: n.title ?? "",
    body: n.body ?? "",
    project: n.folder ?? "",
    checklist: n.checklist ?? [],
    updated: n.updatedAt ?? Date.now(),
    pinned: !!n.pinned,
    deleted: n.deletedAt != null,
  }));
  s.projects = [...new Set(s.items.map((n) => n.project).filter(Boolean))];
  const d = raw.drafts?.[0] ?? raw.draft;
  if (d)
    s.draft = {
      kind: "note",
      title: "",
      body: d.text ?? "",
      project: d.folder ?? "",
    };
  await content.import(s);
}
export async function saveExport() {
  const text = await content.export();
  if (isNative())
    return call<string | null>("export_file", {
      name: "Pip-library.json",
      content: text,
    });
  const a = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  a.href = url;
  a.download = "Pip-library.json";
  a.click();
  URL.revokeObjectURL(url);
  return "Pip-library.json";
}
