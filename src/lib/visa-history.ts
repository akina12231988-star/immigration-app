// 在留資格の履歴（いつ何のビザが許可されたか）。
//
// 「2026年4月23日 特定技能1号 更新許可」のように、許可の日付と在留資格を古い順に並べる。
// 元にするのは次の4つ:
//   ・手で入れた分（worker_visa_history・0138）＝昔の許可などを自分で足せる
//   ・申請一覧（immigration_applications）の許可欄（許可日・許可時の在留資格・在留期限・カード番号）
//   ・在留カードの記録（worker_card_history・0137）＝書き換える前の内容
//   ・今の在留カード（workers）＝いちばん新しい許可
// 同じ許可が2つ以上の元に入っていることがあるので、許可日と在留資格が同じものはまとめる。
// 手で入れた分がいちばん優先（直した内容がそのまま出る）。

// 申請一覧の許可欄
export interface VisaHistoryApplication {
  content: string; // 申請の内容（在留資格変更許可（特定技能）など）
  approved: boolean;
  approval_date: string | null;
  granted_permit_date: string | null;
  granted_expiry_date: string | null;
  granted_card_no: string;
  visa_at_grant: string;
}

// 在留カードの記録（書き換える前の内容）
export interface VisaHistoryCard {
  residence_card_no: string;
  residence_status: string;
  residence_permit_date: string | null;
  residence_expiry_date: string | null;
}

// 今の在留カード
export interface VisaHistoryCurrent extends VisaHistoryCard {
  residence_period: string;
}

// 許可の種類（手で入れるときに選ぶ）
export const VISA_GRANT_KINDS = ["ビザ許可", "更新許可", "認定"] as const;
export type VisaGrantKind = (typeof VISA_GRANT_KINDS)[number];

// 手で入れた分
export interface VisaHistoryManual {
  id: string;
  permit_date: string;
  status: string;
  kind: string; // VISA_GRANT_KINDS のどれか
  expiry_date: string | null;
  card_no: string;
  note: string;
}

export interface VisaHistoryRow {
  permitDate: string; // 許可日（YYYY-MM-DD）
  status: string; // 在留資格（特定技能1号 など）
  label: string; // 「特定技能1号 更新許可」などの言い方
  expiryDate: string; // 在留期限（'' = 未登録）
  cardNo: string; // そのときの在留カード番号
  isCurrent: boolean; // 今の在留カードか
  manualId?: string; // 手で入れた分（直す・消すときに使う）
  note?: string; // 手で入れた分のメモ
}

// 申請の内容から、許可の言い方を決める（更新 / 変更 / 認定）
export function grantLabel(status: string, content: string): string {
  const name = status || "在留資格";
  if (content.includes("更新")) return `${name} 更新許可`;
  if (content.includes("認定")) return `${name} 認定`;
  if (content.includes("変更")) return `${name} ビザ許可`;
  return `${name} ビザ許可`;
}

// 申請の内容から在留資格を読む（許可時の在留資格が入っていないときの補い）。
// 「在留資格変更許可（特定技能）」→「特定技能」、「特定活動ビザ更新」→「特定活動」
export function statusFromContent(content: string): string {
  const paren = content.match(/[（(]([^）)]+)[）)]/);
  if (paren) return paren[1];
  for (const name of ["特定技能2号", "特定技能１号", "特定技能1号", "特定技能", "特定活動", "技能実習"]) {
    if (content.includes(name)) return name;
  }
  return "";
}

// 日付の新しさで比べるためのキー（未入力は空文字）
function dateOf(a: VisaHistoryApplication): string {
  return a.granted_permit_date || a.approval_date || "";
}

// 履歴を組み立てる（許可日の古い順）。許可日が入っていないものは出さない
export function buildVisaHistory(input: {
  apps: VisaHistoryApplication[];
  cards: VisaHistoryCard[];
  current: VisaHistoryCurrent | null;
  manual?: VisaHistoryManual[];
}): VisaHistoryRow[] {
  const rows: VisaHistoryRow[] = [];

  for (const a of input.apps) {
    const date = dateOf(a);
    // 許可されていない申請（取下げ・審査中）は履歴に出さない
    if (!date || !(a.approved || a.granted_permit_date)) continue;
    const status = a.visa_at_grant || statusFromContent(a.content);
    rows.push({
      permitDate: date,
      status,
      label: grantLabel(status, a.content),
      expiryDate: a.granted_expiry_date ?? "",
      cardNo: a.granted_card_no ?? "",
      isCurrent: false,
    });
  }

  for (const c of input.cards) {
    if (!c.residence_permit_date) continue;
    rows.push({
      permitDate: c.residence_permit_date,
      status: c.residence_status ?? "",
      label: `${c.residence_status || "在留資格"} ビザ許可`,
      expiryDate: c.residence_expiry_date ?? "",
      cardNo: c.residence_card_no ?? "",
      isCurrent: false,
    });
  }

  if (input.current?.residence_permit_date) {
    rows.push({
      permitDate: input.current.residence_permit_date,
      status: input.current.residence_status ?? "",
      label: `${input.current.residence_status || "在留資格"} ビザ許可`,
      expiryDate: input.current.residence_expiry_date ?? "",
      cardNo: input.current.residence_card_no ?? "",
      isCurrent: true,
    });
  }

  // 同じ許可（許可日＋在留資格）はまとめる。内容が多いほう（言い方・在留期限・番号）を残す
  const merged = new Map<string, VisaHistoryRow>();
  for (const row of rows) {
    const key = `${row.permitDate}_${row.status}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, row);
      continue;
    }
    merged.set(key, {
      ...prev,
      // 「更新許可」など、申請の内容から分かる言い方を優先する
      label: prev.label.includes("更新") || prev.label.includes("認定") ? prev.label : row.label,
      expiryDate: prev.expiryDate || row.expiryDate,
      cardNo: prev.cardNo || row.cardNo,
      isCurrent: prev.isCurrent || row.isCurrent,
    });
  }

  // 手で入れた分は、同じ許可（許可日＋在留資格）があっても入れ替える（直した内容を出す）
  for (const m of input.manual ?? []) {
    if (!m.permit_date) continue;
    const key = `${m.permit_date}_${m.status ?? ""}`;
    merged.set(key, {
      permitDate: m.permit_date,
      status: m.status ?? "",
      label: `${m.status || "在留資格"} ${m.kind || "ビザ許可"}`,
      expiryDate: m.expiry_date ?? "",
      cardNo: m.card_no ?? "",
      isCurrent: merged.get(key)?.isCurrent ?? false,
      manualId: m.id,
      note: m.note ?? "",
    });
  }

  return [...merged.values()].sort((a, b) => a.permitDate.localeCompare(b.permitDate));
}

// ---- 在留カード・指定書の画像を、どの許可のものかで結び付ける ----

// 画像1件（在留カード・指定書）。date はいつ時点の画像か（effective_on、無ければ登録日）
export interface VisaHistoryDoc {
  kind: string; // 在留カード / 指定書
  url: string;
  date: string; // YYYY-MM-DD
}

// 履歴の行に、その許可のときの在留カード・指定書の画像を付ける。
// その許可の日から次の許可の日の前日までに登録した画像を、その許可のものとみなす
// （いちばん新しい許可は、それ以降に登録した画像すべてが対象）。
export function attachVisaHistoryDocs<T extends { permitDate: string }>(
  rows: T[],
  docs: VisaHistoryDoc[],
): (T & { residenceCardUrl: string; designationUrl: string })[] {
  const sorted = [...rows].sort((a, b) => a.permitDate.localeCompare(b.permitDate));
  return sorted.map((row, i) => {
    const from = row.permitDate;
    const to = sorted[i + 1]?.permitDate ?? ""; // 次の許可の日（無ければ今まで）
    const inRange = docs.filter((d) => d.date >= from && (!to || d.date < to));
    const newest = (kind: string) =>
      inRange
        .filter((d) => d.kind === kind)
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.url ?? "";
    return { ...row, residenceCardUrl: newest("在留カード"), designationUrl: newest("指定書") };
  });
}

// ---- どの所属機関にいたときの許可かでまとめる ----

// 職歴1件（どの会社にいつからいつまでいたか）
export interface VisaHistoryEmployment {
  org_name: string;
  start_date: string;
  end_date: string | null; // null = 継続中
  visa: string;
}

export const NO_ORG_GROUP = "所属機関の記録なし";

// その日にどこの所属機関にいたか（在籍期間に入っている職歴。複数あれば新しく始まったほう）
export function orgAtDate(histories: VisaHistoryEmployment[], date: string): string {
  const hit = histories
    .filter((h) => h.visa !== "本国での職歴")
    .filter((h) => h.start_date <= date && (h.end_date === null || date <= h.end_date))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  return hit[hit.length - 1]?.org_name ?? "";
}

export interface VisaHistoryOrgGroup<T> {
  org: string;
  rows: T[];
}

// 許可を所属機関ごとにまとめる。並びは、その機関でいちばん古い許可の日の順。
// 在籍期間に当てはまる職歴が無い許可は最後にまとめる
export function groupVisaHistoryByOrg<T extends { permitDate: string }>(
  rows: T[],
  histories: VisaHistoryEmployment[],
): VisaHistoryOrgGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of [...rows].sort((a, b) => a.permitDate.localeCompare(b.permitDate))) {
    const org = orgAtDate(histories, row.permitDate) || NO_ORG_GROUP;
    groups.set(org, [...(groups.get(org) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([org, list]) => ({ org, rows: list }))
    .sort((a, b) => {
      if (a.org === NO_ORG_GROUP) return 1;
      if (b.org === NO_ORG_GROUP) return -1;
      return a.rows[0].permitDate.localeCompare(b.rows[0].permitDate);
    });
}

// ---- 在籍期間のあいだ使っていた在留カード（許可）を選ぶ ----

// 在籍期間（start〜end。end が空なら今も在籍中）のあいだに使っていた許可を返す。
// 許可は次の許可を受けるまで有効なので、期間の中で受けた許可だけでなく、
// 期間が始まる前に受けて期間中も使っていた許可も含める。
export function visaHistoryInPeriod<T extends { permitDate: string }>(
  rows: T[],
  start: string,
  end: string,
): T[] {
  const sorted = [...rows].sort((a, b) => a.permitDate.localeCompare(b.permitDate));
  return sorted.filter((r, i) => {
    const next = sorted[i + 1]?.permitDate ?? "";
    // 期間が終わったあとに受けた許可は関係ない
    if (end && r.permitDate > end) return false;
    // 期間が始まる前に次の許可へ切り替わっていれば、その許可は使っていない
    if (next && start && next <= start) return false;
    return true;
  });
}
