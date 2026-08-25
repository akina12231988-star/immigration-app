"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Save } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { createClient } from "@/lib/supabase/client";
import { updatePosting } from "@/lib/supabase/queries/postings";
import { formatAmountInput, stripAmountCommas } from "@/lib/amount-format";
import { dailyWorkHours, emptyPostingAllowance } from "@/lib/posting-sheet";
import type { PostingSheet, WageKind } from "@/types/recruiting";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";

// 特定技能１号 求人票。もらったエクセルの様式（A〜H列・41行）をそのまま組んでいる。
// 列幅・行の高さ・セルの結合はエクセルに合わせ、A4縦1枚に収まるように全体を縮めている。
//
// 画面の上でそのまま書き込める（欄をクリックして入力・選ぶところは押すと丸が付く）。
// 「保存」で求人に書き戻すので、直してからそのまま印刷できる。

const COL_WIDTHS = [10.71, 11.86, 11, 8.29, 12.29, 11.86, 8.43, 10];
const TOTAL_W = COL_WIDTHS.reduce((a, b) => a + b, 0);

// エクセルの行の高さ（pt）をA4縦1枚に収まるように縮める倍率。
// 全41行の高さの合計は 1225pt なので、0.60 倍で約259mm。
// A4縦（297mm）から上下の余白6mmずつを引いた285mmに収まる
const H = 0.6;
const pt = (h: number) => `${(h * H).toFixed(1)}pt`;

// 読み取りだけの人（閲覧者）には入力欄を出さず、文字のまま見せる
const EditCtx = createContext(false);

const BORDER = "border border-black";
// 画面では点線で「ここに書ける」と分かるようにし、印刷では消す
const FIELD =
  "w-full min-w-0 bg-transparent px-[2px] outline-none border-b border-dashed border-gray-300 focus:bg-yellow-100 print:border-0 print:bg-transparent";

// 入力欄。読み取り専用のときはそのまま文字で出す。
// 画面の作り直しで文字を打つ途中に欄が外れないよう、部品はこの場所に置いている
function F({
  value,
  onChange,
  type = "text",
  className = "",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date";
  className?: string;
  placeholder?: string;
}) {
  const canEdit = useContext(EditCtx);
  if (!canEdit) return <span className={className}>{value}</span>;
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${FIELD} ${className}`}
    />
  );
}

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

function Band({ children }: { children: React.ReactNode }) {
  return (
    <td colSpan={8} className={`${BORDER} bg-gray-200 px-[3px] align-middle font-black`}>
      {children}
    </td>
  );
}

// 選ぶ欄（押すと丸が付く。もう一度押すと外れる）
function Pick({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  const canEdit = useContext(EditCtx);
  // pick-on … 印刷のときも丸を残すための目印（下の印刷用の指定で使う）
  const className = on
    ? "pick-on rounded-full border border-black px-[3px] font-bold leading-none"
    : "px-[3px] leading-none text-gray-500 print:text-black";
  if (!canEdit) return <span className={className}>{label}</span>;
  return (
    <button type="button" onClick={onClick} className={className}>
      {label}
    </button>
  );
}

// チェック欄（押すと □ ⇄ ☑）
function Check({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  const canEdit = useContext(EditCtx);
  const body = (
    <>
      {on ? "☑" : "□"}
      {label}
    </>
  );
  if (!canEdit) return <span className="whitespace-nowrap">{body}</span>;
  return (
    <button type="button" onClick={onClick} className="whitespace-nowrap">
      {body}
    </button>
  );
}

const HOLIDAYS = ["月", "火", "水", "木", "金", "土", "日", "祝祭日"];
const INSURANCES = ["健康保険", "厚生年金保険", "労災保険", "雇用保険"];

export function PostingSheetPrint({
  posting,
  sheet: initialSheet,
  orgName,
  orgAddress,
  orgContact,
  canEdit,
}: {
  posting: PostingWithStats;
  sheet: PostingSheet;
  orgName: string;
  orgAddress: string;
  orgContact: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<PostingSheet>(initialSheet);
  // 求人そのものの項目（受付日・受理番号・職種・採用人数・就業場所・賃金・連絡先）
  const [top, setTop] = useState({
    received_on: posting.received_on ?? "",
    acceptance_no: posting.acceptance_no ?? "",
    job_type: posting.job_type ?? "",
    openings: String(posting.openings ?? ""),
    work_location: posting.work_location ?? "",
    wage_kind: (posting.wage_kind ?? "時給") as WageKind,
    wage_amount: posting.wage_amount != null ? String(posting.wage_amount) : "",
    contact: orgContact,
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof PostingSheet>(key: K, value: PostingSheet[K]) => {
    setSheet((s) => ({ ...s, [key]: value }));
    setDirty(true);
    setMessage(null);
  };
  const setTopField = <K extends keyof typeof top>(key: K, value: (typeof top)[K]) => {
    setTop((t) => ({ ...t, [key]: value }));
    setDirty(true);
    setMessage(null);
  };
  // 選ぶ欄。同じものを押したら外す
  const pick = <K extends keyof PostingSheet>(key: K, value: string) =>
    set(key, (sheet[key] === value ? "" : value) as PostingSheet[K]);
  const toggleIn = (key: "holidays" | "insurances", value: string) =>
    set(
      key,
      sheet[key].includes(value) ? sheet[key].filter((v) => v !== value) : [...sheet[key], value],
    );
  const setAllowance = (i: number, patch: Partial<PostingSheet["allowances"][number]>) => {
    const list = [...sheet.allowances];
    while (list.length <= i) list.push(emptyPostingAllowance());
    list[i] = { ...list[i], ...patch };
    set("allowances", list);
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await updatePosting(createClient(), posting.id, {
        received_on: top.received_on,
        acceptance_no: top.acceptance_no,
        job_type: top.job_type,
        openings: Number(stripAmountCommas(top.openings).replace(/[^0-9]/g, "")) || 0,
        work_location: top.work_location,
        wage_kind: top.wage_kind,
        wage_amount: top.wage_amount
          ? Number(stripAmountCommas(top.wage_amount).replace(/[^0-9]/g, "")) || null
          : null,
        contact: top.contact,
        sheet,
      });
      setDirty(false);
      setMessage({ ok: true, text: "保存しました。このまま印刷できます。" });
      router.refresh();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "保存に失敗しました",
      });
    } finally {
      setBusy(false);
    }
  };

  const daily =
    sheet.daily_hours || dailyWorkHours(sheet.work_start, sheet.work_end, sheet.break_minutes);

  return (
    <EditCtx.Provider value={canEdit}>
      <style>{
        "@media print{@page{size:A4 portrait;margin:6mm}" +
        // 入力欄の枠・背景は消して、紙の上では文字だけが見えるようにする
        "input,select,textarea,button{border:0!important;background:transparent!important;" +
        "color:#000!important;padding:0!important;line-height:1.1!important;" +
        "-webkit-appearance:none!important;appearance:none!important}" +
        // 選んだところの丸は残す（上の指定より後に書いて打ち消す）
        ".pick-on{border:1px solid #000!important;border-radius:9999px!important;" +
        "padding:0 3px!important}" +
        "input[type=date]::-webkit-calendar-picker-indicator{display:none}" +
        // 行の途中で改ページさせない（1枚に収める）
        "tr{break-inside:avoid;page-break-inside:avoid}" +
        ".sheet-paper{max-width:none!important;width:100%!important}}"
      }</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={`/postings/${posting.id}`} />
          <h1 className="flex-1 text-lg font-bold">特定技能1号 求人票</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-8">
          {canEdit && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-50"
            >
              <Save size={18} />
              {busy ? "保存中…" : dirty ? "保存する" : "保存済み"}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-brand px-5 text-sm font-bold text-brand"
          >
            <Printer size={18} />
            印刷・PDF保存（A4縦）
          </button>
          {dirty && (
            <span className="text-[11px] font-bold text-seal">
              保存されていない変更があります（先に保存してから印刷してください）
            </span>
          )}
          <span className="text-[11px] leading-relaxed text-muted">
            この様式の上でそのまま書けます。点線の欄は入力、「月給・時給」「有・無」などは押すと丸が付き、□は押すと☑になります。
            選んだ丸と☑は印刷にもそのまま出ます。A4縦1枚に収まるので、印刷の設定は用紙「A4」・向き「縦」・
            余白「既定」・拡大縮小「100%（または用紙に合わせる）」にしてください。
            会社名・所在地は所属機関の登録内容です（直すときは会社・機関マスタから）。
          </span>
        </div>
        {message && (
          <p
            role="status"
            className={`mx-4 mb-3 rounded-lg px-3 py-2 text-xs lg:mx-8 ${
              message.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      <div className="px-4 pb-6 lg:px-8 print:p-0">
        <div className="sheet-paper mx-auto max-w-[180mm] bg-white text-black">
          <table className="w-full table-fixed border-collapse text-[7pt] leading-tight">
            <colgroup>
              {COL_WIDTHS.map((w, i) => (
                <col key={i} style={{ width: `${((w / TOTAL_W) * 100).toFixed(2)}%` }} />
              ))}
            </colgroup>
            <tbody>
              <tr style={{ height: pt(41) }}>
                <td colSpan={8} className="px-1 text-center text-[13pt] font-black">
                  特定技能１号　求人票
                </td>
              </tr>
              <tr style={{ height: pt(27) }}>
                <td colSpan={5} />
                <L>受付日</L>
                <C colSpan={2}>
                  <F
                    type="date"
                    value={top.received_on}
                    onChange={(v) => setTopField("received_on", v)}
                  />
                </C>
              </tr>
              <tr style={{ height: pt(27) }}>
                <td colSpan={5} />
                <L>受付番号</L>
                <C colSpan={2}>
                  <F
                    value={top.acceptance_no}
                    onChange={(v) => setTopField("acceptance_no", v)}
                  />
                </C>
              </tr>
              <tr style={{ height: pt(24) }}>
                <L>記入日</L>
                <C colSpan={2}>
                  <F type="date" value={sheet.filled_on} onChange={(v) => set("filled_on", v)} />
                </C>
                <td colSpan={5} className="px-1 align-middle">
                  　職業安定法第5条の3により、この書面にて労働条件等を明示します。
                </td>
              </tr>

              <tr style={{ height: pt(29) }}>
                <Band>企業情報</Band>
              </tr>
              <tr style={{ height: pt(39) }}>
                <L>求人者名　（会社名）</L>
                <C colSpan={3} className="font-bold">
                  {orgName}
                </C>
                <L>分野名</L>
                <C colSpan={3}>
                  <F value={sheet.field_name} onChange={(v) => set("field_name", v)} />
                </C>
              </tr>
              <tr style={{ height: pt(44) }}>
                <L>所在地</L>
                <C colSpan={7}>
                  <span className="mr-4">{orgAddress}</span>
                  <span className="inline-flex w-[45mm] items-center">
                    TEL:
                    <F value={top.contact} onChange={(v) => setTopField("contact", v)} />
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <L rowSpan={4}>勤務地</L>
                <C colSpan={7}>（雇入れ直後）</C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C colSpan={7}>
                  <F
                    value={top.work_location}
                    onChange={(v) => setTopField("work_location", v)}
                  />
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C colSpan={7}>
                  （変更の可能性がある場合記入）
                  <Check
                    label="変更なし"
                    on={sheet.work_location_change === "変更なし"}
                    onClick={() =>
                      set(
                        "work_location_change",
                        sheet.work_location_change === "変更なし" ? "" : "変更なし",
                      )
                    }
                  />
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C colSpan={7}>
                  <F
                    value={sheet.work_location_change === "変更なし" ? "" : sheet.work_location_change}
                    onChange={(v) => set("work_location_change", v)}
                    placeholder="変更の可能性がある場合の内容"
                  />
                </C>
              </tr>

              <tr style={{ height: pt(29) }}>
                <Band>求人情報詳細</Band>
              </tr>
              <tr style={{ height: pt(32) }}>
                <L>職種</L>
                <C colSpan={3}>
                  <F value={top.job_type} onChange={(v) => setTopField("job_type", v)} />
                </C>
                <L>採用人数</L>
                <C colSpan={3}>
                  <span className="flex items-center gap-1">
                    <F
                      value={top.openings}
                      onChange={(v) => setTopField("openings", v.replace(/[^0-9]/g, ""))}
                      className="w-[10mm]"
                    />
                    人
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(32) }}>
                <L>仕事内容</L>
                <C colSpan={7}>
                  <F
                    value={sheet.job_description}
                    onChange={(v) => set("job_description", v)}
                  />
                </C>
              </tr>
              <tr style={{ height: pt(24) }}>
                <L rowSpan={2}>契約期間</L>
                <C colSpan={7}>
                  <Check
                    label="　期間の定めなし"
                    on={sheet.contract_term_kind === "期間の定めなし"}
                    onClick={() => set("contract_term_kind", "期間の定めなし")}
                  />
                </C>
              </tr>
              <tr style={{ height: pt(69) }}>
                <C colSpan={7}>
                  <p className="flex items-center">
                    <Check
                      label="　期間の定めあり：雇用契約期間（"
                      on={sheet.contract_term_kind === "期間の定めあり"}
                      onClick={() => set("contract_term_kind", "期間の定めあり")}
                    />
                    <span className="inline-block w-[40mm]">
                      <F value={sheet.contract_term} onChange={(v) => set("contract_term", v)} />
                    </span>
                    ）
                  </p>
                  <p>
                    　　契約の更新
                    <Check
                      label="　無"
                      on={sheet.contract_renewal.startsWith("無")}
                      onClick={() => set("contract_renewal", "無")}
                    />
                  </p>
                  <p className="flex items-center">

                    <Check
                      label="　有："
                      on={sheet.contract_renewal.startsWith("有")}
                      onClick={() => set("contract_renewal", "有：")}
                    />
                    <span className="inline-block flex-1">
                      <F
                        value={sheet.contract_renewal.replace(/^[有無][:：]?/, "")}
                        onChange={(v) => set("contract_renewal", `有：${v}`)}
                        placeholder="更新する場合の基準"
                      />
                    </span>
                  </p>
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <L rowSpan={2}>勤務時間</L>
                <C colSpan={7}>
                  <span className="flex items-center gap-1">
                    始業：
                    <span className="w-[14mm]">
                      <F value={sheet.work_start} onChange={(v) => set("work_start", v)} />
                    </span>
                    ／　終業:
                    <span className="w-[14mm]">
                      <F value={sheet.work_end} onChange={(v) => set("work_end", v)} />
                    </span>
                    　1日の所定労働時間（
                    <span className="w-[20mm]">
                      <F
                        value={sheet.daily_hours || daily}
                        onChange={(v) => set("daily_hours", v)}
                      />
                    </span>
                    ）
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C colSpan={7}>
                  <span className="flex items-center gap-1">
                    変形労働制は適用されますか？
                    <Pick
                      label="はい"
                      on={!!sheet.flexible_hours && sheet.flexible_hours !== "なし"}
                      onClick={() => set("flexible_hours", "1ヶ月単位の変形労働制")}
                    />
                    ・
                    <Pick
                      label="いいえ"
                      on={!sheet.flexible_hours || sheet.flexible_hours === "なし"}
                      onClick={() => set("flexible_hours", "なし")}
                    />
                    （
                    <span className="w-[30mm]">
                      <F
                        value={sheet.flexible_hours === "なし" ? "" : sheet.flexible_hours}
                        onChange={(v) => set("flexible_hours", v)}
                      />
                    </span>
                    ）単位の変形労働制
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <L>休憩</L>
                <C colSpan={2}>
                  <span className="flex items-center gap-1">
                    <span className="w-[12mm]">
                      <F
                        value={sheet.break_minutes}
                        onChange={(v) => set("break_minutes", v.replace(/[^0-9]/g, ""))}
                      />
                    </span>
                    分
                  </span>
                </C>
                <L colSpan={2}>残業</L>
                <C colSpan={3}>
                  <Pick label="有" on={sheet.overtime === "有"} onClick={() => pick("overtime", "有")} />
                  ・
                  <Pick label="無" on={sheet.overtime === "無"} onClick={() => pick("overtime", "無")} />
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <L>休日</L>
                <C colSpan={7}>
                  <span className="flex flex-wrap items-center">
                    {HOLIDAYS.map((d, i) => (
                      <span key={d}>
                        {i > 0 && "・"}
                        <Pick
                          label={d}
                          on={sheet.holidays.includes(d)}
                          onClick={() => toggleIn("holidays", d)}
                        />
                      </span>
                    ))}
                    　その他（
                    <span className="w-[35mm]">
                      <F value={sheet.holiday_note} onChange={(v) => set("holiday_note", v)} />
                    </span>
                    ）
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <td colSpan={8} className={`${BORDER} px-1 align-middle`}>
                  ＊見本となる雇用条件書があれば、コピー頂けると助かります。
                </td>
              </tr>

              <tr style={{ height: pt(29) }}>
                <Band>給与</Band>
              </tr>
              <tr style={{ height: pt(29) }}>
                <L rowSpan={3}>基本給</L>
                <C colSpan={2}>
                  <Pick
                    label="月給"
                    on={top.wage_kind === "月給"}
                    onClick={() => setTopField("wage_kind", "月給")}
                  />
                  ・
                  <Pick
                    label="時給"
                    on={top.wage_kind === "時給"}
                    onClick={() => setTopField("wage_kind", "時給")}
                  />
                </C>
                <C colSpan={5}>
                  <span className="flex items-center gap-1">
                    <span className="w-[25mm]">
                      <F
                        value={formatAmountInput(top.wage_amount)}
                        onChange={(v) => setTopField("wage_amount", stripAmountCommas(v))}
                      />
                    </span>
                    円
                  </span>
                </C>
              </tr>
              {[0, 1].map((i) => (
                <tr key={i} style={{ height: pt(29) }}>
                  <C colSpan={2}>
                    <span className="flex items-center gap-1">
                      <F
                        value={sheet.allowances[i]?.name ?? ""}
                        onChange={(v) => setAllowance(i, { name: v })}
                      />
                      手当
                    </span>
                  </C>
                  <C colSpan={2}>
                    <span className="flex items-center gap-1">
                      <F
                        value={formatAmountInput(sheet.allowances[i]?.amount ?? "")}
                        onChange={(v) => setAllowance(i, { amount: formatAmountInput(v) })}
                      />
                      円
                    </span>
                  </C>
                  <C colSpan={3}>
                    <span className="flex items-center">
                      計算方法：
                      <F
                        value={sheet.allowances[i]?.method ?? ""}
                        onChange={(v) => setAllowance(i, { method: v })}
                      />
                    </span>
                  </C>
                </tr>
              ))}
              <tr style={{ height: pt(29) }}>
                <L rowSpan={5}>控除内容</L>
                <C>源泉所得税</C>
                <C colSpan={2}>
                  <span className="flex items-center gap-1">
                    <F
                      value={formatAmountInput(sheet.income_tax)}
                      onChange={(v) => set("income_tax", formatAmountInput(v))}
                    />
                    円
                  </span>
                </C>
                <C>扶養人数　0人として</C>
                <C>水道光熱費</C>
                <C colSpan={2}>
                  <span className="flex items-center gap-1">
                    約
                    <F
                      value={formatAmountInput(sheet.utility_cost)}
                      onChange={(v) => set("utility_cost", formatAmountInput(v))}
                    />
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C>社会保険料</C>
                <C colSpan={3}>
                  <Check
                    label="適用"
                    on={sheet.social_insurance === "適用"}
                    onClick={() =>
                      set("social_insurance", sheet.social_insurance === "適用" ? "" : "適用")
                    }
                  />
                </C>
                <C colSpan={3}>
                  <Pick
                    label="実費"
                    on={sheet.utility_kind === "実費"}
                    onClick={() => pick("utility_kind", "実費")}
                  />
                  ・
                  <Pick
                    label="固定"
                    on={sheet.utility_kind === "固定"}
                    onClick={() => pick("utility_kind", "固定")}
                  />
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C>雇用保険料</C>
                <C colSpan={3}>
                  <Check
                    label="適用"
                    on={sheet.employment_insurance === "適用"}
                    onClick={() =>
                      set(
                        "employment_insurance",
                        sheet.employment_insurance === "適用" ? "" : "適用",
                      )
                    }
                  />
                </C>
                <C>通信費</C>
                <C colSpan={2}>
                  <span className="flex items-center gap-1">
                    約
                    <F
                      value={formatAmountInput(sheet.communication_cost)}
                      onChange={(v) => set("communication_cost", formatAmountInput(v))}
                    />
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <C rowSpan={2}>居住費</C>
                <C colSpan={2} rowSpan={2}>
                  <span className="flex items-center gap-1">
                    <F
                      value={formatAmountInput(sheet.housing_cost)}
                      onChange={(v) => set("housing_cost", formatAmountInput(v))}
                    />
                    円
                  </span>
                </C>
                <C colSpan={4} rowSpan={2}>
                  <span className="flex flex-wrap items-center">
                    ＜居住費の説明＞
                    <Pick
                      label="自己所有物件"
                      on={sheet.housing_kind === "自己所有物件"}
                      onClick={() => pick("housing_kind", "自己所有物件")}
                    />
                    ・
                    <Pick
                      label="賃貸物件"
                      on={sheet.housing_kind === "賃貸物件"}
                      onClick={() => pick("housing_kind", "賃貸物件")}
                    />
                    <span className="ml-1 min-w-[30mm] flex-1">
                      <F value={sheet.housing_note} onChange={(v) => set("housing_note", v)} />
                    </span>
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(29) }} />
              <tr style={{ height: pt(29) }}>
                <L>昇給</L>
                <C>
                  <Pick label="有" on={sheet.raise === "有"} onClick={() => pick("raise", "有")} />・
                  <Pick label="無" on={sheet.raise === "無"} onClick={() => pick("raise", "無")} />
                </C>
                <C colSpan={6}>
                  <span className="flex items-center">
                    支払時期・内容：
                    <F value={sheet.raise_note} onChange={(v) => set("raise_note", v)} />
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <L>賞与</L>
                <C>
                  <Pick label="有" on={sheet.bonus === "有"} onClick={() => pick("bonus", "有")} />・
                  <Pick label="無" on={sheet.bonus === "無"} onClick={() => pick("bonus", "無")} />
                </C>
                <C colSpan={6}>
                  <span className="flex items-center">
                    支払時期・内容：
                    <F value={sheet.bonus_note} onChange={(v) => set("bonus_note", v)} />
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(30) }}>
                <L>給与</L>
                <C>締切日</C>
                <C>
                  <F
                    value={sheet.pay_closing_day}
                    onChange={(v) => set("pay_closing_day", v)}
                  />
                </C>
                <C>日</C>
                <C>支払日</C>
                <C>
                  <F value={sheet.pay_day} onChange={(v) => set("pay_day", v)} />
                </C>
                <C colSpan={2}>日</C>
              </tr>
              <tr style={{ height: pt(30) }}>
                <L>支払方法</L>
                <C colSpan={7}>
                  <Pick
                    label="口座振込"
                    on={sheet.pay_method === "口座振込"}
                    onClick={() => pick("pay_method", "口座振込")}
                  />
                  　　　・
                  <Pick
                    label="通貨払い"
                    on={sheet.pay_method === "通貨払い"}
                    onClick={() => pick("pay_method", "通貨払い")}
                  />
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <L>加入保険</L>
                <C colSpan={7}>
                  <span className="flex flex-wrap items-center gap-x-3">
                    {INSURANCES.map((n) => (
                      <Check
                        key={n}
                        label={n}
                        on={sheet.insurances.includes(n)}
                        onClick={() => toggleIn("insurances", n)}
                      />
                    ))}
                    <span className="flex items-center">
                      <Check
                        label="その他（"
                        on={!!sheet.insurance_other}
                        onClick={() => set("insurance_other", sheet.insurance_other ? "" : "　")}
                      />
                      <span className="w-[25mm]">
                        <F
                          value={sheet.insurance_other}
                          onChange={(v) => set("insurance_other", v)}
                        />
                      </span>
                      ）
                    </span>
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(47) }}>
                <L colSpan={2}>受動喫煙防止措置の状況</L>
                <C colSpan={6}>
                  <span className="flex flex-wrap items-center gap-x-3">
                    <Check
                      label="屋内禁煙"
                      on={sheet.smoking === "屋内禁煙"}
                      onClick={() => pick("smoking", "屋内禁煙")}
                    />
                    <Check
                      label="屋内原則禁煙（喫煙室あり）"
                      on={sheet.smoking === "屋内原則禁煙（喫煙室あり）"}
                      onClick={() => pick("smoking", "屋内原則禁煙（喫煙室あり）")}
                    />
                    <span className="flex items-center">
                      <Check
                        label="敷地内禁煙（喫煙場所"
                        on={sheet.smoking === "敷地内禁煙"}
                        onClick={() => pick("smoking", "敷地内禁煙")}
                      />

                      <Pick
                        label="有"
                        on={sheet.smoking === "敷地内禁煙" && sheet.smoking_note.includes("有")}
                        onClick={() => set("smoking_note", "有")}
                      />
                      ・
                      <Pick
                        label="無"
                        on={sheet.smoking === "敷地内禁煙" && sheet.smoking_note.includes("無")}
                        onClick={() => set("smoking_note", "無")}
                      />
                      ）
                    </span>
                    <span className="flex items-center">
                      <Check
                        label="その他（"
                        on={sheet.smoking === "その他"}
                        onClick={() => pick("smoking", "その他")}
                      />
                      <span className="w-[25mm]">
                        <F
                          value={sheet.smoking === "その他" ? sheet.smoking_note : ""}
                          onChange={(v) => set("smoking_note", v)}
                        />
                      </span>
                      ）
                    </span>
                  </span>
                </C>
              </tr>

              <tr style={{ height: pt(24) }}>
                <Band>応募に必要とされる事項</Band>
              </tr>
              <tr style={{ height: pt(29) }}>
                <L>経験の有無</L>
                <C colSpan={7}>
                  <F value={sheet.experience} onChange={(v) => set("experience", v)} />
                </C>
              </tr>
              <tr style={{ height: pt(29) }}>
                <L>必要条件</L>
                <C colSpan={7}>
                  <span className="flex items-center">
                    N4（技能実習の専門級合格書）・
                    <F value={sheet.requirements} onChange={(v) => set("requirements", v)} />
                  </span>
                </C>
              </tr>
              <tr style={{ height: pt(39) }}>
                <L>その他</L>
                <C colSpan={7}>
                  <F
                    value={sheet.other_requirements}
                    onChange={(v) => set("other_requirements", v)}
                  />
                </C>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </EditCtx.Provider>
  );
}
