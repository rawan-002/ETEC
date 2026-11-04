"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Headset, KeyRound, LogIn, MailQuestion, UploadCloud, UserPlus, X, type LucideIcon } from "lucide-react";

const HELP: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: LogIn, title: "كيف أدخل للمنصة؟", body: "اختر قسمك من الصفحة الرئيسية، ثم أدخل بريدك الجامعي وكلمة المرور." },
  { icon: KeyRound, title: "أول دخول أو نسيت كلمة المرور", body: "في أول دخول تختار كلمة مرورك بنفسك. إن نسيتها يعيد فريق المشروع تعيينها لتختار كلمة جديدة." },
  { icon: UserPlus, title: "بريدي غير مسجّل", body: "استخدم «بريدي غير موجود» في صفحة الدخول، ويعتمد رئيس القسم طلبك." },
  { icon: UploadCloud, title: "مشكلة في الرفع أو الواجهة", body: "سجّل الدخول ثم افتح هذه الأيقونة لإرسال طلب دعم يتابعه فريق المشروع معك." },
];

/** The floating support button for visitors who are not signed in: guidance only, no requests are shown or created. */
export function GuestSupport({ onLoginPage = false }: { onLoginPage?: boolean }) {
  // The sign-in page is a centred grid with room around the form; the home page needs end-of-page room for the button.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {!onLoginPage && <div aria-hidden className="h-16 sm:h-20" />}
      <button onClick={() => setOpen((v) => !v)} aria-label="المساعدة التقنية" title="المساعدة التقنية" aria-expanded={open}
        className="fixed bottom-4 left-4 z-20 grid h-12 w-12 place-items-center rounded-full bg-navy text-white shadow-lg shadow-navy/30 transition hover:bg-royal sm:bottom-6 sm:left-6 sm:h-14 sm:w-14">
        {open ? <X size={22} /> : <Headset size={24} />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-navy/30 sm:bg-transparent" onClick={() => setOpen(false)} aria-hidden />
          <section role="dialog" aria-label="المساعدة التقنية"
            className="fixed inset-x-0 bottom-0 top-12 z-40 flex flex-col rounded-t-3xl border border-line bg-white shadow-2xl sm:inset-auto sm:bottom-24 sm:left-6 sm:top-auto sm:max-h-[min(40rem,calc(100vh-8rem))] sm:w-[26rem] sm:rounded-3xl">
            <header className="flex items-start gap-3 rounded-t-3xl bg-gradient-to-l from-royal via-navy-700 to-navy p-5 text-white">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10"><Headset size={20} /></div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">المساعدة التقنية</h2>
                <p className="mt-0.5 text-xs leading-5 text-white/75">إرشادات سريعة قبل تسجيل الدخول. لإرسال طلب دعم مرتبط بحسابك سجّل الدخول أولًا.</p>
              </div>
              <button className="rounded-lg p-1 text-white/80 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="إغلاق"><X size={20} /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {HELP.map((h) => (
                <div key={h.title} className="flex gap-3 rounded-xl bg-canvas p-3">
                  <h.icon size={18} className="mt-0.5 shrink-0 text-royal" />
                  <div><div className="text-sm font-semibold text-navy">{h.title}</div><p className="mt-0.5 text-xs leading-5 text-ink-soft">{h.body}</p></div>
                </div>
              ))}
              <div className="flex items-start gap-2 rounded-xl border border-royal/20 bg-royal-50 p-3 text-xs leading-5 text-royal">
                <MailQuestion size={16} className="mt-0.5 shrink-0" />
                طلبات الدعم ومتابعتها متاحة بعد تسجيل الدخول فقط، ولا تُعرض طلبات أي مستخدم قبل المصادقة.
              </div>
            </div>
            <div className="border-t border-line p-4">
              {onLoginPage
                ? <button className="btn-primary w-full" onClick={() => setOpen(false)}>سجّل الدخول لإنشاء طلب</button>
                : <Link href="/home#departments" className="btn-primary w-full" onClick={() => setOpen(false)}>اختر قسمك وسجّل الدخول لإنشاء طلب</Link>}
            </div>
          </section>
        </>
      )}
    </>
  );
}
