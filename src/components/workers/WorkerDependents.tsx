"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import {
  dependentAge,
  dependentCategoryLabels,
  emptyDependent,
  normalizeDependents,
  warekiDate,
} from "@/lib/dependents";
import { todayStr } from "@/lib/ssw/calc";
import type { WorkerDependent } from "@/types/db";

const RELATION_OPTIONS = [
  "配偶者",
  "父",
  "母",
  "子",
  "兄",
  "姉",
  "弟",
  "妹",
  "祖父",
  "祖母",
];

// 扶養家族（扶養親族証明書の内容）の記録と控除区分の自動判定。
// 生年月日は西暦で入力すると和暦と現時点の年齢を表示し、
// 配偶者控除・老人扶養親族・特定扶養親族などの該当区分をバッジで示す
export function WorkerDependents({
  workerId,
  initial,
  canEdit,
}: {
  workerId: string;
  initial: unknown; // workers.dependents（jsonb）
  canEdit: boolean;
}) {
  const router = useRouter();
  const today = todayStr();
  const [rows, setRows] = useState<WorkerDependent[]>(() => normalizeDependents(initial));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setAt = (i: number, key: keyof WorkerDependent, value: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), workerId, { dependents: rows });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const INPUT =
    "min-h-[40px] w-full rounded-lg border border-border bg-surface px-2.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Users size={16} />
          扶養家族（{rows.length}人）
        </h2>
        <Link
          href={`/workers/${workerId}/dependents-form`}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-brand"
        >
          <FileText size={14} />
          扶養控除等申告書を作成
        </Link>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        扶養親族証明書の内容を記録します。生年月日（西暦）を入力すると和暦と現時点の年齢、
        該当する控除区分（配偶者控除・老人扶養親族・特定扶養親族など）を自動で表示します。
      </p>
      {error && <p className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}

      {rows.length === 0 && (
        <p className="rounded-xl bg-background p-4 text-center text-sm text-muted">
          扶養家族がまだ登録されていません。
        </p>
      )}

      <div className="space-y-3">
        {rows.map((r, i) => {
          const age = r.birth ? dependentAge(r.birth, today) : null;
          const wareki = warekiDate(r.birth);
          const labels = dependentCategoryLabels(r, today);
          return (
            <div key={i} className="rounded-xl bg-background p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-muted">
                  扶養家族 {i + 1}
                  {age != null && (
                    <span className="ml-2 tabular-nums">
                      {wareki && `${wareki}生まれ ・ `}
                      {age}歳（現時点）
                    </span>
                  )}
                </p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setRows((rs) => rs.filter((_, idx) => idx !== i));
                      setSaved(false);
                    }}
                    className="text-xs font-bold text-seal"
                  >
                    削除
                  </button>
                )}
              </div>
              {labels.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {labels.map((l) => (
                    <span
                      key={l}
                      className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="氏名">
                  <input
                    value={r.name}
                    onChange={(e) => setAt(i, "name", e.target.value)}
                    placeholder="PORY PHANNA"
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
                <Field label="フリガナ">
                  <input
                    value={r.kana}
                    onChange={(e) => setAt(i, "kana", e.target.value)}
                    placeholder="ポーイ パンナー"
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
                <Field label="続柄">
                  <>
                    <input
                      value={r.relation}
                      onChange={(e) => setAt(i, "relation", e.target.value)}
                      placeholder="父・母・妹・配偶者 など"
                      disabled={!canEdit}
                      list="dependent-relations"
                      className={INPUT}
                    />
                    <datalist id="dependent-relations">
                      {RELATION_OPTIONS.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  </>
                </Field>
                <Field label="生年月日（西暦）">
                  <input
                    type="date"
                    value={r.birth}
                    onChange={(e) => setAt(i, "birth", e.target.value)}
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
                <Field label="住所（母国住所など）" wide>
                  <input
                    value={r.address}
                    onChange={(e) => setAt(i, "address", e.target.value)}
                    placeholder="POR SANGKAE VILLAGE, KOMNOB COMMUNE, ..."
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
                <Field label="職業及び年収">
                  <input
                    value={r.occupation}
                    onChange={(e) => setAt(i, "occupation", e.target.value)}
                    placeholder="FARMER"
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
                <Field label="所得の見積額・送金額メモ">
                  <input
                    value={r.income}
                    onChange={(e) => setAt(i, "income", e.target.value)}
                    placeholder="例: 0円 / 送金 40万円"
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-col gap-2">
          <Button
            variant="secondary"
            fullWidth
            icon={<Plus size={16} />}
            onClick={() => {
              setRows((rs) => [...rs, emptyDependent()]);
              setSaved(false);
            }}
          >
            扶養家族を追加
          </Button>
          {!saved && (
            <Button fullWidth disabled={busy} onClick={save}>
              {busy ? "保存中…" : "扶養家族を保存"}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] font-bold text-muted">{label}</span>
      {children}
    </label>
  );
}
