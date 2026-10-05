import { useEffect, useRef, useState } from "react";
import { call, isNative } from "../native";
import { loadLandmarks } from "../landmarks/api";
import { TOOLS, type Tool } from "../landmarks/model";
import { content } from "./storage";
import { useContent } from "./useContent";
import {
  fields,
  fillTemplate,
  convertTime,
  type Item,
  type Input,
  type Kind,
} from "./model";
import { evaluate, format } from "../calc";
import { clipboard, type ClipStatus } from "../clipboard";
import { imageFrom, toDataUrl } from "../images";
const fresh = (kind: Kind = "note"): Input => ({
  kind,
  title: "",
  body: "",
  project: "",
  checklist: [],
});
export function Mascot({
  state = "idle",
  size = 48,
}: {
  state?: string;
  size?: number;
}) {
  return (
    <img
      className="mascot"
      src={`/brand/mascot-${state}-light.svg`}
      width={size}
      height={size}
      alt="Pip cursor companion"
    />
  );
}
export default function ToolPanel({
  tool: initial = "quick-capture",
  onClose,
  edit,
  project: initialProject = "",
  referenceId,
  draftKey,
}: {
  tool?: Tool;
  onClose: () => void;
  edit?: Item;
  project?: string;
  referenceId?: string;
  draftKey?: string;
}) {
  const { data, loaded, error, refresh } = useContent();
  const [tool, setTool] = useState<Tool>(initial);
  const [input, setInput] = useState<Input & Partial<Item>>(edit ?? fresh());
  const [editing, setEditing] = useState(!!edit);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState(initialProject);
  const [kindFilter, setKindFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [snippet, setSnippet] = useState<Item | null>(null);
  const [clips, setClips] = useState<ClipStatus | null>(null);
  const [pinned, setPinned] = useState(true);
  const [utility, setUtility] = useState("calculator");
  const [text, setText] = useState("");
  const [zone, setZone] = useState("Asia/Manila");
  const draftTimer = useRef<number>();
  const owner = useRef(
    draftKey ??
      `${new URLSearchParams(location.search).has("tool") ? "tool" : referenceId ? "reference-" + referenceId : "main"}-${edit?.id ?? "capture"}`,
  );
  const draftExpected = useRef<Input | null>(null);
  const latest = useRef(input);
  latest.current = input;
  const dirty = useRef(false);
  const mounted = useRef(true);
  const run = async (fn: () => Promise<unknown>, message = "") => {
    setBusy(true);
    setFailure("");
    setStatus("");
    try {
      await fn();
      await refresh();
      setStatus(message);
    } catch (e) {
      setFailure(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);
  useEffect(() => {
    if (loaded) {
      const d = data.drafts?.[owner.current] ?? null;
      draftExpected.current = d;
      if (d) {
        setInput(d);
        dirty.current = false;
      } else if (!edit) setInput({ ...fresh(), project: initialProject });
    }
  }, [loaded]);
  const saveDraft = async (d: Input | null) => {
    await content.draft(d, owner.current, draftExpected.current);
    draftExpected.current = d;
  };
  const patch = (p: Partial<Input>) => {
    dirty.current = true;
    setInput((a) => ({ ...a, ...p }));
    setStatus("");
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      void saveDraft(latest.current).catch((e) =>
        setFailure(`Draft could not be kept: ${String(e)}`),
      );
    }, 500);
  };
  const close = () =>
    void run(async () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      if (dirty.current) await saveDraft(latest.current);
      onClose();
    });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "Enter" &&
        (tool === "quick-capture" || editing)
      ) {
        e.preventDefault();
        keep();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    if (!isNative()) return;
    let off = () => {};
    let dead = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<{ tool: Tool; landmark?: string }>("pip://tool", (e) => {
          if (dirty.current) {
            void saveDraft(latest.current).catch((e) => setFailure(String(e)));
            dirty.current = false;
          }
          setTool(e.payload.tool);
          setEditing(false);
          setQuery("");
          setFailure("");
          setStatus("");
          setProject("");
          void loadLandmarks().then((s) => {
            const l = s.layout.landmarks.find(
              (x) => x.id === e.payload.landmark,
            ) as any;
            setProject(l?.project ?? "");
            if (
              e.payload.tool === "quick-capture" &&
              !latest.current.body &&
              !latest.current.title
            )
              setInput((a) => ({ ...a, project: l?.project ?? "" }));
          });
          void refresh();
        }),
      )
      .then((f) => {
        if (dead) f();
        else off = f;
      });
    return () => {
      dead = true;
      off();
    };
  }, [refresh]);
  useEffect(() => {
    if (tool !== "clipboard-shelf") return;
    const reload = () =>
      void clipboard
        .status()
        .then(setClips)
        .catch((e) => setFailure(String(e)));
    reload();
    let dead = false;
    let off = () => {};
    if (isNative())
      void clipboard.watch(reload).then((f) => {
        if (dead) f();
        else off = f;
      });
    return () => {
      dead = true;
      off();
    };
  }, [tool]);
  const keep = () => {
    if (busy) return;
    void run(async () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      const n = await content.keep({
        ...input,
        body: input.body.slice(0, 200000),
        title:
          input.title || input.body.split("\n")[0].slice(0, 80) || "Untitled",
      });
      dirty.current = false;
      setInput(n);
      await saveDraft(null);
      setEditing(false);
      if (!edit) setInput(fresh());
    }, "Got it. Saved.");
  };
  const copy = async (value: string) => {
    if (isNative()) await call("clipboard_text", { text: value });
    else await navigator.clipboard.writeText(value);
  };
  const openLink = (url: string) => {
    if (isNative()) return call("link_open", { url });
    if (!/^https?:\/\//.test(url)) throw Error("Use an http or https link.");
    window.open(url, "_blank", "noopener,noreferrer");
    return Promise.resolve();
  };
  const select = (n: Item) => {
    setInput(n);
    setEditing(true);
    dirty.current = false;
    setStatus("");
    setFailure("");
  };
  const active = data.items.filter(
    (n) => !n.deleted && (!referenceId || n.id === referenceId),
  );
  const visible = active
    .filter(
      (n) =>
        (!project || n.project === project) &&
        (!kindFilter || n.kind === kindFilter) &&
        `${n.title} ${n.body} ${n.checklist?.map((c) => c.text).join(" ") ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated,
    );
  const toolKinds: Partial<Record<Tool, Kind[]>> = {
    snippets: ["snippet"],
    "follow-ups": ["task"],
    "resume-cards": ["resume"],
  };
  const results = visible.filter(
    (n) => !toolKinds[tool] || toolKinds[tool]!.includes(n.kind),
  );
  const add = (kind: Kind) => {
    setInput({ ...fresh(kind), project });
    setEditing(true);
    dirty.current = false;
  };
  let output = "";
  if (tool === "utilities") {
    try {
      if (utility === "calculator") {
        const n = text.length < 1000 ? evaluate(text) : null;
        output =
          n === null
            ? "Enter arithmetic, for example (125 + 75) × 0.2"
            : format(n);
      } else if (utility === "word count")
        output = `${text.trim() ? text.trim().split(/\s+/u).length : 0} words · ${[...text].length} characters`;
      else if (utility === "cleanup")
        output = text
          .split("\n")
          .map((x) => x.trim().replace(/[ \t]+/g, " "))
          .join("\n")
          .replace(/\n{3,}/g, "\n\n");
      else output = convertTime(text, zone);
    } catch (e) {
      output = String(e);
    }
  }
  return (
    <section
      className="tool-panel"
      aria-label={
        editing ? "Edit item" : TOOLS.find((t) => t.id === tool)?.label
      }
    >
      <header className="tool-header">
        <div className="tool-brand" data-tauri-drag-region>
          {data.prefs.mascot && (
            <Mascot
              state={
                failure
                  ? "error"
                  : busy
                    ? "saving"
                    : status
                      ? "saved"
                      : "capturing"
              }
              size={32}
            />
          )}
          <strong>
            {editing
              ? "Keep a thought"
              : TOOLS.find((t) => t.id === tool)?.label}
          </strong>
        </div>
        <button
          className="icon-button"
          onClick={close}
          disabled={busy}
          aria-label="Close tool"
        >
          ×
        </button>
      </header>
      <div className="tool-body">
        {error && (
          <div role="alert" className="error">
            {error}
            <button onClick={() => void refresh()}>Retry</button>
          </div>
        )}
        {!loaded && !error && <p role="status">Loading your shelf…</p>}
        {loaded && (tool === "quick-capture" || editing) ? (
          <div className="capture-form">
            <label>
              Type
              <select
                value={input.kind}
                onChange={(e) => patch({ kind: e.target.value as Kind })}
              >
                {[
                  "note",
                  "checklist",
                  "link",
                  "image",
                  "file",
                  "snippet",
                  "task",
                  "resume",
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                autoFocus
                value={input.title}
                maxLength={200}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="A little thought worth keeping"
              />
            </label>
            <label>
              {input.kind === "snippet"
                ? "Template · use {{name}}, {{company}}, {{date}}"
                : input.kind === "link"
                  ? "URL"
                  : "Your thought"}
              <textarea
                value={input.body}
                onChange={(e) => patch({ body: e.target.value })}
                rows={5}
                placeholder="Put it here. Then get back to your day."
                onPaste={(e) => {
                  const file = imageFrom(e.clipboardData);
                  if (file) {
                    e.preventDefault();
                    void run(async () => {
                      patch({ image: await toDataUrl(file), kind: "image" });
                    });
                  }
                }}
              />
            </label>
            {input.image && (
              <img
                className="capture-image"
                src={input.image}
                alt="Pasted attachment"
              />
            )}
            {input.kind === "checklist" && (
              <div>
                {input.checklist?.map((c, i) => (
                  <div className="check-row" key={i}>
                    <input
                      aria-label={`Complete ${c.text}`}
                      type="checkbox"
                      checked={c.done}
                      onChange={(e) =>
                        patch({
                          checklist: input.checklist!.map((x, j) =>
                            j === i ? { ...x, done: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`Checklist item ${i + 1}`}
                      value={c.text}
                      onChange={(e) =>
                        patch({
                          checklist: input.checklist!.map((x, j) =>
                            j === i ? { ...x, text: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <button
                      aria-label={`Remove item ${i + 1}`}
                      onClick={() =>
                        patch({
                          checklist: input.checklist!.filter((_, j) => j !== i),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    patch({
                      checklist: [
                        ...(input.checklist ?? []),
                        { text: "", done: false },
                      ],
                    })
                  }
                >
                  Add checklist item
                </button>
              </div>
            )}
            {input.kind === "task" && (
              <>
                <label>
                  Due date and time
                  <input
                    type="datetime-local"
                    value={
                      input.due
                        ? new Date(
                            new Date(input.due).getTime() -
                              new Date(input.due).getTimezoneOffset() * 60000,
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      patch({
                        due: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : undefined,
                      })
                    }
                  />
                </label>
                <label>
                  Waiting on
                  <input
                    value={input.waiting ?? ""}
                    onChange={(e) => patch({ waiting: e.target.value })}
                    placeholder="Name or team"
                  />
                </label>
                <p className="hint">
                  Reminders run while Pip is open or in the tray. Fully quitting
                  stops reminders; overdue items appear after restart. Enable
                  notifications in Settings.
                </p>
              </>
            )}
            {input.kind === "resume" && (
              <>
                <label>
                  Next action
                  <input
                    value={input.next ?? ""}
                    onChange={(e) => patch({ next: e.target.value })}
                  />
                </label>
                <label>
                  Related resources
                  <textarea
                    value={input.resources ?? ""}
                    onChange={(e) => patch({ resources: e.target.value })}
                    rows={2}
                  />
                </label>
              </>
            )}
            <label>
              Project
              <input
                list="projects"
                value={input.project}
                onChange={(e) => patch({ project: e.target.value })}
                placeholder="Optional"
              />
              <datalist id="projects">
                {data.projects.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </datalist>
            </label>
            <details>
              <summary>Attach a file</summary>
              <p className="hint">
                Keep a copy stores a file managed by Pip. Save a shortcut uses
                the original; it may stop working if moved or deleted.
              </p>
              <div className="actions">
                <button
                  disabled={!isNative() || busy}
                  onClick={() =>
                    void run(async () => {
                      const a = await call<any>("attachment_pick", {
                        mode: "copy",
                      });
                      if (a)
                        patch({
                          attachments: [...(input.attachments ?? []), a],
                        });
                    })
                  }
                >
                  Keep a copy
                </button>
                <button
                  disabled={!isNative() || busy}
                  onClick={() =>
                    void run(async () => {
                      const a = await call<any>("attachment_pick", {
                        mode: "shortcut",
                      });
                      if (a)
                        patch({
                          attachments: [...(input.attachments ?? []), a],
                        });
                    })
                  }
                >
                  Save a shortcut
                </button>
              </div>
              {!isNative() && (
                <p className="hint">
                  File attachments require the desktop application.
                </p>
              )}
            </details>
            {input.attachments?.map((a) => (
              <div key={a.id} className="attachment">
                <span>
                  {a.name} · {a.mode}
                </span>
                <button
                  aria-label={`Remove ${a.name}`}
                  onClick={() =>
                    patch({
                      attachments: input.attachments!.filter(
                        (x) => x.id !== a.id,
                      ),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <div className="actions">
              <button className="primary" disabled={busy} onClick={keep}>
                {busy ? "Keeping…" : "Keep it"}
              </button>
              {input.id && (
                <button
                  onClick={() => {
                    const { id: _id, revision: _revision, ...copy } = input;
                    setInput(copy);
                    latest.current = copy;
                    void run(async () => {
                      await content.keep(copy);
                      dirty.current = false;
                      setEditing(false);
                    }, "Kept a separate copy.");
                  }}
                >
                  Keep separate copy
                </button>
              )}
            </div>
          </div>
        ) : loaded && tool === "favorites" ? (
          <div className="favorite-grid">
            {TOOLS.filter((t) => t.id !== "favorites").map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTool(t.id);
                  setEditing(false);
                }}
              >
                {t.label}
                <span>Open tool →</span>
              </button>
            ))}
          </div>
        ) : loaded && tool === "utilities" ? (
          <div className="capture-form">
            <label>
              Utility
              <select
                value={utility}
                onChange={(e) => setUtility(e.target.value)}
              >
                {["calculator", "word count", "cleanup", "time zone"].map(
                  (u) => (
                    <option key={u}>{u}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              {utility === "time zone"
                ? "Date/time with offset (2026-10-05T08:00:00Z)"
                : "Input"}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
              />
            </label>
            {utility === "time zone" && (
              <label>
                Destination zone
                <input
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  placeholder="America/New_York"
                />
              </label>
            )}
            <output className="utility-result">{output}</output>
            <button
              onClick={() => void run(() => copy(output), "Copied.")}
              disabled={!text}
            >
              Copy result
            </button>
            <p className="hint">
              Arithmetic is parsed locally. Captured text is never executed.
            </p>
          </div>
        ) : loaded && tool === "clipboard-shelf" ? (
          <div>
            <p className="hint">
              Clipboard history is optional and local. It cannot reliably
              identify every password or sensitive item. Pause before copying
              secrets.
            </p>
            {!clips ? (
              <p>Loading clipboard…</p>
            ) : (
              <>
                <div className="actions">
                  <button
                    disabled={!clips.supported || busy}
                    onClick={() =>
                      void run(
                        async () => {
                          await clipboard.enable(!clips.enabled);
                          setClips(await clipboard.status());
                        },
                        clips.enabled ? "History paused." : "History enabled.",
                      )
                    }
                  >
                    {clips.enabled ? "Pause history" : "Enable history"}
                  </button>
                  <button
                    disabled={!clips.items.length || busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Clear clipboard history, including pinned entries?",
                        )
                      )
                        void run(async () => {
                          await clipboard.remove(null);
                          setClips(await clipboard.status());
                        }, "History cleared.");
                    }}
                  >
                    Clear history
                  </button>
                </div>
                {!clips.supported && (
                  <p className="empty">
                    Clipboard collection requires Windows.
                  </p>
                )}
                {clips.items.map((c) => (
                  <article className="result" key={c.id}>
                    {c.image ? (
                      <img
                        className="capture-image"
                        src={c.image}
                        alt="Clipboard image"
                      />
                    ) : (
                      <pre>{c.text}</pre>
                    )}
                    <div className="actions">
                      <button
                        onClick={() =>
                          void run(() => clipboard.copy(c.id), "Copied.")
                        }
                      >
                        Copy
                      </button>
                      <button
                        onClick={() =>
                          void run(async () => {
                            const cfg = await call<any>("clipboard_config", {
                              config: null,
                            });
                            cfg.pinned = cfg.pinned.includes(c.id)
                              ? cfg.pinned.filter((x: number) => x !== c.id)
                              : [...cfg.pinned, c.id];
                            await call("clipboard_config", { config: cfg });
                          }, "Pin updated.")
                        }
                      >
                        Pin / unpin
                      </button>
                      <button
                        onClick={() =>
                          void run(
                            () =>
                              content.keep({
                                kind: c.image ? "image" : "note",
                                title: c.text.slice(0, 60) || "Clipboard image",
                                body: c.text,
                                project,
                                image: c.image,
                              }),
                            "Kept in Library.",
                          )
                        }
                      >
                        Keep it
                      </button>
                      <button
                        onClick={() =>
                          void run(async () => {
                            await clipboard.remove(c.id);
                            setClips(await clipboard.status());
                          })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
                {clips.items.length === 0 && (
                  <p className="empty">
                    Your shelf is empty. Enable history, then copy something.
                  </p>
                )}
              </>
            )}
          </div>
        ) : loaded ? (
          <div className="recall">
            <label>
              Search
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find something you kept"
              />
            </label>
            <div className="filter-row">
              <label>
                Project
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">All projects</option>
                  {[
                    ...new Set([
                      ...data.projects,
                      ...active.map((n) => n.project).filter(Boolean),
                    ]),
                  ].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                >
                  <option value="">All types</option>
                  {[
                    "note",
                    "checklist",
                    "link",
                    "image",
                    "file",
                    "snippet",
                    "task",
                    "resume",
                  ].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
            </div>
            {toolKinds[tool] && (
              <button
                className="primary"
                onClick={() => add(toolKinds[tool]![0])}
              >
                New {toolKinds[tool]![0]}
              </button>
            )}
            {snippet && (
              <div className="snippet-fill">
                <h3>{snippet.title}</h3>
                {fields(snippet.body).map((f) => (
                  <label key={f}>
                    {f}
                    <input
                      value={
                        values[f] ??
                        (f === "date" ? new Date().toLocaleDateString() : "")
                      }
                      onChange={(e) =>
                        setValues((a) => ({ ...a, [f]: e.target.value }))
                      }
                    />
                  </label>
                ))}
                <pre>
                  {fillTemplate(snippet.body, {
                    date: new Date().toLocaleDateString(),
                    ...values,
                  })}
                </pre>
                <button
                  onClick={() =>
                    void run(
                      () =>
                        copy(
                          fillTemplate(snippet.body, {
                            date: new Date().toLocaleDateString(),
                            ...values,
                          }),
                        ),
                      "Copied reply.",
                    )
                  }
                >
                  Copy reply
                </button>
                <button onClick={() => setSnippet(null)}>Close preview</button>
              </div>
            )}
            {results.map((n) => (
              <article
                key={n.id}
                className={`result ${n.done ? "completed" : ""}`}
              >
                <div className="result-heading">
                  <strong>
                    {n.pinned ? "• " : ""}
                    {n.title}
                  </strong>
                  <span>{n.kind}</span>
                </div>
                {n.image && (
                  <img className="capture-image" src={n.image} alt={n.title} />
                )}
                <p>{n.body.slice(0, 400)}</p>
                {n.checklist?.map((c, i) => (
                  <label className="check-row" key={i}>
                    <input
                      type="checkbox"
                      checked={c.done}
                      onChange={(e) =>
                        void run(() =>
                          content.patch(n.id, n.revision, {
                            checklist: n.checklist!.map((x, j) =>
                              j === i ? { ...x, done: e.target.checked } : x,
                            ),
                          }),
                        )
                      }
                    />
                    {c.text}
                  </label>
                ))}
                {n.next && (
                  <p>
                    <b>Next:</b> {n.next}
                  </p>
                )}
                {n.resources && <pre>{n.resources}</pre>}
                {n.due && (
                  <p className="hint">
                    Due {new Date(n.due).toLocaleString()}
                    {n.waiting ? ` · Waiting on ${n.waiting}` : ""}
                  </p>
                )}
                {n.attachments?.map((a) => (
                  <button
                    key={a.id}
                    onClick={() =>
                      void run(() => call("attachment_open", { id: a.id }))
                    }
                  >
                    {a.name} ↗
                  </button>
                ))}
                <div className="actions">
                  <button onClick={() => select(n)}>Edit</button>
                  <button
                    onClick={() => void run(() => copy(n.body), "Copied.")}
                  >
                    Copy
                  </button>
                  {n.kind === "link" && (
                    <button onClick={() => void run(() => openLink(n.body))}>
                      Open link ↗
                    </button>
                  )}
                  {n.kind === "snippet" && (
                    <button
                      onClick={() => {
                        setSnippet(n);
                        setValues({});
                      }}
                    >
                      Fill fields
                    </button>
                  )}
                  {n.kind === "task" && (
                    <button
                      onClick={() =>
                        void run(() =>
                          content.patch(n.id, n.revision, { done: !n.done }),
                        )
                      }
                    >
                      {n.done ? "Reopen" : "Complete"}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      void run(() =>
                        content.patch(n.id, n.revision, { pinned: !n.pinned }),
                      )
                    }
                  >
                    {n.pinned ? "Unpin" : "Pin"}
                  </button>
                  {isNative() && (
                    <button
                      onClick={() =>
                        void run(() => call("floating_open", { id: n.id }))
                      }
                    >
                      Float
                    </button>
                  )}
                </div>
              </article>
            ))}
            {results.length === 0 && (
              <div className="empty">
                {data.prefs.mascot && <Mascot size={60} />}
                <h3>
                  {query
                    ? "Nothing matches yet"
                    : "A little space for useful things"}
                </h3>
                <p>
                  {query
                    ? "Try a different word or project."
                    : "Keep your first item and it will appear here."}
                </p>
                <button onClick={() => add(toolKinds[tool]?.[0] ?? "note")}>
                  Create an item
                </button>
              </div>
            )}
            {tool === "floating-reference" && isNative() && (
              <button
                onClick={() =>
                  void run(async () => {
                    await call("window_pin", { pinned: !pinned });
                    setPinned(!pinned);
                  })
                }
              >
                {pinned ? "Unpin this window" : "Pin above other windows"}
              </button>
            )}
          </div>
        ) : null}
      </div>
      <footer className="tool-footer">
        {failure ? (
          <p className="error" role="alert">
            {failure}
          </p>
        ) : (
          <p role="status">
            {busy ? "Working…" : status || "Need it later? Pip it."}
          </p>
        )}
        <small>Esc to dismiss · Ctrl+Enter to keep</small>
      </footer>
    </section>
  );
}
