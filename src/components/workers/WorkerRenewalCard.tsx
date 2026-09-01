"use client";

import { messengerWebUrl } from "@/lib/messenger-link";
import { useState } from "react";
import Link from "next/link";
import { CalendarClock, ExternalLink, MessageCircle, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import {
  RENEWAL_STATUS_LABEL,
  WorkerRenewalFields,
} from "@/components/workers/WorkerRenewalFields";
import { remainingLabel, daysUntil } from "@/lib/worker-alerts";
import { notionAppUrl } from "@/lib/notion-link";
import type { ResidenceRenewalStatus, Worker } from "@/types/db";

// 対応状況の呼び名は入力欄と共通（他の画面からはこちらを読んでいるので再公開する）
export { RENEWAL_STATUS_LABEL };

const STATUS_CLASS: Record<ResidenceRenewalStatus, string> = {
  "": "bg-seal/10 text-seal",
  準備中: "bg-status-applied-bg text-status-applied-fg",
  審査中: "bg-brand/10 text-brand",
  転職先にて対応中: "bg-status-notice-bg text-status-notice-fg",
  他登録支援機関にて対応中: "bg-status-notice-bg text-status-notice-fg",
  帰国: "bg-background text-muted",
};

// カードの表示・編集に使う項目だけ（一覧は列を絞って取るため全項目は持たない）
export type RenewalCardWorker = Pick<
  Worker,
  | "id"
  | "name"
  | "status"
  | "nationality"
  | "residence_status"
  | "residence_expiry_date"
  | "residence_renewal_status"
  | "residence_renewal_todo"
  | "notion_link"
  | "messenger_link"
> & {
  // 所属機関の表示・編集用（一覧によっては取得していないので任意）
  current_organization_id?: string | null;
  application_prep_organization_id?: string | null;
  application_prep_kind?: string | null;
};

// 在留更新対象の1件を表示・編集するカード（在留更新対象ページと外国人管理で共用）
export function WorkerRenewalCard({
  worker,
  orgName,
  organizations,
  today,
  canEdit,
  todoGuide = false,
}: {
  worker: RenewalCardWorker;
  orgName?: string | null;
  // 渡すと「所属機関（転職の場合は転職先）」を選べるようになる
  organizations?: { id: string; name: string }[];
  today: string;
  canEdit: boolean;
  // TODO番号が未入力の人に「NotionでTODOを作成→番号を入力」の案内を出す（更新準備用）
  todoGuide?: boolean;
}) {
  // 見出しのバッジ・所属機関名は入力中の値に追従させる（保存前でも見た目が変わる）
  const [status, setStatus] = useState<ResidenceRenewalStatus>(worker.residence_renewal_status);
  const [prepOrgId, setPrepOrgId] = useState(
    worker.application_prep_organization_id ?? worker.current_organization_id ?? "",
  );
  const expiry = worker.residence_expiry_date ?? "";
  const days = expiry ? daysUntil(expiry, today) : 0;
  const overdue = days < 0;

  return (
    <Card className={`p-4 ${status === "" && overdue ? "border-seal" : ""}`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {/* クリックしても遷移せず、選択・コピーできるように通常テキストにする */}
            <p className="select-text truncate font-bold">{worker.name}</p>
            <CopyButton value={worker.name} label="氏名をコピー" />
          </div>
          <p className="truncate text-xs text-muted">
            {(organizations?.find((o) => o.id === prepOrgId)?.name ?? orgName) ?? "所属機関未設定"}
            {worker.nationality && ` ・ ${worker.nationality}`}
            {worker.residence_status && ` ・ ${worker.residence_status}`}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASS[status]}`}>
          {RENEWAL_STATUS_LABEL[status]}
        </span>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-muted">
        <span className="flex items-center gap-1">
          <CalendarClock size={12} />
          在留期限 {expiry || "未登録"}
        </span>
        {expiry && (
          <span className={`font-bold ${overdue ? "text-seal" : "text-status-applied-fg"}`}>
            （{remainingLabel(expiry, today)}）
          </span>
        )}
      </p>

      <div className="mt-2 flex flex-wrap gap-3">
        <Link href={`/workers/${worker.id}`} className="flex items-center gap-1 text-xs font-bold text-brand">
          <UserRound size={13} />
          外国人情報
        </Link>
        {worker.messenger_link && (
          <a href={messengerWebUrl(worker.messenger_link)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-brand">
            <MessageCircle size={13} />
            Messenger
          </a>
        )}
        {worker.notion_link && (
          <a href={notionAppUrl(worker.notion_link)} className="flex items-center gap-1 text-xs font-bold text-brand">
            <ExternalLink size={13} />
            Notionを開く
          </a>
        )}
      </div>

      {/* TODO番号が未入力の人は、NotionでTODOを作成するところから案内する */}
      {todoGuide && !(worker.residence_renewal_todo ?? "").trim() && (
        <div className="mt-3 rounded-xl border border-brand/40 bg-brand/5 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
          <p className="mb-1 text-xs font-bold text-brand">
            まずNotionで申請TODOを作成しましょう
          </p>
          <p>
            ① 「Notionを開く」からこの人のNotionページを開き、申請TODOを作成します
            {!worker.notion_link && "（Notion未登録の場合は下の欄でリンクを登録できます）"}。
            <br />
            ② できたTODO番号（例: TODO-1234）を下の「Notion 申請TODO番号」に入力して保存します。
          </p>
          <p className="mt-1">
            保存すると対応状況が「準備中」になってこの一覧からは消え、申請準備の方に表示されます。
          </p>
        </div>
      )}

      {canEdit && (
        <div className="mt-3 border-t border-border pt-3">
          {/* 入力欄は外国人詳細の申請準備 書類チェックリストと共通 */}
          <WorkerRenewalFields
            worker={worker}
            organizations={organizations}
            canEdit={canEdit}
            today={today}
            onDraftChange={(d) => {
              setStatus(d.status);
              setPrepOrgId(d.prepOrgId);
            }}
          />
        </div>
      )}
    </Card>
  );
}
