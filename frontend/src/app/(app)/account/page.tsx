"use client";

import { useState } from "react";
import { useMe } from "@/components/Shell";
import { ErrorNote } from "@/components/ui";
import { api } from "@/lib/api";

export default function AccountPage() {
  const me = useMe();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = current.length > 0 && next.length >= 8 && next === confirm;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/change-password", { method: "POST", json: { current, new: next } });
      setDone(true);
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  if (me.is_tester) {
    return <div className="card p-6 text-sm text-ink-soft">حساب فريق المشروع التجريبي يدخل بالبريد فقط، ولا يستخدم كلمة مرور.</div>;
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="h-page">تغيير كلمة المرور</h1>
        <p className="muted mt-1">{me.name}</p>
      </div>
      <form className="card space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); if (ready) save(); }}>
        <div>
          <label className="label" htmlFor="current">كلمة المرور الحالية</label>
          <input id="current" type="password" autoComplete="current-password" className="input ltr" dir="ltr"
            value={current} onChange={(e) => { setCurrent(e.target.value); setDone(false); }} />
        </div>
        <div>
          <label className="label" htmlFor="next">كلمة المرور الجديدة</label>
          <input id="next" type="password" autoComplete="new-password" className="input ltr" dir="ltr"
            value={next} onChange={(e) => { setNext(e.target.value); setDone(false); }} />
          <div className="mt-1 text-xs text-ink-faint">8 أحرف على الأقل</div>
        </div>
        <div>
          <label className="label" htmlFor="confirm">تأكيد كلمة المرور الجديدة</label>
          <input id="confirm" type="password" autoComplete="new-password" className="input ltr" dir="ltr"
            value={confirm} onChange={(e) => { setConfirm(e.target.value); setDone(false); }} />
          {confirm && confirm !== next && <div className="mt-1 text-xs text-red-700">غير مطابقة</div>}
        </div>
        <ErrorNote message={error} />
        {done && <div className="rounded-xl bg-leaf-50 px-3 py-2 text-sm text-leaf">تم تغيير كلمة المرور.</div>}
        <button type="submit" className="btn-primary w-full" disabled={busy || !ready}>حفظ كلمة المرور</button>
      </form>
    </div>
  );
}
