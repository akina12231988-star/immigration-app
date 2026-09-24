import { SSW2_DUTY_FIELDS, SSW2_INSTRUCTEE_DEFAULT_FIELDS } from "@/lib/org-ssw2-duties";

// 「２号の誓約書（参考様式第１－３２号）の作り方」の案内ページで使う対応表。
// 様式のどの欄が、アプリのどこで入れた内容から来るのかを1か所にまとめる。

export const SSW2_PLEDGE_GUIDE_HREF = "/guides/ssw2-pledge";

export interface PledgeGuideRow {
  form: string; // 様式の欄
  where: string; // アプリで入れる場所
  step: number; // 案内ページの何番目の手順か
}

export const PLEDGE_GUIDE_ROWS: PledgeGuideRow[] = [
  {
    form: "冒頭「２号特定技能外国人　　との間で」の氏名",
    where: "外国人詳細 ＞ 氏名",
    step: 2,
  },
  ...SSW2_DUTY_FIELDS.map((f) => ({
    form: `１ 業務内容 ${f.no} ${f.label}`,
    where: `所属機関の情報 ＞ 特定技能２号の指導体制 ＞ １ 業務内容 ＞ ${f.no} ${f.label}`,
    step: 1,
  })),
  {
    form: "２ 対象者一覧「対象者の氏名（外国人は在留カード番号も）」",
    where: "申請準備 ＞ 申請種別の下の「指導を受ける対象者」＞ 対象者を足す（選ぶと氏名・在留カード番号が入る）",
    step: 3,
  },
  ...SSW2_INSTRUCTEE_DEFAULT_FIELDS.map((f) => ({
    form: `２ 対象者一覧「${f.label}」`,
    where: `所属機関の情報 ＞ 特定技能２号の指導体制 ＞ ２ 指導を受ける対象者の共通の内容 ＞ ${f.label}（人ごとに違うときは申請準備の対象者の欄）`,
    step: 1,
  })),
  {
    form: "作成年月日",
    where: "誓約書に貼る文章のページで入れる（初期値は今日）",
    step: 4,
  },
  {
    form: "特定技能所属機関の氏名又は名称",
    where: "所属機関の情報 ＞ 名称",
    step: 1,
  },
  {
    form: "作成責任者の氏名及び役職",
    where: "所属機関の情報 ＞ 代表者役職・氏名（誓約書に貼る文章のページで直せる）",
    step: 1,
  },
  {
    form: "２号特定技能外国人の署名",
    where: "本人が自分で署名する（アプリからは貼らない）",
    step: 4,
  },
];
