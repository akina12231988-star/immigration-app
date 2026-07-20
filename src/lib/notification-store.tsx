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
import { createClient } from "@/lib/supabase/client";
import {
  deleteMailNotification,
  listMailNotifications,
  markAllMailNotificationsRead,
  relinkMailNotification,
  setMailNotificationRead,
  type MailNotification,
} from "@/lib/supabase/queries/mail-notifications";

// 入管メール通知ストア。マウント時に取得し、ウィンドウ復帰時と一定間隔で再取得する。
// Webhook で DB に入った通知をヘッダーのベルと一覧ページで共有する。

interface NotificationsContextValue {
  notifications: MailNotification[];
  unreadCount: number;
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string, isRead: boolean) => Promise<void>;
  markAllRead: () => Promise<void>;
  relink: (
    id: string,
    patch: { workerId?: string | null; applicationId?: string | null; matchedName?: string },
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const REFRESH_INTERVAL_MS = 60_000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<MailNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  const refresh = useCallback(async () => {
    try {
      const list = await listMailNotifications(supabaseRef.current);
      setNotifications(list);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "通知の取得に失敗しました");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const markRead = useCallback(
    async (id: string, isRead: boolean) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead } : n)),
      );
      try {
        await setMailNotificationRead(supabaseRef.current, id, isRead);
      } catch {
        await refresh(); // 権限不足などで失敗したらサーバーの状態に戻す
      }
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await markAllMailNotificationsRead(supabaseRef.current);
    } catch {
      await refresh();
    }
  }, [refresh]);

  const relink = useCallback(
    async (
      id: string,
      patch: { workerId?: string | null; applicationId?: string | null; matchedName?: string },
    ) => {
      try {
        await relinkMailNotification(supabaseRef.current, id, patch);
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      try {
        await deleteMailNotification(supabaseRef.current, id);
      } catch {
        await refresh();
      }
    },
    [refresh],
  );

  const unreadCount = notifications.reduce((n, m) => n + (m.isRead ? 0 : 1), 0);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        loaded,
        error,
        refresh,
        markRead,
        markAllRead,
        relink,
        remove,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}
