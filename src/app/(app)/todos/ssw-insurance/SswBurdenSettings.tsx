"use client";

import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import { updateOrganization } from "@/lib/supabase/queries/organizations";
import {
  SSW_BURDEN_OPTIONS,
  sswBurdenRows,
  sswBurdenUnsetCount,
} from "@/lib/ssw-insurance";
import type { Organization } from "@/types/db";

// 所属機関ごとの「特定技能総合保険の負担」を、この画面から2つのボタンで決める。
// 所属機関の情報を1件ずつ開いて直さなくても、未設定の機関をまとめて登録できる。
// トグル（開閉）で、ふだんは畳んでおける。
export function SswBurdenSettings({
  orgs,
  canEdit,
  onSaved,
  onError,
}: {
  orgs: Organization[];
  canEdit: boolean;
  onSaved: () => void; // 保存後に一覧を読み直す
  onError: (message: string | null) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [onlyUnset, setOnlyUnset] = useState(false);
  const rows = useMemo(() => sswBurdenRows(orgs), [orgs]);
  const unset = sswBurdenUnsetCount(rows);
  const shown = onlyUnset ? rows.filter((r) => !r.burden) : rows;

  const save = async (id: string, burden: string) => {
    setBusyId(id);
    onError(null);
    try {
      const org = orgs.find((o) => o.id === id);
      // intake は1つのまとまり（jsonb）なので、他の項目を消さないように混ぜて保存する
      await updateOrganization(createClient(), id, {
        intake: { ...(org?.intake ?? {}), ssw_insurance_burden: burden },
      });
      onSaved();
    } catch (err) {
      onError(dbErrorMessage(err, "0043_organization_intake.sql", "保存に失敗しました"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-4">
      <details>
        <summary className="cursor-pointer text-sm font-bold">
          所属機関の負担区分の設定
          {unset > 0 ? (
            <span className="ml-1.5 text-seal">（未設定 {unset}件）</span>
          ) : (
            <span className="ml-1.5 text-muted">（全{rows.length}件・未設定なし）</span>
          )}
        </summary>

        <p className="mt-1 mb-3 text-[11px] leading-relaxed text-muted">
          どの所属機関が会社負担か外国人負担かをボタンで決められます（所属機関の情報の「特定技能総合保険の負担」と同じ項目です）。外国人負担にすると、その機関の人は本人の意思確認が必要な欄に出ます。
        </p>

        <label className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted">
          <input
            type="checkbox"
            checked={onlyUnset}
            onChange={(e) => setOnlyUnset(e.target.checked)}
            className="h-4 w-4"
          />
          未設定の機関だけ表示
        </label>

        <div className="space-y-1.5">
          {shown.length === 0 ? (
            <p className="rounded-xl border border-border bg-background p-4 text-center text-[11px] text-muted">
              表示する所属機関はありません。
            </p>
          ) : (
            shown.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{row.name}</span>
                {!row.burden && (
                  <span className="rounded-full bg-seal/10 px-2 py-0.5 text-[10px] font-bold text-seal">
                    未設定
                  </span>
                )}
                {busyId === row.id && <Loader2 size={14} className="animate-spin text-muted" />}
                {SSW_BURDEN_OPTIONS.map((option) => {
                  const active = row.burden === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={!canEdit || busyId === row.id}
                      onClick={() => void save(row.id, active ? "" : option)}
                      title={active ? "もう一度押すと未設定に戻ります" : undefined}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-50 ${
                        active
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border bg-surface text-muted hover:border-brand hover:text-brand"
                      }`}
                    >
                      {active && <Check size={11} className="mr-1 inline" />}
                      {option}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </details>
    </Card>
  );
}
