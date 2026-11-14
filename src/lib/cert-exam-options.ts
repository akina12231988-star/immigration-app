// 日本語の合格証・専門外の合格証の「受験した試験名」「受験地」の候補。
// Notionの選択肢（外国人詳細）を移行したもの。候補に無い試験名・国名は自由入力できる。

// 日本語の合格証の「受験した試験名」は、オンライン申請「19.2 日本語能力 合格した試験名」の
// プルダウンと同じ4つから選ぶ（外国人詳細と申請書に貼る情報で同じ値を使う）
export const NIHONGO_EXAM_NAME_OPTIONS = [
  "試験免除 Test exemption",
  "国際交流基金日本語基礎テスト The japan foundation japanese basic test",
  "日本語能力試験 Japanese language proficiency test",
  "介護日本語評価試験 Nursing care japanese language evaluation test",
] as const;

// 以前の候補（Notion から移した書き方）で保存した試験名を、19.2 のプルダウンの書き方に読み替える。
// 読み替えられない値（日本語以外の試験名など）はそのまま返す
export function nihongoExamNameOf(raw: string | null | undefined): string {
  const v = (raw ?? "").normalize("NFKC").trim();
  if (!v) return "";
  const hit = NIHONGO_EXAM_NAME_OPTIONS.find((o) => o.normalize("NFKC") === v);
  if (hit) return hit;
  const [exempt, jft, jlpt, kaigo] = NIHONGO_EXAM_NAME_OPTIONS;
  if (/免除|受験してない|受験していない|省略|exemption/i.test(v)) return exempt;
  if (/介護日本語|nursing care japanese/i.test(v)) return kaigo;
  if (/国際交流基金|基礎テスト|JFT|japan foundation/i.test(v)) return jft;
  if (/日本語能力試験|JLPT|JEES|日本国際教育支援協会|proficiency/i.test(v)) return jlpt;
  return raw ?? "";
}

// 専門外の合格証（技能試験）の「受験した試験名」。
// 農業はオンライン申請「18.2 技能水準 合格した試験名」のプルダウンと同じ4つ。
// そのほかの分野の試験名は従来どおり（候補に無ければ自由入力）
export const AGRI_SKILL_EXAM_OPTIONS = [
  "1号農業技能測定試験（耕種農業全般）Agriculture specified skills(i) proficiency test (cultivation agriculture)",
  "2号農業技能測定試験（耕種農業全般）Agriculture specified skills(ii) proficiency test (cultivation agriculture)",
  "1号農業技能測定試験（畜産農業全般）Agriculture specified skills(i) proficiency test (livestock agriculture)",
  "2号農業技能測定試験（畜産農業全般）Agriculture specified skills(ii) proficiency test (livestock agriculture)",
] as const;

export const SENMONGAI_EXAM_NAME_OPTIONS = [
  ...AGRI_SKILL_EXAM_OPTIONS,
  "外国人食品産業技能評価機構",
  "Nursing care skills evaluation test(Vietnamese)",
  "Nursing care Japanese language evaluation test (Vietnamese)",
] as const;

// 以前の書き方（General crop farming (Indonesian) など）で保存した農業の試験名を、
// 18.2 のプルダウンの書き方に読み替える。2号と分かる書き方でなければ1号にする。読み替えられない値はそのまま
export function skillExamNameOf(raw: string | null | undefined): string {
  const v = (raw ?? "").normalize("NFKC").trim();
  if (!v) return "";
  const hit = AGRI_SKILL_EXAM_OPTIONS.find((o) => o.normalize("NFKC") === v);
  if (hit) return hit;
  const crop = /crop|cultivation|耕種/i.test(v);
  const livestock = /livestock|畜産/i.test(v);
  if (!crop && !livestock) return raw ?? "";
  const second = /2号|\(ii\)|skills ?ii\b/i.test(v);
  const [c1, c2, l1, l2] = AGRI_SKILL_EXAM_OPTIONS;
  return crop ? (second ? c2 : c1) : second ? l2 : l1;
}

// 受験地: 日本国内 / それ以外（海外の国名を自由入力）
export const EXAM_LOCATION_JAPAN = "日本国内";
