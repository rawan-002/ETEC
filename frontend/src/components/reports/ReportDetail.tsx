"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Download, FileText, GitCompare, Loader2, Paperclip } from "lucide-react";
import { DemoTag, HistoryList, Pill, RealTag } from "@/components/demo/DemoParts";
import { AttachmentChip, AttachmentPicker } from "@/components/support/TicketThread";
import { ErrorNote } from "@/components/ui";
import { downloadFile } from "@/lib/demo/store";
import { fmtDate } from "@/lib/labels";
import type { Finding, GapReport, ReportViewer } from "@/lib/reports";
import {
  buildFindings, canDeanDecide, canHeadReview, canRunReanalysis, reportHtml, reportService, SEVERITY_AR, SOURCE_AR, STATUS_AR,
} from "@/lib/reports";
import type { AttachmentMeta } from "@/lib/support/types";

const SEVERITY_CLS = { high: "bg-red-50 text-red-700", medium: "bg-amber-50 text-amber-700", low: "bg-slate-100 text-ink-soft" };

function FindingCard({ f, editable, onVerdict }: { f: Finding; editable: boolean; onVerdict: (v: Finding["verdict"], comment: string) => Promise<void> }) {
  const [disputing, setDisputing] = useState(false);
  const [comment, setComment] = useState(f.comment ?? "");
  const [err, setErr] = useState<string | null>(null);
  const run = async (v: Finding["verdict"]) => {
    setErr(null);
    try { await onVerdict(v, comment); setDisputing(false); } catch (e) { setErr(e instanceof Error ? e.message : "تعذّر الحفظ"); }
  };
  return (
    <li className={`rounded-2xl border p-4 ${f.verdict === "disputed" ? "border-red-200 bg-red-50/30" : f.verdict === "agreed" ? "border-leaf/30" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 font-semibold">{f.title}</span>
        <Pill label={`أولوية ${SEVERITY_AR[f.severity]}`} cls={SEVERITY_CLS[f.severity]} />
        {f.source === "demo" ? <DemoTag label={SOURCE_AR.demo} /> : <RealTag label={SOURCE_AR[f.source]} />}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{f.detail}</p>
      {f.evidence.length > 0 && (
        <ul className="mt-2 space-y-1">
          {f.evidence.map((e, i) => (
            <li key={i} className="rounded-xl border-s-4 border-royal bg-canvas px-3 py-2 text-sm">
              <div className="text-xs text-ink-faint">{e.source}</div><div dir="auto">«{e.quote}»</div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {f.link && <Link href={f.link} className="font-semibold text-royal hover:underline">فتح المصدر</Link>}
        <span className="text-ink-faint">
          {f.verdict === "agreed" ? "✓ وافق رئيس القسم" : f.verdict === "disputed" ? `✗ اعتراض: ${f.comment ?? ""}` : "لم تُراجع بعد"}
        </span>
      </div>
      {editable && !disputing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-ghost px-3 py-1.5" disabled={f.verdict === "agreed"} onClick={() => run("agreed")}>موافقة</button>
          <button className="btn-danger px-3 py-1.5" onClick={() => setDisputing(true)}>اعتراض</button>
          {f.verdict !== "pending" && <button className="px-2 text-xs text-ink-soft hover:underline" onClick={() => run("pending")}>إلغاء المراجعة</button>}
        </div>
      )}
      {editable && disputing && (
        <div className="mt-3 space-y-2">
          <textarea className="input min-h-16" maxLength={2000} placeholder="سبب الاعتراض (إلزامي)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-danger px-3 py-1.5" disabled={!comment.trim()} onClick={() => run("disputed")}>تسجيل الاعتراض</button>
            <button className="btn-ghost px-3 py-1.5" onClick={() => setDisputing(false)}>إلغاء</button>
          </div>
        </div>
      )}
      {err && <div className="mt-2"><ErrorNote message={err} /></div>}
    </li>
  );
}

export function ReportDetail({ r, viewer, onBack }: { r: GapReport; viewer: ReportViewer; onBack: () => void }) {
  const [note, setNote] = useState("");
  const [file, setFile] = useState<AttachmentMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headCan = canHeadReview(r, viewer);
  const counts = { agreed: 0, disputed: 0, pending: 0 };
  r.findings.forEach((f) => { counts[f.verdict] += 1; });

  const seen = r.seenBy[String(viewer.id)] ?? "";
  useEffect(() => { if (r.updatedAt > seen) reportService.markSeen(r.id, viewer); }, [r.id, r.updatedAt, seen, viewer]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); setMsg(done); setNote(""); setFile(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "تعذّر التنفيذ"); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-5">
      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button className="rounded-lg p-1 text-ink-soft hover:bg-canvas lg:hidden" onClick={onBack} aria-label="رجوع"><ArrowRight size={18} /></button>
          <Pill {...STATUS_AR[r.status]} />
          <DemoTag label="تقرير تجريبي" />
          <Link href={`/courses/${r.course.id}`} className="rounded-full bg-royal-50 px-2.5 py-1 font-semibold text-royal hover:underline">
            <span className="ltr">{r.course.code}</span> · <span className="ltr">{r.course.title}</span>
          </Link>
          <span className="text-ink-faint">قسم {r.program} · النسخة {r.versions.length}</span>
        </div>
        <h2 className="mt-3 text-xl font-bold text-navy">تقرير تحليل الفجوات #{r.number}</h2>
        <p className="muted mt-1">
          النتائج الموسومة «بيانات حقيقية» مأخوذة من المنصة (اكتمال الملف، فحص المستندات، مركز القرارات)، والموسومة «مثال تجريبي» توضيحية.
          المراجعة والاعتماد في هذا التقرير تجريبيان ومحفوظان على هذا الجهاز.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-canvas px-3 py-1">{r.findings.length} نتيجة</span>
          <span className="rounded-full bg-leaf-50 px-3 py-1 text-leaf">موافق {counts.agreed}</span>
          <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">معترض {counts.disputed}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-ink-soft">بانتظار المراجعة {counts.pending}</span>
          <button className="btn-ghost mr-auto px-3 py-1.5" onClick={() => downloadFile(`gap-report-${r.course.code}-v${r.versions.length}-prototype.html`, reportHtml(r))}>
            <Download size={15} />تحميل نسخة تجريبية
          </button>
        </div>
        {r.headSummary && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm"><b>ملخص رئيس القسم:</b> {r.headSummary}</p>}
        {r.deanNote && <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${r.status === "returned" ? "bg-red-50 text-red-800" : "bg-leaf-50 text-leaf"}`}><b>ملاحظة العميد:</b> {r.deanNote}</p>}
      </div>

      <div className="card p-6">
        <h3 className="flex items-center gap-2 font-bold text-navy"><FileText size={18} className="text-royal" />النتائج والأدلة</h3>
        <ul className="mt-4 space-y-3">
          {r.findings.map((f) => (
            <FindingCard key={f.key} f={f} editable={headCan} onVerdict={async (v, c) => { await reportService.reviewFinding(r.id, viewer, f.key, v, c); }} />
          ))}
        </ul>
      </div>

      {(r.extraEvidence.length > 0 || headCan) && (
        <div className="card space-y-3 p-6">
          <h3 className="flex items-center gap-2 font-bold text-navy"><Paperclip size={18} className="text-royal" />أدلة إضافية من المراجعة</h3>
          {r.extraEvidence.map((e, i) => (
            <div key={i} className="rounded-xl bg-canvas px-3 py-2 text-sm">
              {e.note && <div>{e.note}</div>}
              {e.file && <AttachmentChip a={e.file} />}
              <div className="text-xs text-ink-faint">{e.by} · {fmtDate(e.at)}</div>
            </div>
          ))}
        </div>
      )}

      {(headCan || canRunReanalysis(r, viewer) || canDeanDecide(r, viewer)) && (
        <div className="card space-y-3 p-6">
          <h3 className="font-bold text-navy">{canDeanDecide(r, viewer) ? "اعتماد العميد" : "مراجعة رئيس القسم"}</h3>
          {canRunReanalysis(r, viewer) ? (
            <>
              <p className="text-sm text-ink-soft">طُلبت إعادة التحليل. في النموذج الأولي تُعاد بناء النتائج من بيانات المقرر الحالية (محاكاة)، ولا يُستدعى التحليل الذكي.</p>
              <button className="btn-primary" disabled={busy} onClick={() => run(async () => reportService.completeReanalysis(r.id, viewer, await buildFindings(r.course.id)), "اكتملت إعادة التحليل (محاكاة) وأُنشئت نسخة جديدة")}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}تشغيل إعادة التحليل (محاكاة)
              </button>
            </>
          ) : (
            <>
              <textarea className="input min-h-20" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={canDeanDecide(r, viewer) ? "ملاحظة (إلزامية عند الإعادة للتعديل)" : "ملخص المراجعة، أو سبب طلب إعادة التحليل، أو وصف الدليل المضاف"} />
              {headCan && <AttachmentPicker value={file} onChange={setFile} onError={setErr} label="إرفاق دليل" />}
              <div className="flex flex-wrap gap-2">
                {headCan && <>
                  <button className="btn-primary" disabled={busy} onClick={() => run(() => reportService.submitToDean(r.id, viewer, note), "رُفع التقرير للعميد")}>اعتماد النتائج ورفعها للعميد</button>
                  <button className="btn-ghost" disabled={busy || (!file && !note.trim())} onClick={() => run(() => reportService.addEvidence(r.id, viewer, file, note), "أُضيف الدليل")}>إضافة الدليل</button>
                  <button className="btn-danger" disabled={busy || !note.trim()} onClick={() => run(() => reportService.requestReanalysis(r.id, viewer, note), "طُلبت إعادة التحليل")}>طلب إعادة التحليل</button>
                </>}
                {canDeanDecide(r, viewer) && <>
                  <button className="btn-primary" disabled={busy} onClick={() => run(() => reportService.deanApprove(r.id, viewer, note), "اعتُمد التقرير النهائي")}>اعتماد التقرير النهائي</button>
                  <button className="btn-danger" disabled={busy || !note.trim()} onClick={() => run(() => reportService.deanReturn(r.id, viewer, note), "أُعيد التقرير للتعديل")}>إعادة للتعديل</button>
                </>}
              </div>
            </>
          )}
          <ErrorNote message={err} />
          {msg && <div className="text-sm text-leaf">{msg}</div>}
        </div>
      )}

      <div className="card p-6">
        <h3 className="flex items-center gap-2 font-bold text-navy"><GitCompare size={18} className="text-royal" />التعديلات بناءً على المراجعة</h3>
        <ol className="mt-3 space-y-3">
          {[...r.versions].reverse().map((v) => (
            <li key={v.version} className="rounded-xl bg-canvas px-3 py-2 text-sm">
              <div className="font-semibold">النسخة {v.version} <span className="text-xs font-normal text-ink-faint">· {fmtDate(v.at)}</span></div>
              <ul className="mt-1 list-disc space-y-0.5 pr-5 text-ink-soft">{v.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </li>
          ))}
        </ol>
      </div>

      <HistoryList entries={r.history} title="سجل المراجعات والاعتمادات" />
    </section>
  );
}
