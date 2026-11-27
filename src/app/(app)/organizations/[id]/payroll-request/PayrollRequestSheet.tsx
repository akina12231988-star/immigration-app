"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Printer, Trash2, TriangleAlert } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { addDaysYmd, warekiDateWithDow } from "@/lib/wage-notice";
import {
  buildPayrollRequestRows,
  defaultCertificateItems,
  fiscalYearLabel,
  lastEndedFiscalYear,
  PAYROLL_REQUEST_REPLY_DAYS,
  payrollRequestFileName,
  ymRangeText,
  type CertificateItem,
  type PayrollPermit,
  type PayrollRequestCandidate,
} from "@/lib/payroll-request";

const FIELD =
  "min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm focus:border-brand focus:outline-none";

// 名簿の1行への手直し（自動で出した内容の上書き。年度を変えるとリセットする）
interface RowOverride {
  include?: boolean; // false = この人は今回載せない
  fromYm?: string;
  toYm?: string;
  prevYear?: boolean;
  note?: string;
}

// 定期届出（3-6号）の準備のための「賃金台帳・証明書のお願い」（A4縦・FAX用）。
// 上がFAX送付状を兼ねた本文、真ん中が証明書のリスト（自由に直せる）、下が対象者の名簿。
// 名簿は対象年度に特定技能1号・2号として在籍していた人を自動で出し、期間・前年度分・備考を手で直せる
export function PayrollRequestSheet({
  organizationId,
  organizationName,
  candidates,
  permitsByWorker,
  isCorporate = true,
  today,
  staffName,
  fax,
  office,
}: {
  organizationId: string;
  organizationName: string;
  candidates: PayrollRequestCandidate[];
  permitsByWorker: Record<string, PayrollPermit[]>;
  isCorporate?: boolean; // 法人か（法人番号あり）。証明書リストの初期値を法人・個人事業主で出し分ける
  today: string;
  staffName: string;
  fax: string;
  office: { name: string; registrationNo: string; address: string; tel: string };
}) {
  const [fy, setFy] = useState(() => lastEndedFiscalYear(today));
  const [v, setV] = useState({
    sentOn: today,
    pages: "1",
    replyBy: addDaysYmd(today, PAYROLL_REQUEST_REPLY_DAYS),
    staff: staffName,
    fax,
    email: "",
    extraNote: "", // 本文の下に自由に書き足す一言（空なら印刷しない)
  });
  const set = (patch: Partial<typeof v>) => setV((cur) => ({ ...cur, ...patch }));

  // 証明書のリスト（自由に足す・消す・直す・並べ替え）
  const [certs, setCerts] = useState<CertificateItem[]>(() => defaultCertificateItems(isCorporate).map((c) => ({ ...c })));
  // 法人・個人事業主の取り違えがあったとき用: リストを該当の初期値に入れ替える
  const resetCerts = (corporate: boolean) => {
    if (!window.confirm(`証明書のリストを${corporate ? "法人" : "個人事業主"}向けの初期値に入れ替えます。いま書かれている内容は消えます。よろしいですか？`)) return;
    setCerts(defaultCertificateItems(corporate).map((c) => ({ ...c })));
  };
  const setCert = (i: number, patch: Partial<CertificateItem>) =>
    setCerts((cur) => cur.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const moveCert = (i: number, d: -1 | 1) =>
    setCerts((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // 名簿（年度を変えると作り直し、手直しもリセット）
  const { rows, excluded } = useMemo(
    () => buildPayrollRequestRows(candidates, permitsByWorker, fy),
    [candidates, permitsByWorker, fy],
  );
  const [overrides, setOverrides] = useState<Record<string, RowOverride>>({});
  const changeFy = (next: number) => {
    setFy(next);
    setOverrides({});
  };
  const setRow = (id: string, patch: RowOverride) =>
    setOverrides((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
  const merged = rows.map((r) => {
    const o = overrides[r.id] ?? {};
    return {
      ...r,
      include: o.include ?? true,
      fromYm: o.fromYm ?? r.fromYm,
      toYm: o.toYm ?? r.toYm,
      prevYear: o.prevYear ?? r.prevYear,
      note: o.note ?? r.note,
    };
  });
  const printed = merged.filter((r) => r.include);
  const warned = merged.filter((r) => r.warning);
  const certRows = certs.filter((c) => c.name.trim() || c.note.trim());

  // 印刷（PDF保存）のファイル名を「賃金台帳・証明書のお願い_機関名」にする
  const printSheet = () => {
    const original = document.title;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    document.title = payrollRequestFileName(organizationName);
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const cell = "border border-black px-2 py-[4px] align-middle";
  const fyOptions = [fy + 1, fy, fy - 1, fy - 2].sort((a, b) => b - a);

  return (
    <>
      <style>{"@media print{@page{size:A4 portrait;margin:11mm 13mm} body{background:#fff}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={`/organizations/${organizationId}`} />
          <h1 className="flex-1 text-lg font-bold">定期報告書　賃金台帳・証明書のお願い（A4縦）</h1>
        </div>
        <div className="flex flex-col gap-3 px-4 py-3 lg:px-8">
          <p className="text-xs leading-relaxed text-muted">
            定期報告書（3-6号）の作成のために、所属機関へ送る「賃金台帳の写しと証明書のお願い」です。
            対象年度に特定技能1号・2号として在籍していた人（年度の途中で退職した人を含む）を名簿にします。
            特定活動だった月はお願いする期間から外しています。2年以上続けて在籍している人は昇給率の計算に前年度分も必要なため、
            前年度分もあわせてお願いする印を付けています。名簿の期間・備考と証明書のリストは下で自由に直してから印刷してください。
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              対象年度
              <select value={fy} onChange={(e) => changeFy(Number(e.target.value))} className={FIELD}>
                {fyOptions.map((y) => (
                  <option key={y} value={y}>
                    {fiscalYearLabel(y)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              返信期限
              <input type="date" value={v.replyBy} onChange={(e) => set({ replyBy: e.target.value })} className={FIELD} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              送信日
              <input type="date" value={v.sentOn} onChange={(e) => set({ sentOn: e.target.value })} className={FIELD} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              送信枚数
              <input value={v.pages} onChange={(e) => set({ pages: e.target.value })} inputMode="numeric" className={`${FIELD} tabular-nums`} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              担当者
              <input value={v.staff} onChange={(e) => set({ staff: e.target.value })} className={FIELD} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              返信先のFAX番号
              <input value={v.fax} onChange={(e) => set({ fax: e.target.value })} className={`${FIELD} tabular-nums`} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              返信先のメールアドレス（空なら印刷しない）
              <input value={v.email} onChange={(e) => set({ email: e.target.value })} className={FIELD} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              本文に書き足す一言（空なら印刷しない）
              <input value={v.extraNote} onChange={(e) => set({ extraNote: e.target.value })} className={FIELD} />
            </label>
          </div>

          {/* 証明書のリスト（自由に足す・消す・直す・並べ替え） */}
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 text-xs font-bold text-muted">
                証明書のリスト（初期値は入管の提出資料一覧表の「A 一定の基準を満たさない場合」の{isCorporate ? "法人" : "個人事業主"}向け。書類名を空にすると印刷されません）
              </p>
              <button type="button" onClick={() => resetCerts(true)} className="inline-flex min-h-[28px] items-center rounded-lg border border-border px-2 text-[11px] font-bold text-muted">
                法人向けに戻す
              </button>
              <button type="button" onClick={() => resetCerts(false)} className="inline-flex min-h-[28px] items-center rounded-lg border border-border px-2 text-[11px] font-bold text-muted">
                個人事業主向けに戻す
              </button>
            </div>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {certs.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={c.name}
                    onChange={(e) => setCert(i, { name: e.target.value })}
                    placeholder="書類名（例: 納税証明書（その3））"
                    className={`${FIELD} w-full sm:w-[320px]`}
                  />
                  <input
                    value={c.note}
                    onChange={(e) => setCert(i, { note: e.target.value })}
                    placeholder="備考（取得先・何年度分 など）"
                    className={`${FIELD} w-full flex-1 sm:w-auto`}
                  />
                  <button type="button" onClick={() => moveCert(i, -1)} disabled={i === 0} className="rounded-lg border border-border p-2 disabled:opacity-30" aria-label="上へ">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" onClick={() => moveCert(i, 1)} disabled={i === certs.length - 1} className="rounded-lg border border-border p-2 disabled:opacity-30" aria-label="下へ">
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" onClick={() => setCerts((cur) => cur.filter((_, j) => j !== i))} className="rounded-lg border border-border p-2 text-seal" aria-label="消す">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCerts((cur) => [...cur, { name: "", note: "" }])}
                className="inline-flex min-h-[32px] w-fit items-center gap-1 rounded-lg border border-brand px-2.5 text-xs font-bold text-brand"
              >
                <Plus size={14} />
                行を足す
              </button>
            </div>
          </div>

          {/* 名簿の手直し（載せる・期間・前年度分・備考） */}
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-xs font-bold text-muted">
              名簿（{printed.length}名を印刷。チェックを外すとその人は載せません）
            </p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {merged.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <label className="inline-flex min-w-[180px] items-center gap-1.5 font-bold">
                    <input type="checkbox" checked={r.include} onChange={(e) => setRow(r.id, { include: e.target.checked })} className="size-4" />
                    {r.name}
                    <span className="font-normal text-muted">
                      （{r.grade}
                      {r.sswTenure ? `・期間末まで在籍 ${r.sswTenure}` : ""}）
                    </span>
                  </label>
                  <input type="month" value={r.fromYm} onChange={(e) => setRow(r.id, { fromYm: e.target.value })} className={FIELD} />
                  〜
                  <input type="month" value={r.toYm} onChange={(e) => setRow(r.id, { toYm: e.target.value })} className={FIELD} />
                  <label className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={r.prevYear} onChange={(e) => setRow(r.id, { prevYear: e.target.checked })} className="size-4" />
                    前年度分も（昇給率）
                  </label>
                  <input
                    value={r.note}
                    onChange={(e) => setRow(r.id, { note: e.target.value })}
                    placeholder="備考"
                    className={`${FIELD} w-full flex-1 sm:w-auto`}
                  />
                </div>
              ))}
              {merged.length === 0 && (
                <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs font-bold text-seal">
                  この年度に特定技能1号・2号として在籍していた人が見つかりません。下の「名簿に載せていない人」を確認してください。
                </p>
              )}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={printSheet}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
            >
              <Printer size={18} />
              印刷・PDF保存（A4縦）
            </button>
          </div>

          {/* 画面だけの注意（印刷には出ない） */}
          {warned.length > 0 && (
            <div className="rounded-lg border border-seal/40 bg-seal/10 px-3 py-2 text-xs text-seal">
              <p className="flex items-center gap-1 font-bold">
                <TriangleAlert size={14} className="shrink-0" />
                期間を確認してほしい方（{warned.length}名）
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {warned.map((r) => (
                  <li key={r.id}>
                    <span className="font-bold">{r.name}</span>：{r.warning}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {excluded.length > 0 && (
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted">
              <p className="font-bold">名簿に載せていない人（{excluded.length}名）</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {excluded.map((e) => (
                  <li key={e.id}>
                    <span className="font-bold text-foreground">{e.name}</span>：{e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* 以下が印刷される部分（A4縦） */}
      <div className="mx-auto max-w-[186mm] px-4 pb-10 text-black lg:px-0 print:max-w-none print:p-0">
        <section className="text-[10pt] leading-[1.45]">
          <div className="flex items-start justify-between gap-6">
            <div>
              <span className="inline-block border-[1.5px] border-black px-3 py-0.5 font-bold tracking-[0.2em]">FAX</span>
              <p className="mt-1.5 min-w-[80mm] border-b-2 border-black pb-1 text-[13pt] font-bold">
                {organizationName}　御中
                <span className="mt-0.5 block text-[9pt] font-normal">ご担当者様（特定技能外国人の受入れご担当）</span>
              </p>
            </div>
            <div className="text-[9pt] leading-[1.45]">
              <p>
                送信日：{warekiDateWithDow(v.sentOn)}　　送信枚数：{v.pages || "1"}枚（本紙含む）
              </p>
              <p>
                <span className="text-[10.5pt] font-bold">登録支援機関　{office.name}</span>（登録番号 {office.registrationNo}）
              </p>
              <p>{office.address}</p>
              <p>
                TEL {office.tel}　／　担当：{v.staff}
              </p>
            </div>
          </div>

          <h2 className="my-3 text-center text-[13pt] font-bold tracking-[0.05em]">
            定期報告書の作成に伴う「賃金台帳の写し・証明書」のお願い
          </h2>
          <p className="mb-2">
            平素より大変お世話になっております。特定技能外国人の受入れ状況は、毎年、出入国在留管理庁へ
            届け出ることになっております（受入れ・活動・支援実施状況に係る届出。対象期間 {fy}年4月1日〜{fy + 1}年3月31日）。
            つきましては、<b>下記1の皆さまの賃金台帳の写し</b>（記載の月分）
            {certRows.length > 0 && (
              <>
                と<b>下記2の証明書</b>
              </>
            )}
            を、<b>{warekiDateWithDow(v.replyBy)}まで</b>に、FAX（{v.fax}）・LINE
            {v.email.trim() && <>・メール（{v.email.trim()}）</>}
            のいずれかでお送りくださいますようお願いいたします。
          </p>
          {v.extraNote.trim() && <p className="mb-2">{v.extraNote.trim()}</p>}

          <p className="mb-1 font-bold">1　賃金台帳の写しをお願いする方</p>
          <table className="w-full border-collapse text-[9.5pt]">
            <thead>
              <tr>
                <th className={`${cell} w-[8mm] bg-neutral-100 text-center`}>No.</th>
                <th className={`${cell} bg-neutral-100 text-center`}>氏名</th>
                <th className={`${cell} w-[20mm] bg-neutral-100 text-center`}>国籍</th>
                <th className={`${cell} w-[24mm] bg-neutral-100 text-center`}>在留資格</th>
                <th className={`${cell} w-[58mm] bg-neutral-100 text-center`}>お願いする月分</th>
                <th className={`${cell} bg-neutral-100 text-center`}>備考</th>
              </tr>
            </thead>
            <tbody>
              {printed.map((r, i) => (
                <tr key={r.id}>
                  <td className={`${cell} text-center`}>{i + 1}</td>
                  <td className={cell}>{r.name}</td>
                  <td className={`${cell} text-center`}>{r.nationality}</td>
                  <td className={`${cell} text-center text-[9pt]`}>
                    {r.grade}
                    {r.sswTenure && <span className="block text-[8pt]">（在籍 {r.sswTenure}）</span>}
                  </td>
                  <td className={cell}>
                    {ymRangeText(r.fromYm, r.toYm)}
                    {r.prevYear && (
                      <span className="block text-[8.5pt]">
                        ＋前年度分（{ymRangeText(r.prevFromYm || `${fy - 1}-04`, r.prevToYm || `${fy}-03`)}）
                      </span>
                    )}
                  </td>
                  <td className={`${cell} text-[8.5pt]`}>{r.note}</td>
                </tr>
              ))}
              {printed.length === 0 && (
                <tr>
                  <td className={`${cell} text-center`} colSpan={6}>
                    対象の方はいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-1 text-[8.5pt] text-neutral-700">
            ※「＋前年度分」の記載がある方は、昇給率の算出のため前年度の賃金台帳の写しもお願いいたします。
            {printed.some((r) => r.note.includes("より前の分は不要")) &&
              "※ 在留資格が「特定技能」になる前（特定活動など）の月分は不要です。"}
          </p>

          {certRows.length > 0 && (
            <>
              <p className="mb-1 mt-3 font-bold">2　発行をお願いする証明書など</p>
              <table className="w-full border-collapse text-[9.5pt]">
                <thead>
                  <tr>
                    <th className={`${cell} w-[8mm] bg-neutral-100 text-center`}>No.</th>
                    <th className={`${cell} bg-neutral-100 text-center`}>書類名</th>
                    <th className={`${cell} w-[70mm] bg-neutral-100 text-center`}>備考</th>
                    <th className={`${cell} w-[16mm] bg-neutral-100 text-center text-[8.5pt]`}>チェック欄</th>
                  </tr>
                </thead>
                <tbody>
                  {certRows.map((c, i) => (
                    <tr key={i}>
                      <td className={`${cell} text-center`}>{i + 1}</td>
                      <td className={cell}>{c.name}</td>
                      <td className={`${cell} text-[8.5pt]`}>{c.note}</td>
                      <td className={`${cell} h-[7mm]`}></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p className="mt-2 text-[9pt]">
            ご不明な点は担当（{v.staff}）までお気軽にお問い合わせください。お手数をおかけしますが、よろしくお願いいたします。
          </p>
        </section>
      </div>
    </>
  );
}
