import type { Application } from "@/types/application";

function formatJapaneseDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// ⑤LINE報告文作成: 社長への定型報告文を生成する
export function generateLineReport(app: Application): string {
  return `社長様

本日、${app.name}さんの入管申請を行いました。

【申請内容】
${app.applicationContent}

【受付番号】
${app.applicationNumber || "未登録"}

【申請日】
${formatJapaneseDate(app.applicationDate)}

よろしくお願いいたします。`;
}

// 許可時の所属機関への定型報告文。所属機関名＋敬称（御中/様）を先頭に表示し、雇用開始日を任意で添える
export function generateApprovalReport(app: Application): string {
  const orgLine = app.organizationName
    ? `${app.organizationName} ${app.reportOrgHonorific ?? "御中"}\n\n`
    : "";
  const employmentLine = app.employmentStartOn
    ? `\n雇用開始日は ${app.employmentStartOn} を予定しております。`
    : "";
  return `${orgLine}お世話になっております。

本日、${app.name}さんの許可が降りました。
許可が降りた資料は後日お持ちいたします。${employmentLine}

よろしくお願いいたします。`;
}
