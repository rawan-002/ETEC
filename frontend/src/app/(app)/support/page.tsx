"use client";

import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/components/Shell";
import { AttachmentChip, DemoNotice, TicketStatusPill, TicketThread } from "@/components/support/TicketThread";
import { Empty, ErrorNote, Spinner } from "@/components/ui";
import { fmtDate } from "@/lib/labels";
import type { Ticket, TicketStatus } from "@/lib/support";
import { actorFrom, CATEGORY_AR, isProjectTeam, STATUS_AR, support, unreadForTeam, useTickets } from "@/lib/support";

type Filter = "all" | TicketStatus;

export default function SupportRequestsPage() {
  const me = useMe();
  // The page is for the project team; the role comes from the server session, not from stored data.
  if (!isProjectTeam(me)) return <Empty>هذه الصفحة لفريق المشروع.</Empty>;
  return <SupportRequests />;
}

function SupportRequests() {
  const me = useMe();
  const { tickets } = useTickets("all", me);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const shown = useMemo(() => (tickets ?? []).filter((t) => filter === "all" || t.status === filter), [tickets, filter]);

  useEffect(() => {
    if (tickets && selected === null) setSelected(shown[0]?.id ?? null);
  }, [tickets, shown, selected]);

  if (!tickets) return <Spinner />;
  const count = (f: Filter) => (f === "all" ? tickets.length : tickets.filter((t) => t.status === f).length);
  const ticket = tickets.find((t) => t.id === selected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">طلبات الدعم الفني</h1>
        <p className="muted mt-1">المشكلات التقنية التي يرسلها المستخدمون من زر المساعدة التقنية. رد على صاحب الطلب وحدّث حالته.</p>
      </div>
      <DemoNotice />

      {tickets.length === 0 ? <Empty>لا توجد طلبات دعم بعد.</Empty> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className="space-y-3">
            <div className="flex gap-1 rounded-xl bg-white p-1 text-sm shadow-card">
              {(["all", "new", "in_progress", "resolved"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-1 rounded-lg px-2 py-1.5 ${filter === f ? "bg-navy font-semibold text-white" : "text-ink-soft hover:bg-canvas"}`}>
                  {f === "all" ? "الكل" : STATUS_AR[f].label} <span className="opacity-70">({count(f)})</span>
                </button>
              ))}
            </div>
            {shown.length === 0 && <Empty>لا توجد طلبات هنا.</Empty>}
            {shown.map((t) => (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className={`block w-full rounded-2xl border bg-white p-4 text-right shadow-card transition ${selected === t.id ? "border-royal ring-2 ring-royal/15" : "border-line hover:border-royal/40"}`}>
                <div className="flex items-start gap-2">
                  {unreadForTeam(t) && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-600" aria-label="جديد" />}
                  <span className="flex-1 font-semibold leading-6">#{t.number} · {CATEGORY_AR[t.category]}</span>
                  <TicketStatusPill status={t.status} />
                </div>
                <div className="mt-1 truncate text-sm text-ink-soft">{t.messages[0]?.body}</div>
                <div className="mt-1.5 text-xs text-ink-faint">
                  {t.ownerName} · {t.ownerRole} · {fmtDate(t.createdAt)}
                  {t.demo && " · مثال تجريبي"}
                </div>
              </button>
            ))}
          </section>

          {ticket ? <TicketView key={ticket.id} ticket={ticket} /> : <Empty>اختر طلبًا لعرضه.</Empty>}
        </div>
      )}
    </div>
  );
}

function TicketView({ ticket }: { ticket: Ticket }) {
  const me = useMe();
  const [err, setErr] = useState<string | null>(null);
  const unread = unreadForTeam(ticket) && ticket.status !== "new";
  const attachments = ticket.messages.filter((m) => m.attachment).map((m) => m.attachment!);

  // Opening a request clears its "new reply" mark; a "new" request stays new until someone acts on it.
  useEffect(() => { if (unread) support.markSeen(ticket.id, "team"); }, [ticket.id, unread]);

  const setStatus = async (status: TicketStatus) => {
    setErr(null);
    try { await support.setStatus(ticket.id, actorFrom(me), status); }
    catch (e) { setErr(e instanceof Error ? e.message : "تعذّر تغيير الحالة"); }
  };

  return (
    <section className="space-y-5">
      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-royal-50 px-2.5 py-1 font-semibold text-royal">{CATEGORY_AR[ticket.category]}</span>
          <TicketStatusPill status={ticket.status} />
          <span className="mr-auto text-ink-faint">أُرسل {fmtDate(ticket.createdAt)}</span>
        </div>
        <h2 className="mt-3 text-xl font-bold text-navy">طلب #{ticket.number}</h2>
        <div className="mt-1 text-sm text-ink-soft">{ticket.ownerName} · {ticket.ownerRole}</div>
        <p className="mt-4 whitespace-pre-wrap leading-7">{ticket.messages[0]?.body}</p>
        {attachments.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-ink-soft">المرفقات</div>
            <div className="flex flex-wrap gap-2">{attachments.map((a, i) => <AttachmentChip key={i} a={a} />)}</div>
          </div>
        )}
        <div className="mt-5 border-t border-line pt-4">
          <div className="label">حالة الطلب</div>
          <div className="flex flex-wrap gap-2">
            {(["new", "in_progress", "resolved"] as const).map((s) => (
              <button key={s} className={ticket.status === s ? "btn-primary" : "btn-ghost"} disabled={ticket.status === s} onClick={() => setStatus(s)}>
                {STATUS_AR[s].label}
              </button>
            ))}
          </div>
          <div className="mt-2"><ErrorNote message={err} /></div>
        </div>
      </div>

      <div className="card flex h-[32rem] flex-col p-6">
        <h3 className="mb-3 font-bold text-navy">المحادثة مع صاحب الطلب</h3>
        <TicketThread ticket={ticket} side="team"
          onReply={async (body, attachment) => { await support.reply(ticket.id, actorFrom(me), "team", body, attachment); }} />
      </div>
    </section>
  );
}
