"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { mfaErrorMessage, normalizeTotpCode, verifiedTotpFactors } from "@/lib/mfa";
import { passwordErrorMessage, PASSWORD_MIN_LENGTH, validateNewPassword } from "@/lib/password";
import { createClient } from "@/lib/supabase/client";
import { ForgotForm } from "@/app/login/forgot/ForgotForm";

type Phase =
  | "loading" // リンクを確認中
  | "nolink" // リンクが無効・期限切れ・別の端末で開いた
  | "mfa" // 認証アプリを登録済みの人は、先にコードを確認
  | "form"; // 新しいパスワードの入力

// メールのリンクで開いたときの流れ。
// Supabase のブラウザ用クライアントが URL の code からセッションを作る（同じ端末・ブラウザで開く必要がある）。
// セッションが作れたら、認証アプリを登録済みの人はコードを確認してから、新しいパスワードを保存する
export function ResetPasswordForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 開発時（Strict Mode）の二重実行でリンクの確認を2回しないように
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const supabase = createClient();
      // クライアントの初期化で ?code= の交換が済んでいれば、ここでセッションが取れる
      let {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const params = new URLSearchParams(window.location.search);
        const codeParam = params.get("code");
        const tokenHash = params.get("token_hash");
        const type = params.get("type");
        if (codeParam) {
          // 自動の交換に失敗したとき（別の端末で開いた など）の理由を取る
          const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(codeParam);
          if (exErr) setLinkError(passwordErrorMessage(exErr.message, "リンクを確認できませんでした"));
          session = data?.session ?? null;
        } else if (tokenHash && (type === "recovery" || type === "invite" || type === "magiclink" || type === "email")) {
          // メールのテンプレートが token_hash を使う設定のとき
          const { data, error: otpErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (otpErr) setLinkError(passwordErrorMessage(otpErr.message, "リンクを確認できませんでした"));
          session = data?.session ?? null;
        }
      }
      if (!session) {
        setPhase("nolink");
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setPhase("nolink");
        return;
      }
      setEmail(user.email ?? "");
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const needsMfa = verifiedTotpFactors(user.factors).length > 0 && aal?.currentLevel !== "aal2";
      setPhase(needsMfa ? "mfa" : "form");
    })();
  }, []);

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeTotpCode(code);
    if (!normalized) {
      setError("認証アプリに表示されている6桁の数字を入れてください");
      return;
    }
    setError(null);
    setPending(true);
    const supabase = createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = verifiedTotpFactors(factors?.all)[0];
    if (!factor) {
      setPending(false);
      setError("登録済みの認証アプリが見つかりません。画面を再読み込みしてください");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: normalized,
    });
    setPending(false);
    if (verifyError) {
      setCode("");
      setError(mfaErrorMessage(verifyError.message, "確認できませんでした"));
      return;
    }
    setPhase("form");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setPending(false);
      setError(passwordErrorMessage(updateError.message, "パスワードを保存できませんでした"));
      return;
    }
    // 保存できたらそのまま業務画面へ（認証アプリが未登録なら登録画面、登録済みならコード入力になる）
    router.replace("/");
    router.refresh();
  };

  if (phase === "loading") {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" />
        リンクを確認しています…
      </p>
    );
  }

  if (phase === "nolink") {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {linkError ??
            "このリンクは無効か、期限が切れています。メールを送った端末・ブラウザと違う端末で開いたときもこの表示になります。"}
        </p>
        <p className="text-xs text-muted">下からもう一度メールを送れます。届いたメールは、この端末・ブラウザで開いてください。</p>
        <ForgotForm />
      </div>
    );
  }

  if (phase === "mfa") {
    return (
      <form onSubmit={verifyCode} className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-muted">
          {email && <b className="block text-foreground">{email}</b>}
          本人の確認のため、スマホの認証アプリに表示されている6桁の数字を入れてください。
        </p>
        <label className="text-sm">
          <span className="mb-1 block font-bold">認証アプリの6桁のコード</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="min-h-[48px] w-full rounded-xl border border-border bg-background px-4 text-center font-mono text-lg tracking-widest"
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
          <Check size={18} />
          {pending ? "確認中…" : "次へ"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      {email && (
        <p className="text-xs text-muted">
          <b className="text-foreground">{email}</b> のパスワードを設定します。
        </p>
      )}
      <label className="text-sm">
        <span className="mb-1 block font-bold">新しいパスワード</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
        {PASSWORD_MIN_LENGTH}文字以上で、英字と数字を混ぜてください。ほかのサービスと同じパスワードは使わないでください。
      </p>
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
        <Check size={18} />
        {pending ? "保存中…" : "保存する"}
      </button>
    </form>
  );
}
