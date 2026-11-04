"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Download, Eye, Scale } from "lucide-react";
import { DiffView } from "@/components/docEdits/DiffView";
import { DemoBanner, DemoTag, FilterTabs, HistoryList, Pill, RealTag } from "@/components/demo/DemoParts";
import { useMe } from "@/components/Shell";
import { Empty, ErrorNote, Spinner } from "@/components/ui";
import { useApi } from "@/lib/api";
import { downloadFile } from "@/lib/demo/store";
import type { EditProposal, EditStatus, EditViewer } from "@/lib/docEdits";
import {
  canReviewEdit, canReviseEdit, docEditService, EDIT_STATUS_AR, editHasUpdate, editNeedsMe, latest, proposalHtml, sampleProposal, useDocEdits,
} from "@/lib/docEdits";
import { fmtDate } from "@/lib/labels";
import type { Course, QuestionSummary } from "@/lib/types";

type Filter = "all" | "mine" | EditStatus;

export default function DocumentEditsPage() {
  return <Suspense fallback={<Spinner />}><DocumentEdits /></Suspense>;
}

function DocumentEdits() {
  const me = useMe();
  const params = useSearchParams();
  const { proposals, viewer } = useDocEdits(me);
  const { data: courses } = useApi<Course[]>(me.role === "faculty" ? "/api/me/courses" : `/api/courses?program=${me.program ?? "CS"}`);
  const { data: questions } = useApi<QuestionSummary[]>("/api/questions");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(params.get("p"));
  const offered = useMemo(() => (courses ?? []).filter((c) => c.teachers?.length), [courses]);

  // One illustrative proposal per offered course (up to two), referencing real approved decisions when present.
  useEffect(() => {
    if (offered.length && questions) docEditService.seed(offered.slice(0, 2).map((c) => sampleProposal(c, questions)));
  }, [offered, questions]);

  if (!proposals || !viewer) return <Spinner />;
  const shown = proposals.filter((p) => filter === "all" ? true : filter === "mine" ? editNeedsMe(p, viewer) : p.status === filter);
  const count = (f: Filter) => proposals.filter((p) => f === "all" ? true : f === "mine" ? editNeedsMe(p, viewer) : p.status === f).length;
  const current = proposals.find((p) => p.id === selected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">اقتراحات تعديل المستندات</h1>
        <p className="muted mt-1">تعديلات مقترحة على مستندات المقررات بناءً على القرارات المعتمدة، يراجعها منسق المقرر أو رئيس القسم.</p>
      </div>
      <DemoBanner>
        نموذج أولي: النصوص مقتطفات توضيحية ولا يُقرأ محتوى الملف الحقيقي. لا يُعدَّل أي مستند ولا يُستبدل تلقائيًا؛ الاعتماد والتحميل تجريبيان ومحفوظان على هذا الجهاز.
        {viewer.role === "team" && <button className="ms-2 font-semibold underline" onClick={() => { docEditService.reset(); setSelected(null); }}>إعادة تعيين البيانات التجريبية</button>}
      </DemoBanner>
      {proposals.length === 0 ? <Empty>لا توجد اقتراحات بعد. تظهر بعد أن يختار الأساتذة مقرراتهم لهذا الفصل.</Empty> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className={`space-y-3 ${current ? "hidden lg:block" : ""}`}>
            <FilterTabs value={filter} onChange={setFilter} tabs={[
              ["all", "الكل", count("all")], ["mine", "بانتظاري", count("mine")],
              ...(Object.keys(EDIT_STATUS_AR) as EditStatus[]).map((s): [Filter, string, number] => [s, EDIT_STATUS_AR[s].label, count(s)]),
            ]} />
            {shown.length === 0 && <Empty>لا توجد اقتراحات هنا.</Empty>}
            {shown.map((p) => (
              <button key={p.id} onClick={() => setSelected(p.id)}
                className={`block w-full rounded-2xl border bg-white p-4 text-right shadow-card transition ${selected === p.id ? "border-royal ring-2 ring-royal/15" : "border-line hover:border-royal/40"}`}>
                <div className="flex items-start gap-2">
                  {editHasUpdate(p, viewer) && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-600" aria-label="تحديث جديد" />}
                  <span className="flex-1 font-semibold leading-6">#{p.number} · {p.documentName}</span>
                  <Pill {...EDIT_STATUS_AR[p.status]} />
                </div>
                <div className="mt-1 text-xs text-ink-soft">{latest(p).changes.length} تعديلات · النسخة {latest(p).version}{editNeedsMe(p, viewer) && " · بانتظار إجرائك"}</div>
                <div className="mt-1 text-[11px] text-ink-faint">آخر تحديث {fmtDate(p.updatedAt)}</div>
              </button>
            ))}
          </section>
          {current ? <ProposalView key={current.id} p={current} viewer={viewer} onBack={() => setSelected(null)} />
            : <div className="hidden lg:block"><Empty>اختر اقتراحًا لعرضه.</Empty></div>}
        </div>
      )}
    </div>
  );
}

function ProposalView({ p, viewer, onBack }: { p: EditProposal; viewer: EditViewer; onBack: () => void }) {
  const [versionNo, setVersionNo] = useState(latest(p).version);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState(latest(p).proposed);
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const v = p.versions.find((x) => x.version === versionNo) ?? latest(p);
  const seen = p.seenBy[String(viewer.id)] ?? "";
  useEffect(() => { if (p.updatedAt > seen) docEditService.markSeen(p.id, viewer); }, [p.id, p.updatedAt, seen, viewer]);
  useEffect(() => { setVersionNo(latest(p).version); setDraft(latest(p).proposed); }, [p.versions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setErr(null); setMsg(null);
    try { await fn(); setMsg(done); setNote(""); } catch (e) { setErr(e instanceof Error ? e.message : "تعذّر التنفيذ"); }
  };

  return (
    <section className="space-y-5">
      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button className="rounded-lg p-1 text-ink-soft hover:bg-canvas lg:hidden" onClick={onBack} aria-label="رجوع"><ArrowRight size={18} /></button>
          <Pill {...EDIT_STATUS_AR[p.status]} />
          <DemoTag label="مقتطف تجريبي" />
          <Link href={`/courses/${p.course.id}`} className="rounded-full bg-royal-50 px-2.5 py-1 font-semibold text-royal hover:underline">
            <span className="ltr">{p.course.code}</span> · <span className="ltr">{p.course.title}</span>
          </Link>
        </div>
        <h2 className="mt-3 text-xl font-bold text-navy">#{p.number} — {p.documentName}</h2>
        {p.reviewNote && p.status !== "pending_review" && (
          <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${p.status === "approved" ? "bg-leaf-50 text-leaf" : "bg-red-50 text-red-800"}`}>ملاحظة المراجع: {p.reviewNote}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="text-sm text-ink-soft" htmlFor="ver">النسخة:</label>
          <select id="ver" className="input w-auto py-1" value={versionNo} onChange={(e) => setVersionNo(Number(e.target.value))}>
            {p.versions.map((x) => <option key={x.version} value={x.version}>النسخة {x.version} — {fmtDate(x.at)}</option>)}
          </select>
          {p.status === "approved" && <>
            <button className="btn-ghost mr-auto px-3 py-1.5" onClick={() => setPreview((x) => !x)}><Eye size={15} />{preview ? "إخفاء المعاينة" : "معاينة النسخة المعتمدة"}</button>
            <button className="btn-ghost px-3 py-1.5" onClick={() => downloadFile(`${p.course.code}-spec-v${latest(p).version}-prototype.html`, proposalHtml(p))}><Download size={15} />تحميل نسخة تجريبية</button>
          </>}
        </div>
        {preview && <pre className="ltr mt-3 whitespace-pre-wrap rounded-xl bg-canvas p-3 text-left text-[13px]" dir="ltr">{latest(p).proposed}</pre>}
        <div className="mt-4"><DiffView original={p.original} proposed={v.proposed} /></div>
        {v.note && <p className="mt-2 text-xs text-ink-soft">أُعدّت هذه النسخة استجابةً لـ: «{v.note}» — {v.by}</p>}
      </div>

      <div className="card p-6">
        <h3 className="flex items-center gap-2 font-bold text-navy"><Scale size={18} className="text-royal" />التعديلات وأسبابها</h3>
        <ul className="mt-3 space-y-3">
          {v.changes.map((c) => (
            <li key={c.id} className="rounded-xl bg-canvas p-3 text-sm">
              <div className="ltr text-left text-[13px]" dir="ltr"><del className="bg-red-100 text-red-800">{c.before}</del> → <ins className="bg-leaf-50 text-leaf no-underline">{c.after}</ins></div>
              <div className="mt-1.5">{c.reason}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                القرار المستند إليه: {c.decision.questionId ? <Link href={`/decisions?q=${c.decision.questionId}`} className="font-semibold text-royal hover:underline">{c.decision.text}</Link> : c.decision.text}
                {c.decision.real ? <RealTag label="قرار معتمد في مركز القرارات" /> : <DemoTag label="مثال" />}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {(canReviewEdit(p, viewer) || canReviseEdit(p, viewer)) && (
        <div className="card space-y-3 p-6">
          {canReviewEdit(p, viewer) ? <>
            <h3 className="font-bold text-navy">قرار المراجعة</h3>
            <textarea className="input min-h-20" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (إلزامية عند الرفض أو طلب التعديل)" />
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => run(() => docEditService.approve(p.id, viewer, note), "اعتُمد الاقتراح (تجريبيًا)")}>قبول التعديل</button>
              <button className="btn-ghost" disabled={!note.trim()} onClick={() => run(() => docEditService.requestChanges(p.id, viewer, note), "طُلب تعديل الاقتراح")}>طلب تعديل</button>
              <button className="btn-danger" disabled={!note.trim()} onClick={() => run(() => docEditService.reject(p.id, viewer, note), "رُفض الاقتراح")}>رفض</button>
            </div>
          </> : <>
            <h3 className="font-bold text-navy">إعداد نسخة معدّلة</h3>
            <p className="text-sm text-ink-soft">المطلوب: «{p.reviewNote}». عدّل النص يدويًا ثم احفظه كنسخة جديدة للمراجعة.</p>
            <textarea className="input ltr min-h-40 text-left font-mono text-[13px]" dir="ltr" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="btn-primary" onClick={() => run(() => docEditService.revise(p.id, viewer, draft), "حُفظت نسخة جديدة وأُعيدت للمراجعة")}>حفظ كنسخة جديدة</button>
          </>}
          <ErrorNote message={err} />
          {msg && <div className="text-sm text-leaf">{msg}</div>}
        </div>
      )}

      <HistoryList entries={p.history} title="سجل النسخ والتعديلات" />
    </section>
  );
}
