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

// 記録の詳細。中身（進捗のボタン・編集・削除・添付）は記録一覧と同じ部品を1件だけで出し、
// その下に申請書に書く本人の情報（氏名・生年月日・住所・住所歴）を出す
export function MailingRecordDetail({
  record,
  municipalities: initialMunicipalities,
  taxOffices: initialTaxOffices,
  workers,
  canEdit,
  justSaved,
}: {
  record: JudgmentRecord;
  municipalities: Municipality[];
  taxOffices: TaxOffice[];
  workers: MailingWorker[];
  canEdit: boolean;
  justSaved: boolean;
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
