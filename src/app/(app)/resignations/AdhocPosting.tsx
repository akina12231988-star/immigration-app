"use client";

import { useState } from "react";
import { ExternalLink, Truck } from "lucide-react";
import { letterPackTrackingUrl } from "@/lib/application-prep";
import {
  adhocReportStatus,
  canCompletePosting,
  postingMissingLabel,
  type AdhocProgressFields,
} from "@/lib/adhoc-report-progress";
import { ADHOC_FILE_TARGETS, type AdhocFileKind } from "@/lib/adhoc-report-files";
import { dbErrorMessage } from "@/lib/errors";
import { RESIGNATION_STATUSES, type ResignationStatus } from "@/types/db";
import { AdhocFileAttachments } from "./AdhocFileAttachments";

const CELL =
  "rounded-lg border border-border bg-background px-2 py-1 text-xs focus:border-brand focus:outline-none";

// 届出書を郵送したときの記録（署名済みのスキャン・レターパックの追跡番号・投函日）。
// 3つそろうと自動で「投函完了」になる。
// 退職の記録と契約内容変更の記録で同じものを使う（保存は onPatch に任せる）。
export function AdhocPosting({
  kind,
  recordId,
  record,
  canEdit,
  onPatch,
}: {
  kind: AdhocFileKind;
  recordId: string;
  record: AdhocProgressFields;
  canEdit: boolean;
  // 画面の値の更新と保存（呼び出し側のテーブルへ書き込む）
  onPatch: (patch: Partial<AdhocProgressFields>) => Promise<void>;
}) {
  const [fileCount, setFileCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const status = adhocReportStatus(record);

  const patch = async (p: Partial<AdhocProgressFields>) => {
    const next = { ...record, ...p };
    // スキャン・追跡番号・投函日がそろったら、そのまま投函完了にする
    if (
      p.status === undefined &&
      canCompletePosting(next, fileCount) &&
      adhocReportStatus(next) !== "投函完了"
    ) {
      p = { ...p, status: "投函完了" };
    }
    setError(null);
    try {
      await onPatch(p);
    } catch (err) {
      setError(dbErrorMessage(err, ADHOC_FILE_TARGETS[kind].migration, "保存に失敗しました"));
    }
  };

  // 添付が増えて条件がそろったときも投函完了にする
  const onCountChange = (count: number) => {
    setFileCount(count);
    if (canCompletePosting(record, count) && adhocReportStatus(record) !== "投函完了") {
      void patch({ status: "投函完了" });
    }
  };

  const missing = postingMissingLabel(record, fileCount);

  return (
    <div className="mt-2 rounded-xl border border-border bg-background p-2.5">
      <p className="mb-1.5 text-[11px] font-bold text-muted">届出書の投函（署名が終わったら）</p>
      {error && (
        <p className="mb-1.5 rounded-lg bg-seal/10 px-2 py-1 text-[11px] text-seal">{error}</p>
      )}

      <AdhocFileAttachments
        kind={kind}
        recordId={recordId}
        canEdit={canEdit}
        onCountChange={onCountChange}
      />

      <div className="mt-1.5 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">投函日</span>
          {canEdit ? (
            <input
              type="date"
              value={record.posted_on ?? ""}
              onChange={(e) => void patch({ posted_on: e.target.value || null })}
              className={`${CELL} w-36`}
            />
          ) : (
            <span className="text-xs tabular-nums">{record.posted_on ?? "—"}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">レターパックの追跡番号</span>
          {canEdit ? (
            <input
              defaultValue={record.tracking_no ?? ""}
              onBlur={(e) => {
                if (e.target.value.trim() !== (record.tracking_no ?? ""))
                  void patch({ tracking_no: e.target.value.trim() });
              }}
              placeholder="例: 1234 5678 9012"
              className={`${CELL} w-44 tabular-nums`}
            />
          ) : (
            <span className="text-xs tabular-nums">{record.tracking_no || "—"}</span>
          )}
        </label>
        {record.tracking_no && (
          <a
            href={letterPackTrackingUrl(record.tracking_no)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand"
          >
            <ExternalLink size={12} />
            配達状況
          </a>
        )}
        {canEdit && status !== "投函完了" && (
          <button
            type="button"
            onClick={() => void patch({ status: "投函完了" })}
            className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-brand-foreground"
          >
            <Truck size={12} />
            投函完了にする
          </button>
        )}
      </div>

      {missing && status !== "投函完了" && (
        <p className="mt-1.5 text-[11px] text-muted">{missing}</p>
      )}

      {/* 進み具合の手直し（自動で変わった分を戻したいとき） */}
      {canEdit && (
        <label className="mt-1.5 flex items-center gap-1.5">
          <span className="shrink-0 text-[11px] text-muted">進み具合</span>
          <select
            value={status}
            onChange={(e) => void patch({ status: e.target.value as ResignationStatus })}
            className={CELL}
          >
            {RESIGNATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
