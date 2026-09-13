import type { OrganizationFileRow } from "@/types/db";

// 所属機関の添付ファイル（organization_files の kind）のうち、申請準備でも表示・印刷するもの。
//  ・農業特定技能加入通知書: 業種（特定技能 産業分野）が農業の会社だけ
//  ・年間カレンダー / 労使協定書: 1年単位の変形労働時間制の会社だけ（開始日から1年間有効）
export const ORG_FILE_KIND_AGRI_NOTICE = "農業特定技能加入通知書";
export const ORG_FILE_KIND_YEAR_CALENDAR = "年間カレンダー";
export const ORG_FILE_KIND_LABOR_AGREEMENT = "労使協定書";

// 添付ファイルの印刷ページで受け付ける種類
export const ORG_PRINTABLE_FILE_KINDS = [
  ORG_FILE_KIND_AGRI_NOTICE,
  ORG_FILE_KIND_YEAR_CALENDAR,
  ORG_FILE_KIND_LABOR_AGREEMENT,
] as const;

// 業種（特定技能 産業分野）が農業か
export function isAgricultureIndustry(industry: string): boolean {
  return industry.trim() === "農業";
}

// 変形労働時間制の表示（申請準備の所属機関の情報に出す）。
// 「1年単位」は年間カレンダー・労使協定書が必要なので「1年単位の変形労働」と分かる形にする
export function flexHoursLabel(kind: string): string {
  const k = kind.trim();
  if (!k) return "未登録";
  if (k === "なし") return "なし";
  if (k === "1年単位") return "1年単位の変形労働";
  if (k === "1ヶ月単位") return "1ヶ月単位の変形労働";
  return k;
}

// 1年単位の変形労働時間制か（年間カレンダー・労使協定書の表示が必要）
export function needsFlexDocs(kind: string): boolean {
  return kind.trim() === "1年単位";
}

// 最新版のまとまり。同じ日にアップロードした分を1つの版として扱う（複数ページの画像もまとめて出す）
export interface OrgLatestFiles {
  uploadedOn: string; // アップロード日（YYYY-MM-DD）
  files: OrganizationFileRow[]; // アップロードした順（ページ順）
}

// その種類のファイルの最新版（いちばん新しいアップロード日の分）
export function latestOrgFiles(
  files: OrganizationFileRow[],
  kind: string,
): OrgLatestFiles | null {
  const rows = files.filter((f) => f.kind === kind);
  if (rows.length === 0) return null;
  const day = (f: OrganizationFileRow) => f.created_at.slice(0, 10);
  const newest = rows.map(day).sort().at(-1) ?? "";
  const version = rows
    .filter((f) => day(f) === newest)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { uploadedOn: newest, files: version };
}

// 画像として表示・印刷できるファイルか（PDF は別タブで開く）
export function isImageFile(f: Pick<OrganizationFileRow, "mime_type" | "file_name">): boolean {
  if (f.mime_type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(f.file_name);
}

// 添付ファイルの印刷ページ（A4縦・1枚に1画像）のURL。種類は複数まとめて印刷できる
export function orgFilesPrintHref(orgId: string, kinds: string[]): string {
  return `/organizations/${orgId}/files/print?kind=${encodeURIComponent(kinds.join(","))}`;
}

// 印刷ページの ?kind= を種類の一覧に戻す（受け付けない種類は除く）
export function parsePrintKinds(param: string | undefined): string[] {
  if (!param) return [];
  const allowed = new Set<string>(ORG_PRINTABLE_FILE_KINDS);
  return [...new Set(param.split(",").map((s) => s.trim()))].filter((k) => allowed.has(k));
}
