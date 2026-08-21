// 一覧を「会社・機関の名称」で探すための検索ヘルパー。
//
// 会社名は書き方の揺れが大きい:
//   ・「BASE株式会社」を「BASE」だけで探したい（法人格は付けたり付けなかったり）
//   ・「ＢＡＳＥ」（全角）と「BASE」（半角）、大文字と小文字
//   ・「井上　雅夫」のように全角の空白が入る
//   ・「髙濱」「國崎」などの異体字を、常用の字（高浜・国崎）でも探したい
// これらをそろえてから部分一致で判定する。
//
// 所属機関の情報（会社・機関マスタ）の検索で使う。

export interface SearchableOrganization {
  name: string;
}

// 異体字 → 常用の字。人名・会社名でよく出るものだけを並べている。
// 見つからない字があったらここに足してください（左が入力・データに出る字）。
const KANJI_VARIANTS: Record<string, string> = {
  髙: "高",
  﨑: "崎",
  嵜: "崎",
  國: "国",
  濵: "浜",
  濱: "浜",
  邉: "辺",
  邊: "辺",
  澤: "沢",
  齋: "斎",
  齊: "斉",
  眞: "真",
  惠: "恵",
  廣: "広",
  德: "徳",
  瀨: "瀬",
  栁: "柳",
  冨: "富",
  桒: "桑",
};

// 法人格（前でも後ろでも付く）。取り除いた形でも探せるようにする
const COMPANY_TYPES = [
  "株式会社",
  "有限会社",
  "合同会社",
  "合資会社",
  "合名会社",
  "一般社団法人",
  "公益社団法人",
  "一般財団法人",
  "公益財団法人",
  "農事組合法人",
  "協業組合",
  "事業協同組合",
  "協同組合",
  "(株)",
  "(有)",
  "(同)",
];

// 検索用の正規化。
// 全角英数・半角カナをそろえ（NFKC）、小文字にし、カタカナをひらがなにし、
// 空白・中黒を取り、異体字を常用の字にそろえる。
export function normalizeOrgSearchText(text: string): string {
  const folded = text
    .normalize("NFKC")
    .toLowerCase()
    // カタカナ → ひらがな（「ベース」を「べーす」でも探せるように）
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    // 空白・中黒・区切り記号は無視する
    .replace(/[\s　・･,、.。]/g, "");
  return [...folded].map((c) => KANJI_VARIANTS[c] ?? c).join("");
}

// 法人格を取り除いた形（「BASE株式会社」→「base」）
function withoutCompanyType(normalized: string): string {
  let out = normalized;
  for (const type of COMPANY_TYPES) {
    out = out.split(normalizeOrgSearchText(type)).join("");
  }
  return out;
}

// 突き合わせに使う文字列（そのままの形と、法人格を取り除いた形）
export function orgSearchKeys(name: string): string[] {
  const normalized = normalizeOrgSearchText(name);
  const stripped = withoutCompanyType(normalized);
  return stripped && stripped !== normalized ? [normalized, stripped] : [normalized];
}

// 名称に、入力した文字が含まれるか。
// 「株式会社BASE」と入れても「BASE株式会社」が見つかるよう、両方から法人格を外して比べる
export function matchesOrganizationName(org: SearchableOrganization, query: string): boolean {
  const queries = orgSearchKeys(query).filter(Boolean);
  if (queries.length === 0) return true;
  const keys = orgSearchKeys(org.name);
  return keys.some((key) => queries.some((q) => key.includes(q)));
}

// 入力に応じた候補。前方一致を先に、そのあと五十音順で最大 limit 件。
export function organizationSuggestions<T extends SearchableOrganization>(
  organizations: T[],
  query: string,
  limit = 8,
): T[] {
  const queries = orgSearchKeys(query).filter(Boolean);
  if (queries.length === 0) return [];
  const rank = (o: T) =>
    orgSearchKeys(o.name).some((key) => queries.some((q) => key.startsWith(q))) ? 0 : 1;
  return organizations
    .filter((o) => matchesOrganizationName(o, query))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ja"))
    .slice(0, limit);
}
