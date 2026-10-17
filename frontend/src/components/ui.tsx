import type { ComponentState, ComponentStatus } from "@/lib/types";
import { STATUS } from "@/lib/labels";

export function StatusPill({ status, compact = false }: { status: ComponentStatus; compact?: boolean }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
      <span className="ltr">{s.sym}</span>
      {!compact && s.label}
    </span>
  );
}

export function ComponentRow({ components }: { components: ComponentState[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {components.map((c) => (
        <span key={c.component} title={c.note || c.label} className="inline-flex items-center gap-1 text-xs text-ink-soft">
          {c.label}
          <StatusPill status={c.status} compact />
        </span>
      ))}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-l from-leaf to-royal transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: string | number; hint?: string; tone?: "default" | "warn" | "good" }) {
  const color = tone === "warn" ? "text-red-700" : tone === "good" ? "text-leaf" : "text-navy";
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="muted mt-1">{label}</div>
      {hint && <div className="mt-1 text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">{children}</div>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>;
}

export function Spinner() {
  return <div className="muted py-10 text-center">جارٍ التحميل…</div>;
}
