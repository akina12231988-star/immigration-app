// 随時報告書の署名済み届出書（スキャンしたPDF・画像）の置き場所。
//
// 退職の記録（0086）・契約内容変更の記録（0134）・支援委託終了の記録（0135）で
// 同じ仕組みを使うため、どのテーブル・どのフォルダに入れるかだけをここで持つ。
// 実体は非公開バケット app-files に保存し、署名付きURLでやり取りする。

export const ADHOC_FILE_KINDS = ["resignation", "contract-change", "support-end"] as const;
export type AdhocFileKind = (typeof ADHOC_FILE_KINDS)[number];

export interface AdhocFileTarget {
  table: string; // メタデータのテーブル
  column: string; // 記録を指す列
  prefix: string; // ストレージのフォルダ
  migration: string; // 未適用のときに案内するマイグレーション
}

export const ADHOC_FILE_TARGETS: Record<AdhocFileKind, AdhocFileTarget> = {
  resignation: {
    table: "resignation_files",
    column: "resignation_id",
    prefix: "resignation-files",
    migration: "0086_resignation_progress.sql",
  },
  "contract-change": {
    table: "contract_change_files",
    column: "contract_change_id",
    prefix: "contract-change-files",
    migration: "0134_contract_change_posting.sql",
  },
  "support-end": {
    table: "support_end_files",
    column: "support_end_id",
    prefix: "support-end-files",
    migration: "0135_support_end_records.sql",
  },
};

export function isAdhocFileKind(value: unknown): value is AdhocFileKind {
  return typeof value === "string" && (ADHOC_FILE_KINDS as readonly string[]).includes(value);
}
