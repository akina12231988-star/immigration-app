"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, MailPlus, Phone, Truck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { updateExtraRequest } from "@/lib/supabase/queries/extra-requests";
import { letterPackTrackingUrl } from "@/lib/application-prep";
import {
  extraRequestAlert,
  extraRequestDueLabel,
  isExtraRequestOpen,
  sortExtraRequests,
  type ExtraRequestAlert,
} from "@/lib/extra-request-alerts";
import { errorMessage } from "@/lib/errors";
import {
  EXTRA_REQUEST_STATUSES,
  type Application,
  type ApplicationExtraRequest,
  type ExtraRequestStatus,
} from "@/types/application";

// 提出期限のバッジの色。過ぎている・今日は赤、3日以内は黄色
const ALERT_CLASS: Record<ExtraRequestAlert, string> = {
  overdue: "bg-seal/10 text-seal",
  today: "bg-seal/10 text-seal",
  soon: "bg-status-notice-bg text-status-notice-fg",
  normal: "bg-background text-muted",
  none: "bg-background text-muted",
  done: "bg-background text-muted",
};

const CELL =
  "rounded-lg border border-border bg-background px-2 py-1 text-xs focus:border-brand focus:outline-none";

// 申請一覧の「＜入管＞追加資料」タブ。
// 入管から追加資料を求められた案件だけを集めて、提出期限のアラートを出し、
// 郵送した日・レターパックの追跡番号をこの画面のまま入力できるようにする。
export function ExtraRequestBoard({
  rows,
  applications,
  today,
  keyword,
  canEdit,
  onChanged,
}: {
  rows: ApplicationExtraRequest[];
  applications: Application[];
  today: string;
  keyword: string;
  canEdit: boolean;
  onChanged: (row: ApplicationExtraRequest) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appById = useMemo(
    () => new Map(applications.map((a) => [a.id, a])),
    [applications],
  );

  const shown = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const matches = (r: ApplicationExtraRequest) => {
      if (!kw) return true;
      const a = appById.get(r.application_id);
      return [a?.name, a?.applicationNumber, a?.organizationName, r.officer, r.items]
        .some((v) => (v ?? "").toLowerCase().includes(kw));
    };
    return sortExtraRequests(
      rows.filter((r) => (showDone || isExtraRequestOpen(r)) && matches(r)),
    );
  }, [rows, appById, keyword, showDone]);

  const openCount = rows.filter(isExtraRequestOpen).length;
  const doneCount = rows.length - openCount;

  const patch = async (r: ApplicationExtraRequest, p: Partial<ApplicationExtraRequest>) => {
    onChanged({ ...r, ...p });
    setError(null);
    try {
      await updateExtraRequest(createClient(), r.id, p);
    } catch (err) {
      setError(errorMessage(err, "保存に失敗しました"));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-muted">
          未完了 {openCount}件{showDone && doneCount > 0 ? `／完了 ${doneCount}件` : ""}
        </p>
        {doneCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="h-4 w-4"
            />
            完了した分も表示（{doneCount}件）
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          入管から追加資料を求められている案件はありません。
          <br />
          記録は申請詳細の「追加資料の提出依頼（審査中）」から追加できます。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((r) => {
            const app = appById.get(r.application_id);
            const alert = extraRequestAlert(r, today);
            const done = !isExtraRequestOpen(r);
            const urgent = alert === "overdue" || alert === "today";
            return (
              <Card
                key={r.id}
                className={`p-4 ${urgent ? "border-seal" : done ? "" : "border-status-notice-fg/40"}`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-bold">
                    {app?.name ?? "（申請が見つかりません）"}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${ALERT_CLASS[alert]}`}
                  >
                    {done ? "完了（郵送済み）" : extraRequestDueLabel(r.due_on, today)}
                  </span>
                </div>
                <p className="truncate text-xs text-muted">
                  {app?.organizationName ?? "所属機関未設定"}
                  {app?.applicationNumber ? ` ・ 申請番号 ${app.applicationNumber}` : ""}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                  <span className="flex items-center gap-1 font-bold">
                    {r.method === "電話" ? <Phone size={12} /> : <MailPlus size={12} />}
                    {r.method}で依頼
                  </span>
                  <span className="tabular-nums">{r.requested_on}</span>
                  {r.officer && <span>審査担当者 {r.officer}</span>}
                </p>

                {r.items && (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-background p-2 text-xs">
                    {r.items}
                  </p>
                )}

                {/* この場で入れられるもの: 対応状況・郵送した日・追跡番号 */}
                <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-border pt-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">今の対応状況</span>
                    {canEdit ? (
                      <select
                        value={r.status}
                        onChange={(e) =>
                          void patch(r, { status: e.target.value as ExtraRequestStatus })
                        }
                        className={`${CELL} font-bold`}
                      >
                        {EXTRA_REQUEST_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-bold">{r.status}</span>
                    )}
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">郵送した日</span>
                    {canEdit ? (
                      <input
                        type="date"
                        value={r.sent_on ?? ""}
                        onChange={(e) => void patch(r, { sent_on: e.target.value || null })}
                        className={`${CELL} w-36`}
                      />
                    ) : (
                      <span className="text-xs tabular-nums">{r.sent_on ?? "—"}</span>
                    )}
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">レターパックの追跡番号</span>
                    {canEdit ? (
                      <input
                        defaultValue={r.tracking_no}
                        onBlur={(e) => {
                          if (e.target.value.trim() !== r.tracking_no)
                            void patch(r, { tracking_no: e.target.value.trim() });
                        }}
                        placeholder="例: 1234 5678 9012"
                        className={`${CELL} w-44 tabular-nums`}
                      />
                    ) : (
                      <span className="text-xs tabular-nums">{r.tracking_no || "—"}</span>
                    )}
                  </label>
                  {r.tracking_no && (
                    <a
                      href={letterPackTrackingUrl(r.tracking_no)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand"
                    >
                      <ExternalLink size={12} />
                      配達状況
                    </a>
                  )}
                  {canEdit && !done && (
                    <button
                      type="button"
                      onClick={() =>
                        void patch(r, { status: "郵送済み", sent_on: r.sent_on ?? today })
                      }
                      className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-brand-foreground"
                    >
                      <Truck size={12} />
                      レターパックで送った（完了）
                    </button>
                  )}
                  {done && (
                    <span className="flex items-center gap-1 rounded-full bg-status-approved-bg px-2 py-1 text-[11px] font-bold text-status-approved-fg">
                      <Check size={12} />
                      完了
                    </span>
                  )}
                </div>

                {app && (
                  <Link
                    href={`/applications/${app.id}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand"
                  >
                    申請詳細を開く（本人からの返事・通知書の添付）
                  </Link>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
