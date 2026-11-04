/**
 * Course-page prototype data: file review requests and simulated re-analysis runs.
 * Verification results themselves are derived from real backend data (see `checkDocuments`);
 * only the requests and runs recorded here are prototype-only.
 */
import { cleanText, createDemoStore, iso, uid } from "@/lib/demo/store";
import type { CourseDetail, Doc } from "@/lib/types";

export type CheckLevel = "ok" | "warn" | "error" | "human";

export interface DocCheck {
  doc: Doc;
  level: CheckLevel;
  label: string;
  reason: string;
  /** Superseded by a newer upload of the same component. */
  superseded: boolean;
}

/** Verification derived only from what the backend recorded when the file was processed. */
export function checkDocuments(c: CourseDetail): DocCheck[] {
  const newest: Record<string, string> = {};
  for (const d of c.documents) {
    if (d.status === "classified" && d.component && (!newest[d.component] || d.uploaded_at > newest[d.component])) newest[d.component] = d.uploaded_at;
  }
  return c.documents.map((d) => {
    const superseded = d.status === "classified" && !!d.component && newest[d.component] > d.uploaded_at;
    if (d.status === "duplicate") return { doc: d, level: "warn", label: "نسخة مكررة", reason: d.reason ?? "مطابق لملف مرفوع مسبقًا", superseded };
    if (d.status === "error") return { doc: d, level: "error", label: "تالف أو غير مقروء", reason: d.error ?? "تعذّرت معالجة الملف", superseded };
    if (d.status === "needs_review") return { doc: d, level: "human", label: "غير مؤكد — يحتاج تدخل المختص", reason: d.error ?? d.reason ?? "لم يُحسم التصنيف بثقة كافية", superseded };
    if (d.status === "excluded") return { doc: d, level: "warn", label: "مستبعد", reason: d.reason ?? "استبعده فريق المشروع", superseded };
    if (d.status === "processing") return { doc: d, level: "human", label: "قيد المعالجة", reason: "لم تكتمل معالجة الملف بعد", superseded };
    if (superseded) return { doc: d, level: "warn", label: "نسخة أقدم", reason: "توجد نسخة أحدث لنفس المكوّن", superseded };
    if (d.confidence != null && d.confidence < 0.75) return { doc: d, level: "warn", label: "تصنيف بثقة منخفضة", reason: d.reason ?? "", superseded };
    return { doc: d, level: "ok", label: "مطابق", reason: d.reason ?? "صُنّف بنجاح", superseded };
  });
}

// ---------- prototype records ----------

export interface ReviewRequest { id: string; courseId: number; docId: number; filename: string; note: string | null; by: string; at: string }

export interface ReanalysisRun {
  id: string;
  courseId: number;
  parts: string[];
  by: string;
  startedAt: string;
  finishedAt: string | null;
  decisionsToRecheck: { id: number; title: string }[];
}

interface Stored { version: 1; reviews: ReviewRequest[]; runs: ReanalysisRun[] }
const store = createDemoStore<Stored>("aq.course-tools.demo.v1", () => ({ version: 1, reviews: [], runs: [] }));

export const courseTools = {
  load: () => store.load(),
  subscribe: (cb: () => void) => store.subscribe(cb),

  requestReview(courseId: number, doc: Doc, by: string, note: string): ReviewRequest {
    const text = cleanText(note, { what: "الملاحظة" });
    const data = store.load();
    const r = { id: uid(), courseId, docId: doc.id, filename: doc.filename, note: text, by, at: iso() };
    data.reviews.push(r);
    store.save(data);
    return r;
  },

  startRun(courseId: number, parts: string[], by: string): ReanalysisRun {
    if (!parts.length) throw new Error("اختر جزءًا واحدًا على الأقل");
    const data = store.load();
    if (data.runs.some((r) => r.courseId === courseId && !r.finishedAt)) throw new Error("توجد إعادة تحليل قيد التنفيذ لهذا المقرر");
    const run = { id: uid(), courseId, parts, by, startedAt: iso(), finishedAt: null, decisionsToRecheck: [] };
    data.runs.push(run);
    store.save(data);
    return run;
  },

  finishRun(id: string, decisionsToRecheck: ReanalysisRun["decisionsToRecheck"]) {
    const data = store.load();
    const run = data.runs.find((r) => r.id === id);
    if (!run || run.finishedAt) return;
    run.finishedAt = iso();
    run.decisionsToRecheck = decisionsToRecheck;
    store.save(data);
  },
};
