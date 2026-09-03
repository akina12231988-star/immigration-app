import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listPrepChecklists, listPrepDocStatuses } from "@/lib/supabase/queries/application-prep";
import { listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import { listWorkerPassportFiles } from "@/lib/supabase/queries/worker-travels";
import { listWorkerWages } from "@/lib/supabase/queries/wages";
import { findPlanDatesForTodo, listPlanDates } from "@/lib/supabase/queries/plan-dates";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { evaluatePrepChecklist, EMPTY_PREP_META } from "@/lib/application-prep";
import {
  prepPrintAppType,
  prepPrintDateLines,
  prepPrintDocRows,
  prepPrintOrgLines,
  prepPrintWageLines,
  prepPrintWorkerLines,
} from "@/lib/application-prep-print";
import { normalizeTodoKey } from "@/lib/todo";
import { reiwaYear } from "@/lib/onboarding";
import { todayStr } from "@/lib/ssw/calc";
import type { Organization, Worker } from "@/types/db";
import { PrepDetailSheet } from "./PrepDetailSheet";

export const dynamic = "force-dynamic";

// 申請書類の準備状況の詳細をA4縦で印刷するページ。
// 詳細画面（申請準備）の「🖨 A4で印刷」から、表示しているTODO番号を付けて開く。
// 画面に出ている内容をそのまま紙に写すため、必要なデータはここで全部読んでから渡す
export default async function ApplicationPrepPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ todo?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const { todo } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.from("workers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const worker = data as Worker;

  // 表示するTODO番号の準備リスト（指定が無ければ更新がいちばん新しいもの）
  const lists = await listPrepChecklists(supabase, id).catch(() => []);
  const wantKey = todo ? normalizeTodoKey(todo) : "";
  const current =
    (wantKey ? lists.find((l) => normalizeTodoKey(l.todo_no) === wantKey) : null) ??
    lists[0] ??
    null;
  const meta = current ?? EMPTY_PREP_META;

  // 申請準備の所属機関（転職の場合は転職先）。無ければ現在の所属機関
  const orgId = worker.application_prep_organization_id ?? worker.current_organization_id ?? null;
  let org: Organization | null = null;
  if (orgId) {
    const { data: o } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .maybeSingle();
    org = o as Organization | null;
  }

  const [docStatusRows, docs, passportFiles, cardDocs, wages, planDateRows] = await Promise.all([
    current ? listPrepDocStatuses(supabase, current.id).catch(() => []) : Promise.resolve([]),
    listOnboardingDocs(supabase, id).catch(() => []),
    listWorkerPassportFiles(supabase, id).catch(() => []),
    supabase
      .from("worker_documents")
      .select("id")
      .eq("worker_id", id)
      .eq("kind", "在留カード")
      .then(({ data: rows }) => (rows as { id: string }[] | null) ?? []),
    listWorkerWages(supabase, id).catch(() => []),
    listPlanDates(supabase, id).catch(() => []),
  ]);

  // 賃金の記録に付いている所属機関の名前（印刷に出す）
  const wageOrgIds = [...new Set(wages.map((w) => w.organization_id).filter(Boolean))] as string[];
  let wageOrgNames: Record<string, string> = {};
  if (wageOrgIds.length > 0) {
    const { data: rows } = await supabase.from("organizations").select("id, name").in("id", wageOrgIds);
    wageOrgNames = Object.fromEntries(
      ((rows as { id: string; name: string }[] | null) ?? []).map((o) => [o.id, o.name]),
    );
  }

  const statusValues = Object.fromEntries(docStatusRows.map((r) => [r.doc_id, r.status]));
  const { items } = evaluatePrepChecklist(
    meta,
    {
      filledDocKeys: new Set(docs.filter((d) => d.storage_path).map((d) => d.doc_key)),
      photoPath: worker.photo_path,
      // 健康診断書の充足は添付の有無で判定するため、この値は使われない
      healthComplete: false,
      hasResidenceCard: cardDocs.length > 0,
      hasPassportFile: passportFiles.length > 0,
    },
    statusValues,
    worker.nationality,
  );

  const intake = normalizeOrganizationIntake(org?.intake);
  const savedDates = findPlanDatesForTodo(planDateRows, current?.todo_no ?? "");

  return (
    <PrepDetailSheet
      workerId={id}
      workerName={worker.name}
      todoNo={current?.todo_no ?? ""}
      appType={prepPrintAppType(meta)}
      tantou={meta.tantou}
      printedOn={todayStr()}
      orgLines={prepPrintOrgLines({
        name: org?.name ?? "",
        address: org?.address ?? "",
        contact: org?.contact ?? "",
        repName: intake.rep_name,
        repKana: intake.rep_kana,
        councilOffice: intake.council_office_submissions,
        councilResidence: intake.council_residence_submissions,
        councilNote: intake.council_note,
        financials: intake.financials,
      })}
      workerLines={prepPrintWorkerLines({
        name: worker.name,
        kana: worker.kana,
        birth: worker.birth ?? "",
        nationality: worker.nationality,
        homeAddress: worker.home_address ?? "",
        address: worker.address ?? "",
        residenceStatus: worker.residence_status,
        residencePeriod: worker.residence_period ?? "",
        residenceCardNo: worker.residence_card_no,
        residenceExpiryDate: worker.residence_expiry_date ?? "",
        passportNo: worker.passport_no ?? "",
        passportExpiryDate: worker.passport_expiry_date ?? "",
      })}
      docRows={prepPrintDocRows(items, statusValues, meta.target_reiwa, reiwaYear(todayStr()))}
      wageLines={prepPrintWageLines(wages, wageOrgNames)}
      dateLines={prepPrintDateLines(savedDates?.dates ?? {})}
      hasList={current != null}
    />
  );
}
