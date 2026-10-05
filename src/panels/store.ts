import { useCallback, useEffect, useState } from "react";
import { kv } from "../native";
/** Small local lists (snippets, follow-ups). Stored through the same durable KV as notes, under keys that never sync. */
export function readList<T>(key: string): T[] {
  try { const raw = kv.getItem(key); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}
export function useList<T extends { id: string }>(key: string) {
  const [items, setItems] = useState<T[]>(() => readList<T>(key));
  useEffect(() => { setItems(readList<T>(key)); }, [key]);
  const commit = useCallback((next: T[]) => { setItems(next); kv.setItem(key, JSON.stringify(next)); }, [key]);
  return [items, commit] as const;
}
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export type Snippet = { id: string; name: string; text: string; updatedAt: number };
export type Followup = { id: string; text: string; due: string; done: boolean; createdAt: number };
export const SNIPPETS_KEY = "snippets";
export const FOLLOWUPS_KEY = "followups";
export const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Overdue means a due date before today, local time. Done items are never overdue. */
export const isOverdue = (f: Followup, today = new Date()): boolean => !f.done && !!f.due && f.due < localDate(today);
