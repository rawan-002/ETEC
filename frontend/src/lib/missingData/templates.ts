import type { FieldValue, FormTemplate, MdViewer, MissingDataRequest } from "./types";
import { ROLE_AR } from "./types";

const num = (v: FieldValue) => (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

/** Forms for the kinds of missing data the decision center reports. Coordinator forms touch the
 *  specification; teacher forms touch what is actually taught. */
export const TEMPLATES: FormTemplate[] = [
  {
    id: "course_code",
    title: "تأكيد رمز المقرر واسمه",
    role: "coordinator",
    issue: "رمز المقرر أو اسمه في التوصيف يختلف عن الخطة الدراسية",
    fields: [
      { key: "plan_code", label: "الرمز في الخطة الدراسية", type: "text", required: true },
      { key: "spec_code", label: "الرمز المكتوب في التوصيف", type: "text", required: true },
      { key: "title", label: "اسم المقرر المعتمد", type: "text", required: true },
      { key: "action", label: "الإجراء المقترح", type: "select", required: true,
        options: ["تعديل التوصيف ليطابق الخطة", "الرمزان لمقرر واحد (رمز قديم)", "يحتاج قرار مجلس القسم"] },
      { key: "notes", label: "توضيح", type: "textarea", required: false },
      { key: "proof", label: "دليل (صفحة الخطة أو التوصيف)", type: "file", required: false },
    ],
  },
  {
    id: "credit_hours",
    title: "تأكيد الساعات المعتمدة وساعات الاتصال",
    role: "coordinator",
    issue: "الساعات في توصيف المقرر لا تطابق الخطة الدراسية أو لا يتسق مجموعها",
    fields: [
      { key: "lecture", label: "ساعات المحاضرات الأسبوعية", type: "number", required: true, min: 0, max: 10 },
      { key: "lab", label: "ساعات المعمل الأسبوعية", type: "number", required: true, min: 0, max: 10 },
      { key: "credit", label: "الساعات المعتمدة", type: "number", required: true, min: 1, max: 6 },
      { key: "source", label: "مصدر الساعات المعتمدة", type: "select", required: true, options: ["الخطة الدراسية المعتمدة", "قرار مجلس القسم", "توصيف البرنامج"] },
      { key: "justification", label: "توضيح سبب الاختلاف", type: "textarea", required: false },
      { key: "proof", label: "دليل (قرار أو صفحة الخطة)", type: "file", required: false },
    ],
  },
  {
    id: "assessment_weights",
    title: "استكمال أوزان التقييم",
    role: "coordinator",
    issue: "أوزان التقييم في التوصيف لا يساوي مجموعها 100%",
    fields: [
      { key: "midterm", label: "الاختبار النصفي (%)", type: "number", required: true, min: 0, max: 100 },
      { key: "final", label: "الاختبار النهائي (%)", type: "number", required: true, min: 0, max: 100 },
      { key: "coursework", label: "الأعمال الفصلية والواجبات (%)", type: "number", required: true, min: 0, max: 100 },
      { key: "lab", label: "التقييم العملي (%)", type: "number", required: false, min: 0, max: 100 },
      { key: "notes", label: "ملاحظات", type: "textarea", required: false },
    ],
    check: (v) => {
      const parts = ["midterm", "final", "coursework", "lab"].map((k) => num(v[k])).filter((n) => !Number.isNaN(n));
      const total = parts.reduce((s, n) => s + n, 0);
      return parts.length && total !== 100 ? `مجموع الأوزان ${total}% ويجب أن يساوي 100%` : null;
    },
  },
  {
    id: "clo_assessment",
    title: "ربط مخرج تعلم بأداة تقييم",
    role: "coordinator",
    issue: "مخرج تعلم في التوصيف لا تقيسه أي أداة تقييم مذكورة",
    fields: [
      { key: "clo", label: "مخرج التعلم", type: "select", required: true, options: ["CLO1", "CLO2", "CLO3", "CLO4", "CLO5"] },
      { key: "tool", label: "أداة التقييم التي تقيسه", type: "select", required: true, options: ["الاختبار النصفي", "الاختبار النهائي", "واجب", "مشروع", "تقييم عملي"] },
      { key: "evidence_desc", label: "كيف تقيس الأداة هذا المخرج؟", type: "textarea", required: true },
      { key: "sample", label: "نموذج من الأداة (سؤال أو واجب)", type: "file", required: false },
    ],
  },
  {
    id: "textbook",
    title: "تأكيد المرجع الرئيس المستخدم فعليًا",
    role: "teacher",
    issue: "المرجع الرئيس في التوصيف يختلف عمّا تستخدمه مواد المقرر",
    fields: [
      { key: "title", label: "عنوان المرجع المستخدم", type: "text", required: true },
      { key: "author", label: "المؤلف", type: "text", required: true },
      { key: "edition", label: "الطبعة", type: "text", required: false },
      { key: "year", label: "سنة النشر", type: "number", required: false, min: 1950, max: 2030 },
      { key: "cover", label: "صورة غلاف أو صفحة المرجع", type: "file", required: false },
    ],
  },
  {
    id: "lab_materials",
    title: "استكمال بيانات المادة العملية",
    role: "teacher",
    issue: "المادة العملية المرفوعة لا تغطي ساعات المعمل المذكورة في التوصيف",
    fields: [
      { key: "count", label: "عدد التجارب أو المعامل المنفذة", type: "number", required: true, min: 0, max: 30 },
      { key: "topics", label: "موضوعات المعامل", type: "textarea", required: true },
      { key: "last_date", label: "تاريخ آخر معمل منفذ", type: "date", required: false },
      { key: "manual", label: "دليل المعمل", type: "file", required: true },
    ],
  },
  {
    id: "plan_code",
    title: "استكمال رمز مقرر في الخطة الدراسية",
    role: "head",
    issue: "المقرر مدرج في الخطة الدراسية بدون رمز",
    fields: [
      { key: "code", label: "الرمز المعتمد للمقرر", type: "text", required: true, help: "مثل CS1263",
        pattern: "^[A-Za-z]{2,4}\\s?\\d{3,4}$", patternHint: "الصيغة: حروف القسم ثم أرقام، مثل CS1263" },
      { key: "source", label: "مصدر الرمز", type: "select", required: true, options: ["الخطة الدراسية المعتمدة", "توصيف سابق للمقرر", "قرار مجلس القسم", "رمز جديد"] },
      { key: "council", label: "رقم قرار مجلس القسم وتاريخه", type: "text", required: false },
      { key: "notes", label: "ملاحظات", type: "textarea", required: false },
      { key: "proof", label: "دليل (صفحة الخطة أو القرار)", type: "file", required: false },
    ],
  },
  {
    id: "spec_questions",
    title: "أسئلة متعلقة بتوصيف المقرر",
    role: "head",
    issue: "أسئلة في توصيف المقرر تحتاج قرار رئيس القسم",
    fields: [
      { key: "prerequisite", label: "المتطلب السابق المعتمد بعد إلغاء مقرر أساسيات التحول الرقمي", type: "select", required: true,
        options: ["الذكاء الاصطناعي التطبيقي", "لا يوجد متطلب سابق", "مقرر آخر (يُذكر في الملاحظات)"] },
      { key: "practical", label: "هل للمقرر جزء عملي (ساعات معمل)؟", type: "select", required: true, options: ["نعم", "لا"] },
      { key: "credit", label: "الساعات المعتمدة المعتمدة للمقرر", type: "number", required: true, min: 1, max: 6 },
      { key: "spec_owner", label: "المسؤول عن تحديث التوصيف", type: "select", required: true, options: ["منسق المقرر", "لجنة الخطط", "رئيس القسم"] },
      { key: "notes", label: "توجيهات للمنسق", type: "textarea", required: false },
      { key: "decision", label: "قرار مجلس القسم (إن وجد)", type: "file", required: false },
    ],
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

/** Full check before sending: required fields, number ranges and the template's own rule. */
export function validate(t: FormTemplate, values: Record<string, FieldValue>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of t.fields) {
    const v = values[f.key];
    const empty = v == null || (typeof v === "string" && v.trim() === "");
    if (empty) {
      if (f.required) errors[f.key] = f.type === "file" ? "أرفق ملفًا" : "حقل إلزامي";
      continue;
    }
    if (f.pattern && typeof v === "string" && !new RegExp(f.pattern).test(v.trim())) {
      errors[f.key] = f.patternHint ?? "صيغة غير صحيحة";
      continue;
    }
    if (f.type === "number") {
      const n = num(v);
      if (Number.isNaN(n)) errors[f.key] = "أدخل رقمًا";
      else if ((f.min != null && n < f.min) || (f.max != null && n > f.max)) errors[f.key] = `القيمة بين ${f.min} و${f.max}`;
    }
  }
  const rule = !Object.keys(errors).length && t.check?.(values);
  if (rule) errors._form = rule;
  return errors;
}

// ---------- permissions (display only; the real rules will live in the backend) ----------

const isHeadOf = (r: MissingDataRequest, v: MdViewer) => v.role === "head" && v.program === r.program;

/** Head and dean requests belong to the role, not to one person. */
const isAssignee = (r: MissingDataRequest, v: MdViewer) =>
  r.assignee.role === "head" ? isHeadOf(r, v) : r.assignee.role === "dean" ? v.role === "dean" : r.assignee.id === v.id;

/** Who reviews a submitted request: the level above whoever filled it. The dean's own answers need no review. */
export function reviewerRole(r: MissingDataRequest): "head" | "dean" | null {
  if (r.assignee.role === "dean") return null;
  return r.assignee.role === "head" || r.escalated ? "dean" : "head";
}

/** The next level up for "forward to a higher authority": teacher → coordinator → head → dean. */
export function nextUp(r: MissingDataRequest): MissingDataRequest["assignee"] | null {
  switch (r.assignee.role) {
    case "teacher":
      return r.coordinator && r.coordinator.id !== r.assignee.id
        ? { id: r.coordinator.id, name: r.coordinator.name, role: "coordinator" }
        : { id: 0, name: ROLE_AR.head, role: "head" };
    case "coordinator":
      return { id: 0, name: ROLE_AR.head, role: "head" };
    case "head":
      return { id: 0, name: ROLE_AR.dean, role: "dean" };
    default:
      return null;
  }
}

export function canSee(r: MissingDataRequest, v: MdViewer): boolean {
  if (isAssignee(r, v) || r.participants?.includes(v.id)) return true;
  if (v.role === "head") return v.program === r.program;
  if (v.role === "dean") return reviewerRole(r) === "dean";
  return v.role === "team";
}

export const canEdit = (r: MissingDataRequest, v: MdViewer) =>
  isAssignee(r, v) && (r.status === "new" || r.status === "in_progress" || r.status === "needs_revision");

export const canForward = (r: MissingDataRequest, v: MdViewer) => canEdit(r, v) && nextUp(r) !== null;

/** The head reviews what teachers and coordinators send; the dean reviews escalations and the head's answers. */
export const canReview = (r: MissingDataRequest, v: MdViewer) =>
  r.status === "submitted" && (reviewerRole(r) === "dean" ? v.role === "dean" : isHeadOf(r, v));

export const canEscalate = (r: MissingDataRequest, v: MdViewer) =>
  r.status === "submitted" && reviewerRole(r) === "head" && isHeadOf(r, v);

export const canCreate = (v: MdViewer) => v.role === "head" && !!v.program;

/** The project team follows technical and exceptional cases: notes only, no academic decisions. */
export const canAddNote = (v: MdViewer) => v.role === "team";

/** Requests waiting for this user to act (drives the menu badge). */
export const needsMyAction = (r: MissingDataRequest, v: MdViewer) =>
  (canEdit(r, v) && r.status !== "in_progress") || canReview(r, v);

/** Changed by someone else since this user last opened it. */
export const hasUpdate = (r: MissingDataRequest, v: MdViewer) =>
  canSee(r, v) && r.updatedAt > (r.seenBy[String(v.id)] ?? "") && r.history[r.history.length - 1]?.actorName !== v.name;
