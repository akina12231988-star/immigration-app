// 定期届出（参考様式第3-6号）の準備のために、所属機関へFAXで送る
// 「賃金台帳・証明書のお願い」（A4縦の案内文）。
//
// 対象者は、届出対象年度（4月1日〜翌年3月31日）に特定技能1号・2号として
// 在籍していた人。特定活動（特定技能1号以降準備など）の期間は定期届出の
// 対象外なので、特定技能の許可日より前の月の賃金台帳はお願いしない。
// 昇給率の計算のために、2年以上継続して在籍している人は前年度分も一緒にお願いする。
// 証明書（納税証明書など）のリストは印刷画面で自由に足したり直したりできる。

// 在留許可の記録1件分（申請一覧の許可欄・在留カードの記録・手入力の履歴をまとめたもの）
export interface PayrollPermit {
  permitDate: string; // 許可日 YYYY-MM-DD
  visa: string; // そのときの在留資格（特定技能1号 など。未登録は空）
}

// 名簿の候補になる人（在籍中の人＋過去に在籍していた人）
export interface PayrollRequestCandidate {
  id: string;
  name: string;
  kana: string;
  nationality: string;
  residenceStatus: string; // 現在の在留資格
  residencePermitDate: string | null; // 現在の在留資格の許可日
  startOn: string | null; // この機関での雇用開始日
  leavingOn: string | null; // この機関での退職日（在籍中は null）
}

// 名簿の1行（自動で出した内容。印刷画面で手で直せる）
export interface PayrollRequestRow {
  id: string;
  name: string;
  kana: string;
  nationality: string;
  grade: string; // 名簿に出す在留資格（特定技能1号 / 特定技能2号）
  fromYm: string; // 賃金台帳をお願いする最初の月 YYYY-MM
  toYm: string; // 最後の月 YYYY-MM
  prevYear: boolean; // 前年度分（昇給率の計算用）もお願いするか
  prevFromYm: string; // 前年度分の最初の月 YYYY-MM（prevYear のときだけ使う）
  prevToYm: string; // 前年度分の最後の月 YYYY-MM
  note: string; // 備考の初期値（年度の途中の入社・退職など）
  warning: string; // 画面だけに出す注意（印刷には出ない。'' = なし）
}

// 名簿に載らない人と、その理由（画面で確認できるようにする）
export interface PayrollRequestExcluded {
  id: string;
  name: string;
  reason: string;
}

// 証明書リストの1行。印刷画面で自由に足す・消す・直す・並べ替えができる
export interface CertificateItem {
  name: string; // 書類名
  note: string; // 備考（取得先・何年度分 など）
}

// 証明書リストの初期値（定期届出の添付書類。作成要領の「特定技能所属機関に関する書類」から）。
// 機関によって要らないものは印刷画面で消す。足りないものは足す
export const DEFAULT_CERTIFICATE_ITEMS: CertificateItem[] = [
  { name: "労働保険料の納付を確認できる書類", note: "領収証書の写しなど・直近1年分" },
  { name: "社会保険料の納付を確認できる書類", note: "社会保険料納入状況照会回答票など（年金事務所）" },
  { name: "納税証明書（その3）", note: "税務署" },
  { name: "法人住民税の納付を確認できる書類", note: "直近1年度分（市町村）" },
];

// 返信期限の初期値（印刷日の2週間後）
export const PAYROLL_REQUEST_REPLY_DAYS = 14;

// 直近で終わった年度（4月始まり）の開始年。
// 例: 2026-04〜2027-03 の間は 2025（2025年度 = 2025-04-01〜2026-03-31 の分をお願いする）
export function lastEndedFiscalYear(today: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(today);
  if (!m) return new Date().getFullYear() - 1;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return month >= 4 ? year - 1 : year - 2;
}

// 年度の期間（YYYY-MM-DD）
export function fiscalYearPeriod(fy: number): { from: string; to: string } {
  return { from: `${fy}-04-01`, to: `${fy + 1}-03-31` };
}

// 「2025年度（2025年4月1日〜2026年3月31日）」
export function fiscalYearLabel(fy: number): string {
  return `${fy}年度（${fy}年4月1日〜${fy + 1}年3月31日）`;
}

// "2025-08" → 「2025年8月分」
export function ymText(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  return m ? `${Number(m[1])}年${Number(m[2])}月分` : ym;
}

// 「2025年8月分〜2026年3月分」
export function ymRangeText(fromYm: string, toYm: string): string {
  if (!fromYm || !toYm) return "";
  return fromYm === toYm ? ymText(fromYm) : `${ymText(fromYm)}〜${ymText(toYm)}`;
}

const SSW1 = "特定技能1号";
const SSW2 = "特定技能2号";

// "2025-08-20" → 「2025年8月20日」（備考に出す日付。形が違えばそのまま）
export function jpDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : ymd;
}

// 在留資格の表記ゆれ（全角数字・１号/一号など）をならして判定する
function visaKind(visa: string): "1号" | "2号" | null {
  const v = (visa ?? "").replace(/[１２]/g, (c) => (c === "１" ? "1" : "2"));
  // 「特定活動（特定技能1号以降準備）」のように特定活動の名前にも「特定技能」が入るので、先に外す
  if (v.includes("特定活動")) return null;
  if (!v.includes("特定技能")) return null;
  if (v.includes("2号")) return "2号";
  if (v.includes("1号")) return "1号";
  return null;
}

function minDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

// その人の特定技能1号・2号それぞれの最初の許可日。
// 許可の記録が無くても、現在の在留資格が特定技能なら現在の許可日で補う（警告つき）
function sswStartDates(
  c: PayrollRequestCandidate,
  permits: PayrollPermit[],
): { first1: string | null; first2: string | null; estimated: boolean } {
  let first1: string | null = null;
  let first2: string | null = null;
  for (const p of permits) {
    if (!p.permitDate) continue;
    const kind = visaKind(p.visa);
    if (kind === "1号") first1 = minDate(first1, p.permitDate);
    if (kind === "2号") first2 = minDate(first2, p.permitDate);
  }
  if (first1 || first2) return { first1, first2, estimated: false };
  // 許可の記録がまだ登録されていない人。現在の在留資格から補う
  const kind = visaKind(c.residenceStatus);
  if (kind === "1号" && c.residencePermitDate) return { first1: c.residencePermitDate, first2: null, estimated: true };
  if (kind === "2号" && c.residencePermitDate) return { first1: null, first2: c.residencePermitDate, estimated: true };
  return { first1: null, first2: null, estimated: false };
}

// 名簿を作る。candidates は在籍中の人＋過去に在籍していた人、permitsByWorker は在留許可の記録
export function buildPayrollRequestRows(
  candidates: PayrollRequestCandidate[],
  permitsByWorker: Record<string, PayrollPermit[]>,
  fy: number,
): { rows: PayrollRequestRow[]; excluded: PayrollRequestExcluded[] } {
  const { from: fyFrom, to: fyTo } = fiscalYearPeriod(fy);
  const refDate = `${fy + 1}-04-01`; // 作成年度の4月1日（昇給率の対象の判定日）
  const twoYearsBefore = `${fy - 1}-04-01`; // この日までに受入れ開始なら、判定日に2年以上
  const rows: PayrollRequestRow[] = [];
  const excluded: PayrollRequestExcluded[] = [];

  for (const c of candidates) {
    const { first1, first2, estimated } = sswStartDates(c, permitsByWorker[c.id] ?? []);
    const sswStart = minDate(first1, first2);
    if (!sswStart) {
      excluded.push({
        id: c.id,
        name: c.name,
        reason: `特定技能1号・2号の許可の記録がありません（現在の在留資格: ${c.residenceStatus || "未登録"}）。特定技能として在籍していたのに載らない場合は、外国人詳細の「在留資格の履歴」に許可日を足してください`,
      });
      continue;
    }

    // 賃金台帳をお願いする期間 = 年度 ∩ 特定技能の期間 ∩ この機関の在籍期間
    let from = fyFrom;
    if (sswStart > from) from = sswStart;
    if (c.startOn && c.startOn > from) from = c.startOn;
    const to = c.leavingOn && c.leavingOn < fyTo ? c.leavingOn : fyTo;
    if (from > to) {
      const reason =
        sswStart > fyTo
          ? `特定技能の許可日（${sswStart}）が対象年度より後です`
          : c.leavingOn && c.leavingOn < fyFrom
            ? `対象年度より前（${c.leavingOn}）に退職しています`
            : "対象年度に特定技能として在籍した期間がありません";
      excluded.push({ id: c.id, name: c.name, reason });
      continue;
    }

    // 名簿に出す在留資格は期間の終わりの時点の号。期間の途中で2号になった人は備考に書く
    const grade = first2 && first2 <= to ? SSW2 : SSW1;
    const notes: string[] = [];
    if (first2 && first2 > from && first2 <= to) notes.push(`期間の途中で特定技能2号へ移行（${jpDate(first2)}）`);
    // 雇用はしていたが特定技能になる前（特定活動など）の月を除いた場合は、その旨を備考に出す
    if (sswStart > fyFrom && c.startOn && c.startOn < sswStart) {
      notes.push(`特定技能の許可日（${jpDate(sswStart)}）より前の分は不要です`);
    }
    if (c.leavingOn && c.leavingOn <= fyTo) notes.push(`${jpDate(c.leavingOn)} 退職`);

    // 昇給率の対象（作成年度の4月1日時点で、同一機関・同一の号で2年以上継続）なら前年度分もお願いする
    const gradeStart = grade === SSW2 ? first2 : first1;
    let contStart = gradeStart ?? sswStart;
    if (c.startOn && c.startOn > contStart) contStart = c.startOn;
    const employedAtRef = !c.leavingOn || c.leavingOn >= refDate;
    const prevYear = employedAtRef && contStart <= twoYearsBefore;
    let prevFromYm = "";
    let prevToYm = "";
    if (prevYear) {
      let prevFrom = `${fy - 1}-04-01`;
      if (sswStart > prevFrom) prevFrom = sswStart;
      if (c.startOn && c.startOn > prevFrom) prevFrom = c.startOn;
      prevFromYm = prevFrom.slice(0, 7);
      prevToYm = `${fy}-03`;
    }

    rows.push({
      id: c.id,
      name: c.name,
      kana: c.kana,
      nationality: c.nationality,
      grade,
      fromYm: from.slice(0, 7),
      toYm: to.slice(0, 7),
      prevYear,
      prevFromYm,
      prevToYm,
      note: notes.join("。"),
      warning: estimated
        ? "特定技能の許可の記録が無いため、現在の在留資格の許可日からお願いする期間を出しています。特定活動から移行した時期と合っているか確認してください"
        : "",
    });
  }

  // 名簿は読みやすいよう、ふりがな→氏名の順で並べる
  rows.sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, "ja"));
  return { rows, excluded };
}

// 印刷（PDF保存）のファイル名
export function payrollRequestFileName(orgName: string): string {
  const name = (orgName ?? "").trim().replace(/[\\/:*?"<>|]/g, "-");
  return name ? `定期報告書_賃金台帳・証明書のお願い_${name}` : "定期報告書_賃金台帳・証明書のお願い";
}
