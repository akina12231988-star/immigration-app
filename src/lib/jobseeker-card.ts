import { dependentAge } from "./dependents";
import type { WorkHistoryRow } from "@/types/db";

// ---- 求職票（求職申込書）----
//
// 労働局の訪問指導で求職管理簿と一緒に見せる、求職者1人分の申込内容。
// 求職管理簿の記載事項（求職受付番号・氏名・住所・生年月日・希望職種・
// 受付年月日・有効期間・紹介の記録）に、本人の在留資格と資格・職歴を足している。

// 満年齢（生年月日が未入力・不正なら空）
export function jobseekerAge(birth: string | null, today: string): string {
  const age = dependentAge((birth ?? "").trim(), today);
  return age === null ? "" : `${age}`;
}

export interface JobseekerJob {
  period: string; // 例: 2021-04 〜 2024-03（継続中は「〜 現在」）
  orgName: string;
  role: string;
}

// 職歴（古い順）。労働者名簿と違い、続いている勤務先も出す
export function jobseekerJobs(histories: WorkHistoryRow[]): JobseekerJob[] {
  return [...histories]
    .filter((h) => h.start_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((h) => ({
      period: `${ym(h.start_date)} 〜 ${h.end_date ? ym(h.end_date) : "現在"}`,
      orgName: h.org_name,
      role: [h.role, h.prefecture].filter(Boolean).join("／"),
    }));
}

function ym(date: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(date);
  return m ? `${m[1]}-${m[2]}` : date;
}

export interface JobseekerCertSource {
  field: string;
  specialty_grade: string;
  jisshu2_shokushu?: string;
  jisshu2_sagyo?: string;
  ssw2_exam: string;
  other_qualifications: string;
  cert_nihongo_name?: string;
  cert_nihongo_level?: string;
}

// 資格・試験の欄に出す行（入力があるものだけ）
export function jobseekerCerts(w: JobseekerCertSource): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const jisshu = [w.jisshu2_shokushu, w.jisshu2_sagyo].filter(Boolean).join("／");
  const nihongo = [w.cert_nihongo_name, w.cert_nihongo_level].filter(Boolean).join(" ");
  const add = (label: string, value: string | undefined) => {
    const v = (value ?? "").trim();
    if (v) rows.push({ label, value: v });
  };
  add("特定技能の分野", w.field);
  add("技能実習2号（良好に修了）", jisshu);
  add("技能実習の専門級", w.specialty_grade);
  add("特定技能2号の合格試験", w.ssw2_exam);
  add("日本語の試験", nihongo);
  add("その他の資格・合格", w.other_qualifications);
  return rows;
}

// 印刷して保存するときのファイル名
export function jobseekerCardFileName(name: string, today: string): string {
  const who = (name || "").trim().replace(/[\\/:*?"<>|]/g, "");
  return `求職票_${who}_${today}`.replace(/_$/, "");
}
