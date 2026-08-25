"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { formatAmountInput } from "@/lib/amount-format";
import { dailyWorkHours } from "@/lib/posting-sheet";
import type { PostingSheet } from "@/types/recruiting";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";

// 特定技能1号 求人票（会社に渡す様式）の印刷用。A4縦1枚。
// 入っていない欄は空欄のまま出すので、そのまま会社に書いてもらうこともできる。

const DAYS = ["月", "火", "水", "木", "金", "土", "日", "祝祭日"];

// 選んだものに丸を付ける（手書きで丸を付けた様式と同じ見え方にする）
function Pick({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={
        on
          ? "inline-block rounded-full border border-black px-1.5 py-[1px] font-bold leading-none"
          : "inline-block px-1.5 py-[1px] leading-none"
      }
    >
      {label}
    </span>
  );
}

// チェック欄（□ / ☑）
function Check({ label, on }: { label: string; on: boolean }) {
  return (
    <span className="whitespace-nowrap">
      {on ? "☑" : "□"}
      {label}
    </span>
  );
}

// 記入する値。空欄のときは下線だけを出す
function V({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={`inline-block min-w-[2em] border-b border-black px-1 ${className}`}>
      {value || " "}
    </span>
  );
}

function Row({
  label,
  children,
  labelClass = "",
}: {
  label: string;
  children: React.ReactNode;
  labelClass?: string;
}) {
  return (
    <tr>
      <th
        className={`w-[28mm] border border-black bg-gray-100 px-1 py-[3px] text-left align-middle font-bold ${labelClass}`}
      >
        {label}
      </th>
      <td className="border border-black px-1 py-[3px] align-top">{children}</td>
    </tr>
  );
}

function Section({ title }: { title: string }) {
  return (
    <tr>
      <th
        colSpan={2}
        className="border border-black bg-gray-200 px-1 py-[3px] text-left font-black"
      >
        {title}
      </th>
    </tr>
  );
}

// 金額の欄。数字なら「1,100円」、「無し」などの言葉ならそのまま
function yen(v: string): string {
  if (!v) return "";
  return /^[0-9,]+$/.test(v) ? `${formatAmountInput(v)}円` : v;
}

export function PostingSheetPrint({
  posting,
  sheet,
  orgName,
  orgAddress,
  orgContact,
}: {
  posting: PostingWithStats;
  sheet: PostingSheet;
  orgName: string;
  orgAddress: string;
  orgContact: string;
}) {
  const wage =
    posting.wage_amount != null
      ? `${formatAmountInput(String(posting.wage_amount))}円`
      : "";
  const daily =
    sheet.daily_hours || dailyWorkHours(sheet.work_start, sheet.work_end, sheet.break_minutes);
  const allowances = sheet.allowances.length > 0 ? sheet.allowances : [{ name: "", amount: "", method: "" }];

  return (
    <>
      {/* A4縦で刷る。印刷のときは様式だけを出す */}
      <style>{"@media print{@page{size:A4 portrait;margin:10mm}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={`/postings/${posting.id}`} />
          <h1 className="flex-1 text-lg font-bold">特定技能1号 求人票（印刷）</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-8">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
          >
            <Printer size={18} />
            印刷・PDF保存（A4縦）
          </button>
          <span className="text-[11px] leading-relaxed text-muted">
            求人の登録内容をそのまま様式に入れています。空いている欄は空欄のまま出るので、
            そのまま会社に書いてもらうこともできます。直すときは求人の画面から編集してください。
          </span>
        </div>
      </div>

      <div className="px-4 pb-6 lg:px-8 print:p-0">
        <div className="mx-auto max-w-[190mm] border border-border bg-white p-[6mm] text-black print:border-0 print:p-0">
          {/* 見出しと受付欄 */}
          <div className="mb-1 flex items-start justify-between gap-4">
            <h2 className="flex-1 text-center text-[15px] font-black">特定技能１号求人票</h2>
            <table className="w-[52mm] shrink-0 border-collapse text-[9px]">
              <tbody>
                <tr>
                  <th className="w-[18mm] border border-black bg-gray-100 px-1 py-[2px] font-bold">
                    受付日
                  </th>
                  <td className="border border-black px-1 py-[2px]">{posting.received_on || ""}</td>
                </tr>
                <tr>
                  <th className="border border-black bg-gray-100 px-1 py-[2px] font-bold">
                    受付番号
                  </th>
                  <td className="border border-black px-1 py-[2px]">{posting.acceptance_no || ""}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mb-1 flex items-end justify-between gap-4 text-[9px]">
            <span>職業安定法第5条の3により、この書面にて労働条件等を明示します。</span>
            <span className="whitespace-nowrap">
              記入日 <V value={sheet.filled_on} />
            </span>
          </p>

          <table className="w-full border-collapse text-[9.5px] leading-tight">
            <tbody>
              <Section title="企業情報" />
              <Row label="求人者名（会社名）">
                <div className="flex flex-wrap items-center gap-x-4">
                  <span className="min-w-[70mm] flex-1">{orgName}</span>
                  <span>
                    分野名 <V value={sheet.field_name} />
                  </span>
                </div>
              </Row>
              <Row label="所在地">
                <div className="flex flex-wrap items-center gap-x-4">
                  <span className="min-w-[70mm] flex-1">{orgAddress}</span>
                  <span>TEL: {orgContact}</span>
                </div>
              </Row>
              <Row label="勤務地">
                <p>（雇入れ直後）{posting.work_location}</p>
                <p className="mt-[2px]">
                  （変更の可能性がある場合記入）
                  <Check label="変更なし" on={sheet.work_location_change === "変更なし"} />{" "}
                  {sheet.work_location_change !== "変更なし" ? sheet.work_location_change : ""}
                </p>
              </Row>

              <Section title="求人情報詳細" />
              <Row label="職種／採用人数">
                <div className="flex flex-wrap items-center gap-x-6">
                  <span className="flex-1">{posting.job_type}</span>
                  <span>採用人数 {posting.openings} 人</span>
                </div>
              </Row>
              <Row label="仕事内容">
                <p className="whitespace-pre-wrap">{sheet.job_description}</p>
              </Row>
              <Row label="契約期間">
                <p>
                  <Check label="期間の定めなし" on={sheet.contract_term_kind === "期間の定めなし"} />
                  <span className="ml-3">
                    <Check
                      label="期間の定めあり：雇用契約期間（"
                      on={sheet.contract_term_kind === "期間の定めあり"}
                    />
                    {sheet.contract_term || posting.employment_period}）
                  </span>
                </p>
                <p className="mt-[2px]">
                  契約の更新 <Check label="無" on={sheet.contract_renewal.startsWith("無")} />
                  <span className="ml-2">
                    <Check label="有：" on={sheet.contract_renewal.startsWith("有")} />
                    更新する場合の基準〔{sheet.contract_renewal.replace(/^有[:：]?/, "")}〕
                  </span>
                </p>
                <p className="mt-[2px]">通算契約期間の上限〔　〕年　更新回数の上限〔　〕回</p>
              </Row>
              <Row label="勤務時間">
                <p>
                  始業：{sheet.work_start || "　　"} ／ 終業：{sheet.work_end || "　　"}　1日の所定労働時間（
                  {daily}）
                </p>
                <p className="mt-[2px]">
                  変形労働制は適用されますか？{" "}
                  <Pick label="はい" on={!!sheet.flexible_hours && sheet.flexible_hours !== "なし"} />
                  ・
                  <Pick label="いいえ" on={!sheet.flexible_hours || sheet.flexible_hours === "なし"} />
                  （{sheet.flexible_hours === "なし" ? "" : sheet.flexible_hours}）単位の変形労働制
                </p>
                <p className="mt-[2px]">
                  休憩 {sheet.break_minutes || "　"} 分　残業 <Pick label="有" on={sheet.overtime === "有"} />・
                  <Pick label="無" on={sheet.overtime === "無"} />
                  {sheet.fixed_overtime && `（固定残業代 ${yen(sheet.fixed_overtime)}）`}
                </p>
              </Row>
              <Row label="休日">
                <p>
                  {DAYS.map((d) => (
                    <Pick key={d} label={d} on={sheet.holidays.includes(d)} />
                  ))}
                  　その他（{sheet.holiday_note}）
                </p>
                <p className="mt-[2px] text-[8.5px]">
                  ＊見本となる雇用条件書があれば、コピー頂けると助かります。
                </p>
              </Row>

              <Section title="給与" />
              <Row label="基本給">
                <p>
                  <Pick label="月給" on={posting.wage_kind === "月給"} />・
                  <Pick label="時給" on={posting.wage_kind === "時給"} />　{wage}
                </p>
                {allowances.map((a, i) => (
                  <p key={i} className="mt-[2px]">
                    手当 {a.name} {yen(a.amount)}　計算方法：{a.method}
                  </p>
                ))}
              </Row>
              <Row label="控除内容">
                <p>
                  扶養人数0人として源泉所得税 {yen(sheet.income_tax)}　水道光熱費 約
                  {yen(sheet.utility_cost)}
                  <Pick label="実費" on={sheet.utility_kind === "実費"} />・
                  <Pick label="固定" on={sheet.utility_kind === "固定"} />
                </p>
                <p className="mt-[2px]">
                  <Check label="社会保険料 適用" on={sheet.social_insurance === "適用"} />
                  <span className="ml-3">
                    <Check label="雇用保険料 適用" on={sheet.employment_insurance === "適用"} />
                  </span>
                  <span className="ml-3">通信費 約{yen(sheet.communication_cost)}</span>
                </p>
                <p className="mt-[2px]">
                  居住費 {yen(sheet.housing_cost)}　＜居住費の説明＞
                  <Pick label="自己所有物件" on={sheet.housing_kind === "自己所有物件"} />・
                  <Pick label="賃貸物件" on={sheet.housing_kind === "賃貸物件"} />
                  {sheet.housing_note}
                </p>
                {sheet.deduction_items.length > 0 && (
                  <p className="mt-[2px]">控除項目：{sheet.deduction_items.join("・")}</p>
                )}
              </Row>
              <Row label="昇給・賞与">
                <p>
                  昇給 <Pick label="有" on={sheet.raise === "有"} />・
                  <Pick label="無" on={sheet.raise === "無"} />　支払時期・内容：{sheet.raise_note}
                </p>
                <p className="mt-[2px]">
                  賞与 <Pick label="有" on={sheet.bonus === "有"} />・
                  <Pick label="無" on={sheet.bonus === "無"} />　支払時期・内容：{sheet.bonus_note}
                </p>
              </Row>
              <Row label="給与の支払">
                <p>
                  締切日 {sheet.pay_closing_day || "　　"}　支払日 {sheet.pay_day || "　　"}
                </p>
                <p className="mt-[2px]">
                  支払方法 <Pick label="口座振込" on={sheet.pay_method === "口座振込"} />・
                  <Pick label="通貨払い" on={sheet.pay_method === "通貨払い"} />
                </p>
              </Row>
              <Row label="加入保険">
                <p className="flex flex-wrap gap-x-3">
                  {["健康保険", "厚生年金保険", "労災保険", "雇用保険"].map((n) => (
                    <Check key={n} label={n} on={sheet.insurances.includes(n)} />
                  ))}
                  <span>
                    <Check label="その他（" on={!!sheet.insurance_other} />
                    {sheet.insurance_other}）
                  </span>
                </p>
              </Row>
              <Row label="受動喫煙防止措置の状況">
                <p className="flex flex-wrap gap-x-3">
                  <Check label="屋内禁煙" on={sheet.smoking === "屋内禁煙"} />
                  <Check
                    label="屋内原則禁煙（喫煙室あり）"
                    on={sheet.smoking === "屋内原則禁煙（喫煙室あり）"}
                  />
                </p>
                <p className="mt-[2px] flex flex-wrap gap-x-3">
                  <Check label="敷地内禁煙" on={sheet.smoking === "敷地内禁煙"} />
                  <span>
                    喫煙場所 <Pick label="有" on={sheet.smoking_note.includes("有")} />・
                    <Pick label="無" on={sheet.smoking_note.includes("無")} />
                  </span>
                  <span>
                    <Check label="その他（" on={sheet.smoking === "その他"} />
                    {sheet.smoking === "その他" ? sheet.smoking_note : ""}）
                  </span>
                </p>
              </Row>

              <Section title="応募に必要とされる事項" />
              <Row label="経験の有無">
                <p className="whitespace-pre-wrap">{sheet.experience}</p>
              </Row>
              <Row label="必要条件">
                <p className="whitespace-pre-wrap">
                  N4（技能実習の専門級合格書）・{sheet.requirements}
                </p>
              </Row>
              <Row label="その他">
                <p className="whitespace-pre-wrap">{sheet.other_requirements}</p>
              </Row>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
