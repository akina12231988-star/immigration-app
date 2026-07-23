// 申請準備の書類チェックリスト。申請種別（在留資格変更 / 更新）と、国保・国民年金の
// 加入有無に応じて必要書類が変わる。各書類が「登録済み／不足」かを判定して、
// 現状どれが足りていないかを把握できるようにする。
//
// 書類ファイルの保存先は既存の仕組みを再利用する:
//  - 在留カード / パスポート … 外国人書類（onboarding_documents の cert_*）
//  - 顔写真 … workers.photo_path
//  - 源泉徴収票 … 源泉徴収票セクション（onboarding_documents の gensen_r{令和年}）
//  - 健康診断書 … 健康診断セクション（onboarding_documents の kenshin ＋ 受診日）
//  - 課税証明書 / 納税証明書 / 保険証 / 年金記録 … このチェックリスト専用（prep_*）

import { isHealthCheckValid } from "@/lib/health-check";
import { gensenDocKey } from "@/lib/onboarding";

export type PrepAppType = "変更" | "更新";
export const PREP_APP_TYPES: PrepAppType[] = ["変更", "更新"];

export interface PrepChecklistMeta {
  app_type: "" | PrepAppType;
  has_kokuho: boolean;
  has_nenkin: boolean;
  target_reiwa: number | null;
  kenshin_items_ok: boolean;
}

export const EMPTY_PREP_META: PrepChecklistMeta = {
  app_type: "",
  has_kokuho: false,
  has_nenkin: false,
  target_reiwa: null,
  kenshin_items_ok: false,
};

// 書類の判定元
type Source =
  | { kind: "doc"; docKey: string } // onboarding_documents の固定キー（cert_* / prep_*）
  | { kind: "gensenYear" } // gensen_r{target_reiwa}
  | { kind: "photo" } // workers.photo_path
  | { kind: "health" }; // 健康診断（kenshin ＋ 受診日1年以内 ＋ 項目確認）

export interface PrepDocDef {
  id: string;
  label: string; // 年度が付くものは yearKind で「令和○年分/年度」を付与
  yearKind?: "年分" | "年度";
  appliesTo: PrepAppType[]; // 必要になる申請種別
  requiredIf?: "kokuho" | "nenkin"; // 条件付き（加入時のみ必要）
  viaMail?: boolean; // 郵送請求（課税・納税証明書）で取得するもの
  note?: string;
  source: Source;
  manageInline: boolean; // true: この画面でファイルを保存/差し替え/削除する（prep_*）
  managedIn?: string; // false のとき、どのセクションで管理するかの案内
}

// prep_* の書類キー（このチェックリスト専用の保存先）
export const PREP_DOC_KEYS = [
  "prep_kazei",
  "prep_nozei_shiken",
  "prep_nozei_kokuho",
  "prep_hokensho",
  "prep_nenkin",
] as const;

export function isPrepDocKey(key: string): boolean {
  return /^prep_[a-z0-9_]+$/.test(key);
}

export const PREP_DOC_DEFS: PrepDocDef[] = [
  {
    id: "zairyu",
    label: "在留カード（両面・現住所がわかるもの）",
    appliesTo: ["変更", "更新"],
    source: { kind: "doc", docKey: "cert_zairyu" },
    manageInline: false,
    managedIn: "外国人書類",
  },
  {
    id: "photo",
    label: "顔写真",
    appliesTo: ["変更", "更新"],
    source: { kind: "photo" },
    manageInline: false,
    managedIn: "写真",
  },
  {
    id: "passport",
    label: "パスポート",
    appliesTo: ["変更", "更新"],
    source: { kind: "doc", docKey: "cert_passport" },
    manageInline: false,
    managedIn: "外国人書類",
  },
  {
    id: "gensen",
    label: "源泉徴収票",
    yearKind: "年分",
    appliesTo: ["変更", "更新"],
    source: { kind: "gensenYear" },
    manageInline: false,
    managedIn: "源泉徴収票",
  },
  {
    id: "kazei",
    label: "課税証明書",
    yearKind: "年度",
    appliesTo: ["変更", "更新"],
    viaMail: true,
    note: "その年度の1月1日時点の住所も確認が必要",
    source: { kind: "doc", docKey: "prep_kazei" },
    manageInline: true,
  },
  {
    id: "nozei_shiken",
    label: "納税証明書（市県民税）",
    yearKind: "年度",
    appliesTo: ["変更", "更新"],
    viaMail: true,
    source: { kind: "doc", docKey: "prep_nozei_shiken" },
    manageInline: true,
  },
  {
    id: "nozei_kokuho",
    label: "納税証明書（国保税）",
    yearKind: "年度",
    appliesTo: ["変更", "更新"],
    requiredIf: "kokuho",
    viaMail: true,
    source: { kind: "doc", docKey: "prep_nozei_kokuho" },
    manageInline: true,
  },
  {
    id: "hokensho",
    label: "保険証の画像（有効期限内）",
    appliesTo: ["変更"],
    requiredIf: "kokuho",
    source: { kind: "doc", docKey: "prep_hokensho" },
    manageInline: true,
  },
  {
    id: "nenkin",
    label: "年金記録",
    appliesTo: ["変更", "更新"],
    requiredIf: "nenkin",
    source: { kind: "doc", docKey: "prep_nenkin" },
    manageInline: true,
  },
  {
    id: "kenshin",
    label: "健康診断書（過去1年以内に受診したもの）",
    appliesTo: ["変更"],
    note: "1〜3号とは別に病院発行のものも可。受診項目が足りているかの確認が必要",
    source: { kind: "health" },
    manageInline: false,
    managedIn: "健康診断",
  },
];

// 令和年つきの表示名（年度未設定は「令和?年」）
export function prepDocLabel(def: PrepDocDef, targetReiwa: number | null): string {
  if (!def.yearKind) return def.label;
  const y = targetReiwa != null ? `令和${targetReiwa}` : "令和?";
  return `${y}${def.yearKind} ${def.label}`;
}

// その申請種別・条件で必要な書類か
export function isRequired(def: PrepDocDef, meta: PrepChecklistMeta): boolean {
  if (!meta.app_type) return false;
  if (!def.appliesTo.includes(meta.app_type)) return false;
  if (def.requiredIf === "kokuho" && !meta.has_kokuho) return false;
  if (def.requiredIf === "nenkin" && !meta.has_nenkin) return false;
  return true;
}

export interface PrepDocSources {
  // onboarding_documents のうち storage_path があるキーの集合
  filledDocKeys: Set<string>;
  photoPath: string | null;
  healthCheckOn: string | null;
}

// その書類が揃っているか（登録済みか）
export function isSatisfied(
  def: PrepDocDef,
  meta: PrepChecklistMeta,
  sources: PrepDocSources,
  today: string,
): boolean {
  switch (def.source.kind) {
    case "doc":
      return sources.filledDocKeys.has(def.source.docKey);
    case "gensenYear":
      return meta.target_reiwa != null && sources.filledDocKeys.has(gensenDocKey(meta.target_reiwa));
    case "photo":
      return !!sources.photoPath;
    case "health":
      return (
        sources.filledDocKeys.has("kenshin") &&
        isHealthCheckValid(sources.healthCheckOn, today) &&
        meta.kenshin_items_ok
      );
  }
}

export interface PrepDocStatus {
  def: PrepDocDef;
  required: boolean;
  satisfied: boolean;
}

// 必要書類それぞれの状態と、不足件数を返す
export function evaluatePrepChecklist(
  meta: PrepChecklistMeta,
  sources: PrepDocSources,
  today: string,
): { items: PrepDocStatus[]; missing: PrepDocStatus[] } {
  const items = PREP_DOC_DEFS.filter((def) => isRequired(def, meta)).map((def) => ({
    def,
    required: true,
    satisfied: isSatisfied(def, meta, sources, today),
  }));
  return { items, missing: items.filter((i) => !i.satisfied) };
}
