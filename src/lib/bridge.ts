import { invoke } from "@tauri-apps/api/core";
import type { Draft, Note, NoteFilter } from "../types";

const isTauri = () => "__TAURI_INTERNALS__" in window;

const memoryKey = "pip-notes";
const draftKey = "pip-draft";
const now = () => new Date().toISOString();

function memoryNotes(): Note[] {
  return JSON.parse(localStorage.getItem(memoryKey) || "[]");
}
function setMemoryNotes(notes: Note[]) {
  localStorage.setItem(memoryKey, JSON.stringify(notes));
}
function nextId() {
  return crypto.randomUUID();
}

export const bridge = {
  async listNotes(filter:NoteFilter, query:string):Promise<Note[]> {
    if (isTauri()) return invoke("list_notes", { filter, query });
    const q = query.trim().toLowerCase();
    const today = new Date().toDateString();
    return memoryNotes()
      .filter(n => {
        if (filter === "trash") return !!n.deletedAt;
        if (n.deletedAt) return false;
        if (filter === "pinned" && !n.pinned) return false;
        if (filter === "today") {
          const created = new Date(n.createdAt).toDateString() === today;
          const updated = new Date(n.updatedAt).toDateString() === today;
          if (!created && !updated) return false;
        }
        return !q || (n.title + " " + n.body).toLowerCase().includes(q);
      })
      .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async createNote(title:string, body:string):Promise<Note> {
    if (isTauri()) return invoke("create_note", { input:{ title, body } });
    const t = now();
    const note:Note = {
      id:nextId(), title, body, kind:"text", checklist:[], pinned:false,
      deletedAt:null, createdAt:t, updatedAt:t, revision:1
    };
    setMemoryNotes([note, ...memoryNotes()]);
    return note;
  },

  async updateNote(note:Note):Promise<Note> {
    if (isTauri()) return invoke("update_note", { input:note });
    const notes = memoryNotes();
    const idx = notes.findIndex(n => n.id === note.id);
    if (idx < 0) throw new Error("Note not found");
    if (notes[idx].revision !== note.revision) throw new Error("revision_conflict");
    const updated = { ...note, updatedAt:now(), revision:note.revision + 1 };
    notes[idx] = updated;
    setMemoryNotes(notes);
    return updated;
  },

  async togglePin(note:Note):Promise<Note> {
    return this.updateNote({ ...note, pinned:!note.pinned });
  },

  async trashNote(note:Note):Promise<Note> {
    return this.updateNote({ ...note, deletedAt:now() });
  },

  async restoreNote(note:Note):Promise<Note> {
    return this.updateNote({ ...note, deletedAt:null });
  },

  async deleteForever(id:string):Promise<void> {
    if (isTauri()) return invoke("delete_note_forever", { id });
    setMemoryNotes(memoryNotes().filter(n => n.id !== id));
  },

  async loadDraft():Promise<Draft|null> {
    if (isTauri()) return invoke("load_capture_draft");
    return JSON.parse(localStorage.getItem(draftKey) || "null");
  },

  async saveDraft(title:string, body:string):Promise<Draft> {
    if (isTauri()) return invoke("save_capture_draft", { input:{ title, body } });
    const draft = { id:"capture", title, body, updatedAt:now() };
    localStorage.setItem(draftKey, JSON.stringify(draft));
    return draft;
  },

  async clearDraft():Promise<void> {
    if (isTauri()) return invoke("clear_capture_draft");
    localStorage.removeItem(draftKey);
  },

  async exportJson():Promise<string> {
    if (isTauri()) return invoke("export_notes_json");
    return JSON.stringify(memoryNotes().filter(n => !n.deletedAt), null, 2);
  }
};