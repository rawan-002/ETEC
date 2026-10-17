"use client";

import Link from "next/link";
import { useMe } from "@/components/Shell";
import { Empty, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { DOC_STATUS, fmtDate } from "@/lib/labels";
import type { Doc } from "@/lib/types";

const CHOICES = [
  ["spec", "توصيف"],
  ["theory", "نظري"],
  ["practical", "عملي"],
  ["assessment", "تقييم"],
  ["other", "استبعاد"],
] as const;

export default function ReviewPage() {
  const me = useMe();
  const { data, reload } = useApi<Doc[]>("/api/review", 15000);
  if (!data) return <Spinner />;

  const decide = async (id: number, component: string) => {
    await api(`/api/documents/${id}/review`, { method: "POST", json: { component } });
    reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">مراجعة التصنيف</h1>
        <p className="muted mt-1">ملفات لم يحسمها التحليل بثقة كافية، أو تعذّرت معالجتها. حسمها يحدّث حالة المقرر مباشرة.</p>
      </div>
      {data.length === 0 ? <Empty>لا توجد ملفات بانتظار المراجعة.</Empty> : (
        <div className="card divide-y divide-line">
          {data.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <div className="min-w-0 flex-1">
                <a href={`/api/documents/${d.id}/download`} className="ltr block truncate text-right font-semibold hover:text-royal">{d.filename}</a>
                <div className="text-xs text-ink-soft">
                  <Link href={`/courses/${d.course_id}`} className="ltr hover:text-royal">{d.course}</Link> · {d.uploader} · {fmtDate(d.uploaded_at)}
                </div>
                {d.archive_path && <div className="ltr text-right text-xs text-ink-faint">{d.archive_path}</div>}
                <div className={`mt-1 text-xs ${DOC_STATUS[d.status].cls}`}>
                  {d.error ?? `${d.reason ?? ""}${d.component && d.component !== "other" ? ` — الترجيح: ${d.component_label}` : ""}`}
                </div>
              </div>
              {me.role === "team" && (
                <div className="flex flex-wrap gap-1">
                  {CHOICES.map(([k, l]) => (
                    <button key={k} className={k === "other" ? "btn-danger px-3 py-1.5" : "btn-ghost px-3 py-1.5"} onClick={() => decide(d.id, k)}>{l}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
