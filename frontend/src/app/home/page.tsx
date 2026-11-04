"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft, BadgeCheck, BarChart3, FolderCheck, GraduationCap, Lock, LogIn, Scale, ShieldCheck, Sparkles, type LucideIcon,
} from "lucide-react";
import { GuestSupport } from "@/components/support/GuestSupport";
import { COLLEGE_AR, DEPARTMENTS, PLATFORM_AR, rememberDepartment, type Department } from "@/lib/departments";
import { LangToggle, useLang } from "@/lib/i18n";

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FolderCheck, title: "إدارة الأدلة", body: "رفع ملفات المقررات مرة واحدة، وفرزها تلقائيًا ومتابعة اكتمالها." },
  { icon: Sparkles, title: "التحليل الذكي", body: "مقارنة التوصيفات والوثائق بالخطط الدراسية ورصد التناقضات بالأدلة." },
  { icon: Scale, title: "القرارات والاعتماد", body: "إسناد كل مسألة لصاحب الصلاحية، مع تسلسل اعتماد واضح وسجل موثق." },
  { icon: BarChart3, title: "التقارير والتحسين المستمر", body: "تقارير فجوات ومؤشرات تدعم مراجعة البرامج والاستعداد للاعتماد." },
];

const STEPS = ["اختر قسمك", "سجّل الدخول ببريدك الجامعي", "تابع ملفات مقرراتك وقراراتك"];

function DepartmentCard({ d }: { d: Department }) {
  const { lang } = useLang();
  const primary = lang === "en" ? d.nameEn : d.nameAr;
  const secondary = lang === "en" ? d.nameAr : d.nameEn;
  return (
    <article className={`group relative flex flex-col rounded-3xl border bg-white p-6 shadow-card transition ${d.active ? "border-line hover:-translate-y-0.5 hover:border-royal/40 hover:shadow-lg" : "border-line/70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-14 w-14 place-items-center rounded-2xl ${d.active ? "bg-gradient-to-br from-royal to-navy text-white" : "bg-canvas text-ink-faint"}`}>
          <d.icon size={26} />
        </div>
        <span translate="no" className={`rounded-full px-2.5 py-1 font-mono text-xs font-bold ${d.active ? "bg-royal-50 text-royal" : "bg-canvas text-ink-faint"}`}>{d.code}</span>
      </div>
      <h3 translate="no" className={`mt-5 text-lg font-bold ${d.active ? "text-navy" : "text-ink-soft"}`}>{primary}</h3>
      <div translate="no" className="text-sm text-ink-faint" dir={lang === "en" ? "rtl" : "ltr"}>{secondary}</div>
      <p className="mt-3 flex-1 text-sm leading-6 text-ink-soft">{d.descAr}</p>
      {d.active ? (
        <Link href={`/login?dept=${d.code}`} onClick={() => rememberDepartment(d.code)} className="btn-primary mt-5 w-full">
          دخول القسم <ArrowLeft size={16} />
        </Link>
      ) : (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-dashed border-line py-2 text-sm font-semibold text-ink-faint" aria-disabled="true">
          <Lock size={15} />قريبًا
        </div>
      )}
      {d.active && <span className="absolute -top-2.5 right-6 rounded-full bg-leaf px-2.5 py-0.5 text-[11px] font-bold text-white shadow">متاح الآن</span>}
    </article>
  );
}

export default function HomePage() {
  const [signedIn, setSignedIn] = useState(false);

  // A signed-in visitor gets a shortcut to the dashboard; nothing is shown about anyone else.
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" }).then((r) => setSignedIn(r.ok)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 lg:px-8">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-royal to-navy text-white"><GraduationCap size={22} /></div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-bold text-navy">{PLATFORM_AR}</div>
            <div className="truncate text-xs text-ink-soft">{COLLEGE_AR} · جامعة الباحة</div>
          </div>
          <LangToggle />
          {signedIn
            ? <Link href="/" className="btn-primary hidden px-3 py-1.5 sm:inline-flex">لوحة التحكم</Link>
            : <a href="#departments" className="btn-primary hidden px-3 py-1.5 sm:inline-flex"><LogIn size={15} />تسجيل الدخول</a>}
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-gradient-to-l from-royal via-navy-700 to-navy text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "26px 26px" }} />
          <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-sky/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 right-1/4 h-72 w-72 rounded-full bg-leaf/15 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/85">
              <ShieldCheck size={14} />{COLLEGE_AR} · جامعة الباحة
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight lg:text-6xl">نحو كلية أكثر تميزًا</h1>
            <p className="mt-3 text-lg font-semibold text-sky lg:text-xl">{PLATFORM_AR}</p>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/80">
              منصة موحدة تعزز الجودة الأكاديمية، وتيسّر إدارة الأدلة والتقارير، وتدعم التحسين المستمر في برامج الكلية.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {signedIn
                ? <Link href="/" className="btn bg-white text-navy hover:bg-white/90">الانتقال إلى لوحة التحكم</Link>
                : <a href="#departments" className="btn bg-white text-navy hover:bg-white/90">اختر قسمك للدخول</a>}
              <a href="#features" className="btn border border-white/25 text-white hover:bg-white/10">تعرّف على المنصة</a>
            </div>
            <div className="mt-10 h-0.5 w-24 rounded-full bg-gradient-to-l from-leaf to-sky" />
          </div>
        </section>

        <section id="departments" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-sm font-semibold text-royal">أقسام الكلية</div>
            <h2 className="mt-1 text-2xl font-bold text-navy lg:text-3xl">اختر قسمك للدخول إلى المنصة</h2>
            <p className="muted mt-2">يتاح الدخول حاليًا لقسم علوم الحاسب، وتُفعَّل بقية الأقسام تباعًا.</p>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {DEPARTMENTS.map((d) => <DepartmentCard key={d.code} d={d} />)}
          </div>
        </section>

        <section id="features" className="scroll-mt-20 border-y border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 lg:px-8">
            <div className="max-w-2xl">
              <div className="text-sm font-semibold text-royal">ماذا تقدم المنصة؟</div>
              <h2 className="mt-1 text-2xl font-bold text-navy lg:text-3xl">منظومة متكاملة لضمان الجودة الأكاديمية</h2>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PILLARS.map((p) => (
                <div key={p.title} className="rounded-3xl bg-canvas p-6">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-royal shadow-card"><p.icon size={22} /></div>
                  <h3 className="mt-4 font-bold text-navy">{p.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 lg:px-8">
          <h2 className="text-xl font-bold text-navy">كيف تبدأ؟</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy font-bold text-white">{i + 1}</span>
                <span className="font-semibold text-navy">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-6 text-xs text-ink-soft lg:px-8">
          <BadgeCheck size={16} className="text-royal" />
          <span>{COLLEGE_AR} · جامعة الباحة</span>
          <span className="ms-auto">نسخة تجريبية (نموذج أولي) · {new Date().getFullYear()}</span>
        </div>
      </footer>
      <GuestSupport />
    </div>
  );
}
