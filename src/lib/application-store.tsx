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

// Stage2の画面デザイン確認用の暫定ストア。
// Stage4でGoogle Sheets APIからの取得・書き込みに置き換える想定で、
// ここでは同じインターフェース(applications/addApplication/updateApplication)を保つ。
const STORAGE_KEY = "immigration-app.applications";

interface ApplicationsContextValue {
  applications: Application[];
  loaded: boolean;
  addApplication: (app: Application) => void;
  updateApplication: (id: string, patch: Partial<Application>) => void;
}

const ApplicationsContext = createContext<ApplicationsContextValue | null>(
  null
);

function readFromStorage(): Application[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Application[]) : null;
  } catch {
    return null;
  }
}

export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] =
    useState<Application[]>(MOCK_APPLICATIONS);
  const [loaded, setLoaded] = useState(false);

  // localStorageの読み取りはブラウザでのみ可能なため、マウント後に読み込む
  // (SSR結果との不一致を避けるため、初回描画はモックデータのまま行う)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApplications(readFromStorage() ?? MOCK_APPLICATIONS);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
  }, [applications, loaded]);

  function addApplication(app: Application) {
    setApplications((prev) => [app, ...prev]);
  }

  function updateApplication(id: string, patch: Partial<Application>) {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
  }

  return (
    <ApplicationsContext.Provider
      value={{ applications, loaded, addApplication, updateApplication }}
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
