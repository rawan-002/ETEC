"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Course, Me } from "@/lib/types";
import { mockMissingDataService } from "./mockService";
import { templateById } from "./templates";
import type { MdViewer, MissingDataRequest, MissingDataService, NewRequestInput, ResponsibleRole, SampleInput } from "./types";

export type {
  AttachmentMeta, FieldValue, FormField, FormTemplate, HistoryEntry, MdViewer, MissingDataRequest, MissingDataService,
  NewRequestInput, RequestStatus, ResponsibleRole, SampleInput,
} from "./types";
export { MAX_TEXT, ROLE_AR, STATUS_AR } from "./types";
export {
  canAddNote, canCreate, canEdit, canEscalate, canForward, canReview, canSee, hasUpdate, needsMyAction, nextUp, reviewerRole, TEMPLATES,
  templateById, validate,
} from "./templates";

/** Swap for an API-backed implementation later; the UI only talks to MissingDataService. */
export const missingData: MissingDataService = mockMissingDataService;
export const MISSING_DATA_IS_DEMO = true;

export function viewerFrom(me: Me): MdViewer {
  return { id: me.id, name: me.name, role: me.role, program: me.program };
}

export function useMissingData(me: Me | null) {
  const viewer = useMemo(() => (me ? viewerFrom(me) : null), [me]);
  const [requests, setRequests] = useState<MissingDataRequest[] | null>(null);

  const reload = useCallback(async () => {
    if (viewer) setRequests(await missingData.list(viewer));
  }, [viewer]);

  useEffect(() => {
    reload();
    return missingData.subscribe(reload);
  }, [reload]);

  return { requests, viewer, reload };
}

export function coordinatorOf(course: Course): NewRequestInput["coordinator"] {
  const c = course.teachers?.find((t) => t.is_coordinator);
  return c ? { id: c.user_id, name: c.name } : null;
}

const HEAD_ROLE = { id: 0, name: "رئيس القسم", role: "head" as const };

/** Pick who fills a form on a course: the coordinator for specification data, a teacher for content. */
export function responsibleFor(course: Course, role: ResponsibleRole): NewRequestInput["assignee"] | null {
  if (role === "head" || role === "dean") return role === "head" ? HEAD_ROLE : { id: 0, name: "عميد الكلية", role };
  const teachers = course.teachers ?? [];
  const pick = role === "coordinator"
    ? teachers.find((t) => t.is_coordinator) ?? teachers[0]
    : teachers.find((t) => !t.is_coordinator) ?? teachers[0];
  return pick ? { id: pick.user_id, name: pick.name, role } : null;
}

const SAMPLE_NOTE = "مثال توضيحي لطريقة عمل النموذج، وليس نتيجة تحليل فعلي لملفات المقرر.";

/** Sample requests on the courses that have teachers this term, clearly marked as samples: one waiting
 *  for its assignee per form type, plus two already answered by the coordinator and waiting for the head. */
export function sampleRequests(courses: Course[], program: string): SampleInput[] {
  const offered = courses.filter((c) => c.teachers?.length);
  const out: SampleInput[] = [];
  const due = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
  // The first sample set, keyed by form type (keys must stay stable for browsers that already have them).
  ["credit_hours", "assessment_weights", "clo_assessment", "textbook", "lab_materials"].map(templateById).forEach((t, i) => {
    const c = offered[i % Math.max(offered.length, 1)];
    const assignee = c && responsibleFor(c, t.role);
    if (!c || !assignee) return;
    out.push({
      key: `v1:${t.id}`, course: { id: c.id, code: c.code, title: c.title }, program, templateId: t.id, assignee,
      coordinator: coordinatorOf(c), document: null, questionId: null, dueDate: due(7 + i * 2), note: `${SAMPLE_NOTE} ${t.issue}.`,
    });
  });
  // Head of department: courses that really have no code in the loaded study plan (the request itself is a sample).
  courses.filter((c) => !c.plan_code).slice(0, 3).forEach((c, i) => {
    out.push({
      key: `v3:plan_code:${c.id}`, course: { id: c.id, code: c.code, title: c.title }, program, templateId: "plan_code",
      assignee: HEAD_ROLE, coordinator: coordinatorOf(c), document: null, questionId: null, dueDate: due(10 + i),
      note: `المقرر «${c.title}» مدرج في الخطة الدراسية المحمّلة في النظام بدون رمز${c.spec_code ? `، ووُجد له الرمز ${c.spec_code} في توصيف سابق` : ""}. بيانات الخطة حقيقية، والطلب نفسه مثال تجريبي.`,
    });
  });
  const c = offered[0];
  const coordinator = c && responsibleFor(c, "coordinator");
  if (c) {
    out.push({
      key: "v3:spec_questions", course: { id: c.id, code: c.code, title: c.title }, program, templateId: "spec_questions",
      assignee: HEAD_ROLE, coordinator: coordinatorOf(c), document: null, questionId: null, dueDate: due(6),
      note: `${SAMPLE_NOTE} أسئلة في توصيف المقرر تحتاج قرار رئيس القسم قبل أن يحدّث المنسق التوصيف.`,
    });
  }
  if (c && coordinator) {
    const base = {
      course: { id: c.id, code: c.code, title: c.title }, program, assignee: coordinator, coordinator: coordinatorOf(c),
      document: null, questionId: null, dueDate: due(5),
    };
    const planHours = c.credit_hours ?? 3;
    const oldCode = c.code.replace(/(\d)/, " $1");
    out.push({
      ...base, key: "v2:credit_hours_review", templateId: "credit_hours",
      note: `${SAMPLE_NOTE} مثال: الخطة الدراسية تذكر ${planHours} ساعات معتمدة، والتوصيف يذكر ${planHours + 1} ساعات (3 محاضرة + 2 معمل).`,
      submitted: { byName: coordinator.name, values: {
        lecture: "3", lab: "2", credit: String(planHours), source: "الخطة الدراسية المعتمدة",
        justification: "التوصيف القديم احتسب ساعات المعمل ساعةً معتمدة إضافية؛ المعتمد ما في الخطة الدراسية، وسيُصحَّح التوصيف.",
      } },
    });
    out.push({
      ...base, key: "v2:course_code_review", templateId: "course_code",
      note: `${SAMPLE_NOTE} مثال: رمز المقرر في التوصيف «${oldCode}» بصيغة قديمة، ورمزه في الخطة ${c.code}.`,
      submitted: { byName: coordinator.name, values: {
        plan_code: c.code, spec_code: oldCode, title: c.title, action: "الرمزان لمقرر واحد (رمز قديم)",
        notes: "الرمز في التوصيف من نسخة الخطة السابقة؛ سيُحدَّث في التوصيف القادم.",
      } },
    });
  }
  return out;
}
