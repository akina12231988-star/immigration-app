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
