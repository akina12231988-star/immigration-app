"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Check, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function SettingsForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== newPasswordConfirm) {
      setError("新しいパスワード（確認）が一致しません");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newUsername, newPassword }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        setError(json.error || "変更に失敗しました");
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewUsername("");
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch {
      setError("通信に失敗しました。もう一度お試しください");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={16} className="text-brand" />
          <h2 className="text-sm font-bold text-muted">
            ログインID・パスワードの変更
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            label="現在のパスワード"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />
          <Field
            label="新しいログインID"
            value={newUsername}
            onChange={setNewUsername}
            autoComplete="username"
          />
          <Field
            label="新しいパスワード（6文字以上）"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <Field
            label="新しいパスワード（確認）"
            type="password"
            value={newPasswordConfirm}
            onChange={setNewPasswordConfirm}
            autoComplete="new-password"
          />

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
              <TriangleAlert size={15} className="shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg bg-status-reported-bg px-3 py-2 text-xs font-bold text-status-reported-fg">
              <Check size={15} className="shrink-0" />
              変更しました。次回のログインから新しいID・パスワードをお使いください
            </div>
          )}

          <Button
            type="submit"
            fullWidth
            disabled={
              submitting ||
              !currentPassword ||
              !newUsername ||
              !newPassword ||
              !newPasswordConfirm
            }
          >
            {submitting ? "変更しています…" : "変更する"}
          </Button>
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-bold text-muted">ログアウト</h2>
        <Button
          variant="secondary"
          icon={<LogOut size={17} />}
          fullWidth
          onClick={handleLogout}
          disabled={loggingOut}
        >
          ログアウトする
        </Button>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-base focus:border-brand focus:outline-none"
      />
    </label>
  );
}
