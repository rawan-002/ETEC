"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/components/Shell";
import { Empty, ErrorNote, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { fmtDate } from "@/lib/labels";

interface Note { id: number; to: string; to_email: string | null; kind: string; subject: string; body: string; status: string; created_at: string; read: boolean }
interface Settings { deadline_days: number; reminder_every_days: number; reminders_enabled: boolean }

const STATUS_AR: Record<string, string> = {
  sent: "أُرسل", simulated: "محاكاة (لم يُضبط البريد بعد)", failed: "فشل الإرسال", skipped: "لم يُرسل: البريد غير مؤكد",
};

export default function NotificationsPage() {
  const me = useMe();
  const admin = me.role === "dean" || me.role === "team";
  const { data, reload } = useApi<Note[]>("/api/notifications");

  useEffect(() => { api("/api/notifications/read", { method: "POST" }).catch(() => {}); }, []);

  if (!data) return <Spinner />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">{admin ? "الإشعارات والتذكيرات" : "إشعاراتي"}</h1>
        <p className="muted mt-1">تُرسل التذكيرات تلقائيًا لأساتذة المقررات الناقصة، وتتوقف عند اكتمال الوثائق.</p>
      </div>
      {admin && <ReminderSettings onRun={reload} />}
      {data.length === 0 ? <Empty>لا توجد إشعارات بعد.</Empty> : (
        <div className="space-y-3">
          {data.map((n) => (
            <article key={n.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{n.subject}</span>
                <span className="mr-auto text-xs text-ink-faint">{fmtDate(n.created_at)}</span>
              </div>
              {admin && (
                <div className="mt-1 text-xs text-ink-soft">
                  إلى: {n.to} <span className="ltr">{n.to_email ?? ""}</span> · {STATUS_AR[n.status] ?? n.status}
                </div>
              )}
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-soft">{n.body}</pre>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ReminderSettings({ onRun }: { onRun: () => void }) {
  const { data } = useApi<Settings>("/api/settings");
  const [form, setForm] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);
  if (!form) return null;

  const save = async () => {
    setError(null);
    try { await api("/api/settings", { method: "PUT", json: form }); setMsg("حُفظت الإعدادات"); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذّر الحفظ"); }
  };
  const runNow = async () => {
    setError(null);
    try {
      const r = await api<{ sent: number; reason?: string }>("/api/reminders/run", { method: "POST" });
      setMsg(r.reason ?? `أُرسل ${r.sent} تذكير`);
      onRun();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر الإرسال"); }
  };

  return (
    <section className="card grid gap-4 p-5 md:grid-cols-4 md:items-end">
      <div>
        <label className="label" htmlFor="deadline">المهلة (أيام)</label>
        <input id="deadline" type="number" min={1} className="input" value={form.deadline_days}
          onChange={(e) => setForm({ ...form, deadline_days: Number(e.target.value) })} />
      </div>
      <div>
        <label className="label" htmlFor="every">التذكير كل (يوم)</label>
        <input id="every" type="number" min={1} className="input" value={form.reminder_every_days}
          onChange={(e) => setForm({ ...form, reminder_every_days: Number(e.target.value) })} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-royal" checked={form.reminders_enabled}
          onChange={(e) => setForm({ ...form, reminders_enabled: e.target.checked })} />
        التذكير التلقائي مفعّل
      </label>
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={save}>حفظ</button>
        <button className="btn-primary" onClick={runNow}>إرسال الآن</button>
      </div>
      <div className="md:col-span-4">
        {msg && <div className="text-sm text-leaf">{msg}</div>}
        <ErrorNote message={error} />
      </div>
    </section>
  );
}
