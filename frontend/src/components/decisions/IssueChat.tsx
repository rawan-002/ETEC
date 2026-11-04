"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, Info, MessageSquareOff, PlusCircle, ShieldCheck } from "lucide-react";
import { DemoTag } from "@/components/demo/DemoParts";
import { useMe } from "@/components/Shell";
import { AttachmentChip, AttachmentPicker } from "@/components/support/TicketThread";
import { ErrorNote } from "@/components/ui";
import { api } from "@/lib/api";
import { cleanText, createDemoStore, iso, uid } from "@/lib/demo/store";
import { fmtDate } from "@/lib/labels";
import type { AttachmentMeta } from "@/lib/support/types";
import type { QuestionDetail } from "@/lib/types";

/** Information a user adds to an issue. Kept on this device; the backend has no place for it yet. */
interface AddedInfo { id: string; questionId: number; by: string; text: string; file: AttachmentMeta | null; at: string; sentToAssistant: boolean }
const store = createDemoStore<{ version: 1; items: AddedInfo[] }>("aq.issue-info.demo.v1", () => ({ version: 1, items: [] }));

/** Context, added information and the explicit approval step around the existing assistant (passed as children). */
export function IssueChat({ q, onAsked, children }: { q: QuestionDetail; onAsked: () => Promise<void>; children: React.ReactNode }) {
  const me = useMe();
  const [items, setItems] = useState<AddedInfo[]>([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<AttachmentMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const docs = [...new Map(q.evidence.filter((e) => e.document_id && e.filename).map((e) => [e.document_id, e])).values()];
  const chatHistory = q.messages.filter((m) => m.role !== "event");

  useEffect(() => {
    const load = () => setItems(store.load().items.filter((i) => i.questionId === q.id));
    load();
    return store.subscribe(load);
  }, [q.id]);

  const add = async () => {
    setErr(null);
    setBusy(true);
    try {
      const clean = cleanText(text, { required: true, max: 1000, what: "المعلومة" })!;
      let sent = false;
      // Only the typed text reaches the assistant (as a normal question); attached files are never sent.
      if (q.assistant_enabled) {
        await api(`/api/questions/${q.id}/ask`, { method: "POST", json: { message: `معلومة إضافية أقدّمها حول هذه المسألة: ${clean}` } });
        sent = true;
        await onAsked();
      }
      const data = store.load();
      data.items.push({ id: uid(), questionId: q.id, by: me.name, text: clean, file: file && { name: file.name, size: file.size, type: file.type }, at: iso(), sentToAssistant: sent });
      store.save(data);
      setText("");
      setFile(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الإضافة");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <h3 className="flex items-center gap-2 font-bold text-navy"><Info size={18} className="text-royal" />سياق المحادثة</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-canvas px-3 py-2"><dt className="text-xs text-ink-faint">المسألة</dt><dd className="font-semibold">{q.title}</dd></div>
          <div className="rounded-xl bg-canvas px-3 py-2"><dt className="text-xs text-ink-faint">المقرر</dt>
            <dd><Link href={`/courses/${q.course.id}`} className="font-semibold text-royal hover:underline"><span className="ltr">{q.course.code}</span> · <span className="ltr">{q.course.title}</span></Link></dd></div>
          <div className="rounded-xl bg-canvas px-3 py-2 sm:col-span-2"><dt className="flex items-center gap-1 text-xs text-ink-faint"><FileText size={12} />المستندات المرتبطة</dt>
            <dd className="mt-1 flex flex-wrap gap-2">{docs.length ? docs.map((e) => (
              <a key={e.document_id} href={`/api/documents/${e.document_id}/download`} className="ltr rounded-full bg-white px-2.5 py-0.5 text-xs hover:text-royal">{e.filename}</a>
            )) : <span className="text-xs text-ink-faint">الأدلة من الخطة الدراسية فقط</span>}</dd></div>
          <div className="rounded-xl bg-canvas px-3 py-2 sm:col-span-2"><dt className="text-xs text-ink-faint">الخيارات المقترحة (التوصيات)</dt>
            <dd><ul className="mt-1 list-disc space-y-0.5 pr-5">{q.options.map((o, i) => <li key={i}>{o}</li>)}</ul></dd></div>
        </dl>
        <p className="mt-3 text-xs text-ink-soft">الأدلة المقتبسة معروضة أعلاه في «الأدلة الداعمة». المساعد يجيب فقط عن هذه المسألة وضمن ما تملك صلاحية الاطلاع عليه.</p>
      </div>

      {q.assistant_enabled ? children : (
        <div className="card p-6">
          <h3 className="flex items-center gap-2 font-bold text-navy"><MessageSquareOff size={18} className="text-ink-faint" />المساعد الذكي غير متاح مؤقتًا</h3>
          <p className="mt-2 text-sm text-ink-soft">التحليل الذكي معطّل في هذه النسخة، لذلك لا تتوفر المحادثة الحقيقية الآن، ولن تُعرض ردود مصطنعة. يمكنك إضافة معلومات للمسألة أدناه واعتماد القرار كالمعتاد.</p>
          {chatHistory.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-xs font-semibold text-ink-soft">محادثة سابقة (للاطلاع):</div>
              {chatHistory.map((m) => (
                <div key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "bg-navy text-white" : "bg-royal-50"}`}>
                  <div className={`text-[11px] ${m.role === "user" ? "text-white/60" : "text-ink-faint"}`}>{m.role === "user" ? m.user : "المساعد الذكي"} · {fmtDate(m.at)}</div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card space-y-3 p-6">
        <h3 className="flex items-center gap-2 font-bold text-navy"><PlusCircle size={18} className="text-royal" />إضافة معلومات أو أدلة <DemoTag label="محفوظة على هذا الجهاز" /></h3>
        <p className="text-xs text-ink-soft">
          {q.assistant_enabled ? "يُرسل النص للمساعد كسؤال ضمن هذه المسألة؛ الملفات المرفقة لا تُرسل إليه وتُحفظ أسماؤها هنا فقط." : "تُحفظ المعلومة هنا للاطلاع؛ لا يوجد في الخادم حاليًا مكان لحفظ معلومات إضافية على المسألة."}
        </p>
        <textarea className="input min-h-20" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="معلومة توضح المسألة، مثل قرار سابق أو رقم صفحة في التوصيف…" />
        <div className="flex flex-wrap items-center gap-3">
          <AttachmentPicker value={file} onChange={setFile} onError={setErr} label="إرفاق دليل" />
          <button className="btn-ghost mr-auto" disabled={busy || !text.trim()} onClick={add}>إضافة</button>
        </div>
        <ErrorNote message={err} />
        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="rounded-xl bg-canvas px-3 py-2 text-sm">
                <div>{i.text}</div>
                {i.file && <AttachmentChip a={i.file} />}
                <div className="text-xs text-ink-faint">{i.by} · {fmtDate(i.at)}{i.sentToAssistant && " · أُرسلت للمساعد"}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card flex flex-wrap items-center gap-3 border-royal/30 bg-royal-50 p-5 text-sm text-royal">
        <ShieldCheck size={20} className="shrink-0" />
        <span className="flex-1">
          {q.status === "approved" ? "اعتُمد القرار في هذه المسألة." : q.can_decide
            ? "خطوة الاعتماد: المساعد لا يعتمد أي قرار. اختر خيارًا أو اكتب إجابة في قسم «القرار» ثم اضغط «اعتماد القرار»."
            : `القرار مسند إلى ${q.assignee ?? "صاحب الصلاحية"}، ويُعتمد صراحةً منه.`}
        </span>
        {q.can_decide && q.status !== "approved" && (
          <button className="btn-primary" onClick={() => document.getElementById("decision-box")?.scrollIntoView({ behavior: "smooth", block: "center" })}>الانتقال للقرار</button>
        )}
      </div>
    </div>
  );
}
