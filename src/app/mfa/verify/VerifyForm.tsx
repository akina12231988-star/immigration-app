"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { mfaErrorMessage, normalizeTotpCode, verifiedTotpFactors } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/client";

// 認証アプリの6桁のコードを確認して、セッションを二段階認証済み（aal2）にする
export function VerifyForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeTotpCode(code);
    if (!normalized) {
      setError("認証アプリに表示されている6桁の数字を入れてください");
      return;
    }
    setError(null);
    setPending(true);
    const supabase = createClient();
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const factor = verifiedTotpFactors(factors?.all)[0];
    if (listError || !factor) {
      setPending(false);
      setError(mfaErrorMessage(listError?.message, "登録済みの認証アプリが見つかりません。画面を再読み込みしてください"));
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: normalized,
    });
    if (verifyError) {
      setPending(false);
      setCode("");
      setError(mfaErrorMessage(verifyError.message, "確認できませんでした"));
      return;
    }
    router.replace(next);
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="text-sm">
        <span className="mb-1 block font-bold">6桁のコード</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9０-９ \-]*"
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
        <LogIn size={18} />
        {pending ? "確認中…" : "ログイン"}
      </button>
      <p className="text-[11px] leading-relaxed text-muted">
        コードは30秒ごとに変わります。通らないときは、次に表示されたコードで試してください。スマホを替えた・紛失したときは管理者に「認証アプリの解除」を頼んでください。
      </p>
    </form>
  );
}
