// 退職の記録の「退職予定」と「退職日の変更の記録（会社への報告）」。
//
// ・退職予定: 退職日が決まっている／許可が降りてから退職（日付未定）を選べる。
//   特定活動の人が「許可が降りてから退職したい」ときなどに、日付が決まる前から記録しておける。
//   退職日を入れると、その日を過ぎたら自動で「退職」扱いになる（resignation-report.ts）。
// ・退職日の変更: 退職日が変わるたびに1件ずつ残し、会社に報告したか・報告日・了承をもらえたかを記録する。

// 退職日の決め方
export const LEAVING_TIMINGS = ["日付で決まっている", "許可が降りてから退職"] as const;
export type LeavingTiming = (typeof LEAVING_TIMINGS)[number];

// 保存値（'' は古い記録＝日付で決まっている／未定）を画面の選択肢に直す
export function leavingTimingOf(raw: string | null | undefined): LeavingTiming {
  return raw === "許可が降りてから退職" ? "許可が降りてから退職" : "日付で決まっている";
}

// 会社の了承
export const LEAVING_APPROVALS = ["", "了承済み", "了承待ち", "了承されなかった"] as const;
export type LeavingApproval = (typeof LEAVING_APPROVALS)[number];

// 退職日の変更1回ぶん
export interface LeavingDateChange {
  id: string;
  from: string | null; // 変更前の退職日（null = 未定）
  to: string | null; // 変更後の退職日（null = 未定）
  changed_on: string; // 変更した日（YYYY-MM-DD）
  reported: boolean; // 会社に報告したか
  reported_on: string; // 報告日（YYYY-MM-DD。'' = 未入力）
  approval: LeavingApproval; // 了承をもらえたか（'' = 未確認）
}

const dateOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

// 保存されている値（jsonb）を正規化。0173未適用・壊れた値は空配列
export function normalizeLeavingDateChanges(raw: unknown): LeavingDateChange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c, i) => ({
      id: typeof c.id === "string" && c.id ? c.id : `c${i}`,
      from: dateOrNull(c.from),
      to: dateOrNull(c.to),
      changed_on: typeof c.changed_on === "string" ? c.changed_on : "",
      reported: c.reported === true,
      reported_on: typeof c.reported_on === "string" ? c.reported_on : "",
      approval: (LEAVING_APPROVALS as readonly string[]).includes(c.approval as string)
        ? (c.approval as LeavingApproval)
        : "",
    }));
}

// 退職日が変わったら変更の記録を1件足す（変わっていなければそのまま）。
// 未定 → 日付（決まった）・日付 → 未定も変更として残す
export function appendLeavingDateChange(
  changes: LeavingDateChange[],
  from: string | null,
  to: string | null,
  today: string,
): LeavingDateChange[] {
  if ((from || null) === (to || null)) return changes;
  return [
    ...changes,
    {
      id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      from: from || null,
      to: to || null,
      changed_on: today,
      reported: false,
      reported_on: "",
      approval: "",
    },
  ];
}

// 会社にまだ報告していない変更の数（一覧で目立たせる）
export function unreportedLeavingChanges(changes: LeavingDateChange[]): number {
  return changes.filter((c) => !c.reported).length;
}

// 退職予定か（退職日がまだ来ていない、または許可待ちで日付未定）
export function isPlannedLeaving(
  r: { leaving_on: string | null; leaving_timing?: string | null },
  today: string,
): boolean {
  if (r.leaving_on) return r.leaving_on >= today;
  return leavingTimingOf(r.leaving_timing) === "許可が降りてから退職";
}

// "2026-10-15" → "2026/10/15"、null → "未定"
export function leavingDateLabel(d: string | null): string {
  return d ? d.replaceAll("-", "/") : "未定";
}

// 外国人詳細の TODO 欄に出す、退職の記録のひとこと（区分・届出の要否・退職日・退職予定・メモ）。
// 随時報告書を作らない特定活動の記録（TODO が無い）でも、退職予定があることが外国人詳細で分かるようにする
export interface ResignationTodoSummary {
  title: string; // 例:「退職予定（許可が降りてから退職）」「退職日 2026/10/15」
  badge: string; // 例:「届出不要」「随時報告書 準備中」
  detail: string; // 例:「自己都合 ・ 在留資格 特定活動 ・ 退職予定のメモ: …」
  planned: boolean; // 退職予定（まだ退職していない）か
}

export function resignationTodoSummary(
  r: {
    kind: string;
    leaving_on: string | null;
    leaving_timing?: string | null;
    leaving_plan_note?: string;
    residence_status?: string;
    report_needed?: boolean;
    todo_no?: string;
  },
  reportStatus: string, // 随時報告書の進み具合（adhocReportStatus）
  today: string,
): ResignationTodoSummary {
  const planned = isPlannedLeaving(r, today);
  const waitingPermit = leavingTimingOf(r.leaving_timing) === "許可が降りてから退職" && !r.leaving_on;
  const title = planned
    ? waitingPermit
      ? "退職予定（許可が降りてから退職・退職日 未定）"
      : `退職予定（${leavingDateLabel(r.leaving_on)}に退職）`
    : `退職 ${leavingDateLabel(r.leaving_on)}`;
  const badge = r.report_needed === false ? "届出不要" : `随時報告書 ${reportStatus}`;
  const detail = [
    r.kind,
    r.residence_status ? `在留資格 ${r.residence_status}` : "",
    r.todo_no ? `随時報告TODO ${r.todo_no}` : "",
    r.leaving_plan_note?.trim() ? `退職予定のメモ: ${r.leaving_plan_note.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" ・ ");
  return { title, badge, detail, planned };
}
