"use client";

import { useEffect, useState } from "react";
import { Check, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import {
  getHealthCheckDetail,
  upsertHealthCheckDetail,
} from "@/lib/supabase/queries/health-check";
import {
  EMPTY_HEALTH_DETAIL,
  HEALTH_EXAM_ITEMS,
  healthCheckValidUntil,
  isHealthCheckValid,
  isHealthDetailComplete,
  parseCheckedItems,
  type HealthCheckDetail,
} from "@/lib/health-check";
import { todayStr } from "@/lib/ssw/calc";

const TEXTAREA =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none";

// 健康診断書の詳細ページ。
// - 1〜3号の公式様式に医師が記入していれば、受診項目のチェックは不要。
//   ただし要精査等で「就労可」を後日もらう必要がある場合は、その旨のメモと後日の結果を記録する。
// - 病院独自の書式の場合は、受診項目がそろっているかをチェックする。
export function HealthCheckDetailClient({
  workerId,
  workerName,
  examOn,
  canEdit,
}: {
  workerId: string;
  workerName: string;
  examOn: string | null;
  canEdit: boolean;
}) {
  const [detail, setDetail] = useState<HealthCheckDetail>(EMPTY_HEALTH_DETAIL);
  const [hasFile, setHasFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    getHealthCheckDetail(supabase, workerId).then(setDetail).catch(() => undefined);
    listOnboardingDocs(supabase, workerId)
      .then((docs) => setHasFile(docs.some((d) => d.doc_key === "kenshin" && d.storage_path)))
      .catch(() => undefined);
  }, [workerId]);

  const today = todayStr();
  const valid = isHealthCheckValid(examOn, today);
  const validUntil = healthCheckValidUntil(examOn);
  const complete = isHealthDetailComplete(detail, hasFile, examOn, today);
  const checked = parseCheckedItems(detail.checked_items);

  const set = <K extends keyof HealthCheckDetail>(key: K, value: HealthCheckDetail[K]) =>
    setDetail((d) => ({ ...d, [key]: value }));

  const toggleItem = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set("checked_items", HEALTH_EXAM_ITEMS.filter((i) => next.has(i.id)).map((i) => i.id).join(","));
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await upsertHealthCheckDetail(createClient(), workerId, detail);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <Card className="p-4">
        <p className="mb-1 text-sm font-bold">{workerName}</p>
        <p className="text-xs text-muted">
          受診日 {examOn || "未設定"}
          {examOn && (
            <>
              {" ／ "}有効期限 {validUntil}{" "}
              <span className={valid ? "text-status-approved-fg" : "text-seal"}>
                （{valid ? "有効" : "無効"}）
              </span>
            </>
          )}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          受診日・健康診断書ファイルは外国人詳細の「健康診断」で登録します。
        </p>

        {/* 完了ステータス */}
        <div
          className={`mt-3 flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold ${
            complete
              ? "bg-status-approved-bg text-status-approved-fg"
              : "bg-seal/10 text-seal"
          }`}
        >
          {complete ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
          {complete ? "健康診断書の準備は完了しています" : "健康診断書はまだ完了していません"}
        </div>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <Card className="space-y-3 p-4">
        <div>
          <p className="mb-1.5 text-xs font-bold text-muted">書類の様式</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="form_type"
                checked={detail.form_type === "official"}
                disabled={!canEdit}
                onChange={() => set("form_type", "official")}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="font-bold">公式様式（1〜3号）に医師が記入</span>
                <span className="block text-[11px] text-muted">
                  受診項目のチェックは不要です。要精査等の場合のみ下で記録します。
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="form_type"
                checked={detail.form_type === "hospital"}
                disabled={!canEdit}
                onChange={() => set("form_type", "hospital")}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="font-bold">病院独自の書式</span>
                <span className="block text-[11px] text-muted">
                  下の受診項目がそろっているかをチェックしてください。
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* 公式様式: 要精査・就労可の後日結果 */}
        {detail.form_type === "official" && (
          <div className="rounded-xl border border-border bg-background p-3">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={detail.needs_followup}
                disabled={!canEdit}
                onChange={(e) => set("needs_followup", e.target.checked)}
                className="h-4 w-4"
              />
              要精査等で「就労可」を後日もらう必要がある
            </label>
            {detail.needs_followup && (
              <div className="mt-2.5 space-y-2.5">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-muted">
                    メモ（後日診断結果をもらう旨・予定など）
                  </span>
                  <textarea
                    rows={2}
                    value={detail.followup_memo}
                    readOnly={!canEdit}
                    onChange={(e) => set("followup_memo", e.target.value)}
                    placeholder="例: ◯月◯日に再検査。就労可の診断書を後日受領予定"
                    className={TEXTAREA}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-muted">
                    その後の結果（就労可 など）※入力すると完了になります
                  </span>
                  <textarea
                    rows={2}
                    value={detail.followup_result}
                    readOnly={!canEdit}
                    onChange={(e) => set("followup_result", e.target.value)}
                    placeholder="例: ◯月◯日 就労可の診断書を受領"
                    className={TEXTAREA}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {/* 病院書式: 受診項目チェック */}
        {detail.form_type === "hospital" && (
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="mb-2 text-[11px] font-bold text-muted">
              受診項目（1〜3号と同じ項目・{checked.size}/{HEALTH_EXAM_ITEMS.length}）
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {HEALTH_EXAM_ITEMS.map((item) => (
                <label key={item.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked.has(item.id)}
                    disabled={!canEdit}
                    onChange={() => toggleItem(item.id)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {canEdit && (
          <Button type="button" fullWidth onClick={save} disabled={saving}>
            {saving ? (
              <span className="flex items-center gap-1">
                <Loader2 size={15} className="animate-spin" /> 保存中…
              </span>
            ) : saved ? (
              <span className="flex items-center gap-1">
                <Check size={15} /> 保存しました
              </span>
            ) : (
              "保存する"
            )}
          </Button>
        )}
      </Card>
    </div>
  );
}
