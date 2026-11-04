"use client";

import { History } from "lucide-react";
import { fmtDate } from "@/lib/labels";
import type { HistoryEntry } from "@/lib/demo/store";

/** Marks prototype data that does not come from the backend. */
export function DemoTag({ label = "تجريبي" }: { label?: string }) {
  return <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{label}</span>;
}

/** Marks data read from the platform's backend. */
export function RealTag({ label = "بيانات حقيقية" }: { label?: string }) {
  return <span className="shrink-0 rounded-full border border-leaf/20 bg-leaf-50 px-2 py-0.5 text-[11px] font-semibold text-leaf">{label}</span>;
}

export function DemoBanner({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{children}</div>;
}

export function Pill({ label, cls }: { label: string; cls: string }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function HistoryList({ entries, title = "سجل الإجراءات" }: { entries: HistoryEntry[]; title?: string }) {
  return (
    <div className="card p-6">
      <h3 className="flex items-center gap-2 font-bold text-navy"><History size={18} className="text-sky" />{title}</h3>
      {entries.length === 0 ? <p className="muted mt-3">لا توجد إجراءات بعد.</p> : (
        <ol className="mt-3 space-y-3">
          {[...entries].reverse().map((h) => (
            <li key={h.id} className="border-s-2 border-royal ps-3 text-sm">
              <div><span className="font-semibold">{h.actorName}</span> — {h.action}</div>
              {h.note && <div className="mt-0.5 text-ink-soft">«{h.note}»</div>}
              <div className="text-xs text-ink-faint">{fmtDate(h.at)}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** A segmented filter bar, as used across the platform's list pages. */
export function FilterTabs<K extends string>({ tabs, value, onChange }: { tabs: [K, string, number?][]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 text-sm shadow-card">
      {tabs.map(([k, label, count]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`rounded-lg px-2.5 py-1.5 ${value === k ? "bg-navy font-semibold text-white" : "text-ink-soft hover:bg-canvas"}`}>
          {label}{count !== undefined && <span className="opacity-70"> ({count})</span>}
        </button>
      ))}
    </div>
  );
}
