"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  MessageCircle,
  Trash2,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { uploadWorkerDoc } from "@/lib/worker-docs";
import { messengerWebUrl } from "@/lib/messenger-link";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import {
  contractDatesForOrg,
  normalizeOrgEmploymentStarts,
  upsertOrgContractDates,
} from "@/lib/org-employment";
import {
  deleteWorkerDoc,
  listWorkerDocs,
  setWorkerDocOrganization,
  type WorkerDocView,
} from "@/app/(app)/workers/actions";
import type { Organization, WorkerOrgEmploymentStart } from "@/types/db";

type Kind =
  | "雇用契約書"
  | "雇用条件書"
  | "雇用契約書（日付なし）"
  | "雇用条件書（日付なし）";
// 正式な日付入りの契約書（外国人詳細の正式版。申請準備のTODOからもここにリンクされる）
const KINDS: Kind[] = ["雇用契約書", "雇用条件書"];
// 一旦、日付なしで印鑑・署名をもらってきた版（0104）。正式な日付入りは上のKINDSで保存する
const UNDATED_KINDS: Kind[] = ["雇用契約書（日付なし）", "雇用条件書（日付なし）"];
const ALL_KINDS: Kind[] = [...KINDS, ...UNDATED_KINDS];

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
  showUndated = true,
}: {
  workerId: string;
  canEdit: boolean;
  messengerLink: string;
  organizations: Organization[];
  currentOrganizationId: string | null;
  orgEmploymentStarts: WorkerOrgEmploymentStart[];
  // 日付なし（印鑑・署名あり）版の枠を出すか。申請準備の詳細では出し、外国人詳細では出さない
  showUndated?: boolean;
}) {
  const [docs, setDocs] = useState<WorkerDocView[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 雇用契約日・雇用条件書の作成日（所属機関別。org_employment_starts の中に持つ）
  const [dateRows, setDateRows] = useState(() =>
    normalizeOrgEmploymentStarts(orgEmploymentStarts),
  );
  const [dateStatus, setDateStatus] = useState<"" | "保存中…" | "保存しました">("");

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
    (d) => ALL_KINDS.includes(d.kind as Kind) && !d.organizationId,
  );

  const handleError = (err: unknown) => {
    let message = err instanceof Error ? err.message : "アップロードに失敗しました";
    // 0079・0081が未適用だと worker_documents の制約・列で弾かれる
    if (/check|制約|column|organization_id/i.test(message)) {
      message += "／マイグレーション 0079_recruit_ledgers.sql・0081_worker_documents_organization.sql・0104_worker_contract_undated.sql が未適用の可能性があります。Supabase の SQL Editor で適用してください。";
    }
    setError(message);
  };

  const selectedOrgName = orgName(selectedOrgId);

  // 表示中の会社の契約書の日付。欄を直したらその場で保存する
  const dates = contractDatesForOrg(dateRows, selectedOrgId);
  const setDate = async (key: "contract_on" | "conditions_on", value: string) => {
    if (!selectedOrgId) return;
    const next = upsertOrgContractDates(dateRows, selectedOrgId, { [key]: value });
    setDateRows(next);
    setDateStatus("保存中…");
    setError(null);
    try {
      await updateWorker(createClient(), workerId, { org_employment_starts: next });
      setDateStatus("保存しました");
    } catch (err) {
      setDateStatus("");
      setError(err instanceof Error ? err.message : "日付の保存に失敗しました");
    }
  };

  // 契約書の列の下に出す日付の欄（雇用契約書＝雇用契約日、雇用条件書＝作成日）
  const dateFooter = (kind: Kind) => {
    const key = kind === "雇用契約書" ? "contract_on" : "conditions_on";
    const label = kind === "雇用契約書" ? "雇用契約日" : "雇用条件書の作成日";
    if (!selectedOrgId) return null;
    return (
      <label className="mt-1.5 flex items-center gap-1.5">
        <span className="shrink-0 text-[11px] font-bold text-muted">{label}</span>
        <input
          type="date"
          value={dates[key]}
          onChange={(e) => void setDate(key, e.target.value)}
          disabled={!canEdit}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-1.5 py-1 text-[11px] disabled:opacity-60"
        />
      </label>
    );
  };

  // 登録済みの書類を別の会社に付け替える（会社を間違えて登録したときの訂正）
  const [reassigning, setReassigning] = useState<string | null>(null);
  const reassign = async (docId: string, organizationId: string) => {
    setReassigning(docId);
    setError(null);
    try {
      const res = await setWorkerDocOrganization(docId, organizationId || null);
      if (!res.ok) throw new Error(res.message);
      load();
    } catch (err) {
      handleError(err);
    } finally {
      setReassigning(null);
    }
  };

  // 間違えて登録した書類の削除（保存したファイルの実体も消える）
  const removeDoc = async (doc: WorkerDocView) => {
    if (
      !window.confirm(
        `「${doc.kind}」の登録データ（${doc.downloadName || doc.fileName || ""}）を削除します。元に戻せません。よろしいですか？`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await deleteWorkerDoc(doc.id);
      if (!res.ok) throw new Error(res.message);
      load();
    } catch (err) {
      handleError(err);
    }
  };

  // 付け替え先の候補（この外国人に関係する会社を先に、その他の会社も選べる）
  const allOrgOptions = [
    ...orgChoices.map((o) => ({ id: o.id, name: o.name + (o.current ? "（現在）" : "") })),
    ...organizations
      .filter((o) => !orgChoices.some((c) => c.id === o.id))
      .map((o) => ({ id: o.id, name: o.name })),
  ];

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

        {orgChoices.length === 0 && organizations.length === 0 ? (
          <p className="rounded-xl border border-border bg-background p-4 text-center text-xs text-muted">
            所属機関が未登録です。先に「現在の所属機関」を登録すると、その会社の契約書を保管できます。
          </p>
        ) : (
          <>
            {/* どの会社の契約書として登録するかをはっきり出す（違っていたらここで選び直す） */}
            <div className="mb-3 rounded-xl border border-brand/40 bg-brand/5 p-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-brand">この会社の契約書として登録します</span>
                <select
                  value={selectedOrgId}
                  onChange={(e) => setPickedOrgId(e.target.value)}
                  disabled={!canEdit}
                  className="min-h-[44px] w-full rounded-xl border border-border bg-surface px-3 text-base font-bold focus:border-brand focus:outline-none disabled:opacity-70"
                >
                  {orgChoices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.current ? "（現在の所属機関）" : ""}
                    </option>
                  ))}
                  {/* 過去・別の会社の分をここに入れることもできる */}
                  {organizations
                    .filter((o) => !orgChoices.some((c) => c.id === o.id))
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </label>
              <p className="mt-1 text-[11px] text-muted">
                会社が違うときはここで選び直してから登録してください。
              </p>
            </div>

            {/* 一旦、日付なしで印鑑・署名をもらってきた版。正式な日付入りは上に登録する。
                外国人詳細では出さない（showUndated=false。申請準備の詳細で保管する） */}
            {showUndated && (
              <>
                <p className="mb-1 text-xs font-bold text-muted">
                  日付なし（印鑑・署名あり）版
                </p>
                <p className="mb-2 text-[11px] leading-relaxed text-muted">
                  先に日付なしで印鑑・署名をもらってきた雇用契約書・雇用条件書はここに保管してください。
                  あとから正式な日付が入ったものは、下の「雇用契約書」「雇用条件書」に登録します。
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {UNDATED_KINDS.map((kind) => (
                    <ContractColumn
                      key={`${selectedOrgId}-${kind}`}
                      kind={kind}
                      docs={docs.filter(
                        (d) => d.kind === kind && d.organizationId === selectedOrgId,
                      )}
                      workerId={workerId}
                      organizationId={selectedOrgId}
                      canEdit={canEdit}
                      orgOptions={allOrgOptions}
                      reassigningId={reassigning}
                      onReassign={reassign}
                      onDelete={removeDoc}
                      onUploaded={load}
                      onError={handleError}
                    />
                  ))}
                </div>
              </>
            )}
            <p className="mb-1 mt-4 text-xs font-bold text-muted">日付あり（正式）版</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {KINDS.map((kind) => (
                <ContractColumn
                  key={`${selectedOrgId}-${kind}`}
                  kind={kind}
                  footer={dateFooter(kind)}
                  docs={docs.filter(
                    (d) => d.kind === kind && d.organizationId === selectedOrgId,
                  )}
                  workerId={workerId}
                  organizationId={selectedOrgId}
                  canEdit={canEdit}
                  orgOptions={allOrgOptions}
                  reassigningId={reassigning}
                  onReassign={reassign}
                  onDelete={removeDoc}
                  onUploaded={load}
                  onError={handleError}
                />
              ))}
            </div>

            {/* 日付は各列の下（この会社の分）。入れるとその場で保存される */}
            {selectedOrgId && canEdit && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                各列の下の「雇用契約日」「雇用条件書の作成日」は、入れるとその場で保存されます（
                {selectedOrgName} の分）。求職一覧の応募のカードにも出ます。
                {dateStatus && <span className="ml-1 font-bold text-brand">{dateStatus}</span>}
              </p>
            )}

          </>
        )}

        {/* 会社の紐づけが無い古い書類（どの会社の分か分からないもの） */}
        {unassigned.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-background p-3">
            <p className="mb-1.5 text-[11px] font-bold text-muted">所属機関の記録が無い書類</p>
            <div className="flex flex-col gap-1">
              {unassigned.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-2">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[11px] text-muted underline-offset-2 hover:text-brand hover:underline"
                  >
                    {d.createdAt.slice(0, 10)} — {d.kind} {d.fileName || ""}
                  </a>
                  {canEdit && selectedOrgId && (
                    <button
                      type="button"
                      onClick={() => void reassign(d.id, selectedOrgId)}
                      disabled={reassigning === d.id}
                      className="shrink-0 rounded-lg border border-border px-2 py-0.5 text-[11px] font-bold text-brand disabled:opacity-50"
                    >
                      {reassigning === d.id ? "移動中…" : `「${selectedOrgName}」の分にする`}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted">
              上で会社を選んでから押すと、その会社の書類として保管し直します。
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
  orgOptions,
  reassigningId,
  onReassign,
  onDelete,
  onUploaded,
  onError,
  footer,
}: {
  kind: Kind;
  docs: WorkerDocView[];
  workerId: string;
  organizationId: string;
  canEdit: boolean;
  orgOptions: { id: string; name: string }[];
  reassigningId: string | null;
  onReassign: (docId: string, organizationId: string) => void | Promise<void>;
  onDelete: (doc: WorkerDocView) => void | Promise<void>;
  onUploaded: () => void;
  onError: (err: unknown) => void;
  footer?: React.ReactNode; // この書類の日付など、列の下に出すもの
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
              {/* ダウンロードすると付く名前をそのまま出す（氏名_書類名_会社名） */}
              <p className="max-w-full truncate text-xs font-bold">
                {latest.downloadName || latest.fileName || kind}
              </p>
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
          {/* 間違えて登録したときの削除（申請登録時の画像はここでは消せない） */}
          {canEdit && !latest.fromApplication && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDelete(latest)}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-seal disabled:opacity-50"
            >
              <Trash2 size={12} />
              削除
            </button>
          )}
        </div>
      )}
      {/* 会社を間違えて登録したときは、ここで別の会社に移せる */}
      {latest && canEdit && (
        <label className="mt-1.5 flex items-center gap-1.5">
          <span className="shrink-0 text-[11px] text-muted">この書類の会社</span>
          <select
            value={organizationId}
            onChange={(e) => void onReassign(latest.id, e.target.value)}
            disabled={reassigningId === latest.id}
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-1.5 py-1 text-[11px] disabled:opacity-50"
          >
            {orgOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {footer}
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
                {d.createdAt.slice(0, 10)} — {d.downloadName || d.fileName || kind}
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
