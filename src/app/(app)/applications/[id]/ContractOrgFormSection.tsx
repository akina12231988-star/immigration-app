"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import type { Form15Data } from "@/lib/resignation-forms";
import type { Application } from "@/types/application";
import type { Organization, Worker } from "@/types/db";

// 契約機関に関する届出（参考様式1の5・新たな契約の締結）。
// 在留カード受領後に本人が入管へ提出する届出を、外国人情報＋所属機関の情報から作成する。
// 様式の生成はサーバー側（/api/resignation-forms）で行い、Excelをダウンロードする。
export function ContractOrgFormSection({ app }: { app: Application }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (!app.workerId) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: w } = await supabase
        .from("workers")
        .select("*")
        .eq("id", app.workerId)
        .maybeSingle();
      const worker = w as Worker | null;
      if (!worker) throw new Error("紐づく外国人の情報が見つかりません");

      // 新たな機関 = 外国人の現在の所属機関（未設定なら申請に紐づく所属機関）
      const orgId = worker.current_organization_id ?? app.organizationId;
      let org: Organization | null = null;
      if (orgId) {
        const { data: o } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", orgId)
          .maybeSingle();
        org = o as Organization | null;
      }

      const data: Form15Data = {
        workerName: worker.name,
        gender: worker.gender,
        birth: worker.birth,
        nationality: worker.nationality,
        address: worker.address,
        residenceCardNo: worker.residence_card_no,
        residenceStatus: worker.residence_status,
        concludedOn: app.employmentStartOn ?? "",
        newOrgName: org?.name ?? app.organizationName ?? "",
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <h3 className="mb-1 text-sm font-bold">契約機関に関する届出（参考様式1の5・新たな契約の締結）</h3>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        新しい所属機関との契約について、本人が入管へ提出する届出です。
        外国人情報と所属機関の情報を転記したExcelを作成します（新たな契約を締結した年月日＝雇用開始日）。
        従前の機関・③署名・④連絡先・⑤提出者・⑥届出年月日は空欄のままなので、
        必要に応じてExcelの編集または手書きで記入してください。
      </p>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}
      <Button fullWidth icon={<FileSpreadsheet size={18} />} onClick={download} disabled={busy}>
        {busy ? "作成中…" : "届出のExcelを作成"}
      </Button>
    </Card>
  );
}
