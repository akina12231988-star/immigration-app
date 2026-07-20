import Link from "next/link";
import { Mailbox, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  collectionLabel,
  methodText,
  recordHasMailRequest,
  yearWithReiwa,
  type JudgmentRecord,
} from "@/lib/tax-cert";

// 外国人詳細に表示する「郵送請求（課税・納税証明書）の記録」。
// この外国人に紐づく判定記録から、過去にどこ（自治体）へ請求したかを一覧する。
export function WorkerMailingHistory({
  workerId,
  records,
}: {
  workerId: string;
  records: JudgmentRecord[];
}) {
  const mailCount = records.filter(recordHasMailRequest).length;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-muted">
          <Mailbox size={14} />
          郵送請求（課税・納税証明書）（{records.length}件
          {mailCount > 0 ? `・郵送${mailCount}件` : ""}）
        </h2>
        <Link
          href={`/mailing?worker=${workerId}`}
          className="text-xs font-bold text-brand"
        >
          郵送請求ツール
        </Link>
      </div>

      {records.length === 0 ? (
        <Card className="p-5 text-center text-sm text-muted">
          この外国人に紐づく判定記録はありません。郵送請求ツールの「判定フォーム」で
          この外国人を選んで保存すると、ここに請求先・請求日が残ります。
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {records.map((r) => (
            <Link
              key={r.id}
              href={`/mailing?worker=${workerId}&record=${r.id}`}
              className="flex items-start gap-3 p-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-bold">{r.municipalityName}</p>
                  <span className="text-[11px] font-medium text-muted">
                    {collectionLabel(r.collectionType)} ・{" "}
                    {r.yearType === "prev" ? "前年度" : "新年度"}
                    {yearWithReiwa(r.fiscalStartYear)}
                  </span>
                  {recordHasMailRequest(r) && (
                    <span className="rounded-full bg-status-reported-bg px-2 py-0.5 text-[10px] font-bold text-status-reported-fg">
                      郵送請求
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted">
                  受領：{methodText(r.requestMethod, r.mailRequestDate, r.recipientType, r.agentName)}
                </p>
                {r.hasNhi && (
                  <p className="mt-0.5 text-xs text-muted">
                    国保：{r.nhiMunicipalityName || "未選択"} ／{" "}
                    {r.nhiSameAsMain
                      ? "課税証明書と同じ受領方法"
                      : methodText(
                          r.nhiRequestMethod,
                          r.nhiMailRequestDate,
                          r.nhiRecipientType,
                          r.nhiAgentName,
                        )}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] tabular-nums text-muted">
                  {r.todoNumber ? `TODO ${r.todoNumber} ・ ` : ""}
                  {new Date(r.createdAt).toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <ChevronRight size={18} className="mt-0.5 shrink-0 text-muted" />
            </Link>
          ))}
        </Card>
      )}
    </section>
  );
}
