// 外国人一覧の「職歴の会社名で検索」。前職・技能実習先なども含めて、勤務先の名前の一部で探す。
// 全角・半角、大文字・小文字、空白の有無はそろえて比べる（「ＬＩＦＥ ＬＡＢ」も「lifelab」で見つかる）

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s　・･]/g, "");

// 検索語に合う職歴の勤務先（同じ名前は1つにまとめる）。検索語が空なら空
export function matchHistoryOrgs(histories: { org_name: string }[], query: string): string[] {
  const q = norm(query ?? "");
  if (!q) return [];
  const out: string[] = [];
  for (const h of histories) {
    const name = (h.org_name ?? "").trim();
    if (name && norm(name).includes(q) && !out.includes(name)) out.push(name);
  }
  return out;
}
