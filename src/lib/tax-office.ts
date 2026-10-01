// 税務署マスタと「納税証明書その3」の郵送請求（tax_offices / judgment_records）。
// UI・保存先に依存しない純粋関数。

export interface TaxOffice {
  id: string;
  name: string; // 例: 熊本東税務署
  prefecture: string; // 都道府県（空は未設定 → 名前・住所から推定）
  postal_code: string;
  address: string; // 所在地（郵送先）
  phone: string;
  jurisdiction: string; // 管轄区域。市区町村名を「、」区切り
  website_url: string;
  note: string;
}

export type TaxOfficeInput = Omit<TaxOffice, "id">;

export function emptyTaxOfficeInput(): TaxOfficeInput {
  return {
    name: "",
    prefecture: "",
    postal_code: "",
    address: "",
    phone: "",
    jurisdiction: "",
    website_url: "",
    note: "",
  };
}

// 管轄区域の文字列を市区町村名の配列にする（「、」「,」「／」空白・改行で区切る）
export function jurisdictionList(jurisdiction: string): string[] {
  return (jurisdiction ?? "")
    .split(/[、,，／/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 「熊本東税務署」→「熊本東」（請求書の「◯◯税務署長 あて」に入れる分）
export function taxOfficeShortName(name: string): string {
  return (name ?? "").trim().replace(/税務署$/, "");
}

// 郵送の宛名に使う表示（〒・所在地・署名）
export function taxOfficeMailingLines(office: Pick<TaxOffice, "name" | "postal_code" | "address">): string[] {
  const lines: string[] = [];
  if (office.postal_code) lines.push(`〒${office.postal_code}`);
  if (office.address) lines.push(office.address);
  lines.push(`${office.name} 御中`);
  return lines;
}

// 住所（例: 熊本県熊本市東区小山3-8-87）から管轄の税務署を探す。
// 管轄区域の市区町村名が住所に含まれるものを、長い名前から優先して返す。
// 「菊池郡菊陽町」のように郡付きで登録していても、住所に郡が無いとき（「菊陽町」だけ）にも当たる。
// 無ければ null
export function findTaxOfficeForAddress<T extends Pick<TaxOffice, "jurisdiction">>(
  address: string,
  offices: T[],
): T | null {
  const addr = (address ?? "").replace(/\s/g, "");
  if (!addr) return null;
  let best: { office: T; len: number } | null = null;
  for (const office of offices) {
    for (const area of jurisdictionList(office.jurisdiction)) {
      // 郡付きの名前で当たればそれを優先し、当たらなければ郡を外した町村名で見る
      const candidates = [area];
      const m = area.match(/^(.+?郡)(.+)$/);
      if (m) candidates.push(m[2]);
      for (const c of candidates) {
        if (!addr.includes(c)) continue;
        // 郡を外した名前は同名の町村を誤って当てないよう、郡付きより短い扱いにする
        const len = c === area ? area.length + 100 : c.length;
        if (!best || len > best.len) best = { office, len };
      }
    }
  }
  return best?.office ?? null;
}

// 税務署マスタの検索（名前・都道府県・所在地・管轄区域・備考のどれかに含まれれば一致）
export function matchesTaxOffice(office: TaxOffice, query: string): boolean {
  const words = (query ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [office.name, office.prefecture, office.address, office.jurisdiction, office.note]
    .join(" ")
    .toLowerCase();
  return words.every((w) => hay.includes(w.toLowerCase()));
}

// ---- 納税証明書その3の郵送請求の進捗（準備中 → 税務署からの郵送待ち → 完了） ----
export type MailingProgress = "preparing" | "waiting" | "done";

export const MAILING_PROGRESS_OPTIONS: { value: MailingProgress; label: string }[] = [
  { value: "preparing", label: "準備中" },
  { value: "waiting", label: "郵送待ち" },
  { value: "done", label: "完了" },
];

// 郵送待ちの呼び名は請求先で変える（納税証明書その3は税務署、ほかは市区町村などの請求先）。
// 請求書類が分からないとき（いろいろな記録をまとめて絞り込むときなど）は「郵送待ち」のまま
export function mailingWaitingLabel(requestKind?: string): string {
  if (requestKind === "nozei3") return "税務署からの郵送待ち";
  if (!requestKind) return "郵送待ち";
  return "請求先からの郵送待ち";
}

// その請求書類での進捗の選択肢（郵送待ちの呼び名だけが変わる）
export function mailingProgressOptionsFor(
  requestKind?: string,
): { value: MailingProgress; label: string }[] {
  return MAILING_PROGRESS_OPTIONS.map((o) =>
    o.value === "waiting" ? { ...o, label: mailingWaitingLabel(requestKind) } : o,
  );
}

export function mailingProgressLabel(p?: string, requestKind?: string): string {
  const o = MAILING_PROGRESS_OPTIONS.find((x) => x.value === p);
  if (!o) return "準備中";
  return o.value === "waiting" ? mailingWaitingLabel(requestKind) : o.label;
}

// 投函日（納税証明書その3は追跡番号も）が入っていて進捗が準備中のままなら、
// 郵送待ちに進める（保存時の自動補正）。
// 市区町村への請求は追跡番号が無いことが多いので、投函日だけで進める
export function autoMailingProgress(
  progress: MailingProgress | undefined,
  postDate: string,
  trackingNumber: string,
  requireTracking = true,
): MailingProgress {
  if (progress === "done" || progress === "waiting") return progress;
  if (!postDate) return "preparing";
  return requireTracking ? (trackingNumber.trim() ? "waiting" : "preparing") : "waiting";
}

// 納税証明書その3の書類名（判定記録の docs に入れる）
export const NOZEI3_DOC_TITLE = "納税証明書（その3）";
export const NOZEI3_DOC_META =
  "未納の税額がないことの証明（申告所得税及復興特別所得税・消費税及地方消費税）。税務署へ郵送請求";

// 個人番号が様式に書ける形か（数字12桁）。画面での注意表示と PDF の書き込みに使う
export function isMyNumberFillable(myNumber: string): boolean {
  return (myNumber ?? "").replace(/[^0-9]/g, "").length === 12;
}

// 日本郵便の追跡番号（書留・レターパックなど。数字だけにして12〜13桁）
export function normalizeTrackingNumber(v: string): string {
  return (v ?? "").replace(/[^0-9]/g, "");
}

export function trackingUrl(trackingNumber: string): string {
  const no = normalizeTrackingNumber(trackingNumber);
  if (!no) return "";
  return `https://trackings.post.japanpost.jp/services/srv/search/?requestNo1=${no}&search=追跡スタート`;
}
