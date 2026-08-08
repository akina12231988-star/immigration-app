// 請求書を作成したか・督促状を発行したかの集計。
// 月末の請求書作成は所属機関ごとに1枚ずつ作るため、機関が増えると
// 「どこまで作ったか」「どこに督促状を出したか」が分からなくなる。
// 機関ごとの記録を数えて画面に出す。

export interface InvoiceCreatedRecord {
  organization_id: string;
  invoice_created_on: string | null;
}

export interface ReminderSentRecord {
  organization_id: string;
  reminder_sent_on: string | null;
}

// organization_id → 日付。日付が入っていない記録は入れない
function stampMap<T extends { organization_id: string }>(
  records: T[],
  pick: (record: T) => string | null,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of records) {
    const on = pick(r);
    if (r.organization_id && on) map[r.organization_id] = on;
  }
  return map;
}

// organization_id → 請求書を作成した日
export function invoiceCreatedMap(
  records: InvoiceCreatedRecord[],
): Record<string, string> {
  return stampMap(records, (r) => r.invoice_created_on);
}

// organization_id → 督促状を発行した日
export function reminderSentMap(records: ReminderSentRecord[]): Record<string, string> {
  return stampMap(records, (r) => r.reminder_sent_on);
}

export function isInvoiceCreated(
  createdOn: Record<string, string>,
  organizationId: string,
): boolean {
  return Boolean(organizationId && createdOn[organizationId]);
}

// 「作成済み 12 / 70機関」の数え上げ。所属機関が未設定の行は数に入れない
export function countInvoicesCreated(
  organizationIds: string[],
  createdOn: Record<string, string>,
): { created: number; total: number; remaining: number } {
  const ids = organizationIds.filter(Boolean);
  const created = ids.filter((id) => Boolean(createdOn[id])).length;
  return { created, total: ids.length, remaining: ids.length - created };
}

// 督促状を出した機関の数（出していない機関のほうが多いので、出した数だけ数える）
export function countRemindersSent(
  organizationIds: string[],
  sentOn: Record<string, string>,
): number {
  return organizationIds.filter((id) => id && sentOn[id]).length;
}
