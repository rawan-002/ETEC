"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Building2 } from "lucide-react";
import { GuestSupport } from "@/components/support/GuestSupport";
import { api, useApi } from "@/lib/api";
import { chosenDepartment, COLLEGE_AR, departmentByCode, DEPARTMENTS, rememberDepartment, type Department } from "@/lib/departments";
import { LangToggle } from "@/lib/i18n";

interface Lookup { signed_in: boolean; name?: string; role_ar?: string; needs_setup?: boolean; can_self_setup?: boolean }
interface Dept { id: number; name: string }

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState<Lookup | null>(null);
  const [lookedUp, setLookedUp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);
  // The department chosen on the home page (?dept=CS); a direct link to /login defaults to the first open department.
  // This is interface only: the backend does not check the department at sign-in yet.
  const [dept, setDept] = useState<Department | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("dept") ?? chosenDepartment();
    const d = departmentByCode(code) ?? DEPARTMENTS.find((x) => x.active)!;
    setDept(d);
    if (d.active) rememberDepartment(d.code);
  }, []);

  const lookup = async () => {
    const value = email.trim();
    if (!value.includes("@") || value === lookedUp) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<Lookup>("/api/auth/lookup", { method: "POST", json: { email: value } });
      if (r.signed_in) {
        router.replace("/");
        return;
      }
      setAccount(r);
      setLookedUp(value);
    } catch (e) {
      setAccount(null);
      setLookedUp("");
      setError(e instanceof Error ? e.message : "تعذّر التحقق من البريد");
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = (v: string) => {
    setEmail(v);
    if (account && v.trim() !== lookedUp) {
      setAccount(null);
      setLookedUp("");
      setPassword("");
      setConfirm("");
    }
  };

  const setup = account?.needs_setup;
  const ready = !!account && (setup ? password.length >= 8 && password === confirm : password.length > 0);

  const submit = async () => {
    if (!account) return lookup();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api(setup ? "/api/auth/setup" : "/api/auth/login", { method: "POST", json: { email: lookedUp, password } });
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الدخول");
      setPassword("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="text-lg font-bold">جامعة الباحة</div>
          <div className="text-sm text-white/70">{COLLEGE_AR}</div>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">معًا نحو كلية أكثر تميزًا</h1>
          <p className="mt-4 max-w-md text-white/75">
            نرتقي بجودة برامجنا الأكاديمية من خلال التحليل الذكي، والتعاون الفعّال، والتحسين المستمر.
          </p>
        </div>
        <div className="text-xs text-white/50">{dept ? `قسم ${dept.nameAr}` : COLLEGE_AR}</div>
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-sky/20 blur-2xl" />
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-4 flex items-center gap-2">
            <Link href="/home" className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-royal hover:bg-royal-50">
              <ArrowRight size={16} />العودة إلى الصفحة الرئيسية
            </Link>
            <LangToggle className="ms-auto" />
          </div>
          {dept && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm shadow-card">
              <Building2 size={18} className="shrink-0 text-royal" />
              <span className="flex-1">القسم المختار: <b>{`قسم ${dept.nameAr}`}</b></span>
              <Link href="/home#departments" className="text-xs font-semibold text-royal hover:underline">تغيير القسم</Link>
            </div>
          )}
          <div className="mb-8 font-bold text-navy lg:hidden">جودة أكاديمية ذكية</div>
          {dept && !dept.active ? (
            <div className="card space-y-3 p-6 text-center">
              <h2 className="text-lg font-bold text-navy">{`قسم ${dept.nameAr}`}</h2>
              <p className="muted">هذا القسم غير متاح حاليًا على المنصة، وسيُفعَّل قريبًا.</p>
              <Link href="/home#departments" className="btn-primary">العودة لاختيار القسم</Link>
            </div>
          ) : registering ? <RegisterForm onDone={() => setRegistering(false)} /> : (
            <form className="card space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <div>
                <h2 className="text-xl font-bold text-navy">تسجيل الدخول</h2>
                <p className="muted mt-1">بالبريد الجامعي وكلمة المرور.</p>
              </div>

              <div>
                <label className="label" htmlFor="email">البريد الجامعي</label>
                <input id="email" name="username" type="email" autoComplete="username" className="input ltr" dir="ltr"
                  placeholder="name@bu.edu.sa" value={email} onChange={(e) => changeEmail(e.target.value)} onBlur={lookup} autoFocus />
              </div>

              {account && (
                <div>
                  <label className="label" htmlFor="name">الاسم</label>
                  <input id="name" className="input bg-canvas font-semibold" value={account.name} readOnly tabIndex={-1} />
                  <div className="mt-1 text-xs text-ink-faint">{account.role_ar}</div>
                </div>
              )}

              {account && setup && !account.can_self_setup && (
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  لم تُعيَّن كلمة مرور لهذا الحساب بعد. تواصل مع فريق المشروع.
                </div>
              )}

              {account && (!setup || account.can_self_setup) && (
                <>
                  {setup && <div className="rounded-xl bg-royal-50 px-3 py-2 text-sm text-royal">أول دخول لك: اختر كلمة مرور (8 أحرف على الأقل). ستدخل بها في المرات القادمة.</div>}
                  <div>
                    <label className="label" htmlFor="password">{setup ? "كلمة المرور الجديدة" : "كلمة المرور"}</label>
                    <input id="password" name="password" type="password" className="input ltr" dir="ltr"
                      autoComplete={setup ? "new-password" : "current-password"} value={password}
                      onChange={(e) => setPassword(e.target.value)} autoFocus />
                  </div>
                  {setup && (
                    <div>
                      <label className="label" htmlFor="confirm">تأكيد كلمة المرور</label>
                      <input id="confirm" type="password" className="input ltr" dir="ltr" autoComplete="new-password"
                        value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                      {confirm && confirm !== password && <div className="mt-1 text-xs text-red-700">غير مطابقة</div>}
                    </div>
                  )}
                </>
              )}

              {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

              <button type="submit" className="btn-primary w-full" disabled={busy || (account ? !ready : !email.includes("@"))}>
                {account ? "دخول" : "متابعة"}
              </button>
              <button type="button" className="text-sm text-royal" onClick={() => setRegistering(true)}>بريدي غير موجود</button>
            </form>
          )}
        </div>
      </section>
      <GuestSupport onLoginPage />
    </div>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const { data: depts } = useApi<Dept[]>("/api/auth/departments");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dept, setDept] = useState<number | "">("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    try {
      const r = await api<{ message: string }>("/api/auth/register-request", { method: "POST", json: { name, email, department_id: dept } });
      setMessage(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الإرسال");
    }
  };

  return (
    <div className="card p-6">
      <h2 className="text-xl font-bold text-navy">طلب إضافة للتجربة</h2>
      <p className="muted mt-1">يعتمد رئيس القسم الطلب، ثم تدخل ببريدك الجامعي.</p>
      {message ? (
        <div className="mt-5 rounded-xl bg-leaf-50 px-3 py-3 text-sm text-leaf">{message}</div>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <label className="label" htmlFor="rname">الاسم الرباعي</label>
            <input id="rname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="remail">البريد الجامعي</label>
            <input id="remail" type="email" className="input ltr" dir="ltr" placeholder="name@bu.edu.sa" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="dept">القسم</label>
            <select id="dept" className="input" value={dept} onChange={(e) => setDept(Number(e.target.value))}>
              <option value="">اختر القسم</option>
              {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button className="btn-primary w-full" disabled={name.trim().length < 6 || !email.includes("@") || !dept} onClick={send}>إرسال الطلب</button>
        </div>
      )}
      <button className="mt-6 text-sm text-royal" onClick={onDone}>رجوع لتسجيل الدخول</button>
    </div>
  );
}
