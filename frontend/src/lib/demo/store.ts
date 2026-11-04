/**
 * Shared plumbing for the prototype's browser-only data (reports, document edits, re-analysis, inbox state).
 * Nothing here reaches a server or is trusted for access; each feature keeps its data under its own key.
 */

export const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export interface HistoryEntry {
  id: string;
  at: string;
  actorName: string;
  action: string;
  note: string | null;
}

export const historyEntry = (actorName: string, action: string, note: string | null = null, at = iso()): HistoryEntry =>
  ({ id: uid(), at, actorName, action, note });

export interface DemoStore<T> {
  load(): T;
  save(data: T): void;
  reset(): void;
  subscribe(onChange: () => void): () => void;
}

/** A versioned JSON document in localStorage, with change events for this tab and other tabs. */
export function createDemoStore<T extends { version: number }>(key: string, empty: () => T): DemoStore<T> {
  const event = `aq-demo-change:${key}`;
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as T;
          if (parsed && typeof parsed === "object" && parsed.version === empty().version) return parsed;
        }
      } catch {
        // Unreadable or blocked storage: start from the empty document.
      }
      return empty();
    },
    save(data) {
      try {
        window.localStorage.setItem(key, JSON.stringify(data));
      } catch {
        // Storage full or blocked: the change lives until the page reloads.
      }
      window.dispatchEvent(new Event(event));
    },
    reset() {
      try { window.localStorage.removeItem(key); } catch { /* blocked storage */ }
      window.dispatchEvent(new Event(event));
    },
    subscribe(onChange) {
      const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) onChange(); };
      window.addEventListener(event, onChange);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(event, onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

export function cleanText(text: string, { required = false, max = 2000, what = "النص" } = {}): string | null {
  const t = text.trim();
  if (!t) {
    if (required) throw new Error(`اكتب ${what}`);
    return null;
  }
  if (t.length > max) throw new Error(`${what} أطول من ${max} حرف`);
  return t;
}

/** Save generated content as a file in the browser (no server involved). */
export function downloadFile(name: string, content: string, mime = "text/html;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["﻿", content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A printable RTL page with a visible prototype watermark. */
export function prototypeHtml(title: string, body: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:"IBM Plex Sans Arabic",Tahoma,sans-serif;color:#1E2633;max-width:900px;margin:32px auto;padding:0 16px;line-height:1.8}
h1{color:#13294B}h2{color:#1F5AA6;margin-top:28px}.proto{border:2px dashed #b45309;background:#fffbeb;color:#92400e;padding:10px 14px;border-radius:12px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #E3E8EF;padding:6px 8px;text-align:right;vertical-align:top}th{background:#F6F8FB}
.muted{color:#5B6678;font-size:13px}del{background:#fee2e2}ins{background:#dcfce7;text-decoration:none}</style></head><body>
<div class="proto">نموذج أولي — مستند تجريبي غير معتمد رسميًا، أُنشئ في المتصفح لأغراض العرض.</div>${body}</body></html>`;
}
