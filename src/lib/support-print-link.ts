// 支援責任者・支援担当者の名簿（支援体制の説明）の印刷ページへのリンク。
//   org  … 所属機関ID（その機関の担当者だけを選んだ状態で開く）
//   back … 印刷ページの「←」で戻る画面（申請準備の詳細など、開いた元の画面）
export function supportPrintHref(orgId: string | null | undefined, back?: string | null): string {
  const q = new URLSearchParams();
  if (orgId) q.set("org", orgId);
  const b = safeBackPath(back);
  if (b) q.set("back", b);
  const s = q.toString();
  return `/support-org/print${s ? `?${s}` : ""}`;
}

// 戻る先として使えるサイト内のパスか（外のサイトへ飛ばされないよう「/」で始まるものだけ）
export function safeBackPath(back: string | null | undefined): string | null {
  const b = (back ?? "").trim();
  return b.startsWith("/") && !b.startsWith("//") && !b.startsWith("/\\") ? b : null;
}
