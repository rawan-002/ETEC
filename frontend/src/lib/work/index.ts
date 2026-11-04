"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import { createDemoStore } from "@/lib/demo/store";
import { canEdit, hasUpdate as mdHasUpdate, missingData, needsMyAction, STATUS_AR as MD_STATUS, useMissingData } from "@/lib/missingData";
import { editHasUpdate, editNeedsMe, EDIT_STATUS_AR, useDocEdits, docEditService } from "@/lib/docEdits";
import { reportHasUpdate, reportNeedsMe, reportService, STATUS_AR as REPORT_STATUS, useReports } from "@/lib/reports";
import { CATEGORY_AR, support, unreadForTeam, unreadForUser, useTickets } from "@/lib/support";
import type { EditProposal, EditViewer } from "@/lib/docEdits";
import type { MdViewer, MissingDataRequest } from "@/lib/missingData";
import type { GapReport, ReportViewer } from "@/lib/reports";
import type { Ticket } from "@/lib/support";
import type { Course, Me, ProgramSummary, QuestionSummary } from "@/lib/types";

/** One thing to do or to know about, from the backend (real) or from the prototype's browser data. */
export interface WorkItem {
  id: string;
  source: "decision" | "selection" | "distribution" | "missing_component" | "review_queue" | "email" | "missing_data" | "report" | "doc_edit" | "support";
  title: string;
  detail: string | null;
  href: string;
  at: string | null;
  real: boolean;
}

/** Opens an item's page; "#support" opens the floating support panel instead. */
export function openItem(navigate: (href: string) => void, href: string) {
  if (href === "#support") window.dispatchEvent(new Event("aq-open-support"));
  else navigate(href);
}

export const SOURCE_LABEL: Record<WorkItem["source"], string> = {
  decision: "مركز القرارات", selection: "اختيار المقررات", distribution: "توزيع المقررات", missing_component: "وثائق ناقصة",
  review_queue: "مراجعة التصنيف", email: "إشعار بريدي", missing_data: "استكمال البيانات", report: "تقارير الفجوات",
  doc_edit: "تعديل المستندات", support: "الدعم الفني",
};

export interface EmailNote { id: number; to: string; subject: string; body: string; created_at: string; read: boolean }

/** Which notifications this user has opened, for sources that do not track it themselves. Device-local. */
const readStore = createDemoStore<{ version: 1; read: Record<string, string[]> }>("aq.inbox.read.v1", () => ({ version: 1, read: {} }));

export interface WorkInput {
  me: Me | null;
  questions?: QuestionSummary[] | null;
  myCourses?: Course[] | null;
  dash?: { programs: ProgramSummary[]; review_queue: number } | null;
  emails?: EmailNote[] | null;
  requests?: MissingDataRequest[] | null;
  mdViewer?: MdViewer | null;
  reports?: GapReport[] | null;
  repViewer?: ReportViewer | null;
  proposals?: EditProposal[] | null;
  editViewer?: EditViewer | null;
  myTickets?: Ticket[] | null;
  allTickets?: Ticket[] | null;
}

/** Tasks (what this user must do) and notifications (what changed), from every source. Pure, for testing. */
export function collectWork({ me, questions, myCourses, dash, emails, requests, mdViewer, reports, repViewer, proposals, editViewer, myTickets, allTickets }: WorkInput): { tasks: WorkItem[]; notifications: WorkItem[] } {
  const tasks: WorkItem[] = [];
  const notes: WorkItem[] = [];
  if (!me) return { tasks, notifications: notes };

  // ----- real (backend) -----
  if (me.needs_course_selection) tasks.push({ id: "selection", source: "selection", title: "اختر مقرراتك لهذا الفصل", detail: null, href: "/select-courses", at: null, real: true });
  for (const q of questions ?? []) {
    if (q.assigned_to_me && q.status === "pending") {
      tasks.push({ id: `decision:${q.id}`, source: "decision", title: `قرار بانتظار اعتمادك: ${q.title}`, detail: q.course.code, href: `/decisions?q=${q.id}`, at: q.created_at, real: true });
      notes.push({ id: `decision:${q.id}:${q.escalations}`, source: "decision", title: q.escalations ? `صُعّدت إليك مسألة: ${q.title}` : `مسألة جديدة مسندة إليك: ${q.title}`, detail: q.course.code, href: `/decisions?q=${q.id}`, at: q.created_at, real: true });
    }
  }
  if (me.role === "head") {
    const p = dash?.programs.find((x) => x.program === me.program);
    if (p && !p.distribution_approved) tasks.push({ id: "distribution", source: "distribution", title: "راجع توزيع المقررات واعتمده لتبدأ التذكيرات", detail: null, href: "/distribution", at: null, real: true });
  }
  if ((me.role === "team" || me.role === "dean") && dash?.review_queue) {
    tasks.push({ id: "review_queue", source: "review_queue", title: `${dash.review_queue} ملف بانتظار حسم التصنيف`, detail: me.role === "team" ? null : "للاطلاع", href: "/review", at: null, real: true });
  }
  for (const c of myCourses ?? []) {
    const missing = (c.components ?? []).filter((s) => s.status === "missing" && (c.is_coordinator || s.component !== "spec"));
    if (missing.length) tasks.push({ id: `missing:${c.id}`, source: "missing_component", title: `ارفع ${missing.map((m) => m.label).join("، ")}`, detail: c.code, href: `/courses/${c.id}`, at: null, real: true });
  }
  for (const n of (emails ?? []).filter((x) => x.to === me.name)) {
    notes.push({ id: `email:${n.id}`, source: "email", title: n.subject, detail: null, href: "/notifications", at: n.created_at, real: true });
  }

  // ----- prototype (browser data) -----
  if (mdViewer) for (const r of requests ?? []) {
    if (needsMyAction(r, mdViewer)) tasks.push({ id: `md:${r.id}`, source: "missing_data", title: canEdit(r, mdViewer) ? `استكمل: ${r.issueTitle}` : `راجع: ${r.issueTitle}`, detail: r.course.code, href: `/missing-data?r=${r.id}`, at: r.updatedAt, real: false });
    if (mdHasUpdate(r, mdViewer)) notes.push({ id: `md:${r.id}:${r.updatedAt}`, source: "missing_data", title: `طلب استكمال #${r.number}: ${MD_STATUS[r.status].label}`, detail: r.course.code, href: `/missing-data?r=${r.id}`, at: r.updatedAt, real: false });
  }
  if (repViewer) for (const r of reports ?? []) {
    if (reportNeedsMe(r, repViewer)) tasks.push({ id: `rep:${r.id}`, source: "report", title: `تقرير فجوات بانتظارك: ${r.course.code}`, detail: REPORT_STATUS[r.status].label, href: `/reports?r=${r.id}`, at: r.updatedAt, real: false });
    if (reportHasUpdate(r, repViewer)) notes.push({ id: `rep:${r.id}:${r.updatedAt}`, source: "report", title: `تقرير #${r.number}: ${REPORT_STATUS[r.status].label}`, detail: r.course.code, href: `/reports?r=${r.id}`, at: r.updatedAt, real: false });
  }
  if (editViewer) for (const p of proposals ?? []) {
    if (editNeedsMe(p, editViewer)) tasks.push({ id: `edit:${p.id}`, source: "doc_edit", title: `اقتراح تعديل بانتظارك: ${p.documentName}`, detail: EDIT_STATUS_AR[p.status].label, href: `/document-edits?p=${p.id}`, at: p.updatedAt, real: false });
    if (editHasUpdate(p, editViewer)) notes.push({ id: `edit:${p.id}:${p.updatedAt}`, source: "doc_edit", title: `اقتراح تعديل #${p.number}: ${EDIT_STATUS_AR[p.status].label}`, detail: p.course.code, href: `/document-edits?p=${p.id}`, at: p.updatedAt, real: false });
  }
  for (const t of myTickets ?? []) {
    if (unreadForUser(t)) notes.push({ id: `support:${t.id}:${t.updatedAt}`, source: "support", title: `رد جديد على طلب الدعم #${t.number}`, detail: CATEGORY_AR[t.category], href: "#support", at: t.updatedAt, real: false });
  }
  for (const t of allTickets ?? []) {
    if (unreadForTeam(t)) {
      tasks.push({ id: `support-team:${t.id}`, source: "support", title: `طلب دعم فني من ${t.ownerName}`, detail: CATEGORY_AR[t.category], href: "/support", at: t.updatedAt, real: false });
      notes.push({ id: `support-team:${t.id}:${t.updatedAt}`, source: "support", title: t.status === "new" ? `طلب دعم جديد #${t.number}` : `رد جديد على طلب الدعم #${t.number}`, detail: t.ownerName, href: "/support", at: t.updatedAt, real: false });
    }
  }
  const byDate = (a: WorkItem, b: WorkItem) => (b.at ?? "").localeCompare(a.at ?? "");
  // One entry per id even if two sources report the same thing.
  const unique = (list: WorkItem[]) => [...new Map(list.map((x) => [x.id, x])).values()].sort(byDate);
  return { tasks: unique(tasks), notifications: unique(notes) };
}

export function useMyWork(me: Me | null) {
  const isFaculty = me?.role === "faculty";
  const { data: questions } = useApi<QuestionSummary[]>(me ? "/api/questions" : null, 20000);
  const { data: myCourses } = useApi<Course[]>(isFaculty ? "/api/me/courses" : null, 30000);
  const { data: dash } = useApi<{ programs: ProgramSummary[]; review_queue: number }>(me && !isFaculty ? "/api/dashboard" : null, 30000);
  const { data: emails, reload: reloadEmails } = useApi<EmailNote[]>(me ? "/api/notifications" : null, 30000);
  const { requests, viewer: mdViewer } = useMissingData(me);
  const { reports, viewer: repViewer } = useReports(me);
  const { proposals, viewer: editViewer } = useDocEdits(me);
  const { tickets: myTickets } = useTickets("mine", me);
  const { tickets: allTickets } = useTickets("all", me?.role === "team" ? me : null);
  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    if (!me) return;
    const load = () => setReadIds(readStore.load().read[String(me.id)] ?? []);
    load();
    return readStore.subscribe(load);
  }, [me]);

  const { tasks, notifications } = useMemo(() => collectWork({
    me, questions, myCourses, dash, emails, requests, mdViewer, reports, repViewer, proposals, editViewer, myTickets, allTickets,
  }), [me, questions, myCourses, dash, emails, requests, mdViewer, reports, repViewer, proposals, editViewer, myTickets, allTickets]);

  const isUnread = useCallback((n: WorkItem) => {
    if (n.source === "email") return !(emails ?? []).find((e) => `email:${e.id}` === n.id)?.read;
    // A "new" support request stays new for the team until someone acts on it, so its notice uses local read marks.
    if (n.source === "decision" || n.id.startsWith("support-team:")) return !readIds.includes(n.id);
    return true; // prototype sources only list items not yet opened (their own "seen" marks)
  }, [emails, readIds]);

  /** Opening a notification marks it read where it lives, so the same item is not announced twice. */
  const markRead = useCallback(async (n: WorkItem) => {
    if (!me) return;
    const [kind, id] = n.id.split(":");
    if (n.source === "email") { await api("/api/notifications/read", { method: "POST" }).catch(() => {}); reloadEmails(); return; }
    if (n.source === "decision" || kind === "support-team") {
      const data = readStore.load();
      data.read[String(me.id)] = [...new Set([...(data.read[String(me.id)] ?? []), n.id])];
      readStore.save(data);
      return;
    }
    if (kind === "md" && mdViewer) await missingData.markSeen(id, mdViewer);
    if (kind === "rep" && repViewer) await reportService.markSeen(id, repViewer);
    if (kind === "edit" && editViewer) await docEditService.markSeen(id, editViewer);
    if (kind === "support") await support.markSeen(id, "user");
  }, [me, mdViewer, repViewer, editViewer, reloadEmails]);

  const unreadCount = notifications.filter(isUnread).length;
  return { tasks, notifications, isUnread, markRead, unreadCount, questions, myCourses, dash, requests, reports, proposals };
}
