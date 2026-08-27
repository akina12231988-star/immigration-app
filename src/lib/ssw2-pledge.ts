import { A4_LANDSCAPE, type DocxBlock, type DocxSpec } from "@/lib/docx-export";
import { SSW2_DUTY_FIELDS, type OrgSsw2Duties } from "@/lib/org-ssw2-duties";
import type { Ssw2Instructee } from "@/lib/ssw2-instructees";

// 「２号特定技能外国人の業務内容に関する誓約書」（参考様式第１－３２号）を Word で出す。
// 様式の見出し・注意書きをそのままなぞり、アプリに登録してある内容を差し込む。

// A4縦（210×297mm）。様式はこの向き
export const A4_PORTRAIT = {
  width: A4_LANDSCAPE.height,
  height: A4_LANDSCAPE.width,
  marginTop: 851,
  marginBottom: 851,
  marginLeft: 902,
  marginRight: 851,
};

// 本文の幅（twips）。A4縦から左右の余白を引いたもの
const BODY_WIDTH = A4_PORTRAIT.width - A4_PORTRAIT.marginLeft - A4_PORTRAIT.marginRight;

export interface Ssw2PledgeInput {
  workerName: string; // ２号特定技能外国人の氏名
  orgName: string; // 特定技能所属機関の氏名又は名称
  authorName: string; // 作成責任者の氏名及び役職
  filledOn: string; // 作成年月日（YYYY-MM-DD。空なら空欄で出す）
  duties: OrgSsw2Duties; // 「１ 業務内容」（所属機関に登録した内容）
  instructees: Ssw2Instructee[]; // 「２ 指導を受ける対象者一覧」
}

// 「2026-08-27」→「２０２６年　８月２７日」の形（様式の作成年月日の欄）
export function pledgeDateText(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return "２０　　　年　　　月　　　日";
  const [, y, mo, d] = m;
  return `${y}年${Number(mo)}月${Number(d)}日`;
}

// 対象者の1行（様式の表の並び順）。氏名の下に在留カード番号を入れる
export function instructeeRow(no: number, r: Ssw2Instructee | undefined): string[] {
  if (!r) return [`${no}`, "", "", "", ""];
  const name = r.residence_card_no.trim()
    ? `${r.name}\n（在留カード番号 ${r.residence_card_no}）`
    : r.name;
  return [`${no}`, name, r.office, r.position, r.duties];
}

export function buildSsw2PledgeDoc(input: Ssw2PledgeInput): DocxSpec {
  const blocks: DocxBlock[] = [
    { kind: "paragraph", text: "参考様式第１－３２号", size: 9 },
    {
      kind: "paragraph",
      text: "２号特定技能外国人の業務内容に関する誓約書",
      bold: true,
      align: "center",
      size: 12,
    },
    { kind: "paragraph", text: "" },
    {
      kind: "paragraph",
      text:
        `当特定技能所属機関は、２号特定技能外国人　${input.workerName}　との間で特定技能雇用契約を` +
        "締結するに当たって、各特定産業分野における分野別方針及び特定の分野に係る要領別冊に定めている" +
        "２号特定技能外国人の従事する業務内容を確認した上で、当該外国人が従事する業務内容と相違のない" +
        "ことを誓約するとともに、当該業務内容を以下のとおり申告します。",
    },
    { kind: "paragraph", text: "" },
    { kind: "paragraph", text: "１　当該２号特定技能外国人の業務内容", bold: true },
  ];

  // ①〜④（様式の並びのまま。未入力は空欄で出す）
  blocks.push({
    kind: "table",
    columnWidths: [Math.round(BODY_WIDTH * 0.34), Math.round(BODY_WIDTH * 0.66)],
    rows: SSW2_DUTY_FIELDS.map((f) => [`${f.no}　${f.label}`, input.duties[f.key]]),
  });

  blocks.push({ kind: "paragraph", text: "" });
  blocks.push({
    kind: "paragraph",
    text: "２　当該２号特定技能外国人に指導を受ける対象者一覧",
    bold: true,
  });

  // 様式の枠は①〜⑤。登録がそれより多ければ行を足す（記載欄が足りない場合は適宜追加する）
  const count = Math.max(5, input.instructees.length);
  blocks.push({
    kind: "table",
    columnWidths: [
      Math.round(BODY_WIDTH * 0.06),
      Math.round(BODY_WIDTH * 0.28),
      Math.round(BODY_WIDTH * 0.22),
      Math.round(BODY_WIDTH * 0.16),
      Math.round(BODY_WIDTH * 0.28),
    ],
    headerRows: 1,
    rows: [
      [
        "",
        "対象者の氏名\n※外国人の場合は在留カード番号も記載",
        "事業所及び\n所属部署名",
        "役職又は地位",
        "指導を受ける職務内容",
      ],
      ...Array.from({ length: count }, (_, i) => instructeeRow(i + 1, input.instructees[i])),
    ],
  });

  blocks.push({ kind: "paragraph", text: "" });
  for (const note of PLEDGE_NOTES) {
    blocks.push({ kind: "paragraph", text: note, size: 9 });
  }

  blocks.push({ kind: "paragraph", text: "" });
  blocks.push({ kind: "paragraph", text: `作成年月日：${pledgeDateText(input.filledOn)}` });
  blocks.push({ kind: "paragraph", text: "上記の記載内容は、事実と相違ありません。" });
  blocks.push({ kind: "paragraph", text: "" });
  blocks.push({ kind: "paragraph", text: `２号特定技能外国人の署名　　${""}` });
  blocks.push({ kind: "paragraph", text: `特定技能所属機関の氏名又は名称　　${input.orgName}` });
  blocks.push({ kind: "paragraph", text: `作成責任者の氏名及び役職　　${input.authorName}` });

  return { page: A4_PORTRAIT, blocks };
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

// 保存するときのファイル名
export function pledgeFileName(workerName: string, filledOn: string): string {
  const date = filledOn.trim() || "未記入";
  const name = workerName.trim() || "特定技能2号";
  return `参考様式1-32_業務内容に関する誓約書_${name}_${date}.docx`;
}
