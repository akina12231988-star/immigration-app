"use client";

import { BankAccountGuideCard } from "@/components/BankAccountGuide";
import { examFeeAccountText } from "@/lib/exam-fee-account";

// 試験の代金の振込先（口座案内）。本人に送れるように、画像と文章をその場でコピーできる。
// 画像は本人の国籍に合わせた母国語のもの（フィリピン・インドネシア・カンボジア・ベトナム。
// それ以外は日本語）を先頭に出し、ほかの言語の画像も選んでコピーできる
export function ExamFeeAccountCard({
  fee,
  examLabel,
  nationality,
  compact = false,
}: {
  fee?: string; // 代金（分かっていれば文章に入れる）
  examLabel?: string; // 「２号農業試験」など
  nationality?: string | null; // 本人の国籍（国籍別の画像を先頭に出す）
  compact?: boolean; // 一覧の上などで小さく出す（画像のプレビューを出さない）
}) {
  return (
    <BankAccountGuideCard
      nationality={nationality}
      title="振込先の口座案内"
      text={examFeeAccountText(fee, examLabel)}
      textLabel="文章をコピー（口座と金額）"
      compact={compact}
    />
  );
}
