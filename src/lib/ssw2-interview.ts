import { SSW2_DUTY_FIELDS, type OrgSsw2Duties } from "@/lib/org-ssw2-duties";

// 特定技能2号の誓約書（参考様式第１－３２号）を書くために、会社へ聞き取りをするときの質問票。
//
// 様式の文章はお役所の言い回しで、そのまま読み上げても伝わりにくい。
// 高齢の農家さんにも分かる言い方に置き換えて、順に聞けば埋まる形にする。

export interface InterviewQuestion {
  no: string; // 様式のどこに対応するか（① など）
  ask: string; // そのまま読み上げる質問文
  why?: string; // なぜ聞くのか（相手に説明するとき用）
  examples?: string[]; // 答えの例（言葉が出てこないときの呼び水）
  key?: keyof OrgSsw2Duties; // 記入欄がどの項目に入るか
}

export interface InterviewSection {
  title: string;
  lead?: string; // 聞き取りの前に読む一言
  questions: InterviewQuestion[];
}

// 「１ 業務内容」の聞き取り
export const DUTY_QUESTIONS: InterviewQuestion[] = [
  {
    no: "①",
    key: "department",
    ask: "この方は、どの部署（どの持ち場）で働いていますか。",
    why: "書類に「所属部署名」を書く欄があります。",
    examples: ["製造部 加工課", "第一農場", "部署の分けはない（その場合は「なし」と書きます）"],
  },
  {
    no: "②",
    key: "position",
    ask: "この方の役職や立場は何ですか。肩書きがなければ「一般社員」でも構いません。",
    why: "書類に「役職又は地位」を書く欄があります。",
    examples: ["班長", "リーダー", "一般社員"],
  },
  {
    no: "③",
    key: "duties",
    ask: "この方は、毎日どんな仕事をしていますか。朝から夕方までの流れで教えてください。",
    why: "ここがいちばん大事です。書き方が大まかだと、許可が下りないことがあります。",
    examples: [
      "何を作っている／何を収穫しているか（例: トマト、いちご、惣菜）",
      "どの機械・道具を使うか（例: トラクター、選別機、包装機）",
      "1日の流れ（例: 朝は収穫、昼から選別と箱詰め、夕方に片づけと記録）",
      "ほかの人に指示を出す仕事があるか",
    ],
  },
  {
    no: "④",
    key: "difference",
    ask: "同じ職場に、技能実習生や特定技能1号の方はいますか。いる場合、その方たちの仕事と、この方の仕事は何が違いますか。",
    why: "２号の方は「指導する立場」である必要があります。同じ仕事だと２号として認められません。",
    examples: [
      "この方は作業の段取りを決めて、ほかの人に教えている",
      "この方は機械の調整・点検をするが、ほかの人はしない",
      "この方は収穫量や品質の記録をつけ、問題があれば判断している",
      "実習生・1号の方はいない（その場合は「該当者なし」と書きます）",
    ],
  },
];

// 「２ 指導を受ける対象者」の聞き取り
export const INSTRUCTEE_QUESTIONS: InterviewQuestion[] = [
  {
    no: "２-1",
    ask: "この方が仕事を教えている相手は誰ですか。氏名を教えてください。",
    why: "書類に「指導を受ける対象者」を書く欄があります。分野によって必要な人数が決まっています。",
    examples: ["外国人でも日本人でも構いません", "パートの方は書けません（フルタイムの方だけ）"],
  },
  {
    no: "２-2",
    ask: "その方は、この方と同じ事業所に毎日出勤していますか。部署も同じですか。",
    why: "同じ事業所に出勤し、原則同じ部署の方に限られます。",
  },
  {
    no: "２-3",
    ask: "その方の役職・立場と、教わっている仕事の内容を教えてください。",
    why: "対象者ごとに「役職又は地位」「指導を受ける職務内容」を書きます。",
  },
  {
    no: "２-4",
    ask: "その方は、ほかの特定技能２号の方から教わっていることはありませんか。",
    why: "同じ人を2人以上の２号の対象者にすることはできません。重なっていると書類を出し直しになります。",
  },
];

export const INTERVIEW_SECTIONS: InterviewSection[] = [
  {
    title: "１　この方の仕事の内容",
    lead:
      "特定技能２号の申請で、会社に出していただく書類があります。" +
      "難しい言葉は使いませんので、思い出せる範囲でお答えください。",
    questions: DUTY_QUESTIONS,
  },
  {
    title: "２　この方が仕事を教えている相手",
    lead: "２号の方は、ほかの人に仕事を教える立場である必要があります。",
    questions: INSTRUCTEE_QUESTIONS,
  },
];

// すでに登録してある内容を、質問票に「今わかっていること」として載せる。
// 空の質問だけを聞けばよい形にする
export function answeredAlready(duties: OrgSsw2Duties): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of SSW2_DUTY_FIELDS) {
    const v = duties[f.key].trim();
    if (v) out[f.key] = v;
  }
  return out;
}

// まだ聞けていない質問（印刷する質問票で目立たせる）
export function unansweredQuestions(duties: OrgSsw2Duties): InterviewQuestion[] {
  return DUTY_QUESTIONS.filter((q) => !q.key || !duties[q.key].trim());
}
