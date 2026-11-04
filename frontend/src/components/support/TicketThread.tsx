"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { ErrorNote } from "@/components/ui";
import { fmtDate, fmtSize } from "@/lib/labels";
import type { AttachmentMeta, Ticket, TicketStatus } from "@/lib/support";
import { MAX_ATTACHMENT_MB, MAX_BODY, STATUS_AR, SUPPORT_IS_DEMO } from "@/lib/support";

export function TicketStatusPill({ status }: { status: TicketStatus }) {
  const s = STATUS_AR[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export function DemoNotice({ className = "" }: { className?: string }) {
  if (!SUPPORT_IS_DEMO) return null;
  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 ${className}`}>
      نسخة تجريبية: الطلبات محفوظة على هذا الجهاز فقط ولا تصل لفريق المشروع فعليًا. لا تكتب كلمات مرور أو بيانات حساسة.
    </div>
  );
}

/** Picks one optional file and keeps only its name, size and type. */
export function AttachmentPicker({ value, onChange, onError, label = "إرفاق صورة أو ملف (اختياري)" }: {
  value: AttachmentMeta | null; onChange: (a: AttachmentMeta | null) => void; onError: (m: string | null) => void; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      onError(`الملف أكبر من ${MAX_ATTACHMENT_MB} ميجابايت`);
      return;
    }
    onError(null);
    onChange({ name: f.name, size: f.size, type: f.type || "application/octet-stream" });
  };
  return (
    <>
      <input ref={input} type="file" hidden accept="image/*,.pdf,.txt,.log,.doc,.docx,.zip"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      {value ? (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-canvas px-3 py-1 text-xs text-ink-soft">
          <Paperclip size={13} className="shrink-0" />
          <span className="ltr truncate">{value.name}</span>
          <span className="shrink-0">· {fmtSize(value.size)}</span>
          <button type="button" className="shrink-0 rounded-full p-0.5 hover:bg-line" onClick={() => onChange(null)} aria-label="إزالة المرفق"><X size={12} /></button>
        </span>
      ) : (
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-royal hover:bg-royal-50"
          onClick={() => input.current?.click()}>
          <Paperclip size={14} />{label}
        </button>
      )}
    </>
  );
}

export function AttachmentChip({ a, dark = false }: { a: AttachmentMeta; dark?: boolean }) {
  return (
    <div className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${dark ? "bg-white/10 text-white/80" : "bg-white text-ink-soft"}`}
      title={SUPPORT_IS_DEMO ? "في النسخة التجريبية يُحفظ اسم الملف فقط" : undefined}>
      <Paperclip size={12} className="shrink-0" />
      <span className="ltr truncate">{a.name}</span>
      <span className="shrink-0">· {fmtSize(a.size)}</span>
    </div>
  );
}

/** The conversation of one request. "side" is who is reading: the requester or the project team. */
export function TicketThread({ ticket, side, onReply }: {
  ticket: Ticket; side: "user" | "team"; onReply: (body: string, attachment: AttachmentMeta | null) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<AttachmentMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [ticket.messages.length]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onReply(text, attachment);
      setText("");
      setAttachment(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر إرسال الرد");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-1">
        {ticket.messages.map((m) => {
          if (m.author === "system") {
            return <div key={m.id} className="text-center text-xs text-ink-faint">{m.body} · {fmtDate(m.at)}</div>;
          }
          // Own messages on the start side in navy, the other party's on the end side, as in the decision center chat.
          const own = m.author === side;
          return (
            <div key={m.id} className={`flex ${own ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7 ${own ? "bg-navy text-white" : "bg-royal-50 text-ink"}`}>
                <div className={`mb-1 text-[11px] ${own ? "text-white/60" : "text-ink-faint"}`}>{m.authorName} · {fmtDate(m.at)}</div>
                {m.body}
                {m.attachment && <div><AttachmentChip a={m.attachment} dark={own} /></div>}
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form className="mt-3 space-y-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <ErrorNote message={err} />
        <div className="flex items-end gap-2">
          <textarea className="input min-h-11 resize-none" rows={2} maxLength={MAX_BODY} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={side === "team" ? "اكتب ردك على صاحب الطلب…" : "اكتب ردًا أو معلومة إضافية…"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-white disabled:opacity-50"
            disabled={!text.trim() || busy} aria-label="إرسال الرد">
            <Send size={16} className="-scale-x-100" />
          </button>
        </div>
        <AttachmentPicker value={attachment} onChange={setAttachment} onError={setErr} />
      </form>
    </div>
  );
}
