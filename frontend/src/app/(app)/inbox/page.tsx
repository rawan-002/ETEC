"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, CheckCheck, ListTodo } from "lucide-react";
import { DemoBanner, DemoTag, FilterTabs, RealTag } from "@/components/demo/DemoParts";
import { useMe } from "@/components/Shell";
import { Empty, Spinner } from "@/components/ui";
import { fmtDate } from "@/lib/labels";
import { openItem, SOURCE_LABEL, useMyWork, type WorkItem } from "@/lib/work";

type Tab = "notifications" | "tasks";

export default function InboxPage() {
  return <Suspense fallback={<Spinner />}><Inbox /></Suspense>;
}

function Inbox() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const { tasks, notifications, isUnread, markRead, unreadCount, questions } = useMyWork(me);
  const [tab, setTab] = useState<Tab>(params.get("tab") === "tasks" ? "tasks" : "notifications");
  const [onlyUnread, setOnlyUnread] = useState(false);

  if (!questions) return <Spinner />;
  const shown = tab === "tasks" ? tasks : notifications.filter((n) => !onlyUnread || isUnread(n));

  const open = async (n: WorkItem) => {
    if (tab === "notifications") await markRead(n);
    openItem((h) => router.push(h), n.href);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">الإشعارات والمهام</h1>
        <p className="muted mt-1">كل ما يخصك في مكان واحد: ما تغيّر مؤخرًا، وما هو مطلوب منك حسب دورك.</p>
      </div>
      <DemoBanner>
        الإشعارات الموسومة «حقيقي» من المنصة (القرارات، والتذكيرات البريدية، والمهام). الموسومة «تجريبي» من بيانات النموذج الأولي
        المحفوظة على هذا الجهاز، فلا تصل لمستخدم آخر على جهاز مختلف، ولا توجد إشعارات فورية بين المستخدمين.
      </DemoBanner>

      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs value={tab} onChange={setTab} tabs={[["notifications", `الإشعارات${unreadCount ? ` · ${unreadCount} غير مقروء` : ""}`], ["tasks", "مهامي", tasks.length]]} />
        {tab === "notifications" && <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-royal" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />غير المقروءة فقط</label>
          {unreadCount > 0 && (
            <button className="btn-ghost mr-auto px-3 py-1.5" onClick={() => Promise.all(notifications.filter(isUnread).map(markRead))}>
              <CheckCheck size={15} />تعليم الكل كمقروء
            </button>
          )}
        </>}
      </div>

      {shown.length === 0 ? (
        <Empty>{tab === "tasks" ? "لا توجد مهام مطلوبة منك الآن." : "لا توجد إشعارات."}</Empty>
      ) : (
        <ul className="card divide-y divide-line">
          {shown.map((n) => {
            const unread = tab === "notifications" && isUnread(n);
            return (
              <li key={n.id}>
                <div className={`flex items-start gap-3 p-4 ${unread ? "bg-royal-50/40" : ""}`}>
                  <span className="mt-0.5 text-royal">{tab === "tasks" ? <ListTodo size={18} /> : <Bell size={18} />}</span>
                  <button className="min-w-0 flex-1 text-right" onClick={() => open(n)}>
                    <div className={`text-sm leading-6 ${unread ? "font-semibold" : ""}`}>{n.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                      <span>{SOURCE_LABEL[n.source]}</span>
                      {n.detail && <span className="ltr">· {n.detail}</span>}
                      {n.at && <span>· {fmtDate(n.at)}</span>}
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {n.real ? <RealTag label="حقيقي" /> : <DemoTag />}
                    {unread && <button className="text-xs text-royal hover:underline" onClick={() => markRead(n)}>تعليم كمقروء</button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
