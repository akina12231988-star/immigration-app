"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { insertDocumentRequest } from "@/lib/supabase/queries/org-document-requests";
import { dbErrorMessage } from "@/lib/errors";
import {
  daysToDue,
  dueLabel,
  requestProgress,
  type DocumentRequestCheck,
  type OrganizationDocumentRequest,
  type OrganizationDocumentRequestInput,
} from "@/lib/org-document-requests";
import { DocumentRequestForm } from "./DocumentRequestForm";

const CHIP = "min-h-[32px] rounded-full border px-3 text-xs transition";
const CHIP_ON = "border-brand bg-brand/10 font-bold text-brand";
const CHIP_OFF = "border-border bg-background text-muted";

// 依頼の一覧（機関で絞り込み・対応中／完了の切り替え）と、新しい依頼の登録
export function DocumentRequestsClient({
  organizations,
  requests: initialRequests,
  checks,
  workerIdsByOrg,
  loadError,
  initialOrgId,
  today,
  canEdit,
}: {
  organizations: { id: string; name: string }[];
  requests: OrganizationDocumentRequest[];
  checks: DocumentRequestCheck[];
  workerIdsByOrg: Record<string, string[]>; // 機関ごとの在籍者の ID
  loadError: string | null;
  initialOrgId: string;
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [orgFilter, setOrgFilter] = useState(initialOrgId);
  const [showClosed, setShowClosed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgName = (id: string) => organizations.find((o) => o.id === id)?.name ?? "（機関不明）";
  const checksByRequest = useMemo(() => {
    const m = new Map<string, DocumentRequestCheck[]>();
    for (const c of checks) m.set(c.request_id, [...(m.get(c.request_id) ?? []), c]);
    return m;
  }, [checks]);

  const visible = requests
    .filter((r) => (showClosed ? !!r.closed_on : !r.closed_on))
    .filter((r) => !orgFilter || r.organization_id === orgFilter);
  // 絞り込みのチップに出す機関（依頼のある機関だけ）
  const orgsWithRequests = organizations.filter((o) => requests.some((r) => r.organization_id === o.id));
  const openCount = requests.filter((r) => !r.closed_on).length;
  const closedCount = requests.length - openCount;

  const create = async (input: OrganizationDocumentRequestInput) => {
    setBusy(true);
    setError(null);
    try {
      const row = await insertDocumentRequest(createClient(), input);
      setRequests((prev) => [row, ...prev]);
      setFormOpen(false);
      router.push(`/organizations/requests/${row.id}`);
    } catch (err) {
      setError(dbErrorMessage(err, "0183_organization_document_requests.sql", "依頼を保存できませんでした"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 px-4 py-4 lg:px-8">
      <p className="text-[11px] leading-relaxed text-muted">
        会社から「年末調整の書類を集めてほしい」のような依頼が来たら、ここに登録します。
        依頼を開くと、その機関の在籍者ひとりひとり × 書類ごとに「案内した・発行した・会社に送った」をチェックできます。
      </p>
      {loadError && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {loadError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-bold text-brand-foreground"
          >
            <Plus size={16} />
            会社からの依頼を登録
          </button>
        )}
        <span className="ml-auto flex gap-1">
          <button type="button" onClick={() => setShowClosed(false)} className={`${CHIP} ${!showClosed ? CHIP_ON : CHIP_OFF}`}>
            対応中（{openCount}）
          </button>
          <button type="button" onClick={() => setShowClosed(true)} className={`${CHIP} ${showClosed ? CHIP_ON : CHIP_OFF}`}>
            完了（{closedCount}）
          </button>
        </span>
      </div>

      {orgsWithRequests.length > 1 && (
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setOrgFilter("")} className={`${CHIP} ${!orgFilter ? CHIP_ON : CHIP_OFF}`}>
            すべての機関
          </button>
          {orgsWithRequests.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOrgFilter(o.id)}
              className={`${CHIP} ${orgFilter === o.id ? CHIP_ON : CHIP_OFF}`}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          {showClosed ? "完了した依頼はありません" : "対応中の依頼はありません"}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((r) => {
            const p = requestProgress(r.items, workerIdsByOrg[r.organization_id] ?? [], checksByRequest.get(r.id) ?? []);
            const days = daysToDue(r.due_on, today);
            const dueTone =
              r.closed_on || days === null ? "text-muted" : days < 0 ? "text-seal" : days <= 7 ? "text-amber-700" : "text-muted";
            const pct = p.total > 0 ? Math.round((p.sent / p.total) * 100) : 0;
            return (
              <Link key={r.id} href={`/organizations/requests/${r.id}`} className="block">
                <Card className="h-full p-4 hover:border-brand">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-muted">{orgName(r.organization_id)}</p>
                      <p className="truncate font-bold">{r.title}</p>
                    </div>
                    {r.closed_on ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-approved-bg px-2 py-0.5 text-[11px] font-bold text-status-approved-fg">
                        <CheckCircle2 size={12} />
                        完了
                      </span>
                    ) : p.done ? (
                      <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">全員送付済</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    依頼日 {r.requested_on}
                    {r.due_on && (
                      <>
                        {" ・ "}期限 {r.due_on}
                        {!r.closed_on && <span className={`ml-1 font-bold ${dueTone}`}>（{dueLabel(r.due_on, today)}）</span>}
                      </>
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
                    <ClipboardList size={12} className="mt-0.5" />
                    {r.items.map((i) => i.name).join("・")}
                  </p>
                  {/* 会社に送った数 / 対象の数（在籍者 × 書類） */}
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted">会社に送った</span>
                      <span className="font-bold tabular-nums">
                        {p.sent} / {p.total}
                        {p.total > 0 && <span className="ml-1 text-muted">（{pct}%）</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      在籍者 {(workerIdsByOrg[r.organization_id] ?? []).length}名 × 書類 {r.items.length}件
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {formOpen && (
        <DocumentRequestForm
          organizations={organizations}
          defaultOrgId={orgFilter}
          today={today}
          busy={busy}
          error={error}
          onSubmit={(input) => void create(input)}
          onClose={() => {
            setFormOpen(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
