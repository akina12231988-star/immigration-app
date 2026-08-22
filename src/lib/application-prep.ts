// 申請準備の書類チェックリスト。申請種別（在留資格変更 / 更新）と、国保・国民年金の
// 加入有無に応じて必要書類が変わる。各書類が「登録済み／不足」かを判定して、
// 現状どれが足りていないかを把握できるようにする。
//
// 書類ファイルの保存先は既存の仕組みを再利用する:
//  - 在留カード … 在留カード・指定書（worker_documents）
//  - パスポート … 出入国の記録のパスポートの記録（worker_passport_files）
//  - 合格証 … 基本情報の各合格名の下（onboarding_documents の cert_*）
//  - 顔写真 … workers.photo_path
//  - 源泉徴収票 … 源泉徴収票セクション（onboarding_documents の gensen_r{令和年}）
//  - 健康診断書 … 健康診断セクション（onboarding_documents の kenshin ＋ 受診日）
//  - 課税証明書 / 納税証明書 … このチェックリスト専用・対象年度ごとに蓄積（prep_*_r{令和年}）
//  - 保険証 / 年金記録 … このチェックリスト専用・最新のみ（prep_*）

import { gensenDocKey } from "@/lib/onboarding";

export type PrepAppType = "変更" | "更新" | "認定" | "特定活動";
export const PREP_APP_TYPES: PrepAppType[] = ["変更", "更新", "認定", "特定活動"];

// 申請種別の表示名
export const PREP_APP_TYPE_LABELS: Record<PrepAppType, string> = {
  変更: "在留資格変更申請",
  更新: "在留資格更新申請",
  認定: "在留資格認定申請",
  特定活動: "特定活動へ資格変更申請",
};

export interface PrepChecklistMeta {
  app_type: "" | PrepAppType;
  has_kokuho: boolean;
  has_nenkin: boolean;
  target_reiwa: number | null;
  kenshin_items_ok: boolean;
  tantou: string; // 担当者（'' = 未定。申請一覧からもあとで設定できる）
  cert_pattern: "" | PrepCertPattern; // 合格証の組み合わせ（'' = 未選択・合格証3種を表示）
}

// 合格証の組み合わせ。申請内容で必要な合格証が変わる
export type PrepCertPattern = "専門級" | "別分野・専門級" | "専門外・日本語" | "技能評価調書";
export const PREP_CERT_PATTERNS: { value: PrepCertPattern; label: string }[] = [
  { value: "専門級", label: "専門級の合格証あり（同じ分野で就職）→ 専門級のみ" },
  { value: "別分野・専門級", label: "専門級以外の分野で就職（専門級あり）→ 専門外＋専門級" },
  { value: "専門外・日本語", label: "専門級の合格証なし → 専門外＋日本語の合格証" },
  { value: "技能評価調書", label: "専門級なし・技能実習2号を良好修了 → 技能評価調書" },
];

export const EMPTY_PREP_META: PrepChecklistMeta = {
  app_type: "",
  has_kokuho: false,
  has_nenkin: false,
  target_reiwa: null,
  kenshin_items_ok: false,
  tantou: "",
  cert_pattern: "",
};

// 申請準備・申請一覧で選ぶ担当者の名簿
export const PREP_TANTOU_OPTIONS = [
  "市原　彩奈",
  "田上　夏季",
  "大元　麗奈",
  "秋吉　伽恋",
  "野口　明菜",
] as const;

// 書類の判定元
type Source =
  | { kind: "doc"; docKey: string } // onboarding_documents の固定キー（cert_* / prep_*）
  | { kind: "docYear"; baseKey: string } // 対象年度ごとに蓄積（{baseKey}_r{target_reiwa}）
  | { kind: "gensenYear" } // gensen_r{target_reiwa}
  | { kind: "photo" } // workers.photo_path
  | { kind: "health" } // 健康診断（kenshin ＋ 受診日1年以内 ＋ 項目確認）
  | { kind: "residenceCardDoc" } // 在留カード・指定書（worker_documents の在留カード）
  | { kind: "passportFile" }; // 出入国の記録のパスポートの記録（worker_passport_files）

// 年度付き書類の保存キー（例: prep_kazei_r7）。年度ごとに別ファイルとして蓄積される
export function prepYearDocKey(baseKey: string, reiwa: number): string {
  return `${baseKey}_r${reiwa}`;
}

export interface PrepDocDef {
  id: string;
  label: string; // 年度が付くものは yearKind で「令和○年分/年度」を付与
  yearKind?: "年分" | "年度";
  appliesTo: PrepAppType[]; // 必要になる申請種別
  requiredIf?: "kokuho" | "nenkin"; // 条件付き（加入時のみ必要）
  certPatterns?: PrepCertPattern[]; // 合格証の組み合わせで必要になる書類（未選択時は調書以外を表示）
  viaMail?: boolean; // 郵送請求（課税・納税証明書）で取得するもの
  // 年つき書類の対象年（令和）の決め方:
  // target=対象年度そのまま / target-1=対象年度の前年（源泉徴収票） / current=現時点の最新年度（国保税）
  yearMode?: "target" | "target-1" | "current";
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
  "prep_suisenjo",
  "prep_hyoka_chosho",
] as const;

export function isPrepDocKey(key: string): boolean {
  return /^prep_[a-z0-9_]+$/.test(key);
}

export const PREP_DOC_DEFS: PrepDocDef[] = [
  {
    id: "zairyu",
    label: "在留カード（両面・現住所がわかるもの）",
    appliesTo: ["変更", "更新", "認定", "特定活動"],
    source: { kind: "residenceCardDoc" },
    manageInline: false,
    managedIn: "在留カード・指定書",
  },
  {
    id: "photo",
    label: "顔写真",
    appliesTo: ["変更", "更新", "認定", "特定活動"],
    source: { kind: "photo" },
    manageInline: false,
    managedIn: "写真",
  },
  {
    id: "passport",
    label: "パスポート",
    appliesTo: ["変更", "更新", "認定", "特定活動"],
    source: { kind: "passportFile" },
    manageInline: false,
    managedIn: "出入国の記録（パスポートの記録）",
  },
  {
    id: "gensen",
    label: "源泉徴収票",
    yearKind: "年分",
    yearMode: "target-1", // 課税○年度に対して源泉徴収票は前年分（例: 令和7年度課税→令和6年分源泉）
    appliesTo: ["変更", "更新", "認定"],
    source: { kind: "gensenYear" },
    manageInline: false,
    managedIn: "源泉徴収票",
  },
  {
    id: "kazei",
    label: "課税証明書",
    yearKind: "年度",
    appliesTo: ["変更", "更新", "認定"],
    viaMail: true,
    note: "その年度の1月1日時点の住所も確認が必要",
    source: { kind: "docYear", baseKey: "prep_kazei" },
    manageInline: true,
  },
  {
    id: "nozei_shiken",
    label: "納税証明書（市県民税）",
    yearKind: "年度",
    appliesTo: ["変更", "更新", "認定"],
    viaMail: true,
    source: { kind: "docYear", baseKey: "prep_nozei_shiken" },
    manageInline: true,
  },
  {
    id: "nozei_kokuho",
    label: "納税証明書（国保税）",
    yearKind: "年度",
    yearMode: "current", // 国保税は現時点の最新年度を発行
    appliesTo: ["変更", "更新", "認定"],
    requiredIf: "kokuho",
    viaMail: true,
    note: "現時点の最新年度のものを発行",
    source: { kind: "doc", docKey: "prep_nozei_kokuho" },
    manageInline: true,
  },
  {
    id: "hokensho",
    // 2024年12月以降は保険証が新規発行されないため、資格確認証・資格情報のお知らせも同じ枠で扱う
    label: "保険証・資格確認証の画像（有効期限内）",
    appliesTo: ["変更", "更新", "認定"],
    requiredIf: "kokuho",
    note: "マイナ保険証の人は「資格情報のお知らせ」でも可",
    source: { kind: "doc", docKey: "prep_hokensho" },
    manageInline: true,
  },
  {
    id: "nenkin",
    label: "年金記録",
    appliesTo: ["変更", "更新", "認定"],
    requiredIf: "nenkin",
    source: { kind: "doc", docKey: "prep_nenkin" },
    manageInline: true,
  },
  {
    id: "kenshin",
    label: "健康診断書（過去1年以内に受診したもの）",
    appliesTo: ["変更", "認定"],
    note: "1〜3号とは別に病院発行のものも可。受診項目が足りているかの確認が必要",
    source: { kind: "health" },
    manageInline: false,
    managedIn: "健康診断",
  },
  {
    id: "suisenjo",
    label: "推薦状",
    appliesTo: ["変更", "認定"],
    note: "送り出し機関、または大使館への郵送請求で取得する（ベトナム: 技能実習→特定活動→特定技能の資格変更の場合は発行はいらない）",
    source: { kind: "doc", docKey: "prep_suisenjo" },
    manageInline: true,
  },
  {
    id: "cert_senmonkyu",
    label: "専門級の合格証",
    appliesTo: ["変更", "認定", "特定活動"],
    certPatterns: ["専門級", "別分野・専門級"],
    source: { kind: "doc", docKey: "cert_senmonkyu" },
    manageInline: false,
    managedIn: "基本情報（専門級の合格名の下）",
  },
  {
    id: "cert_nihongo",
    label: "日本語の合格証",
    appliesTo: ["変更", "認定", "特定活動"],
    certPatterns: ["専門外・日本語"],
    note: "専門級の合格証がない場合は必須",
    source: { kind: "doc", docKey: "cert_nihongo" },
    manageInline: false,
    managedIn: "基本情報（その他の資格・合格名の下）",
  },
  {
    id: "cert_senmongai",
    label: "専門外の合格証",
    appliesTo: ["変更", "認定", "特定活動"],
    certPatterns: ["別分野・専門級", "専門外・日本語"],
    note: "専門級以外の分野で就職する場合に必要",
    source: { kind: "doc", docKey: "cert_senmongai" },
    manageInline: false,
    managedIn: "基本情報（その他の資格・合格名の下）",
  },
  {
    id: "hyoka_chosho",
    label: "技能評価調書",
    appliesTo: ["変更", "認定", "特定活動"],
    certPatterns: ["技能評価調書"],
    note: "専門級の合格証はないが、技能実習2号まで良好修了した場合に必要",
    source: { kind: "doc", docKey: "prep_hyoka_chosho" },
    manageInline: true,
  },
];

// 年つき書類の対象年（令和）を決める。yearMode に応じて対象年度そのまま/前年/最新年度。
export function prepDocYear(
  def: PrepDocDef,
  targetReiwa: number | null,
  currentReiwa: number,
): number | null {
  if (!def.yearKind) return null;
  switch (def.yearMode ?? "target") {
    case "target":
      return targetReiwa;
    case "target-1":
      return targetReiwa != null ? targetReiwa - 1 : null;
    case "current":
      return currentReiwa;
  }
}

// 令和年つきの表示名（対象年が決まらないときは「令和?」）
export function prepDocLabel(
  def: PrepDocDef,
  targetReiwa: number | null,
  currentReiwa: number,
): string {
  if (!def.yearKind) return def.label;
  const year = prepDocYear(def, targetReiwa, currentReiwa);
  const y = year != null ? `令和${year}` : "令和?";
  return `${y}${def.yearKind} ${def.label}`;
}

// その申請種別・条件で必要な書類か
export function isRequired(def: PrepDocDef, meta: PrepChecklistMeta): boolean {
  if (!meta.app_type) return false;
  if (!def.appliesTo.includes(meta.app_type)) return false;
  if (def.requiredIf === "kokuho" && !meta.has_kokuho) return false;
  if (def.requiredIf === "nenkin" && !meta.has_nenkin) return false;
  if (def.certPatterns) {
    // 組み合わせ未選択のときは調書以外（合格証3種）を表示して選択を促す
    if (!meta.cert_pattern) return def.id !== "hyoka_chosho";
    return def.certPatterns.includes(meta.cert_pattern);
  }
  return true;
}

export interface PrepDocSources {
  // onboarding_documents のうち storage_path があるキーの集合
  filledDocKeys: Set<string>;
  photoPath: string | null;
  // 在留カード・指定書（worker_documents）に在留カードの画像があるか
  hasResidenceCard?: boolean;
  // 出入国の記録のパスポートの記録（worker_passport_files）にファイルがあるか
  hasPassportFile?: boolean;
  // 健康診断書が「揃っている」か（様式・受診項目・就労可の後日結果まで含めた判定。健康診断書の詳細ページで管理）
  healthComplete: boolean;
}

// その書類が揃っているか（登録済みか）
export function isSatisfied(
  def: PrepDocDef,
  meta: PrepChecklistMeta,
  sources: PrepDocSources,
): boolean {
  switch (def.source.kind) {
    case "doc":
      return sources.filledDocKeys.has(def.source.docKey);
    case "docYear":
      // 対象年度ごとに蓄積したキー（{baseKey}_r{令和年}）。旧形式（年度なしキー）も揃っている扱いにする
      return (
        (meta.target_reiwa != null &&
          sources.filledDocKeys.has(prepYearDocKey(def.source.baseKey, meta.target_reiwa))) ||
        sources.filledDocKeys.has(def.source.baseKey)
      );
    case "gensenYear": {
      // 源泉徴収票は課税年度の前年分（target-1）。その年の gensen_r{年} があれば充足。
      const y = meta.target_reiwa != null ? meta.target_reiwa - 1 : null;
      return y != null && sources.filledDocKeys.has(gensenDocKey(y));
    }
    case "photo":
      return !!sources.photoPath;
    case "residenceCardDoc":
      // 旧「外国人書類」の cert_zairyu からの移行前でも揃っている扱いにする（0101で移行）
      return !!sources.hasResidenceCard || sources.filledDocKeys.has("cert_zairyu");
    case "passportFile":
      return !!sources.hasPassportFile || sources.filledDocKeys.has("cert_passport");
    case "health":
      // 健康診断書はファイルが添付されていれば「添付あり」。
      // 受診日や受診項目などの細かい確認は準備状況ステータス（受診済み・完了 など）で人が管理し、
      // 完了判定は他の書類と同じ「添付あり＋ステータス完了」で行う
      return sources.filledDocKeys.has("kenshin");
  }
}

export interface PrepDocStatus {
  def: PrepDocDef;
  required: boolean;
  satisfied: boolean; // 完了か（添付＋準備状況が完了。ステータスの無い書類は添付のみ）
  fileSatisfied: boolean; // 添付（登録）があるか
}

// 書類の完了判定: 添付があり、かつ準備状況が完了の選択肢になっていること。
// 「発行できない」等の noFile な完了選択肢は添付なしで完了扱い。
// ステータス選択肢の無い書類（合格証など）は添付のみで完了。
export function isDocComplete(docId: string, fileSatisfied: boolean, status: string): boolean {
  const options = PREP_DOC_STATUS_OPTIONS[docId];
  if (!options) return fileSatisfied;
  const opt = options.find((o) => o.value === status);
  if (!opt?.done) return false;
  return opt.noFile ? true : fileSatisfied;
}

// 必要書類それぞれの状態と、不足件数を返す。
// docStatuses は書類ID→選択中の準備状況（prep_doc_statuses の status）
export function evaluatePrepChecklist(
  meta: PrepChecklistMeta,
  sources: PrepDocSources,
  docStatuses: Record<string, string> = {},
): { items: PrepDocStatus[]; missing: PrepDocStatus[] } {
  const items = PREP_DOC_DEFS.filter((def) => isRequired(def, meta)).map((def) => {
    const fileSatisfied = isSatisfied(def, meta, sources);
    return {
      def,
      required: true,
      satisfied: isDocComplete(def.id, fileSatisfied, docStatuses[def.id] ?? ""),
      fileSatisfied,
    };
  });
  return { items, missing: items.filter((i) => !i.satisfied) };
}

// ---- 書類ごとの準備状況（ステータス） ----
// 各書類に「準備中／完了」の選択肢を持たせ、選択肢に応じた付随入力
// （依頼先・金額・受診日・レターパック追跡番号・理由書メモなど）を保存する。
// 保存先は prep_doc_statuses（チェックリスト×書類で1行）。

// ステータスに付随する入力・表示の種類
export type PrepStatusExtra =
  | { kind: "text"; label: string } // 1行テキスト（note に保存）
  | { kind: "tantou"; label: string } // 担当者の選択（名簿から。note に保存）
  | { kind: "textarea"; label: string } // 理由書などの長文（note に保存）
  | { kind: "amount"; label: string } // 金額（amount に保存）
  | { kind: "date"; label: string } // 日付（date_on に保存）
  | { kind: "custody" } // 預かり番号の表示（保管ボックスと連動）
  | { kind: "mailing" } // 郵送請求ツールへの導線
  | { kind: "tracking" }; // レターパック追跡番号2件（送付・返信用）

export interface PrepDocStatusOption {
  value: string; // 保存値＝表示ラベル
  done: boolean; // 完了扱いの選択肢か
  noFile?: boolean; // true: 発行できない等でファイル添付なしでも完了扱いにする
  extras?: PrepStatusExtra[];
}

// 書類ID → 準備状況の選択肢。定義がない書類はステータス欄を表示しない
export const PREP_DOC_STATUS_OPTIONS: Record<string, PrepDocStatusOption[]> = {
  zairyu: [
    { value: "写真だけ先に本人に依頼中", done: false },
    { value: "預かった", done: true, extras: [{ kind: "custody" }] },
  ],
  passport: [
    { value: "写真だけ先に本人に依頼中", done: false },
    { value: "預かった", done: true, extras: [{ kind: "custody" }] },
  ],
  photo: [
    { value: "本人に依頼中", done: false },
    { value: "顔写真加工なし確認済み", done: true },
  ],
  gensen: [
    { value: "本人に依頼中", done: false },
    { value: "本人から送られてきた", done: true },
    { value: "本人が母国在住だった為発行できない", done: true, noFile: true },
    { value: "本人にまだ届いていないから納税証明書その３で対応", done: true, noFile: true },
  ],
  kazei: [
    { value: "発行依頼中", done: false, extras: [{ kind: "tantou", label: "誰に発行依頼中か（担当者）" }] },
    { value: "郵送請求中", done: false, extras: [{ kind: "mailing" }] },
    { value: "発行完了", done: true },
    {
      value: "1月1日時点で日本に在住していなかった為発行できなかった",
      done: true,
      noFile: true,
      extras: [{ kind: "textarea", label: "理由書（申請に添付する理由を記入して保存）" }],
    },
  ],
  nozei_shiken: [
    { value: "発行依頼中", done: false, extras: [{ kind: "tantou", label: "誰に発行依頼中か（担当者）" }] },
    { value: "郵送請求中", done: false, extras: [{ kind: "mailing" }] },
    {
      value: "未納のため領収書発行待ち",
      done: false,
      extras: [{ kind: "amount", label: "未納の金額" }],
    },
    { value: "発行完了", done: true },
    {
      value: "1月1日時点で日本に在住していなかった為発行できなかった",
      done: true,
      noFile: true,
      extras: [{ kind: "textarea", label: "理由書（申請に添付する理由を記入して保存）" }],
    },
    { value: "非課税のため発行できなかった", done: true, noFile: true },
  ],
  nozei_kokuho: [
    { value: "発行依頼中", done: false, extras: [{ kind: "tantou", label: "誰に発行依頼中か（担当者）" }] },
    { value: "郵送請求中", done: false, extras: [{ kind: "mailing" }] },
    {
      value: "未納のため領収書発行待ち",
      done: false,
      extras: [{ kind: "amount", label: "未納の金額" }],
    },
    { value: "発行完了", done: true },
    {
      value: "1月1日時点で日本に在住していなかった為発行できなかった",
      done: true,
      noFile: true,
      extras: [{ kind: "textarea", label: "理由書（申請に添付する理由を記入して保存）" }],
    },
    {
      value: "国保に加入したばかりで発行できない",
      done: true,
      noFile: true,
      extras: [{ kind: "textarea", label: "理由書（申請に添付する理由を記入して保存）" }],
    },
  ],
  hokensho: [
    { value: "本人に依頼中", done: false },
    { value: "送られてきた", done: true },
    {
      value: "加入できない",
      done: true,
      noFile: true,
      extras: [{ kind: "textarea", label: "理由書（申請に添付する理由を記入して保存）" }],
    },
  ],
  nenkin: [
    { value: "秋吉伽恋に発行依頼中", done: false },
    {
      value: "未払いのため本人に納付を依頼中",
      done: false,
      extras: [{ kind: "amount", label: "未払いの金額" }],
    },
    { value: "年金免除手続きの発行依頼中", done: false },
    { value: "発行済み", done: true },
  ],
  kenshin: [
    { value: "本人に依頼中", done: false },
    { value: "受診済み・発行待ち", done: false, extras: [{ kind: "date", label: "受診日" }] },
    { value: "要精査だが就労可をもらった", done: true },
    { value: "完了", done: true },
  ],
  suisenjo: [
    { value: "送り出し機関に依頼中", done: false },
    { value: "大使館へ郵送請求中", done: false, extras: [{ kind: "tracking" }] },
    { value: "発行済", done: true },
    { value: "特定活動からの資格変更の為、発行なし（国籍：ベトナム）", done: true, noFile: true },
  ],
};

// ステータスと関係なく常に表示する備考などの入力（書類ID → 入力定義）
export const PREP_DOC_ALWAYS_EXTRAS: Record<string, PrepStatusExtra[]> = {
  photo: [
    {
      kind: "textarea",
      label:
        "備考（前回と同じ写真を使う場合の理由。在留カードの顔写真は提出日の6ヶ月前までOKなら前回と同じでも可）",
    },
  ],
  gensen: [{ kind: "amount", label: "源泉徴収票の金額（課税証明書の金額と合うか確認用）" }],
  nenkin: [{ kind: "textarea", label: "理由書（添付したほうがいい場合に記入して保存）" }],
};

// 選択中のステータスの選択肢定義を返す
export function prepStatusOption(docId: string, status: string): PrepDocStatusOption | null {
  return PREP_DOC_STATUS_OPTIONS[docId]?.find((o) => o.value === status) ?? null;
}

// レターパックの追跡ページ（日本郵便の追跡サービスに番号を渡して開く）
export function letterPackTrackingUrl(no: string): string {
  const clean = no.replace(/[^0-9A-Za-z]/g, "");
  return `https://trackings.post.japanpost.jp/services/srv/search/direct?searchKind=S002&locale=ja&reqCodeNo1=${clean}`;
}

// 書類ごとの「添付する資料項目」（どれを添付するかをチェックボックスで選ぶ）
export const PREP_DOC_ATTACH_ITEMS: Record<string, string[]> = {
  nenkin: ["年金記録", "免除申請書"],
};

// 添付する資料項目の保存形式（カンマ区切り）の変換
export function parseAttachItems(s: string): string[] {
  return s ? s.split(",").filter(Boolean) : [];
}
export function serializeAttachItems(items: string[]): string {
  return items.join(",");
}

// 「申請後に入管へ郵送する」チェックを表示しない書類（本人から預かる・撮影するもの）
export const PREP_MAIL_AFTER_HIDDEN = new Set(["zairyu", "passport", "photo"]);

// 追加添付（2枚目以降）の保存キー（例: prep_kazei_r7_p2）。1枚目は基本キーのまま
export function prepPageKey(baseKey: string, page: number): string {
  return page <= 1 ? baseKey : `${baseKey}_p${page}`;
}

// その書類の添付キーか（基本キー、または {base}_p2 などの追加添付キー）
export function isPrepPageKeyOf(baseKey: string, key: string): boolean {
  if (key === baseKey) return true;
  return key.startsWith(`${baseKey}_p`) && /^\d+$/.test(key.slice(baseKey.length + 2));
}
