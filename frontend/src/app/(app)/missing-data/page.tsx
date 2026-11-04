"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BellRing, Plus } from "lucide-react";
import { useMe } from "@/components/Shell";
import { MdStatusPill, RequestDetail, SampleTag } from "@/components/missingData/RequestDetail";
import { Empty, ErrorNote, Spinner } from "@/components/ui";
import { useApi } from "@/lib/api";
import { fmtDate } from "@/lib/labels";
import type { MdViewer, MissingDataRequest, RequestStatus } from "@/lib/missingData";
import {
  canCreate, coordinatorOf, hasUpdate, missingData, needsMyAction, responsibleFor, ROLE_AR, sampleRequests, STATUS_AR, TEMPLATES,
  templateById, useMissingData,
} from "@/lib/missingData";
import type { Course, CourseDetail, QuestionSummary } from "@/lib/types";

type Filter = "mine" | "all" | RequestStatus;

export default function MissingDataPage() {
  return <Suspense fallback={<Spinner />}><MissingData /></Suspense>;
}

function MissingData() {
  const me = useMe();
  const params = useSearchParams();
  const program = me.program ?? "CS";
  const { data: courses } = useApi<Course[]>(`/api/courses?program=${program}`);
  const { requests, viewer } = useMissingData(me);
  // Teachers start on what waits for them; reviewers and followers start on everything.
  const [filter, setFilter] = useState<Filter>(me.role === "faculty" ? "mine" : "all");
  const [selected, setSelected] = useState<string | null>(params.get("r"));
  const [creating, setCreating] = useState(false);

  // Sample requests on this term's courses, clearly marked as samples; ones already present are skipped.
  useEffect(() => {
    if (courses) missingData.seedSamples(sampleRequests(courses, program));
  }, [courses, program]);

  const shown = useMemo(() => (requests ?? []).filter((r) =>
    filter === "all" ? true : filter === "mine" ? needsMyAction(r, viewer!) || r.assignee.id === me.id : r.status === filter),
  [requests, filter, viewer, me.id]);

  if (!requests || !viewer) return <Spinner />;
  const updates = requests.filter((r) => hasUpdate(r, viewer));
  const current = requests.find((r) => r.id === selected);
  const count = (f: Filter) => (f === "all" ? requests.length : f === "mine"
    ? requests.filter((r) => needsMyAction(r, viewer) || r.assignee.id === me.id).length : requests.filter((r) => r.status === f).length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="h-page">استكمال البيانات الناقصة</h1>
          <p className="muted mt-1">نماذج لاستكمال معلومات أكاديمية ناقصة في ملفات المقررات، تُسند لأستاذ المقرر أو منسقه، ويراجعها رئيس القسم.</p>
        </div>
        {canCreate(viewer) && !creating && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} />طلب استكمال جديد</button>}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
        نسخة تجريبية: الطلبات محفوظة على هذا الجهاز فقط، ولا تُعدّل أي مستند أو قرار حقيقي. الطلبات المعلّمة «مثال تجريبي» توضيحية وليست نتائج تحليل.
        {viewer.role === "team" && (
          <button className="ms-2 font-semibold underline" onClick={() => { missingData.reset(); setSelected(null); }}>إعادة تعيين البيانات التجريبية</button>
        )}
      </div>

      {updates.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 border-royal/30 bg-royal-50 p-4 text-sm text-royal">
          <BellRing size={18} className="shrink-0" />
          <span className="font-semibold">تحديثات جديدة:</span>
          {updates.slice(0, 4).map((r) => (
            <button key={r.id} className="rounded-full bg-white px-3 py-1 text-xs hover:underline" onClick={() => setSelected(r.id)}>
              #{r.number} · {STATUS_AR[r.status].label}
            </button>
          ))}
          {updates.length > 4 && <span className="text-xs">و{updates.length - 4} أخرى</span>}
        </div>
      )}

      {creating && courses && <CreateRequest viewer={viewer} courses={courses} onDone={(id) => { setCreating(false); if (id) { setFilter("all"); setSelected(id); } }} />}

      {requests.length === 0 ? (
        <Empty>لا توجد طلبات استكمال. تظهر الأمثلة بعد أن يختار الأساتذة مقرراتهم لهذا الفصل.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className={`space-y-3 ${current ? "hidden lg:block" : ""}`}>
            <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 text-sm shadow-card">
              {(["mine", "all", "new", "in_progress", "submitted", "needs_revision", "completed"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`rounded-lg px-2.5 py-1.5 ${filter === f ? "bg-navy font-semibold text-white" : "text-ink-soft hover:bg-canvas"}`}>
                  {f === "mine" ? "بانتظاري" : f === "all" ? "الكل" : STATUS_AR[f].label} <span className="opacity-70">({count(f)})</span>
                </button>
              ))}
            </div>
            {shown.length === 0 && <Empty>لا توجد طلبات هنا.</Empty>}
            {shown.map((r) => <RequestCard key={r.id} r={r} viewer={viewer} active={r.id === selected} onOpen={() => setSelected(r.id)} />)}
          </section>
          {current
            ? <RequestDetail key={current.id} r={current} viewer={viewer} onBack={() => setSelected(null)} />
            : <div className="hidden lg:block"><Empty>اختر طلبًا لعرضه.</Empty></div>}
        </div>
      )}
    </div>
  );
}

function RequestCard({ r, viewer, active, onOpen }: { r: MissingDataRequest; viewer: MdViewer; active: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen}
      className={`block w-full rounded-2xl border bg-white p-4 text-right shadow-card transition ${active ? "border-royal ring-2 ring-royal/15" : "border-line hover:border-royal/40"}`}>
      <div className="flex items-start gap-2">
        {hasUpdate(r, viewer) && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-600" aria-label="تحديث جديد" />}
        <span className="flex-1 font-semibold leading-6">#{r.number} · {r.issueTitle}</span>
        <MdStatusPill status={r.status} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
        <span className="ltr">{r.course.code}</span>
        <span>· {r.assignee.name} ({ROLE_AR[r.assignee.role]})</span>
        {r.escalated && <span className="text-red-700">· مُصعّد</span>}
        <SampleTag r={r} />
      </div>
      <div className="mt-1 text-[11px] text-ink-faint">آخر تحديث {fmtDate(r.updatedAt)}{needsMyAction(r, viewer) && " · بانتظار إجرائك"}</div>
    </button>
  );
}

/** Head of department: open a request on one of the department's offered courses. */
function CreateRequest({ viewer, courses, onDone }: { viewer: MdViewer; courses: Course[]; onDone: (id: string | null) => void }) {
  const offered = courses.filter((c) => c.teachers?.length);
  const [courseId, setCourseId] = useState<number | "">(offered[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [assigneeId, setAssigneeId] = useState<number | "">("");
  const [docId, setDocId] = useState<number | "">("");
  const [questionId, setQuestionId] = useState<number | "">("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const template = templateById(templateId);
  // Plan-level forms are the head's own and may concern any course in the plan; the others need a course with teachers.
  const forHead = template.role === "head";
  const choices = forHead ? courses : offered;
  const course = choices.find((c) => c.id === courseId);
  const { data: detail } = useApi<CourseDetail>(course ? `/api/courses/${course.id}` : null);
  const { data: questions } = useApi<QuestionSummary[]>("/api/questions");
  const suggested = forHead ? { id: viewer.id, name: viewer.name, role: "head" as const } : course ? responsibleFor(course, template.role) : null;

  // Re-suggest the responsible person whenever the course or the form type changes.
  useEffect(() => { setAssigneeId(suggested?.id ?? ""); setDocId(""); setQuestionId(""); }, [courseId, templateId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!choices.some((c) => c.id === courseId)) setCourseId(choices[0]?.id ?? ""); }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!courses.length) return <div className="card p-5"><Empty>لا توجد مقررات في قسمك بعد.</Empty></div>;

  const create = async () => {
    const teacher = course?.teachers?.find((t) => t.user_id === assigneeId);
    const assignee = forHead ? suggested : teacher ? { id: teacher.user_id, name: teacher.name, role: template.role } : null;
    if (!course || !assignee) return setErr(forHead ? "اختر المقرر" : "اختر مقررًا له أساتذة، ثم المسؤول");
    setErr(null);
    try {
      const r = await missingData.create(viewer, {
        course: { id: course.id, code: course.code, title: course.title }, program: course.program, templateId,
        assignee, coordinator: coordinatorOf(course),
        document: detail?.documents.find((d) => d.id === docId) ? { id: Number(docId), name: detail.documents.find((d) => d.id === docId)!.filename } : null,
        questionId: questionId === "" ? null : questionId, dueDate: dueDate || null, note,
      });
      onDone(r.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر إنشاء الطلب");
    }
  };

  const courseQuestions = (questions ?? []).filter((q) => q.course.id === courseId);
  return (
    <section className="card space-y-4 p-5">
      <h2 className="font-bold text-navy">طلب استكمال جديد</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cr-course">المقرر <span className="text-red-600">*</span></label>
          <select id="cr-course" className="input" value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.plan_code ?? "بدون رمز"} — {c.title}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cr-template">نوع البيانات الناقصة <span className="text-red-600">*</span></label>
          <select id="cr-template" className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.title} ({ROLE_AR[t.role]})</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cr-assignee">المسؤول عن الاستكمال <span className="text-red-600">*</span></label>
          <select id="cr-assignee" className="input" value={assigneeId} onChange={(e) => setAssigneeId(Number(e.target.value))}>
            {forHead
              ? <option value={viewer.id}>{viewer.name} (أنت)</option>
              : course?.teachers?.map((t) => <option key={t.user_id} value={t.user_id}>{t.name}{t.is_coordinator ? " (منسق)" : ""}</option>)}
          </select>
          <div className="mt-1 text-xs text-ink-faint">المقترح حسب نوع البيانات: {ROLE_AR[template.role]}</div>
        </div>
        <div>
          <label className="label" htmlFor="cr-due">الموعد المطلوب</label>
          <input id="cr-due" type="date" className="input ltr text-right" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="cr-doc">المستند المرتبط</label>
          <select id="cr-doc" className="input" value={docId} onChange={(e) => setDocId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">بدون</option>
            {detail?.documents.filter((d) => d.status !== "duplicate").map((d) => <option key={d.id} value={d.id}>{d.filename}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cr-q">المسألة في مركز القرارات</label>
          <select id="cr-q" className="input" value={questionId} onChange={(e) => setQuestionId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">بدون</option>
            {courseQuestions.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="cr-note">وصف المشكلة</label>
          <textarea id="cr-note" className="input min-h-20" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={template.issue} />
        </div>
      </div>
      <ErrorNote message={err} />
      <div className="flex gap-2">
        <button className="btn-primary" onClick={create}>إنشاء الطلب وإسناده</button>
        <button className="btn-ghost" onClick={() => onDone(null)}>إلغاء</button>
      </div>
    </section>
  );
}
