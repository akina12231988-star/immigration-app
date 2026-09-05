import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { getWorkerPhotoUrl, getWorkerLatestDocUrls, listWorkerDocs } from "../actions";
import { PrintClient, type PrintPeriod, type PrintWorker } from "./PrintClient";
import { buildPastPeriods, docPeriodDate, periodKeyFor } from "@/lib/worker-doc-periods";
import { periodCardKey, type PeriodCardInput } from "@/lib/worker-period-cards";
import { listWorkerPeriodCards } from "@/lib/supabase/queries/worker-period-cards";
import { todayStr } from "@/lib/application-alerts";
import type { WorkHistoryRow, Worker } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function WorkersPrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    org?: string;
    worker?: string;
    from?: string;
    to?: string;
    mode?: string;
    date?: string;
  }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { org, worker: workerParam, from, to, mode, date } = await searchParams;
  const forCompany = mode === "company"; // 会社提出用（MessengerのQRを消す）
  const forList = mode === "list" || mode === "list-company"; // 一覧表
  const listForCompany = mode === "list-company"; // 会社提出用の一覧表（IDを出さない）
  // 期間で絞り込む日付。既定は在留許可日、date=leaving なら退職日で絞り込む
  const byLeaving = date === "leaving";
  const dateColumn = byLeaving ? "leaving_on" : "residence_permit_date";
  const supabase = await createClient();
  const organizations = await listOrganizations(supabase);

  let workers: Worker[] = [];
  if (workerParam) {
    // 個人単位の印刷
    const { data } = await supabase.from("workers").select("*").eq("id", workerParam).maybeSingle();
    if (data) workers = [data as Worker];
  } else if (forList) {
    // 一覧表: 在留許可日または退職日の期間で絞り込み（所属機関は任意）。
    // 支援開始前の人は許可が下りておらず在留許可日が予定のため載せない
    let q = supabase.from("workers").select("*").neq("support", "支援開始前");
    if (org) q = q.eq("current_organization_id", org);
    if (from) q = q.gte(dateColumn, from);
    if (to) q = q.lte(dateColumn, to);
    const { data } = await q.order(dateColumn, { ascending: true });
    workers = (data as Worker[]) ?? [];
  } else if (org) {
    // 所属機関 AND 在留許可日または退職日の期間で絞り込み（1人1ページのシート）。
    // こちらも支援開始前の人は載せない（個人単位の印刷では本人を選んでいるので出せる）
    let q = supabase
      .from("workers")
      .select("*")
      .eq("current_organization_id", org)
      .neq("support", "支援開始前");
    if (from) q = q.gte(dateColumn, from);
    if (to) q = q.lte(dateColumn, to);
    const { data } = await q.order("name");
    workers = (data as Worker[]) ?? [];
  }

  // 各外国人の顔写真・最新書類の署名付きURL（一覧表では不要なので取得しない）
  const printWorkers: PrintWorker[] = await Promise.all(
    workers.map(async (w) => {
      let photoUrl = "";
      let docs = { residenceCardUrl: "", designationUrl: "" };
      if (!forList) {
        const [p, d] = await Promise.all([
          getWorkerPhotoUrl(w.photo_path),
          getWorkerLatestDocUrls(w.id),
        ]);
        photoUrl = p;
        docs = d;
      }
      const orgId = w.current_organization_id;
      return {
        id: w.id,
        workerCode: w.worker_code ?? "",
        name: w.name,
        kana: w.kana,
        nationality: w.nationality,
        birth: w.birth,
        gender: w.gender,
        residenceCardNo: w.residence_card_no,
        field: w.field,
        specialtyGrade: w.specialty_grade,
        otherQualifications: w.other_qualifications,
        residenceStatus: w.residence_status,
        residencePermitDate: w.residence_permit_date,
        residenceExpiryDate: w.residence_expiry_date,
        employmentStartOn: w.employment_start_on,
        leavingOn: w.leaving_on,
        assignedOffice: w.assigned_office,
        residenceNote: w.residence_note,
        messengerLink: w.messenger_link,
        orgName: orgId ? (organizations.find((o) => o.id === orgId)?.name ?? "") : "",
        photoUrl,
        residenceCardUrl: docs.residenceCardUrl,
        designationUrl: docs.designationUrl,
      };
    }),
  );

  const orgName = organizations.find((o) => o.id === org)?.name ?? "";

  // 個人単位のときは、過去に在籍していた期間の分も発行できるようにする。
  // 当時の在留カード・指定書の画像（effective_on で期間に振り分け）と、
  // 保存してある当時の在留カード情報（0136）をまとめて渡す
  let periods: PrintPeriod[] = [];
  if (workerParam && workers.length === 1) {
    const [{ data: histories }, docs, cards] = await Promise.all([
      supabase.from("work_histories").select("*").eq("worker_id", workerParam),
      listWorkerDocs(workerParam),
      listWorkerPeriodCards(supabase, workerParam).catch(() => []),
    ]);
    const today = todayStr();
    const past = buildPastPeriods(((histories as WorkHistoryRow[] | null) ?? []), today);
    const hasOngoing = ((histories as WorkHistoryRow[] | null) ?? []).some(
      (h) => h.visa !== "本国での職歴" && (h.end_date === null || h.end_date >= today),
    );
    periods = past.map((p) => {
      const forPeriod = docs.filter(
        (d) => periodKeyFor(docPeriodDate(d), past, hasOngoing) === p.key,
      );
      const newest = (kind: string) =>
        forPeriod.find((d) => d.kind === kind)?.url ?? "";
      const saved = cards.find((c) => c.period_key === periodCardKey(p)) ?? null;
      return {
        key: p.key,
        org: p.org,
        start: p.start,
        end: p.end,
        residenceCardUrl: newest("在留カード"),
        designationUrl: newest("指定書"),
        card: saved
          ? ({
              residence_card_no: saved.residence_card_no ?? "",
              residence_status: saved.residence_status ?? "",
              residence_permit_date: saved.residence_permit_date,
              residence_expiry_date: saved.residence_expiry_date,
              employment_start_on: saved.employment_start_on,
              leaving_on: saved.leaving_on,
              note: saved.note ?? "",
            } satisfies PeriodCardInput)
          : null,
      };
    });
  }

  return (
    <PrintClient
      organizations={organizations}
      selectedOrg={org ?? ""}
      orgName={orgName}
      individual={Boolean(workerParam)}
      workerId={workerParam ?? ""}
      byLeaving={byLeaving}
      from={from ?? ""}
      to={to ?? ""}
      forCompany={forCompany}
      forList={forList}
      listForCompany={listForCompany}
      workers={printWorkers}
      periods={periods}
      canEdit={me.role !== "viewer"}
    />
  );
}
