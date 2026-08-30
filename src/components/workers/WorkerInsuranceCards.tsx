"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, FileText, HeartPulse, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { dbErrorMessage } from "@/lib/errors";
import { listWorkerInsuranceCards } from "@/lib/supabase/queries/insurance-cards";
import {
  attachInsuranceCardFile,
  createInsuranceCardTicket,
  deleteInsuranceCard,
  getInsuranceCardPreviewUrl,
  registerInsuranceCard,
  updateInsuranceCardKind,
} from "@/app/(app)/workers/insurance-card-actions";
import {
  INSURANCE_KINDS,
  historyOptionLabel,
  insuranceCardLabel,
  type InsuranceHistoryRef,
  type WorkerInsuranceCardRow,
} from "@/lib/insurance-card";

const INPUT =
  "min-h-[36px] w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

// 保険証（健康保険）の記録。現在の保険証（種類と画像）と、切り替わる前の履歴を残す。
// 画像を登録すると新しい保険証（＝現在）になり、前の分は履歴に残る。
// 社保のときは、どの職歴（会社）の社保かを紐付けられる。
export function WorkerInsuranceCards({
  workerId,
  canEdit = false,
  histories,
}: {
  workerId: string;
  canEdit?: boolean;
  histories: InsuranceHistoryRef[];
}) {
  const [cards, setCards] = useState<WorkerInsuranceCardRow[]>([]);
  const [busy, setBusy] = useState(false); // 画像アップロード中
  const [saving, setSaving] = useState(false); // 種類の保存中
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 種類の入力（現在の保険証の内容で初期化。保存で最新行を更新する）
  const [kind, setKind] = useState("");
  const [kindNote, setKindNote] = useState("");
  const [workHistoryId, setWorkHistoryId] = useState("");

  const syncForm = (rows: WorkerInsuranceCardRow[]) => {
    const latest = rows[0];
    setKind(latest?.kind ?? "");
    setKindNote(latest?.kind_note ?? "");
    setWorkHistoryId(latest?.work_history_id ?? "");
  };

  // 最新の保険証が画像なら、その場で見えるように署名付きURLを取っておく
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = (): Promise<void> =>
    listWorkerInsuranceCards(createClient(), workerId).then((rows) => {
      setCards(rows);
      syncForm(rows);
      const top = rows[0];
      if (top?.storage_path && top.mime_type.startsWith("image/")) {
        return getInsuranceCardPreviewUrl(top.id).then(
          (res) => setPreviewUrl(res.ok ? res.url : null),
          () => setPreviewUrl(null),
        );
      }
      setPreviewUrl(null);
    });

  useEffect(() => {
    // 0129未適用のときは空のまま（登録時に案内を出す）
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const latest = cards[0];
  const history = cards.slice(1);

  // 種類の入力が保存済みの内容から変わっているか（保存ボタンを出すかの判定）
  const dirty =
    kind !== (latest?.kind ?? "") ||
    (kind === "その他" && kindNote !== (latest?.kind_note ?? "")) ||
    (kind === "社保" && workHistoryId !== (latest?.work_history_id ?? ""));

  const handleError = (err: unknown) =>
    setError(dbErrorMessage(err, "0129_worker_insurance_cards.sql", "保存に失敗しました"));

  // 種類・内容・職歴の紐付けを保存する。
  // 記録がまだ無ければ、画像なしの「現在の保険証」として新規登録する
  async function saveKind() {
    setSaving(true);
    setError(null);
    try {
      const input = { kind, kindNote, workHistoryId: workHistoryId || null };
      const res = latest
        ? await updateInsuranceCardKind(latest.id, input)
        : await registerInsuranceCard(workerId, {
            ...input,
            path: "",
            fileName: "",
            mimeType: "",
          });
      if (!res.ok) throw new Error(res.message);
      await load();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  // 画像の登録。現在の保険証に画像がまだ無ければそこへ付け、
  // すでにあれば「新しい保険証」として登録する（前の分は履歴に残る）
  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, mimeType, fileName } = await compressImage(file);
      const ticket = await createInsuranceCardTicket(workerId, fileName, mimeType);
      if (!ticket.ok) throw new Error(ticket.message);
      const { error: upErr } = await createClient()
        .storage.from("app-files")
        .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
      if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
      const res =
        latest && !latest.storage_path
          ? await attachInsuranceCardFile(workerId, latest.id, ticket.path, fileName, mimeType)
          : await registerInsuranceCard(workerId, {
              kind,
              kindNote,
              workHistoryId: workHistoryId || null,
              path: ticket.path,
              fileName,
              mimeType,
            });
      if (!res.ok) throw new Error(res.message);
      await load();
    } catch (err) {
      setError(dbErrorMessage(err, "0129_worker_insurance_cards.sql", "登録に失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  async function preview(card: WorkerInsuranceCardRow) {
    const res = await getInsuranceCardPreviewUrl(card.id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  }

  async function removeCard(card: WorkerInsuranceCardRow) {
    const label = insuranceCardLabel(card, histories) || "保険証";
    if (
      !window.confirm(
        `${card.created_at.slice(0, 10)} 登録の「${label}」の記録を削除します。元に戻せません。よろしいですか？`,
      )
    ) {
      return;
    }
    setError(null);
    const res = await deleteInsuranceCard(card.id);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    await load().catch(() => undefined);
  }

  const currentLabel = insuranceCardLabel(latest ?? null, histories);
  const isImage = (c: WorkerInsuranceCardRow) => c.mime_type.startsWith("image/");
  const disabled = !canEdit || busy || saving;

  return (
    <section id="insurance-cards">
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
          <HeartPulse size={14} />
          保険証（健康保険）
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          現在の保険証の種類（国保・マイナ保険証・社保・その他）と画像を記録します。
          画像は枠にドラッグ＆ドロップするだけでも登録できます。
          保険証が切り替わったら新しい画像を登録すると最新になり、前の分は履歴に残ります。
          ここの内容は下の「あとでやる手続き」の国保・国民年金の欄にも目安として出ます。
        </p>
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 左: 現在の保険証の種類（社保のときは職歴に紐付け） */}
          <div>
            <p className="mb-1.5 text-xs font-bold text-muted">現在の保険証</p>
            {latest && (
              <p className="mb-2 rounded-lg bg-background px-3 py-2 text-sm font-bold">
                {currentLabel || <span className="font-normal text-muted">種類が未設定です</span>}
                <span className="ml-2 text-[10px] font-normal text-muted">
                  {latest.created_at.slice(0, 10)} 登録
                </span>
              </p>
            )}
            <div className="space-y-2.5">
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-muted">種類</span>
                <select
                  value={kind}
                  disabled={disabled}
                  onChange={(e) => setKind(e.target.value)}
                  className={INPUT}
                >
                  <option value="">未設定</option>
                  {INSURANCE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              {kind === "その他" && (
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">内容（自由入力）</span>
                  <input
                    value={kindNote}
                    disabled={disabled}
                    onChange={(e) => setKindNote(e.target.value)}
                    placeholder="例: 母国の保険 / 任意継続"
                    className={INPUT}
                  />
                </label>
              )}
              {kind === "社保" && (
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">
                    どの職歴（会社）の社保か
                  </span>
                  <select
                    value={workHistoryId}
                    disabled={disabled}
                    onChange={(e) => setWorkHistoryId(e.target.value)}
                    className={INPUT}
                  >
                    <option value="">未選択</option>
                    {histories.map((h) => (
                      <option key={h.id} value={h.id}>
                        {historyOptionLabel(h)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {canEdit && dirty && (
                <button
                  type="button"
                  onClick={() => void saveKind()}
                  disabled={saving || busy}
                  className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
                >
                  {saving ? "保存中…" : "種類を保存"}
                </button>
              )}
            </div>
          </div>

          {/* 右: 保険証の画像（最新のもの） */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted">保険証の画像</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-brand disabled:opacity-50"
                >
                  {busy ? "登録中…" : <><Upload size={12} /> 登録</>}
                </button>
              )}
            </div>
            <FileDropArea
              onFiles={(files) => void handleFile(files[0])}
              disabled={!canEdit || busy}
              className="overflow-hidden rounded-xl border border-border bg-background"
            >
              {latest?.storage_path ? (
                <button
                  type="button"
                  onClick={() => void preview(latest)}
                  className="block w-full"
                  title="押すと別タブで開きます"
                >
                  {isImage(latest) && previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={previewUrl}
                      alt="保険証"
                      className="max-h-56 w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-32 flex-col items-center justify-center gap-1 px-2 text-center">
                      <FileText size={24} className="text-muted" />
                      <p className="max-w-full truncate text-xs font-bold">
                        {latest.file_name || (isImage(latest) ? "保険証の画像" : "保険証のPDF")}
                      </p>
                      <p className="text-[10px] text-muted">
                        {latest.created_at.slice(0, 10)} 登録
                      </p>
                    </div>
                  )}
                </button>
              ) : (
                <div className="flex h-32 items-center justify-center px-2 text-center text-xs text-muted">
                  {canEdit
                    ? "未登録（画像・PDFをここにドロップでも登録できます）"
                    : "未登録"}
                </div>
              )}
            </FileDropArea>
            {latest && (
              <div className="mt-1.5 flex items-center gap-2">
                {latest.storage_path && (
                  <button
                    type="button"
                    onClick={() => void preview(latest)}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted"
                  >
                    <Eye size={12} />
                    開く
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeCard(latest)}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-seal disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                    削除
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 履歴（前の保険証。切り替わる前の分） */}
        {history.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1 text-[10px] text-muted">履歴（{history.length}件）</p>
            <ul className="flex flex-col gap-1">
              {history.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-[11px]">
                  <span className="shrink-0 tabular-nums text-muted">
                    {c.created_at.slice(0, 10)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {insuranceCardLabel(c, histories) || "種類未設定"}
                  </span>
                  {c.storage_path && (
                    <button
                      type="button"
                      onClick={() => void preview(c)}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-0.5 font-bold text-muted"
                    >
                      <Eye size={11} />
                      開く
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="削除"
                      onClick={() => void removeCard(c)}
                      className="shrink-0 rounded-lg border border-border px-2 py-0.5 text-seal"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </Card>
    </section>
  );
}
