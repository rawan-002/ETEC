"use client";

import { useMemo, useRef, useState } from "react";
import { ErrorNote, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/api";

interface U { id: number; name: string; email: string | null; email_confirmed: boolean; role: string; department: string | null; in_pilot: boolean; pending: boolean; active: boolean }
const ROLE_AR: Record<string, string> = { dean: "عميد الكلية", head: "رئيس قسم", faculty: "عضو هيئة تدريس", team: "فريق المشروع" };

export default function UsersPage() {
  const { data, reload } = useApi<U[]>("/api/users");
  const [q, setQ] = useState("");
  const [pilotOnly, setPilotOnly] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => (data ?? []).filter((u) => (!pilotOnly || u.in_pilot) && u.name.includes(q.trim())), [data, q, pilotOnly]);
  if (!data) return <Spinner />;

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    const form = new FormData();
    form.append("file", f);
    try {
      const r = await api<{ added: number; updated: number }>("/api/admin/import-users", { method: "POST", body: form });
      setMsg(`أُضيف ${r.added} وحُدّث ${r.updated}`);
      reload();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر الاستيراد"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="h-page">المستخدمون</h1>
          <p className="muted mt-1">{data.filter((u) => u.in_pilot).length} في التجربة من {data.length}. التعديل باستيراد ملف المستخدمين المحدّث.</p>
        </div>
        <input ref={file} type="file" accept=".xlsx" hidden onChange={(e) => importFile(e.target.files?.[0])} />
        <button className="btn-ghost" onClick={() => file.current?.click()}>استيراد ملف Excel</button>
      </div>
      {msg && <div className="text-sm text-leaf">{msg}</div>}
      <ErrorNote message={error} />
      <div className="flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="بحث بالاسم…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-royal" checked={pilotOnly} onChange={(e) => setPilotOnly(e.target.checked)} />مجموعة التجربة فقط</label>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-canvas text-xs text-ink-soft">
            <tr><th className="p-3 text-right">الاسم</th><th className="p-3 text-right">الدور</th><th className="p-3 text-right">القسم</th><th className="p-3 text-right">البريد</th><th className="p-3">الحالة</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3">{ROLE_AR[u.role]}</td>
                <td className="p-3 text-ink-soft">{u.department ?? "—"}</td>
                <td className="p-3"><span className="ltr">{u.email ?? "—"}</span>{u.email && !u.email_confirmed && <span className="mr-2 text-xs text-amber-700">غير مؤكد</span>}</td>
                <td className="p-3 text-center text-xs">{u.pending ? "بانتظار رئيس القسم" : !u.active ? "معطّل" : u.in_pilot ? "في التجربة" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
