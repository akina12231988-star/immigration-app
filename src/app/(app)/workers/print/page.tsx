import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { getWorkerPhotoUrl, getWorkerLatestDocUrls, listWorkerDocs } from "../actions";
import { PrintClient, type PrintPeriod, type PrintWorker } from "./PrintClient";
import { buildPastPeriods, docPeriodDate, periodKeyFor } from "@/lib/worker-doc-periods";
import { orgEmploymentDates, type OrgHistoryRow } from "@/lib/worker-org-dates";
import { normalizeOrgEmploymentStarts } from "@/lib/org-employment";
import {
  cardAsOf,
  grantAsOf,
  periodCardKey,
  type CardHistoryRecord,
  type GrantRecord,
  type PeriodCardInput,
} from "@/lib/worker-period-cards";
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

  // 表示する人の職歴（雇用開始日・退職日を、表示している所属機関のものにそろえるために使う）。
  // workers.leaving_on は最新の1件なので、そのままでは前の会社の退職日が出てしまう
  const workerIds = workers.map((w) => w.id);
  let historiesByWorker: Record<string, OrgHistoryRow[]> = {};
  if (workerIds.length > 0) {
    const { data: rows } = await supabase
      .from("work_histories")
      .select("worker_id, org_name, start_date, end_date, visa")
      .in("worker_id", workerIds);
    historiesByWorker = ((rows as (OrgHistoryRow & { worker_id: string })[] | null) ?? []).reduce<
      Record<string, OrgHistoryRow[]>
    >((acc, r) => {
      acc[r.worker_id] = [...(acc[r.worker_id] ?? []), r];
      return acc;
    }, {});
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
      const displayOrgName = orgId ? (organizations.find((o) => o.id === orgId)?.name ?? "") : "";
      // 表示している所属機関の雇用開始日・退職日（在籍中なら退職日は出さない）
      const dates = orgEmploymentDates({
        orgName: displayOrgName,
        histories: historiesByWorker[w.id] ?? [],
        orgStartOn:
          normalizeOrgEmploymentStarts(w.org_employment_starts).find(
            (e) => e.organization_id === orgId && e.start_on,
          )?.start_on ?? null,
        employmentStartOn: w.employment_start_on,
        leavingOn: w.leaving_on,
        hasCurrentOrg: Boolean(orgId),
      });
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
        employmentStartOn: dates.employmentStartOn,
        leavingOn: dates.leavingOn,
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
    const [docs, cards, { data: apps }, { data: cardHistory }] = await Promise.all([
      listWorkerDocs(workerParam),
      listWorkerPeriodCards(supabase, workerParam).catch(() => []),
      // 当時の最終版の在留カード（その時点で最後に許可された内容）を出すため、
      // 申請一覧の許可欄を読む
      supabase
        .from("immigration_applications")
        .select(
          "granted_card_no, granted_permit_date, granted_expiry_date, visa_at_grant, approval_date",
        )
        .eq("worker_id", workerParam),
      // 在留カードを書き換える前の内容の記録（0137）。当時の内容はこれがいちばん確か
      supabase
        .from("worker_card_history")
        .select(
          "residence_card_no, residence_status, residence_permit_date, residence_expiry_date, recorded_at",
        )
        .eq("worker_id", workerParam),
    ]);
    const cardRecords = (cardHistory as CardHistoryRecord[] | null) ?? [];
    const grants = ((apps as GrantRecord[] | null) ?? []).map((a) => ({
      granted_card_no: a.granted_card_no ?? "",
      granted_permit_date: a.granted_permit_date,
      granted_expiry_date: a.granted_expiry_date,
      visa_at_grant: a.visa_at_grant ?? "",
      approval_date: a.approval_date,
    }));
    const today = todayStr();
    // 職歴は上でまとめて読んだものを使う
    const histories = (historiesByWorker[workerParam] ?? []) as WorkHistoryRow[];
    const past = buildPastPeriods(histories, today);
    const hasOngoing = histories.some(
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
        // 退職日の時点で使っていた在留カードの内容。
        // 書き換え前の記録があればそれ、無ければその時点で最後に許可された内容
        grant: cardAsOf(cardRecords, p.end) ?? grantAsOf(grants, p.end),
        grantSource: cardAsOf(cardRecords, p.end)
          ? "在留カードの記録"
          : grantAsOf(grants, p.end)
            ? "申請一覧の許可"
            : "",
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
