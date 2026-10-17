"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/components/Shell";
import { ErrorNote, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { levelLabel } from "@/lib/labels";
import type { Course } from "@/lib/types";

type Picked = Record<number, { coordinator: boolean }>;

export default function SelectCoursesPage() {
  const me = useMe();
  const router = useRouter();
  const { data: courses } = useApi<Course[]>("/api/courses?program=CS");
  const { data: saved } = useApi<{ term: string; items: { course_id: number; is_coordinator: boolean }[] }>("/api/me/selection");
  const [picked, setPicked] = useState<Picked>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ course: string; coordinator: string }[]>([]);

  useEffect(() => {
    if (saved) setPicked(Object.fromEntries(saved.items.map((i) => [i.course_id, { coordinator: i.is_coordinator }])));
  }, [saved]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (courses ?? []).filter((c) => !q || c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
    const out = new Map<string, Course[]>();
    for (const c of list) {
      const key = levelLabel(c.level, c.group);
      out.set(key, [...(out.get(key) ?? []), c]);
    }
    return [...out.entries()];
  }, [courses, query]);

  if (!courses || !saved) return <Spinner />;

  const toggle = (id: number) =>
    setPicked((p) => {
      const n = { ...p };
      if (n[id]) delete n[id];
      else n[id] = { coordinator: false };
      return n;
    });

  const save = async (none = false) => {
    setBusy(true);
    setError(null);
    try {
      const items = none ? [] : Object.entries(picked).map(([id, v]) => ({ course_id: Number(id), is_coordinator: v.coordinator }));
      const r = await api<{ conflicts: { course: string; coordinator: string }[] }>("/api/me/selection", { method: "PUT", json: { items } });
      if (r.conflicts.length) setConflicts(r.conflicts);
      else window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  const count = Object.keys(picked).length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">اختر مقرراتك لهذا الفصل</h1>
        <p className="muted mt-1">
          الفصل {saved.term}. حدّد المقررات التي تدرّسها، وفعّل «أنا منسق المقرر» إذا كنت مسؤولًا عن ملف المقرر وتوصيفه.
          يراجع رئيس القسم التوزيع قبل بدء التذكيرات.
        </p>
      </div>

      {conflicts.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="font-semibold text-amber-800">حُفظت مقرراتك، مع ملاحظة:</div>
          <ul className="mt-2 list-disc space-y-1 pr-5 text-amber-800">
            {conflicts.map((c) => <li key={c.course}>{c.course}: منسقه الحالي {c.coordinator}، فسُجّلت أستاذًا فيه. للتعديل تواصل مع رئيس القسم.</li>)}
          </ul>
          <button className="btn-primary mt-3" onClick={() => router.push("/")}>متابعة</button>
        </div>
      )}

      <input className="input max-w-sm" placeholder="ابحث برمز المقرر أو اسمه…" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="space-y-6">
        {groups.map(([label, list]) => (
          <section key={label}>
            <h2 className="mb-2 text-sm font-bold text-ink-soft">{label}</h2>
            <div className="card divide-y divide-line">
              {list.map((c) => {
                const on = !!picked[c.id];
                const others = (c.teachers ?? []).filter((t) => t.user_id !== me.id);
                const coord = others.find((t) => t.is_coordinator);
                return (
                  <div key={c.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${on ? "bg-royal-50/60" : ""}`}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input type="checkbox" className="h-4 w-4 accent-royal" checked={on} onChange={() => toggle(c.id)} />
                      <span className="ltr w-20 shrink-0 text-xs font-semibold text-ink-soft">{c.code}</span>
                      <span className="truncate font-medium ltr text-right">{c.title}</span>
                    </label>
                    {others.length > 0 && (
                      <span className="text-xs text-ink-soft">
                        {coord ? `المنسق: ${coord.name}` : `يدرّسه: ${others.map((t) => t.name).join("، ")}`}
                      </span>
                    )}
                    {on && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-leaf" checked={picked[c.id].coordinator}
                          disabled={!!coord}
                          onChange={(e) => setPicked((p) => ({ ...p, [c.id]: { coordinator: e.target.checked } }))} />
                        أنا منسق المقرر
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <span className="muted">اخترت {count} مقرر</span>
        <ErrorNote message={error} />
        <button className="btn-ghost mr-auto" disabled={busy} onClick={() => save(true)}>لا أدرّس مقررات هذا الفصل</button>
        <button className="btn-primary" disabled={busy || count === 0} onClick={() => save()}>حفظ المقررات</button>
      </div>
    </div>
  );
}
