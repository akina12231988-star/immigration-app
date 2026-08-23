import type { OrganizationFileRow } from "@/types/db";

// 所属機関の「毎年の提出データ」（定期報告書・賃金台帳）の年度グループ。
// organization_files の kind を「定期報告書:令和7年」のように「基本種別:年度ラベル」で保存し、
// 年度ラベルごとにまとめて表示する（年度ラベルなしの kind そのままも「年度未設定」として扱う）。

export interface OrgYearlyFileGroup {
  label: string; // 年度ラベル（例: 令和7年。'' = 年度未設定）
  kind: string; // organization_files に保存する kind
  files: OrganizationFileRow[];
}

// 年度ラベル → 保存する kind
export function orgYearlyKind(baseKind: string, label: string): string {
  const l = label.trim();
  return l ? `${baseKind}:${l}` : baseKind;
}

// その基本種別のファイルを年度ラベルごとにグループ化する（新しい年度が先）
export function orgYearlyFileGroups(
  files: OrganizationFileRow[],
  baseKind: string,
): OrgYearlyFileGroup[] {
  const groups = new Map<string, OrgYearlyFileGroup>();
  for (const f of files) {
    let label: string | null = null;
    if (f.kind === baseKind) label = "";
    else if (f.kind.startsWith(`${baseKind}:`)) label = f.kind.slice(baseKind.length + 1);
    if (label == null) continue;
    const g = groups.get(label) ?? { label, kind: orgYearlyKind(baseKind, label), files: [] };
    g.files.push(f);
    groups.set(label, g);
  }
  // 「令和10年」と「令和9年」の並びが正しくなるよう数値も見て比較し、新しい年度を先にする
  return [...groups.values()].sort((a, b) =>
    b.label.localeCompare(a.label, "ja", { numeric: true }),
  );
}
