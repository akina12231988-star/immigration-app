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
  sswStart: string; // 特定技能（1号または2号）の最初の許可日 YYYY-MM-DD（入力画面の除外月の初期値に使う）
  grade2From: string; // 特定技能2号の最初の許可日 YYYY-MM-DD（2号移行の月割りに使う。1号のままなら ''）
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

// 証明書リストの初期値。入管の「定期届出 提出資料一覧表」の
// 「A 『一定の基準』を満たさない場合に提出いただく書類」のうち、
// 所属機関（会社）に取得をお願いするものを法人・個人事業主で出し分ける。
// 機関によって要らないものは印刷画面で消す。足りないものは足す
export function defaultCertificateItems(isCorporate: boolean): CertificateItem[] {
  const common: CertificateItem[] = [
    {
      name: "労働保険料の納付を確認できる書類",
      note: "概算・確定保険料申告書（事業主控）の写しと、対応する領収証書（口座振替結果通知ハガキ）の写し・直近1年分。労働保険事務組合に委託している場合は納入通知書と領収証書の写し",
    },
  ];
  if (isCorporate) {
    return [
      { name: "登記事項証明書", note: "法務局" },
      { name: "業務執行に関与する役員の住民票の写し", note: "マイナンバーの記載がなく、本籍地の記載があるもの" },
      ...common,
      {
        name: "社会保険料の納付を確認できる書類",
        note: "社会保険料納入状況回答票、又は健康保険・厚生年金保険料領収証書の写し（届出日の前々月までの12か月分・年金事務所）",
      },
      { name: "納税証明書（その3）", note: "税務署。源泉所得税及び復興特別所得税・法人税・消費税及び地方消費税" },
      { name: "法人住民税の納税証明書", note: "市町村・直近1年分" },
    ];
  }
  return [
    { name: "個人事業主の住民票の写し", note: "マイナンバーの記載がなく、本籍地の記載があるもの" },
    ...common,
    {
      name: "社会保険料の納付を確認できる書類（健康保険・厚生年金の適用事業所の場合）",
      note: "社会保険料納入状況回答票、又は健康保険・厚生年金保険料領収証書の写し（届出日の前々月までの12か月分・年金事務所）",
    },
    {
      name: "国民健康保険・国民年金の納付を確認できる書類（適用事業所でない場合）",
      note: "国民健康保険料（税）納付証明書（直近1年分）と、医療保険の資格情報の写し。国民年金は被保険者記録照会（納付Ⅱ）又は領収証書の写し（前々月までの12か月分）。保険者番号・基礎年金番号は黒塗り",
    },
    { name: "納税証明書（その3）", note: "税務署。源泉所得税及び復興特別所得税・申告所得税・消費税及び地方消費税・相続税・贈与税" },
    { name: "個人住民税の納税証明書", note: "市町村・直近1年分" },
  ];
}

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

// 「2025年度（令和7年度・2025年4月1日〜2026年3月31日）」。
// 賃金台帳には令和の年度で書かれていることが多いので、和暦も併記する
export function fiscalYearLabel(fy: number): string {
  const wareki = fy >= 2019 ? `令和${fy - 2018}年度・` : "";
  return `${fy}年度（${wareki}${fy}年4月1日〜${fy + 1}年3月31日）`;
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
// 許可の記録が無くても、現在の在留資格が特定技能なら対象にする:
// 現在の許可日 → 無ければこの機関の雇用開始日 → それも無ければ年度の初めから（すべて警告つき）
function sswStartDates(
  c: PayrollRequestCandidate,
  permits: PayrollPermit[],
  fyFrom: string,
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
  // 許可の記録がまだ登録されていない人。現在の在留資格が特定技能なら、
  // 対象年度に在籍していれば対象に載せる（開始日は分かる日付で補う）
  const kind = visaKind(c.residenceStatus);
  if (!kind) return { first1: null, first2: null, estimated: false };
  const date = c.residencePermitDate ?? c.startOn ?? fyFrom;
  return kind === "1号"
    ? { first1: date, first2: null, estimated: true }
    : { first1: null, first2: date, estimated: true };
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
    const { first1, first2, estimated } = sswStartDates(c, permitsByWorker[c.id] ?? [], fyFrom);
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
      sswStart,
      grade2From: first2 ?? "",
      note: notes.join("。"),
      warning: estimated
        ? "特定技能の許可日の記録が無いため、分かる日付（現在の許可日・雇用開始日・年度の初め）からお願いする期間を出しています。特定活動だった月が入っていないか確認し、外国人詳細の「在留資格の履歴」に許可日を登録してください"
        : "",
    });
  }

  // 名簿は読みやすいよう、ふりがな→氏名の順で並べる
  rows.sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, "ja"));
  return { rows, excluded };
}

// 自動の抽出に載らなかった人を、手で対象に入れるときの行。
// 特定技能の許可の記録が無くても、在籍期間と年度が重なれば入力を始められるようにする
// （期間は在籍期間だけで出すので、特定活動の月が混ざっていないか画面で確認してもらう）。
// 年度と在籍期間が重ならない人は null
export function manualPayrollRequestRow(
  c: PayrollRequestCandidate,
  fy: number,
): PayrollRequestRow | null {
  const { from: fyFrom, to: fyTo } = fiscalYearPeriod(fy);
  let from = fyFrom;
  if (c.startOn && c.startOn > from) from = c.startOn;
  const to = c.leavingOn && c.leavingOn < fyTo ? c.leavingOn : fyTo;
  if (from > to) return null;
  const grade = visaKind(c.residenceStatus) === "2号" ? SSW2 : SSW1;
  return {
    id: c.id,
    name: c.name,
    kana: c.kana,
    nationality: c.nationality,
    grade,
    fromYm: from.slice(0, 7),
    toYm: to.slice(0, 7),
    prevYear: false,
    prevFromYm: "",
    prevToYm: "",
    sswStart: c.startOn ?? fyFrom,
    grade2From: "",
    note: c.leavingOn && c.leavingOn <= fyTo ? `${jpDate(c.leavingOn)} 退職` : "",
    warning:
      "手で対象に入れた人です。特定技能の許可の記録が無いため、期間は在籍期間から出しています。特定活動だった月が入っていないか・号が合っているかを確認し、外国人詳細の「在留資格の履歴」に許可日を登録してください",
  };
}

// 印刷（PDF保存）のファイル名
export function payrollRequestFileName(orgName: string): string {
  const name = (orgName ?? "").trim().replace(/[\\/:*?"<>|]/g, "-");
  return name ? `定期報告書_賃金台帳・証明書のお願い_${name}` : "定期報告書_賃金台帳・証明書のお願い";
}
