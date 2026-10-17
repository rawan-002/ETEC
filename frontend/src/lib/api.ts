"use client";

import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    credentials: "include",
    headers: json !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail;
    const message = typeof detail === "string" ? detail : "تعذّر تنفيذ الطلب";
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

/** Fetch on mount, optionally re-poll every `refreshMs` (used for the live dashboards). */
export function useApi<T>(path: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
    if (!refreshMs) return;
    const t = setInterval(reload, refreshMs);
    return () => clearInterval(t);
  }, [reload, refreshMs]);

  return { data, error, loading, reload, setData };
}
