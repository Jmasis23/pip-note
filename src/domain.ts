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
export type Draft = { text: string; updatedAt: number };
export type Theme = "light" | "dark" | "system";
export type Prefs = { shortcut: string; theme: Theme; reducedMotion: boolean; launchAtLogin: boolean; shakeToCapture: boolean };
export type View = "all" | "today" | "pinned" | "trash";
export type NoteInput = Partial<Pick<Note, "title" | "body" | "rich" | "checklist" | "pinned" | "folder">>;
export const DEFAULT_PREFS: Prefs = { shortcut: "Ctrl+Shift+Space", theme: "system", reducedMotion: false, launchAtLogin: false, shakeToCapture: true };
export class ConflictError extends Error {
  constructor(public latest: Note) { super("This note changed somewhere else."); this.name = "ConflictError"; }
}
export class NotFoundError extends Error { constructor() { super("Note not found."); this.name = "NotFoundError"; } }
export class ValidationError extends Error { constructor(m: string) { super(m); this.name = "ValidationError"; } }
