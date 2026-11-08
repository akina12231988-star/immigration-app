// 申請準備の「所属機関への採用条件の確認」。
// 所属機関のLINEグループで、採用が決まった人の時給（月給）と居住費用を聞く。
//  ① 所属機関の給与の形態（月給制／時給制）を所属機関の情報に登録する
//  ② VUONG VAN THANH に、社宅に住むか自分で契約した住宅に住むかを聞いて、どちらかを押す
//  ③ ①②がそろったら、所属機関への文章を作ってコピーする
// あわせて履歴書の画像をアップロードし、LINEに貼れるよう画像としてコピーできるようにする。

export const PAY_SYSTEMS = ["月給制", "時給制"] as const;
export type PaySystem = (typeof PAY_SYSTEMS)[number];

export const HOUSING_OPTIONS = ["社宅", "自分で契約"] as const;
export type HousingOption = (typeof HOUSING_OPTIONS)[number];
export const HOUSING_LABEL: Record<HousingOption, string> = {
  社宅: "社宅に住む",
  自分で契約: "本人契約のアパート",
};

// 住居のことを聞く相手（通訳・支援担当）
export const HOUSING_ASK_STAFF = "VUONG VAN THANH";

export interface HireCheck {
  thanh_asked_on: string | null; // THANHへの質問をコピーした（聞いた）日。聞くまでは住居のボタンを押せない
  housing: HousingOption | "";
  housing_on: string | null;
  message_copied_on: string | null;
  resume_path: string;
  resume_name: string;
}

export const EMPTY_HIRE_CHECK: HireCheck = {
  thanh_asked_on: null,
  housing: "",
  housing_on: null,
  message_copied_on: null,
  resume_path: "",
  resume_name: "",
};

export function normalizeHireCheck(v: unknown): HireCheck {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x : "");
  const date = (x: unknown) => (typeof x === "string" && x ? x : null);
  const housing = (HOUSING_OPTIONS as readonly string[]).includes(str(o.housing)) ? (o.housing as HousingOption) : "";
  return {
    thanh_asked_on: date(o.thanh_asked_on),
    housing,
    housing_on: date(o.housing_on),
    message_copied_on: date(o.message_copied_on),
    resume_path: str(o.resume_path),
    resume_name: str(o.resume_name),
  };
}

export function isPaySystem(v: unknown): v is PaySystem {
  return typeof v === "string" && (PAY_SYSTEMS as readonly string[]).includes(v);
}

// VUONG VAN THANH への質問（Messengerのグループにそのまま貼る形）。
// 収入印紙代の負担がまだ決まっていなければ、それも一緒に聞く
export const HOUSING_ASK_MENTION = "@Vương Văn Thanh";
export function housingQuestionText(opts: { askStampFee: boolean }): string {
  const lines = [HOUSING_ASK_MENTION];
  if (opts.askStampFee) lines.push("印紙代は", "本人負担？会社負担？", "");
  lines.push("居住場所は", "本人契約のアパート？社宅に住む？");
  return lines.join("\n");
}

// 所属機関のLINEグループに送る文章。給与の形態と住居がそろっていなければ null
export function hireConditionMessage(workerName: string, pay: PaySystem | "", housing: HousingOption | ""): string | null {
  if (!pay || !housing) return null;
  const wage = pay === "時給制" ? "時給" : "月給";
  const ask =
    housing === "社宅"
      ? `この方の${wage}と、社宅の家賃・光熱費などの居住費用を教えていただけますか？`
      : `ご本人が自分で住宅を契約して住む予定です。この方の${wage}と、住宅手当など居住費用についての会社のご負担の有無を教えていただけますか？`;
  return ["お世話になっております。", `${workerName}さんの採用を聞きました。`, ask, "よろしくお願いいたします。"].join("\n");
}
