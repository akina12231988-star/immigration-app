"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
// 全件取得は useApplications を呼ぶページに入ったときに1回だけ走らせ、
// 書き込みは楽観更新＋DB反映で全職員に共有される。

interface ApplicationsContextValue {
  applications: Application[];
  loaded: boolean;
  ensureLoaded: () => void; // 申請を使うページに入ったときに取得を始める
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

  // 申請の全件取得は重いので、申請を使うページに入って初めて走らせる
  // （useApplications が呼ばれたら1回だけ取得する）。
  // 所属機関・請求書作成のように申請を見ないページでは通信が起きない
  const started = useRef(false);
  const ensureLoaded = useCallback(() => {
    if (started.current) return;
    started.current = true;
    listApplications(createClient())
      .then((apps) => {
        setApplications(apps);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "申請データの取得に失敗しました");
        setLoaded(true);
      });
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
        ensureLoaded,
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
  // このフックを使うページに入ったときに初めて全件取得する
  const { ensureLoaded } = ctx;
  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);
  return ctx;
}
