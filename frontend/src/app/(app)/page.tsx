"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, FileWarning, Sparkles, type LucideIcon } from "lucide-react";
import { useMe } from "@/components/Shell";
import { ComponentRow, Empty, Progress, Spinner, StatusPill } from "@/components/ui";
import { useApi } from "@/lib/api";
import { fmtDate, levelLabel, PROGRAM_AR } from "@/lib/labels";
import type { Course, ProgramSummary, QuestionSummary } from "@/lib/types";

interface Event { id: number; at: string; kind: string; message: string; actor: string }

const PRIORITY_PILL: Record<string, string> = {
  high: "bg-red-50 text-red-700", medium: "bg-amber-50 text-amber-700", low: "bg-slate-100 text-ink-soft",
};
const PRIORITY_AR: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };

export default function DashboardPage() {
  const me = useMe();
  return me.role === "faculty" ? <FacultyDashboard /> : <ProgramsDashboard />;
}

function Hero({ title, subtitle, percent, label }: { title: string; subtitle: string; percent?: number; label?: string }) {
  const me = useMe();
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-royal via-navy-700 to-navy p-7 text-white shadow-card lg:p-10">
      <div className="text-xs text-white/60">جامعة الباحة · {me.role_ar}</div>
      <h1 className="mt-2 text-3xl font-bold lg:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm text-white/80">{subtitle}</p>
      {percent !== undefined && (
        <div className="mt-6 max-w-md">
          <div className="mb-1.5 flex justify-between text-xs text-white/80"><span>{label}</span><span>{percent}%</span></div>
          <div className="h-2 rounded-full bg-white/20"><div className="h-full rounded-full bg-gradient-to-l from-leaf to-sky transition-all" style={{ width: `${percent}%` }} /></div>
        </div>
      )}
      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-sky/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-leaf/10 blur-3xl" />
    </div>
  );
}

function StatCard({ icon: Icon, value, label, tone = "default" }: { icon: LucideIcon; value: string | number; label: string; tone?: "default" | "warn" | "good" }) {
  const color = tone === "warn" ? "text-red-700" : tone === "good" ? "text-leaf" : "text-navy";
  return (
    <div className="card p-5">
      <Icon size={20} className="text-royal" />
      <div className={`mt-3 text-3xl font-bold ${color}`}>{value}</div>
      <div className="muted mt-1">{label}</div>
    </div>
  );
}

function ActivityFeed() {
  const { data } = useApi<Event[]>("/api/activity", 15000);
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-bold text-navy"><Activity size={18} className="text-sky" />النشاط المباشر</h2>
      {!data ? <Spinner /> : data.length === 0 ? <p className="muted mt-3">لا يوجد نشاط بعد.</p> : (
        <ul className="mt-4 space-y-3">
          {data.filter((e) => e.kind !== "login").slice(0, 7).map((e) => (
            <li key={e.id} className="border-s-2 border-royal ps-3 text-sm">
              <div className="leading-6">{e.message}</div>
              <div className="text-xs text-ink-faint">{e.actor} · {fmtDate(e.at)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DecisionsCard({ questions }: { questions: QuestionSummary[] | null }) {
  const mine = (questions ?? []).filter((q) => q.status === "pending" && q.assigned_to_me);
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-navy">قرارات بانتظاركم</h2>
        <Link href="/decisions" className="text-sm text-royal">عرض الكل</Link>
      </div>
      {!questions ? <Spinner /> : mine.length === 0 ? <p className="muted mt-3">لا توجد قرارات بانتظارك.</p> : (
        <ul className="mt-3 space-y-2">
          {mine.slice(0, 5).map((q) => (
            <li key={q.id}>
              <Link href={`/decisions?q=${q.id}`} className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 text-sm hover:bg-royal-50">
                <AlertTriangle size={16} className="shrink-0 text-amber-600" />
                <span className="flex-1">{q.title} <span className="ltr text-xs text-ink-faint">{q.course.code}</span></span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_PILL[q.priority]}`}>{PRIORITY_AR[q.priority]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MissingCard({ courses, onlyMine }: { courses: Course[]; onlyMine?: boolean }) {
  const items = courses.flatMap((c) => (c.components ?? [])
    .filter((s) => s.status === "missing" && (!onlyMine || c.is_coordinator || s.component !== "spec"))
    .map((s) => ({ c, s })));
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-bold text-navy"><FileWarning size={18} className="text-red-600" />وثائق ناقصة</h2>
      {items.length === 0 ? <p className="mt-3 flex items-center gap-2 text-sm text-leaf"><CheckCircle2 size={16} />لا توجد وثائق ناقصة.</p> : (
        <ul className="mt-3 space-y-2">
          {items.slice(0, 8).map(({ c, s }) => (
            <li key={`${c.id}-${s.component}`}>
              <Link href={`/courses/${c.id}`} className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 text-sm hover:bg-royal-50">
                <span className="flex-1">{s.label} — <span className="ltr">{c.code}</span></span>
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">ناقص</span>
              </Link>
            </li>
          ))}
          {items.length > 8 && <li className="text-xs text-ink-faint">و{items.length - 8} أخرى</li>}
        </ul>
      )}
    </section>
  );
}

function CourseRows({ courses }: { courses: Course[] }) {
  return (
    <div className="space-y-2">
      {courses.map((c) => (
        <Link key={c.id} href={`/courses/${c.id}`} className="flex items-center gap-4 rounded-xl bg-canvas px-4 py-3 transition hover:bg-royal-50">
          <div className="min-w-0 flex-1">
            <div className="ltr truncate text-right font-semibold">{c.title}</div>
            <div className="truncate text-xs text-ink-soft">
              <span className="ltr">{c.code}</span> · {c.teachers?.map((t) => t.name).join("، ") || "بدون أستاذ"}
            </div>
          </div>
          <div className="w-32 sm:w-48"><Progress value={c.percent ?? 0} /></div>
          <span className="w-10 text-left text-sm font-bold">{c.percent}%</span>
        </Link>
      ))}
    </div>
  );
}

function FacultyDashboard() {
  const me = useMe();
  const { data: courses } = useApi<Course[]>("/api/me/courses", 20000);
  const { data: questions } = useApi<QuestionSummary[]>("/api/questions", 20000);
  if (!courses) return <Spinner />;
  const avg = courses.length ? Math.round(courses.reduce((s, c) => s + (c.percent ?? 0), 0) / courses.length) : 0;
  const pending = (questions ?? []).filter((q) => q.status === "pending" && q.assigned_to_me).length;
  return (
    <div className="space-y-6">
      <Hero title={me.is_tester ? "أهلًا بفريق المشروع" : `أهلًا ${me.name.split(" ")[0]}`}
        subtitle="ارفع ملفات مقرراتك مرة واحدة، والمنصة تفرزها وتتابع النواقص، ويرصد التحليل الذكي ما يحتاج قرارك."
        percent={avg} label="اكتمال ملفات مقرراتي" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CheckCircle2} value={`${avg}%`} label="اكتمال ملفاتي" tone={avg === 100 ? "good" : "default"} />
        <StatCard icon={Sparkles} value={courses.length} label="مقرراتي" />
        <StatCard icon={Clock} value={pending} label="قرارات بانتظاري" tone={pending ? "warn" : "good"} />
        <StatCard icon={FileWarning} value={courses.reduce((s, c) => s + (c.components ?? []).filter((x) => x.status === "missing").length, 0)} label="وثائق ناقصة" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-navy">مقرراتي</h2>
            <Link href="/select-courses" className="text-sm text-royal">تعديل المقررات</Link>
          </div>
          {courses.length === 0 ? <Empty>لم تختر مقررات بعد.</Empty> : (
            <div className="space-y-3">
              {courses.map((c) => (
                <Link key={c.id} href={`/courses/${c.id}`} className="block rounded-xl bg-canvas p-4 transition hover:bg-royal-50">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="ltr text-right font-semibold">{c.title}</div>
                      <div className="ltr text-right text-xs text-ink-soft">{c.code}</div>
                    </div>
                    {c.is_coordinator && <span className="rounded-full bg-royal-50 px-2 py-0.5 text-xs font-semibold text-royal">منسق</span>}
                    <span className="text-sm font-bold">{c.percent}%</span>
                  </div>
                  <div className="mt-3"><Progress value={c.percent ?? 0} /></div>
                  <div className="mt-3"><ComponentRow components={c.components ?? []} /></div>
                </Link>
              ))}
            </div>
          )}
        </section>
        <ActivityFeed />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <DecisionsCard questions={questions} />
        <MissingCard courses={courses} onlyMine />
      </div>
    </div>
  );
}

function ProgramsDashboard() {
  const me = useMe();
  const { data } = useApi<{ term: string; programs: ProgramSummary[]; review_queue: number }>("/api/dashboard", 15000);
  const { data: questions } = useApi<QuestionSummary[]>("/api/questions", 20000);
  const [program, setProgram] = useState<string | null>(null);
  if (!data) return <Spinner />;
  const p = data.programs.find((x) => x.program === program) ?? data.programs[0];
  const title = me.role === "head" ? `قسم ${me.department ?? ""}` : "معًا نحو كلية أكثر تميزًا";
  const openQuestions = (questions ?? []).filter((q) => q.status === "pending").length;

  return (
    <div className="space-y-6">
      <Hero title={title} subtitle="نرتقي بجودة برامجنا الأكاديمية من خلال التحليل الذكي، والتعاون الفعّال، والتحسين المستمر."
        percent={p?.percent} label="اكتمال ملفات المقررات المطروحة" />
      {data.programs.length > 1 && (
        <div className="flex gap-2">
          {data.programs.map((x) => (
            <button key={x.program} className={x.program === p?.program ? "btn-primary" : "btn-ghost"} onClick={() => setProgram(x.program)}>
              {PROGRAM_AR[x.program] ?? x.program}
            </button>
          ))}
        </div>
      )}
      {!p ? <Empty>لا توجد برامج ضمن صلاحياتك.</Empty> : <ProgramView p={p} reviewQueue={data.review_queue} openQuestions={openQuestions} questions={questions} />}
    </div>
  );
}

function ProgramView({ p, reviewQueue, openQuestions, questions }: { p: ProgramSummary; reviewQueue: number; openQuestions: number; questions: QuestionSummary[] | null }) {
  const me = useMe();
  const [showTable, setShowTable] = useState(false);
  const offered = useMemo(() => p.courses.filter((c) => c.teachers?.length), [p]);
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CheckCircle2} value={`${p.percent}%`} label="اكتمال الوثائق" tone={p.percent >= 90 ? "good" : "default"} />
        <StatCard icon={Sparkles} value={`${p.courses_complete} / ${p.courses_offered}`} label="مقررات مكتملة" />
        <StatCard icon={Clock} value={openQuestions} label="قرارات معلقة" tone={openQuestions ? "warn" : "good"} />
        <StatCard icon={FileWarning} value={p.missing_components} label="وثائق ناقصة" tone={p.missing_components ? "warn" : "good"} />
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

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-bold text-navy">حالة المقررات المطروحة — {PROGRAM_AR[p.program] ?? p.program}</h2>
          {offered.length === 0 ? <Empty>لم يختر الأساتذة مقرراتهم بعد.</Empty> : <CourseRows courses={offered} />}
          <p className="mt-3 text-xs text-ink-faint">{p.courses_unassigned} مقرر في الخطة غير مطروح هذا الفصل أو بدون أستاذ.</p>
        </section>
        <ActivityFeed />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DecisionsCard questions={questions} />
        <MissingCard courses={offered} />
      </div>

      <section className="card overflow-hidden">
        <button className="flex w-full items-center justify-between p-4 font-bold text-navy" onClick={() => setShowTable((v) => !v)}>
          جدول الاكتمال التفصيلي لكل مقررات الخطة ({p.courses_total})
          <span className="text-sm font-normal text-royal">{showTable ? "إخفاء" : "عرض"}</span>
        </button>
        {showTable && (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-canvas text-xs text-ink-soft">
                <tr>
                  <th className="p-3 text-right font-semibold">المقرر</th>
                  <th className="p-3 text-right font-semibold">المستوى</th>
                  <th className="p-3 font-semibold">توصيف</th><th className="p-3 font-semibold">نظري</th>
                  <th className="p-3 font-semibold">عملي</th><th className="p-3 font-semibold">تقييم</th>
                  <th className="p-3 font-semibold">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {p.courses.map((c) => (
                  <tr key={c.id} className={`hover:bg-canvas/60 ${c.teachers?.length ? "" : "opacity-50"}`}>
                    <td className="p-3">
                      <Link href={`/courses/${c.id}`} className="block hover:text-royal">
                        <span className="ltr block text-right text-xs text-ink-soft">{c.code}</span>
                        <span className="ltr block text-right font-medium">{c.title}</span>
                      </Link>
                    </td>
                    <td className="p-3 text-xs text-ink-soft">{levelLabel(c.level, c.group)}</td>
                    {(c.components ?? []).map((s) => <td key={s.component} className="p-3 text-center" title={s.note}><StatusPill status={s.status} compact /></td>)}
                    <td className="p-3 text-center font-semibold">{c.teachers?.length ? `${c.percent}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
