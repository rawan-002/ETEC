"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import type { Me, Role } from "@/lib/types";
import { Spinner } from "./ui";

const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext)!;

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/", label: "لوحة المتابعة", roles: ["dean", "head", "faculty", "team"] },
  { href: "/select-courses", label: "مقرراتي هذا الفصل", roles: ["faculty", "head"] },
  { href: "/distribution", label: "توزيع المقررات", roles: ["head"] },
  { href: "/review", label: "مراجعة التصنيف", roles: ["team", "dean"] },
  { href: "/notifications", label: "الإشعارات", roles: ["dean", "head", "faculty", "team"] },
  { href: "/activity", label: "سجل النشاط", roles: ["dean", "head", "faculty", "team"] },
  { href: "/users", label: "المستخدمون", roles: ["dean", "team"] },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { data: me, error } = useApi<Me>("/api/auth/me");
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (me?.needs_course_selection && path !== "/select-courses") router.replace("/select-courses");
  }, [me, path, router]);

  useEffect(() => setOpen(false), [path]);

  if (error) return <div className="p-10 text-center text-red-700">{error}</div>;
  if (!me) return <Spinner />;

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  const nav = NAV.filter((n) => n.roles.includes(me.role));
  return (
    <MeContext.Provider value={me}>
      <div className="min-h-screen lg:flex">
        <aside className={`${open ? "block" : "hidden"} fixed inset-0 z-30 bg-navy text-white lg:static lg:block lg:min-h-screen lg:w-64 lg:shrink-0`}>
          <div className="flex items-center gap-3 p-5">
            <div>
              <div className="font-bold">جودة أكاديمية ذكية</div>
              <div className="text-xs text-white/60">كلية الحاسبات والمعلومات</div>
            </div>
            <button className="mr-auto text-2xl lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق">×</button>
          </div>
          <nav className="space-y-1 px-3">
            {nav.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href}
                  className={`block rounded-xl px-4 py-2.5 text-sm ${active ? "bg-white/15 font-semibold" : "text-white/80 hover:bg-white/10"}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-8 border-t border-white/10 px-5 py-4 text-xs text-white/60">الفصل {me.term ?? "—"}</div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:px-8">
            <button className="btn-ghost px-3 lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة">☰</button>
            <div className="mr-auto text-left">
              <div className="text-sm font-semibold">{me.name}</div>
              <div className="text-xs text-ink-soft">{me.role_ar}{me.department ? ` · ${me.department}` : ""}</div>
            </div>
            <button className="btn-ghost" onClick={logout}>خروج</button>
          </header>
          {me.is_tester && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 lg:px-8">
              وضع تجريبي: اختياراتك وملفاتك لا تُحتسب في الاكتمال ولا تظهر لأي مستخدم آخر.
            </div>
          )}
          <main className="mx-auto max-w-6xl p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </MeContext.Provider>
  );
}
