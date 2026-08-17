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

// 外国人IDの英字部分（例: "C-5" → "C"）。IDが無い・形が違う場合は null
export function codeLetter(code: string | null | undefined): string | null {
  const m = (code ?? "").trim().match(/^([A-Za-z])-\d+$/);
  return m ? m[1].toUpperCase() : null;
}

// 国籍を入れ直したときに外国人IDを振り直すかを決める。
//
// 申請登録から外国人を作ると国籍がまだ無いため X-1 のようなIDになる。
// あとから国籍を登録したら、その国の英字（カンボジアなら C）に振り直したい。
//   - IDがまだ無い → 採番する
//   - 国籍の英字が今のIDの英字と違う → 振り直す（X-1 → C-5、国籍の訂正 C-3 → V-8 も同じ）
//   - ただし国籍が未入力・対応表に無い国（X）のときは、すでに付いている国入りのIDは変えない
//     （国籍を消してしまったときにIDが X に戻るのを防ぐ）
export function shouldReissueWorkerCode(
  currentCode: string | null | undefined,
  nationality: string | null | undefined,
): boolean {
  const current = codeLetter(currentCode);
  if (!current) return true;
  const letter = letterForNationality(nationality);
  if (letter === "X") return false;
  return current !== letter;
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
