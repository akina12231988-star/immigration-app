"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { downloadContractOrgForm } from "@/lib/contract-org-form";
import type { Application } from "@/types/application";

// 契約機関に関する届出（参考様式1の5・新たな契約の締結）。
// 在留カード受領後に本人が入管へ提出する届出を、外国人情報＋所属機関の情報から作成する。
// 外国人詳細の入社書類からも同じ届出を作れる（src/lib/contract-org-form.ts）。
export function ContractOrgFormSection({ app }: { app: Application }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (!app.workerId) return;
    setBusy(true);
    setError(null);
    try {
      await downloadContractOrgForm({
        workerId: app.workerId,
        concludedOn: app.employmentStartOn ?? "",
        fallbackOrgId: app.organizationId,
        fallbackOrgName: app.organizationName ?? "",
      });
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
