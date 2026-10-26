import type { WorkHistoryRow } from "@/types/db";
import { isEmploymentHistory } from "@/types/ssw";

// 在留カード・指定書の画像を「どの在籍期間のものか」で振り分けるための計算。
// 画面（WorkerDocuments）から切り出して、単体テストできるようにしている。

// 過去の在籍期間（所属機関ごと）。現在の在籍は "current" タブで表す
export interface OrgPeriod {
  key: string;
  org: string;
  start: string; // 雇用開始日
  end: string; // 退職日
}

// 自分で追加した期間（在籍期間のタブにない期間。worker_document_periods・0197）
export interface ManualPeriod {
  id: string;
  label: string;
  startOn: string;
  endOn: string | null;
  isCurrent?: boolean; // 「現在」のタブにする期間（0199。1人につき1つ）
}

// 「現在」にした期間（無ければ null）
export function currentManualPeriod(manual: ManualPeriod[]): ManualPeriod | null {
  return manual.find((m) => m.isCurrent) ?? null;
}

// 追加した期間のタブのキー（画像は period_id で結び付くので、日付ではなくこのキーで振り分ける）
export function manualPeriodKey(id: string): string {
  return `manual-${id}`;
}

// 追加した期間のタブの表示名（名前があれば「名前 開始〜終了」、無ければ「開始〜終了」）
export function manualPeriodLabel(p: ManualPeriod): string {
  const range = `${p.startOn}〜${p.endOn ?? ""}`;
  return p.label.trim() ? `${p.label.trim()} ${range}` : range;
}

// 職歴から「過去の」在籍期間を組み立てる。
// 本国での職歴・無職は除外し、同じ機関が連続する職歴はひとつの在籍期間にまとめる。
// 退職日が今日以降の在籍（＝今も対象の期間）は過去ではなく「現在」として扱う。
export function buildPastPeriods(histories: WorkHistoryRow[], today: string): OrgPeriod[] {
  const rows = [...histories]
    .filter((h) => isEmploymentHistory(h.visa))
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

  const merged: { org: string; start: string; end: string | null }[] = [];
  for (const h of rows) {
    const org = h.org_name || "所属不明";
    const last = merged[merged.length - 1];
    if (last && last.org === org) {
      if (last.end !== null && (h.end_date === null || h.end_date > last.end)) {
        last.end = h.end_date;
      }
    } else {
      merged.push({ org, start: h.start_date, end: h.end_date });
    }
  }

  // 終了日があり、その日が過ぎている期間だけが「過去」タブ。
  // 継続中の在籍と、今日がまだ期間内の在籍は「現在」タブに含める
  return merged
    .filter(
      (p): p is { org: string; start: string; end: string } =>
        p.end !== null && p.end < today,
    )
    .sort((a, b) => (a.start > b.start ? -1 : 1))
    .map((p, i) => ({ key: `${p.start}-${i}`, org: p.org, start: p.start, end: p.end }));
}

// 期間の判定に使う日付。「いつ時点の書類か」（effective_on）が入っていればそれを優先し、
// 無ければ登録日で判定する（過去タブから登録した画像を当時の期間に出すため）
export function docPeriodDate(doc: { effectiveOn?: string | null; createdAt: string }): string {
  return (doc.effectiveOn || doc.createdAt).slice(0, 10);
}

// 画像の登録日（または effective_on）から、どの在籍期間の画像かを判定する。
// 期間内ならその期間、どこにも入らなければ「現在」。
// ただし過去の期間同士の隙間に登録された画像は、日付が近いほうの過去期間に寄せる
export function periodKeyFor(createdAt: string, past: OrgPeriod[], hasOngoing: boolean): string {
  const d = createdAt.slice(0, 10);
  for (const p of past) {
    if (p.start <= d && d <= p.end) return p.key;
  }
  if (past.length === 0) return "current";
  const newest = past[0];
  // 最後の退職日より後は「現在」（次の雇用に向けた登録とみなす）
  if (d > newest.end) return "current";
  if (hasOngoing && past.every((p) => d < p.start)) return "current";
  // 過去期間の隙間・最初の期間より前 → 日付が最も近い過去期間へ
  let bestKey = newest.key;
  let bestDist = Infinity;
  for (const p of past) {
    const dist =
      d < p.start
        ? Date.parse(p.start) - Date.parse(d)
        : Date.parse(d) - Date.parse(p.end);
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = p.key;
    }
  }
  return bestKey;
}

// 画像を「いつ時点の書類か」の新しい順に並べる（同じ日付なら登録が新しい順）。
// 日付を指定して登録した古い在留カードが、いまの最新の画像より前に出てしまわないようにするため
export function sortDocsByPeriodDate<T extends { effectiveOn?: string | null; createdAt: string }>(
  docs: T[],
): T[] {
  return [...docs].sort((a, b) => {
    const da = docPeriodDate(a);
    const db = docPeriodDate(b);
    if (da !== db) return da < db ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });
}

// 画像がどのタブのものかを判定する。追加した期間に結び付いた画像（period_id）はその期間
// （その期間が「現在」なら「現在」）、それ以外は日付（effective_on または登録日）で在籍期間に振り分ける
export function periodKeyForDoc(
  doc: { effectiveOn?: string | null; periodId?: string | null; createdAt: string },
  past: OrgPeriod[],
  hasOngoing: boolean,
  currentPeriodId: string | null = null,
): string {
  if (doc.periodId) return doc.periodId === currentPeriodId ? "current" : manualPeriodKey(doc.periodId);
  return periodKeyFor(docPeriodDate(doc), past, hasOngoing);
}

// タブの表示名（「現在」「過去（所属機関）開始〜終了」または追加した期間の名前）
export function periodLabelFor(
  key: string,
  past: OrgPeriod[],
  manual: ManualPeriod[] = [],
): string {
  const m = manual.find((x) => manualPeriodKey(x.id) === key);
  if (m) return manualPeriodLabel(m);
  const p = past.find((x) => x.key === key);
  return p ? `過去（${p.org}）${p.start}〜${p.end}` : "現在";
}

// タブの並び（「現在」の右に出す期間）。過去の在籍期間と追加した期間を混ぜて、
// 開始日の新しい順（左が新しく、右が古い）に自動で並べる。「現在」にした期間は「現在」のタブにまとまるので出さない
export interface PeriodTab {
  key: string;
  label: string;
  start: string;
  manual: ManualPeriod | null; // 追加した期間ならその内容（編集・削除に使う）
}

export function orderPeriodTabs(past: OrgPeriod[], manual: ManualPeriod[]): PeriodTab[] {
  const tabs: PeriodTab[] = [
    ...past.map((p) => ({
      key: p.key,
      label: `過去（${p.org}）${p.start}〜${p.end}`,
      start: p.start,
      manual: null,
    })),
    ...manual
      .filter((m) => !m.isCurrent)
      .map((m) => ({
        key: manualPeriodKey(m.id),
        label: manualPeriodLabel(m),
        start: m.startOn,
        manual: m,
      })),
  ];
  return tabs.sort((a, b) => (a.start === b.start ? 0 : a.start > b.start ? -1 : 1));
}

// 在留カード・指定書のタブ（現在／過去の在籍期間／追加した期間）に、在留資格の履歴のどの許可を出すか。
// 許可日で振り分ける: 追加した期間の範囲に入ればその期間、過去の在籍期間の範囲に入ればその期間、
// どこにも入らなければ「現在」。タブの横で在留カードを見ながら番号などを入れるのに使う
export function visaRowsForDocTab<T extends { permitDate: string }>(
  rows: T[],
  tabKey: string,
  past: OrgPeriod[],
  manual: ManualPeriod[],
): T[] {
  const keyFor = (d: string): string => {
    for (const m of manual) {
      // 「現在」にした期間の範囲に入る許可は「現在」のタブに出す
      if (m.startOn <= d && d <= (m.endOn ?? "9999-12-31")) return m.isCurrent ? "current" : manualPeriodKey(m.id);
    }
    for (const p of past) {
      if (p.start <= d && d <= p.end) return p.key;
    }
    return "current";
  };
  return rows.filter((r) => keyFor(r.permitDate) === tabKey);
}
