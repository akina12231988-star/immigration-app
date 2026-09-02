// 契約内容変更の随時報告書（参考様式第３－１－１号「特定技能雇用契約の変更に係る届出書」）。
//
// 様式の②ｂ「変更事項」は Ⅰ〜Ⅸ から複数選べる。何を変更したのかを画面で選ぶと、
// そのままチェック欄（□→☑）に転記される。
// items（何が変わったか）は様式の記載要領の対応表そのままで、
// 「Ⅰを選べばいいのか分からない」を無くすために画面にも出す。

// 変更事項1つぶん。cell は様式のチェック欄のセル番地
export interface ContractChangeItem {
  code: string; // 保存する値（Ⅰ〜Ⅸ をローマ字で）
  label: string; // 様式の表記（Ⅰ.雇用契約期間 など）
  cell: string; // 参考様式第3-1-1号のチェック欄
  items: string[]; // 記載要領の「変更内容」（この事項に含まれるもの）
}

export const CONTRACT_CHANGE_ITEMS: ContractChangeItem[] = [
  {
    code: "I",
    label: "Ⅰ.雇用契約期間",
    cell: "E38",
    items: ["雇用契約期間", "契約更新の有無"],
  },
  {
    code: "II",
    label: "Ⅱ.就業の場所",
    cell: "E39",
    items: [
      "雇用形態",
      "事業所名",
      "所在地",
      "派遣先の氏名又は名称",
      "派遣先の所在地（住所）",
      "派遣先における就労（作業）場所",
      "派遣予定期間",
    ],
  },
  {
    code: "III",
    label: "Ⅲ.従事すべき業務の内容",
    cell: "E40",
    items: ["分野の主従関係（主たる特定産業分野）", "同一分野内で従事する業務区分"],
  },
  {
    code: "IV",
    label: "Ⅳ.労働時間等",
    cell: "N38",
    items: [
      "始業・終業の時刻等",
      "休憩時間",
      "所定労働時間数",
      "所定労働日数",
      "所定時間外労働の有無",
    ],
  },
  {
    code: "V",
    label: "Ⅴ.休日",
    cell: "N39",
    items: ["定例日", "非定例日"],
  },
  {
    code: "VI",
    label: "Ⅵ.休暇",
    cell: "N40",
    items: ["年次有給休暇", "その他の休暇"],
  },
  {
    code: "VII",
    label: "Ⅶ.賃金",
    cell: "S38",
    items: [
      "基本賃金",
      "諸手当（時間外労働の割増賃金は除く）",
      "所定時間外、休日又は深夜労働に対して支払われる割増賃金率",
      "賃金締切日",
      "賃金支払日",
      "賃金支払方法",
      "労使協定に基づく賃金支払時の控除",
      "昇給",
      "賞与",
      "退職金",
      "休業手当",
    ],
  },
  {
    code: "VIII",
    label: "Ⅷ.退職に関する事項",
    cell: "S39",
    items: ["自己都合退職の手続", "解雇の事由及び手続"],
  },
  {
    code: "IX",
    label: "Ⅸ.その他（社会保険・労働保険の加入状況、健康診断、帰国担保措置）",
    cell: "S40",
    items: ["社会保険の加入状況・労働保険の適用状況", "健康診断", "帰国担保措置"],
  },
];

export const CONTRACT_CHANGE_CELLS = CONTRACT_CHANGE_ITEMS.map((i) => i.cell);

export function contractChangeItem(code: string): ContractChangeItem | undefined {
  return CONTRACT_CHANGE_ITEMS.find((i) => i.code === code);
}

// 保存されているコードを様式の表記に直す（知らないコードはそのまま出す）
export function contractChangeLabels(codes: string[]): string[] {
  return codes.map((c) => contractChangeItem(c)?.label ?? c);
}

// 届出書に添付する雇用条件書の案内（様式の②ｂ②の注記）。
// 変更後の契約内容が分かる雇用条件書を必ず付けるので、画面にも出しておく
export const CONTRACT_CHANGE_ATTACHMENT_NOTE =
  "変更後の契約内容が記載された雇用条件書（参考様式第１－６号、別紙を含む）を添付してください。" +
  "変更があった部分だけを記載するか、既にある雇用条件書に朱書き修正した形で提出します。" +
  "本人が十分に理解できる言語で翻訳・説明し、理解したことを確認したうえで署名を得る必要があります。";
