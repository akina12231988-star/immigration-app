import { SSW2_DUTY_FIELDS, withInstructeeDefaults, type OrgSsw2Duties } from "@/lib/org-ssw2-duties";
import type { Ssw2Instructee } from "@/lib/ssw2-instructees";

// 「２号特定技能外国人の業務内容に関する誓約書」（参考様式第１－３２号）に貼り付ける文章。
// Word をアプリで作ると様式の見た目と合わないため、入管の様式（Word）はそのまま使い、
// 「様式のどの欄に・どの文章を」貼るかを並べて、1欄ずつコピーできるようにする。

export interface Ssw2PledgeInput {
  workerName: string; // ２号特定技能外国人の氏名
  orgName: string; // 特定技能所属機関の氏名又は名称
  authorName: string; // 作成責任者の氏名及び役職
  filledOn: string; // 作成年月日（YYYY-MM-DD。空なら未記入）
  duties: OrgSsw2Duties; // 「１ 業務内容」（所属機関に登録した内容）
  instructees: Ssw2Instructee[]; // 「２ 指導を受ける対象者一覧」
}

export interface PledgeCopyItem {
  where: string; // 様式のどの欄に貼るか
  value: string; // 貼る文章（空なら未登録）
  parts?: { label: string; value: string }[]; // 年・月・日など、欄が分かれているときの部品
  note?: string; // 補足
}

export interface PledgeCopySection {
  title: string; // 様式の見出し
  items: PledgeCopyItem[];
}

// 「2026-08-27」→「2026年8月27日」。形が違えば空（未記入）
export function pledgeDateText(date: string): string {
  const p = pledgeDateParts(date);
  return p ? `${p.year}年${p.month}月${p.day}日` : "";
}

function pledgeDateParts(date: string): { year: string; month: string; day: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  return { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])) };
}

// 対象者の氏名欄（様式の注記「外国人の場合は在留カード番号も記載」）
export function instructeeNameText(r: Pick<Ssw2Instructee, "name" | "residence_card_no">): string {
  const name = r.name.trim();
  const card = r.residence_card_no.trim();
  if (!name) return "";
  return card ? `${name}（在留カード番号：${card}）` : name;
}

export function buildSsw2PledgeCopy(input: Ssw2PledgeInput): PledgeCopySection[] {
  const sections: PledgeCopySection[] = [
    {
      title: "冒頭の文章",
      items: [
        {
          where: "「当特定技能所属機関は、２号特定技能外国人　　　との間で」の空欄",
          value: input.workerName.trim(),
        },
      ],
    },
    {
      title: "１　当該２号特定技能外国人の業務内容",
      items: SSW2_DUTY_FIELDS.map((f) => ({
        where: `「${f.no}　${f.label}」の右の欄`,
        value: input.duties[f.key].trim(),
        note: f.key === "difference" ? "技能実習生・1号の方がいない場合は空欄のままで構いません" : undefined,
      })),
    },
  ];

  // 様式の枠は①〜⑤。足りない場合は様式の表に行を足してから貼る（留意事項5）
  // 事業所・役職・職務内容が空の対象者は、所属機関に入れた共通の内容で埋める
  const people = input.instructees.flatMap((raw, i) => {
    const r = withInstructeeDefaults(raw, input.duties);
    const no = i + 1;
    const nameParts =
      r.residence_card_no.trim() && r.name.trim()
        ? [
            { label: "氏名", value: r.name.trim() },
            { label: "在留カード番号", value: r.residence_card_no.trim() },
          ]
        : undefined;
    return [
      {
        where: `${no}行目「対象者の氏名（外国人は在留カード番号も）」`,
        value: instructeeNameText(r),
        parts: nameParts,
      },
      { where: `${no}行目「事業所及び所属部署名」`, value: r.office.trim() },
      { where: `${no}行目「役職又は地位」`, value: r.position.trim() },
      { where: `${no}行目「指導を受ける職務内容」`, value: r.duties.trim() },
    ];
  });
  sections.push({
    title: "２　当該２号特定技能外国人に指導を受ける対象者一覧",
    items: people,
  });

  const date = pledgeDateParts(input.filledOn);
  sections.push({
    title: "最後の署名欄",
    items: [
      {
        where: "「作成年月日」",
        value: pledgeDateText(input.filledOn),
        parts: date
          ? [
              { label: "年", value: date.year },
              { label: "月", value: date.month },
              { label: "日", value: date.day },
            ]
          : undefined,
      },
      { where: "「特定技能所属機関の氏名又は名称」", value: input.orgName.trim() },
      { where: "「作成責任者の氏名及び役職」", value: input.authorName.trim() },
      {
        where: "「２号特定技能外国人の署名」",
        value: "",
        note: "本人が自分で署名します（貼り付けません）",
      },
    ],
  });

  return sections;
}

// 様式の「※ 留意事項」。文言はそのまま載せる
export const PLEDGE_NOTES = [
  "※　留意事項",
  "１　在留資格認定証明書の交付又は在留諸申請の許否に大きく影響するため、全て具体的に記載すること。なお、記載内容と実際の内容に相違がある場合、在留資格が取り消される可能性があるほか、虚偽の内容を記載した場合、特定技能所属機関としての欠格事由に該当することとなるため、留意すること。",
  "２　事業所、事業内容、所属部署、役職、職務内容などで、複数該当するものがある場合については、全ての内容を記載すること。",
  "３　対象者については、２号特定技能外国人と同一の事業所に出勤し、原則同一の所属部署に所属する者であって、フルタイムで業務に従事する者に限る。",
  "４　在留諸申請時点で、他の２号特定技能外国人に指導を受けている者については記載しないこと。",
  "５　記載する枠が足りない場合は、適宜追加すること。",
];
