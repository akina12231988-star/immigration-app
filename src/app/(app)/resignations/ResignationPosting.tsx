"use client";

import { useState } from "react";
import { ExternalLink, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateResignation, type ResignationWithRefs } from "@/lib/supabase/queries/resignations";
import { letterPackTrackingUrl } from "@/lib/application-prep";
import {
  canCompletePosting,
  postingMissingLabel,
  resignationStatus,
} from "@/lib/resignation-progress";
import { dbErrorMessage } from "@/lib/errors";
import { RESIGNATION_STATUSES, type ResignationStatus } from "@/types/db";
import { ResignationFileAttachments } from "./ResignationFileAttachments";

const MIGRATION = "0086_resignation_progress.sql";
const CELL =
  "rounded-lg border border-border bg-background px-2 py-1 text-xs focus:border-brand focus:outline-none";

// 届出書を郵送したときの記録（署名済みのスキャン・レターパックの追跡番号・投函日）。
// 3つそろうと自動で「投函完了」になる。
export function ResignationPosting({
  resignation,
  canEdit,
  onPatched,
}: {
  resignation: ResignationWithRefs;
  canEdit: boolean;
  onPatched: (patch: Partial<ResignationWithRefs>) => void;
}) {
  const [fileCount, setFileCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const status = resignationStatus(resignation);

  const patch = async (p: Partial<ResignationWithRefs>) => {
    const next = { ...resignation, ...p };
    // スキャン・追跡番号・投函日がそろったら、そのまま投函完了にする
    if (
      p.status === undefined &&
      canCompletePosting(next, fileCount) &&
      resignationStatus(next) !== "投函完了"
    ) {
      p = { ...p, status: "投函完了" };
    }
    onPatched(p);
    setError(null);
    try {
      await updateResignation(createClient(), resignation.id, p);
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "保存に失敗しました"));
    }
  };

  // 添付が増えて条件がそろったときも投函完了にする
  const onCountChange = (count: number) => {
    setFileCount(count);
    if (
      canCompletePosting(resignation, count) &&
      resignationStatus(resignation) !== "投函完了"
    ) {
      void patch({ status: "投函完了" });
    }
  };

  const missing = postingMissingLabel(resignation, fileCount);

  return (
    <div className="mt-2 rounded-xl border border-border bg-background p-2.5">
      <p className="mb-1.5 text-[11px] font-bold text-muted">届出書の投函（署名が終わったら）</p>
      {error && <p className="mb-1.5 rounded-lg bg-seal/10 px-2 py-1 text-[11px] text-seal">{error}</p>}

      <ResignationFileAttachments
        resignationId={resignation.id}
        canEdit={canEdit}
        onCountChange={onCountChange}
      />

      <div className="mt-1.5 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">投函日</span>
          {canEdit ? (
            <input
              type="date"
              value={resignation.posted_on ?? ""}
              onChange={(e) => void patch({ posted_on: e.target.value || null })}
              className={`${CELL} w-36`}
            />
          ) : (
            <span className="text-xs tabular-nums">{resignation.posted_on ?? "—"}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">レターパックの追跡番号</span>
          {canEdit ? (
            <input
              defaultValue={resignation.tracking_no ?? ""}
              onBlur={(e) => {
                if (e.target.value.trim() !== (resignation.tracking_no ?? ""))
                  void patch({ tracking_no: e.target.value.trim() });
              }}
              placeholder="例: 1234 5678 9012"
              className={`${CELL} w-44 tabular-nums`}
            />
          ) : (
            <span className="text-xs tabular-nums">{resignation.tracking_no || "—"}</span>
          )}
        </label>
        {resignation.tracking_no && (
          <a
            href={letterPackTrackingUrl(resignation.tracking_no)}
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
