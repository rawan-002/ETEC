"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileWarning, History, Layers, RefreshCcw, ShieldCheck, UserRoundSearch } from "lucide-react";
import { DemoBanner, DemoTag, FilterTabs, RealTag } from "@/components/demo/DemoParts";
import { useMe } from "@/components/Shell";
import { ErrorNote } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { checkDocuments, courseTools, type CheckLevel, type DocCheck, type ReanalysisRun, type ReviewRequest } from "@/lib/courseTools/service";
import { useDocEdits } from "@/lib/docEdits";
import { fmtDate, fmtSize } from "@/lib/labels";
import { useReports } from "@/lib/reports";
import { actorFrom, support } from "@/lib/support";
import type { ComponentKey, CourseDetail, Doc, QuestionDetail, QuestionSummary } from "@/lib/types";

const LEVEL: Record<CheckLevel, { cls: string; icon: typeof CheckCircle2 }> = {
  ok: { cls: "text-leaf", icon: CheckCircle2 },
  warn: { cls: "text-amber-700", icon: AlertTriangle },
  error: { cls: "text-red-700", icon: FileWarning },
  human: { cls: "text-royal", icon: UserRoundSearch },
};

interface AnalysisState { enabled: boolean; run: { status: string; finished_at: string | null } | null; questions: QuestionSummary[] }
interface Event { id: number; at: string; kind: string; message: string; actor: string }

function useCourseTools() {
  const [data, setData] = useState(() => (typeof window === "undefined" ? { version: 1 as const, reviews: [], runs: [] } : courseTools.load()));
  useEffect(() => { setData(courseTools.load()); return courseTools.subscribe(() => setData(courseTools.load())); }, []);
  return data;
}

/** Verification results and version/re-analysis tools for one course, below the existing analysis panel. */
export function CourseQualityTools({ c }: { c: CourseDetail }) {
  const [tab, setTab] = useState<"verify" | "versions">("verify");
  const { data: analysis } = useApi<AnalysisState>(`/api/courses/${c.id}/analysis`, 15000);
  const checks = useMemo(() => checkDocuments(c), [c]);
  // Uploads after the last finished analysis may have changed what the analysis and its decisions relied on.
  const lastAnalysis = analysis?.run?.finished_at ?? null;
  const changedSince = lastAnalysis ? c.documents.filter((d) => d.status === "classified" && d.uploaded_at > lastAnalysis) : [];
  const needsRecheck = !!lastAnalysis && changedSince.length > 0;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck size={18} className="text-royal" />
        <h2 className="font-bold text-navy">التحقق من المستندات والنسخ</h2>
        {needsRecheck && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">يحتاج إعادة تحقق</span>}
        <div className="ms-auto"><FilterTabs value={tab} onChange={setTab} tabs={[["verify", "نتائج التحقق"], ["versions", "النسخ وإعادة التحليل"]]} /></div>
      </div>
      {needsRecheck && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          رُفعت {changedSince.length} ملفات بعد آخر تحليل ({fmtDate(lastAnalysis!)})، فقد لا تعكس نتائج التحليل والقرارات المرتبطة به النسخ الحالية.
        </p>
      )}
      <div className="mt-4">
        {tab === "verify" ? <Verification c={c} checks={checks} /> : <Versions c={c} analysis={analysis ?? null} changedSince={changedSince} />}
      </div>
    </section>
  );
}

function Verification({ c, checks }: { c: CourseDetail; checks: DocCheck[] }) {
  const me = useMe();
  const tools = useCourseTools();
  const { data: events } = useApi<Event[]>("/api/activity?kind=classify", 30000);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const missing = (c.components ?? []).filter((s) => s.status === "missing");
  const problems = checks.filter((x) => x.level !== "ok");
  const names = new Set(c.documents.map((d) => d.filename));
  const log = (events ?? []).filter((e) => [...names].some((n) => e.message.includes(n)));
  const reviews = tools.reviews.filter((r: ReviewRequest) => r.courseId === c.id);

  const requestReview = async (x: DocCheck) => {
    setErr(null); setMsg(null);
    try {
      courseTools.requestReview(c.id, x.doc, me.name, x.reason);
      // Reuses the technical-support flow so the project team sees the request in its queue (prototype).
      await support.create(actorFrom(me), { category: "upload", body: `طلب مراجعة الملف «${x.doc.filename}» في مقرر ${c.code}: ${x.label} — ${x.reason}`, attachment: null });
      setMsg("أُرسل طلب المراجعة لفريق المشروع (تجريبي — عبر الدعم الفني)");
    } catch (e) { setErr(e instanceof Error ? e.message : "تعذّر الإرسال"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-canvas px-3 py-1"><span className="ltr">{c.code}</span> — <span className="ltr">{c.title}</span></span>
        <span className="rounded-full bg-leaf-50 px-3 py-1 text-leaf">مطابق {checks.length - problems.length}</span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">تحذيرات {problems.filter((x) => x.level === "warn").length}</span>
        <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">أخطاء {problems.filter((x) => x.level === "error").length}</span>
        <span className="rounded-full bg-royal-50 px-3 py-1 text-royal">تدخل بشري {problems.filter((x) => x.level === "human").length}</span>
        <RealTag label="من معالجة الملفات في الخادم" />
      </div>
      <p className="text-xs text-ink-soft">
        النتائج مأخوذة مما سجّله الخادم عند معالجة كل ملف: النوع الحقيقي، والتلف، والتكرار، والتصنيف ودرجة الثقة، ورمز المقرر في التوصيف.
        «نسخة أقدم» تعني وجود نسخة أحدث للمكوّن نفسه. لا يتحقق النموذج الأولي من محتوى إضافي غير ذلك.
      </p>

      {(missing.length > 0 || c.findings.length > 0) && (
        <div className="space-y-2">
          {missing.map((s) => (
            <div key={s.component} className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><FileWarning size={15} />مستند ناقص: {s.label}</div>
          ))}
          {c.findings.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800"><AlertTriangle size={15} />{f.message}</div>
          ))}
        </div>
      )}

      <ul className="divide-y divide-line rounded-2xl border border-line">
        {checks.length === 0 && <li className="p-4 text-sm text-ink-soft">لم تُرفع ملفات بعد.</li>}
        {checks.map((x) => {
          const L = LEVEL[x.level];
          const requested = reviews.some((r: ReviewRequest) => r.docId === x.doc.id);
          return (
            <li key={x.doc.id} className="flex flex-wrap items-start gap-3 p-3 text-sm">
              <L.icon size={16} className={`mt-1 shrink-0 ${L.cls}`} />
              <div className="min-w-0 flex-1">
                <a href={`/api/documents/${x.doc.id}/download`} className="ltr block truncate text-right font-medium hover:text-royal">{x.doc.filename}</a>
                <div className="text-xs text-ink-faint">{x.doc.component_label} · {x.doc.uploader} · {fmtDate(x.doc.uploaded_at)}</div>
                <div className={`mt-0.5 text-xs ${L.cls}`}>{x.label}{x.reason && ` — ${x.reason}`}</div>
              </div>
              {x.level !== "ok" && x.level !== "human" && x.doc.status !== "duplicate" && c.can_upload && (
                <span className="text-xs text-ink-soft">استبدله من بطاقة المكوّن أعلاه («رفع نسخة جديدة»)</span>
              )}
              {x.level !== "ok" && (requested ? <span className="text-xs text-royal">طُلبت المراجعة</span> : (
                <button className="btn-ghost px-3 py-1 text-xs" onClick={() => requestReview(x)}>طلب مراجعة</button>
              ))}
            </li>
          );
        })}
      </ul>
      <ErrorNote message={err} />
      {msg && <div className="text-sm text-leaf">{msg}</div>}

      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-navy"><History size={16} className="text-sky" />سجل نتائج التحقق</h3>
        <ul className="mt-2 space-y-1.5 text-xs">
          {reviews.map((r: ReviewRequest) => (
            <li key={r.id} className="flex flex-wrap gap-2"><DemoTag label="طلب مراجعة" />{r.by} طلب مراجعة «{r.filename}» · {fmtDate(r.at)}</li>
          ))}
          {log.slice(0, 15).map((e) => <li key={e.id} className="flex flex-wrap gap-2"><RealTag label="الخادم" />{e.message} · {fmtDate(e.at)}</li>)}
          {!reviews.length && !log.length && <li className="text-ink-faint">لا توجد نتائج مسجلة بعد.</li>}
        </ul>
      </div>
    </div>
  );
}

function Versions({ c, analysis, changedSince }: { c: CourseDetail; analysis: AnalysisState | null; changedSince: Doc[] }) {
  const me = useMe();
  const tools = useCourseTools();
  const { reports } = useReports(me);
  const { proposals } = useDocEdits(me);
  const [parts, setParts] = useState<ComponentKey[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const runs = tools.runs.filter((r: ReanalysisRun) => r.courseId === c.id).reverse();
  const active = runs.find((r: ReanalysisRun) => !r.finishedAt);
  const affectedReports = (reports ?? []).filter((r) => r.course.id === c.id && r.status !== "approved");
  const affectedEdits = (proposals ?? []).filter((p) => p.course.id === c.id && p.status !== "rejected");
  const changedParts = [...new Set(changedSince.map((d) => d.component).filter(Boolean))] as ComponentKey[];

  useEffect(() => { setParts(changedParts); }, [changedParts.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const byComponent = (c.components ?? []).map((s) => ({
    s, docs: c.documents.filter((d) => d.component === s.component).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
  }));

  // Simulated run: shows progress, then lists the course's decisions that cite a replaced or newer file.
  const start = async () => {
    setErr(null);
    let run: ReanalysisRun;
    try { run = courseTools.startRun(c.id, parts, me.name); } catch (e) { setErr(e instanceof Error ? e.message : "تعذّر البدء"); return; }
    setProgress(0);
    // A decision needs re-checking when its evidence quotes a document of one of the selected parts.
    const recheck: ReanalysisRun["decisionsToRecheck"] = [];
    const componentOf = new Map(c.documents.map((d) => [d.id, d.component]));
    for (const q of analysis?.questions ?? []) {
      const full = await api<QuestionDetail>(`/api/questions/${q.id}`).catch(() => null);
      const cites = full?.evidence.some((e) => e.document_id != null && parts.includes(componentOf.get(e.document_id) as ComponentKey)) ?? false;
      if (cites) recheck.push({ id: q.id, title: q.title });
    }
    let p = 0;
    timer.current = setInterval(() => {
      p += 20;
      setProgress(p);
      if (p >= 100) { if (timer.current) clearInterval(timer.current); courseTools.finishRun(run.id, recheck); }
    }, 500);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-navy"><Layers size={16} className="text-royal" />النسخ السابقة والحالية <RealTag label="من الخادم" /></h3>
        {byComponent.map(({ s, docs }) => (
          <div key={s.component} className="rounded-xl border border-line p-3">
            <div className="text-sm font-semibold">{s.label} <span className="text-xs font-normal text-ink-faint">({docs.length} ملفات)</span></div>
            {docs.length === 0 ? <div className="mt-1 text-xs text-ink-faint">لا توجد نسخ.</div> : (
              <ol className="mt-2 space-y-1.5">
                {docs.map((d, i) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${i === 0 && d.status === "classified" ? "bg-leaf-50 text-leaf" : "bg-canvas text-ink-soft"}`}>
                      {i === 0 && d.status === "classified" ? "الحالية" : d.status === "duplicate" ? "مكررة" : "سابقة"}
                    </span>
                    <a href={`/api/documents/${d.id}/download`} className="ltr max-w-[16rem] truncate font-medium hover:text-royal">{d.filename}</a>
                    <span className="text-ink-faint">{d.uploader} · {fmtDate(d.uploaded_at)} · {fmtSize(d.size)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
        <p className="text-xs text-ink-faint">لا تُحذف أي نسخة: الاستبدال يرفع نسخة جديدة ويبقي السابقة محفوظة. للاستبدال استخدم «رفع نسخة جديدة» في بطاقة المكوّن.</p>
      </div>

      <div className="rounded-xl bg-canvas p-3 text-sm">
        <div className="font-semibold text-navy">ما قد يتأثر بالاستبدال</div>
        <ul className="mt-1.5 list-disc space-y-1 pr-5 text-ink-soft">
          <li>آخر تحليل للمقرر: {analysis?.run?.finished_at ? `${fmtDate(analysis.run.finished_at)}${changedSince.length ? ` — رُفعت بعده ${changedSince.length} ملفات` : " — لا ملفات أحدث منه"}` : "لم يُحلَّل بعد"} <RealTag label="حقيقي" /></li>
          <li>مسائل مركز القرارات على المقرر: {analysis?.questions.length ?? 0} <RealTag label="حقيقي" /></li>
          <li>تقارير فجوات غير معتمدة: {affectedReports.length} {affectedReports[0] && <Link href={`/reports?r=${affectedReports[0].id}`} className="text-royal hover:underline">فتح</Link>} <DemoTag /></li>
          <li>اقتراحات تعديل المستندات: {affectedEdits.length} {affectedEdits[0] && <Link href={`/document-edits?p=${affectedEdits[0].id}`} className="text-royal hover:underline">فتح</Link>} <DemoTag /></li>
        </ul>
      </div>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-navy"><RefreshCcw size={16} className="text-royal" />إعادة تحليل الأجزاء المتأثرة <DemoTag label="محاكاة" /></h3>
        <DemoBanner>
          الخادم الحالي يعيد تحليل المقرر كاملًا فقط (زر «إعادة التحليل» في لوحة التحليل الذكي، عند تفعيله)، ولا يدعم تحليل أجزاء محددة.
          هذه الواجهة توضح التجربة المقترحة، ولا تستدعي التحليل الذكي ولا تغيّر أي نتيجة.
        </DemoBanner>
        <div className="flex flex-wrap gap-2">
          {(c.components ?? []).filter((s) => s.status !== "na").map((s) => (
            <label key={s.component} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${parts.includes(s.component) ? "border-royal bg-royal-50/60" : "border-line"}`}>
              <input type="checkbox" className="accent-royal" checked={parts.includes(s.component)}
                onChange={(e) => setParts(e.target.checked ? [...parts, s.component] : parts.filter((x) => x !== s.component))} />
              {s.label}{changedParts.includes(s.component) && <span className="text-[10px] text-red-700">تغيّر</span>}
            </label>
          ))}
        </div>
        <button className="btn-primary" disabled={!!active || !parts.length} onClick={start}>بدء إعادة التحليل (محاكاة)</button>
        {active && (
          <div className="space-y-1">
            <div className="text-xs text-ink-soft">جارٍ إعادة تحليل: {active.parts.length} أجزاء…</div>
            <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-royal transition-all" style={{ width: `${progress}%` }} /></div>
          </div>
        )}
        <ErrorNote message={err} />
        {runs.filter((r: ReanalysisRun) => r.finishedAt).slice(0, 3).map((r: ReanalysisRun) => (
          <div key={r.id} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><DemoTag label="نتيجة توضيحية" /><span className="font-semibold">اكتملت (محاكاة)</span><span className="text-xs text-ink-faint">{r.by} · {fmtDate(r.finishedAt!)}</span></div>
            <p className="mt-1 text-ink-soft">الأجزاء: {r.parts.map((p) => (c.components ?? []).find((s) => s.component === p)?.label ?? p).join("، ")}. في النظام الفعلي ستُقارن النسخ الجديدة بالتوصيف وتُحدَّث المسائل المتأثرة فقط.</p>
            {r.decisionsToRecheck.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-semibold text-red-700">قرارات تحتاج إعادة تحقق:</div>
                <ul className="mt-1 space-y-1">
                  {r.decisionsToRecheck.map((d) => <li key={d.id}><Link href={`/decisions?q=${d.id}`} className="text-xs text-royal hover:underline">{d.title}</Link></li>)}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
