"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { rosterJpDate } from "@/lib/roster";
import {
  PAY_PROOF_MAX_SHEETS,
  payProofFileName,
  payProofRange,
  payProofSheetCount,
  payProofStartMonth,
} from "@/lib/pay-proof";

export interface PayProofWorker {
  name: string; // 氏名（ローマ字）
  gender: string;
  birth: string | null;
  nationality: string;
  residenceCardNo: string;
  residencePeriod: string; // 在留期間（印刷枚数の判定に使う）
  residenceExpiryDate: string | null;
  employmentStartOn: string | null; // 現在の所属機関の雇用開始日（何月分から印刷するか）
}

// 今日の日付（日本時間・YYYY-MM-DD）
const todayJst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

// 報酬支払証明書（参考様式第５－７号）。
// 通貨払い（現金手渡し）の会社は毎月1枚ずつ本人に書いてもらうため、
// 何月分から在留期限日の月までの月数ぶん（例: 2026年9月分〜2028年1月分なら17枚）をまとめて印刷する。
// 在留期限日が無いときは在留期間から6枚または12枚にする。
// 「１ 対象労働者」は今の在留カードの内容を入れ、「２ 報酬」は手書きの空欄にする。
export function PayProofSheet({
  orgName,
  worker,
}: {
  orgName: string;
  worker: PayProofWorker;
}) {
  // 何月分から〜何日まで（在留期限日）。画面で直せる
  const [from, setFrom] = useState(() => payProofStartMonth(todayJst(), worker.employmentStartOn));
  const [to, setTo] = useState(worker.residenceExpiryDate ?? "");
  const range = payProofRange(from, to);
  const autoCount = range ? Math.min(range.count, PAY_PROOF_MAX_SHEETS) : payProofSheetCount(worker.residencePeriod);
  // 枚数を手で変えたときはその枚数（期間を変えると自動の枚数に戻す）
  const [manualCount, setManualCount] = useState<number | null>(null);
  const count = manualCount ?? autoCount;

  // 印刷（PDF保存）のとき、保存されるファイル名を「報酬支払証明書_氏名」にする。
  // ブラウザは画面の題名（document.title）をPDFの既定のファイル名に使う
  const printSheet = () => {
    const original = document.title;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    document.title = payProofFileName(worker.name);
    window.addEventListener("afterprint", restore);
    window.print();
  };

  // 印刷前に足りないところ（気づけるように出す）
  const missing = [
    orgName.trim() ? "" : "特定技能所属機関の氏名又は名称",
    worker.name.trim() ? "" : "氏名",
    worker.gender.trim() ? "" : "性別",
    worker.birth ? "" : "生年月日",
    worker.nationality.trim() ? "" : "国籍・地域",
    worker.residenceCardNo.trim() ? "" : "在留カード番号",
  ].filter(Boolean);

  return (
    <>
      {/* 用紙の余白を0にして、ブラウザが余白に印字するヘッダー・フッター（ファイル名・日時・URL・ページ番号）を出さない。
          余白の代わりに1枚ごとの内側に14mmの余白をとる */}
      <style>{"@media print{@page{size:A4 portrait;margin:0}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/workers" />
          <h1 className="flex-1 text-lg font-bold">報酬支払証明書（A4縦で印刷）</h1>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3 lg:px-8">
          <p className="text-xs leading-relaxed text-muted">
            通貨払い（現金手渡し）の会社は、報酬を支払うたびに報酬支払証明書（参考様式第５－７号）が必要です。
            下の内容に間違いがないか確かめてから、必要な枚数を印刷して会社へ渡してください。
            「２　報酬」と「◯月分」の欄は、支払うときに手書きで入れる空欄にしています。
          </p>

          {/* 印刷前の確認（１ 対象労働者に入る内容＝今の在留カードの情報） */}
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="mb-2 text-xs font-bold text-muted">印刷される内容</p>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Row label="特定技能所属機関の氏名又は名称" value={orgName} />
              <Row label="氏名（ローマ字）" value={worker.name} />
              <Row label="性別" value={worker.gender} />
              <Row label="生年月日" value={rosterJpDate(worker.birth)} />
              <Row label="国籍・地域" value={worker.nationality} />
              <Row label="在留カード番号" value={worker.residenceCardNo} />
              <Row
                label="在留期間"
                value={
                  worker.residencePeriod
                    ? `${worker.residencePeriod}${
                        worker.residenceExpiryDate ? `（〜${worker.residenceExpiryDate}）` : ""
                      }`
                    : ""
                }
              />
            </dl>
            {missing.length > 0 && (
              <p className="mt-2 rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs font-bold text-seal">
                {missing.join("・")}が未登録です。外国人詳細で在留カードの内容・所属機関を入れてから印刷してください。
              </p>
            )}
          </div>

          {/* 印刷する枚数: 何月分から在留期限日の月までを1か月1枚で数える */}
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="mb-2 text-xs font-bold text-muted">印刷する枚数（1か月に1枚）</p>
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-muted">何月分から</span>
                <input
                  type="month"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setManualCount(null);
                  }}
                  className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none"
                />
              </label>
              <span className="pb-3">〜</span>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-muted">在留期限日</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setManualCount(null);
                  }}
                  className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-muted">枚数</span>
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={PAY_PROOF_MAX_SHEETS}
                    value={count}
                    onChange={(e) => {
                      const n = Math.floor(Number(e.target.value));
                      if (n >= 1) setManualCount(Math.min(n, PAY_PROOF_MAX_SHEETS));
                    }}
                    className="min-h-[44px] w-20 rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none"
                  />
                  枚
                </span>
              </label>
              <button
                type="button"
                onClick={printSheet}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
              >
                <Printer size={18} />
                印刷・PDF保存（A4縦）
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed">
              {range ? (
                <>
                  <span className="font-bold">{range.label}</span>
                  <span className="text-muted">で </span>
                  <span className="font-bold">{range.count}か月分＝{Math.min(range.count, PAY_PROOF_MAX_SHEETS)}枚</span>
                  <span className="text-muted">が必要です。</span>
                  {range.count > PAY_PROOF_MAX_SHEETS && (
                    <span className="text-seal">（一度に印刷できるのは{PAY_PROOF_MAX_SHEETS}枚までです）</span>
                  )}
                </>
              ) : (
                <span className="text-muted">
                  {to
                    ? "在留期限日が何月分より前になっています。日付を確かめてください。"
                    : `在留期限日が未登録のため、在留期間「${worker.residencePeriod || "未登録"}」から${autoCount}枚にしています。`}
                </span>
              )}
              {manualCount !== null && manualCount !== autoCount && (
                <span className="text-muted">（枚数は手で{manualCount}枚に変えています）</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* 以下が印刷される部分（1枚＝1ページ） */}
      <div className="mx-auto max-w-[190mm] px-4 pb-10 lg:px-0 print:max-w-none print:p-0">
        {Array.from({ length: count }, (_, i) => (
          <PayProofPage key={i} orgName={orgName} worker={worker} last={i === count - 1} />
        ))}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-44 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 font-bold">{value || "未登録"}</dd>
    </div>
  );
}

// 用紙1枚ぶん（参考様式第５－７号のとおり）
function PayProofPage({
  orgName,
  worker,
  last,
}: {
  orgName: string;
  worker: PayProofWorker;
  last: boolean;
}) {
  const cell = "border border-black px-2 py-1.5 align-middle";
  const head = `${cell} w-[38%] bg-white`;

  return (
    <section
      className={`text-[11pt] leading-relaxed text-black print:p-[14mm] ${last ? "" : "break-after-page"}`}
    >
      <p className="text-[10pt]">参考様式第５－７号</p>
      <h2 className="my-4 text-center text-[14pt] font-bold tracking-[0.3em]">報酬支払証明書</h2>

      <p className="mb-4 text-[10.5pt]">
        <Blank w="w-12" />月分（<Blank w="w-10" />月<Blank w="w-10" />日から
        <Blank w="w-10" />月<Blank w="w-10" />日 分）の報酬について、以下のとおり支払いました。
      </p>

      <p className="mb-1 font-bold">１　対象労働者</p>
      <table className="mb-4 w-full border-collapse text-[10.5pt]">
        <tbody>
          <tr>
            <th className={`${head} text-left font-normal`}>①氏名（ローマ字）</th>
            <td className={cell}>{worker.name}</td>
          </tr>
          <tr>
            <th className={`${head} text-left font-normal`}>②性　　　別</th>
            <td className={cell}>
              <Gender gender={worker.gender} />
            </td>
          </tr>
          <tr>
            <th className={`${head} text-left font-normal`}>③生　年　月　日</th>
            <td className={cell}>{rosterJpDate(worker.birth)}</td>
          </tr>
          <tr>
            <th className={`${head} text-left font-normal`}>④国籍・地域</th>
            <td className={cell}>{worker.nationality}</td>
          </tr>
          <tr>
            <th className={`${head} text-left font-normal`}>⑤在留カード番号</th>
            <td className={`${cell} tracking-wider`}>{worker.residenceCardNo}</td>
          </tr>
        </tbody>
      </table>

      <p className="mb-1 font-bold">２　報酬</p>
      <table className="mb-3 w-full border-collapse text-[10.5pt]">
        <tbody>
          <tr>
            <th className={`${head} text-left font-normal`}>①報酬総額</th>
            <td className={`${cell} text-right`}>円</td>
          </tr>
          <tr>
            <th className={`${head} text-left font-normal`}>②現金支給額</th>
            <td className={`${cell} text-right`}>円</td>
          </tr>
          <tr>
            <th className={`${head} text-left font-normal`}>③支給日</th>
            <td className={cell}>
              <Blank w="w-16" />年<Blank w="w-12" />月<Blank w="w-12" />日
            </td>
          </tr>
        </tbody>
      </table>

      <div className="text-[9.5pt] leading-relaxed">
        <p>（注意）</p>
        <p>１　上記２①は、控除前の報酬総額を記載すること。</p>
        <p>２　上記２②は、控除後の手取り報酬額を記載すること。</p>
      </div>

      {/* 様式の下半分（会社の署名欄）。特定技能所属機関の氏名又は名称だけ入れておき、
          日付・作成責任者・給与支給者は会社に手書きしてもらう */}
      <p className="mt-5 text-[10.5pt]">上記の記載内容は、事実と相違ありません。</p>
      <div className="ml-auto mt-3 w-[78%] space-y-2 text-[10.5pt]">
        <p>
          <Blank w="w-16" />年<Blank w="w-12" />月<Blank w="w-12" />日
        </p>
        <SignLine label="特定技能所属機関の氏名又は名称" value={orgName} />
        <SignLine label="作成責任者　役職・氏名" />
        <SignLine label="給与支給者　役職・氏名" />
      </div>

      {/* 本人の署名欄 */}
      <p className="mt-5 text-[10.5pt] leading-relaxed">
        報酬について、雇用条件書どおりの報酬額であることを確認し十分に理解した上で、上記の内容どおり支給を受けました。
      </p>
      <div className="ml-auto mt-3 w-[78%] space-y-2 text-[10.5pt]">
        <p>
          <Blank w="w-16" />年<Blank w="w-12" />月<Blank w="w-12" />日
        </p>
        <SignLine label="特定技能外国人の署名" />
      </div>
    </section>
  );
}

// 様式の署名欄の1行（ラベルのうしろに下線を引く。value があればその上に入れる）
function SignLine({ label, value = "" }: { label: string; value?: string }) {
  return (
    <p className="flex items-end gap-2">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 flex-1 border-b border-black pb-0.5">{value}</span>
    </p>
  );
}

// 手書きする空欄（下線）
function Blank({ w }: { w: string }) {
  return <span className={`inline-block ${w} border-b border-black`} />;
}

// 男・女。該当する方に丸を付ける（判定できないときは様式のまま出す）
function Gender({ gender }: { gender: string }) {
  const male = gender.includes("男") || /^m/i.test(gender);
  const female = gender.includes("女") || /^f/i.test(gender);
  const mark = (on: boolean) =>
    on ? "rounded-full border border-black px-2 py-0.5 font-bold" : "px-2 py-0.5";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={mark(male)}>男</span>
      <span>・</span>
      <span className={mark(female)}>女</span>
    </span>
  );
}
