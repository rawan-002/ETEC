"use client";

import { use, useRef, useState } from "react";
import { ErrorNote, Progress, Spinner, StatusPill } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { DOC_STATUS, fmtDate, fmtSize, levelLabel } from "@/lib/labels";
import type { ComponentKey, CourseDetail, Doc } from "@/lib/types";

const HELP: Record<ComponentKey, string> = {
  spec: "توصيف المقرر المعتمد (نموذج TP-153 أو T-104)",
  theory: "المحاضرات والعروض والملخصات",
  practical: "أوراق المعمل والتمارين العملية",
  assessment: "نماذج الاختبارات والواجبات وسلالم التصحيح",
};

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // Poll while files are processing so statuses update without a reload.
  const { data: c, reload } = useApi<CourseDetail>(`/api/courses/${id}`, 5000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allInput = useRef<HTMLInputElement>(null);

  if (!c) return <Spinner />;

  const send = async (files: FileList | null, component?: ComponentKey) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    [...files].forEach((f) => form.append("files", f));
    if (component) form.append("component", component);
    try {
      await api(`/api/courses/${c.id}/upload`, { method: "POST", body: form });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الرفع");
    } finally {
      setBusy(false);
    }
  };

  const setPractical = async (value: string) => {
    await api(`/api/courses/${c.id}/practical`, { method: "PATCH", json: { practical: value } });
    reload();
  };

  const byComponent = (k: ComponentKey) => c.documents.filter((d) => d.component === k && d.status !== "duplicate");
  const unsorted = c.documents.filter((d) => d.status !== "duplicate" && (!d.component || d.component === "other" || d.status === "error"));
  const duplicates = c.documents.filter((d) => d.status === "duplicate").length;

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink-soft">{levelLabel(c.level, c.group)} · {c.credit_hours ?? "—"} ساعات</div>
            <h1 className="ltr mt-1 text-right text-2xl font-bold text-navy">{c.code} — {c.title}</h1>
            <div className="mt-2 text-sm text-ink-soft">
              {c.teachers?.length ? c.teachers.map((t) => `${t.name}${t.is_coordinator ? " (منسق)" : ""}`).join("، ") : "لا يوجد أستاذ مسجّل"}
            </div>
          </div>
          <div className="w-48">
            <div className="mb-1 flex justify-between text-sm"><span className="text-ink-soft">الاكتمال</span><span className="font-bold">{c.percent}%</span></div>
            <Progress value={c.percent ?? 0} />
          </div>
        </div>
        {c.can_upload && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-royal/30 bg-royal-50/50 p-4"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); send(e.dataTransfer.files); }}>
            <div className="flex-1 text-sm">
              <div className="font-semibold text-navy">ارفع ملفات المقرر كما هي</div>
              <div className="text-ink-soft">اسحب الملفات أو ملف ZIP للمجلد كاملًا، والمنصة تفرزها تلقائيًا.</div>
            </div>
            <input ref={allInput} type="file" multiple hidden onChange={(e) => { send(e.target.files); e.target.value = ""; }} />
            <button className="btn-primary" disabled={busy} onClick={() => allInput.current?.click()}>{busy ? "جارٍ الرفع…" : "اختيار ملفات"}</button>
          </div>
        )}
        <div className="mt-3"><ErrorNote message={error} /></div>
      </div>

      {c.findings.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="font-semibold">ملاحظات على الوثائق</div>
          <ul className="mt-2 list-disc space-y-1 pr-5">{c.findings.map((f, i) => <li key={i}>{f.message}</li>)}</ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(c.components ?? []).map((s) => (
          <ComponentCard key={s.component} k={s.component} label={s.label} status={s.status} note={s.note}
            docs={byComponent(s.component)} canUpload={c.can_upload} busy={busy}
            onUpload={(files) => send(files, s.component)}
            practical={s.component === "practical" && c.can_set_practical ? { value: c.practical, set: setPractical } : undefined} />
        ))}
      </div>

      {duplicates > 0 && <p className="muted">تُجوهلت {duplicates} نسخة مكررة لملفات مرفوعة مسبقًا.</p>}

      {unsorted.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-navy">ملفات غير مصنّفة أو تعذّرت معالجتها</h2>
          <p className="muted mt-1">تصل لفريق المشروع للحسم، ولا تحتاج منك إجراء.</p>
          <DocList docs={unsorted} />
        </div>
      )}
    </div>
  );
}

function ComponentCard({ k, label, status, note, docs, canUpload, busy, onUpload, practical }: {
  k: ComponentKey; label: string; status: "present" | "missing" | "review" | "na"; note: string; docs: Doc[];
  canUpload: boolean; busy: boolean; onUpload: (f: FileList | null) => void;
  practical?: { value: string; set: (v: string) => void };
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-navy">{label}</h2>
        <StatusPill status={status} />
        {canUpload && status !== "na" && (
          <>
            <input ref={input} type="file" multiple hidden onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
            <button className="btn-ghost mr-auto px-3 py-1.5" disabled={busy} onClick={() => input.current?.click()}>
              {docs.length ? "رفع نسخة جديدة" : "رفع"}
            </button>
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-faint">{note || HELP[k]}</p>
      {practical && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-ink-soft">الجزء العملي:</span>
          <select className="input w-auto py-1" value={practical.value} onChange={(e) => practical.set(e.target.value)}>
            <option value="yes">مطلوب</option>
            <option value="no">غير منطبق (لا ساعات معمل)</option>
            <option value="unknown">غير محسوم</option>
          </select>
        </div>
      )}
      <DocList docs={docs} />
    </section>
  );
}

function DocList({ docs }: { docs: Doc[] }) {
  if (!docs.length) return null;
  return (
    <ul className="mt-3 divide-y divide-line text-sm">
      {docs.map((d) => (
        <li key={d.id} className="flex items-start gap-3 py-2">
          <div className="min-w-0 flex-1">
            <a href={`/api/documents/${d.id}/download`} className="ltr block truncate text-right font-medium hover:text-royal">{d.filename}</a>
            <div className="text-xs text-ink-faint">
              {d.uploader} · {fmtDate(d.uploaded_at)} · {fmtSize(d.size)}
              {d.archive_path && <> · من أرشيف</>}
            </div>
            {(d.reason || d.error) && <div className="mt-0.5 text-xs text-ink-soft">{d.error ?? d.reason}</div>}
          </div>
          <span className={`shrink-0 text-xs font-semibold ${DOC_STATUS[d.status]?.cls}`}>
            {DOC_STATUS[d.status]?.label}{d.confidence != null && d.status === "classified" ? ` ${Math.round(d.confidence * 100)}%` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
