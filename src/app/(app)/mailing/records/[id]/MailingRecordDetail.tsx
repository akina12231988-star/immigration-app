"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PersonCopyPanel } from "@/components/mailing/PersonCopyPanel";
import { requestKindLabel, type JudgmentRecord, type Municipality } from "@/lib/tax-cert";
import type { TaxOffice } from "@/lib/tax-office";
import type { MailingWorker } from "../../ui";
import { RecordsTab } from "../../MailingClient";
import { NhiSplitPanel } from "./NhiSplitPanel";
import { canSplitNhi } from "@/lib/mailing-split";

// 記録の詳細。中身（進捗のボタン・編集・削除・添付）は記録一覧と同じ部品を1件だけで出し、
// その下に申請書に書く本人の情報（氏名・生年月日・住所・住所歴）を出す
export function MailingRecordDetail({
  record,
  municipalities: initialMunicipalities,
  taxOffices: initialTaxOffices,
  workers,
  canEdit,
  justSaved,
  otherId = "",
}: {
  record: JudgmentRecord;
  municipalities: Municipality[];
  taxOffices: TaxOffice[];
  workers: MailingWorker[];
  canEdit: boolean;
  justSaved: boolean;
  otherId?: string; // 国保税の納税証明書を別の記録にしたとき、その記録のID
}) {
  const router = useRouter();
  const [records, setRecords] = useState<JudgmentRecord[]>([record]);
  const [municipalities, setMunicipalities] = useState(initialMunicipalities);
  const [taxOffices, setTaxOffices] = useState(initialTaxOffices);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };
  const current = records[0] ?? record;
  const years = (current.yearRequests ?? []).map((y) => y.fiscalStartYear).filter((y) => y > 0);

  return (
    <div className="space-y-3">
      {justSaved && (
        <p className="rounded-xl bg-status-reported-bg px-3 py-2 text-sm font-bold text-status-reported-fg">
          {requestKindLabel(current.requestKind)}の請求を記録しました。届いた証明書はこのページで添付してください。
        </p>
      )}
      {otherId && (
        <p className="rounded-xl border border-brand/40 bg-brand/5 px-3 py-2 text-sm">
          国民健康保険税の納税証明書は受け取り方が違うので、別の記録にしました。
          <Link href={`/mailing/records/${otherId}`} className="ml-1 font-bold text-brand underline">
            国保税の納税証明書の記録を開く
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/mailing?focus=${current.id}`}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-bold text-muted"
        >
          <ArrowLeft size={15} />
          記録一覧へ
        </Link>
        {current.workerId && (
          <>
            <Link
              href={`/workers/${current.workerId}/application-prep`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-bold text-brand-foreground"
            >
              <ClipboardList size={15} />
              申請準備{current.todoNumber ? `（${current.todoNumber}）` : ""}へ
            </Link>
            <Link
              href={`/workers/${current.workerId}`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-brand px-3 text-sm font-bold text-brand"
            >
              <UserRound size={15} />
              外国人詳細
            </Link>
          </>
        )}
      </div>

      {records.length > 0 && (
        <RecordsTab
          records={records}
          setRecords={setRecords}
          municipalities={municipalities}
          setMunicipalities={setMunicipalities}
          taxOffices={taxOffices}
          setTaxOffices={setTaxOffices}
          workers={workers}
          canEdit={canEdit}
          showToast={showToast}
          single
          onDeleted={() => router.push("/mailing?tab=records")}
        />
      )}

      {/* 国保税の納税証明書を別の記録に分ける（国保の自治体が違う・受け取り方を変えたいとき） */}
      {canEdit && canSplitNhi(current) && (
        <NhiSplitPanel
          record={current}
          onSplit={(main, nhi) => {
            if (main) setRecords([main]);
            showToast("国保税の納税証明書を別の記録にしました");
            router.push(main ? `/mailing/records/${current.id}?other=${nhi.id}` : `/mailing/records/${nhi.id}`);
            router.refresh();
          }}
        />
      )}

      {current.workerId && (
        <Card className="p-4">
          <PersonCopyPanel workerId={current.workerId} years={years} />
        </Card>
      )}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
