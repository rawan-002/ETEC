/**
 * Document edit proposals (prototype). Each proposal compares an excerpt of a course document with a revised
 * version built from decisions. Excerpts are illustrative (the real file is never read or changed here), and
 * reviews, versions and downloads stay in this browser.
 */
import { cleanText, createDemoStore, historyEntry, iso, uid, type HistoryEntry } from "@/lib/demo/store";

export type EditStatus = "pending_review" | "approved" | "rejected" | "needs_changes";

export interface EditChange {
  id: string;
  before: string;
  after: string;
  reason: string;
  /** The decision the change applies; `questionId` links a real decision-center question. */
  decision: { text: string; questionId: number | null; real: boolean };
}

export interface EditVersion {
  version: number;
  at: string;
  by: string;
  proposed: string;
  changes: EditChange[];
  note: string | null;
}

export interface EditProposal {
  id: string;
  number: number;
  program: string;
  course: { id: number; code: string; title: string };
  documentName: string;
  original: string;
  versions: EditVersion[];
  status: EditStatus;
  reviewNote: string | null;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
  seenBy: Record<string, string>;
}

export interface EditViewer {
  id: number;
  name: string;
  role: "dean" | "head" | "faculty" | "team";
  program: string | null;
  /** Courses the viewer teaches, and the subset they coordinate. */
  courseIds: number[];
  coordinates: number[];
}

export const EDIT_STATUS_AR: Record<EditStatus, { label: string; cls: string }> = {
  pending_review: { label: "بانتظار المراجعة", cls: "bg-amber-50 text-amber-800" },
  approved: { label: "معتمد", cls: "bg-leaf-50 text-leaf" },
  rejected: { label: "مرفوض", cls: "bg-slate-100 text-ink-soft" },
  needs_changes: { label: "يحتاج تعديلًا", cls: "bg-red-50 text-red-700" },
};

// ---------- permissions (display only) ----------

export const canSeeEdit = (p: EditProposal, v: EditViewer) =>
  v.role === "dean" || v.role === "team" || (v.role === "head" && v.program === p.program) || v.courseIds.includes(p.course.id);
/** The course coordinator (specification owner) or the head of department decides on a proposal. */
export const canReviewEdit = (p: EditProposal, v: EditViewer) =>
  p.status === "pending_review" && ((v.role === "head" && v.program === p.program) || v.coordinates.includes(p.course.id));
export const canReviseEdit = (p: EditProposal, v: EditViewer) =>
  p.status === "needs_changes" && ((v.role === "head" && v.program === p.program) || v.coordinates.includes(p.course.id));
export const editNeedsMe = (p: EditProposal, v: EditViewer) => canReviewEdit(p, v) || canReviseEdit(p, v);
export const editHasUpdate = (p: EditProposal, v: EditViewer) =>
  canSeeEdit(p, v) && p.updatedAt > (p.seenBy[String(v.id)] ?? "") && p.history[p.history.length - 1]?.actorName !== v.name;
export const latest = (p: EditProposal) => p.versions[p.versions.length - 1];

// ---------- storage ----------

interface Stored { version: 1; nextNumber: number; proposals: EditProposal[]; seeded: number[] }
const store = createDemoStore<Stored>("aq.doc-edits.demo.v1", () => ({ version: 1, nextNumber: 1, proposals: [], seeded: [] }));

export interface NewProposal {
  program: string;
  course: EditProposal["course"];
  documentName: string;
  original: string;
  changes: Omit<EditChange, "id">[];
}

/** Apply each change (a whole line or phrase) to the original text. */
export function applyChanges(original: string, changes: Omit<EditChange, "id">[]): string {
  return changes.reduce((text, c) => (c.before && text.includes(c.before) ? text.replace(c.before, c.after) : `${text}\n${c.after}`), original);
}

function act(id: string, v: EditViewer, allowed: (p: EditProposal) => boolean, change: (p: EditProposal) => string, note: string | null = null) {
  const data = store.load();
  const p = data.proposals.find((x) => x.id === id);
  if (!p || !canSeeEdit(p, v)) throw new Error("الاقتراح غير موجود");
  if (!allowed(p)) throw new Error("هذا الإجراء غير متاح لك في حالة الاقتراح الحالية");
  const action = change(p);
  p.history.push(historyEntry(v.name, action, note));
  p.updatedAt = iso();
  p.seenBy[String(v.id)] = p.updatedAt;
  store.save(data);
  return p;
}

export const docEditService = {
  async list(v: EditViewer) {
    return store.load().proposals.filter((p) => canSeeEdit(p, v)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async seed(items: NewProposal[]) {
    const data = store.load();
    const fresh = items.filter((i) => !data.seeded.includes(i.course.id));
    if (!fresh.length) return;
    for (const i of fresh) {
      const at = iso();
      const changes = i.changes.map((c) => ({ ...c, id: uid() }));
      data.proposals.push({
        id: uid(), number: data.nextNumber++, program: i.program, course: i.course, documentName: i.documentName, original: i.original,
        versions: [{ version: 1, at, by: "التعديل المقترح (محاكاة)", proposed: applyChanges(i.original, i.changes), changes, note: null }],
        status: "pending_review", reviewNote: null, createdAt: at, updatedAt: at, seenBy: {},
        history: [historyEntry("بيانات تجريبية", `أُنشئ اقتراح تعديل يتضمن ${changes.length} تعديلات`)],
      });
      data.seeded.push(i.course.id);
    }
    store.save(data);
  },

  async approve(id: string, v: EditViewer, note: string) {
    const text = cleanText(note, { what: "الملاحظة" });
    return act(id, v, (p) => canReviewEdit(p, v), (p) => { p.status = "approved"; p.reviewNote = text; return `اعتمد النسخة ${latest(p).version}`; }, text);
  },

  async reject(id: string, v: EditViewer, note: string) {
    const text = cleanText(note, { required: true, what: "سبب الرفض" });
    return act(id, v, (p) => canReviewEdit(p, v), (p) => { p.status = "rejected"; p.reviewNote = text; return "رفض الاقتراح"; }, text);
  },

  async requestChanges(id: string, v: EditViewer, note: string) {
    const text = cleanText(note, { required: true, what: "التعديل المطلوب" });
    return act(id, v, (p) => canReviewEdit(p, v), (p) => { p.status = "needs_changes"; p.reviewNote = text; return "طلب تعديل الاقتراح"; }, text);
  },

  /** Simulated revision: a new version that records the reviewer's request; nothing is generated by AI. */
  async revise(id: string, v: EditViewer, edited: string) {
    const text = cleanText(edited, { required: true, max: 20000, what: "النص المعدّل" })!;
    return act(id, v, (p) => canReviseEdit(p, v), (p) => {
      const prev = latest(p);
      p.versions.push({ version: prev.version + 1, at: iso(), by: v.name, proposed: text, changes: prev.changes, note: p.reviewNote });
      p.status = "pending_review";
      return `أعدّ النسخة ${prev.version + 1} استجابةً لطلب التعديل`;
    });
  },

  async markSeen(id: string, v: EditViewer) {
    const data = store.load();
    const p = data.proposals.find((x) => x.id === id);
    if (!p) return;
    p.seenBy[String(v.id)] = iso();
    store.save(data);
  },

  reset: () => store.reset(),
  subscribe: (cb: () => void) => store.subscribe(cb),
};
