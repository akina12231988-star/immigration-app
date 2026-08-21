// 在留カードの券面から入力するための、値の正規化と形式チェック。
//
// カードの記載をそのまま入れてもらい、フォームに入る形（YYYY-MM-DD など）へそろえる。
// 個人情報そのものなので、この関数は受け取った値をログに出さない・保存しない。

// 就労制限の有無（在留カードの記載どおりの4種類）
export const WORK_RESTRICTIONS = [
  "就労不可",
  "在留資格に基づく就労活動のみ可",
  "指定書により指定された就労活動のみ可",
  "就労制限なし",
] as const;

// 在留期間の書き方（よくあるもの。自由入力もできる）
export const RESIDENCE_PERIODS = ["6月", "1年", "2年", "3年", "4年", "5年"] as const;

// 元号 → その元年の西暦
const ERAS: Record<string, number> = { 令和: 2018, 平成: 1988, 昭和: 1925 };

function pad(n: string): string {
  return n.padStart(2, "0");
}

// カードの日付表記を YYYY-MM-DD にそろえる。
// 「2026-07-24」「2026/7/24」「2026.7.24」「2026年7月24日」「令和8年7月24日」に対応。
// 読み取れない書き方はそのまま返さず空にする（誤った日付を保存しないため）
export function normalizeCardDate(text: string): string {
  const raw = (text ?? "").normalize("NFKC").trim();
  if (!raw) return "";

  const era = raw.match(/^(令和|平成|昭和)\s*(\d{1,2}|元)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  if (era) {
    const base = ERAS[era[1]];
    const year = base + (era[2] === "元" ? 1 : Number(era[2]));
    return `${year}-${pad(era[3])}-${pad(era[4])}`;
  }

  const western = raw.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/);
  if (western) {
    const [, y, m, d] = western;
    if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return "";
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  return "";
}

// 在留カード番号の形式（英字2 + 数字8 + 英字2。例: AB12345678CD）。
// 形が違っても保存はできる（入力途中・特例の番号もあるため）。画面で注意だけ出す
export function isValidResidenceCardNo(value: string): boolean {
  return /^[A-Z]{2}\d{8}[A-Z]{2}$/.test(normalizeResidenceCardNo(value));
}

// 在留カード番号の整形（全角→半角・大文字・空白除去）
export function normalizeResidenceCardNo(value: string): string {
  return (value ?? "").normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");
}

// 在留カードの入力欄（画面が持つ値）
export interface ResidenceCardInput {
  name: string;
  birth: string;
  gender: string;
  nationality: string;
  address: string;
  residenceStatus: string;
  residencePeriod: string;
  expiryDate: string;
  permitDate: string;
  cardNo: string;
  workRestriction: string;
}

export function emptyResidenceCardInput(): ResidenceCardInput {
  return {
    name: "",
    birth: "",
    gender: "",
    nationality: "",
    address: "",
    residenceStatus: "",
    residencePeriod: "",
    expiryDate: "",
    permitDate: "",
    cardNo: "",
    workRestriction: "",
  };
}

// 入力欄から、外国人フォームに入れる値を組み立てる（空の項目は入れない）。
// 日付は YYYY-MM-DD にそろえ、読み取れない書き方の日付は入れない
export function residenceCardToWorkerFields(input: ResidenceCardInput): Record<string, string> {
  const fields: Record<string, string> = {};
  const put = (key: string, value: string) => {
    const v = value.trim();
    if (v) fields[key] = v;
  };
  put("name", input.name);
  put("birth", normalizeCardDate(input.birth));
  put("gender", input.gender);
  put("nationality", input.nationality);
  put("address", input.address);
  put("residence_status", input.residenceStatus);
  put("residence_period", input.residencePeriod);
  put("residence_expiry_date", normalizeCardDate(input.expiryDate));
  put("residence_permit_date", normalizeCardDate(input.permitDate));
  put("residence_card_no", normalizeResidenceCardNo(input.cardNo));
  put("work_restriction", input.workRestriction);
  return fields;
}
