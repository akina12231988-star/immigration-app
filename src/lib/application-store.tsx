"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Application } from "@/types/application";
import { createClient } from "@/lib/supabase/client";
import {
  insertApplication,
  listApplications,
  updateApplicationRow,
  type NewApplication,
} from "@/lib/supabase/queries/applications";

// Supabase を正とする申請ストア（旧: localStorage 保存の暫定ストア）。
// 初回マウントで全件取得し、書き込みは楽観更新＋DB反映で全職員に共有される。

interface ApplicationsContextValue {
  applications: Application[];
  loaded: boolean;
  error: string | null;
  addApplication: (input: NewApplication) => Promise<Application>;
  updateApplication: (id: string, patch: Partial<Application>) => Promise<void>;
  removeApplication: (id: string) => void; // DB削除後にローカル状態から取り除く
}

const ApplicationsContext = createContext<ApplicationsContextValue | null>(
  null
);

export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listApplications(createClient())
      .then((apps) => {
        if (cancelled) return;
        setApplications(apps);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "申請データの取得に失敗しました");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addApplication = useCallback(async (input: NewApplication) => {
    const created = await insertApplication(createClient(), input);
    setApplications((prev) => [created, ...prev]);
    return created;
  }, []);

  const updateApplication = useCallback(
    async (id: string, patch: Partial<Application>) => {
      // 楽観更新→DB反映。失敗時はDBの値で巻き戻す
      setApplications((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
      try {
        const saved = await updateApplicationRow(createClient(), id, patch);
        setApplications((prev) => prev.map((a) => (a.id === id ? saved : a)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存に失敗しました");
        const apps = await listApplications(createClient()).catch(() => null);
        if (apps) setApplications(apps);
      }
    },
    []
  );

  const removeApplication = useCallback((id: string) => {
    setApplications((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <ApplicationsContext.Provider
      value={{
        applications,
        loaded,
        error,
        addApplication,
        updateApplication,
        removeApplication,
      }}
    >
      {children}
    </ApplicationsContext.Provider>
  );
}

export function useApplications() {
  const ctx = useContext(ApplicationsContext);
  if (!ctx) {
    throw new Error("useApplications must be used within ApplicationsProvider");
  }
  return ctx;
}
