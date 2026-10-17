import type { ComponentStatus } from "./types";

export const PROGRAM_AR: Record<string, string> = {
  CS: "علوم الحاسب",
  IS: "نظم المعلومات",
  IT: "تقنية المعلومات",
  SE: "هندسة البرمجيات",
};

export const STATUS: Record<ComponentStatus, { sym: string; label: string; cls: string }> = {
  present: { sym: "✓", label: "مكتمل", cls: "bg-leaf-50 text-leaf border-leaf/20" },
  missing: { sym: "✗", label: "ناقص", cls: "bg-red-50 text-red-700 border-red-200" },
  review: { sym: "?", label: "قيد المراجعة", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  na: { sym: "N/A", label: "غير منطبق", cls: "bg-slate-50 text-ink-faint border-line" },
};

export const DOC_STATUS: Record<string, { label: string; cls: string }> = {
  processing: { label: "قيد المعالجة", cls: "text-sky" },
  classified: { label: "مصنّف", cls: "text-leaf" },
  needs_review: { label: "بانتظار فريق المشروع", cls: "text-amber-700" },
  error: { label: "تعذّرت المعالجة", cls: "text-red-700" },
  duplicate: { label: "نسخة مكررة", cls: "text-ink-faint" },
  excluded: { label: "مستبعد", cls: "text-ink-faint" },
};

export const KIND_AR: Record<string, string> = {
  login: "دخول",
  upload: "رفع وثائق",
  classify: "التحليل الذكي",
  review: "مراجعة الفريق",
  assignment: "توزيع المقررات",
  approval: "اعتمادات",
  reminder: "تذكيرات",
  admin: "إدارة",
};

export function levelLabel(level: number | null, group: string | null): string {
  if (group) {
    const g: Record<string, string> = {
      "College Elective": "اختياري الكلية",
      "Elective 1": "اختياري 1",
      "Elective 2": "اختياري 2",
      "Elective 3": "اختياري 3",
      "Elective 4": "اختياري 4",
    };
    return g[group] ?? group;
  }
  return level ? `المستوى ${level}` : "—";
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short" });
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}
