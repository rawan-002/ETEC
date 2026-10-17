"use client";

import { useState } from "react";
import { Empty, Spinner } from "@/components/ui";
import { useApi } from "@/lib/api";
import { fmtDate, KIND_AR } from "@/lib/labels";

interface Event { id: number; at: string; kind: string; message: string; actor: string }

export default function ActivityPage() {
  const [kind, setKind] = useState<string>("");
  const { data } = useApi<Event[]>(`/api/activity${kind ? `?kind=${kind}` : ""}`, 15000);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">سجل النشاط</h1>
        <p className="muted mt-1">كل عملية رفع وتصنيف واعتماد وتذكير، بالمستخدم والوقت. السجل لا يُعدّل ولا يُحذف.</p>
      </div>
      <div className="flex flex-wrap gap-1 text-sm">
        <button onClick={() => setKind("")} className={`rounded-lg px-3 py-1 ${!kind ? "bg-navy text-white" : "bg-white hover:bg-canvas"}`}>الكل</button>
        {Object.entries(KIND_AR).map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-lg px-3 py-1 ${kind === k ? "bg-navy text-white" : "bg-white hover:bg-canvas"}`}>{l}</button>
        ))}
      </div>
      {!data ? <Spinner /> : data.length === 0 ? <Empty>لا توجد أحداث.</Empty> : (
        <ol className="card divide-y divide-line">
          {data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-3 p-4 text-sm">
              <span className="w-28 shrink-0 rounded-full bg-canvas px-2 py-0.5 text-center text-xs text-ink-soft">{KIND_AR[e.kind] ?? e.kind}</span>
              <div className="min-w-0 flex-1">
                <div>{e.message}</div>
                <div className="mt-0.5 text-xs text-ink-faint">{e.actor} · {fmtDate(e.at)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
