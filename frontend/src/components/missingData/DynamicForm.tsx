"use client";

import { AttachmentChip, AttachmentPicker } from "@/components/support/TicketThread";
import type { AttachmentMeta, FieldValue, FormField, FormTemplate } from "@/lib/missingData";
import { MAX_TEXT } from "@/lib/missingData";

function Field({ f, value, error, readOnly, onChange, onFileError }: {
  f: FormField; value: FieldValue; error?: string; readOnly: boolean;
  onChange: (v: FieldValue) => void; onFileError: (m: string | null) => void;
}) {
  const id = `md-${f.key}`;
  const text = typeof value === "string" ? value : "";
  const cls = `input ${error ? "border-red-300 focus:border-red-400 focus:ring-red-100" : ""}`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {f.label}
        {f.required ? <span className="text-red-600" aria-label="إلزامي"> *</span> : <span className="text-xs text-ink-faint"> (اختياري)</span>}
      </label>
      {readOnly ? (
        f.type === "file"
          ? (value && typeof value === "object" ? <AttachmentChip a={value} /> : <div className="text-sm text-ink-faint">—</div>)
          : <div className="whitespace-pre-wrap rounded-xl bg-canvas px-3 py-2 text-sm">{text || "—"}</div>
      ) : f.type === "textarea" ? (
        <textarea id={id} className={`${cls} min-h-24`} maxLength={MAX_TEXT} value={text} onChange={(e) => onChange(e.target.value)} />
      ) : f.type === "select" ? (
        <select id={id} className={cls} value={text} onChange={(e) => onChange(e.target.value)}>
          <option value="">اختر…</option>
          {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === "file" ? (
        <div className={`rounded-xl border border-dashed px-3 py-2 ${error ? "border-red-300" : "border-line"}`}>
          <AttachmentPicker value={value && typeof value === "object" ? value : null} onChange={onChange} onError={onFileError} label="إرفاق ملف" />
        </div>
      ) : (
        <input id={id} className={`${cls} ${f.type === "number" || f.type === "date" ? "ltr text-right" : ""}`}
          type={f.type} min={f.min} max={f.max} maxLength={f.type === "text" ? 300 : undefined} value={text} onChange={(e) => onChange(e.target.value)} />
      )}
      {error && <div className="mt-1 text-xs text-red-700">{error}</div>}
      {f.help && !error && <div className="mt-1 text-xs text-ink-faint">{f.help}</div>}
    </div>
  );
}

/** Renders a template's fields plus a list of extra evidence. Read-only when the viewer cannot edit. */
export function DynamicForm({ template, values, evidence, errors, readOnly, onValues, onEvidence, onFileError }: {
  template: FormTemplate; values: Record<string, FieldValue>; evidence: AttachmentMeta[]; errors: Record<string, string>;
  readOnly: boolean; onValues: (v: Record<string, FieldValue>) => void; onEvidence: (e: AttachmentMeta[]) => void;
  onFileError: (m: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {template.fields.map((f) => (
          <div key={f.key} className={f.type === "textarea" || f.type === "file" ? "sm:col-span-2" : ""}>
            <Field f={f} value={values[f.key] ?? null} error={errors[f.key]} readOnly={readOnly}
              onChange={(v) => onValues({ ...values, [f.key]: v })} onFileError={onFileError} />
          </div>
        ))}
      </div>
      {errors._form && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errors._form}</div>}
      <div>
        <div className="label">أدلة إضافية <span className="text-xs text-ink-faint">(اختياري، حتى 10 ملفات)</span></div>
        <div className="flex flex-wrap items-center gap-2">
          {evidence.map((a, i) => (
            <span key={`${a.name}-${i}`} className="inline-flex items-center gap-1">
              <AttachmentChip a={a} />
              {!readOnly && (
                <button type="button" className="mt-2 rounded-full px-1.5 text-xs text-red-700 hover:bg-red-50"
                  onClick={() => onEvidence(evidence.filter((_, j) => j !== i))} aria-label={`إزالة ${a.name}`}>×</button>
              )}
            </span>
          ))}
          {!readOnly && evidence.length < 10 && (
            <AttachmentPicker value={null} onChange={(a) => a && onEvidence([...evidence, a])} onError={onFileError} label="إضافة دليل" />
          )}
          {readOnly && evidence.length === 0 && <span className="text-sm text-ink-faint">لا توجد أدلة إضافية.</span>}
        </div>
      </div>
    </div>
  );
}
