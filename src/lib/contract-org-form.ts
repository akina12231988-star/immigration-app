// 契約機関に関する届出（参考様式1の5・新たな契約の締結）のExcelを作ってダウンロードする。
// 申請詳細と外国人詳細（入社書類）の両方から使う。
// 様式の生成はサーバー側（/api/resignation-forms）で行う。

import { createClient } from "@/lib/supabase/client";
import type { Form15Data } from "@/lib/resignation-forms";
import type { Organization, Worker } from "@/types/db";

export async function downloadContractOrgForm({
  workerId,
  concludedOn,
  fallbackOrgId = null,
  fallbackOrgName = "",
}: {
  workerId: string;
  // 新たな契約を締結した年月日（未指定なら外国人の雇用開始日）
  concludedOn?: string | null;
  // 外国人に現在の所属機関が無いときに使う所属機関
  fallbackOrgId?: string | null;
  fallbackOrgName?: string;
}): Promise<void> {
  const supabase = createClient();
  const { data: w } = await supabase.from("workers").select("*").eq("id", workerId).maybeSingle();
  const worker = w as Worker | null;
  if (!worker) throw new Error("外国人の情報が見つかりません");

  // 新たな機関 = 外国人の現在の所属機関（未設定なら申請に紐づく所属機関）
  const orgId = worker.current_organization_id ?? fallbackOrgId;
  let org: Organization | null = null;
  if (orgId) {
    const { data: o } = await supabase.from("organizations").select("*").eq("id", orgId).maybeSingle();
    org = o as Organization | null;
  }

  // 雇用開始日（所属機関別の記録を優先し、無ければ既存の雇用開始年月日）
  const start =
    (worker.org_employment_starts ?? []).find((s) => s.organization_id === orgId && s.start_on)?.start_on ||
    worker.employment_start_on ||
    "";

  const data: Form15Data = {
    workerName: worker.name,
    gender: worker.gender,
    birth: worker.birth,
    nationality: worker.nationality,
    address: worker.address,
    residenceCardNo: worker.residence_card_no,
    residenceStatus: worker.residence_status,
    concludedOn: concludedOn || start,
    newOrgName: org?.name ?? fallbackOrgName,
    newOrgCorporateNo: org?.corporate_no ?? "",
    newOrgAddress: org?.address ?? "",
    activity: worker.field,
  };

  const res = await fetch("/api/resignation-forms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ form: "form15", data }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `様式の生成に失敗しました（${res.status}）`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const fileName = m ? decodeURIComponent(m[1]) : `契約機関に関する届出_${worker.name}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
