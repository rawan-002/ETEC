"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { DemoBanner, DemoTag, FilterTabs, RealTag } from "@/components/demo/DemoParts";
import { useMe } from "@/components/Shell";
import { Empty, Spinner } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useDocEdits } from "@/lib/docEdits";
import { fmtDate, KIND_AR } from "@/lib/labels";
import { useMissingData } from "@/lib/missingData";
import { useReports } from "@/lib/reports";
import { isProjectTeam, useTickets } from "@/lib/support";
import type { Course } from "@/lib/types";

interface Event { id: number; at: string; kind: string; message: string; actor: string }

/** One line of the prototype's own log (kept apart from the platform's real log). */
interface DemoEvent { id: string; at: string; actor: string; feature: string; action: string; note: string | null; course: string | null; href: string }

const KIND_LINK: Record<string, string> = { decision: "/decisions", review: "/review", approval: "/distribution", assignment: "/distribution", reminder: "/notifications" };

export default function ActivityPage() {
  const me = useMe();
  const [tab, setTab] = useState<"real" | "demo">("real");
  const [kind, setKind] = useState<string>("");
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const [course, setCourse] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data } = useApi<Event[]>("/api/activity", 15000);
  const { data: courses } = useApi<Course[]>(me.role === "faculty" ? "/api/me/courses" : `/api/courses?program=${me.program ?? "CS"}`);
  const { requests } = useMissingData(me);
  const { reports } = useReports(me);
  const { proposals } = useDocEdits(me);
  const { tickets } = useTickets(isProjectTeam(me) ? "all" : "mine", me);

  // Course codes appear in event messages; match them to course pages.
  const codes = useMemo(() => (courses ?? []).filter((c) => c.code && c.code !== "—").map((c) => ({ code: c.code, id: c.id })), [courses]);
  const courseOf = (text: string) => codes.find((c) => text.includes(c.code)) ?? null;

  const demo = useMemo<DemoEvent[]>(() => {
    const out: DemoEvent[] = [];
    for (const r of requests ?? []) r.history.forEach((h) => out.push({ id: `md${h.id}`, at: h.at, actor: h.actorName, feature: "استكمال البيانات", action: `${h.action} — طلب #${r.number}`, note: h.note, course: r.course.code, href: `/missing-data?r=${r.id}` }));
    for (const r of reports ?? []) r.history.forEach((h) => out.push({ id: `rep${h.id}`, at: h.at, actor: h.actorName, feature: "تقارير الفجوات", action: `${h.action} — تقرير #${r.number}`, note: h.note, course: r.course.code, href: `/reports?r=${r.id}` }));
    for (const p of proposals ?? []) p.history.forEach((h) => out.push({ id: `ed${h.id}`, at: h.at, actor: h.actorName, feature: "تعديل المستندات", action: `${h.action} — اقتراح #${p.number}`, note: h.note, course: p.course.code, href: `/document-edits?p=${p.id}` }));
    for (const t of tickets ?? []) t.messages.forEach((m) => out.push({ id: `sp${m.id}`, at: m.at, actor: m.authorName, feature: "الدعم الفني", action: m.author === "system" ? m.body : `رسالة في طلب الدعم #${t.number}`, note: null, course: null, href: isProjectTeam(me) ? "/support" : "/inbox" }));
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [requests, reports, proposals, tickets, me]);

  const inRange = (at: string) => (!from || at.slice(0, 10) >= from) && (!to || at.slice(0, 10) <= to);
  const text = q.trim();
  const real = (data ?? []).filter((e) => (!kind || e.kind === kind) && (!actor || e.actor === actor) && (!course || e.message.includes(course))
    && inRange(e.at) && (!text || e.message.includes(text) || e.actor.includes(text)));
  const demoShown = demo.filter((e) => (!actor || e.actor === actor) && (!course || e.course === course) && inRange(e.at)
    && (!text || e.action.includes(text) || e.actor.includes(text) || (e.note ?? "").includes(text)));
  const actors = [...new Set((tab === "real" ? data ?? [] : demo).map((e) => e.actor))].sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">سجل النشاط</h1>
        <p className="muted mt-1">كل عملية رفع وتصنيف واعتماد وتذكير، بالمستخدم والوقت. السجل لا يُعدّل ولا يُحذف.</p>
      </div>
      <FilterTabs value={tab} onChange={(t) => { setTab(t); setActor(""); setOpen(null); }}
        tabs={[["real", "سجل المنصة (حقيقي)", data?.length], ["demo", "سجل النموذج التجريبي", demo.length]]} />
      {tab === "demo" && <DemoBanner>إجراءات الميزات التجريبية (استكمال البيانات، التقارير، تعديل المستندات، الدعم الفني) المحفوظة على هذا الجهاز. منفصلة تمامًا عن سجل المنصة الحقيقي ولا تُرسل إليه.</DemoBanner>}

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2">
          <Search size={16} className="pointer-events-none absolute right-3 top-2.5 text-ink-faint" />
          <input className="input pr-9" placeholder="بحث في السجل…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" value={actor} onChange={(e) => setActor(e.target.value)} aria-label="المستخدم">
          <option value="">كل المستخدمين</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="input" value={course} onChange={(e) => setCourse(e.target.value)} aria-label="المقرر">
          <option value="">كل المقررات</option>
          {codes.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <input type="date" className="input ltr px-2 text-right" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من تاريخ" />
          <input type="date" className="input ltr px-2 text-right" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى تاريخ" />
        </div>
      </div>

      {tab === "real" && (
        <div className="flex flex-wrap gap-1 text-sm">
          <button onClick={() => setKind("")} className={`rounded-lg px-3 py-1 ${!kind ? "bg-navy text-white" : "bg-white hover:bg-canvas"}`}>الكل</button>
          {Object.entries(KIND_AR).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={`rounded-lg px-3 py-1 ${kind === k ? "bg-navy text-white" : "bg-white hover:bg-canvas"}`}>{l}</button>
          ))}
        </div>
      )}

      {tab === "real" ? (!data ? <Spinner /> : real.length === 0 ? <Empty>لا توجد أحداث مطابقة.</Empty> : (
        <ol className="card divide-y divide-line">
          {real.map((e) => {
            const c = courseOf(e.message);
            const isOpen = open === `r${e.id}`;
            return (
              <li key={e.id} className="p-4 text-sm">
                <button className="flex w-full flex-wrap items-start gap-3 text-right" onClick={() => setOpen(isOpen ? null : `r${e.id}`)} aria-expanded={isOpen}>
                  <span className="w-28 shrink-0 rounded-full bg-canvas px-2 py-0.5 text-center text-xs text-ink-soft">{KIND_AR[e.kind] ?? e.kind}</span>
                  <div className="min-w-0 flex-1">
                    <div>{e.message}</div>
                    <div className="mt-0.5 text-xs text-ink-faint">{e.actor} · {fmtDate(e.at)}</div>
                  </div>
                  <ChevronDown size={16} className={`shrink-0 text-ink-faint transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-canvas px-3 py-2 text-xs">
                    <RealTag label="من سجل المنصة" />
                    <span>رقم الحدث {e.id}</span>
                    {c && <Link href={`/courses/${c.id}`} className="font-semibold text-royal hover:underline">صفحة المقرر <span className="ltr">{c.code}</span></Link>}
                    {KIND_LINK[e.kind] && <Link href={KIND_LINK[e.kind]} className="font-semibold text-royal hover:underline">الصفحة المرتبطة</Link>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )) : demoShown.length === 0 ? <Empty>لا توجد إجراءات تجريبية مطابقة.</Empty> : (
        <ol className="card divide-y divide-line">
          {demoShown.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-3 p-4 text-sm">
              <span className="w-28 shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-center text-xs text-amber-800">{e.feature}</span>
              <div className="min-w-0 flex-1">
                <div>{e.action}</div>
                {e.note && <div className="mt-0.5 text-ink-soft">«{e.note}»</div>}
                <div className="mt-0.5 text-xs text-ink-faint">{e.actor} · {fmtDate(e.at)}{e.course && <> · <span className="ltr">{e.course}</span></>}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <DemoTag />
                <Link href={e.href} className="text-xs font-semibold text-royal hover:underline">فتح</Link>
              </div>
            </li>
          ))}
        </ol>
      )}
      {tab === "real" && data && <p className="text-xs text-ink-faint">يعرض الخادم آخر 300 حدث؛ البحث والتصفية على هذه الأحداث.</p>}
    </div>
  );
}
