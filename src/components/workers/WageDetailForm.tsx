"use client";

import { useMemo, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import {
  EMPLOYMENT_INSURANCE_KINDS,
  HEALTH_INSURANCE_RATES,
  HEALTH_PREFECTURE_CUSTOM,
  WAGE_ALLOWANCE_TYPES,
  WAGE_CALC_TOOL_URL,
  WAGE_CALC_YEAR_LABEL,
  allowanceMethodTemplate,
  baseWageNote,
  calcWageDetail,
  formatYen,
  lodgingNoteTemplate,
  lodgingPerPerson,
  wageDetailFormText,
} from "@/lib/wage-calc";
import {
  WAGE_AGE_BANDS,
  WAGE_UTILITY_KINDS,
  type OrgLodging,
  type WageAgeBand,
  type WageDetail,
  type WageUtilityKind,
  type WorkerWageKind,
} from "@/types/db";

// 賃金を入れるときに「どういう内容で参考様式第1-6号 別紙1を作ったか」を入力し、
// 令和8年分の源泉所得税・社会保険料（熊本などの県別料率）・雇用保険料・
// 社宅の居住費までを計算して、様式に貼り付けるテキストまで出す。
// 計算は src/lib/wage-calc.ts（もとは賃金の明細 計算ツール）。

const FIELD = "min-h-[34px] rounded-lg border border-border bg-surface px-2 text-xs";
const NUM = `${FIELD} w-28 text-right tabular-nums`;

function numValue(v: string): number {
  return Number(v.replace(/[^0-9]/g, "")) || 0;
}

export function WageDetailForm({
  wage,
  detail,
  onChange,
  lodgings,
  orgName,
  fallbackAnnualHours,
  readOnly = false,
}: {
  wage: { kind: WorkerWageKind | string; amount: number };
  detail: WageDetail;
  onChange: (next: WageDetail) => void;
  lodgings: OrgLodging[]; // 所属機関に登録した寮・社宅
  orgName: string;
  fallbackAnnualHours: number; // 所属機関の年間所定労働時間
  readOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const set = (patch: Partial<WageDetail>) => onChange({ ...detail, ...patch });

  const result = useMemo(
    () => calcWageDetail(wage, detail, fallbackAnnualHours),
    [wage, detail, fallbackAnnualHours],
  );

  const formText = useMemo(
    () => wageDetailFormText(wage, detail, result),
    [wage, detail, result],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // 社宅を選ぶと、家賃÷最大入居人数を1人当たりの居住費として入れ、算定方法の文も作る
  const selectLodging = (id: string) => {
    if (!id) {
      set({ housing_lodging_id: "", housing_amount: 0, housing_note: "" });
      return;
    }
    const lodging = lodgings.find((l) => l.id === id);
    if (!lodging) return;
    const perPerson = lodgingPerPerson(lodging);
    set({
      housing_lodging_id: id,
      housing_amount: perPerson,
      housing_note: lodgingNoteTemplate(lodging, perPerson),
    });
  };

  const rowClass = "flex flex-wrap items-end gap-2 border-b border-border/60 py-2.5";
  const labelClass = "text-[10px] font-bold text-muted";

  return (
    <div className="space-y-2 text-xs">
      <p className="leading-relaxed text-muted">
        参考様式第1-6号 別紙1「賃金の支払」の内容です。入れておくと、あとから
        「この人の手取りをどう計算したか」を出せます。金額はすべて概算（約）で、
        {WAGE_CALC_YEAR_LABEL}
        の料率で計算しています。同じ計算は
        <a
          href={WAGE_CALC_TOOL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-0.5 font-bold text-brand underline underline-offset-2"
        >
          賃金の明細 計算ツール
        </a>
        でもできます。
      </p>

      {/* 1. 基本賃金（賃金の区分・金額はこのフォームの上で入れたものを使う） */}
      <div className={rowClass}>
        <div className="w-full">
          <p className="font-bold">1. 基本賃金</p>
          <p className="text-muted">
            {wage.kind} {formatYen(wage.amount)}円 → 1か月当たり 約
            <b className="tabular-nums">{formatYen(result.base)}</b>円
          </p>
          <p className="text-[10px] text-muted">
            {baseWageNote(wage.kind, wage.amount, result.annualHours)}
          </p>
        </div>
        <label className="flex flex-col gap-0.5">
          <span className={labelClass}>年間所定労働時間（未入力なら{orgName || "所属機関"}の登録値）</span>
          <input
            value={detail.annual_hours || ""}
            onChange={(e) => set({ annual_hours: numValue(e.target.value) })}
            inputMode="numeric"
            disabled={readOnly}
            placeholder={fallbackAnnualHours ? String(fallbackAnnualHours) : "例: 2080"}
            className={NUM}
          />
        </label>
      </div>

      {/* 2. 諸手当 */}
      <div className="border-b border-border/60 py-2.5">
        <p className="mb-1 font-bold">2. 諸手当の額及び計算方法等</p>
        <div className="space-y-2">
          {detail.allowances.map((a, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5">
                <span className={labelClass}>種類</span>
                <select
                  value={a.type}
                  disabled={readOnly}
                  onChange={(e) => {
                    const type = e.target.value;
                    set({
                      allowances: detail.allowances.map((x, j) =>
                        j === i
                          ? { ...x, type, method: allowanceMethodTemplate(type, x.amount) }
                          : x,
                      ),
                    });
                  }}
                  className={FIELD}
                >
                  {WAGE_ALLOWANCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={labelClass}>手当名（任意）</span>
                <input
                  value={a.name}
                  disabled={readOnly}
                  onChange={(e) =>
                    set({
                      allowances: detail.allowances.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                  className={`${FIELD} w-28`}
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={labelClass}>金額（円）</span>
                <input
                  value={a.amount || ""}
                  disabled={readOnly}
                  inputMode="numeric"
                  onChange={(e) => {
                    const amount = numValue(e.target.value);
                    set({
                      allowances: detail.allowances.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              amount,
                              // 文例のままなら金額に合わせて書き換える
                              method:
                                x.method === allowanceMethodTemplate(x.type, x.amount)
                                  ? allowanceMethodTemplate(x.type, amount)
                                  : x.method,
                            }
                          : x,
                      ),
                    });
                  }}
                  className={NUM}
                />
              </label>
              <label className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                <span className={labelClass}>計算方法（別紙にそのまま書く文）</span>
                <textarea
                  value={a.method}
                  disabled={readOnly}
                  rows={2}
                  onChange={(e) =>
                    set({
                      allowances: detail.allowances.map((x, j) =>
                        j === i ? { ...x, method: e.target.value } : x,
                      ),
                    })
                  }
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                />
              </label>
              {!readOnly && (
                <button
                  type="button"
                  aria-label="この手当を削除"
                  onClick={() =>
                    set({ allowances: detail.allowances.filter((_, j) => j !== i) })
                  }
                  className="mb-1 text-muted hover:text-seal"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() =>
              set({
                allowances: [
                  ...detail.allowances,
                  {
                    type: "通勤手当",
                    name: "",
                    amount: 0,
                    method: allowanceMethodTemplate("通勤手当", 0),
                  },
                ],
              })
            }
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 font-bold"
          >
            <Plus size={12} />
            手当を追加
          </button>
        )}

        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-1.5 font-bold">
            <input
              type="checkbox"
              checked={detail.fixed_ot_enabled}
              disabled={readOnly}
              onChange={(e) => set({ fixed_ot_enabled: e.target.checked })}
            />
            固定残業代がある
          </label>
          {detail.fixed_ot_enabled && (
            <>
              <label className="flex flex-col gap-0.5">
                <span className={labelClass}>固定残業代（円）</span>
                <input
                  value={detail.fixed_ot_amount || ""}
                  disabled={readOnly}
                  inputMode="numeric"
                  onChange={(e) => set({ fixed_ot_amount: numValue(e.target.value) })}
                  className={NUM}
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={labelClass}>時間外労働の時間数</span>
                <input
                  value={detail.fixed_ot_hours || ""}
                  disabled={readOnly}
                  inputMode="numeric"
                  onChange={(e) => set({ fixed_ot_hours: numValue(e.target.value) })}
                  className={`${NUM} w-20`}
                />
              </label>
            </>
          )}
          <span className="ml-auto font-bold tabular-nums">
            諸手当 合計 {formatYen(result.allowanceTotal)}円
          </span>
        </div>
      </div>

      {/* 3. 支払概算額 */}
      <p className="rounded-lg bg-brand/5 px-3 py-2 font-bold">
        3. 1か月当たりの支払概算額（1＋2） 約
        <span className="text-base tabular-nums">{formatYen(result.gross)}</span>円
      </p>

      {/* 4. 控除 */}
      <p className="pt-1 font-bold">4. 賃金支払時に控除する項目</p>

      {/* (a) 所得税 */}
      <div className={rowClass}>
        <span className="w-full font-bold">(a) 税金（源泉所得税）</span>
        <label className="flex flex-col gap-0.5">
          <span className={labelClass}>源泉控除対象配偶者</span>
          <select
            value={detail.tax_spouse ? "あり" : "なし"}
            disabled={readOnly}
            onChange={(e) => set({ tax_spouse: e.target.value === "あり" })}
            className={FIELD}
          >
            <option>なし</option>
            <option>あり</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={labelClass}>扶養親族等の数（人）</span>
          <input
            value={detail.tax_dependents || ""}
            disabled={readOnly}
            inputMode="numeric"
            onChange={(e) => set({ tax_dependents: numValue(e.target.value) })}
            className={`${NUM} w-16`}
          />
        </label>
        <span className="ml-auto font-bold tabular-nums">約{formatYen(result.tax)}円</span>
        <p className="w-full text-[10px] text-muted">
          令和8年分 源泉徴収税額表（月額表・甲欄）の電算機計算の特例で計算します。
          社会保険料・雇用保険料を引いたあとの金額が課税対象です。
        </p>
      </div>

      {/* (b) 社会保険料 */}
      <div className={rowClass}>
        <label className="flex w-full items-center gap-1.5 font-bold">
          <input
            type="checkbox"
            checked={detail.social_enabled}
            disabled={readOnly}
            onChange={(e) => set({ social_enabled: e.target.checked })}
          />
          (b) 社会保険料（健康保険・厚生年金に加入する）
        </label>
        {detail.social_enabled && (
          <>
            <label className="flex flex-col gap-0.5">
              <span className={labelClass}>健康保険料率（都道府県）</span>
              <select
                value={detail.health_prefecture}
                disabled={readOnly}
                onChange={(e) => {
                  const prefecture = e.target.value;
                  const hit = HEALTH_INSURANCE_RATES.find((r) => r.prefecture === prefecture);
                  set({
                    health_prefecture: prefecture,
                    health_rate: hit ? hit.rate : detail.health_rate,
                  });
                }}
                className={FIELD}
              >
                {HEALTH_INSURANCE_RATES.map((r) => (
                  <option key={r.prefecture} value={r.prefecture}>
                    {r.prefecture} {r.rate}%
                  </option>
                ))}
                <option value={HEALTH_PREFECTURE_CUSTOM}>{HEALTH_PREFECTURE_CUSTOM}</option>
              </select>
            </label>
            {detail.health_prefecture === HEALTH_PREFECTURE_CUSTOM && (
              <label className="flex flex-col gap-0.5">
                <span className={labelClass}>料率（%）</span>
                <input
                  value={detail.health_rate || ""}
                  disabled={readOnly}
                  inputMode="decimal"
                  onChange={(e) =>
                    set({ health_rate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })
                  }
                  className={`${NUM} w-20`}
                />
              </label>
            )}
            <label className="flex flex-col gap-0.5">
              <span className={labelClass}>年齢区分</span>
              <select
                value={detail.age_band}
                disabled={readOnly}
                onChange={(e) => set({ age_band: e.target.value as WageAgeBand })}
                className={FIELD}
              >
                {WAGE_AGE_BANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                    {b === "40〜64歳" ? "（介護保険料あり）" : ""}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <span className="ml-auto font-bold tabular-nums">約{formatYen(result.social)}円</span>
        <p className="w-full text-[10px] text-muted">
          健康保険（労使折半・{result.healthRate}%）＋介護保険（40〜64歳のみ）＋こども子育て支援金
          ＋厚生年金 18.3% の本人負担分の概算です。実際は標準報酬月額の等級表で決まるため少しずれます。
        </p>
      </div>

      {/* (c) 雇用保険料 */}
      <div className={rowClass}>
        <label className="flex w-full items-center gap-1.5 font-bold">
          <input
            type="checkbox"
            checked={detail.employment_enabled}
            disabled={readOnly}
            onChange={(e) => set({ employment_enabled: e.target.checked })}
          />
          (c) 雇用保険料
        </label>
        {detail.employment_enabled && (
          <label className="flex flex-col gap-0.5">
            <span className={labelClass}>事業の種類</span>
            <select
              value={detail.employment_kind}
              disabled={readOnly}
              onChange={(e) => set({ employment_kind: e.target.value })}
              className={FIELD}
            >
              {EMPLOYMENT_INSURANCE_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.kind}（本人負担 {(k.rate * 100).toFixed(1)}%）
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="ml-auto font-bold tabular-nums">約{formatYen(result.employment)}円</span>
      </div>

      {/* (d) 食費 */}
      <div className={rowClass}>
        <span className="font-bold">(d) 食費</span>
        <label className="flex flex-col gap-0.5">
          <span className={labelClass}>金額（円・任意）</span>
          <input
            value={detail.food_cost || ""}
            disabled={readOnly}
            inputMode="numeric"
            onChange={(e) => set({ food_cost: numValue(e.target.value) })}
            className={NUM}
          />
        </label>
        <span className="ml-auto font-bold tabular-nums">約{formatYen(result.food)}円</span>
      </div>

      {/* (e) 居住費（社宅） */}
      <div className={rowClass}>
        <label className="flex w-full items-center gap-1.5 font-bold">
          <input
            type="checkbox"
            checked={detail.housing_self_contract}
            disabled={readOnly}
            onChange={(e) => set({ housing_self_contract: e.target.checked })}
          />
          (e) 居住費 ／ 本人が自分で住居を契約する（会社は徴収しない＝0円）
        </label>
        {!detail.housing_self_contract && (
          <>
            <label className="flex flex-col gap-0.5">
              <span className={labelClass}>社宅（{orgName || "所属機関"}に登録した寮）</span>
              <select
                value={detail.housing_lodging_id}
                disabled={readOnly}
                onChange={(e) => selectLodging(e.target.value)}
                className={`${FIELD} max-w-[260px]`}
              >
                <option value="">選ばない（金額を直接入れる）</option>
                {lodgings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name || "寮"}
                    {l.rent ? `（家賃${formatYen(Number(String(l.rent).replace(/[^0-9]/g, "")))}円` : "（家賃未登録"}
                    {l.max_residents ? `・最大${l.max_residents}名）` : "）"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={labelClass}>1人当たり居住費（円/月）</span>
              <input
                value={detail.housing_amount || ""}
                disabled={readOnly}
                inputMode="numeric"
                onChange={(e) => set({ housing_amount: numValue(e.target.value) })}
                className={NUM}
              />
            </label>
            <label className="flex w-full flex-col gap-0.5">
              <span className={labelClass}>算定方法・説明文（別紙にそのまま書く文）</span>
              <textarea
                value={detail.housing_note}
                disabled={readOnly}
                rows={2}
                onChange={(e) => set({ housing_note: e.target.value })}
                placeholder="例：賃貸借契約書に基づく家賃月額60,000円を入居者3名で除した金額を徴収する。"
                className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
              />
            </label>
            {lodgings.length === 0 && (
              <p className="w-full text-[10px] text-muted">
                {orgName || "所属機関"}に寮・社宅が登録されていません。
                所属機関の申込書内容（寮・宿泊物件）に家賃と最大入居人数を入れると、
                ここで選ぶだけで1人当たりの居住費を計算できます。
              </p>
            )}
          </>
        )}
        <span className="ml-auto font-bold tabular-nums">約{formatYen(result.housing)}円</span>
      </div>

      {/* (f) 水道光熱費 */}
      <div className={rowClass}>
        <span className="font-bold">(f) 水道光熱費</span>
        <label className="flex flex-col gap-0.5">
          <span className={labelClass}>徴収の仕方</span>
          <select
            value={detail.utility_kind}
            disabled={readOnly}
            onChange={(e) => set({ utility_kind: e.target.value as WageUtilityKind })}
            className={FIELD}
          >
            {WAGE_UTILITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={labelClass}>金額（円）</span>
          <input
            value={detail.utility_amount || ""}
            disabled={readOnly}
            inputMode="numeric"
            onChange={(e) => set({ utility_amount: numValue(e.target.value) })}
            className={NUM}
          />
        </label>
        <span className="ml-auto font-bold tabular-nums">約{formatYen(result.utility)}円</span>
      </div>

      {/* その他控除 */}
      <div className="border-b border-border/60 py-2.5">
        <p className="mb-1 font-bold">その他控除</p>
        <div className="space-y-2">
          {detail.others.map((o, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5">
                <span className={labelClass}>項目名</span>
                <input
                  value={o.name}
                  disabled={readOnly}
                  onChange={(e) =>
                    set({
                      others: detail.others.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                  className={`${FIELD} w-40`}
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={labelClass}>金額（円）</span>
                <input
                  value={o.amount || ""}
                  disabled={readOnly}
                  inputMode="numeric"
                  onChange={(e) =>
                    set({
                      others: detail.others.map((x, j) =>
                        j === i ? { ...x, amount: numValue(e.target.value) } : x,
                      ),
                    })
                  }
                  className={NUM}
                />
              </label>
              {!readOnly && (
                <button
                  type="button"
                  aria-label="この控除を削除"
                  onClick={() => set({ others: detail.others.filter((_, j) => j !== i) })}
                  className="mb-1 text-muted hover:text-seal"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => set({ others: [...detail.others, { name: "", amount: 0 }] })}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 font-bold"
          >
            <Plus size={12} />
            項目を追加
          </button>
        )}
      </div>

      {/* 合計・手取り */}
      <div className="rounded-xl bg-background p-3">
        <p className="flex items-center justify-between font-bold">
          <span>控除額 合計（4）</span>
          <span className="tabular-nums">約{formatYen(result.deductTotal)}円</span>
        </p>
        <p className="mt-1 flex items-center justify-between text-base font-black text-brand">
          <span>5. 手取り支給額（3－4）</span>
          <span className="tabular-nums">約{formatYen(result.net)}円</span>
        </p>
        <p className="mt-1 text-[10px] text-muted">
          ※欠勤等がない場合であって、時間外労働の割増賃金等は除きます。すべて概算です。
        </p>
      </div>

      {/* 会社（所属機関）からの同意の確認。申請準備のTODOからここを開いて確認する */}
      <label className="flex items-start gap-2 rounded-xl border border-border bg-background p-3 text-xs font-bold">
        <input
          type="checkbox"
          checked={detail.company_agreed}
          onChange={(e) => set({ company_agreed: e.target.checked })}
          disabled={readOnly}
          className="mt-0.5 h-4 w-4 accent-brand"
        />
        <span>
          この1-6号別紙の内容について、会社（{orgName || "所属機関"}）から同意を得ました
          {detail.company_agreed && (
            <span className="ml-1.5 rounded-full bg-status-reported-bg px-2 py-0.5 text-[10px] text-status-reported-fg">
              同意済み
            </span>
          )}
          <span className="block text-[10px] font-normal text-muted">
            賃金・控除の内容は会社の確認が必要です。同意をもらったらチェックして保存してください。
          </span>
        </span>
      </label>

      {/* 正式な書類（参考様式第1-6号 別紙1「賃金の支払」）と同じ並びで計算結果を表示する */}
      <WageFormPreview wage={wage} detail={detail} result={result} />

      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-bold"
      >
        <Copy size={13} />
        {copied ? "コピーしました" : "様式用テキストをコピー"}
      </button>
    </div>
  );
}

// 参考様式第1-6号 別紙1「賃金の支払」の並びそのままで、計算結果を見やすく表示する。
// Wordの様式が正式な書類のため、書類と同じ順番・言い回しで確認できるようにしている
function WageFormPreview({
  wage,
  detail,
  result,
}: {
  wage: { kind: WorkerWageKind | string; amount: number };
  detail: WageDetail;
  result: ReturnType<typeof calcWageDetail>;
}) {
  const yen = (n: number) => `約 ${formatYen(n)}円`;
  const deductRow = (label: string, amount: number, sub?: string) => (
    <div className="flex items-start justify-between gap-2 py-0.5">
      <span className="min-w-0">
        {label}
        {sub && <span className="block text-[10px] font-normal text-muted">{sub}</span>}
      </span>
      <span className="shrink-0 tabular-nums">（{yen(amount)}）</span>
    </div>
  );
  return (
    <div className="rounded-xl border-2 border-border bg-surface p-3.5 text-xs leading-relaxed">
      <p className="text-right text-[10px] text-muted">参考様式第１－６号　別紙１</p>
      <p className="mb-2 text-center text-sm font-black">賃金の支払</p>

      <p className="font-bold">１．基本賃金</p>
      <p className="pl-3">
        {wage.kind}（{formatYen(wage.amount)}円）
      </p>
      <p className="pl-3 text-[10px] text-muted">
        {baseWageNote(wage.kind, wage.amount, result.annualHours)}
      </p>

      <p className="mt-2 font-bold">２．諸手当の額及び計算方法等（時間外労働の割増賃金は除く。）</p>
      <div className="pl-3">
        {detail.allowances.length === 0 && !detail.fixed_ot_enabled && (
          <p className="text-muted">なし</p>
        )}
        {detail.allowances.map((a, i) => (
          <p key={i}>
            ({String.fromCharCode(97 + i)}) {a.type}
            {a.name ? `／${a.name}` : ""}　{formatYen(a.amount)}円
            {a.method && (
              <span className="block pl-4 text-[10px] text-muted">計算方法：{a.method}</span>
            )}
          </p>
        ))}
        {detail.fixed_ot_enabled && (
          <p>
            【固定残業代】{formatYen(detail.fixed_ot_amount)}円
            <span className="block pl-4 text-[10px] text-muted">
              支給要件：時間外労働の有無にかかわらず、{formatYen(detail.fixed_ot_hours)}
              時間分の時間外手当として支給。超える時間外労働分についての割増賃金は追加で支給。
            </span>
          </p>
        )}
      </div>

      <p className="mt-2 flex items-center justify-between rounded-lg bg-background px-2 py-1.5 font-bold">
        <span>３．１か月当たりの支払概算額（１＋２）</span>
        <span className="tabular-nums">{yen(result.gross)}（合計）</span>
      </p>

      <p className="mt-2 font-bold">４．賃金支払時に控除する項目</p>
      <div className="pl-3">
        {deductRow("(a) 税　　　金", result.tax)}
        {deductRow("(b) 社会保険料", result.social)}
        {deductRow("(c) 雇用保険料", result.employment)}
        {deductRow("(d) 食　　　費", result.food)}
        {deductRow("(e) 居　住　費", result.housing, detail.housing_note || undefined)}
        {deductRow("(f) その他（水道光熱費）", result.utility)}
        {detail.others.map((o, i) => (
          <div key={i}>{deductRow(`　　　　（${o.name || "その他"}）`, o.amount)}</div>
        ))}
      </div>
      <p className="mt-1 flex items-center justify-between rounded-lg bg-background px-2 py-1.5 font-bold">
        <span>控除する金額</span>
        <span className="tabular-nums">{yen(result.deductTotal)}（合計）</span>
      </p>

      <p className="mt-2 flex items-center justify-between rounded-lg bg-brand/10 px-2 py-2 text-sm font-black text-brand">
        <span>５．手取り支給額（３－４）</span>
        <span className="tabular-nums">{yen(result.net)}（合計）</span>
      </p>
      <p className="mt-1 text-[10px] text-muted">
        ※欠勤等がない場合であって、時間外労働の割増賃金等は除く。
      </p>
    </div>
  );
}
