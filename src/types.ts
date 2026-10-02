export type NoteKind = "text" | "checklist";
export type ChecklistItem = { id:string; text:string; done:boolean; order:number };
export type Note = {
  id:string; title:string; body:string; kind:NoteKind; checklist:ChecklistItem[];
  pinned:boolean; deletedAt:string|null; createdAt:string; updatedAt:string; revision:number;
};
export type NoteFilter = "all" | "today" | "pinned" | "trash";
export type SaveResult = { note: Note };
export type Draft = { id:string; title:string; body:string; updatedAt:string };