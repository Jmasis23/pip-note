import { useEffect, useState } from "react";
import { call, isNative } from "../native";
import { content, saveExport } from "./storage";
import { useContent } from "./useContent";
import { type Item, type Kind, type Preferences } from "./model";
import { Check, GestureSettings, ClipboardSettings } from "./SettingsPanels";
import { containModal } from "../components/modalFocus";
import { useRef } from "react";
import ToolPanel, { Mascot } from "./ToolPanel";
import { LandmarksSheet } from "../landmarks/LandmarksSheet";
import { DEFAULT_PREFS } from "../domain";
import { loadLandmarks } from "../landmarks/api";
import { type Tool } from "../landmarks/model";
const pages = [
  "Library",
  "Projects",
  "Snippets",
  "Follow-ups",
  "Landmarks",
  "Settings",
] as const;
type Page = (typeof pages)[number];
export default function App() {
  const params = new URLSearchParams(location.search);
  const { data, loaded, error, refresh } = useContent();
  const modalRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<Page>("Library");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("");
  const [type, setType] = useState("");
  const [view, setView] = useState("all");
  const [board, setBoard] = useState(true);
  const [edit, setEdit] = useState<Item | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [draftKey, setDraftKey] = useState<string | undefined>();
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [overlayControls, setOverlayControls] = useState(true);
  const [landmarkPrefs, setLandmarkPrefs] = useState(DEFAULT_PREFS);
  const [paused, setPaused] = useState(false);
  const [listener, setListener] = useState("");
  const [projectName, setProjectName] = useState("");
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
      setBusy(false);
    }
  };
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        data.prefs.theme === "dark" ||
        (data.prefs.theme === "system" && mq.matches)
          ? "dark"
          : "light";
      document.documentElement.dataset.motion = data.prefs.reducedMotion
        ? "reduced"
        : "full";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [data.prefs.theme, data.prefs.reducedMotion]);
  useEffect(() => {
    void loadLandmarks()
      .then((s) => {
        setPaused(s.paused);
        setListener(s.status);
        if (s.shortcut_errors?.length) setFailure(s.shortcut_errors.join(" "));
        if (s.sensitivity !== undefined)
          setLandmarkPrefs((p) => ({ ...p, shakeSens: s.sensitivity! }));
      })
      .catch((e) => setFailure(String(e)));
    if (!isNative()) return;
    const poll = window.setInterval(
      () =>
        void loadLandmarks()
          .then((s) => {
            setListener(s.status);
            setPaused(s.paused);
            if (s.status !== "starting") clearInterval(poll);
          })
          .catch((e) => setFailure(String(e))),
      1000,
    );
    let dead = false;
    let offs: (() => void)[] = [];
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const fs = await Promise.all([
        listen("pip://settings", () => setPage("Settings")),
        listen<boolean>("pip://pause-changed", (e) => setPaused(!e.payload)),
        listen("pip://displays-changed", () =>
          setStatus("Your displays changed. Review affected Landmarks."),
        ),
      ]);
      if (dead) fs.forEach((f) => f());
      else offs = fs;
    });
    return () => {
      dead = true;
      clearInterval(poll);
      offs.forEach((f) => f());
    };
  }, []);
  useEffect(() => {
    if (tool && modalRef.current)
      return containModal(
        modalRef.current,
        modalRef.current.querySelector("input,textarea,button"),
      );
  }, [tool]);
  const dismiss = async () => {
    if (isNative()) await call("dismiss");
    else window.close();
  };
  if (params.has("overlay"))
    return (
      <div
        className={`overlay-app ${overlayControls ? "" : "controls-hidden"}`}
      >
        <LandmarksSheet
          prefs={landmarkPrefs}
          setPrefs={async (p) => {
            if (isNative())
              await call("set_shake_level", { level: p.shakeSens });
            setLandmarkPrefs(p);
          }}
          onClose={() =>
            void call("overlays", { enabled: false, landmarks: [] })
          }
        />
        <button
          className="overlay-toggle"
          onClick={() => setOverlayControls((v) => !v)}
        >
          {overlayControls ? "Hide setup controls" : "Show setup controls"}
        </button>
      </div>
    );
  if (params.has("tool"))
    return (
      <ToolPanel
        tool={(params.get("tool") ?? "quick-capture") as Tool}
        onClose={() => void dismiss()}
      />
    );
  if (params.has("reference")) {
    const n = data.items.find((x) => x.id === params.get("reference"));
    return !loaded ? (
      <p>Loading reference…</p>
    ) : n ? (
      <ToolPanel
        tool="floating-reference"
        project={n.project}
        referenceId={n.id}
        onClose={() => void dismiss()}
      />
    ) : (
      <div className="empty">
        {error || "This reference was removed."}
        <button onClick={() => void dismiss()}>Close</button>
      </div>
    );
  }
  const newItem = (kind: Kind = "note") => {
    setDraftKey(undefined);
    setEdit(null);
    setTool(
      kind === "snippet"
        ? "snippets"
        : kind === "task"
          ? "follow-ups"
          : kind === "resume"
            ? "resume-cards"
            : "quick-capture",
    );
  };
  const pause = () =>
    void run(
      async () => {
        if (!isNative()) {
          setPaused(!paused);
          return;
        }
        await call("set_shake_enabled", { enabled: paused });
        setPaused(!paused);
      },
      paused ? "Gestures resumed." : "Gestures paused.",
    );
  const items = data.items
    .filter((n) => (view === "trash" ? n.deleted : !n.deleted))
    .filter((n) => !project || n.project === project)
    .filter((n) => !type || n.kind === type)
    .filter((n) => view !== "pinned" || n.pinned)
    .filter((n) =>
      `${n.title} ${n.body} ${n.checklist?.map((c) => c.text).join(" ") ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .filter((n) =>
      page === "Snippets"
        ? n.kind === "snippet"
        : page === "Follow-ups"
          ? n.kind === "task"
          : true,
    )
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated,
    );
  const projects = [
    ...new Set([
      ...data.projects,
      ...data.items.map((n) => n.project).filter(Boolean),
    ]),
  ];
  const prefs = (p: Partial<Preferences>) =>
    void run(async () => {
      if (
        isNative() &&
        (p.startup !== undefined || p.notifications !== undefined)
      )
        await call("preferences", {
          startup: p.startup ?? data.prefs.startup,
          notifications: p.notifications ?? data.prefs.notifications,
        });
      await content.prefs(p);
    }, "Preference saved.");
  return (
    <div className="app-shell">
      {isNative() && (
        <div className="native-titlebar">
          <span data-tauri-drag-region>Pip</span>
          <div>
            <button
              aria-label="Minimize"
              onClick={() => void call("win_minimize")}
            >
              −
            </button>
            <button
              aria-label="Maximize or restore"
              onClick={() => void call("win_toggle_max")}
            >
              □
            </button>
            <button
              aria-label="Close Pip window"
              onClick={() => void call("win_close")}
            >
              ×
            </button>
          </div>
        </div>
      )}
      <aside className="sidebar">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Library");
          }}
        >
          <img
            src={`/brand/wordmark-${data.prefs.theme === "dark" || (data.prefs.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light"}.svg`}
            alt="Pip"
            width="95"
            height="42"
          />
        </a>
        <p className="tagline">Need it later? Pip it.</p>
        <button className="primary capture-button" onClick={() => newItem()}>
          ＋ Keep a thought <kbd>⌃ ⇧ Space</kbd>
        </button>
        <nav aria-label="Main navigation">
          {pages.map((p, i) => (
            <button
              key={p}
              aria-current={page === p ? "page" : undefined}
              className={page === p ? "selected" : ""}
              onClick={() => {
                setPage(p);
                setProject("");
                setQuery("");
                setView("all");
                setType("");
              }}
            >
              <span aria-hidden>{["▤", "▱", "⌘", "◷", "⌖", "⚙"][i]}</span>
              {p}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`listener ${paused ? "paused" : ""}`}
            onClick={pause}
            disabled={busy}
          >
            <span />
            {!isNative()
              ? "Preview only"
              : paused
                ? "Gestures paused"
                : "Pip is listening"}
            <small>{paused ? "Resume" : "Pause"}</small>
          </button>
          <p>
            {isNative()
              ? listener === "running"
                ? "Quietly here when you need it."
                : `Listener: ${listener}`
              : "Browser preview · native gestures unavailable"}
          </p>
          <button onClick={() => setTool("favorites")}>
            All quick tools →
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="page-header">
          <div>
            <span className="eyebrow">YOUR DESK COMPANION</span>
            <h1>{page}</h1>
            <p>
              {page === "Library"
                ? "A home for the things you’ll need again."
                : page === "Projects"
                  ? "Keep the whole picture close."
                  : page === "Snippets"
                    ? "Good replies, ready when you are."
                    : page === "Follow-ups"
                      ? "The next step, without the mental tabs."
                      : page === "Landmarks"
                        ? "Your cursor knows the way."
                        : "Make Pip feel at home."}
            </p>
          </div>
          {page !== "Settings" && page !== "Landmarks" && (
            <button
              className="primary"
              onClick={() =>
                newItem(
                  page === "Snippets"
                    ? "snippet"
                    : page === "Follow-ups"
                      ? "task"
                      : "note",
                )
              }
            >
              ＋{" "}
              {page === "Snippets"
                ? "New snippet"
                : page === "Follow-ups"
                  ? "New follow-up"
                  : "Keep a thought"}
            </button>
          )}
        </header>
        {!data.prefs.onboarded && loaded && (
          <section className="onboarding">
            {data.prefs.mascot && <Mascot size={68} />}
            <div>
              <h2>Catch one thought. Find your rhythm.</h2>
              <p>
                Create a Landmark, assign Quick Capture, test a deliberate
                wiggle, then keep an item. Use the listening control or tray
                menu to pause Pip.
              </p>
              <div className="actions">
                <button
                  className="primary"
                  onClick={() => setPage("Landmarks")}
                >
                  Set up a Landmark
                </button>
                <button onClick={() => newItem()}>Capture an item</button>
                <button onClick={() => prefs({ onboarded: true })}>
                  Finish setup
                </button>
              </div>
            </div>
          </section>
        )}
        {(failure || error) && (
          <div role="alert" className="error">
            {failure || error}
            <button onClick={() => void refresh()}>Reload</button>
          </div>
        )}
        {status && (
          <p className="status" role="status">
            {status}
          </p>
        )}
        {!loaded && !error && <p role="status">Loading your library…</p>}
        {page === "Landmarks" ? (
          <div className="landmark-page">
            <LandmarksSheet
              prefs={landmarkPrefs}
              setPrefs={async (p) => {
                if (isNative())
                  await call("set_shake_level", { level: p.shakeSens });
                setLandmarkPrefs(p);
              }}
              onClose={() => setPage("Library")}
            />
          </div>
        ) : page === "Settings" ? (
          <div className="settings-grid">
            <section className="settings-section">
              <h2>Appearance</h2>
              <label>
                Theme
                <select
                  value={data.prefs.theme}
                  onChange={(e) =>
                    prefs({ theme: e.target.value as Preferences["theme"] })
                  }
                >
                  <option value="light">Warm ivory</option>
                  <option value="dark">Charcoal</option>
                  <option value="system">Follow Windows</option>
                </select>
              </label>
              <Check
                label="Show Pip’s mascot"
                value={data.prefs.mascot}
                onChange={(v) => prefs({ mascot: v })}
              />
              <Check
                label="Reduce motion"
                value={data.prefs.reducedMotion}
                onChange={(v) => prefs({ reducedMotion: v })}
              />
            </section>
            <section className="settings-section">
              <h2>Background companion</h2>
              <Check
                label="Keep Pip running in the tray when the main window closes"
                value={data.prefs.trayOnClose}
                onChange={(v) => prefs({ trayOnClose: v })}
              />
              <Check
                label="Launch Pip when Windows starts"
                value={data.prefs.startup}
                onChange={(v) => prefs({ startup: v })}
                disabled={!isNative()}
              />
              <Check
                label="Allow follow-up notifications"
                value={data.prefs.notifications}
                onChange={(v) => prefs({ notifications: v })}
                disabled={!isNative()}
              />
              <p className="hint">
                Capture shortcut: Ctrl+Shift+Space. All tools: Ctrl+Shift+P.
                Notifications require Pip to be running, including in the tray.
                Fully quitting stops reminders.
              </p>
            </section>
            <GestureSettings report={setFailure} />
            <ClipboardSettings report={setFailure} />
            <section className="settings-section">
              <h2>Your data, on your PC</h2>
              <p className="hint">
                Offline, without an account. No AI suggestions, telemetry or
                cloud sync. Local files are not encrypted. Exports include
                content and attachment references; attached file bytes remain on
                this PC.
              </p>
              <div className="actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const file = await saveExport();
                      if (file) setStatus(`Exported to ${file}`);
                    })
                  }
                >
                  Export library
                </button>
                {isNative() ? (
                  <button
                    onClick={() =>
                      void run(async () => {
                        const raw = await call<string | null>("import_file");
                        if (
                          raw &&
                          confirm(
                            "Replace your current content with this export? A backup is created first.",
                          )
                        ) {
                          await call("backup");
                          await content.import(JSON.parse(raw));
                          setStatus("Imported.");
                        }
                      })
                    }
                  >
                    Import library
                  </button>
                ) : (
                  <label className="file-button">
                    Import JSON
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) =>
                        void run(async () => {
                          const f = e.target.files?.[0];
                          if (f && confirm("Replace the preview content?"))
                            await content.import(JSON.parse(await f.text()));
                        })
                      }
                    />
                  </label>
                )}
                <button
                  disabled={!isNative() || busy}
                  onClick={() =>
                    void run(async () => {
                      const p = await call<string>("backup");
                      setStatus(`Backup created: ${p}`);
                    })
                  }
                >
                  Back up now
                </button>
                <button
                  disabled={!isNative() || busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Restore a Pip SQLite backup? Current data is backed up first. All other tool windows will close.",
                      )
                    )
                      void run(async () => {
                        const r = await call<string | null>("backup_restore");
                        if (r) setStatus("Backup restored.");
                      });
                  }}
                >
                  Restore backup
                </button>
              </div>
              <p className="hint">
                Daily SQLite backups are automatic while Pip runs. The latest
                seven daily backups are retained. Manual backups are retained
                until you remove them in File Explorer.
              </p>
            </section>
          </div>
        ) : (
          <>
            {page === "Projects" && (
              <section className="project-strip">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await content.project(projectName);
                      setProjectName("");
                    }, "Project created.");
                  }}
                >
                  <label>
                    New project
                    <input
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="Client or project name"
                    />
                  </label>
                  <button disabled={!projectName.trim() || busy}>
                    Create project
                  </button>
                </form>
                <div className="actions">
                  <button
                    aria-pressed={!project}
                    onClick={() => setProject("")}
                  >
                    All projects
                  </button>
                  {projects.map((p) => (
                    <button
                      aria-pressed={project === p}
                      key={p}
                      onClick={() => setProject(p)}
                    >
                      {p}
                      <small>
                        {
                          data.items.filter(
                            (n) => n.project === p && !n.deleted,
                          ).length
                        }
                      </small>
                    </button>
                  ))}
                </div>
                <button onClick={() => setTool("resume-cards")}>
                  Resume cards →
                </button>
              </section>
            )}
            <div className="library-toolbar">
              <label className="search-label">
                <span aria-hidden>⌕</span>
                <input
                  aria-label="Search saved items"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your kept things…"
                />
              </label>
              <select
                aria-label="Filter type"
                value={type}
                onChange={(e) => setType(e.target.value)}
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
              <button
                aria-label={board ? "Use list view" : "Use board view"}
                onClick={() => setBoard(!board)}
              >
                {board ? "☷ List" : "▦ Board"}
              </button>
            </div>
            <div className="view-tabs" role="group" aria-label="Library views">
              {["all", "pinned", "recent", "trash"].map((v) => (
                <button
                  aria-pressed={view === v}
                  className={view === v ? "active" : ""}
                  key={v}
                  onClick={() => setView(v)}
                >
                  {v === "all" ? "All items" : v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
              <span>
                {items.length} kept {items.length === 1 ? "thing" : "things"}
              </span>
            </div>
            {view === "all" && Object.keys(data.drafts ?? {}).length > 0 && (
              <section className="draft-strip">
                <h2>Unfinished thoughts</h2>
                <div className="actions">
                  {Object.entries(data.drafts ?? {}).map(([key, d]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setDraftKey(key);
                        setEdit(null);
                        setTool("quick-capture");
                      }}
                    >
                      {d.title ||
                        d.body.slice(0, 40) ||
                        "Draft with attachment"}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section
              className={board ? "item-board" : "item-list"}
              aria-label="Saved items"
            >
              {(view === "recent"
                ? items.sort((a, b) => b.updated - a.updated)
                : items
              ).map((n, i) => (
                <article
                  className={`item-card color-${i % 5} ${n.done ? "completed" : ""}`}
                  key={n.id}
                >
                  <div className="card-meta">
                    <span>
                      {n.kind}
                      {n.project ? ` / ${n.project}` : ""}
                    </span>
                    <button
                      aria-label={
                        n.pinned ? `Unpin ${n.title}` : `Pin ${n.title}`
                      }
                      aria-pressed={n.pinned}
                      onClick={() =>
                        void run(() =>
                          content.patch(n.id, n.revision, {
                            pinned: !n.pinned,
                          }),
                        )
                      }
                    >
                      {n.pinned ? "◆" : "◇"}
                    </button>
                  </div>
                  <button
                    className="card-content"
                    onClick={() => {
                      setEdit(n);
                      setTool("quick-recall");
                    }}
                  >
                    <h2>{n.title}</h2>
                    {n.image && <img src={n.image} alt={n.title} />}
                    <p>{n.body.slice(0, 240)}</p>
                    {n.checklist?.map((c, j) => (
                      <p key={j} className={c.done ? "checked" : ""}>
                        {c.done ? "☑" : "☐"} {c.text}
                      </p>
                    ))}
                    {n.next && (
                      <p>
                        <b>Next:</b> {n.next}
                      </p>
                    )}
                    {n.due && (
                      <small>Due {new Date(n.due).toLocaleString()}</small>
                    )}
                    {n.waiting && <small>Waiting on {n.waiting}</small>}
                    {n.attachments?.length ? (
                      <small>{n.attachments.length} attachment(s)</small>
                    ) : null}
                  </button>
                  <footer>
                    <time>
                      {new Date(n.updated).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                    <div>
                      {n.deleted ? (
                        <>
                          <button
                            onClick={() =>
                              void run(
                                () =>
                                  content.patch(n.id, n.revision, {
                                    deleted: false,
                                  }),
                                "Restored.",
                              )
                            }
                          >
                            Restore
                          </button>
                          <button
                            className="danger"
                            onClick={() => {
                              if (confirm(`Permanently delete “${n.title}”?`))
                                void run(
                                  () => content.remove(n.id),
                                  "Deleted.",
                                );
                            }}
                          >
                            Delete forever
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            aria-label={`Edit ${n.title}`}
                            onClick={() => {
                              setEdit(n);
                              setTool("quick-recall");
                            }}
                          >
                            Edit
                          </button>
                          <button
                            aria-label={`Move ${n.title} to Trash`}
                            onClick={() =>
                              void run(
                                () =>
                                  content.patch(n.id, n.revision, {
                                    deleted: true,
                                  }),
                                "Moved to Trash.",
                              )
                            }
                          >
                            Trash
                          </button>
                        </>
                      )}
                    </div>
                  </footer>
                </article>
              ))}
            </section>
            {loaded && items.length === 0 && (
              <div className="library-empty">
                {data.prefs.mascot && <Mascot size={88} />}
                <h2>
                  {query
                    ? "Nothing here matches that"
                    : "Room for your next good thought"}
                </h2>
                <p>
                  {query
                    ? "Try another word or clear your filters."
                    : "Wiggle inside a Landmark, or use the shortcut to keep something."}
                </p>
                <button className="primary" onClick={() => newItem()}>
                  Keep a thought
                </button>
              </div>
            )}
          </>
        )}
      </main>
      {tool && (
        <div
          className="modal-scrim"
          role="dialog"
          aria-modal="true"
          aria-label="Pip quick tool"
          ref={modalRef}
        >
          <ToolPanel
            key={draftKey ?? edit?.id ?? tool}
            draftKey={draftKey}
            tool={tool}
            edit={edit ?? undefined}
            project={project}
            onClose={() => {
              setTool(null);
              setEdit(null);
              setDraftKey(undefined);
              void refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}
