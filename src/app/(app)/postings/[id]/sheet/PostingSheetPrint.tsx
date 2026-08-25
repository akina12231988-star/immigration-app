"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { formatAmountInput } from "@/lib/amount-format";
import { dailyWorkHours } from "@/lib/posting-sheet";
import type { PostingSheet } from "@/types/recruiting";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";

// 特定技能１号 求人票。もらったエクセルの様式（A〜H列・41行）をそのまま組んでいる。
// 列幅・行の高さ・セルの結合はエクセルに合わせ、A4縦1枚に収まるように全体を縮めている。

// エクセルの列幅（文字数）→ 表の割合
const COL_WIDTHS = [10.71, 11.86, 11, 8.29, 12.29, 11.86, 8.43, 10];
const TOTAL_W = COL_WIDTHS.reduce((a, b) => a + b, 0);

// エクセルの行の高さ（pt）をA4縦1枚に収まるように縮める倍率
const H = 0.64;
const pt = (h: number) => `${(h * H).toFixed(1)}pt`;

const BORDER = "border border-black";

// 見出しのセル（グレーの帯）
function L({
  children,
  rowSpan,
  colSpan,
  className = "",
}: {
  children?: React.ReactNode;
  rowSpan?: number;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      rowSpan={rowSpan}
      colSpan={colSpan}
      className={`${BORDER} bg-gray-100 px-[2px] text-center align-middle font-bold ${className}`}
    >
      {children}
    </td>
  );
}

// 内容のセル
function C({
  children,
  rowSpan,
  colSpan,
  className = "",
}: {
  children?: React.ReactNode;
  rowSpan?: number;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      rowSpan={rowSpan}
      colSpan={colSpan}
      className={`${BORDER} px-[3px] align-middle ${className}`}
    >
      {children}
    </td>
  );
}

// 区分の帯（企業情報・求人情報詳細・給与・応募に必要とされる事項）
function Band({ children }: { children: React.ReactNode }) {
  return (
    <td colSpan={8} className={`${BORDER} bg-gray-200 px-[3px] align-middle font-black`}>
      {children}
    </td>
  );
}

// 選んだ方に丸を付ける（手書きで丸を付けた様式と同じ見え方）
function P({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={
        on ? "inline-block rounded-full border border-black px-[3px] font-bold leading-none" : ""
      }
    >
      {label}
    </span>
  );
}

// チェック欄（□ / ☑）
function K({ label, on }: { label: string; on: boolean }) {
  return (
    <span className="whitespace-nowrap">
      {on ? "☑" : "□"}
      {label}
    </span>
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
    posting.wage_amount != null ? `${formatAmountInput(String(posting.wage_amount))}円` : "";
  const daily =
    sheet.daily_hours || dailyWorkHours(sheet.work_start, sheet.work_end, sheet.break_minutes);
  const a1 = sheet.allowances[0];
  const a2 = sheet.allowances[1];
  const noTerm = sheet.contract_term_kind === "期間の定めなし";
  const hasTerm = sheet.contract_term_kind === "期間の定めあり";
  const renewNo = sheet.contract_renewal.startsWith("無");
  const renewYes = sheet.contract_renewal.startsWith("有");
  const flexible = !!sheet.flexible_hours && sheet.flexible_hours !== "なし";
  const holidayDays = ["月", "火", "水", "木", "金", "土", "日", "祝祭日"];

  return (
    <>
      <style>{"@media print{@page{size:A4 portrait;margin:8mm}}"}</style>

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
            エクセルの様式と同じ形にしています。求人の登録内容が入り、空いている欄は空欄のまま出ます
            （そのまま会社に書いてもらう用紙としても使えます）。直すときは求人の画面から編集してください。
          </span>
        </div>
      </div>

      <div className="px-4 pb-6 lg:px-8 print:p-0">
        <div className="mx-auto max-w-[180mm] bg-white text-black">
          <table
            className="w-full table-fixed border-collapse text-[7pt] leading-tight"
            style={{ borderColor: "#000" }}
          >
            <colgroup>
              {COL_WIDTHS.map((w, i) => (
                <col key={i} style={{ width: `${((w / TOTAL_W) * 100).toFixed(2)}%` }} />
              ))}
            </colgroup>
            <tbody>
              {/* 1: 表題 */}
              <tr style={{ height: pt(41) }}>
                <td colSpan={8} className="px-1 text-center text-[13pt] font-black">
                  特定技能１号　求人票
                </td>
              </tr>
              {/* 3: 受付日 */}
              <tr style={{ height: pt(27) }}>
                <td colSpan={5} />
                <L>受付日</L>
                <C colSpan={2}>{posting.received_on}</C>
              </tr>
              {/* 4: 受付番号 */}
              <tr style={{ height: pt(27) }}>
                <td colSpan={5} />
                <L>受付番号</L>
                <C colSpan={2}>{posting.acceptance_no}</C>
              </tr>
              {/* 5: 記入日 ／ 職業安定法 */}
              <tr style={{ height: pt(24) }}>
                <L>記入日</L>
                <C colSpan={2}>{sheet.filled_on || "年　　　月　　　日"}</C>
                <td colSpan={5} className="px-1 align-middle">
                  　職業安定法第5条の3により、この書面にて労働条件等を明示します。
                </td>
              </tr>
              {/* 6: 企業情報 */}
              <tr style={{ height: pt(29) }}>
                <Band>企業情報</Band>
              </tr>
              {/* 7: 求人者名・分野名 */}
              <tr style={{ height: pt(39) }}>
                <L>求人者名　（会社名）</L>
                <C colSpan={3} className="font-bold">
                  {orgName}
                </C>
                <L>分野名</L>
                <C colSpan={3}>{sheet.field_name}</C>
              </tr>
              {/* 8: 所在地 */}
              <tr style={{ height: pt(44) }}>
                <L>所在地</L>
                <C colSpan={7}>
                  <span>{orgAddress}</span>
                  <span className="ml-6">TEL: {orgContact}</span>
                </C>
              </tr>
              {/* 9-12: 勤務地 */}
              <tr style={{ height: pt(29) }}>
                <L rowSpan={4}>勤務地</L>
                <C colSpan={7}>（雇入れ直後）</C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C colSpan={7}>{posting.work_location}</C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C colSpan={7}>
                  （変更の可能性がある場合記入）
                  <K label="変更なし" on={sheet.work_location_change === "変更なし"} />
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C colSpan={7}>
                  {sheet.work_location_change !== "変更なし" ? sheet.work_location_change : ""}
                </C>
              </tr>
              {/* 13: 求人情報詳細 */}
              <tr style={{ height: pt(29) }}>
                <Band>求人情報詳細</Band>
              </tr>
              {/* 14: 職種・採用人数 */}
              <tr style={{ height: pt(32) }}>
                <L>職種</L>
                <C colSpan={3}>{posting.job_type}</C>
                <L>採用人数</L>
                <C colSpan={3}>　{posting.openings}　人</C>
              </tr>
              {/* 15: 仕事内容 */}
              <tr style={{ height: pt(32) }}>
                <L>仕事内容</L>
                <C colSpan={7} className="whitespace-pre-wrap">
                  {sheet.job_description}
                </C>
              </tr>
              {/* 16-17: 契約期間 */}
              <tr style={{ height: pt(24) }}>
                <L rowSpan={2}>契約期間</L>
                <C colSpan={7}>
                  <K label="　期間の定めなし" on={noTerm} />
                </C>
              </tr>
              <tr style={{ height: pt(69) }}>
                <C colSpan={7}>
                  <p>
                    <K label="　期間の定めあり：雇用契約期間" on={hasTerm} />（
                    {sheet.contract_term || posting.employment_period}）
                  </p>
                  <p>
                    　　契約の更新　<K label="　無" on={renewNo} />
                  </p>
                  <p>
                    　　　　　　　　<K label="　有：" on={renewYes} />
                    {sheet.contract_renewal.replace(/^有[:：]?/, "")}
                  </p>
                </C>
              </tr>
              {/* 18-19: 勤務時間 */}
              <tr style={{ height: pt(29) }}>
                <L rowSpan={2}>勤務時間</L>
                <C colSpan={7}>
                  　始業：{sheet.work_start || "　　　"}　/　終業:{sheet.work_end || "　　　"}
                　1日の所定労働時間（{daily || "　　　"}）
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C colSpan={7}>
                  変形労働制は適用されますか？　<P label="はい" on={flexible} />　・
                  <P label="いいえ" on={!flexible} />　（
                  {flexible ? sheet.flexible_hours : ""}）単位の変形労働制
                </C>
              </tr>
              {/* 20: 休憩・残業 */}
              <tr style={{ height: pt(29) }}>
                <L>休憩</L>
                <C colSpan={2}>　{sheet.break_minutes}　分</C>
                <L colSpan={2}>残業</L>
                <C colSpan={3}>
                  <P label="有" on={sheet.overtime === "有"} />　・
                  <P label="無" on={sheet.overtime === "無"} />
                  {sheet.fixed_overtime && `（固定残業代 ${yen(sheet.fixed_overtime)}）`}
                </C>
              </tr>
              {/* 21: 休日 */}
              <tr style={{ height: pt(29) }}>
                <L>休日</L>
                <C colSpan={7}>
                  {holidayDays.map((d, i) => (
                    <span key={d}>
                      {i > 0 && "・"}
                      <P label={d} on={sheet.holidays.includes(d)} />
                    </span>
                  ))}
                  　その他（{sheet.holiday_note}）
                </C>
              </tr>
              {/* 22 */}
              <tr style={{ height: pt(29) }}>
                <td colSpan={8} className={`${BORDER} px-1 align-middle`}>
                  ＊見本となる雇用条件書があれば、コピー頂けると助かります。
                </td>
              </tr>
              {/* 23: 給与 */}
              <tr style={{ height: pt(29) }}>
                <Band>給与</Band>
              </tr>
              {/* 24-26: 基本給・手当 */}
              <tr style={{ height: pt(29) }}>
                <L rowSpan={3}>基本給</L>
                <C colSpan={2}>
                  <P label="月給" on={posting.wage_kind === "月給"} />　・
                  <P label="時給" on={posting.wage_kind === "時給"} />
                </C>
                <C colSpan={5}>　{wage}</C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C colSpan={2}>　{a1?.name ?? ""}　手当</C>
                <C colSpan={2}>{yen(a1?.amount ?? "") || "円"}</C>
                <C colSpan={3}>計算方法：{a1?.method ?? ""}</C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C colSpan={2}>　{a2?.name ?? ""}　手当</C>
                <C colSpan={2}>{yen(a2?.amount ?? "") || "円"}</C>
                <C colSpan={3}>計算方法：{a2?.method ?? ""}</C>
              </tr>
              {/* 27-31: 控除内容 */}
              <tr style={{ height: pt(29) }}>
                <L rowSpan={5}>控除内容</L>
                <C>源泉所得税</C>
                <C colSpan={2}>{yen(sheet.income_tax) || "円"}</C>
                <C>扶養人数　0人として</C>
                <C>水道光熱費</C>
                <C colSpan={2}>約　{yen(sheet.utility_cost)}</C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C>社会保険料</C>
                <C colSpan={3}>
                  <K label="適用" on={sheet.social_insurance === "適用"} />
                </C>
                <C colSpan={3}>
                  <P label="実費" on={sheet.utility_kind === "実費"} />　・
                  <P label="固定" on={sheet.utility_kind === "固定"} />
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C>雇用保険料</C>
                <C colSpan={3}>
                  <K label="適用" on={sheet.employment_insurance === "適用"} />
                </C>
                <C>通信費</C>
                <C colSpan={2}>約　{yen(sheet.communication_cost)}</C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C rowSpan={2}>居住費</C>
                <C colSpan={2} rowSpan={2}>
                  {yen(sheet.housing_cost) || "円"}
                </C>
                <C colSpan={4} rowSpan={2}>
                  ＜居住費の説明＞
                  <P label="自己所有物件" on={sheet.housing_kind === "自己所有物件"} />　・
                  <P label="賃貸物件" on={sheet.housing_kind === "賃貸物件"} />
                  {sheet.housing_note && <span className="ml-1">{sheet.housing_note}</span>}
                </C>
              </tr>
              <tr style={{ height: pt(29) }} />
              {/* 32: 昇給 */}
              <tr style={{ height: pt(29) }}>
                <L>昇給</L>
                <C>
                  <P label="有" on={sheet.raise === "有"} />　・
                  <P label="無" on={sheet.raise === "無"} />
                </C>
                <C colSpan={6}>支払時期・内容：{sheet.raise_note}</C>
              </tr>
              {/* 33: 賞与 */}
              <tr style={{ height: pt(29) }}>
                <L>賞与</L>
                <C>
                  <P label="有" on={sheet.bonus === "有"} />　・
                  <P label="無" on={sheet.bonus === "無"} />
                </C>
                <C colSpan={6}>支払時期・内容：{sheet.bonus_note}</C>
              </tr>
              {/* 34: 給与（締切日・支払日） */}
              <tr style={{ height: pt(30) }}>
                <L>給与</L>
                <C>締切日</C>
                <C>{sheet.pay_closing_day}</C>
                <C>日</C>
                <C>支払日</C>
                <C>{sheet.pay_day}</C>
                <C colSpan={2}>日</C>
              </tr>
              {/* 35: 支払方法 */}
              <tr style={{ height: pt(30) }}>
                <L>支払方法</L>
                <C colSpan={7}>
                  <P label="口座振込" on={sheet.pay_method === "口座振込"} />　　　・
                  <P label="通貨払い" on={sheet.pay_method === "通貨払い"} />
                </C>
              </tr>
              {/* 36: 加入保険 */}
              <tr style={{ height: pt(29) }}>
                <L>加入保険</L>
                <C colSpan={7}>
                  {["健康保険", "厚生年金保険", "労災保険", "雇用保険"].map((n) => (
                    <span key={n} className="mr-3">
                      <K label={n} on={sheet.insurances.includes(n)} />
                    </span>
                  ))}
                  <K label="その他" on={!!sheet.insurance_other} />（{sheet.insurance_other}）
                </C>
              </tr>
              {/* 37: 受動喫煙防止措置の状況 */}
              <tr style={{ height: pt(47) }}>
                <L colSpan={2}>受動喫煙防止措置の状況</L>
                <C colSpan={6}>
                  <span className="mr-3">
                    <K label="屋内禁煙" on={sheet.smoking === "屋内禁煙"} />
                  </span>
                  <span className="mr-3">
                    <K
                      label="屋内原則禁煙（喫煙室あり）"
                      on={sheet.smoking === "屋内原則禁煙（喫煙室あり）"}
                    />
                  </span>
                  <span className="mr-3">
                    <K label="敷地内禁煙（喫煙場所　" on={sheet.smoking === "敷地内禁煙"} />
                    <P label="有" on={sheet.smoking === "敷地内禁煙" && sheet.smoking_note.includes("有")} />
                    ・
                    <P label="無" on={sheet.smoking === "敷地内禁煙" && sheet.smoking_note.includes("無")} />）
                  </span>
                  <K label="その他" on={sheet.smoking === "その他"} />（
                  {sheet.smoking === "その他" ? sheet.smoking_note : ""}）
                </C>
              </tr>
              {/* 38: 応募に必要とされる事項 */}
              <tr style={{ height: pt(24) }}>
                <Band>応募に必要とされる事項</Band>
              </tr>
              {/* 39: 経験の有無 */}
              <tr style={{ height: pt(29) }}>
                <L>経験の有無</L>
                <C colSpan={7} className="whitespace-pre-wrap">
                  {sheet.experience}
                </C>
              </tr>
              {/* 40: 必要条件 */}
              <tr style={{ height: pt(29) }}>
                <L>必要条件</L>
                <C colSpan={7} className="whitespace-pre-wrap">
                  N4（技能実習の専門級合格書）・{sheet.requirements}
                </C>
              </tr>
              {/* 41: その他 */}
              <tr style={{ height: pt(39) }}>
                <L>その他</L>
                <C colSpan={7} className="whitespace-pre-wrap">
                  {sheet.other_requirements}
                </C>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
