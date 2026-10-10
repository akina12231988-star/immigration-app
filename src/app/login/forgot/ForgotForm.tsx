"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { passwordErrorMessage, resetPasswordRedirectUrl } from "@/lib/password";
import { createClient } from "@/lib/supabase/client";

// 再設定メールを送るフォーム。登録の有無は答えない（存在するアドレスを探られないように）
export function ForgotForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: resetPasswordRedirectUrl(window.location.origin),
    });
    setPending(false);
    if (err) {
      setError(passwordErrorMessage(err.message, "メールを送れませんでした"));
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
          <b>{email.trim()}</b> 宛にメールを送りました。届いたメールのリンクを、<b>このメールを送った端末・ブラウザ</b>で開いて、新しいパスワードを設定してください。
        </p>
        <p className="text-[11px] leading-relaxed text-muted">
          数分たっても届かないときは、迷惑メールを確認するか、アドレスが登録されているものか管理者に確認してください。リンクの有効期限は約1時間です。
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="min-h-[44px] rounded-xl border border-border text-sm font-bold"
        >
          もう一度送る
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="text-sm">
        <span className="mb-1 block font-bold">メールアドレス</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-border bg-background px-4"
          placeholder="you@example.com"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-brand px-5 font-bold text-brand-foreground disabled:opacity-60"
      >
        <Send size={18} />
        {pending ? "送信中…" : "再設定メールを送る"}
      </button>
    </form>
  );
}
