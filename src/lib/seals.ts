// 印鑑BOX（外国人用に作った印鑑の保管・譲渡）。
//
// 印鑑に彫ったフリガナと、外国人のフリガナを突き合わせる。
// 「グエン」の印鑑は「グエン　ヴァン　アン」にも「レ　グエン」にも当てはまる（一部一致）。
// 空白・全角半角・ひらがなカタカナの違いは無視する。

export interface SealRow {
  id: string;
  kana: string;
  note: string;
  made_on: string | null;
  transferred_on: string | null; // null = 箱の中
  transferred_to: string | null; // 譲渡した外国人（分かれば）
  created_at: string;
  updated_at: string;
}

export type SealInput = Pick<SealRow, "kana" | "note" | "made_on">;

// フリガナを比べやすい形にする（NFKC・空白を除く・ひらがな→カタカナ・長音の揺れをそろえる）
export function normalizeKana(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .replace(/[\s　・･、,.]/g, "")
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[ｰ－—–]/g, "ー")
    .toUpperCase();
}

// 印鑑のフリガナが、外国人のフリガナの一部に当てはまるか
export function sealMatchesKana(sealKana: string, workerKana: string | null | undefined): boolean {
  const seal = normalizeKana(sealKana);
  const worker = normalizeKana(workerKana);
  if (!seal || !worker) return false;
  return worker.includes(seal);
}

// 箱の中にある印鑑か
export function isSealInBox(seal: Pick<SealRow, "transferred_on">): boolean {
  return !seal.transferred_on;
}

// その外国人に当てはまる、箱の中の印鑑（外国人詳細の「印鑑あり」用）
export function sealsForWorker<T extends Pick<SealRow, "kana" | "transferred_on">>(
  seals: T[],
  workerKana: string | null | undefined,
): T[] {
  return seals.filter((s) => isSealInBox(s) && sealMatchesKana(s.kana, workerKana));
}

// 名前の横に出す短い文（例: 印鑑あり「グエン」）。無ければ空
export function sealBadgeText(seals: Pick<SealRow, "kana">[]): string {
  if (seals.length === 0) return "";
  return `印鑑あり${seals.map((s) => `「${s.kana}」`).join("")}`;
}

// 一覧の並び: 箱の中を先（フリガナ順）、譲渡済みは譲渡日の新しい順
export function sortSeals<T extends SealRow>(seals: T[]): T[] {
  return [...seals].sort((a, b) => {
    const ai = isSealInBox(a) ? 0 : 1;
    const bi = isSealInBox(b) ? 0 : 1;
    if (ai !== bi) return ai - bi;
    if (ai === 0) return normalizeKana(a.kana).localeCompare(normalizeKana(b.kana), "ja");
    return (b.transferred_on ?? "").localeCompare(a.transferred_on ?? "");
  });
}
