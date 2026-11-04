"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, ClipboardPen, FileBarChart, FileDiff, FileSearch, ListTodo, Scale, Sparkles, type LucideIcon } from "lucide-react";
import { DemoTag, RealTag } from "@/components/demo/DemoParts";
import { useMe } from "@/components/Shell";
import { api } from "@/lib/api";
import { useMyWork } from "@/lib/work";

interface AnalysisState { enabled: boolean; run: { status: string } | null }

function Tile({ icon: Icon, value, label, href, real, hint }: { icon: LucideIcon; value: string | number; label: string; href: string; real: boolean; hint?: string }) {
  return (
    <Link href={href} className="card group flex flex-col p-4 transition hover:border-royal/40">
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-royal" />
        <span className="ms-auto">{real ? <RealTag label="حقيقي" /> : <DemoTag />}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-navy">{value}</div>
      <div className="text-sm text-ink-soft group-hover:text-royal">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-faint">{hint}</div>}
    </Link>
  );
}

/** Extra indicators for the existing dashboard: each tile links to its page; prototype figures are tagged. */
export function DashboardInsights() {
  const me = useMe();
  const work = useMyWork(me);
  const { questions, myCourses, dash, requests, reports, proposals, tasks } = work;
  const courses = useMemo(() => me.role === "faculty" ? myCourses ?? [] : (dash?.programs ?? []).flatMap((p) => p.courses.filter((c) => c.teachers?.length)), [me.role, myCourses, dash]);
  const [analysis, setAnalysis] = useState<{ enabled: boolean; done: number; total: number } | null>(null);

  // Real analysis progress: one status call per offered course (capped), only when the course list changes.
  const ids = courses.slice(0, 12).map((c) => c.id).join(",");
  useEffect(() => {
    if (!ids) { setAnalysis({ enabled: true, done: 0, total: 0 }); return; }
    let live = true;
    Promise.all(ids.split(",").map((id) => api<AnalysisState>(`/api/courses/${id}/analysis`).catch(() => null))).then((rows) => {
      if (!live) return;
      const ok = rows.filter((r): r is AnalysisState => !!r);
      setAnalysis({ enabled: ok.some((r) => r.enabled), done: ok.filter((r) => r.run?.status === "done").length, total: ok.length });
    });
    return () => { live = false; };
  }, [ids]);

  const visibleQ = questions ?? [];
  const pending = visibleQ.filter((q) => q.status === "pending");
  const openRequests = (requests ?? []).filter((r) => r.status !== "completed");
  const waitingReports = (reports ?? []).filter((r) => me.role === "dean" ? r.status === "dean_review" : r.status !== "approved");
  const pendingEdits = (proposals ?? []).filter((p) => p.status === "pending_review" || p.status === "needs_changes");
  const reviewDocs = me.role === "team" || me.role === "dean" ? dash?.review_queue ?? 0
    : courses.reduce((n, c) => n + (c.components ?? []).filter((s) => s.status === "review" && s.documents > 0).length, 0);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={Sparkles} real href={courses[0] ? `/courses/${courses[0].id}` : "/"}
          value={analysis ? `${analysis.done} / ${analysis.total}` : "…"} label="تقدم تحليل المستندات"
          hint={analysis && !analysis.enabled ? "التحليل الذكي معطّل في هذه النسخة" : "مقررات اكتمل تحليلها"} />
        <Tile icon={Scale} real href="/decisions" value={visibleQ.length} label="مشكلات مكتشفة" hint={`${pending.length} بانتظار القرار`} />
        <Tile icon={ListTodo} real href="/decisions" value={pending.filter((q) => q.assigned_to_me).length} label="قرارات معلقة عليّ" />
        <Tile icon={FileSearch} real href={me.role === "team" || me.role === "dean" ? "/review" : courses[0] ? `/courses/${courses[0].id}` : "/"} value={reviewDocs} label="مستندات بانتظار المراجعة" />
        <Tile icon={ClipboardPen} real={false} href="/missing-data" value={openRequests.length} label="طلبات استكمال البيانات" />
        <Tile icon={FileBarChart} real={false} href="/reports" value={waitingReports.length} label={me.role === "dean" ? "تقارير بانتظار اعتمادك" : "تقارير لم تُعتمد بعد"} />
        <Tile icon={FileDiff} real={false} href="/document-edits" value={pendingEdits.length} label="تعديلات مستندات معلقة" />
        <Tile icon={ClipboardList} real={tasks.some((t) => t.real)} href="/inbox?tab=tasks" value={tasks.length} label="مهامي" />
      </div>
      {tasks.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold text-navy"><ListTodo size={18} className="text-royal" />المطلوب منك</h2>
            <Link href="/inbox?tab=tasks" className="text-sm text-royal">عرض كل المهام</Link>
          </div>
          <ul className="mt-3 space-y-2">
            {tasks.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link href={t.href.startsWith("#") ? "/inbox?tab=tasks" : t.href} className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 text-sm hover:bg-royal-50">
                  <span className="flex-1">{t.title}{t.detail && <span className="ltr text-xs text-ink-faint"> · {t.detail}</span>}</span>
                  {t.real ? <RealTag label="حقيقي" /> : <DemoTag />}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
