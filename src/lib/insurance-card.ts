// 保険証（健康保険）の記録の純ロジック。
//
// 現在の保険証（種類と画像）と履歴を worker_insurance_cards（0129）に持つ。
// created_at が最新の行が「現在の保険証」、それより前は履歴。
// 社保のときは、どの職歴（会社）の社保かを work_history_id で紐付ける。

// 保険証の種類（その他は kind_note に内容を自由入力）
export const INSURANCE_KINDS = ["国保", "マイナ保険証", "社保", "その他"] as const;

export interface WorkerInsuranceCardRow {
  id: string;
  worker_id: string;
  kind: string; // 国保 / マイナ保険証 / 社保 / その他（'' = 未設定）
  kind_note: string; // その他のときの内容
  work_history_id: string | null; // 社保のとき、どの職歴（会社）の社保か
  storage_path: string; // '' = 画像なしで種類だけ記録
  file_name: string;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string; // 登録した日付はここに自動で残る
}

// 職歴の参照（社保の紐付け先の表示に使う最小限）
export interface InsuranceHistoryRef {
  id: string;
  org_name: string;
  start_date: string;
  end_date: string | null;
}

// 保険証の表示名（例: 社保（○○株式会社）／その他（旅行保険）／国保）
export function insuranceCardLabel(
  card: Pick<WorkerInsuranceCardRow, "kind" | "kind_note" | "work_history_id"> | null,
  histories: InsuranceHistoryRef[],
): string {
  if (!card || !card.kind) return "";
  if (card.kind === "その他") {
    return card.kind_note ? `その他（${card.kind_note}）` : "その他";
  }
  if (card.kind === "社保") {
    const h = histories.find((x) => x.id === card.work_history_id);
    return h ? `社保（${h.org_name}）` : "社保";
  }
  return card.kind;
}

// 社保の紐付け先の選択肢の表示（職歴の会社名と期間）
export function historyOptionLabel(h: InsuranceHistoryRef): string {
  return `${h.org_name}（${h.start_date}〜${h.end_date ?? "現在"}）`;
}

// あとでやる手続き（国保・国民年金）の欄に出す、現在の保険証からのヒント。
// ok = すでに国保加入中 / attention = 退職したら切り替えが必要 / muted = 情報だけ
export function kokuhoInsuranceHint(
  card: Pick<WorkerInsuranceCardRow, "kind" | "kind_note" | "work_history_id"> | null,
  histories: InsuranceHistoryRef[],
): { tone: "ok" | "attention" | "muted"; text: string } {
  if (!card || !card.kind) {
    return {
      tone: "muted",
      text: "現在の保険証は未登録です。下の「保険証（健康保険）」の欄で登録すると、ここに国保加入が必要かどうかの目安が出ます。",
    };
  }
  const label = insuranceCardLabel(card, histories);
  if (card.kind === "国保") {
    return { tone: "ok", text: `現在の保険証: ${label} — すでに国保に加入中の記録があります。` };
  }
  if (card.kind === "社保") {
    return {
      tone: "attention",
      text: `現在の保険証: ${label} — 退職したら（許可が下りて転職するときも）国保・国民年金への切り替えが必要になります。`,
    };
  }
  // マイナ保険証は国保・社保どちらの資格でも使えるため、加入状況までは断定しない
  return { tone: "muted", text: `現在の保険証: ${label}` };
}
