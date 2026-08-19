import type { Application } from "@/types/application";

// 申請一覧に出す「誰が申請したか」（本人申請 / 申請取次士）。
//
// 申請登録で「本人申請」にチェックを入れると、申請取次士の欄にも文字列
// 「本人申請」が入る運用（ReceiptRegistrationForm）。古い記録では
// チェックだけ・文字列だけのものがあるので、どちらでも本人申請として扱う。

type ApplicantFields = Pick<Application, "isSelfApply" | "assignee">;

export function isSelfApplication(app: ApplicantFields): boolean {
  return app.isSelfApply || app.assignee.trim() === "本人申請";
}

// 表示用のラベル（本人申請 / 取次 氏名 / 取次士 未登録）
export function applicantLabel(app: ApplicantFields): string {
  if (isSelfApplication(app)) return "本人申請";
  const name = app.assignee.trim();
  return name ? `取次 ${name}` : "取次士 未登録";
}

// 国籍の表示用（未登録のときも欄が消えないようにする）
export function nationalityLabel(nationality?: string | null): string {
  return nationality?.trim() || "国籍未登録";
}
