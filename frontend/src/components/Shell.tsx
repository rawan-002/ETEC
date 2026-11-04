"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  Bell, BellRing, ClipboardCheck, ClipboardPen, FileBarChart, FileDiff, FileSearch, History, KeyRound, LayoutGrid, LifeBuoy, ListChecks, LogOut, Mail, Menu, Scale, Users, X,
  type LucideIcon,
} from "lucide-react";
import { api, useApi } from "@/lib/api";
import { COLLEGE_AR } from "@/lib/departments";
import { LangToggle } from "@/lib/i18n";
import { needsMyAction, useMissingData } from "@/lib/missingData";
import { reportNeedsMe, useReports } from "@/lib/reports";
import { editNeedsMe, useDocEdits } from "@/lib/docEdits";
import { useMyWork } from "@/lib/work";
import { isProjectTeam, unreadForTeam, useTickets } from "@/lib/support";
import type { Me, Role } from "@/lib/types";
import { SupportWidget } from "./support/SupportWidget";
import { Spinner } from "./ui";

const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext)!;

const NAV: { href: string; label: string; icon: LucideIcon; roles: Role[]; badge?: boolean }[] = [
  { href: "/", label: "لوحة المتابعة", icon: LayoutGrid, roles: ["dean", "head", "faculty", "team"] },
  { href: "/decisions", label: "مركز القرارات الذكي", icon: Scale, roles: ["dean", "head", "faculty", "team"], badge: true },
  { href: "/inbox", label: "الإشعارات والمهام", icon: BellRing, roles: ["dean", "head", "faculty", "team"], badge: true },
  { href: "/missing-data", label: "استكمال البيانات الناقصة", icon: ClipboardPen, roles: ["dean", "head", "faculty", "team"], badge: true },
  { href: "/reports", label: "تقارير تحليل الفجوات", icon: FileBarChart, roles: ["dean", "head", "faculty", "team"], badge: true },
  { href: "/document-edits", label: "اقتراحات تعديل المستندات", icon: FileDiff, roles: ["dean", "head", "faculty", "team"], badge: true },
  { href: "/select-courses", label: "مقرراتي هذا الفصل", icon: ListChecks, roles: ["faculty", "head"] },
  { href: "/distribution", label: "توزيع المقررات", icon: ClipboardCheck, roles: ["head"] },
  { href: "/review", label: "مراجعة التصنيف", icon: FileSearch, roles: ["team", "dean"] },
  { href: "/notifications", label: "الإشعارات البريدية", icon: Mail, roles: ["dean", "head", "faculty", "team"] },
  { href: "/activity", label: "سجل النشاط", icon: History, roles: ["dean", "head", "faculty", "team"] },
  { href: "/users", label: "المستخدمون والصلاحيات", icon: Users, roles: ["dean", "team"] },
  { href: "/support", label: "طلبات الدعم الفني", icon: LifeBuoy, roles: ["team"], badge: true },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { data: me, error } = useApi<Me>("/api/auth/me");
  const { data: decisions } = useApi<{ pending_for_me: number }>(me ? "/api/questions/count" : null, 20000);
  const { tickets: supportTickets } = useTickets("all", isProjectTeam(me) ? me : null);
  const { requests: mdRequests, viewer: mdViewer } = useMissingData(me);
  const { reports, viewer: repViewer } = useReports(me);
  const { proposals, viewer: editViewer } = useDocEdits(me);
  // The bell now counts the unified notifications (real email reminders included) and opens the notification center.
  const { unreadCount, tasks: myTasks } = useMyWork(me);
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
    // Back to the public home page (a full load, so "/" is served as the home page again).
    window.location.href = "/home";
  };

  // Project-team tester accounts also get the support page (prototype only); other pages follow the real role.
  const nav = NAV.filter((n) => n.roles.includes(me.role) || (n.href === "/support" && isProjectTeam(me)));
  const pending = decisions?.pending_for_me ?? 0;
  const supportNew = (supportTickets ?? []).filter(unreadForTeam).length;
  const mdPending = mdViewer ? (mdRequests ?? []).filter((r) => needsMyAction(r, mdViewer)).length : 0;
  const repPending = repViewer ? (reports ?? []).filter((r) => reportNeedsMe(r, repViewer)).length : 0;
  const badges: Record<string, number> = { "/decisions": pending, "/support": supportNew, "/missing-data": mdPending, "/reports": repPending, "/inbox": myTasks.length,
    "/document-edits": editViewer ? (proposals ?? []).filter((p) => editNeedsMe(p, editViewer)).length : 0 };
  return (
    <MeContext.Provider value={me}>
      <div className="min-h-screen lg:flex">
        <aside className={`${open ? "flex" : "hidden"} fixed inset-0 z-30 flex-col bg-navy text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:shrink-0`}>
          <div className="flex items-start gap-3 px-6 pb-5 pt-7">
            <div className="flex-1">
              <div className="text-xl font-bold">جودة أكاديمية ذكية</div>
              <div className="mt-1 text-xs text-white/60">منصة ضمان الجودة الأكاديمية · جامعة الباحة</div>
              <div className="mt-3 h-0.5 w-16 rounded-full bg-gradient-to-l from-leaf to-sky" />
            </div>
            <button className="rounded-lg p-1 text-white/80 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق">
              <X size={22} />
            </button>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3">
            {nav.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${active ? "bg-royal font-semibold text-white shadow-lg shadow-black/20" : "text-white/80 hover:bg-white/10"}`}>
                  <n.icon size={18} className="shrink-0" />
                  <span className="flex-1">{n.label}</span>
                  {n.badge && (badges[n.href] ?? 0) > 0 && <span className="rounded-full bg-leaf px-2 py-0.5 text-xs font-bold text-white">{badges[n.href]}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="m-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-6 text-white/70">
            <div>الفصل الدراسي {me.term ?? "—"}</div>
            <div>{me.department ? `قسم ${me.department}` : COLLEGE_AR}</div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
            <button className="rounded-lg p-2 hover:bg-canvas lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة"><Menu size={20} /></button>
            <div className="flex items-center gap-2 text-xs text-ink-soft">
              <span className="h-2 w-2 animate-pulse rounded-full bg-leaf" />تحديث مباشر
            </div>
            <div className="mr-auto flex items-center gap-1">
              <LangToggle className="me-1" />
              <Link href="/inbox" className="relative rounded-full p-2 hover:bg-canvas" aria-label="الإشعارات">
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -left-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unreadCount}</span>
                )}
              </Link>
              <div className="mx-2 text-left">
                <div className="text-sm font-semibold">{me.name}</div>
                <div className="text-xs text-royal">{me.role_ar}{me.department ? ` · ${me.department}` : ""}</div>
              </div>
              {!me.is_tester && (
                <Link href="/account" className="rounded-full p-2 text-ink-soft hover:bg-canvas" title="تغيير كلمة المرور" aria-label="تغيير كلمة المرور"><KeyRound size={18} /></Link>
              )}
              <button className="rounded-full p-2 text-ink-soft hover:bg-canvas" onClick={logout} title="خروج" aria-label="خروج"><LogOut size={18} /></button>
            </div>
          </header>
          {me.is_tester && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 lg:px-8">
              وضع تجريبي: اختياراتك وملفاتك وقراراتك لا تُحتسب ولا تظهر لأي مستخدم آخر.
            </div>
          )}
          <main className="mx-auto max-w-6xl p-4 lg:p-8">{children}</main>
          <SupportWidget />
        </div>
      </div>
    </MeContext.Provider>
  );
}
