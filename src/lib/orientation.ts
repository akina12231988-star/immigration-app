// 生活オリエンテーションの予定日（要件⑥）:
// 雇用開始日から2週間後の日曜日。2週間後の当日が日曜ならその日、それ以外は次の日曜。
export function orientationDate(employmentStartOn: string): string {
  const d = new Date(`${employmentStartOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 14);
  // 0 = 日曜
  while (d.getUTCDay() !== 0) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

// 実施済にする際に案内する推奨フォルダ名・ファイル名（Drive で作成 → リンクを貼る）
export function recommendedFolderName(orgName: string): string {
  return `${orgName || "所属機関"}＋生活オリエンテーション`;
}

export function recommendedFileName(workerName: string, doneOn: string): string {
  return `${workerName || "外国人名"}＋${doneOn || "実施日"}＋生活オリエンテーション`;
}
