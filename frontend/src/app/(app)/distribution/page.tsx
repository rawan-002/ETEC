"use client";

import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/components/Shell";
import { Empty, ErrorNote, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { fmtDate, levelLabel } from "@/lib/labels";
import type { Course } from "@/lib/types";

interface Distribution {
  term: string;
  courses: Course[];
  unassigned: Course[];
  without_coordinator: Course[];
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  pending_users: { id: number; name: string; department: string | null }[];
}

export default function DistributionPage() {
  const me = useMe();
  const program = me.program ?? "CS";
  const { data, reload } = useApi<Distribution>(`/api/programs/${program}/distribution`);
  const [error, setError] = useState<string | null>(null);
  if (!data) return <Spinner />;

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "تعذّر التنفيذ"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="h-page">توزيع المقررات — الفصل {data.term}</h1>
          <p className="muted mt-1">يختار الأساتذة مقرراتهم بأنفسهم. راجع التوزيع وصحّحه ثم اعتمده؛ التذكيرات لا تبدأ قبل الاعتماد.</p>
        </div>
        {data.approved ? (
          <div className="rounded-xl bg-leaf-50 px-4 py-2 text-sm text-leaf">اعتمده {data.approved_by} · {fmtDate(data.approved_at!)}</div>
        ) : (
          <button className="btn-primary" onClick={() => run(() => api(`/api/programs/${program}/distribution/approve`, { method: "POST" }))}>
            اعتماد التوزيع وبدء التذكيرات
          </button>
        )}
      </div>
      <ErrorNote message={error} />

      {data.pending_users.length > 0 && (
        <section className="card p-5">
          <h2 className="font-bold text-navy">طلبات إضافة أسماء ({data.pending_users.length})</h2>
          <ul className="mt-3 divide-y divide-line">
            {data.pending_users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">{u.name} <span className="text-ink-soft">· {u.department}</span></span>
                <button className="btn-primary px-3 py-1.5" onClick={() => run(() => api(`/api/users/${u.id}/approve`, { method: "POST" }))}>اعتماد</button>
                <button className="btn-danger px-3 py-1.5" onClick={() => run(() => api(`/api/users/${u.id}/reject`, { method: "POST" }))}>رفض</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold text-red-700">مقررات بدون أستاذ ({data.unassigned.length})</h2>
          {data.unassigned.length === 0 ? <p className="muted mt-2">كل المقررات لها أستاذ.</p> : (
            <ul className="mt-2 space-y-1 text-sm">{data.unassigned.map((c) => <li key={c.id}><span className="ltr font-semibold">{c.code}</span> <span className="ltr">{c.title}</span></li>)}</ul>
          )}
          <p className="mt-3 text-xs text-ink-faint">المقررات الاختيارية غير المطروحة هذا الفصل تبقى بدون أستاذ، ولا تُرسل لها تذكيرات.</p>
        </section>
        <section className="card p-5">
          <h2 className="font-bold text-amber-700">مقررات بدون منسق ({data.without_coordinator.length})</h2>
          {data.without_coordinator.length === 0 ? <p className="muted mt-2">لكل مقرر مطروح منسق.</p> : (
            <ul className="mt-2 space-y-1 text-sm">{data.without_coordinator.map((c) => <li key={c.id}><span className="ltr font-semibold">{c.code}</span> <span className="ltr">{c.title}</span></li>)}</ul>
          )}
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line p-4 font-bold text-navy">التوزيع الحالي</h2>
        <div className="divide-y divide-line">
          {data.courses.filter((c) => c.teachers?.length).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <Link href={`/courses/${c.id}`} className="min-w-0 flex-1 hover:text-royal">
                <span className="ltr font-semibold">{c.code}</span> <span className="ltr">{c.title}</span>
                <span className="mr-2 text-xs text-ink-faint">{levelLabel(c.level, c.group)}</span>
              </Link>
              <div className="flex flex-wrap gap-2">
                {c.teachers!.map((t) => (
                  <span key={t.assignment_id} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1">
                    {t.name}
                    <button className={`text-xs ${t.is_coordinator ? "font-bold text-leaf" : "text-ink-faint hover:text-royal"}`}
                      title={t.is_coordinator ? "المنسق" : "تعيينه منسقًا"}
                      onClick={() => !t.is_coordinator && run(() => api(`/api/assignments/${t.assignment_id}`, { method: "PATCH", json: { is_coordinator: true } }))}>
                      {t.is_coordinator ? "منسق" : "جعله منسقًا"}
                    </button>
                    <button className="text-xs text-red-600" title="إزالة" onClick={() => run(() => api(`/api/assignments/${t.assignment_id}`, { method: "DELETE" }))}>×</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!data.courses.some((c) => c.teachers?.length) && <div className="p-6"><Empty>لم يختر أي أستاذ مقرراته بعد.</Empty></div>}
        </div>
      </section>
    </div>
  );
}
