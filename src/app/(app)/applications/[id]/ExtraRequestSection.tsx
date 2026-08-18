"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, MailPlus, Phone, Plus, Trash2, Truck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileGroup } from "@/components/applications/FileGroup";
import { createClient } from "@/lib/supabase/client";
import {
  deleteExtraRequest,
  insertExtraRequest,
  listExtraRequests,
  updateExtraRequest,
} from "@/lib/supabase/queries/extra-requests";
import { letterPackTrackingUrl } from "@/lib/application-prep";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/application-alerts";
import {
  EXTRA_REQUEST_METHODS,
  EXTRA_REQUEST_STATUSES,
  type ApplicationExtraRequest,
  type ApplicationFile,
  type ExtraRequestMethod,
  type ExtraRequestStatus,
} from "@/types/application";

const MIGRATION = "0083_application_extra_requests.sql";

// 審査中に入管から来る「追加資料の提出依頼」の記録。
// 書類（追加資料提出通知書）でも電話でも、来た日・審査担当者・求められた資料を残し、
// 本人からの返事を書いて、レターパックで郵送したら完了になる。
export function ExtraRequestSection({
  applicationId,
  canEdit,
  noticeFiles,
  uploading,
  onUpload,
  onDeleteFile,
}: {
  applicationId: string;
  canEdit: boolean;
  noticeFiles: ApplicationFile[]; // 「追加資料通知」として登録した通知書の画像・PDF
  uploading: boolean;
  onUpload: (list: FileList | null) => void;
  onDeleteFile: (file: ApplicationFile) => void;
}) {
  const [rows, setRows] = useState<ApplicationExtraRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // 追加フォーム
  const [requestedOn, setRequestedOn] = useState(todayStr());
  const [method, setMethod] = useState<ExtraRequestMethod>("書類");
  const [officer, setOfficer] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [items, setItems] = useState("");

  const load = () =>
    listExtraRequests(createClient(), applicationId)
      .then(setRows)
      .catch((err: unknown) => setError(dbErrorMessage(err, MIGRATION, "")));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const row = await insertExtraRequest(createClient(), {
        application_id: applicationId,
        requested_on: requestedOn || todayStr(),
        method,
        officer: officer.trim(),
        due_on: dueOn || null,
        items: items.trim(),
        status: "本人へ依頼中",
        worker_reply: "",
        sent_on: null,
        tracking_no: "",
        note: "",
      });
      setRows((prev) => [row, ...prev]);
      setOfficer("");
      setDueOn("");
      setItems("");
      setOpen(false);
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, errorMessage(err, "保存に失敗しました")));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, p: Partial<ApplicationExtraRequest>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
    try {
      await updateExtraRequest(createClient(), id, p);
    } catch (err) {
      setError(errorMessage(err, "保存に失敗しました"));
    }
  };

  // レターパックで送ったら完了（送った日と追跡番号を残す）
  const markSent = async (r: ApplicationExtraRequest) => {
    await patch(r.id, { status: "郵送済み", sent_on: r.sent_on ?? todayStr() });
  };

  const remove = async (id: string) => {
    if (!window.confirm("この追加資料の記録を削除します。よろしいですか？")) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    try {
      await deleteExtraRequest(createClient(), id);
    } catch (err) {
      setError(errorMessage(err, "削除に失敗しました"));
    }
  };

  const INPUT =
    "min-h-[40px] w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none";
  const CELL =
    "w-full rounded-lg border border-border bg-background px-2 py-1 text-xs focus:border-brand focus:outline-none";

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
        <MailPlus size={15} />
        追加資料の提出依頼（審査中）
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        入管から追加資料を求められたときに記録します。書類（追加資料提出通知書）でも電話でも、
        来た日・審査担当者・求められた資料を残してください。
        本人からの返事を書き、レターパックで送って追跡番号を入れると完了になります。
      </p>

      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {error}
        </p>
      )}

      {canEdit && (
        <Button
          variant="secondary"
          icon={<Plus size={16} />}
          onClick={() => setOpen((v) => !v)}
          className="mb-3"
        >
          追加資料の依頼を記録
        </Button>
      )}

      {canEdit && open && (
        <div className="mb-3 rounded-xl border border-border p-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">依頼が来た日</span>
              <input
                type="date"
                value={requestedOn}
                onChange={(e) => setRequestedOn(e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">来かた</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as ExtraRequestMethod)}
                className={INPUT}
              >
                {EXTRA_REQUEST_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">審査担当者（入管）</span>
              <input
                value={officer}
                onChange={(e) => setOfficer(e.target.value)}
                placeholder="例: ◯◯ 様"
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">提出期限</span>
              <input
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] font-bold text-muted">求められた資料</span>
              <textarea
                rows={2}
                value={items}
                onChange={(e) => setItems(e.target.value)}
                placeholder="例: 履歴書、直近3か月の給与明細"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </label>
          </div>
          <Button fullWidth className="mt-3" disabled={busy} onClick={() => void add()}>
            {busy ? "保存中…" : "この内容で記録する"}
          </Button>
        </div>
      )}

      {/* 書類で来た場合の「追加資料提出通知書」そのもの */}
      <div className="mb-3">
        <FileGroup
          label="追加資料提出通知書（書類で来た場合）"
          files={noticeFiles}
          uploading={uploading}
          multiple
          onSelect={onUpload}
          onDelete={canEdit ? onDeleteFile : undefined}
        />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          追加資料の依頼はまだありません。
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const done = r.status === "郵送済み";
            return (
              <div
                key={r.id}
                className={`rounded-xl border p-3 ${done ? "border-status-approved-fg/40 bg-status-approved-bg/30" : "border-border bg-background"}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 font-bold">
                    {r.method === "電話" ? <Phone size={13} /> : <MailPlus size={13} />}
                    {r.method}で依頼
                  </span>
                  <span className="tabular-nums text-muted">{r.requested_on}</span>
                  {r.due_on && (
                    <span className="rounded-full bg-status-notice-bg px-2 py-0.5 font-bold text-status-notice-fg">
                      期限 {r.due_on}
                    </span>
                  )}
                  {done && (
                    <span className="flex items-center gap-1 rounded-full bg-status-approved-bg px-2 py-0.5 font-bold text-status-approved-fg">
                      <Check size={12} />
                      完了（郵送済み）
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void remove(r.id)}
                      aria-label="この記録を削除"
                      className="ml-auto text-seal"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">審査担当者</span>
                    {canEdit ? (
                      <input
                        defaultValue={r.officer}
                        onBlur={(e) => {
                          if (e.target.value !== r.officer)
                            void patch(r.id, { officer: e.target.value.trim() });
                        }}
                        className={CELL}
                      />
                    ) : (
                      <span className="text-xs">{r.officer || "—"}</span>
                    )}
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">今の対応状況</span>
                    {canEdit ? (
                      <select
                        value={r.status}
                        onChange={(e) =>
                          void patch(r.id, { status: e.target.value as ExtraRequestStatus })
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
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-[11px] text-muted">求められた資料</span>
                    {canEdit ? (
                      <textarea
                        rows={2}
                        defaultValue={r.items}
                        onBlur={(e) => {
                          if (e.target.value !== r.items)
                            void patch(r.id, { items: e.target.value });
                        }}
                        className={CELL}
                      />
                    ) : (
                      <span className="whitespace-pre-wrap text-xs">{r.items || "—"}</span>
                    )}
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-[11px] text-muted">本人からの返事・受け取った内容</span>
                    {canEdit ? (
                      <textarea
                        rows={2}
                        defaultValue={r.worker_reply}
                        onBlur={(e) => {
                          if (e.target.value !== r.worker_reply)
                            void patch(r.id, { worker_reply: e.target.value });
                        }}
                        placeholder="例: Messengerで写真が届いた（8/20）。原本は郵送で受け取り"
                        className={CELL}
                      />
                    ) : (
                      <span className="whitespace-pre-wrap text-xs">{r.worker_reply || "—"}</span>
                    )}
                  </label>
                </div>

                {/* 入管への郵送（レターパック）。送ったら完了 */}
                <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-border pt-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">郵送した日</span>
                    {canEdit ? (
                      <input
                        type="date"
                        value={r.sent_on ?? ""}
                        onChange={(e) => void patch(r.id, { sent_on: e.target.value || null })}
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
                          if (e.target.value !== r.tracking_no)
                            void patch(r.id, { tracking_no: e.target.value.trim() });
                        }}
                        placeholder="例: 1234 5678 9012"
                        className={`${CELL} w-48 tabular-nums`}
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
                      onClick={() => void markSent(r)}
                      className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-brand-foreground"
                    >
                      <Truck size={12} />
                      レターパックで送った（完了）
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
