"use client";

import { useEffect, useState } from "react";
import { Plus, Stamp, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { rosterJpDate } from "@/lib/roster";
import { dbErrorMessage } from "@/lib/errors";
import {
  deleteVisaHistory,
  insertVisaHistory,
  listVisaHistory,
  updateVisaHistory,
  type VisaHistoryInput,
} from "@/lib/supabase/queries/visa-history";
import {
  buildVisaHistory,
  VISA_GRANT_KINDS,
  type VisaHistoryApplication,
  type VisaHistoryCard,
  type VisaHistoryManual,
  type VisaHistoryRow,
} from "@/lib/visa-history";

const EMPTY: VisaHistoryInput = {
  permit_date: "",
  status: "",
  kind: "ビザ許可",
  expiry_date: null,
  card_no: "",
  note: "",
};

const INPUT =
  "min-h-[34px] rounded-lg border border-border bg-surface px-2 text-xs tabular-nums focus:border-brand focus:outline-none";

// 在留資格の履歴（いつ何のビザが許可されたか）。
// 「2023年10月5日 特定活動 ビザ許可」「2026年4月23日 特定技能1号 更新許可」のように古い順で並べる。
// 申請一覧の許可欄・在留カードの記録・今の在留カードから自動で作り、
// 昔の分など足りないものは、この画面で入れて直せる（手で入れた分が優先される）。
export function WorkerVisaHistory({
  workerId,
  cardNo,
  status,
  permitDate,
  expiryDate,
  canEdit = false,
}: {
  workerId: string;
  // 今の在留カード（いちばん新しい許可として履歴の最後に出す）。
  // 入れ替わりで作り直されないよう、まとめた形ではなく1項目ずつ受け取る
  cardNo: string;
  status: string;
  permitDate: string | null;
  expiryDate: string | null;
  canEdit?: boolean;
}) {
  const [apps, setApps] = useState<VisaHistoryApplication[]>([]);
  const [cards, setCards] = useState<VisaHistoryCard[]>([]);
  const [manual, setManual] = useState<VisaHistoryManual[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 追加フォーム（開いているときだけ出す）と、編集中の行
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<VisaHistoryInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<VisaHistoryInput>(EMPTY);

  const loadManual = () => {
    // 0138未適用でも、自動で出る分は表示できるようにする
    listVisaHistory(createClient(), workerId)
      .then(setManual)
      .catch(() => setManual([]));
  };

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void Promise.all([
      supabase
        .from("immigration_applications")
        .select(
          "content, approved, approval_date, granted_permit_date, granted_expiry_date, granted_card_no, visa_at_grant",
        )
        .eq("worker_id", workerId)
        .then(({ data }) => (data as VisaHistoryApplication[] | null) ?? []),
      // 在留カードの記録（0137）。未適用の環境でも他の元データだけで出せるようにする
      supabase
        .from("worker_card_history")
        .select(
          "residence_card_no, residence_status, residence_permit_date, residence_expiry_date",
        )
        .eq("worker_id", workerId)
        .then(({ data }) => (data as VisaHistoryCard[] | null) ?? []),
      listVisaHistory(supabase, workerId).catch(() => [] as VisaHistoryManual[]),
    ]).then(([a, c, m]) => {
      if (cancelled) return;
      setApps(a);
      setCards(c);
      setManual(m);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const rows: VisaHistoryRow[] = buildVisaHistory({
    apps,
    cards,
    manual,
    current: permitDate
      ? {
          residence_card_no: cardNo,
          residence_status: status,
          residence_permit_date: permitDate,
          residence_expiry_date: expiryDate,
          residence_period: "",
        }
      : null,
  });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      loadManual();
    } catch (err) {
      setError(dbErrorMessage(err, "0138_worker_visa_history.sql", "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      if (!draft.permit_date) throw new Error("許可日を入れてください");
      await insertVisaHistory(createClient(), workerId, draft);
      setDraft(EMPTY);
      setAdding(false);
    });

  // 自動で出ている行も、押せばその内容から直せる（同じ許可日・在留資格で上書きされる）
  const startEdit = (r: VisaHistoryRow) => {
    setEditingId(r.manualId ?? `auto:${r.permitDate}_${r.status}`);
    setEditDraft({
      permit_date: r.permitDate,
      status: r.status,
      kind:
        VISA_GRANT_KINDS.find((k) => r.label.endsWith(k)) ?? "ビザ許可",
      expiry_date: r.expiryDate || null,
      card_no: r.cardNo,
      note: r.note ?? "",
    });
  };

  const saveEdit = (r: VisaHistoryRow) =>
    run(async () => {
      const supabase = createClient();
      if (r.manualId) await updateVisaHistory(supabase, r.manualId, editDraft);
      else await insertVisaHistory(supabase, workerId, editDraft);
      setEditingId(null);
    });

  const fields = (value: VisaHistoryInput, onChange: (v: VisaHistoryInput) => void) => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
        許可日
        <input
          type="date"
          value={value.permit_date}
          onChange={(e) => onChange({ ...value, permit_date: e.target.value })}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
        在留資格
        <input
          value={value.status}
          placeholder="特定技能1号 / 特定活動 など"
          onChange={(e) => onChange({ ...value, status: e.target.value })}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
        許可の種類
        <select
          value={value.kind}
          onChange={(e) => onChange({ ...value, kind: e.target.value })}
          className={INPUT}
        >
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
          value={value.expiry_date ?? ""}
          onChange={(e) => onChange({ ...value, expiry_date: e.target.value || null })}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
        在留カード番号
        <input
          value={value.card_no}
          onChange={(e) => onChange({ ...value, card_no: e.target.value })}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
        メモ
        <input
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          className={INPUT}
        />
      </label>
    </div>
  );

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex flex-wrap items-center gap-1.5 text-sm font-bold text-muted">
        <Stamp size={15} />
        在留資格の履歴
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setDraft(EMPTY);
              setError(null);
            }}
            className="flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold text-brand-foreground"
          >
            <Plus size={12} />
            過去の許可を追加
          </button>
        )}
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        いつ何のビザが許可されたかを古い順に並べています。申請一覧の許可欄・在留カードの記録・今の在留カードから自動で作られ、
        足りない昔の分はここで足せます。行の「直す」で内容を書き換えられます（手で入れた内容が優先されます）。
      </p>

      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {error}
        </p>
      )}

      {adding && (
        <div className="mb-3 rounded-xl border border-dashed border-border bg-background p-3">
          <p className="mb-2 text-[11px] font-bold text-muted">過去の許可を追加</p>
          {fields(draft, setDraft)}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void add()}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
            >
              {busy ? "保存中…" : "追加する"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted"
            >
              やめる
            </button>
          </div>
        </div>
      )}

      {!loaded ? null : rows.length === 0 ? (
        <p className="rounded-xl bg-background p-3 text-center text-xs text-muted">
          許可の記録がまだありません。「過去の許可を追加」から入れるか、申請一覧の申請に許可日を入れると、ここに並びます。
        </p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r) => {
            const key = r.manualId ?? `auto:${r.permitDate}_${r.status}`;
            return (
              <li key={key} className="rounded-lg bg-background px-3 py-2 text-xs">
                {editingId === key ? (
                  <>
                    {fields(editDraft, setEditDraft)}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveEdit(r)}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
                      >
                        {busy ? "保存中…" : "保存する"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted"
                      >
                        やめる
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <span className="font-bold tabular-nums">{rosterJpDate(r.permitDate)}</span>
                    <span className="font-bold">{r.label}</span>
                    {r.expiryDate && (
                      <span className="text-muted">在留期限 {rosterJpDate(r.expiryDate)}</span>
                    )}
                    {r.cardNo && <span className="text-muted">在留カード {r.cardNo}</span>}
                    {r.note && <span className="text-muted">{r.note}</span>}
                    {r.isCurrent && (
                      <span className="rounded-full bg-status-approved-bg px-1.5 py-0.5 text-[10px] font-bold text-status-approved-fg">
                        現在
                      </span>
                    )}
                    {canEdit && (
                      <span className="ml-auto flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="font-bold text-brand"
                        >
                          直す
                        </button>
                        {/* 手で入れた分だけ消せる（自動で出ている分は元のデータを直す） */}
                        {r.manualId && (
                          <button
                            type="button"
                            aria-label="この履歴を削除"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `${rosterJpDate(r.permitDate)}の「${r.label}」を削除します。よろしいですか？`,
                                )
                              ) {
                                void run(() => deleteVisaHistory(createClient(), r.manualId!));
                              }
                            }}
                            className="text-seal"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
