"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileSignature, FileText, MessageCircle, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { uploadWorkerDoc } from "@/lib/worker-docs";
import { messengerWebUrl } from "@/lib/messenger-link";
import { listWorkerDocs, type WorkerDocView } from "@/app/(app)/workers/actions";
import type { Organization, WorkerOrgEmploymentStart } from "@/types/db";

type Kind = "雇用契約書" | "雇用条件書";
const KINDS: Kind[] = ["雇用契約書", "雇用条件書"];

// 会社の選択肢（現在の所属機関・過去に雇用開始日を登録した機関）
interface OrgChoice {
  id: string;
  name: string;
  current: boolean;
}

// 雇用契約書・雇用条件書（採用時に外国人へ紐づける書類）。
// 転職すると会社ごとに契約書が発生するため、所属機関ごとに保管する。
// PDF・画像をアップロードして保管し、ダウンロードや
// Messenger での本人への送付（ダウンロード→添付）に使う。
// 求職一覧で「採用」にした人のカードからもここへ飛べる（#contracts）
export function WorkerContracts({
  workerId,
  canEdit,
  messengerLink,
  organizations,
  currentOrganizationId,
  orgEmploymentStarts,
}: {
  workerId: string;
  canEdit: boolean;
  messengerLink: string;
  organizations: Organization[];
  currentOrganizationId: string | null;
  orgEmploymentStarts: WorkerOrgEmploymentStart[];
}) {
  const [docs, setDocs] = useState<WorkerDocView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    listWorkerDocs(workerId).then(setDocs).catch(() => undefined);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const orgName = (id: string | null | undefined) =>
    organizations.find((o) => o.id === id)?.name ?? "";

  // 表示する会社: 現在の所属機関 → 雇用開始日を登録した機関 → 書類が既にある機関
  const orgChoices = useMemo<OrgChoice[]>(() => {
    const ids = new Set<string>();
    if (currentOrganizationId) ids.add(currentOrganizationId);
    for (const e of orgEmploymentStarts) if (e.organization_id) ids.add(e.organization_id);
    for (const d of docs) if (d.organizationId) ids.add(d.organizationId);
    return [...ids]
      .filter((id) => orgName(id))
      .map((id) => ({ id, name: orgName(id), current: id === currentOrganizationId }))
      // 現在の所属機関を先頭に、あとは会社名順
      .sort((a, b) =>
        a.current === b.current ? a.name.localeCompare(b.name, "ja") : a.current ? -1 : 1,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizations, currentOrganizationId, orgEmploymentStarts, docs]);

  // 表示中の会社（未選択なら先頭＝現在の所属機関）
  const [pickedOrgId, setPickedOrgId] = useState<string>("");
  const selectedOrgId = orgChoices.some((o) => o.id === pickedOrgId)
    ? pickedOrgId
    : (orgChoices[0]?.id ?? "");

  // 会社の紐づけが無い古い書類（0081より前に登録した分）
  const unassigned = docs.filter(
    (d) => KINDS.includes(d.kind as Kind) && !d.organizationId,
  );

  const handleError = (err: unknown) => {
    let message = err instanceof Error ? err.message : "アップロードに失敗しました";
    // 0079・0081が未適用だと worker_documents の制約・列で弾かれる
    if (/check|制約|column|organization_id/i.test(message)) {
      message += "／マイグレーション 0079_recruit_ledgers.sql・0081_worker_documents_organization.sql が未適用の可能性があります。Supabase の SQL Editor で適用してください。";
    }
    setError(message);
  };

  const selectedOrgName = orgName(selectedOrgId);

  return (
    <section id="contracts">
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
          <FileSignature size={14} />
          雇用契約書・雇用条件書
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          採用時の雇用契約書・雇用条件書を所属機関ごとに保管します（転職しても混ざりません）。
          PDF・画像で登録でき、ダウンロードして Messenger で本人に送れます。
          同じ会社で新しく登録すると最新になり、以前の分も履歴に残ります。
        </p>
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        {orgChoices.length === 0 ? (
          <p className="rounded-xl border border-border bg-background p-4 text-center text-xs text-muted">
            所属機関が未登録です。先に「現在の所属機関」を登録すると、その会社の契約書を保管できます。
          </p>
        ) : (
          <>
            {/* 会社の切り替え（転職した人は会社ごとに保管される） */}
            {orgChoices.length > 1 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {orgChoices.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setPickedOrgId(o.id)}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                      selectedOrgId === o.id
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border bg-surface text-muted"
                    }`}
                  >
                    {o.name}
                    {o.current ? "（現在）" : ""}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {KINDS.map((kind) => (
                <ContractColumn
                  key={`${selectedOrgId}-${kind}`}
                  kind={kind}
                  docs={docs.filter(
                    (d) => d.kind === kind && d.organizationId === selectedOrgId,
                  )}
                  workerId={workerId}
                  organizationId={selectedOrgId}
                  canEdit={canEdit}
                  onUploaded={load}
                  onError={handleError}
                />
              ))}
            </div>
            {selectedOrgName && (
              <p className="mt-2 text-[11px] text-muted">
                登録先: {selectedOrgName}
              </p>
            )}
          </>
        )}

        {/* 会社の紐づけが無い古い書類（どの会社の分か分からないもの） */}
        {unassigned.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-background p-3">
            <p className="mb-1.5 text-[11px] font-bold text-muted">所属機関の記録が無い書類</p>
            <div className="flex flex-col gap-0.5">
              {unassigned.map((d) => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-[11px] text-muted underline-offset-2 hover:text-brand hover:underline"
                >
                  {d.createdAt.slice(0, 10)} — {d.kind} {d.fileName || ""}
                </a>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted">
              会社が分かる場合は、その会社を選んで登録し直すと会社ごとの保管になります。
            </p>
          </div>
        )}

        {/* 本人への送付: ダウンロード → Messenger のチャットに添付して送る */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {messengerLink ? (
            <a
              href={messengerWebUrl(messengerLink)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-brand px-3 py-2 text-xs font-bold text-brand"
            >
              <MessageCircle size={14} />
              Messengerで送る（チャットを開く）
            </a>
          ) : (
            <span className="text-[11px] text-muted">
              Messengerリンクが未登録です。基本情報に登録すると、ここから本人のチャットを開けます。
            </span>
          )}
          <span className="text-[11px] text-muted">
            ダウンロードした書類をチャットに添付して送ってください。
          </span>
        </div>
      </Card>
    </section>
  );
}

function ContractColumn({
  kind,
  docs,
  workerId,
  organizationId,
  canEdit,
  onUploaded,
  onError,
}: {
  kind: Kind;
  docs: WorkerDocView[];
  workerId: string;
  organizationId: string;
  canEdit: boolean;
  onUploaded: () => void;
  onError: (err: unknown) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const latest = docs[0];
  const history = docs.slice(1);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await uploadWorkerDoc(workerId, kind, file, organizationId);
      onUploaded();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  const isImage = (d: WorkerDocView) => (d.mimeType ?? "").startsWith("image/");

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-bold text-muted">
          <FileText size={14} />
          {kind}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-brand disabled:opacity-50"
          >
            {busy ? "登録中…" : <><Upload size={12} /> 登録</>}
          </button>
        )}
      </div>
      {/* 枠にファイルを落としてもアップロードできる */}
      <FileDropArea
        onFiles={(files) => void handleFile(files[0])}
        disabled={!canEdit || busy}
        className="overflow-hidden rounded-xl border border-border bg-background"
      >
        {latest ? (
          isImage(latest) ? (
            <a href={latest.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={latest.url} alt={kind} className="max-h-56 w-full object-contain" />
            </a>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center gap-1 px-2 text-center">
              <FileText size={24} className="text-muted" />
              <p className="max-w-full truncate text-xs font-bold">{latest.fileName || kind}</p>
              <p className="text-[10px] text-muted">{latest.createdAt.slice(0, 10)} 登録</p>
            </div>
          )
        ) : (
          <div className="flex h-32 items-center justify-center px-2 text-center text-xs text-muted">
            {canEdit ? "未登録（PDF・画像をここにドロップでも登録できます）" : "未登録"}
          </div>
        )}
      </FileDropArea>
      {latest && (
        <div className="mt-1.5 flex items-center gap-2">
          <a
            href={latest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted"
          >
            <ExternalLink size={12} />
            開く
          </a>
          <a
            href={latest.downloadUrl || latest.url}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-brand"
          >
            <Download size={12} />
            ダウンロード
          </a>
        </div>
      )}
      {history.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] text-muted">履歴（{history.length}件）</p>
          <div className="flex flex-col gap-0.5">
            {history.map((d) => (
              <a
                key={d.id}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-[11px] text-muted underline-offset-2 hover:text-brand hover:underline"
              >
                {d.createdAt.slice(0, 10)} — {d.fileName || kind}
              </a>
            ))}
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
