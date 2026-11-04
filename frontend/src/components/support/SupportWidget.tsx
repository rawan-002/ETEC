"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Headset, X } from "lucide-react";
import { useMe } from "@/components/Shell";
import { Empty, ErrorNote, Spinner } from "@/components/ui";
import { fmtDate } from "@/lib/labels";
import type { AttachmentMeta, Ticket, TicketCategory } from "@/lib/support";
import { actorFrom, CATEGORY_AR, isProjectTeam, MAX_BODY, support, unreadForUser, useTickets } from "@/lib/support";
import { AttachmentPicker, DemoNotice, TicketStatusPill, TicketThread } from "./TicketThread";

type View = { name: "new" } | { name: "list" } | { name: "ticket"; id: string };

/** Floating "technical support" button (bottom-left) with the requester's panel. Rendered by Shell, so only after sign-in. */
export function SupportWidget() {
  const me = useMe();
  const { tickets } = useTickets("mine", me);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ name: "new" });
  const unread = (tickets ?? []).filter(unreadForUser).length;

  // The notification center opens this panel on the requester's list.
  useEffect(() => {
    const show = () => { setView({ name: "list" }); setOpen(true); };
    window.addEventListener("aq-open-support", show);
    return () => window.removeEventListener("aq-open-support", show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = () => {
    // Open on the list when a reply is waiting, otherwise on a new request.
    if (!open) setView(unread > 0 ? { name: "list" } : { name: "new" });
    setOpen((v) => !v);
  };

  return (
    <>
      {/* Room at the end of every page so the floating button never sits on top of the last controls. */}
      <div aria-hidden className="h-16 sm:h-20" />
      <button onClick={toggle} aria-label="المساعدة التقنية" title="المساعدة التقنية" aria-expanded={open}
        className="fixed bottom-4 left-4 z-20 grid h-12 w-12 place-items-center rounded-full bg-navy text-white shadow-lg shadow-navy/30 transition hover:bg-royal sm:bottom-6 sm:left-6 sm:h-14 sm:w-14">
        {open ? <X size={22} /> : <Headset size={24} />}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread}</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-navy/30 sm:bg-transparent" onClick={() => setOpen(false)} aria-hidden />
          <section role="dialog" aria-label="المساعدة التقنية"
            className="fixed inset-x-0 bottom-0 top-12 z-40 flex flex-col rounded-t-3xl border border-line bg-white shadow-2xl sm:inset-auto sm:bottom-24 sm:left-6 sm:top-auto sm:h-[min(40rem,calc(100vh-8rem))] sm:w-[26rem] sm:rounded-3xl">
            <header className="flex items-start gap-3 rounded-t-3xl bg-gradient-to-l from-royal via-navy-700 to-navy p-5 text-white">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10"><Headset size={20} /></div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">المساعدة التقنية</h2>
                <p className="mt-0.5 text-xs leading-5 text-white/75">واجهت مشكلة تقنية في المنصة؟ اكتبها هنا ويتابعها فريق المشروع معك.</p>
              </div>
              <button className="rounded-lg p-1 text-white/80 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="إغلاق"><X size={20} /></button>
            </header>

            {view.name !== "ticket" && (
              <div className="flex gap-1 border-b border-line p-2 text-sm">
                {([["new", "طلب جديد"], ["list", "طلباتي السابقة"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setView(k === "new" ? { name: "new" } : { name: "list" })}
                    className={`flex-1 rounded-lg px-3 py-1.5 ${view.name === k ? "bg-navy font-semibold text-white" : "text-ink-soft hover:bg-canvas"}`}>
                    {l}
                    {k === "list" && tickets && tickets.length > 0 && <span className="opacity-70"> ({tickets.length})</span>}
                    {k === "list" && unread > 0 && <span className="ms-1.5 inline-block h-2 w-2 rounded-full bg-red-600 align-middle" />}
                  </button>
                ))}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              {isProjectTeam(me) && (
                <Link href="/support" onClick={() => setOpen(false)} className="mb-3 rounded-xl bg-royal-50 px-3 py-2 text-xs font-semibold text-royal hover:underline">
                  أنت في فريق المشروع: افتح صفحة طلبات الدعم الفني للرد على الطلبات ←
                </Link>
              )}
              {view.name === "new" && <NewRequest onCreated={(id) => setView({ name: "ticket", id })} />}
              {view.name === "list" && (!tickets ? <Spinner /> : <RequestList tickets={tickets} onOpen={(id) => setView({ name: "ticket", id })} />)}
              {view.name === "ticket" && <RequestDetail id={view.id} onBack={() => setView({ name: "list" })} />}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function NewRequest({ onCreated }: { onCreated: (id: string) => void }) {
  const me = useMe();
  const [category, setCategory] = useState<TicketCategory | null>(null);
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<AttachmentMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = category !== null && body.trim().length >= 10;

  const submit = async () => {
    if (!ready || busy || !category) return;
    setBusy(true);
    setErr(null);
    try {
      const t = await support.create(actorFrom(me), { category, body, attachment });
      onCreated(t.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <DemoNotice />
      <fieldset>
        <legend className="label">نوع المشكلة</legend>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CATEGORY_AR) as TicketCategory[]).map((k) => (
            <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${category === k ? "border-royal bg-royal-50/60 font-semibold text-navy" : "border-line hover:border-royal/40"}`}>
              <input type="radio" name="category" className="h-4 w-4 accent-royal" checked={category === k} onChange={() => setCategory(k)} />
              {CATEGORY_AR[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="support-body">وصف المشكلة</label>
        <textarea id="support-body" className="input min-h-28" maxLength={MAX_BODY} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="ماذا كنت تحاول أن تفعل؟ وماذا ظهر لك؟ في أي صفحة؟" />
        <div className="mt-1 flex justify-between text-xs text-ink-faint">
          <span>{body.trim().length > 0 && body.trim().length < 10 ? "اكتب وصفًا أوضح (10 أحرف على الأقل)" : ""}</span>
          <span className="ltr">{body.length}/{MAX_BODY}</span>
        </div>
      </div>
      <AttachmentPicker value={attachment} onChange={setAttachment} onError={setErr} />
      <ErrorNote message={err} />
      <button type="submit" className="btn-primary w-full" disabled={!ready || busy}>{busy ? "جارٍ الإرسال…" : "إرسال الطلب"}</button>
    </form>
  );
}

function RequestList({ tickets, onOpen }: { tickets: Ticket[]; onOpen: (id: string) => void }) {
  if (tickets.length === 0) return <Empty>لا توجد طلبات سابقة.</Empty>;
  return (
    <ul className="space-y-2">
      {tickets.map((t) => (
        <li key={t.id}>
          <button onClick={() => onOpen(t.id)} className="block w-full rounded-xl bg-canvas p-3 text-right transition hover:bg-royal-50">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm font-semibold">#{t.number} · {CATEGORY_AR[t.category]}</span>
              {unreadForUser(t) && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">رد جديد</span>}
              <TicketStatusPill status={t.status} />
            </div>
            <div className="mt-1 truncate text-xs text-ink-soft">{t.messages[0]?.body}</div>
            <div className="mt-1 text-[11px] text-ink-faint">آخر تحديث {fmtDate(t.updatedAt)}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RequestDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const me = useMe();
  const { tickets } = useTickets("mine", me);
  const ticket = tickets?.find((t) => t.id === id);
  const unread = ticket ? unreadForUser(ticket) : false;

  useEffect(() => { if (unread) support.markSeen(id, "user"); }, [id, unread]);

  if (!tickets) return <Spinner />;
  if (!ticket) return <Empty>الطلب غير موجود.</Empty>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button className="rounded-lg p-1 text-ink-soft hover:bg-canvas" onClick={onBack} aria-label="رجوع"><ArrowRight size={18} /></button>
        <span className="flex-1 text-sm font-bold text-navy">#{ticket.number} · {CATEGORY_AR[ticket.category]}</span>
        <TicketStatusPill status={ticket.status} />
      </div>
      {ticket.status === "resolved" && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-leaf-50 px-3 py-2 text-xs text-leaf">
          <CheckCircle2 size={14} className="shrink-0" />حُلّ هذا الطلب. إن استمرت المشكلة اكتب ردًا ويُعاد فتحه.
        </div>
      )}
      <TicketThread ticket={ticket} side="user"
        onReply={async (body, attachment) => { await support.reply(ticket.id, actorFrom(me), "user", body, attachment); }} />
    </div>
  );
}
