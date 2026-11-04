/**
 * Gap-analysis reports (prototype). A report is a snapshot built in the browser from the course's real data
 * (missing components, document notes, decision-center questions) plus clearly marked sample findings.
 * Reviews, approvals and re-analysis are simulated and stored in this browser only.
 */
import type { AttachmentMeta } from "@/lib/support/types";
import { cleanText, createDemoStore, historyEntry, iso, uid, type HistoryEntry } from "@/lib/demo/store";

export type ReportStatus = "head_review" | "reanalysis" | "dean_review" | "returned" | "approved";
export type FindingSource = "real_question" | "real_completeness" | "real_finding" | "demo";
export type Verdict = "pending" | "agreed" | "disputed";

export interface Finding {
  /** Stable across re-analysis, so changes between versions can be listed. */
  key: string;
  source: FindingSource;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence: { source: string; quote: string }[];
  link: string | null;
  verdict: Verdict;
  comment: string | null;
}

export interface ReportVersion {
  version: number;
  at: string;
  changes: string[];
}

export interface GapReport {
  id: string;
  number: number;
  program: string;
  course: { id: number; code: string; title: string };
  status: ReportStatus;
  findings: Finding[];
  extraEvidence: { file: AttachmentMeta | null; note: string | null; by: string; at: string }[];
  headSummary: string | null;
  deanNote: string | null;
  versions: ReportVersion[];
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
  seenBy: Record<string, string>;
}

export interface ReportViewer {
  id: number;
  name: string;
  role: "dean" | "head" | "faculty" | "team";
  program: string | null;
  courseIds: number[];
}

export const STATUS_AR: Record<ReportStatus, { label: string; cls: string }> = {
  head_review: { label: "بانتظار مراجعة رئيس القسم", cls: "bg-amber-50 text-amber-800" },
  reanalysis: { label: "إعادة تحليل مطلوبة", cls: "bg-sky-50 text-royal" },
  dean_review: { label: "بانتظار اعتماد العميد", cls: "bg-royal-50 text-royal" },
  returned: { label: "أُعيد للتعديل", cls: "bg-red-50 text-red-700" },
  approved: { label: "معتمد نهائيًا", cls: "bg-leaf-50 text-leaf" },
};

export const SOURCE_AR: Record<FindingSource, string> = {
  real_question: "من مركز القرارات",
  real_completeness: "من حالة اكتمال الملف",
  real_finding: "من فحص المستندات",
  demo: "مثال تجريبي",
};

export const SEVERITY_AR = { high: "عالية", medium: "متوسطة", low: "منخفضة" } as const;

// ---------- permissions (display only; real rules belong to the backend) ----------

const isHeadOf = (r: GapReport, v: ReportViewer) => v.role === "head" && v.program === r.program;

export const canSeeReport = (r: GapReport, v: ReportViewer) =>
  isHeadOf(r, v) || v.role === "dean" || v.role === "team" || v.courseIds.includes(r.course.id);
export const canHeadReview = (r: GapReport, v: ReportViewer) => isHeadOf(r, v) && (r.status === "head_review" || r.status === "returned");
export const canRunReanalysis = (r: GapReport, v: ReportViewer) => isHeadOf(r, v) && r.status === "reanalysis";
export const canDeanDecide = (r: GapReport, v: ReportViewer) => v.role === "dean" && r.status === "dean_review";
export const canCreateReport = (v: ReportViewer) => v.role === "head" && !!v.program;
export const reportNeedsMe = (r: GapReport, v: ReportViewer) => canHeadReview(r, v) || canRunReanalysis(r, v) || canDeanDecide(r, v);
export const reportHasUpdate = (r: GapReport, v: ReportViewer) =>
  canSeeReport(r, v) && r.updatedAt > (r.seenBy[String(v.id)] ?? "") && r.history[r.history.length - 1]?.actorName !== v.name;

// ---------- storage ----------

interface Stored { version: 1; nextNumber: number; reports: GapReport[]; seeded: number[] }
const store = createDemoStore<Stored>("aq.reports.demo.v1", () => ({ version: 1, nextNumber: 1, reports: [], seeded: [] }));

function act(id: string, v: ReportViewer, allowed: (r: GapReport) => boolean, change: (r: GapReport) => string, note: string | null = null) {
  const data = store.load();
  const r = data.reports.find((x) => x.id === id);
  if (!r || !canSeeReport(r, v)) throw new Error("التقرير غير موجود");
  if (!allowed(r)) throw new Error("هذا الإجراء غير متاح لك في حالة التقرير الحالية");
  const action = change(r);
  r.history.push(historyEntry(v.name, action, note));
  r.updatedAt = iso();
  r.seenBy[String(v.id)] = r.updatedAt;
  store.save(data);
  return r;
}

function newReport(data: Stored, course: GapReport["course"], program: string, findings: Finding[], by: string): GapReport {
  const at = iso();
  return {
    id: uid(), number: data.nextNumber++, program, course, status: "head_review", findings, extraEvidence: [], headSummary: null,
    deanNote: null, createdAt: at, updatedAt: at, seenBy: {},
    versions: [{ version: 1, at, changes: [`النسخة الأولى: ${findings.length} نتيجة`] }],
    history: [historyEntry(by, "أنشأ التقرير من بيانات المقرر الحالية")],
  };
}

/** Lists what changed between two finding sets; disputed sample findings are revised to show the effect of a review. */
function reconcile(previous: Finding[], fresh: Finding[]): { findings: Finding[]; changes: string[] } {
  const changes: string[] = [];
  const old = new Map(previous.map((f) => [f.key, f]));
  const out: Finding[] = [];
  for (const f of fresh) {
    const before = old.get(f.key);
    if (!before) {
      changes.push(`أُضيفت: ${f.title}`);
      out.push(f);
      continue;
    }
    old.delete(f.key);
    if (before.verdict === "disputed" && f.source === "demo") {
      changes.push(`عُدّلت بعد اعتراض رئيس القسم: ${f.title} (خُفّضت الأولوية)`);
      out.push({ ...f, severity: "low", detail: `${f.detail}\n(عُدّلت هذه النتيجة التجريبية بعد الاعتراض: ${before.comment ?? "دون تعليق"})`, verdict: "pending", comment: null });
    } else {
      if (before.detail !== f.detail) changes.push(`تغيّرت: ${f.title}`);
      out.push({ ...f, verdict: before.verdict, comment: before.comment });
    }
  }
  for (const gone of old.values()) changes.push(`حُذفت (لم تعد قائمة): ${gone.title}`);
  return { findings: out, changes: changes.length ? changes : ["لا تغييرات في النتائج"] };
}

export const reportService = {
  async list(v: ReportViewer) {
    return store.load().reports.filter((r) => canSeeReport(r, v)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async create(v: ReportViewer, course: GapReport["course"], program: string, findings: Finding[]) {
    if (!canCreateReport(v) || v.program !== program) throw new Error("ينشئ التقارير رئيس القسم المختص");
    const data = store.load();
    const r = newReport(data, course, program, findings, v.name);
    data.reports.push(r);
    store.save(data);
    return r;
  },

  /** One sample report per course, the first time the course is seen. */
  async seed(items: { course: GapReport["course"]; program: string; findings: Finding[] }[]) {
    const data = store.load();
    const fresh = items.filter((i) => !data.seeded.includes(i.course.id));
    if (!fresh.length) return;
    fresh.forEach((i) => {
      data.reports.push(newReport(data, i.course, i.program, i.findings, "بيانات تجريبية"));
      data.seeded.push(i.course.id);
    });
    store.save(data);
  },

  async reviewFinding(id: string, v: ReportViewer, key: string, verdict: Verdict, comment: string) {
    const text = cleanText(comment, { required: verdict === "disputed", what: "سبب الاعتراض" });
    return act(id, v, (r) => canHeadReview(r, v), (r) => {
      const f = r.findings.find((x) => x.key === key);
      if (!f) throw new Error("النتيجة غير موجودة");
      f.verdict = verdict;
      f.comment = text;
      return `${verdict === "agreed" ? "وافق على" : verdict === "disputed" ? "اعترض على" : "أعاد فتح"} النتيجة: ${f.title}`;
    }, text);
  },

  async addEvidence(id: string, v: ReportViewer, file: AttachmentMeta | null, note: string) {
    const text = cleanText(note, { what: "الملاحظة" });
    if (!file && !text) throw new Error("أرفق دليلًا أو اكتب ملاحظة");
    return act(id, v, (r) => canHeadReview(r, v), (r) => {
      r.extraEvidence.push({ file: file && { name: file.name, size: file.size, type: file.type }, note: text, by: v.name, at: iso() });
      return file ? `أضاف دليلًا: ${file.name}` : "أضاف ملاحظة داعمة";
    }, text);
  },

  async requestReanalysis(id: string, v: ReportViewer, note: string) {
    const text = cleanText(note, { required: true, what: "سبب طلب إعادة التحليل" });
    return act(id, v, (r) => canHeadReview(r, v), (r) => {
      r.status = "reanalysis";
      return "طلب إعادة التحليل";
    }, text);
  },

  /** Simulated re-analysis: rebuild from the course's current data and record what changed. */
  async completeReanalysis(id: string, v: ReportViewer, fresh: Finding[]) {
    return act(id, v, (r) => canRunReanalysis(r, v), (r) => {
      const { findings, changes } = reconcile(r.findings, fresh);
      r.findings = findings;
      r.versions.push({ version: r.versions.length + 1, at: iso(), changes });
      r.status = "head_review";
      return `أعاد التحليل (محاكاة) — النسخة ${r.versions.length}`;
    });
  },

  async submitToDean(id: string, v: ReportViewer, summary: string) {
    const text = cleanText(summary, { what: "ملخص المراجعة" });
    return act(id, v, (r) => canHeadReview(r, v), (r) => {
      const pending = r.findings.filter((f) => f.verdict === "pending").length;
      if (pending) throw new Error(`راجع كل النتائج أولًا (${pending} بدون موافقة أو اعتراض)`);
      r.headSummary = text;
      r.status = "dean_review";
      return "وافق على النتائج ورفع التقرير للعميد";
    }, text);
  },

  async deanApprove(id: string, v: ReportViewer, note: string) {
    const text = cleanText(note, { what: "الملاحظة" });
    return act(id, v, (r) => canDeanDecide(r, v), (r) => {
      r.status = "approved";
      r.deanNote = text;
      return "اعتمد التقرير النهائي";
    }, text);
  },

  async deanReturn(id: string, v: ReportViewer, note: string) {
    const text = cleanText(note, { required: true, what: "المطلوب تعديله" });
    return act(id, v, (r) => canDeanDecide(r, v), (r) => {
      r.status = "returned";
      r.deanNote = text;
      return "أعاد التقرير للتعديل";
    }, text);
  },

  async markSeen(id: string, v: ReportViewer) {
    const data = store.load();
    const r = data.reports.find((x) => x.id === id);
    if (!r) return;
    r.seenBy[String(v.id)] = iso();
    store.save(data);
  },

  reset: () => store.reset(),
  subscribe: (cb: () => void) => store.subscribe(cb),
};
