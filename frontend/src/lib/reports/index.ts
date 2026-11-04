"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import { escapeHtml, prototypeHtml } from "@/lib/demo/store";
import { fmtDate } from "@/lib/labels";
import type { Course, CourseDetail, Me, QuestionDetail, QuestionSummary } from "@/lib/types";
import type { Finding, GapReport, ReportViewer } from "./service";
import { reportService, SEVERITY_AR, SOURCE_AR, STATUS_AR } from "./service";

export type { Finding, FindingSource, GapReport, ReportStatus, ReportVersion, ReportViewer, Verdict } from "./service";
export {
  canCreateReport, canDeanDecide, canHeadReview, canRunReanalysis, canSeeReport, reportHasUpdate, reportNeedsMe, reportService,
  SEVERITY_AR, SOURCE_AR, STATUS_AR,
} from "./service";

const MISSING_SEVERITY: Record<string, Finding["severity"]> = { spec: "high", assessment: "high", theory: "medium", practical: "medium" };

/** Findings from what the platform really knows about the course, plus one sample finding marked as such. */
export async function buildFindings(courseId: number): Promise<Finding[]> {
  const [detail, questions] = await Promise.all([
    api<CourseDetail>(`/api/courses/${courseId}`),
    api<QuestionSummary[]>("/api/questions").catch(() => [] as QuestionSummary[]),
  ]);
  const out: Finding[] = [];
  for (const s of detail.components ?? []) {
    if (s.status === "missing") {
      out.push({ key: `missing:${s.component}`, source: "real_completeness", severity: MISSING_SEVERITY[s.component] ?? "medium",
        title: `مكوّن «${s.label}» غير مرفوع`, detail: "لا يوجد في ملف المقرر مستند مصنّف لهذا المكوّن.",
        evidence: [{ source: "حالة اكتمال ملف المقرر", quote: `${s.label}: ناقص` }], link: `/courses/${courseId}`, verdict: "pending", comment: null });
    } else if (s.status === "review") {
      out.push({ key: `review:${s.component}`, source: "real_completeness", severity: "low", title: `مكوّن «${s.label}» قيد المراجعة`,
        detail: s.note || "ملف بانتظار حسم التصنيف.", evidence: [{ source: "حالة اكتمال ملف المقرر", quote: s.note || "قيد المراجعة" }],
        link: `/courses/${courseId}`, verdict: "pending", comment: null });
    }
  }
  detail.findings.forEach((f, i) => out.push({
    key: `finding:${f.kind}:${i}`, source: "real_finding", severity: f.kind === "code_mismatch" ? "high" : "medium",
    title: f.kind === "code_mismatch" ? "رمز المقرر في التوصيف يختلف عن الخطة" : "ملاحظة على مستند", detail: f.message,
    evidence: [{ source: "فحص المستندات عند الرفع", quote: f.message }], link: `/courses/${courseId}`, verdict: "pending", comment: null,
  }));
  for (const q of questions.filter((x) => x.course.id === courseId)) {
    const full = await api<QuestionDetail>(`/api/questions/${q.id}`).catch(() => null);
    out.push({
      key: `question:${q.id}`, source: "real_question", severity: q.priority,
      title: q.title, detail: `${full?.description ?? ""}\nحالة القرار: ${q.status_ar}${full?.decision ? ` — ${full.decision}` : ""}`.trim(),
      evidence: (full?.evidence ?? []).map((e) => ({ source: e.source, quote: e.quote })), link: `/decisions?q=${q.id}`, verdict: "pending", comment: null,
    });
  }
  out.push({
    key: "demo:clo-alignment", source: "demo", severity: "medium", title: "مثال: مواءمة مخرجات التعلم مع متطلبات الاعتماد",
    detail: "نتيجة توضيحية تبيّن شكل الملاحظات النوعية في التقرير، وليست ناتجة عن تحليل ملفات المقرر.",
    evidence: [{ source: "مثال تجريبي", quote: "CLO3 لا يرتبط بمؤشر أداء في مصفوفة البرنامج" }], link: null, verdict: "pending", comment: null,
  });
  return out;
}

export function useReports(me: Me | null) {
  const { data: myCourses } = useApi<Course[]>(me?.role === "faculty" ? "/api/me/courses" : null);
  const viewer = useMemo<ReportViewer | null>(() => (me ? {
    id: me.id, name: me.name, role: me.role, program: me.program, courseIds: (myCourses ?? []).map((c) => c.id),
  } : null), [me, myCourses]);
  const [reports, setReports] = useState<GapReport[] | null>(null);

  const reload = useCallback(async () => { if (viewer) setReports(await reportService.list(viewer)); }, [viewer]);
  useEffect(() => { reload(); return reportService.subscribe(reload); }, [reload]);
  return { reports, viewer };
}

/** A downloadable copy of the report, watermarked as a prototype. */
export function reportHtml(r: GapReport): string {
  const rows = r.findings.map((f) => `<tr><td>${escapeHtml(f.title)}<div class="muted">${escapeHtml(SOURCE_AR[f.source])}</div></td>
<td>${SEVERITY_AR[f.severity]}</td><td>${escapeHtml(f.detail).replace(/\n/g, "<br>")}</td>
<td>${f.evidence.map((e) => `«${escapeHtml(e.quote)}» <span class="muted">(${escapeHtml(e.source)})</span>`).join("<br>") || "—"}</td>
<td>${f.verdict === "agreed" ? "موافق" : f.verdict === "disputed" ? `معترض: ${escapeHtml(f.comment ?? "")}` : "لم يُراجع"}</td></tr>`).join("");
  const history = r.history.map((h) => `<li>${escapeHtml(h.actorName)} — ${escapeHtml(h.action)}${h.note ? `: «${escapeHtml(h.note)}»` : ""} <span class="muted">${fmtDate(h.at)}</span></li>`).join("");
  return prototypeHtml(`تقرير تحليل الفجوات — ${r.course.code}`, `
<h1>تقرير تحليل الفجوات الأكاديمية #${r.number}</h1>
<p>المقرر: <b>${escapeHtml(r.course.code)} — ${escapeHtml(r.course.title)}</b> · البرنامج: ${escapeHtml(r.program)} · الحالة: ${STATUS_AR[r.status].label} · النسخة ${r.versions.length}</p>
${r.headSummary ? `<p>ملخص رئيس القسم: ${escapeHtml(r.headSummary)}</p>` : ""}${r.deanNote ? `<p>ملاحظة العميد: ${escapeHtml(r.deanNote)}</p>` : ""}
<h2>النتائج</h2><table><tr><th>النتيجة</th><th>الأولوية</th><th>التفاصيل</th><th>الأدلة</th><th>المراجعة</th></tr>${rows}</table>
<h2>سجل المراجعات والاعتمادات</h2><ul>${history}</ul>`);
}
