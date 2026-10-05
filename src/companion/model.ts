export type Kind =
  | "note"
  | "checklist"
  | "link"
  | "image"
  | "file"
  | "snippet"
  | "task"
  | "resume";
export type Attachment = {
  id: string;
  name: string;
  mode: "copy" | "shortcut";
};
export type Input = {
  kind: Kind;
  title: string;
  body: string;
  project: string;
  checklist?: { text: string; done: boolean }[];
  image?: string;
  attachments?: Attachment[];
  due?: string;
  waiting?: string;
  next?: string;
  resources?: string;
  done?: boolean;
};
export type Item = Input & {
  id: string;
  revision: number;
  updated: number;
  pinned: boolean;
  deleted?: boolean;
};
export type Preferences = {
  theme: "light" | "dark" | "system";
  mascot: boolean;
  reducedMotion: boolean;
  trayOnClose: boolean;
  startup: boolean;
  notifications: boolean;
  onboarded: boolean;
};
export type Snapshot = {
  version: 1;
  items: Item[];
  draft: Input | null;
  drafts?: Record<string, Input>;
  projects: string[];
  prefs: Preferences;
};
export const empty = (): Snapshot => ({
  version: 1,
  items: [],
  draft: null,
  drafts: {},
  projects: [],
  prefs: {
    theme: "light",
    mascot: true,
    reducedMotion: false,
    trayOnClose: true,
    startup: false,
    notifications: false,
    onboarded: false,
  },
});
export interface Storage {
  read(): Promise<string | null>;
  write(expected: string | null, next: string): Promise<void>;
}
const kinds: Kind[] = [
  "note",
  "checklist",
  "link",
  "image",
  "file",
  "snippet",
  "task",
  "resume",
];
export function validateSnapshot(value: unknown): Snapshot {
  const s = value as Snapshot;
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.items) ||
    !Array.isArray(s.projects) ||
    s.projects.some((x) => typeof x !== "string") ||
    !s.prefs ||
    !["light", "dark", "system"].includes(s.prefs.theme)
  )
    throw Error(
      "This is not a valid Pip export. Your library was not changed.",
    );
  const inputValid = (n: Input) =>
    !!n &&
    kinds.includes(n.kind) &&
    typeof n.title === "string" &&
    typeof n.body === "string" &&
    typeof n.project === "string" &&
    ["next", "resources", "waiting", "due", "image"].every(
      (k) =>
        n[k as keyof Input] === undefined ||
        typeof n[k as keyof Input] === "string",
    ) &&
    (n.done === undefined || typeof n.done === "boolean") &&
    (n.due === undefined || Number.isFinite(Date.parse(n.due))) &&
    (!n.image || /^data:image\/(png|jpeg|webp|gif);base64,/.test(n.image)) &&
    (n.checklist === undefined ||
      (Array.isArray(n.checklist) &&
        n.checklist.every(
          (c) =>
            !!c && typeof c.text === "string" && typeof c.done === "boolean",
        ))) &&
    (n.attachments === undefined ||
      (Array.isArray(n.attachments) &&
        n.attachments.every(
          (a) =>
            !!a &&
            typeof a.id === "string" &&
            typeof a.name === "string" &&
            ["copy", "shortcut"].includes(a.mode),
        )));
  if (
    ![
      "mascot",
      "reducedMotion",
      "trayOnClose",
      "startup",
      "notifications",
      "onboarded",
    ].every((k) => typeof s.prefs[k as keyof Preferences] === "boolean") ||
    (s.draft !== null && !inputValid(s.draft)) ||
    (s.drafts !== undefined &&
      (typeof s.drafts !== "object" ||
        s.drafts === null ||
        Array.isArray(s.drafts) ||
        !Object.values(s.drafts).every(inputValid)))
  )
    throw Error(
      "This export has a damaged draft or preference. Your library was not changed.",
    );
  const ids = new Set<string>();
  for (const n of s.items) {
    if (
      !inputValid(n) ||
      typeof n.id !== "string" ||
      ids.has(n.id) ||
      !kinds.includes(n.kind) ||
      typeof n.title !== "string" ||
      typeof n.body !== "string" ||
      typeof n.project !== "string" ||
      !Number.isInteger(n.revision) ||
      n.revision < 1 ||
      !Number.isFinite(n.updated) ||
      typeof n.pinned !== "boolean" ||
      (n.attachments &&
        (!Array.isArray(n.attachments) ||
          n.attachments.some(
            (a) =>
              !a ||
              typeof a.id !== "string" ||
              typeof a.name !== "string" ||
              !["copy", "shortcut"].includes(a.mode),
          ))) ||
      (n.checklist &&
        (!Array.isArray(n.checklist) ||
          n.checklist.some(
            (c) =>
              !c || typeof c.text !== "string" || typeof c.done !== "boolean",
          )))
    )
      throw Error(
        "This export contains damaged or duplicate items. Your library was not changed.",
      );
    ids.add(n.id);
  }
  return { ...s, drafts: s.drafts ?? (s.draft ? { capture: s.draft } : {}) };
}
export function createCompanionRepo(storage: Storage) {
  let queue: Promise<unknown> = Promise.resolve();
  const load = async () => {
    const raw = await storage.read();
    return raw ? validateSnapshot(JSON.parse(raw)) : empty();
  };
  const change = <T>(fn: (s: Snapshot) => T): Promise<T> => {
    const job = queue.then(async () => {
      const raw = await storage.read();
      const s = raw ? validateSnapshot(JSON.parse(raw)) : empty();
      const result = fn(s);
      await storage.write(raw, JSON.stringify(s));
      return result;
    });
    queue = job.catch(() => {});
    return job;
  };
  return {
    load,
    keep: (input: Input & Partial<Item>) =>
      change((s) => {
        if (
          !input.title.trim() &&
          !input.body.trim() &&
          !input.image &&
          !input.attachments?.length &&
          !input.checklist?.length
        )
          throw Error("Write something first.");
        const old = input.id
          ? s.items.find((n) => n.id === input.id)
          : undefined;
        if (input.id && (!old || old.revision !== input.revision))
          throw Error(
            "This item changed in another window. Your text is still here. Reload it or keep a separate copy.",
          );
        const n: Item = {
          ...input,
          id: old?.id ?? crypto.randomUUID(),
          revision: (old?.revision ?? 0) + 1,
          updated: Date.now(),
          pinned: old?.pinned ?? false,
        };
        s.items = s.items.filter((x) => x.id !== n.id);
        s.items.unshift(n);
        return n;
      }),
    patch: (id: string, revision: number, patch: Partial<Item>) =>
      change((s) => {
        const n = s.items.find((x) => x.id === id);
        if (!n || n.revision !== revision)
          throw Error("This item changed. Reload and try again.");
        Object.assign(n, patch, {
          id: n.id,
          revision: n.revision + 1,
          updated: Date.now(),
        });
        return n;
      }),
    remove: (id: string) =>
      change((s) => {
        const n = s.items.find((x) => x.id === id);
        if (!n?.deleted) throw Error("Move the item to Trash first.");
        s.items = s.items.filter((x) => x.id !== id);
      }),
    draft: (draft: Input | null, owner = "capture", expected?: Input | null) =>
      change((s) => {
        s.drafts ??= {};
        const old = s.drafts[owner] ?? null;
        if (
          expected !== undefined &&
          JSON.stringify(old) !== JSON.stringify(expected)
        )
          throw Error(
            "This draft changed in another window. Your text is still here.",
          );
        if (draft) s.drafts[owner] = draft;
        else delete s.drafts[owner];
        if (owner === "capture") s.draft = draft;
      }),
    prefs: (patch: Partial<Preferences>) =>
      change((s) => {
        Object.assign(s.prefs, patch);
      }),
    project: (name: string) =>
      change((s) => {
        const n = name.trim();
        if (!n) throw Error("Give your project a name.");
        if (!s.projects.includes(n)) s.projects.push(n);
      }),
    import: (value: unknown) => {
      const checked = validateSnapshot(value);
      return change((s) => {
        Object.assign(s, checked);
      });
    },
    export: async () => JSON.stringify(await load(), null, 2),
  };
}
export const fields = (template: string) => [
  ...new Set(
    [...template.matchAll(/\{\{\s*([\w -]+?)\s*\}\}/g)].map((x) => x[1]),
  ),
];
export const fillTemplate = (
  template: string,
  values: Record<string, string>,
) =>
  template.replace(
    /\{\{\s*([\w -]+?)\s*\}\}/g,
    (_, key: string) => values[key] ?? "",
  );
export function convertTime(instant: string, zone: string) {
  const d = new Date(instant);
  if (!Number.isFinite(d.getTime()))
    throw Error("Enter a valid date and time including its UTC offset.");
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(d);
}
