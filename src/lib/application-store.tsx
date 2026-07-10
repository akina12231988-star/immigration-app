"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Application } from "@/types/application";
import { MOCK_APPLICATIONS } from "@/lib/mock-data";

// Google スプレッドシートを正データベースとして読み書きするストア。
// /api/applications (Next.js API Routes) 経由で Google Apps Script ウェブアプリを呼び出す。
// ネットワーク不通・GAS未設定時はlocalStorageキャッシュにフォールバックし、
// オフラインでも画面のデザイン確認は続けられるようにする。
const STORAGE_KEY = "immigration-app.applications";

interface ApplicationsContextValue {
  applications: Application[];
  loaded: boolean;
  syncError: string | null;
  addApplication: (app: Application) => Promise<void>;
  updateApplication: (id: string, patch: Partial<Application>) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;
}

const ApplicationsContext = createContext<ApplicationsContextValue | null>(
  null
);

function readCache(): Application[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Application[]) : null;
  } catch {
    return null;
  }
}

function writeCache(applications: Application[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
  } catch {
    // localStorageが使えない環境でも致命的にしない
  }
}

export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] =
    useState<Application[]>(MOCK_APPLICATIONS);
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/applications", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || json.ok === false) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        if (!cancelled) {
          setApplications(json.applications);
          writeCache(json.applications);
          setSyncError(null);
        }
      } catch (err) {
        // Sheets未設定・通信エラー時はキャッシュ or モックデータで動作を継続する
        if (!cancelled) {
          setApplications(readCache() ?? MOCK_APPLICATIONS);
          setSyncError(
            "Googleスプレッドシートと同期できませんでした。オフラインのデータを表示しています。"
          );
        }
        console.error("Failed to load applications from Sheets:", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addApplication(app: Application) {
    setApplications((prev) => {
      const next = [app, ...prev];
      writeCache(next);
      return next;
    });
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application: app }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error);
      setSyncError(null);
    } catch (err) {
      setSyncError("Googleスプレッドシートへの保存に失敗しました。");
      console.error("Failed to add application:", err);
    }
  }

  async function updateApplication(id: string, patch: Partial<Application>) {
    let merged: Application | undefined;
    setApplications((prev) => {
      const next = prev.map((a) => {
        if (a.id !== id) return a;
        merged = { ...a, ...patch };
        return merged;
      });
      writeCache(next);
      return next;
    });
    if (!merged) return;
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application: merged }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error);
      setSyncError(null);
    } catch (err) {
      setSyncError("Googleスプレッドシートへの保存に失敗しました。");
      console.error("Failed to update application:", err);
    }
  }

  async function deleteApplication(id: string) {
    setApplications((prev) => {
      const next = prev.filter((a) => a.id !== id);
      writeCache(next);
      return next;
    });
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error);
      setSyncError(null);
    } catch (err) {
      setSyncError("Googleスプレッドシートからの削除に失敗しました。");
      console.error("Failed to delete application:", err);
    }
  }

  return (
    <ApplicationsContext.Provider
      value={{
        applications,
        loaded,
        syncError,
        addApplication,
        updateApplication,
        deleteApplication,
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
