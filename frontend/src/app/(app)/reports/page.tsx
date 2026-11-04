"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { DemoBanner, FilterTabs, Pill } from "@/components/demo/DemoParts";
import { ReportDetail } from "@/components/reports/ReportDetail";
import { useMe } from "@/components/Shell";
import { Empty, ErrorNote, Spinner } from "@/components/ui";
import { useApi } from "@/lib/api";
import { fmtDate } from "@/lib/labels";
import type { ReportStatus } from "@/lib/reports";
import { buildFindings, canCreateReport, reportHasUpdate, reportNeedsMe, reportService, STATUS_AR, useReports } from "@/lib/reports";
import type { Course } from "@/lib/types";

type Filter = "all" | "mine" | ReportStatus;

export default function ReportsPage() {
  return <Suspense fallback={<Spinner />}><Reports /></Suspense>;
}

function Reports() {
  const me = useMe();
  const params = useSearchParams();
  const program = me.program ?? "CS";
  const { reports, viewer } = useReports(me);
  const { data: courses } = useApi<Course[]>(me.role === "faculty" ? null : `/api/courses?program=${program}`);
  const [filter, setFilter] = useState<Filter>(me.role === "faculty" ? "all" : "mine");
  const [selected, setSelected] = useState<string | null>(params.get("r"));
  const [creating, setCreating] = useState(false);
  const [courseId, setCourseId] = useState<number | "">("");
  const [err, setErr] = useState<string | null>(null);
  const offered = useMemo(() => (courses ?? []).filter((c) => c.teachers?.length), [courses]);

  // One sample report per offered course (up to three), built from each course's current data.
  useEffect(() => {
    if (!offered.length) return;
    Promise.all(offered.slice(0, 3).map(async (c) => ({
      course: { id: c.id, code: c.code, title: c.title }, program: c.program, findings: await buildFindings(c.id),
    }))).then((items) => reportService.seed(items)).catch(() => { /* the page still works without samples */ });
  }, [offered]);

  if (!reports || !viewer) return <Spinner />;
  const shown = reports.filter((r) => filter === "all" ? true : filter === "mine" ? reportNeedsMe(r, viewer) : r.status === filter);
  const current = reports.find((r) => r.id === selected);
  const count = (f: Filter) => reports.filter((r) => f === "all" ? true : f === "mine" ? reportNeedsMe(r, viewer) : r.status === f).length;

  const create = async () => {
    const c = offered.find((x) => x.id === courseId);
    if (!c) return setErr("اختر مقررًا");
    setErr(null);
    try {
      const r = await reportService.create(viewer, { id: c.id, code: c.code, title: c.title }, c.program, await buildFindings(c.id));
      setCreating(false); setFilter("all"); setSelected(r.id);
    } catch (e) { setErr(e instanceof Error ? e.message : "تعذّر إنشاء التقرير"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="h-page">تقارير تحليل الفجوات</h1>
          <p className="muted mt-1">يراجع رئيس القسم نتائج كل تقرير ويوافق عليها أو يعترض، ثم يعتمده العميد نهائيًا أو يعيده للتعديل.</p>
        </div>
        {canCreateReport(viewer) && !creating && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} />تقرير جديد</button>}
      </div>
      <DemoBanner>
        نموذج أولي: التقارير تُبنى في المتصفح من بيانات المقرر الحالية مع أمثلة موسومة، ولا يولّدها التحليل الذكي بعد.
        المراجعات والاعتمادات تجريبية ومحفوظة على هذا الجهاز فقط، ولا تُغيّر أي بيانات في المنصة.
        {viewer.role === "team" && <button className="ms-2 font-semibold underline" onClick={() => { reportService.reset(); setSelected(null); }}>إعادة تعيين البيانات التجريبية</button>}
      </DemoBanner>

      {creating && (
        <section className="card flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="rep-course">المقرر</label>
            <select id="rep-course" className="input" value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}>
              <option value="">اختر مقررًا مطروحًا…</option>
              {offered.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={create}>إنشاء التقرير</button>
          <button className="btn-ghost" onClick={() => setCreating(false)}>إلغاء</button>
          <div className="w-full"><ErrorNote message={err} /></div>
        </section>
      )}

      {reports.length === 0 ? <Empty>لا توجد تقارير بعد. تظهر بعد أن يختار الأساتذة مقرراتهم لهذا الفصل.</Empty> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className={`space-y-3 ${current ? "hidden lg:block" : ""}`}>
            <FilterTabs value={filter} onChange={setFilter} tabs={[
              ["mine", "بانتظاري", count("mine")], ["all", "الكل", count("all")],
              ...(Object.keys(STATUS_AR) as ReportStatus[]).map((s): [Filter, string, number] => [s, STATUS_AR[s].label, count(s)]),
            ]} />
            {shown.length === 0 && <Empty>لا توجد تقارير هنا.</Empty>}
            {shown.map((r) => (
              <button key={r.id} onClick={() => setSelected(r.id)}
                className={`block w-full rounded-2xl border bg-white p-4 text-right shadow-card transition ${selected === r.id ? "border-royal ring-2 ring-royal/15" : "border-line hover:border-royal/40"}`}>
                <div className="flex items-start gap-2">
                  {reportHasUpdate(r, viewer) && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-600" aria-label="تحديث جديد" />}
                  <span className="flex-1 font-semibold leading-6">تقرير #{r.number} · <span className="ltr">{r.course.code}</span></span>
                  <Pill {...STATUS_AR[r.status]} />
                </div>
                <div className="mt-1 text-xs text-ink-soft"><span className="ltr">{r.course.title}</span> · {r.findings.length} نتيجة · النسخة {r.versions.length}</div>
                <div className="mt-1 text-[11px] text-ink-faint">آخر تحديث {fmtDate(r.updatedAt)}{reportNeedsMe(r, viewer) && " · بانتظار إجرائك"}</div>
              </button>
            ))}
          </section>
          {current ? <ReportDetail key={current.id} r={current} viewer={viewer} onBack={() => setSelected(null)} />
            : <div className="hidden lg:block"><Empty>اختر تقريرًا لعرضه.</Empty></div>}
        </div>
      )}
    </div>
  );
}
