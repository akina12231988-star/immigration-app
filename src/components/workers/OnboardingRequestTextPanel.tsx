"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { RESUME_LANGS, type ResumeLang } from "@/lib/resume-tool/i18n";
import { resumeLangForNationality } from "@/lib/resume-tool/share";
import { onboardingRequestMessage, type OnboardingRequestDocKey } from "@/lib/onboarding-request-text";

// 在留資格変更の申請をしたあと、本人から送ってもらう入社書類（マイナンバー・通帳の見開き・扶養証明書・
// 履歴書・フリガナがわかる書類）でまだ無いものを、日本語＋母国語の文面にしてコピーできる。
// 母国語は国籍から決め、違えば選び直せる
export function OnboardingRequestTextPanel({
  missingKeys,
  nationality,
  name,
}: {
  missingKeys: OnboardingRequestDocKey[];
  nationality: string | null | undefined;
  name: string;
}) {
  const [lang, setLang] = useState<ResumeLang>(() => resumeLangForNationality(nationality));
  if (missingKeys.length === 0) return null;
  const text = onboardingRequestMessage(lang, missingKeys, name);
  return (
    <div className="rounded-xl border border-brand/40 bg-brand/5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-brand">
          <MessageSquareText size={14} />
          本人へ送ってもらう書類の依頼文（在留資格変更申請のあと）
        </p>
        <span className="rounded-md bg-seal/10 px-1.5 py-0.5 text-[11px] font-bold text-seal">まだ{missingKeys.length}件</span>
        <label className="ml-auto flex items-center gap-1 text-[11px] text-muted">
          母国語
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as ResumeLang)}
            className="min-h-[30px] rounded-lg border border-border bg-surface px-1.5 text-xs font-bold"
            aria-label="依頼文の母国語"
          >
            {RESUME_LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        まだ添付していない書類だけを並べた文面です。日本語のあとに母国語の同じ内容が続きます。コピーして Messenger などに貼ってください。添付すると文面から消えます。
      </p>
      <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-relaxed">
        {text}
      </pre>
      <div className="mt-2 flex justify-end">
        <CopyButton
          value={text}
          label="依頼文をコピー"
          size={15}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-bold text-brand-foreground"
        />
      </div>
    </div>
  );
}
