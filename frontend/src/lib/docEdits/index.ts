"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { escapeHtml, prototypeHtml } from "@/lib/demo/store";
import type { Course, Me, QuestionSummary } from "@/lib/types";
import type { EditProposal, EditViewer, NewProposal } from "./service";
import { docEditService, latest } from "./service";

export type { EditChange, EditProposal, EditStatus, EditVersion, EditViewer, NewProposal } from "./service";
export {
  applyChanges, canReviewEdit, canReviseEdit, canSeeEdit, docEditService, EDIT_STATUS_AR, editHasUpdate, editNeedsMe, latest,
} from "./service";

/** An illustrative specification excerpt for the course, with changes tied to decisions.
 *  Real approved decisions on the course are referenced when they exist. */
export function sampleProposal(c: Course, questions: QuestionSummary[]): NewProposal {
  const ch = c.credit_hours ?? 3;
  const original = [
    `Course Title: ${c.title}`,
    `Course Code: ${c.code}`,
    `Credit Hours: ${ch + 1} (3 lecture, 2 lab)`,
    "Assessment: Midterm Exam 30%; Lab assignments 20%; Final Exam 40%",
    "Prerequisites: Fundamentals of Digital Transformation",
    "Main textbook: Computer Science: An Overview, Brookshear.",
  ].join("\n");
  const approved = questions.filter((q) => q.course.id === c.id && q.status === "approved");
  const ref = (category: string, fallback: string) => {
    const q = approved.find((x) => x.category === category);
    return q ? { text: q.title, questionId: q.id, real: true } : { text: fallback, questionId: null, real: false };
  };
  return {
    program: c.program, course: { id: c.id, code: c.code, title: c.title }, documentName: `توصيف المقرر ${c.code} (مقتطف تجريبي)`, original,
    changes: [
      { before: `Credit Hours: ${ch + 1} (3 lecture, 2 lab)`, after: `Credit Hours: ${ch} (2 lecture, 2 lab)`,
        reason: `مواءمة الساعات المعتمدة مع الخطة الدراسية (${ch} ساعات).`, decision: ref("credit_hours", "مثال: اعتماد ساعات الخطة الدراسية") },
      { before: "Assessment: Midterm Exam 30%; Lab assignments 20%; Final Exam 40%", after: "Assessment: Midterm Exam 30%; Lab assignments 20%; Quizzes 10%; Final Exam 40%",
        reason: "استكمال أوزان التقييم إلى 100% بإضافة الاختبارات القصيرة.", decision: ref("assessment_weights", "مثال: إضافة اختبارات قصيرة بوزن 10%") },
      { before: "Prerequisites: Fundamentals of Digital Transformation", after: "Prerequisites: Applied Artificial Intelligence",
        reason: "المتطلب السابق أُلغي من الخطة وحلّ محله مقرر الذكاء الاصطناعي التطبيقي (قرار الكلية).", decision: ref("prerequisite", "قرار الكلية: إحلال الذكاء الاصطناعي التطبيقي") },
    ],
  };
}

export function useDocEdits(me: Me | null) {
  const { data: myCourses } = useApi<Course[]>(me?.role === "faculty" ? "/api/me/courses" : null);
  const viewer = useMemo<EditViewer | null>(() => (me ? {
    id: me.id, name: me.name, role: me.role, program: me.program,
    courseIds: (myCourses ?? []).map((c) => c.id), coordinates: (myCourses ?? []).filter((c) => c.is_coordinator).map((c) => c.id),
  } : null), [me, myCourses]);
  const [proposals, setProposals] = useState<EditProposal[] | null>(null);
  const reload = useCallback(async () => { if (viewer) setProposals(await docEditService.list(viewer)); }, [viewer]);
  useEffect(() => { reload(); return docEditService.subscribe(reload); }, [reload]);
  return { proposals, viewer };
}

export function proposalHtml(p: EditProposal): string {
  const v = latest(p);
  const changes = v.changes.map((c) => `<tr><td><del>${escapeHtml(c.before)}</del></td><td><ins>${escapeHtml(c.after)}</ins></td>
<td>${escapeHtml(c.reason)}</td><td>${escapeHtml(c.decision.text)}${c.decision.real ? "" : ' <span class="muted">(مثال)</span>'}</td></tr>`).join("");
  return prototypeHtml(`${p.documentName} — النسخة ${v.version}`, `
<h1>${escapeHtml(p.documentName)} — النسخة المعتمدة ${v.version}</h1>
<p class="muted">المستند الحقيقي في المنصة لم يُعدَّل ولم يُستبدل. هذه نسخة تجريبية للمعاينة فقط.</p>
<h2>النص بعد التعديل</h2><pre dir="ltr" style="white-space:pre-wrap;background:#F6F8FB;padding:12px;border-radius:12px">${escapeHtml(v.proposed)}</pre>
<h2>التعديلات وأسبابها</h2><table><tr><th>قبل</th><th>بعد</th><th>السبب</th><th>القرار المستند إليه</th></tr>${changes}</table>`);
}
