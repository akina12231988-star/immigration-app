"use client";

import { useEffect, useState } from "react";
import { Coins, History, Loader2, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  setWorkerPastRecurringSales,
  setWorkerRecurringSalesNo,
} from "@/lib/supabase/queries/workers";
import { listSalesEntriesByWorker } from "@/lib/supabase/queries/sales";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { formatSalesYen } from "@/lib/sales";
import { normalizePastRecurringSales } from "@/lib/recurring-sales";
import { parseAmount } from "@/lib/organization-intake";
import type { Organization, SalesEntryRow, WorkerPastRecurringSale } from "@/types/db";

// 外国人詳細の「定期売上」。毎月の支援代をどの番号で継続請求しているかを表示し、
// 番号が未登録ならこの画面から登録できる（申請詳細の売上登録からも登録できる）。
// 定期売上No.は所属機関ごとに発行するため、転職したら旧番号を旧機関と紐付けて
// 「過去の番号」に残し、現在の番号を新しい機関の番号に書き換える。
export function WorkerRecurringSales({
  workerId,
  organizationId,
  organizations,
  support,
  initialSalesNo,
  initialPast,
  canEdit,
}: {
  workerId: string;
  organizationId: string | null;
  organizations: Organization[];
  support: string; // 支援の区分（支援対象外は支援代の請求がないため定期売上No.なし）
  initialSalesNo: string;
  initialPast: unknown; // workers.past_recurring_sales（jsonb）
  canEdit: boolean;
}) {
  const [salesNo, setSalesNo] = useState(initialSalesNo);
  const [draft, setDraft] = useState(initialSalesNo);
  const [past, setPast] = useState<WorkerPastRecurringSale[]>(() =>
    normalizePastRecurringSales(initialPast),
  );
  const [pastSaved, setPastSaved] = useState(true);
  const [entries, setEntries] = useState<SalesEntryRow[]>([]);
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const currentOrgName = organizations.find((o) => o.id === organizationId)?.name ?? "";

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      const supabase = createClient();
      const rows = await listSalesEntriesByWorker(supabase, workerId).catch(() => []);
      if (!cancelled) setEntries(rows.filter((r) => r.kind === "定期売上"));
      if (organizationId) {
        const org = await getOrganization(supabase, organizationId).catch(() => null);
        if (!cancelled && org) setMonthlyFee(parseAmount(org.intake?.support_fee ?? "") ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workerId, organizationId]);

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await setWorkerRecurringSalesNo(createClient(), workerId, draft.trim());
      setSalesNo(draft.trim());
      setNotice({ ok: true, message: "定期売上No.を保存しました" });
    } catch (err) {
      setNotice({
        ok: false,
        message: dbErrorMessage(
          err,
          "0064_worker_recurring_sales_no.sql",
          errorMessage(err, "保存に失敗しました"),
        ),
      });
    } finally {
      setBusy(false);
    }
  };

  const savePast = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await setWorkerPastRecurringSales(createClient(), workerId, past);
      setPastSaved(true);
      setNotice({ ok: true, message: "過去の定期売上No.を保存しました" });
    } catch (err) {
      setNotice({
        ok: false,
        message: dbErrorMessage(
          err,
          "0065_worker_past_recurring_sales.sql",
          errorMessage(err, "保存に失敗しました"),
        ),
      });
    } finally {
      setBusy(false);
    }
  };

  const setPastAt = (i: number, key: keyof WorkerPastRecurringSale, value: string) => {
    setPast((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
    setPastSaved(false);
  };

  const latest = entries[0];

  const INPUT =
    "min-h-[40px] w-full rounded-lg border border-border bg-surface px-2.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Coins size={16} />
        定期売上（毎月の支援代）
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        毎月の支援代をfreee販売の定期売上で継続請求するときの伝票番号です。月末の請求書作成でも使います。
        番号は所属機関ごとに発行するため、転職したら下の「過去の定期売上No.」に旧機関の番号を残し、この欄を新しい番号に書き換えてください。
      </p>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-background p-3">
          <dt className="text-xs text-muted">支援代（月額）</dt>
          <dd className="text-lg font-bold">
            {monthlyFee ? formatSalesYen(monthlyFee) : <span className="text-sm text-seal">未登録</span>}
          </dd>
          <dd className="text-[11px] text-muted">所属機関の情報から</dd>
        </div>
        <div className="rounded-xl bg-background p-3">
          <dt className="text-xs text-muted">定期売上の明細</dt>
          <dd className="text-lg font-bold">
            {latest ? formatSalesYen(latest.amount) : <span className="text-sm text-muted">未作成</span>}
          </dd>
          <dd className="text-[11px] text-muted">
            {latest
              ? `${latest.status}${latest.period_from ? ` ・ ${latest.period_from}から` : ""}`
              : "在留カード受領後の売上登録で作られます"}
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        {support === "支援対象外" ? (
          // 特定技能2号などの支援対象外は支援代の請求がないため定期売上No.はなし
          <p className="rounded-xl bg-background p-3 text-sm">
            <span className="text-xs text-muted">定期売上No.: </span>
            <span className="font-bold">なし（支援対象外のため定期売上はありません）</span>
          </p>
        ) : canEdit ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">
              定期売上No.（現在・在籍中{currentOrgName ? `: ${currentOrgName}` : ""}）
            </span>
            <span className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="例: SP-0000000225"
                className={`min-h-[44px] w-full rounded-xl border px-3 text-sm ${
                  salesNo ? "border-border bg-background" : "border-seal/40 bg-seal/5"
                }`}
              />
              <Button
                className="shrink-0"
                disabled={busy || draft.trim() === salesNo}
                onClick={() => void save()}
                icon={busy ? <Loader2 size={16} className="animate-spin" /> : undefined}
              >
                保存
              </Button>
            </span>
            {!salesNo && (
              <span className="text-[11px] text-seal">
                未登録です。freee販売で定期売上を作ったら、その伝票番号を登録してください。
              </span>
            )}
          </label>
        ) : (
          <p className="text-sm">
            <span className="text-xs text-muted">
              定期売上No.（現在・在籍中{currentOrgName ? `: ${currentOrgName}` : ""}）:{" "}
            </span>
            <span className="font-bold">{salesNo || "未登録"}</span>
          </p>
        )}
      </div>

      {/* 過去の定期売上No.（転職前の所属機関の番号）。退職済みのためもう請求には使わない */}
      {(canEdit || past.length > 0) && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="mb-1 flex items-center gap-2 text-xs font-bold">
            <History size={14} />
            過去の定期売上No.（転職前・使用しない）
          </h3>
          <p className="mb-2 text-[11px] leading-relaxed text-muted">
            転職前の所属機関で使っていた番号です。退職済みのためもう請求には使いません。
          </p>

          <div className="space-y-2">
            {past.map((r, i) => (
              <div key={i} className="flex items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted">当時の所属機関</span>
                  <select
                    value={r.organization_id}
                    onChange={(e) => setPastAt(i, "organization_id", e.target.value)}
                    disabled={!canEdit}
                    className={INPUT}
                  >
                    <option value="">選択してください</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex w-[170px] shrink-0 flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted">定期売上No.</span>
                  <input
                    value={r.sales_no}
                    onChange={(e) => setPastAt(i, "sales_no", e.target.value)}
                    placeholder="例: SP-0000000225"
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </label>
                {canEdit && (
                  <button
                    type="button"
                    aria-label="この行を削除"
                    onClick={() => {
                      setPast((rs) => rs.filter((_, idx) => idx !== i));
                      setPastSaved(false);
                    }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-seal"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {canEdit && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  fullWidth
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setPast((rs) => [...rs, { organization_id: "", sales_no: "" }]);
                    setPastSaved(false);
                  }}
                >
                  過去の番号を追加
                </Button>
                {salesNo && (
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => {
                      setPast((rs) => [
                        ...rs,
                        { organization_id: organizationId ?? "", sales_no: salesNo },
                      ]);
                      setPastSaved(false);
                    }}
                  >
                    現在の番号を履歴へコピー
                  </Button>
                )}
              </div>
              {!pastSaved && (
                <Button fullWidth disabled={busy} onClick={() => void savePast()}>
                  {busy ? "保存中…" : "過去の定期売上No.を保存"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {notice && (
        <p
          role="status"
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            notice.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"
          }`}
        >
          {notice.message}
        </p>
      )}
    </Card>
  );
}
