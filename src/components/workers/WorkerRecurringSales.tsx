"use client";

import { useEffect, useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { setWorkerRecurringSalesNo } from "@/lib/supabase/queries/workers";
import { listSalesEntriesByWorker } from "@/lib/supabase/queries/sales";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { formatSalesYen } from "@/lib/sales";
import { parseAmount } from "@/lib/organization-intake";
import type { SalesEntryRow } from "@/types/db";

// 外国人詳細の「定期売上」。毎月の支援代をどの番号で継続請求しているかを表示し、
// 番号が未登録ならこの画面から登録できる（申請詳細の売上登録からも登録できる）。
export function WorkerRecurringSales({
  workerId,
  organizationId,
  initialSalesNo,
  canEdit,
}: {
  workerId: string;
  organizationId: string | null;
  initialSalesNo: string;
  canEdit: boolean;
}) {
  const [salesNo, setSalesNo] = useState(initialSalesNo);
  const [draft, setDraft] = useState(initialSalesNo);
  const [entries, setEntries] = useState<SalesEntryRow[]>([]);
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

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

  const latest = entries[0];

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Coins size={16} />
        定期売上（毎月の支援代）
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        毎月の支援代をfreee販売の定期売上で継続請求するときの伝票番号です。月末の請求書作成でも使います。
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
        {canEdit ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">定期売上No.</span>
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
            <span className="text-xs text-muted">定期売上No.: </span>
            <span className="font-bold">{salesNo || "未登録"}</span>
          </p>
        )}
      </div>

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
