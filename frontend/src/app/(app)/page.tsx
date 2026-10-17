"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMe } from "@/components/Shell";
import { ComponentRow, Empty, Progress, Spinner, Stat, StatusPill } from "@/components/ui";
import { useApi } from "@/lib/api";
import { levelLabel, PROGRAM_AR } from "@/lib/labels";
import type { Course, ProgramSummary } from "@/lib/types";

export default function DashboardPage() {
  const me = useMe();
  return me.role === "faculty" ? <FacultyDashboard /> : <ProgramsDashboard />;
}

function FacultyDashboard() {
  const me = useMe();
  const { data: courses } = useApi<Course[]>("/api/me/courses", 20000);
  if (!courses) return <Spinner />;
  const missing = courses.flatMap((c) =>
    (c.components ?? []).filter((s) => s.status === "missing" && (c.is_coordinator || s.component !== "spec"))
      .map((s) => ({ course: c, label: s.label })),
  );
  return (
    <div className="space-y-6">
      <Hero title={me.is_tester ? "أهلًا بفريق المشروع" : `أهلًا ${me.name.split(" ")[0]}`} subtitle="ارفع ملفات مقرراتك مرة واحدة، والمنصة تفرزها وتتابع النواقص." />
      {missing.length > 0 ? (
        <div className="card border-red-200 p-5">
          <h2 className="font-bold text-red-700">المطلوب منك ({missing.length})</h2>
          <ul className="mt-3 space-y-2">
            {missing.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span><span className="ltr font-semibold">{m.course.code}</span> {m.course.title} — {m.label}</span>
                <Link href={`/courses/${m.course.id}`} className="btn-primary px-3 py-1.5">رفع</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : courses.length > 0 ? (
        <div className="card border-leaf/30 bg-leaf-50 p-5 text-leaf">ملفات مقرراتك مكتملة. لا يوجد مطلوب حاليًا.</div>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-navy">مقرراتي</h2>
          <Link href="/select-courses" className="text-sm text-royal">تعديل المقررات</Link>
        </div>
        {courses.length === 0 ? <Empty>لم تختر مقررات بعد.</Empty> : (
          <div className="grid gap-4 md:grid-cols-2">
            {courses.map((c) => (
              <Link key={c.id} href={`/courses/${c.id}`} className="card block p-5 transition hover:border-royal/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="ltr text-right text-xs font-semibold text-ink-soft">{c.code}</div>
                    <div className="ltr text-right font-bold">{c.title}</div>
                  </div>
                  {c.is_coordinator && <span className="rounded-full bg-royal-50 px-2 py-0.5 text-xs font-semibold text-royal">منسق</span>}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Progress value={c.percent ?? 0} />
                  <span className="text-sm font-semibold">{c.percent}%</span>
                </div>
                <div className="mt-3"><ComponentRow components={c.components ?? []} /></div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProgramsDashboard() {
  const me = useMe();
  const { data } = useApi<{ term: string; programs: ProgramSummary[]; review_queue: number }>("/api/dashboard", 15000);
  const [program, setProgram] = useState<string | null>(null);
  if (!data) return <Spinner />;
  const current = data.programs.find((p) => p.program === program) ?? data.programs[0];
  const title = me.role === "dean" ? "معًا نحو كلية أكثر تميزًا" : me.role === "head" ? `قسم ${me.department ?? ""}` : "متابعة سير المعالجة";

  return (
    <div className="space-y-6">
      <Hero title={title} subtitle="نرتقي بجودة برامجنا الأكاديمية من خلال التحليل الذكي، والتعاون الفعّال، والتحسين المستمر."
        live percent={current?.percent} />
      {data.programs.length > 1 && (
        <div className="flex gap-2">
          {data.programs.map((p) => (
            <button key={p.program} className={p.program === current?.program ? "btn-primary" : "btn-ghost"} onClick={() => setProgram(p.program)}>
              {PROGRAM_AR[p.program] ?? p.program}
            </button>
          ))}
        </div>
      )}
      {!current ? <Empty>لا توجد برامج ضمن صلاحياتك.</Empty> : <ProgramView p={current} reviewQueue={data.review_queue} />}
    </div>
  );
}

function ProgramView({ p, reviewQueue }: { p: ProgramSummary; reviewQueue: number }) {
  const me = useMe();
  const [filter, setFilter] = useState<"all" | "incomplete" | "unassigned">("incomplete");
  const rows = useMemo(() => p.courses.filter((c) => {
    const offered = !!c.teachers?.length;
    return filter === "all" ? true : filter === "unassigned" ? !offered : offered && (c.percent ?? 0) < 100;
  }), [p, filter]);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="اكتمال الوثائق" value={`${p.percent}%`} tone={p.percent >= 90 ? "good" : "default"} />
        <Stat label="مقررات مكتملة" value={`${p.courses_complete} / ${p.courses_offered}`} hint={`المطروحة هذا الفصل من ${p.courses_total} في الخطة`} />
        <Stat label="مكوّنات ناقصة" value={p.missing_components} tone={p.missing_components ? "warn" : "good"} />
        <Stat label="مقررات غير مطروحة / بدون أستاذ" value={p.courses_unassigned} tone={p.courses_unassigned ? "warn" : "good"}
          hint={p.distribution_approved ? "التوزيع معتمد" : "التوزيع لم يُعتمد بعد"} />
      </div>
      {(me.role === "team" || me.role === "dean") && reviewQueue > 0 && (
        <Link href="/review" className="card flex items-center justify-between border-amber-200 bg-amber-50 p-4 text-amber-800">
          <span>{reviewQueue} ملف بانتظار حسم فريق المشروع</span><span>←</span>
        </Link>
      )}
      {me.role === "head" && !p.distribution_approved && (
        <Link href="/distribution" className="card flex items-center justify-between border-royal/30 bg-royal-50 p-4 text-royal">
          <span>راجع توزيع المقررات واعتمده لتبدأ التذكيرات</span><span>←</span>
        </Link>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <h2 className="font-bold text-navy">حالة المقررات</h2>
          <div className="mr-auto flex gap-1 text-sm">
            {([["incomplete", "المطروحة غير المكتملة"], ["unassigned", "غير مطروحة / بدون أستاذ"], ["all", "الكل"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-1 ${filter === k ? "bg-navy text-white" : "hover:bg-canvas"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-canvas text-xs text-ink-soft">
              <tr>
                <th className="p-3 text-right font-semibold">المقرر</th>
                <th className="p-3 text-right font-semibold">المستوى</th>
                <th className="p-3 font-semibold">توصيف</th>
                <th className="p-3 font-semibold">نظري</th>
                <th className="p-3 font-semibold">عملي</th>
                <th className="p-3 font-semibold">تقييم</th>
                <th className="p-3 text-right font-semibold">الأساتذة</th>
                <th className="p-3 font-semibold">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} className={`hover:bg-canvas/60 ${c.teachers?.length ? "" : "opacity-50"}`}>
                  <td className="p-3">
                    <Link href={`/courses/${c.id}`} className="block hover:text-royal">
                      <span className="ltr block text-right text-xs text-ink-soft">{c.code}</span>
                      <span className="ltr block text-right font-medium">{c.title}</span>
                    </Link>
                  </td>
                  <td className="p-3 text-xs text-ink-soft">{levelLabel(c.level, c.group)}</td>
                  {(c.components ?? []).map((s) => <td key={s.component} className="p-3 text-center" title={s.note}><StatusPill status={s.status} compact /></td>)}
                  <td className="p-3 text-xs">
                    {c.teachers?.length ? c.teachers.map((t) => <div key={t.assignment_id}>{t.name}{t.is_coordinator ? " (منسق)" : ""}</div>)
                      : <span className="text-ink-faint">غير مطروح / بدون أستاذ</span>}
                  </td>
                  <td className="p-3 text-center font-semibold">{c.teachers?.length ? `${c.percent}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="p-6"><Empty>لا توجد مقررات في هذا التصنيف.</Empty></div>}
        </div>
      </section>
    </>
  );
}

function Hero({ title, subtitle, live, percent }: { title: string; subtitle: string; live?: boolean; percent?: number }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-royal to-navy p-6 text-white lg:p-8">
      {live && <div className="mb-2 flex items-center gap-2 text-xs text-white/70"><span className="h-2 w-2 animate-pulse rounded-full bg-leaf" />تحديث مباشر</div>}
      <h1 className="text-2xl font-bold lg:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/80">{subtitle}</p>
      {percent !== undefined && (
        <div className="mt-5 max-w-sm">
          <div className="mb-1 flex justify-between text-xs text-white/80"><span>اكتمال ملفات المقررات</span><span>{percent}%</span></div>
          <div className="h-2 rounded-full bg-white/20"><div className="h-full rounded-full bg-gradient-to-l from-leaf to-sky" style={{ width: `${percent}%` }} /></div>
        </div>
      )}
      <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-sky/20 blur-2xl" />
    </div>
  );
}
