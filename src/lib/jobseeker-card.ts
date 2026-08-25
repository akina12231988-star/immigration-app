import { dependentAge } from "./dependents";
import type {
  JobseekerCardExtras,
  JobseekerCardFieldKey,
  JobseekerCardJob,
} from "@/types/db";

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
  const jobs = Array.isArray(o.jobs) ? o.jobs : [];
  const rawFields = (o.fields ?? {}) as Record<string, unknown>;
  const fields: Partial<Record<JobseekerCardFieldKey, string>> = {};
  for (const key of JOBSEEKER_CARD_FIELD_KEYS) {
    if (typeof rawFields[key] === "string") fields[key] = rawFields[key];
  }
  return {
    phone: str(o.phone),
    desired_location: str(o.desired_location),
    desired_wage: str(o.desired_wage),
    available_from: str(o.available_from),
    other_wish: str(o.other_wish),
    fields,
    jobs: jobs.map((j) => {
      const row = (j ?? {}) as Partial<Record<keyof JobseekerCardJob, unknown>>;
      return {
        start: str(row.start),
        end: str(row.end),
        org: str(row.org),
        role: str(row.role),
      };
    }),
  };
}

// 求職票で直せる、外国人の登録内容と同じ項目
export const JOBSEEKER_CARD_FIELD_KEYS = [
  "name",
  "kana",
  "gender",
  "birth",
  "nationality",
  "address",
  "homeAddress",
  "residenceStatus",
  "residencePeriod",
  "residenceExpiry",
  "residenceCardNo",
  "passportNo",
  "passportExpiry",
  "field",
] as const satisfies readonly JobseekerCardFieldKey[];

// 求職票に出す内容。求職票で直したぶんがあればそれを、無ければ外国人の登録内容を出す
export function jobseekerCardFields<T extends Record<JobseekerCardFieldKey, string>>(
  fromWorker: T,
  saved: Partial<Record<JobseekerCardFieldKey, string>>,
): T {
  const out = { ...fromWorker };
  for (const key of JOBSEEKER_CARD_FIELD_KEYS) {
    const v = saved[key];
    if (typeof v === "string") out[key] = v as T[JobseekerCardFieldKey];
  }
  return out;
}

// 求職票のぶんとして残す内容（画面に出ている値をそのまま控える）
export function jobseekerCardFieldsOf(
  shown: Record<JobseekerCardFieldKey, string>,
): Partial<Record<JobseekerCardFieldKey, string>> {
  const out: Partial<Record<JobseekerCardFieldKey, string>> = {};
  for (const key of JOBSEEKER_CARD_FIELD_KEYS) out[key] = shown[key];
  return out;
}

// 期間の古い順。日付がまだ入っていない行は最後に置く（入力の途中で飛ばない）
export function sortJobseekerJobs(jobs: JobseekerCardJob[]): JobseekerCardJob[] {
  return [...jobs].sort((a, b) => {
    if (!a.start && !b.start) return 0;
    if (!a.start) return 1;
    if (!b.start) return -1;
    return a.start.localeCompare(b.start);
  });
}

// 求職票に出す職歴。
//
// まだ求職票で直していなければ外国人の職歴をそのまま出す。
// 一度でも求職票で直したら、そのあとは求職票に残したぶんだけを出す
// （外国人詳細の職歴とは別のものとして扱う）。
export function jobseekerCardJobs(
  saved: JobseekerCardJob[],
  histories: JobseekerCardJob[],
): JobseekerCardJob[] {
  return sortJobseekerJobs(saved.length > 0 ? saved : histories);
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
