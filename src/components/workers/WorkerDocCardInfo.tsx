"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Stamp, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { rosterJpDate } from "@/lib/roster";
import { dbErrorMessage } from "@/lib/errors";
import {
  deleteVisaHistory,
  hideVisaHistory,
  insertVisaHistory,
  listVisaHistoryRows,
  updateVisaHistory,
  type VisaHistoryInput,
} from "@/lib/supabase/queries/visa-history";
import { VISA_GRANT_KINDS, type VisaHistoryRow } from "@/lib/visa-history";
import {
  visaRowsForDocTab,
  type ManualPeriod,
  type OrgPeriod,
} from "@/lib/worker-doc-periods";

// 在留カード・指定書の画像のすぐ下で、その在留カードの情報（許可日・在留資格・在留期限・在留カード番号）を
// 実物の画像を見ながら入れる欄。保存先は「在留資格の履歴」（worker_visa_history・0138）で、
// 職歴と在留タブの在留資格の履歴と、A4印刷（個人）の「在留資格の履歴」の表（古い順）にそのまま出る。
// 表示中のタブ（現在／過去の在籍期間／追加した期間）の範囲に許可日が入る分だけを出す

export interface WorkerCardInfo {
  cardNo: string;
  status: string;
  permitDate: string | null;
  expiryDate: string | null;
}

const INPUT =
  "min-h-[32px] rounded-lg border border-border bg-surface px-2 text-xs tabular-nums text-foreground focus:border-brand focus:outline-none";

export function WorkerDocCardInfo({
  workerId,
  card,
  tabKey,
  tabLabel,
  past,
  manual,
  selectedManual,
  canEdit,
}: {
  workerId: string;
  card: WorkerCardInfo; // 今の在留カード（履歴のいちばん新しい許可として出る）
  tabKey: string;
  tabLabel: string;
  past: OrgPeriod[];
  manual: ManualPeriod[];
  selectedManual: ManualPeriod | null; // 追加した期間のタブなら、その期間（追加フォームの初期値に使う）
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<VisaHistoryRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<VisaHistoryInput | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const load = () =>
    listVisaHistoryRows(createClient(), {
      id: workerId,
      residence_card_no: card.cardNo,
      residence_status: card.status,
      residence_permit_date: card.permitDate,
      residence_expiry_date: card.expiryDate,
    })
      .then((r) => {
        setRows(r);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId, card.cardNo, card.status, card.permitDate, card.expiryDate]);

  // タブを切り替えたら、開いていたフォームは閉じる
  useEffect(() => {
    void Promise.resolve().then(() => {
      setAdding(false);
      setEditingKey(null);
      setDraft(null);
    });
  }, [tabKey]);

  const shown = visaRowsForDocTab(rows, tabKey, past, manual);
  const rowKey = (r: VisaHistoryRow) => r.manualId ?? `auto:${r.permitDate}_${r.status}`;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      const migration =
        err instanceof Error && err.message.includes("hidden")
          ? "0153_worker_visa_history_hidden.sql"
          : "0138_worker_visa_history.sql";
      setError(dbErrorMessage(err, migration, "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const startAdd = () => {
    setEditingKey(null);
    setAdding(true);
    setDraft({
      // 追加した期間のタブなら、その期間の開始日・終了日を許可日・在留期限の初期値にする
      permit_date: selectedManual?.startOn ?? "",
      status: "",
      kind: "ビザ許可",
      expiry_date: selectedManual?.endOn ?? null,
      card_no: "",
      note: "",
    });
  };
  const startEdit = (r: VisaHistoryRow) => {
    setAdding(false);
    setEditingKey(rowKey(r));
    setDraft({
      permit_date: r.permitDate,
      status: r.status,
      kind: VISA_GRANT_KINDS.find((k) => r.label.endsWith(k)) ?? "ビザ許可",
      expiry_date: r.expiryDate || null,
      card_no: r.cardNo,
      note: r.note ?? "",
    });
  };
  const cancel = () => {
    setAdding(false);
    setEditingKey(null);
    setDraft(null);
  };
  const save = (r: VisaHistoryRow | null) =>
    run(async () => {
      if (!draft) return;
      if (!draft.permit_date) throw new Error("許可日を入れてください");
      if (!draft.status.trim()) throw new Error("在留資格を入れてください");
      const supabase = createClient();
      // 自動で出ている行（申請の許可欄など）を直すときは、手で入れた分として保存する（同じ許可日・在留資格で上書き表示）
      if (r?.manualId) await updateVisaHistory(supabase, r.manualId, draft);
      else await insertVisaHistory(supabase, workerId, draft);
      cancel();
    });
  const remove = (r: VisaHistoryRow) => {
    if (!window.confirm(`${rosterJpDate(r.permitDate)} ${r.label} を在留資格の履歴から外します。よろしいですか？`)) return;
    void run(async () => {
      const supabase = createClient();
      if (r.manualId) await deleteVisaHistory(supabase, r.manualId);
      else await hideVisaHistory(supabase, workerId, { permit_date: r.permitDate, status: r.status });
    });
  };

  const form = draft && (
    <div className="mt-2 rounded-xl border border-dashed border-brand/50 bg-brand/5 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          許可日
          <input
            type="date"
            value={draft.permit_date}
            onChange={(e) => setDraft({ ...draft, permit_date: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          在留資格
          <input
            value={draft.status}
            placeholder="特定技能1号 など"
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          許可の種類
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className={INPUT}>
            {VISA_GRANT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          在留期限
          <input
            type="date"
            value={draft.expiry_date ?? ""}
            onChange={(e) => setDraft({ ...draft, expiry_date: e.target.value || null })}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          在留カード番号
          <input
            value={draft.card_no}
            placeholder="例: AB12345678CD"
            onChange={(e) => setDraft({ ...draft, card_no: e.target.value.toUpperCase() })}
            className={`${INPUT} tracking-wide`}
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(editingKey ? (shown.find((r) => rowKey(r) === editingKey) ?? null) : null)}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
        >
          {busy ? "保存中…" : editingKey ? "保存する" : "追加する"}
        </button>
        <button type="button" onClick={cancel} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted">
          やめる
        </button>
      </div>
    </div>
  );

  return (
    <div className="mt-4 rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1 text-xs font-bold text-muted">
          <Stamp size={13} />
          この在留カードの情報（在留資格の履歴）
          <span className="font-normal">— {tabLabel}</span>
        </p>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={startAdd}
            className="flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold text-brand-foreground"
          >
            <Plus size={12} />
            在留カードの情報を追加
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        上の在留カードの画像を見ながら、許可日・在留資格・在留期限・在留カード番号を入れてください。保存すると「職歴と在留」の在留資格の履歴と、A4印刷（個人）の「在留資格の履歴」の表に古い順で出ます。
      </p>
      {error && (
        <p role="alert" className="mt-1 rounded-lg bg-seal/10 px-3 py-1.5 text-xs text-seal">
          {error}
        </p>
      )}
      {adding && form}
      {loaded && shown.length === 0 && !adding && (
        <p className="mt-2 text-[11px] text-muted">この期間の在留カードの情報はまだありません。</p>
      )}
      {shown.length > 0 && (
        <table className="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr className="text-left text-[10px] text-muted">
              <th className="px-1.5 py-1 font-bold">許可日</th>
              <th className="px-1.5 py-1 font-bold">在留資格</th>
              <th className="px-1.5 py-1 font-bold">在留期限</th>
              <th className="px-1.5 py-1 font-bold">在留カード番号</th>
              {canEdit && <th className="px-1.5 py-1" />}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const key = rowKey(r);
              return (
                <tr key={key} className="border-t border-border/60">
                  {editingKey === key ? (
                    <td colSpan={canEdit ? 5 : 4} className="px-0 py-1">
                      {form}
                    </td>
                  ) : (
                    <>
                      <td className="px-1.5 py-1 tabular-nums">{rosterJpDate(r.permitDate)}</td>
                      <td className="px-1.5 py-1">
                        {r.label}
                        {r.isCurrent && (
                          <span className="ml-1 rounded-full bg-status-approved-bg px-1.5 py-0.5 text-[10px] font-bold text-status-approved-fg">
                            現在
                          </span>
                        )}
                      </td>
                      <td className="px-1.5 py-1 tabular-nums">{r.expiryDate ? rosterJpDate(r.expiryDate) : "—"}</td>
                      <td className="px-1.5 py-1 tracking-wide">{r.cardNo || "—"}</td>
                      {canEdit && (
                        <td className="px-1.5 py-1 text-right">
                          <span className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => startEdit(r)} className="inline-flex items-center gap-0.5 font-bold text-brand">
                              <Pencil size={11} />
                              編集
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(r)}
                              disabled={busy}
                              aria-label="この在留カードの情報を履歴から外す"
                              title="在留資格の履歴から外す（自動で出ている分は元の申請の記録は残ります）"
                              className="text-seal disabled:opacity-50"
                            >
                              <Trash2 size={12} />
                            </button>
                          </span>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
