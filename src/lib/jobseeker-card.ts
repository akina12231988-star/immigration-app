import { dependentAge } from "./dependents";
import type { JobseekerCardExtras } from "@/types/db";

// ---- 求職票（求職申込書）----
//
// 労働局の訪問指導で求職管理簿と一緒に見せる、求職者1人分の申込内容。
// 求職管理簿の記載事項（求職受付番号・氏名・住所・生年月日・希望職種・
// 受付年月日・有効期間・紹介の記録）に、本人の在留資格と資格・職歴を足している。

// 職業紹介事業者（この事業所の名前）。求職票には必ずこの名前を出す
export const JOBSEEKER_AGENT_NAME = "VUONG VAN THANH";

// 求職票だけで使う項目（workers.jobseeker_card）。
// 列がまだ無いDB・古いデータでも画面が崩れないよう、必ず全部の項目を埋めて返す
export function normalizeJobseekerCard(raw: unknown): JobseekerCardExtras {
  const o = (raw ?? {}) as Partial<Record<keyof JobseekerCardExtras, unknown>>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    phone: str(o.phone),
    desired_location: str(o.desired_location),
    desired_wage: str(o.desired_wage),
    available_from: str(o.available_from),
    other_wish: str(o.other_wish),
  };
}

export interface JobseekerReferral {
  appliedOn: string; // 紹介年月日
  acceptanceNo: string; // 求人受理番号
  employerName: string; // 求人者の氏名又は名称
  result: string; // 採否結果
  resultOn: string; // 採用年月日
}

// この求職票に載せる紹介の記録。
//
// 求職票は求職受付のたびに作る書類なので、その受付より前の紹介（前回の求職受付
// のときの紹介）は載せない。受付年月日がまだ入っていないときは全部載せる。
export function jobseekerReferrals(
  referrals: JobseekerReferral[],
  acceptedOn: string,
): JobseekerReferral[] {
  const from = (acceptedOn ?? "").trim();
  if (!from) return referrals;
  // 紹介年月日が入っていない記録は、いつのものか分からないのでそのまま載せる
  return referrals.filter((r) => !r.appliedOn || r.appliedOn >= from);
}

// 満年齢（生年月日が未入力・不正なら空）
export function jobseekerAge(birth: string | null, today: string): string {
  const age = dependentAge((birth ?? "").trim(), today);
  return age === null ? "" : `${age}`;
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
