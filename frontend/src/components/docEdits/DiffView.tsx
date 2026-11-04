"use client";

import { sideBySide, type Segment } from "@/lib/demo/diff";

function Line({ segs, side }: { segs: Segment[] | null; side: "left" | "right" }) {
  if (!segs) return <div className="min-h-6 rounded bg-canvas/60" />;
  return (
    <div className="min-h-6 whitespace-pre-wrap break-words">
      {segs.map((s, i) => s.type === "equal" ? <span key={i}>{s.text}</span>
        : side === "left" ? <del key={i} className="rounded bg-red-100 text-red-800">{s.text}</del>
        : <ins key={i} className="rounded bg-leaf-50 text-leaf no-underline">{s.text}</ins>)}
    </div>
  );
}

/** Original and proposed text side by side, deletions in red and additions in green. Stacks on phones. */
export function DiffView({ original, proposed }: { original: string; proposed: string }) {
  const rows = sideBySide(original, proposed);
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="grid grid-cols-1 bg-canvas text-xs font-semibold text-ink-soft sm:grid-cols-2">
        <div className="hidden px-3 py-2 sm:block">المستند الأصلي</div>
        <div className="hidden px-3 py-2 sm:block">النسخة المقترحة</div>
      </div>
      <div className="ltr divide-y divide-line text-left font-mono text-[13px] leading-6" dir="ltr">
        {rows.map((r, i) => (
          <div key={i} className={`grid grid-cols-1 gap-x-4 px-3 py-1 sm:grid-cols-2 ${r.changed ? "bg-amber-50/40" : ""}`}>
            <div className={r.changed ? "" : "text-ink-soft"}>
              <span className="text-[10px] text-ink-faint sm:hidden">الأصلي: </span><Line segs={r.left} side="left" />
            </div>
            <div className={r.changed ? "" : "text-ink-soft"}>
              <span className="text-[10px] text-ink-faint sm:hidden">المقترح: </span><Line segs={r.right} side="right" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
