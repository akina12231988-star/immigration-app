// 請求書を作成したかどうかの集計。
// 月末の請求書作成は所属機関ごとに1枚ずつ作るため、機関が増えると
// 「どこまで作ったか」が分からなくなる。作成済みの機関を数えて画面に出す。

export interface InvoiceCreatedRecord {
  organization_id: string;
  invoice_created_on: string | null;
}

// organization_id → 請求書を作成した日。未作成（null）の記録は入れない
export function invoiceCreatedMap(
  records: InvoiceCreatedRecord[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of records) {
    if (r.organization_id && r.invoice_created_on) {
      map[r.organization_id] = r.invoice_created_on;
    }
  }
  return map;
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
