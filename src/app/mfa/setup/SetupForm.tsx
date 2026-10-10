"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { mfaErrorMessage, normalizeTotpCode, totpFriendlyName } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/client";

interface Enrollment {
  factorId: string;
  qrCode: string; // SVG の data URL
  secret: string;
}

// 認証アプリの登録フォーム。開いたときにQRコードを発行し、6桁のコードで確認する
export function SetupForm({ next }: { next: string }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  // 開発時（Strict Mode）の二重実行で登録を2回発行しないように、1回のやり直しにつき1回だけ動かす。
  // 途中でやめる（cancelled）仕組みは入れない。入れると二重実行の1回目が途中で止められ、
  // 2回目はこの印で動かないため、QRコードが出なくなる
  const startedFor = useRef(-1);

  useEffect(() => {
    if (startedFor.current === retry) return;
    startedFor.current = retry;
    (async () => {
      const supabase = createClient();
      // 前回の途中でやめた登録（未確認の要素）が残っていると邪魔になるので消す
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.all ?? []) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: totpFriendlyName(),
      });
      if (enrollError || !data) {
        setLoadError(mfaErrorMessage(enrollError?.message, "QRコードを発行できませんでした"));
        return;
      }
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, [retry]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    const normalized = normalizeTotpCode(code);
    if (!normalized) {
      setError("認証アプリに表示されている6桁の数字を入れてください");
      return;
    }
    setError(null);
    setPending(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code: normalized,
    });
    if (verifyError) {
      setPending(false);
      setError(mfaErrorMessage(verifyError.message, "登録を確認できませんでした"));
      return;
    }
    router.replace(next);
    router.refresh();
  };

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShowSecret(true);
    }
  };

  if (loadError) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoadError(null);
            setRetry((n) => n + 1);
          }}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-bold"
        >
          <RefreshCw size={16} />
          やり直す
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
        <li>スマホで認証アプリを開き、「＋」や「アカウントを追加」を押す</li>
        <li>下のQRコードを読み取る（読み取れないときは「キーを表示」の文字列を手で入れる）</li>
        <li>アプリに表示された6桁の数字を下に入れて「登録する」を押す</li>
      </ol>

      <div className="flex flex-col items-center gap-2">
        {enrollment ? (
          // Supabase が返す QR コード（SVG の data URL）
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={enrollment.qrCode}
            alt="認証アプリ登録用のQRコード"
            width={192}
            height={192}
            className="rounded-xl bg-white p-2"
          />
        ) : (
          <div className="flex h-[192px] w-[192px] items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted">
            QRコードを発行中…
          </div>
        )}
        {enrollment && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5"
            >
              <KeyRound size={13} />
              {showSecret ? "キーを隠す" : "キーを表示"}
            </button>
            <button
              type="button"
              onClick={copySecret}
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "コピーしました" : "キーをコピー"}
            </button>
          </div>
        )}
        {enrollment && showSecret && (
          <p className="select-all break-all rounded-lg bg-background px-3 py-2 font-mono text-xs">
            {enrollment.secret}
          </p>
        )}
      </div>

      <label className="text-sm">
        <span className="mb-1 block font-bold">認証アプリの6桁のコード</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9０-９ \-]*"
          maxLength={8}
          required
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
        disabled={pending || !enrollment}
        className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-brand px-5 font-bold text-brand-foreground disabled:opacity-60"
      >
        <Check size={18} />
        {pending ? "確認中…" : "登録する"}
      </button>
      <p className="text-[11px] leading-relaxed text-muted">
        次回からは、パスワードのあとに認証アプリのコードを入れるだけです。スマホを替えたり紛失したときは、管理者に「認証アプリの解除」を頼むと、この画面でもう一度登録できます。
      </p>
    </form>
  );
}
