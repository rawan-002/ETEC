"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";

interface LoginUser { id: number; name: string; role: string; role_ar: string; department: string | null; needs_pin: boolean }
interface Dept { id: number; name: string }

export default function LoginPage() {
  const router = useRouter();
  const { data: users } = useApi<LoginUser[]>("/api/auth/users");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LoginUser | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);

  const filtered = useMemo(
    () => (users ?? []).filter((u) => u.name.includes(query.trim())),
    [users, query],
  );

  // Enter in the search box: a project-team word signs in quietly; otherwise a single match is selected.
  const onSearchEnter = async () => {
    const word = query.trim();
    if (!word) return;
    try {
      await api("/api/auth/alias", { method: "POST", json: { word } });
      router.replace("/");
    } catch {
      if (filtered.length === 1) setSelected(filtered[0]);
    }
  };

  const dean = selected?.role === "dean";
  const pinReady = dean ? pin.length === 6 : pin.length >= 4;

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", json: { user_id: selected.id, pin: selected.needs_pin ? pin : null } });
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الدخول");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="text-lg font-bold">جامعة الباحة</div>
          <div className="text-sm text-white/70">كلية الحاسبات والمعلومات</div>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">معًا نحو كلية أكثر تميزًا</h1>
          <p className="mt-4 max-w-md text-white/75">
            نرتقي بجودة برامجنا الأكاديمية من خلال التحليل الذكي، والتعاون الفعّال، والتحسين المستمر.
          </p>
        </div>
        <div className="text-xs text-white/50">التجربة الأولى · قسم علوم الحاسب</div>
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-sky/20 blur-2xl" />
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 font-bold text-navy lg:hidden">جودة أكاديمية ذكية</div>
          {!registering ? (
            <div className="card p-6">
              <h2 className="text-xl font-bold text-navy">تسجيل الدخول</h2>
              <p className="muted mt-1">اختر اسمك من القائمة.</p>

              {!selected ? (
                <>
                  <input className="input mt-5" placeholder="ابحث عن اسمك…" value={query} onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSearchEnter()} autoFocus />
                  <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto" role="listbox">
                    {filtered.map((u) => (
                      <li key={u.id}>
                        <button className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-right hover:bg-royal-50"
                          onClick={() => { setSelected(u); setError(null); }}>
                          <span className="font-medium">{u.name}</span>
                          <span className="text-xs text-ink-soft">{u.role_ar}</span>
                        </button>
                      </li>
                    ))}
                    {users && filtered.length === 0 && <li className="muted px-3 py-2">لا يوجد اسم مطابق</li>}
                  </ul>
                </>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-royal-50 px-3 py-2">
                    <div>
                      <div className="font-semibold">{selected.name}</div>
                      <div className="text-xs text-ink-soft">{selected.role_ar}</div>
                    </div>
                    <button className="text-sm text-royal" onClick={() => { setSelected(null); setPin(""); }}>تغيير</button>
                  </div>
                  {selected.needs_pin && (
                    <div>
                      <label className="label" htmlFor="pin">{dean ? "رمز الدخول (6 أرقام)" : "رمز الدخول"}</label>
                      <input id="pin" type="password" className="input ltr text-center text-lg tracking-[0.3em]" autoComplete="off"
                        inputMode={dean ? "numeric" : "text"} maxLength={dean ? 6 : 12} value={pin}
                        onChange={(e) => setPin(dean ? e.target.value.replace(/\D/g, "") : e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && pinReady && submit()} autoFocus />
                    </div>
                  )}
                  {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                  <button className="btn-primary w-full" disabled={busy || (selected.needs_pin && !pinReady)} onClick={submit}>
                    دخول
                  </button>
                </div>
              )}
              <button className="mt-6 text-sm text-royal" onClick={() => setRegistering(true)}>اسمي غير موجود</button>
            </div>
          ) : (
            <RegisterForm onDone={() => setRegistering(false)} />
          )}
        </div>
      </section>
    </div>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const { data: depts } = useApi<Dept[]>("/api/auth/departments");
  const [name, setName] = useState("");
  const [dept, setDept] = useState<number | "">("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    try {
      const r = await api<{ message: string }>("/api/auth/register-request", { method: "POST", json: { name, department_id: dept } });
      setMessage(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الإرسال");
    }
  };

  return (
    <div className="card p-6">
      <h2 className="text-xl font-bold text-navy">طلب إضافة اسم</h2>
      <p className="muted mt-1">يعتمد رئيس القسم الطلب، ثم يظهر اسمك في قائمة الدخول.</p>
      {message ? (
        <div className="mt-5 rounded-xl bg-leaf-50 px-3 py-3 text-sm text-leaf">{message}</div>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <label className="label" htmlFor="name">الاسم الرباعي</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="dept">القسم</label>
            <select id="dept" className="input" value={dept} onChange={(e) => setDept(Number(e.target.value))}>
              <option value="">اختر القسم</option>
              {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button className="btn-primary w-full" disabled={name.trim().length < 6 || !dept} onClick={send}>إرسال الطلب</button>
        </div>
      )}
      <button className="mt-6 text-sm text-royal" onClick={onDone}>رجوع لتسجيل الدخول</button>
    </div>
  );
}
