// 外国人ID（例: V-1）。国籍を表す英字1文字 + 連番。
// 英字は国籍から決める。未定義の国籍は "X"。
// ※ 割り当て文字を変えたい場合はこの表を修正する（backfill SQL の CASE も合わせる）。
export const NATIONALITY_LETTER: Record<string, string> = {
  ベトナム: "V",
  カンボジア: "C",
  フィリピン: "P",
  インドネシア: "I",
  ミャンマー: "M",
  ネパール: "N",
  タイ: "T",
  モンゴル: "O",
  スリランカ: "S",
  バングラデシュ: "B",
  ラオス: "L",
  中国: "Z",
};

export function letterForNationality(nationality: string | null | undefined): string {
  const key = (nationality ?? "").trim();
  return NATIONALITY_LETTER[key] ?? "X";
}

// 既存コードから、その英字の次の連番を求めて "V-3" のような文字列を返す
export function nextWorkerCode(letter: string, existingCodes: (string | null)[]): string {
  let max = 0;
  const re = new RegExp(`^${letter}-(\\d+)$`);
  for (const c of existingCodes) {
    const m = c ? re.exec(c) : null;
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${letter}-${max + 1}`;
}
