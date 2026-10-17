"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpLeft, CheckCircle2, FileText, Send, Sparkles } from "lucide-react";
import { Empty, ErrorNote, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { fmtDate } from "@/lib/labels";
import type { Priority, QuestionDetail, QuestionSummary } from "@/lib/types";

const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  high: { label: "أولوية عالية", cls: "bg-red-50 text-red-700" },
  medium: { label: "أولوية متوسطة", cls: "bg-amber-50 text-amber-700" },
  low: { label: "أولوية منخفضة", cls: "bg-slate-100 text-ink-soft" },
};
const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-leaf-50 text-leaf",
  deferred: "bg-slate-100 text-ink-soft",
};
const QUICK = ["لماذا ظهرت هذه المسألة؟", "ما الخيار الأنسب وفق الأدلة؟", "ما أثر كل خيار على ملف المقرر؟"];

export default function DecisionsPage() {
  return <Suspense fallback={<Spinner />}><Decisions /></Suspense>;
}

function Decisions() {
  const params = useSearchParams();
  const { data: list, reload } = useApi<QuestionSummary[]>("/api/questions", 20000);
  const [tab, setTab] = useState<"mine" | "open" | "done">("mine");
  const [selected, setSelected] = useState<number | null>(params.get("q") ? Number(params.get("q")) : null);

  const shown = useMemo(() => (list ?? []).filter((q) =>
    tab === "mine" ? q.assigned_to_me && q.status !== "approved" : tab === "open" ? q.status !== "approved" : q.status === "approved"),
  [list, tab]);

  useEffect(() => {
    if (list && selected === null) setSelected(shown[0]?.id ?? list[0]?.id ?? null);
  }, [list, shown, selected]);

  if (!list) return <Spinner />;
  const counts = {
    mine: list.filter((q) => q.assigned_to_me && q.status !== "approved").length,
    open: list.filter((q) => q.status !== "approved").length,
    done: list.filter((q) => q.status === "approved").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page text-3xl">مركز القرارات الذكي</h1>
        <p className="muted mt-2">يحلّل التحليل الذكي ملفات المقررات، ويولّد سؤالًا عند رصد تعارض يتطلب قرارًا بشريًا، ويُسنده لصاحب الصلاحية مع الأدلة.</p>
      </div>

      {list.length === 0 ? (
        <Empty>لا توجد مسائل بعد. تُرصد المسائل تلقائيًا عند رفع توصيف المقرر، أو بزر «تحليل ملف المقرر» في صفحة المقرر.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className="space-y-3">
            <div className="flex gap-1 rounded-xl bg-white p-1 text-sm shadow-card">
              {([["mine", "بانتظاري"], ["open", "المفتوحة"], ["done", "المحسومة"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`flex-1 rounded-lg px-3 py-1.5 ${tab === k ? "bg-navy font-semibold text-white" : "text-ink-soft hover:bg-canvas"}`}>
                  {l} <span className="opacity-70">({counts[k]})</span>
                </button>
              ))}
            </div>
            {shown.length === 0 && <Empty>لا توجد مسائل هنا.</Empty>}
            {shown.map((q) => (
              <button key={q.id} onClick={() => setSelected(q.id)}
                className={`block w-full rounded-2xl border bg-white p-4 text-right shadow-card transition ${selected === q.id ? "border-royal ring-2 ring-royal/15" : "border-line hover:border-royal/40"}`}>
                <div className="flex items-start gap-2">
                  <span className="flex-1 font-semibold leading-6">{q.title}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[q.status]}`}>{q.status_ar}</span>
                </div>
                <div className="mt-1.5 text-xs text-ink-soft">
                  <span className="ltr">{q.course.code}</span> · {q.assigned_to_me ? "مُسند إليك" : `مُسند إلى ${q.assignee ?? "—"}`}
                  {q.escalations > 0 && " · مُصعّدة"}
                </div>
              </button>
            ))}
          </section>

          {selected ? <QuestionView key={selected} id={selected} onChange={reload} /> : <Empty>اختر مسألة لعرضها.</Empty>}
        </div>
      )}
    </div>
  );
}

function QuestionView({ id, onChange }: { id: number; onChange: () => void }) {
  const { data: q, reload, error } = useApi<QuestionDetail>(`/api/questions/${id}`);
  const [option, setOption] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [escalating, setEscalating] = useState(false);
  const [target, setTarget] = useState<number | "">("");
  const [note, setNote] = useState("");

  if (error) return <ErrorNote message={error} />;
  if (!q) return <Spinner />;

  const act = async (path: string, json: unknown) => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/questions/${q.id}/${path}`, { method: "POST", json });
      setEscalating(false);
      await reload();
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر التنفيذ");
    } finally {
      setBusy(false);
    }
  };

  const events = q.messages.filter((m) => m.role === "event");
  return (
    <section className="space-y-5">
      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-semibold ${PRIORITY[q.priority].cls}`}>{PRIORITY[q.priority].label}</span>
          <Link href={`/courses/${q.course.id}`} className="rounded-full bg-royal-50 px-2.5 py-1 font-semibold text-royal hover:underline">
            <span className="ltr">{q.course.code}</span> · <span className="ltr">{q.course.title}</span>
          </Link>
        </div>
        <h2 className="mt-3 text-xl font-bold text-navy">{q.title}</h2>
        <p className="mt-2 leading-7 text-ink-soft">{q.description}</p>

        <h3 className="mt-6 flex items-center gap-2 text-sm font-bold text-royal"><FileText size={16} />الأدلة الداعمة</h3>
        <ul className="mt-3 space-y-2">
          {q.evidence.map((e, i) => (
            <li key={i} className="rounded-xl border-s-4 border-royal bg-canvas px-4 py-3 text-sm">
              <div className="text-xs text-ink-faint">
                {e.document_id && e.filename
                  ? <a href={`/api/documents/${e.document_id}/download`} className="hover:text-royal">{e.source}</a>
                  : e.source}
              </div>
              <div className="mt-1 font-medium" dir="auto">«{e.quote}»</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-6">
        <h3 className="font-bold text-navy">القرار</h3>
        {q.status === "approved" ? (
          <div className="mt-3 flex items-start gap-3 rounded-xl bg-leaf-50 p-4 text-sm text-leaf">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
            <div><div className="font-semibold">{q.decision}</div><div className="mt-1 text-xs">{q.decided_at && fmtDate(q.decided_at)}</div></div>
          </div>
        ) : !q.can_decide ? (
          <p className="muted mt-3">القرار مسند إلى {q.assignee ?? "—"}. يمكنك الاطلاع على المسألة واستيضاحها من المساعد الذكي.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {q.status === "deferred" && (
              <div className="flex items-center gap-3 rounded-xl bg-slate-100 px-4 py-2 text-sm text-ink-soft">
                المسألة مؤجلة.
                <button className="mr-auto text-royal hover:underline" disabled={busy} onClick={() => act("reopen", {})}>إعادة فتحها</button>
              </div>
            )}
            {q.options.map((o, i) => (
              <label key={i} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${option === i && !custom.trim() ? "border-royal bg-royal-50/60" : "border-line hover:border-royal/40"}`}>
                <input type="radio" name="option" className="h-4 w-4 accent-royal" checked={option === i} onChange={() => setOption(i)} />
                {o}
              </label>
            ))}
            <textarea className="input min-h-20" placeholder="أو اكتب إجابة مخصصة…" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <ErrorNote message={err} />
            {!escalating ? (
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={busy || (option === null && !custom.trim())}
                  onClick={() => act("decide", custom.trim() ? { custom } : { option })}>اعتماد القرار</button>
                {q.status === "pending" && <button className="btn-ghost" disabled={busy} onClick={() => act("defer", {})}>تأجيل</button>}
                {q.escalation_targets.length > 0 && <button className="btn-danger" disabled={busy} onClick={() => setEscalating(true)}>تصعيد</button>}
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-4">
                <div className="text-sm font-semibold text-red-800">تصعيد المسألة إلى</div>
                <select className="input" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                  <option value="">اختر المسؤول</option>
                  {q.escalation_targets.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.role}</option>)}
                </select>
                <input className="input" placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2">
                  <button className="btn-danger" disabled={busy || !target} onClick={() => act("escalate", { to_user_id: target, note })}>تأكيد التصعيد</button>
                  <button className="btn-ghost" onClick={() => setEscalating(false)}>إلغاء</button>
                </div>
              </div>
            )}
          </div>
        )}
        {events.length > 0 && (
          <ol className="mt-5 space-y-1.5 border-t border-line pt-4 text-xs text-ink-soft">
            {events.map((m) => <li key={m.id} className="flex gap-2"><ArrowUpLeft size={14} className="mt-0.5 shrink-0" />{m.content} · {fmtDate(m.at)}</li>)}
          </ol>
        )}
      </div>

      {q.assistant_enabled && <Assistant q={q} onAnswer={reload} />}
    </section>
  );
}

/** The assistant may emphasise with **bold**; render that and keep everything else as plain text. */
function RichText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part)}</>;
}

function Assistant({ q, onAnswer }: { q: QuestionDetail; onAnswer: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const chat = q.messages.filter((m) => m.role !== "event");

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [chat.length, pending]);

  const ask = async (message: string) => {
    if (!message.trim() || pending) return;
    setPending(message);
    setText("");
    setErr(null);
    try {
      await api(`/api/questions/${q.id}/ask`, { method: "POST", json: { message } });
      await onAnswer();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الحصول على إجابة");
      setText(message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="card p-6">
      <h3 className="flex items-center gap-2 font-bold text-navy"><Sparkles size={18} className="text-sky" />المساعد الذكي — استيضاح حول هذه المسألة</h3>
      <p className="muted mt-1">يجيب حصريًا عن المسألة المحددة وأدلتها وخياراتها، والقرار يبقى لك.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK.map((s) => (
          <button key={s} className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-royal hover:bg-royal-50" disabled={!!pending} onClick={() => ask(s)}>{s}</button>
        ))}
      </div>
      <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto">
        {chat.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7 ${m.role === "user" ? "bg-navy text-white" : "bg-royal-50 text-ink"}`}>
              {m.role === "user" && m.user && <div className="mb-1 text-[11px] text-white/60">{m.user}</div>}
              <RichText text={m.content} />
            </div>
          </div>
        ))}
        {pending && (
          <>
            <div className="flex justify-start"><div className="max-w-[85%] rounded-2xl bg-navy px-4 py-3 text-sm text-white">{pending}</div></div>
            <div className="flex justify-end"><div className="rounded-2xl bg-royal-50 px-4 py-3 text-sm text-ink-soft">المساعد يقرأ الأدلة…</div></div>
          </>
        )}
        <div ref={end} />
      </div>
      <ErrorNote message={err} />
      <form className="mt-4 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input className="input rounded-full" placeholder="اسأل عن هذه المسألة…" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
        <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-white disabled:opacity-50" disabled={!text.trim() || !!pending} aria-label="إرسال">
          <Send size={16} className="-scale-x-100" />
        </button>
      </form>
    </div>
  );
}
