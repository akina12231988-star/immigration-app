// 追加資料の提出依頼の「2回目以降の郵送」の記録（application_extra_requests.shipments・0201）。
//
// 追加資料を何回かに分けて入管へ送ることがある。1回目の郵送は従来どおり
// sent_on / tracking_no に残し、2回目以降はここに「郵送した日・送った資料・追跡番号」を足していく。
// 列が未適用（undefined）でも画面が壊れないよう、読むときは必ず shipmentsOf を通す。

export interface ExtraShipment {
  sent_on: string | null; // 郵送した日 YYYY-MM-DD
  items: string; // 送った資料
  tracking_no: string; // レターパックの追跡番号
}

export function emptyShipment(sentOn: string | null = null): ExtraShipment {
  return { sent_on: sentOn, items: "", tracking_no: "" };
}

// 保存してある jsonb（配列でない・項目が欠けていることがある）を、欠けを補った形で読む
export function shipmentsOf(raw: unknown): ExtraShipment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      sent_on: typeof s.sent_on === "string" && s.sent_on ? s.sent_on : null,
      items: typeof s.items === "string" ? s.items : "",
      tracking_no: typeof s.tracking_no === "string" ? s.tracking_no : "",
    }));
}

// i 番目の記録を直した配列を返す（元の配列は変えない）
export function updateShipmentAt(
  list: ExtraShipment[],
  i: number,
  patch: Partial<ExtraShipment>,
): ExtraShipment[] {
  return list.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
}

// i 番目の記録を消した配列を返す
export function removeShipmentAt(list: ExtraShipment[], i: number): ExtraShipment[] {
  return list.filter((_, idx) => idx !== i);
}

// 郵送した回数（1回目の sent_on / tracking_no が入っていればそれも数える）
export function shipmentCount(r: {
  sent_on?: string | null;
  tracking_no?: string;
  shipments?: unknown;
}): number {
  const first = r.sent_on || r.tracking_no ? 1 : 0;
  return first + shipmentsOf(r.shipments).length;
}
