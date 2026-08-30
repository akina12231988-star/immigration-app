// 在留カードの券面から入力するための、値の正規化と形式チェック。
//
// カードの記載をそのまま入れてもらい、フォームに入る形（YYYY-MM-DD など）へそろえる。
// 個人情報そのものなので、この関数は受け取った値をログに出さない・保存しない。

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

// 券面の日付表記（例: 2028年08月24日）。YYYY-MM-DD 以外は空
export function cardFaceDate(iso: string): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}年${m[2]}月${m[3]}日` : "";
}

// 在留資格から券面の「就労制限の有無」を導く（このアプリで扱う在留資格のみ）。
// 分からない在留資格は空を返し、画面では「—」になる
export function workRestrictionLabel(status: string): string {
  const s = (status ?? "").normalize("NFKC").trim();
  if (!s) return "";
  if (s.startsWith("特定活動")) return "指定書により指定された就労活動のみ可";
  if (s.startsWith("技能実習") || s.startsWith("特定技能")) {
    return "在留資格に基づく就労活動のみ可";
  }
  return "";
}

// ---- 在留期間の自動計算 ----

function parseYmd(iso: string): { y: number; m: number; d: number } | null {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// 基準日に months か月を足した応当日（無い日は月末に丸め）
function addMonths(p: { y: number; m: number; d: number }, months: number) {
  const total = p.m - 1 + months;
  const y = p.y + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12 + 1;
  return { y, m, d: Math.min(p.d, daysInMonth(y, m)) };
}

function sameDay(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

function daysBetween(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

function formatPeriodMonths(months: number): string {
  if (months % 12 === 0) return `${months / 12}年`;
  if (months < 12) return `${months}月`;
  return `${Math.floor(months / 12)}年${months % 12}月`;
}

// 実際にある在留期間（月数）。更新許可のときの推定に使う
const STANDARD_PERIOD_MONTHS = [3, 4, 6, 12, 24, 36, 48, 60];

// 許可年月日と在留期間満了日から在留期間（「2年」「6月」など）を求める。
//
// - 変更・上陸許可: 満了日は許可日のちょうど N か月後（応当日。無い日は月末）なので
//   その月数をそのまま期間にする
// - 更新許可: 新しい満了日は「前の満了日 + 期間」なので許可日からは計算がずれる。
//   そこで「満了日から標準の期間を引いた日」（＝前の満了日）が、許可日から見て
//   後ろ3か月（更新は満了日の3か月前から申請できる）〜前2か月（満了日を過ぎても
//   特例期間中に許可が出ることがある）に収まる期間を探し、いちばん近いものを採る
// - どれにも当てはまらない（日付の入れ違いなど）は null。画面では登録値に戻し、
//   両方の日付が入っているのに計算できないときは注意を出して気付けるようにする
export function residencePeriodFromDates(permitDate: string, expiryDate: string): string | null {
  const p = parseYmd(permitDate);
  const e = parseYmd(expiryDate);
  if (!p || !e) return null;
  if (daysBetween(p, e) <= 0) return null;

  // 許可日のちょうど N か月後なら、その月数（標準に無い期間もそのまま出す）
  const months = (e.y - p.y) * 12 + (e.m - p.m);
  if (months > 0 && sameDay(addMonths(p, months), e)) return formatPeriodMonths(months);

  // 更新許可: 満了日から期間を引いた日（＝前の満了日）が許可日の前後3か月以内のもの
  let best: { months: number; delta: number } | null = null;
  for (const n of STANDARD_PERIOD_MONTHS) {
    const base = addMonths(e, -n);
    const diff = daysBetween(p, base); // 前の満了日 − 許可日（後ろが+）
    const delta = Math.abs(diff);
    if (diff >= -62 && diff <= 92 && (!best || delta < best.delta)) best = { months: n, delta };
  }
  return best ? formatPeriodMonths(best.months) : null;
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
  return fields;
}
