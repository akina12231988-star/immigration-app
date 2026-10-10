"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { passwordErrorMessage, PASSWORD_MIN_LENGTH, validateNewPassword } from "@/lib/password";
import { createClient } from "@/lib/supabase/client";

// 新しいパスワードを2回入れて保存する（ログイン中・二段階認証済みのセッションで行う）
export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setPending(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      setError(passwordErrorMessage(updateError.message, "パスワードを保存できませんでした"));
      return;
    }
    setPassword("");
    setConfirm("");
    setDone(true);
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="text-sm">
        <span className="mb-1 block font-bold">新しいパスワード</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setDone(false);
          }}
          className="min-h-[48px] w-full rounded-xl border border-border bg-background px-4"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-bold">新しいパスワード（確認）</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-border bg-background px-4"
        />
      </label>
      <p className="text-[11px] leading-relaxed text-muted">
        {PASSWORD_MIN_LENGTH}文字以上で、英字と数字を混ぜてください。
      </p>
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}
      {done && !error && (
        <p role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
          パスワードを変えました。次回のログインから新しいパスワードを使ってください。
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-60"
      >
        <Check size={16} />
        {pending ? "保存中…" : "パスワードを変える"}
      </button>
    </form>
  );
}
