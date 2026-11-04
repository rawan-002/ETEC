"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, FileText, History, Scale, Undo2 } from "lucide-react";
import { ErrorNote } from "@/components/ui";
import { fmtDate } from "@/lib/labels";
import type { AttachmentMeta, FieldValue, MdViewer, MissingDataRequest } from "@/lib/missingData";
import {
  canAddNote, canEdit, canEscalate, canForward, canReview, MAX_TEXT, missingData, nextUp, reviewerRole, ROLE_AR, STATUS_AR,
  templateById, validate,
} from "@/lib/missingData";
import { DynamicForm } from "./DynamicForm";

export function MdStatusPill({ status }: { status: MissingDataRequest["status"] }) {
  const s = STATUS_AR[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export function SampleTag({ r }: { r: MissingDataRequest }) {
  if (r.source !== "demo") return null;
  return <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">مثال تجريبي</span>;
}

export function RequestDetail({ r, viewer, onBack }: { r: MissingDataRequest; viewer: MdViewer; onBack: () => void }) {
  const t = templateById(r.templateId);
  const editable = canEdit(r, viewer);
  const [values, setValues] = useState<Record<string, FieldValue>>(r.values);
  const [evidence, setEvidence] = useState<AttachmentMeta[]>(r.evidence);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const [fwdNote, setFwdNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Opening a request clears its update notice for this user.
  const seen = r.seenBy[String(viewer.id)] ?? "";
  useEffect(() => { if (r.updatedAt > seen) missingData.markSeen(r.id, viewer); }, [r.id, r.updatedAt, seen, viewer]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(done);
      setNote("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر التنفيذ");
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const found = validate(t, values);
    setErrors(found);
    if (Object.keys(found).length) {
      setErr(found._form ?? "أكمل الحقول المحددة بالأحمر قبل الإرسال");
      return;
    }
    run(() => missingData.submit(r.id, viewer, values, evidence), "أُرسلت البيانات للمراجعة");
  };

  const rr = reviewerRole(r);
  const reviewer = rr ? ROLE_AR[rr] : "لا يوجد — يُعتمد عند الإرسال";
  const up = nextUp(r);
  return (
    <section className="space-y-5">
      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button className="rounded-lg p-1 text-ink-soft hover:bg-canvas lg:hidden" onClick={onBack} aria-label="رجوع"><ArrowRight size={18} /></button>
          <MdStatusPill status={r.status} />
          <SampleTag r={r} />
          {r.escalated && <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700">مُصعّد للعميد</span>}
          <Link href={`/courses/${r.course.id}`} className="rounded-full bg-royal-50 px-2.5 py-1 font-semibold text-royal hover:underline">
            <span className="ltr">{r.course.code}</span> · <span className="ltr">{r.course.title}</span>
          </Link>
        </div>
        <h2 className="mt-3 text-xl font-bold text-navy">طلب #{r.number} — {r.issueTitle}</h2>
        <p className="mt-2 leading-7 text-ink-soft">{r.issueDetail}</p>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-canvas px-3 py-2">
            <dt className="text-xs text-ink-faint">المسؤول عن الاستكمال</dt>
            <dd className="font-semibold">{r.assignee.name} <span className="text-xs font-normal text-ink-soft">({ROLE_AR[r.assignee.role]})</span></dd>
          </div>
          <div className="rounded-xl bg-canvas px-3 py-2">
            <dt className="text-xs text-ink-faint">المراجِع</dt>
            <dd className="font-semibold">{reviewer}</dd>
          </div>
          <div className="rounded-xl bg-canvas px-3 py-2">
            <dt className="flex items-center gap-1 text-xs text-ink-faint"><FileText size={12} />المستند المرتبط</dt>
            <dd className="ltr truncate text-right">{r.document?.name ?? "—"}</dd>
          </div>
          <div className="rounded-xl bg-canvas px-3 py-2">
            <dt className="flex items-center gap-1 text-xs text-ink-faint"><Scale size={12} />المسألة الأصلية</dt>
            <dd>{r.questionId
              ? <Link href={`/decisions?q=${r.questionId}`} className="font-semibold text-royal hover:underline">فتحها في مركز القرارات</Link>
              : <span className="text-ink-faint">غير مرتبط بمسألة حقيقية</span>}</dd>
          </div>
          {r.dueDate && (
            <div className="rounded-xl bg-canvas px-3 py-2 sm:col-span-2">
              <dt className="flex items-center gap-1 text-xs text-ink-faint"><CalendarClock size={12} />الموعد المطلوب</dt>
              <dd className="ltr text-right">{r.dueDate}</dd>
            </div>
          )}
        </dl>
        {r.status === "needs_revision" && r.reviewNote && (
          <div className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <Undo2 size={16} className="mt-0.5 shrink-0" /><div><span className="font-semibold">أُعيد للاستكمال: </span>{r.reviewNote}</div>
          </div>
        )}
        {r.status === "completed" && (
          <div className="mt-4 flex gap-2 rounded-xl bg-leaf-50 px-3 py-2 text-sm text-leaf">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />اكتمل الطلب وقُبلت البيانات{r.reviewNote ? `: ${r.reviewNote}` : "."}
          </div>
        )}
      </div>

      <div className="card p-6">
        <h3 className="flex items-center gap-2 font-bold text-navy"><ClipboardList size={18} className="text-royal" />{t.title}</h3>
        <p className="muted mt-1">
          {editable ? "الحقول المعلّمة بـ * إلزامية. احفظ مسودة في أي وقت، وأرسل عند الاكتمال."
            : r.status === "new" ? `بانتظار ${r.assignee.name} لبدء الاستكمال.` : "البيانات المدخلة (للاطلاع)."}
        </p>
        <div className="mt-4">
          <DynamicForm template={t} values={editable ? values : r.values} evidence={editable ? evidence : r.evidence} errors={errors}
            readOnly={!editable} onValues={(v) => { setValues(v); setErrors({}); }} onEvidence={setEvidence} onFileError={setErr} />
        </div>
        <div className="mt-4 space-y-2">
          <ErrorNote message={err} />
          {msg && <div className="text-sm text-leaf">{msg}</div>}
        </div>
        {editable && !forwarding && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy} onClick={submit}>{rr ? "إرسال للمراجعة" : "اعتماد البيانات"}</button>
            <button className="btn-ghost" disabled={busy} onClick={() => run(() => missingData.saveDraft(r.id, viewer, values, evidence), "حُفظت المسودة")}>حفظ كمسودة</button>
            {canForward(r, viewer) && up && (
              <button className="btn-danger" disabled={busy} onClick={() => setForwarding(true)}>تحويل لمسؤول أعلى</button>
            )}
          </div>
        )}
        {editable && forwarding && up && (
          <div className="mt-4 space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-4">
            <div className="text-sm font-semibold text-red-800">
              تحويل الطلب إلى {up.name}{up.role === "coordinator" ? ` (${ROLE_AR.coordinator})` : ""}
            </div>
            <p className="text-xs text-ink-soft">يُحفظ ما أدخلته، وتنتقل مسؤولية الاستكمال إلى المستوى الأعلى، وتبقى قادرًا على متابعة الطلب.</p>
            <input className="input" maxLength={MAX_TEXT} placeholder="سبب التحويل (اختياري)" value={fwdNote} onChange={(e) => setFwdNote(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-danger" disabled={busy} onClick={() => run(async () => {
                await missingData.saveDraft(r.id, viewer, values, evidence);
                await missingData.forward(r.id, viewer, fwdNote);
                setForwarding(false);
                setFwdNote("");
              }, "حُوّل الطلب للمستوى الأعلى")}>تأكيد التحويل</button>
              <button className="btn-ghost" onClick={() => setForwarding(false)}>إلغاء</button>
            </div>
          </div>
        )}
      </div>

      {(canReview(r, viewer) || canAddNote(viewer)) && (
        <div className="card space-y-3 p-6">
          <h3 className="font-bold text-navy">{canReview(r, viewer) ? "مراجعة البيانات" : "ملاحظة فنية من فريق المشروع"}</h3>
          <textarea className="input min-h-20" maxLength={MAX_TEXT} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={canReview(r, viewer) ? "ملاحظة (إلزامية عند الإعادة للاستكمال)" : "مشكلة تقنية أو حالة استثنائية…"} />
          <div className="flex flex-wrap gap-2">
            {canReview(r, viewer) && <>
              <button className="btn-primary" disabled={busy} onClick={() => run(() => missingData.accept(r.id, viewer, note), "قُبلت البيانات واكتمل الطلب")}>قبول البيانات</button>
              <button className="btn-danger" disabled={busy || !note.trim()} onClick={() => run(() => missingData.sendBack(r.id, viewer, note), "أُعيد الطلب للاستكمال")}>إعادة للاستكمال</button>
              {canEscalate(r, viewer) && <button className="btn-ghost" disabled={busy} onClick={() => run(() => missingData.escalate(r.id, viewer, note), "صُعّد الطلب للعميد")}>تصعيد للعميد</button>}
            </>}
            {!canReview(r, viewer) && canAddNote(viewer) && (
              <button className="btn-ghost" disabled={busy || !note.trim()} onClick={() => run(() => missingData.addNote(r.id, viewer, note), "أُضيفت الملاحظة")}>إضافة الملاحظة</button>
            )}
          </div>
        </div>
      )}

      <div className="card p-6">
        <h3 className="flex items-center gap-2 font-bold text-navy"><History size={18} className="text-sky" />سجل الإجراءات</h3>
        <ol className="mt-3 space-y-3">
          {[...r.history].reverse().map((h) => (
            <li key={h.id} className="border-s-2 border-royal ps-3 text-sm">
              <div><span className="font-semibold">{h.actorName}</span> — {h.action}</div>
              {h.note && <div className="mt-0.5 text-ink-soft">«{h.note}»</div>}
              <div className="text-xs text-ink-faint">{fmtDate(h.at)}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
