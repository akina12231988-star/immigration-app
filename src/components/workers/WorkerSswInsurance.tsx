"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileImage, FileText, Loader2, ShieldCheck, Trash2, TriangleAlert, Upload } from "lucide-react";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { dbErrorMessage } from "@/lib/errors";
import {
  ensureSswTodo,
  listSswCerts,
  SSW_CERT_KIND_CERT,
  SSW_CERT_KIND_REFUND,
  sswCertKind,
  updateSswInsurance,
  type SswCertRow,
} from "@/lib/supabase/queries/ssw-insurance";
import { listTodoStatusOptions, updateTodo, type TodoRow } from "@/lib/supabase/queries/todos";
import { listSalesEntriesByWorker, setSalesEntryFreeeNo } from "@/lib/supabase/queries/sales";
import {
  formatYenInput,
  formatYenLabel,
  isSswJoined,
  parseYenDigits,
  SSW_CANCEL_TODO_TITLE,
  SSW_INSURANCE_TODO_KIND,
  SSW_JOIN_TODO_TITLE,
  sswTodosByWorker,
  type SswTodoRef,
} from "@/lib/ssw-insurance";
import type { TodoStatusOption } from "@/lib/todo";
import { isSswInsuranceRenewalTarget, remainingLabel } from "@/lib/worker-alerts";
import { formatSalesYen } from "@/lib/sales";
import {
  createSswCertTicket,
  deleteSswCert,
  getSswCertPreviewUrl,
  registerSswCert,
} from "@/app/(app)/todos/ssw-insurance/actions";
import type { SalesEntryRow, Worker } from "@/types/db";

// 外国人詳細の「特定技能総合保険」の枠。
// 被保険者番号・被保険者証の画像・有効期限・加入手続きのTODO・保険No.（売上）・
// 解約手続き（TODO・郵送日・追跡番号）・解約金（金額・画像・返戻金の売上No.）をここにまとめる。
const MIG_BASE = "0139_ssw_insurance.sql";
const MIG_CANCEL = "0147_ssw_insurance_cancel.sql";
const INPUT =
  "min-h-[36px] w-full rounded-lg border border-border bg-surface px-2.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

type Fields = {
  no: string;
  expiry: string;
  mailedOn: string;
  trackingNo: string;
  refundAmount: number | null;
  refundSalesNo: string;
};

export function WorkerSswInsurance({
  worker,
  canEdit,
  today,
  insuranceBurden,
  onSaved,
}: {
  worker: Worker;
  canEdit: boolean;
  today: string;
  insuranceBurden: string; // 現在の所属機関の負担区分
  onSaved?: () => void; // 保存後に外国人詳細を読み直す
}) {
  const [f, setF] = useState<Fields>({
    no: worker.ssw_insurance_no ?? "",
    expiry: worker.ssw_insurance_expiry_date ?? "",
    mailedOn: worker.ssw_insurance_cancel_mailed_on ?? "",
    trackingNo: worker.ssw_insurance_cancel_tracking_no ?? "",
    refundAmount: worker.ssw_insurance_refund_amount ?? null,
    refundSalesNo: worker.ssw_insurance_refund_sales_no ?? "",
  });
  const [refundText, setRefundText] = useState(formatYenInput(worker.ssw_insurance_refund_amount ?? null));
  const [certs, setCerts] = useState<SswCertRow[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [options, setOptions] = useState<TodoStatusOption[]>([]);
  const [sales, setSales] = useState<SalesEntryRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const certInput = useRef<HTMLInputElement>(null);

  const loadCerts = useCallback(async () => {
    try {
      setCerts(await listSswCerts(createClient(), worker.id));
    } catch {
      /* 0139 未適用なら何も出さない */
    }
  }, [worker.id]);
  const loadTodos = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("todos")
      .select("*")
      .eq("worker_id", worker.id)
      .eq("kind", SSW_INSURANCE_TODO_KIND)
      .order("created_at", { ascending: false });
    setTodos(((data as TodoRow[] | null) ?? []).filter((t) => !t.deleted_at));
  }, [worker.id]);

  useEffect(() => {
    let cancelled = false;
    // 読み込みは非同期の続きで state に入れる（描画の途中で setState しない）
    void Promise.resolve().then(() => loadCerts());
    void Promise.resolve().then(() => loadTodos());
    listTodoStatusOptions(createClient())
      .then((o) => {
        if (!cancelled) setOptions(o.filter((x) => x.kind === SSW_INSURANCE_TODO_KIND));
      })
      .catch(() => undefined);
    listSalesEntriesByWorker(createClient(), worker.id)
      .then((rows) => {
        if (!cancelled) setSales(rows.filter((r) => r.kind === "保険"));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [worker.id, loadCerts, loadTodos]);

  // 画像は小さく並べて、タップで開けるようにする（表示用の署名付きURLを取る）
  useEffect(() => {
    let cancelled = false;
    const need = certs.filter((c) => c.mime_type.startsWith("image/") && !thumbs[c.id]);
    if (need.length === 0) return;
    void Promise.all(need.map(async (c) => [c.id, await getSswCertPreviewUrl(c.id)] as const)).then((results) => {
      if (cancelled) return;
      setThumbs((prev) => {
        const next = { ...prev };
        for (const [id, res] of results) if (res.ok) next[id] = res.url;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [certs, thumbs]);

  const pair = useMemo(() => sswTodosByWorker(todos, options).get(worker.id) ?? {}, [todos, options, worker.id]);
  const joined = isSswJoined({ ssw_insurance_expiry_date: f.expiry || null });
  const retired = worker.status === "退職";
  // 退職しているのに加入したまま（解約手続きが終わっていない）→ 解約手続きのTODOを案内する
  const needsCancel = retired && joined && !(pair.cancel && pair.cancel.done);
  const certFiles = certs.filter((c) => sswCertKind(c) === SSW_CERT_KIND_CERT);
  const refundFiles = certs.filter((c) => sswCertKind(c) === SSW_CERT_KIND_REFUND);

  const save = async (patch: Parameters<typeof updateSswInsurance>[2], migration = MIG_BASE) => {
    setError(null);
    try {
      await updateSswInsurance(createClient(), worker.id, patch);
      onSaved?.();
    } catch (err) {
      setError(dbErrorMessage(err, migration, "保存に失敗しました"));
    }
  };

  // 画像・PDFを添付（被保険者証 / 解約金）
  const upload = async (file: File, kind: string) => {
    setBusy(kind);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const ticket = await createSswCertTicket(worker.id, compressed.fileName, compressed.mimeType);
      if (!ticket.ok) throw new Error(ticket.message);
      const { error: upErr } = await createClient()
        .storage.from("app-files")
        .uploadToSignedUrl(ticket.path, ticket.token, compressed.blob, { contentType: compressed.mimeType });
      if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
      const res = await registerSswCert({
        workerId: worker.id,
        certNo: kind === SSW_CERT_KIND_CERT ? f.no.trim() : "",
        expiryDate: kind === SSW_CERT_KIND_CERT ? f.expiry : "",
        path: ticket.path,
        fileName: compressed.fileName,
        mimeType: compressed.mimeType,
        kind,
      });
      if (!res.ok) throw new Error(res.message);
      await loadCerts();
    } catch (err) {
      setError(dbErrorMessage(err, kind === SSW_CERT_KIND_REFUND ? MIG_CANCEL : MIG_BASE, "添付に失敗しました"));
    } finally {
      setBusy(null);
    }
  };

  const open = async (id: string) => {
    const res = await getSswCertPreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  };
  const remove = async (c: SswCertRow) => {
    if (!window.confirm(`この${sswCertKind(c)}の画像を削除します。よろしいですか？`)) return;
    const res = await deleteSswCert(c.id);
    if (res.ok) await loadCerts();
    else setError(res.message);
  };

  const createTodo = async (title: typeof SSW_JOIN_TODO_TITLE | typeof SSW_CANCEL_TODO_TITLE) => {
    setBusy(title);
    setError(null);
    try {
      await ensureSswTodo(createClient(), worker.id, title);
      await loadTodos();
    } catch (err) {
      setError(dbErrorMessage(err, MIG_BASE, "TODOを作れませんでした"));
    } finally {
      setBusy(null);
    }
  };
  const setTodoStatus = async (ref: SswTodoRef, status: string) => {
    setError(null);
    try {
      await updateTodo(createClient(), ref.id, { status });
      await loadTodos();
    } catch (err) {
      setError(dbErrorMessage(err, MIG_BASE, "経過の保存に失敗しました"));
    }
  };
  const saveSalesNo = async (id: string, value: string) => {
    setSales((prev) => prev.map((r) => (r.id === id ? { ...r, freee_no: value } : r)));
    try {
      await setSalesEntryFreeeNo(createClient(), id, value);
    } catch (err) {
      setError(dbErrorMessage(err, "0142_sales_entry_insurance_joined.sql", "売上No.の保存に失敗しました"));
    }
  };

  // 解約金は数字だけ受け取り、確定時に 3桁ごとのカンマにそろえて保存する
  const commitRefund = () => {
    const n = parseYenDigits(refundText);
    setRefundText(formatYenInput(n));
    if (n !== f.refundAmount) {
      setF((p) => ({ ...p, refundAmount: n }));
      void save({ ssw_insurance_refund_amount: n }, MIG_CANCEL);
    }
  };

  return (
    <div className="mb-3 space-y-3 rounded-xl border border-border bg-background p-3">
      <p className="flex flex-wrap items-center justify-between gap-1 text-sm font-bold">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={16} className="text-brand" />
          特定技能総合保険
          {joined ? (
            <span className="rounded-full bg-status-approved-bg px-2 py-0.5 text-[11px] text-status-approved-fg">加入中</span>
          ) : (
            <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted">未加入</span>
          )}
          {insuranceBurden && <span className="text-[11px] font-normal text-muted">（{insuranceBurden}）</span>}
        </span>
        <Link href="/todos/ssw-insurance" className="text-[11px] font-bold text-brand hover:underline">
          TODO ＞ 特定技能総合保険を開く →
        </Link>
      </p>
      {error && <p className="rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}

      {/* 退職したのに加入したまま → 解約手続きの案内 */}
      {needsCancel && (
        <div className="rounded-xl border border-seal/40 bg-seal/5 px-3 py-2.5 text-xs">
          <p className="flex items-center gap-1.5 font-bold text-seal">
            <TriangleAlert size={14} />
            退職していますが、特定技能総合保険に加入したままです。解約手続きをしてください
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            {pair.cancel
              ? `解約手続きのTODO（${pair.cancel.todo_no}）が「${pair.cancel.status}」のままです。下の「解約手続き」で進めてください。`
              : "解約手続きのTODOがまだありません。作って手続きを進めてください。"}
          </p>
          {canEdit && !pair.cancel && (
            <button
              type="button"
              disabled={busy === SSW_CANCEL_TODO_TITLE}
              onClick={() => void createTodo(SSW_CANCEL_TODO_TITLE)}
              className="mt-1.5 rounded-lg bg-seal px-3 py-1.5 text-xs font-bold text-seal-foreground disabled:opacity-50"
            >
              解約手続きのTODOを作る
            </button>
          )}
        </div>
      )}

      {/* ① 番号・有効期限 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">被保険者番号</span>
          <input
            value={f.no}
            disabled={!canEdit}
            onChange={(e) => setF((p) => ({ ...p, no: e.target.value }))}
            onBlur={() => {
              if ((worker.ssw_insurance_no ?? "") !== f.no.trim()) void save({ ssw_insurance_no: f.no.trim() });
            }}
            placeholder="被保険者証明書の番号"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">有効期限</span>
          <span className="flex items-center gap-2">
            <input
              type="date"
              value={f.expiry}
              disabled={!canEdit}
              onChange={(e) => {
                const v = e.target.value;
                setF((p) => ({ ...p, expiry: v }));
                void save({ ssw_insurance_expiry_date: v || null, ...(v ? { ssw_insurance_declined: false, ssw_insurance_declined_on: null } : {}) });
              }}
              className={INPUT}
            />
            {f.expiry && isSswInsuranceRenewalTarget({ ...worker, ssw_insurance_expiry_date: f.expiry }, today) && (
              <span className="shrink-0 rounded-full bg-seal/10 px-2 py-0.5 text-[11px] font-bold text-seal">
                {remainingLabel(f.expiry, today)}
              </span>
            )}
          </span>
        </label>
      </div>

      {/* ② 被保険者証の画像 */}
      <FileSection
        title="被保険者証の画像"
        hint="被保険者証（画像・PDF）をここにドラッグ＆ドロップ。画像をタップすると開きます。"
        files={certFiles}
        thumbs={thumbs}
        busy={busy === SSW_CERT_KIND_CERT}
        canEdit={canEdit}
        inputRef={certInput}
        onFile={(file) => void upload(file, SSW_CERT_KIND_CERT)}
        onOpen={open}
        onRemove={remove}
      />

      {/* ③ 加入手続きのTODO */}
      <TodoLine
        label="加入手続きのTODO"
        todo={pair.join}
        options={options}
        canEdit={canEdit}
        busy={busy === SSW_JOIN_TODO_TITLE}
        onCreate={() => void createTodo(SSW_JOIN_TODO_TITLE)}
        onStatus={setTodoStatus}
        emptyText={joined ? "加入手続きのTODOはありません（加入済み）" : "加入手続きのTODOはまだありません"}
      />

      {/* ④ 保険No.（売上） */}
      <div>
        <p className="mb-1 text-[11px] font-bold text-muted">保険No.（特定技能総合保険の売上・freee販売の伝票番号）</p>
        {sales.length === 0 ? (
          <p className="rounded-lg bg-surface p-2 text-[11px] text-muted">
            特定技能総合保険の売上明細はありません（会社負担の新規申請のときに作られます）。
          </p>
        ) : (
          <ul className="space-y-1">
            {sales.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface p-2">
                <span className="min-w-0 flex-1 text-xs">
                  <span className="block truncate font-bold">{r.item_name || "（品目未設定）"}</span>
                  <span className="block text-[11px] text-muted">
                    {formatSalesYen(r.amount)} ・ {r.status}
                    {r.registered_on && ` ・ ${r.registered_on}登録`}
                  </span>
                </span>
                {canEdit ? (
                  <input
                    key={`${r.id}-${r.freee_no}`}
                    defaultValue={r.freee_no}
                    onBlur={(e) => {
                      if (e.target.value !== r.freee_no) void saveSalesNo(r.id, e.target.value.trim());
                    }}
                    placeholder="保険No."
                    className={`${INPUT} w-40 sm:w-48`}
                  />
                ) : (
                  <span className="text-xs font-bold tabular-nums">{r.freee_no || "未入力"}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ⑤ 解約手続き（TODO・郵送日・追跡番号） */}
      <div className="space-y-1.5 rounded-lg border border-dashed border-border p-2">
        <TodoLine
          label="解約手続きのTODO"
          todo={pair.cancel}
          options={options}
          canEdit={canEdit}
          busy={busy === SSW_CANCEL_TODO_TITLE}
          onCreate={() => void createTodo(SSW_CANCEL_TODO_TITLE)}
          onStatus={setTodoStatus}
          emptyText={retired ? "解約手続きのTODOはまだありません" : "退職したら解約手続きのTODOを作ります（在籍中は不要）"}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">解約手続きを郵送した日</span>
            <input
              type="date"
              value={f.mailedOn}
              disabled={!canEdit}
              onChange={(e) => {
                const v = e.target.value;
                setF((p) => ({ ...p, mailedOn: v }));
                void save({ ssw_insurance_cancel_mailed_on: v || null }, MIG_CANCEL);
              }}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">追跡番号（レターパックなど）</span>
            <input
              value={f.trackingNo}
              disabled={!canEdit}
              onChange={(e) => setF((p) => ({ ...p, trackingNo: e.target.value }))}
              onBlur={() => {
                if ((worker.ssw_insurance_cancel_tracking_no ?? "") !== f.trackingNo.trim())
                  void save({ ssw_insurance_cancel_tracking_no: f.trackingNo.trim() }, MIG_CANCEL);
              }}
              placeholder="例: 1234-5678-9012"
              className={INPUT}
            />
          </label>
        </div>
        {(f.mailedOn || f.trackingNo) && (
          <p className="text-[11px] text-muted">
            解約手続き{pair.cancel ? `（TODO ${pair.cancel.todo_no}）` : ""}: {f.mailedOn ? `${f.mailedOn} に郵送` : "郵送日未入力"}
            {f.trackingNo && `（追跡番号 ${f.trackingNo}）`}
          </p>
        )}
      </div>

      {/* ⑥ 解約金（金額・画像・返戻金の売上No.） */}
      <div className="space-y-2 rounded-lg border border-dashed border-border p-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">解約金（返戻金）</span>
            <span className="flex items-center gap-1">
              <input
                inputMode="numeric"
                value={refundText}
                disabled={!canEdit}
                onChange={(e) => setRefundText(e.target.value.normalize("NFKC").replace(/[^\d,]/g, ""))}
                onBlur={commitRefund}
                placeholder="数字だけ（例: 12340）"
                className={`${INPUT} text-right tabular-nums`}
              />
              <span className="shrink-0 text-sm">円</span>
            </span>
            {f.refundAmount != null && <span className="text-[11px] text-muted">{formatYenLabel(f.refundAmount)}</span>}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">返戻金の売上No.（freee販売）</span>
            <input
              value={f.refundSalesNo}
              disabled={!canEdit}
              onChange={(e) => setF((p) => ({ ...p, refundSalesNo: e.target.value }))}
              onBlur={() => {
                if ((worker.ssw_insurance_refund_sales_no ?? "") !== f.refundSalesNo.trim())
                  void save({ ssw_insurance_refund_sales_no: f.refundSalesNo.trim() }, MIG_CANCEL);
              }}
              placeholder="返戻金の売上No."
              className={INPUT}
            />
          </label>
        </div>
        <FileSection
          title="解約金の画像（通知書・振込の控えなど）"
          hint="解約金の書類（画像・PDF）をここにドラッグ＆ドロップ。画像をタップすると開きます。"
          files={refundFiles}
          thumbs={thumbs}
          busy={busy === SSW_CERT_KIND_REFUND}
          canEdit={canEdit}
          onFile={(file) => void upload(file, SSW_CERT_KIND_REFUND)}
          onOpen={open}
          onRemove={remove}
        />
      </div>
    </div>
  );
}

// 画像・PDFの添付欄（ドラッグ＆ドロップ・一覧・タップで開く）
function FileSection({
  title,
  hint,
  files,
  thumbs,
  busy,
  canEdit,
  inputRef,
  onFile,
  onOpen,
  onRemove,
}: {
  title: string;
  hint: string;
  files: SswCertRow[];
  thumbs: Record<string, string>;
  busy: boolean;
  canEdit: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
  onOpen: (id: string) => void;
  onRemove: (c: SswCertRow) => void;
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  return (
    <div>
      <p className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted">
        {title}
        {files.length > 0 ? (
          <span className="rounded-full bg-status-approved-bg px-2 py-0.5 text-[10px] text-status-approved-fg">添付あり（{files.length}件）</span>
        ) : (
          <span className="rounded-full bg-seal/10 px-2 py-0.5 text-[10px] text-seal">未添付</span>
        )}
      </p>
      <FileDropArea
        onFiles={(list) => {
          if (canEdit && list.length > 0) onFile(list[0]);
        }}
        disabled={!canEdit || busy}
        className={`rounded-lg border border-dashed p-2 ${files.length > 0 ? "border-status-approved-fg/40 bg-status-approved-bg/30" : "border-border bg-surface"}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {files.map((c) =>
            thumbs[c.id] ? (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpen(c.id)}
                title={c.file_name}
                className="relative overflow-hidden rounded-lg border border-border bg-surface"
              >
                {/* 署名付きURLの画像のため next/image は使わない */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbs[c.id]} alt={c.file_name} className="h-20 w-28 object-cover" />
              </button>
            ) : (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpen(c.id)}
                title={c.file_name}
                className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface text-[10px] text-muted"
              >
                {c.mime_type === "application/pdf" ? <FileText size={20} /> : <FileImage size={20} />}
                <span className="max-w-[6.5rem] truncate px-1">{c.file_name || "ファイル"}</span>
              </button>
            ),
          )}
          {canEdit && (
            <>
              <input
                ref={ref}
                type="file"
                accept="image/*,application/pdf"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFile(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => ref.current?.click()}
                className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-brand/50 text-[11px] font-bold text-brand disabled:opacity-50"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                {busy ? "添付中…" : "ファイルを選ぶ"}
              </button>
            </>
          )}
        </div>
        {files.length > 0 && canEdit && (
          <ul className="mt-1.5 space-y-0.5">
            {files.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-[11px] text-muted">
                <span className="min-w-0 flex-1 truncate">
                  {c.file_name || "ファイル"}（{c.created_at.slice(0, 10)}）
                </span>
                <button type="button" onClick={() => onRemove(c)} aria-label="削除" className="text-muted hover:text-seal">
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[10px] text-muted">{hint}</p>
      </FileDropArea>
    </div>
  );
}

// TODOの1行（番号・経過。経過はその場で変えられる）
function TodoLine({
  label,
  todo,
  options,
  canEdit,
  busy,
  onCreate,
  onStatus,
  emptyText,
}: {
  label: string;
  todo?: SswTodoRef;
  options: TodoStatusOption[];
  canEdit: boolean;
  busy: boolean;
  onCreate: () => void;
  onStatus: (ref: SswTodoRef, status: string) => void;
  emptyText: string;
}) {
  const stageCls =
    todo?.stage === "完了"
      ? "bg-status-approved-bg text-status-approved-fg"
      : todo?.stage === "進行中"
        ? "bg-status-applied-bg text-status-applied-fg"
        : "bg-background text-muted";
  const names = options.map((o) => o.name);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-[11px] font-bold text-muted">{label}</span>
      {todo ? (
        <>
          <Link href="/todos/ssw-insurance" className="font-bold text-brand hover:underline">
            {todo.todo_no}
          </Link>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${stageCls}`}>{todo.status || "未着手"}</span>
          {canEdit && (
            <select
              value={todo.status}
              onChange={(e) => onStatus(todo, e.target.value)}
              className="min-h-[30px] rounded-lg border border-border bg-surface px-2 text-[11px]"
            >
              {!names.includes(todo.status) && <option value={todo.status}>{todo.status}</option>}
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </>
      ) : (
        <>
          <span className="text-muted">{emptyText}</span>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={onCreate}
              className="rounded-lg border border-brand px-2.5 py-1 text-[11px] font-bold text-brand disabled:opacity-50"
            >
              TODOを作る
            </button>
          )}
        </>
      )}
    </div>
  );
}
