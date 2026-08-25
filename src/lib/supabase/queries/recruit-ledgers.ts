import type { SupabaseClient } from "@supabase/supabase-js";
import { formatWage, type WageKind } from "@/types/recruiting";
import type { PostingLedgerEntry, SeekerLedgerEntry } from "@/lib/recruit-ledgers";

// ---- 法定帳簿（求人管理簿・求職管理簿・様式30）の元データ取得 ----
// 0079_recruit_ledgers.sql が未適用だと列が無くてエラーになる（呼び出し側で案内する）

interface PostingRow {
  id: string;
  organization_id: string | null;
  acceptance_no: string;
  received_on: string;
  valid_until: string | null;
  openings: number;
  job_type: string;
  work_location: string;
  employment_period: string;
  wage_kind: WageKind;
  wage_amount: number | null;
  note: string;
  organizations: { name: string; address: string; contact: string } | null;
  job_applications: {
    id: string;
    applied_on: string;
    result: string;
    result_on: string | null;
    employment_term: string | null;
    separation_status: string | null;
    separation_checked_on: string | null;
    separation_check_method: string | null;
    workers: { name: string } | null;
  }[];
}

// 求人管理簿の1行分（求人＋紹介の取扱状況）。様式30の元データにもなる
export async function fetchPostingLedger(
  supabase: SupabaseClient,
): Promise<PostingLedgerEntry[]> {
  const { data, error } = await supabase
    .from("job_postings")
    .select(
      "id, organization_id, acceptance_no, received_on, valid_until, openings, job_type, work_location, employment_period, wage_kind, wage_amount, note, " +
        "organizations(name, address, contact), " +
        "job_applications(id, applied_on, result, result_on, employment_term, separation_status, separation_checked_on, separation_check_method, workers(name))",
    )
    .order("received_on", { ascending: true });
  if (error) throw error;

  return ((data as unknown as PostingRow[]) ?? []).map((p) => ({
    id: p.id,
    organization_id: p.organization_id,
    acceptance_no: p.acceptance_no ?? "",
    org_name: p.organizations?.name ?? "",
    org_address: p.organizations?.address ?? "",
    contact: p.organizations?.contact ?? "",
    received_on: p.received_on,
    valid_until: p.valid_until ?? "",
    openings: p.openings,
    job_type: p.job_type,
    work_location: p.work_location,
    employment_period: p.employment_period,
    wage: formatWage(p.wage_kind, p.wage_amount),
    note: p.note,
    applications: [...p.job_applications]
      .sort((a, b) => (a.applied_on < b.applied_on ? -1 : 1))
      .map((a) => ({
        id: a.id,
        applied_on: a.applied_on,
        worker_name: a.workers?.name ?? "",
        result: a.result,
        result_on: a.result_on,
        employment_term: a.employment_term ?? "",
        separation_status: a.separation_status ?? "",
        separation_checked_on: a.separation_checked_on,
        separation_check_method: a.separation_check_method ?? "",
      })),
  }));
}

interface SeekerWorkerRow {
  id: string;
  name: string;
  address: string;
  birth: string | null;
  field: string;
  jobseeker_no: string;
  jobseeker_accepted_on: string | null;
  jobseeker_valid_until: string | null;
}

interface SeekerAppRow {
  worker_id: string;
  applied_on: string;
  result: string;
  result_on: string | null;
  employment_term: string | null;
  separation_status: string | null;
  separation_checked_on: string | null;
  separation_check_method: string | null;
  organizations: { name: string } | null;
  job_postings: { acceptance_no: string } | null;
}

// 求職管理簿の1人分（求職受付＋応募の取扱状況）。
// 応募がある人と、求職受付情報が入っている人を出す。
// 受付年月日が未入力なら最初の応募日で代用する
export async function fetchSeekerLedger(
  supabase: SupabaseClient,
): Promise<SeekerLedgerEntry[]> {
  const [workersRes, appsRes] = await Promise.all([
    supabase
      .from("workers")
      .select(
        "id, name, address, birth, field, jobseeker_no, jobseeker_accepted_on, jobseeker_valid_until",
      )
      .order("name", { ascending: true }),
    supabase
      .from("job_applications")
      .select(
        "worker_id, applied_on, result, result_on, employment_term, separation_status, separation_checked_on, separation_check_method, " +
          "organizations(name), job_postings(acceptance_no)",
      )
      .order("applied_on", { ascending: true }),
  ]);
  if (workersRes.error) throw workersRes.error;
  if (appsRes.error) throw appsRes.error;

  const appsByWorker = new Map<string, SeekerAppRow[]>();
  for (const a of (appsRes.data as unknown as SeekerAppRow[]) ?? []) {
    const list = appsByWorker.get(a.worker_id) ?? [];
    list.push(a);
    appsByWorker.set(a.worker_id, list);
  }

  const entries: SeekerLedgerEntry[] = [];
  for (const w of (workersRes.data as unknown as SeekerWorkerRow[]) ?? []) {
    const apps = appsByWorker.get(w.id) ?? [];
    if (apps.length === 0 && !w.jobseeker_no && !w.jobseeker_accepted_on) continue;
    entries.push({
      jobseeker_no: w.jobseeker_no ?? "",
      name: w.name,
      address: w.address ?? "",
      birth: w.birth ?? "",
      desired_job_type: w.field ?? "",
      accepted_on: w.jobseeker_accepted_on ?? apps[0]?.applied_on ?? "",
      valid_until: w.jobseeker_valid_until ?? "",
      note: "",
      applications: apps.map((a) => ({
        applied_on: a.applied_on,
        acceptance_no: a.job_postings?.acceptance_no ?? "",
        employer_name: a.organizations?.name ?? "",
        result: a.result,
        result_on: a.result_on,
        employment_term: a.employment_term ?? "",
        separation_status: a.separation_status ?? "",
        separation_checked_on: a.separation_checked_on,
        separation_check_method: a.separation_check_method ?? "",
      })),
    });
  }
  return entries;
}
