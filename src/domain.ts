export type ChecklistItem = { id: string; text: string; done: boolean };
export type Note = {
  id: string;
  title: string;
  body: string;
  /** Sanitized rich text (b, i, u, mark, lists). `body` always holds the plain-text twin for search and preview. */
  rich?: string;
  checklist: ChecklistItem[];
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  /** Folder path like "Work" or "Work/Clients". Empty or missing means no folder. */
  folder?: string;
  deletedAt: number | null;
  revision: number;
};
export type Draft = { id: string; text: string; updatedAt: number };
export type Theme = "light" | "dark" | "system";
export type Size = "s" | "m" | "l";
/** Text size has one extra, smaller step. */
export type TextSize = "xs" | Size;
export const TEXT_STEPS: TextSize[] = ["xs", "s", "m", "l"];
export type Accent = "lavender" | "sky" | "mint" | "peach" | "rose" | "graphite";
export type Prefs = {
  shortcut: string; theme: Theme; reducedMotion: boolean; launchAtLogin: boolean; shakeToCapture: boolean; /** 0 to 100, 50 is the default. */ shakeSens: number;
  cardSize: Size; textSize: TextSize; accent: Accent; /** "quiet" turns the tinted cards neutral. */ tint: "color" | "quiet";
  /** Folders created before any note is in them. */ extraFolders: string[];
  /** Card color picked per note. Kept on this device only. Missing means the automatic color. */ noteColors?: Record<string, "lav" | "mint" | "peach" | "white">;
};
export type View = "all" | "today" | "pinned" | "drafts" | "trash";
export type NoteInput = Partial<Pick<Note, "title" | "body" | "rich" | "checklist" | "pinned" | "folder">>;
export const DEFAULT_PREFS: Prefs = { shortcut: "Ctrl+Shift+Space", theme: "system", reducedMotion: false, launchAtLogin: false, shakeToCapture: true, shakeSens: 50, cardSize: "m", textSize: "m", accent: "lavender", tint: "color", extraFolders: [] };
export class ConflictError extends Error {
  constructor(public latest: Note) { super("This note changed somewhere else."); this.name = "ConflictError"; }
}
export class NotFoundError extends Error { constructor() { super("Note not found."); this.name = "NotFoundError"; } }
export class ValidationError extends Error { constructor(m: string) { super(m); this.name = "ValidationError"; } }
