"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Printer,
  Search,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { setWorkerRecurringSalesNo } from "@/lib/supabase/queries/workers";
import { updateOrganization } from "@/lib/supabase/queries/organizations";
import { listPermitContentsByMonth } from "@/lib/supabase/queries/applications";
import {
  listWorkerSalesNos,
  setSalesEntryFreeeNo,
  type WorkerSalesNos,
} from "@/lib/supabase/queries/sales";
import {
  addMonthlySupportRegistration,
  clearMonthlySupportRegistration,
  deleteMonthlySupportRegistration,
  listMonthlySupportRegistrations,
  upsertMonthlySupportNote,
} from "@/lib/supabase/queries/sales";
import {
  deleteOrgInvoice,
  listOrgInvoices,
  updateOrgInvoice,
  upsertOrgInvoice,
} from "@/lib/supabase/queries/org-invoices";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import type { MonthlySupportRegistration, OrgInvoice } from "@/types/db";
import {
  dailyFee,
  formatSalesYen,
  mdText,
  taxBreakdownMatches,
  taxFromExcl,
  ymdText,
} from "@/lib/sales";
import { reminderTotal, type ReminderInvoiceRow } from "@/lib/reminder-letter";
import {
  billingExclusionReason,
  currentMonth,
  daysText,
  invoiceBilledOn,
  invoiceDueOn,
  isMonthStr,
  leftThisMonthRows,
  monthLabel,
  permittedThisMonthRows,
  periodText,
  summarizeMonthlyBilling,
  type BillingOrg,
  type BillingWorker,
  type MonthlyBillingOrg,
  type MonthlyBillingRow,
} from "@/lib/monthly-billing";
import {
  billingFileName,
  monthlyBillingSheets,
  orgBillingSheets,
} from "@/lib/monthly-billing-sheets";
import { buildXlsx, downloadBlob } from "@/lib/xlsx-export";

// 月末の請求書作成。年月を選ぶと、その月に1日でも在籍していた支援対象者を
// 所属機関ごとに並べ、支援費の請求額（満額・日割り）を出す。
// 所属機関へ在籍名簿をメールで送るため、エクセルで書き出せる。

// 選んだ対象の年月の保存キー（タブ内で保持し、ページを離れて戻っても選択が消えないように）
const MONTH_STORE_KEY = "monthly-billing-month";
export function MonthlyBillingSection({
  workers,
  organizations,
  today,
  canEdit,
}: {
  workers: BillingWorker[];
  organizations: BillingOrg[];
  today: string;
  canEdit: boolean;
}) {
  const [month, setMonth] = useState(() => currentMonth(today));
  const [openOrgId, setOpenOrgId] = useState<string | null>(null);

  // 選んだ年月はタブを閉じるまで保持する（ページを離れて戻っても今月に戻らないように）。
  // 新しいタブ・ブラウザを開き直したときは今月に戻る
  useEffect(() => {
    // レンダー中の同期setStateを避けるため、反映はマイクロタスクで行う
    void Promise.resolve().then(() => {
      const saved = window.sessionStorage.getItem(MONTH_STORE_KEY);
      if (saved && isMonthStr(saved)) setMonth(saved);
    });
  }, []);
  const changeMonth = (value: string) => {
    setMonth(value);
    try {
      window.sessionStorage.setItem(MONTH_STORE_KEY, value);
    } catch {
      /* プライベートブラウズなどで保存できなくても画面は動かす */
    }
  };
  const [salesNos, setSalesNos] = useState<Record<string, string>>({});
  // 定期売上No.の並び順（null=氏名順・asc=昇順・desc=降順）
  const [salesNoSort, setSalesNoSort] = useState<"asc" | "desc" | null>(null);
  // このページで登録した支援代（月額）。organization_id → 数字だけの文字列
  const [orgFees, setOrgFees] = useState<Record<string, string>>({});
  const [feeDraft, setFeeDraft] = useState("");
  const [feeSaving, setFeeSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 定期売上No. は画面で編集した内容を優先して集計に反映する
  const merged = useMemo(
    () =>
      workers.map((w) =>
        salesNos[w.id] === undefined ? w : { ...w, recurring_sales_no: salesNos[w.id] },
      ),
    [workers, salesNos],
  );
  // 支援代（月額）もこのページで登録した内容を優先して集計に反映する
  const mergedOrgs = useMemo(
    () =>
      organizations.map((o) =>
        orgFees[o.id] === undefined
          ? o
          : { ...o, intake: { ...(o.intake ?? {}), support_fee: orgFees[o.id] } },
      ),
    [organizations, orgFees],
  );
  const billing = useMemo(
    () => summarizeMonthlyBilling(merged, mergedOrgs, month),
    [merged, mergedOrgs, month],
  );

  // 支援対象なのに名簿に載っていない人と、その理由（「なぜ出てこない？」をここで確認できる）
  const orgNameById = useMemo(
    () => new Map(mergedOrgs.map((o) => [o.id, o.name])),
    [mergedOrgs],
  );
  const excluded = useMemo(
    () =>
      merged
        .map((w) => ({ worker: w, reason: billingExclusionReason(w, month) }))
        .filter((x): x is { worker: BillingWorker; reason: string } => x.reason !== null)
        .sort((a, b) => {
          const ao = orgNameById.get(a.worker.current_organization_id ?? "") ?? "";
          const bo = orgNameById.get(b.worker.current_organization_id ?? "") ?? "";
          return ao.localeCompare(bo, "ja") || a.worker.name.localeCompare(b.worker.name, "ja");
        }),
    [merged, month, orgNameById],
  );
  const [showExcluded, setShowExcluded] = useState(false);

  // 当月に在留許可が下りた人・当月に退職した人（所属機関をまたいだ一覧）。
  // エクセルの「当月許可者」「当月退職者」シートと同じ中身を画面でも見られるようにする
  const permittedRows = useMemo(() => permittedThisMonthRows(billing), [billing]);
  const leftRows = useMemo(() => leftThisMonthRows(billing), [billing]);
  const [showPermitted, setShowPermitted] = useState(false);
  const [showLeft, setShowLeft] = useState(false);

  // 所属機関名での絞り込み（空白の有無・大文字小文字は無視して部分一致）
  const [orgQuery, setOrgQuery] = useState("");
  const visibleOrgs = useMemo(() => {
    const normalize = (s: string) => s.replace(/[\s　]/g, "").toLowerCase();
    const q = normalize(orgQuery);
    if (!q) return billing.orgs;
    return billing.orgs.filter((o) => normalize(o.organizationName).includes(q));
  }, [billing.orgs, orgQuery]);

  // 定期売上No.でのソート。未登録は常に最後（氏名順のままの集計順は billing 側）
  const sortRows = (rows: MonthlyBillingRow[]): MonthlyBillingRow[] => {
    if (!salesNoSort) return rows;
    return [...rows].sort((a, b) => {
      const av = a.worker.recurring_sales_no || "";
      const bv = b.worker.recurring_sales_no || "";
      if (!av && !bv) return a.worker.name.localeCompare(b.worker.name, "ja");
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, "ja");
      return salesNoSort === "asc" ? cmp : -cmp;
    });
  };

  // 対象月に許可が下りた申請の「申請内容」（worker_id → 在留資格の変更許可／在留期間の更新許可）。
  // 備考で新規と更新を書き分けるために使う
  const [permitContents, setPermitContents] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() =>
      listPermitContentsByMonth(createClient(), month)
        .then((map) => {
          if (!cancelled) setPermitContents(map);
        })
        .catch(() => {
          // 取れなくても備考は作れる（その場合はすべて新規側に並ぶ）
          if (!cancelled) setPermitContents({});
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [month]);

  // 許可売上No.・保険No.（売上明細の伝票番号を1人1つにまとめたもの）。
  // 番号の実体は sales_entries なので、ここでの編集はその行を書き換える
  const [salesNos2, setSalesNos2] = useState<Record<string, WorkerSalesNos>>({});
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() =>
      listWorkerSalesNos(createClient())
        .then((map) => {
          if (!cancelled) setSalesNos2(map);
        })
        .catch(() => {
          // 売上明細が未作成でも名簿は使えるようにする
          if (!cancelled) setSalesNos2({});
        }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // 名簿から伝票番号を直したときは、その売上明細の行を書き換える
  const saveEntryNo = async (
    workerId: string,
    key: "permit" | "insurance",
    entryId: string,
    value: string,
  ) => {
    setSalesNos2((prev) => {
      const cur = prev[workerId];
      if (!cur?.[key]) return prev;
      return { ...prev, [workerId]: { ...cur, [key]: { ...cur[key], freeeNo: value } } };
    });
    try {
      await setSalesEntryFreeeNo(createClient(), entryId, value);
    } catch (err) {
      setError(errorMessage(err, "売上No.の保存に失敗しました"));
    }
  };

  // ◯月分の支援代をfreeeに登録した記録（worker_id → 記録）。対象の年月ごとに読み込む
  const [regs, setRegs] = useState<Record<string, MonthlySupportRegistration>>({});
  const [regBusyId, setRegBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // レンダー中の同期setStateを避けるため、読み込みはマイクロタスクで開始する
    void Promise.resolve().then(() =>
      listMonthlySupportRegistrations(createClient(), month)
        .then((rows) => {
          if (!cancelled) setRegs(Object.fromEntries(rows.map((r) => [r.worker_id, r])));
        })
        .catch(() => {
          // テーブル未作成（マイグレーション未実行）でも画面は使えるようにする
          if (!cancelled) setRegs({});
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [month]);

  // 在留資格が特定活動なら「サポート代」、それ以外は「支援代」
  const feeNameFor = (residenceStatus: string | null | undefined): string =>
    (residenceStatus ?? "").includes("特定活動") ? "サポート代" : "支援代";
  const monthNum = Number(month.slice(5, 7)) || 0;
  // 許可日が対象の年月内か（名前の横に「許可日◯月◯日」のバッジを出す）
  const permitInMonth = (permit: string | null): boolean =>
    Boolean(permit && permit.startsWith(month));

  // 請求書（freee）の備考欄に貼る文章を自動で作る。
  // ＜許可おりた人＞（在留資格ごと）と＜退職者＞をその機関の名簿から組み立てる
  const orgRemarks = (org: MonthlyBillingOrg): string => {
    const permitted = org.rows.filter((r) => permitInMonth(r.worker.residence_permit_date));
    const left = org.rows.filter((r) => r.leftThisMonth);
    const lines: string[] = [];
    // 新規（在留資格の変更・認定）と更新（在留期間の更新）を分けて書く。
    // 判定は申請の「申請内容」を正とし、申請が見つからない人は新規側に置く
    const isRenewal = (r: MonthlyBillingRow) =>
      (permitContents[r.worker.id] ?? "").includes("更新");
    const pushVisaGroups = (rows: MonthlyBillingRow[]) => {
      const byVisa = new Map<string, MonthlyBillingRow[]>();
      for (const r of rows) {
        const visa = r.worker.residence_status || "在留資格未設定";
        if (!byVisa.has(visa)) byVisa.set(visa, []);
        byVisa.get(visa)!.push(r);
      }
      for (const [visa, group] of byVisa) {
        lines.push(`${visa}ビザ`);
        for (const r of group) {
          lines.push(`${r.worker.name}さん　許可日：${mdText(r.worker.residence_permit_date ?? "")}`);
        }
      }
    };
    const newly = permitted.filter((r) => !isRenewal(r));
    const renewed = permitted.filter(isRenewal);
    if (newly.length > 0) {
      lines.push("＜許可おりた人＞");
      pushVisaGroups(newly);
    }
    if (renewed.length > 0) {
      if (newly.length > 0) lines.push("");
      lines.push("＜更新許可＞");
      pushVisaGroups(renewed);
    }
    if (left.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("＜退職者＞");
      for (const r of left) {
        lines.push(`${r.worker.name}さん　退職日：${mdText(r.worker.leaving_on ?? "")}`);
      }
    }
    return lines.join("\n");
  };

  // 請求・入金の記録（org_invoices）。督促状のもとになる台帳で、
  // 月ごとの請求書番号・実際の請求金額と入金を保存して積み上げていく
  const [showReminder, setShowReminder] = useState(false);
  const [orgInvoices, setOrgInvoices] = useState<OrgInvoice[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invBusy, setInvBusy] = useState(false);
  const [currentInvoiceNo, setCurrentInvoiceNo] = useState("");
  // 請求金額は税抜・消費税・税込の3つを持つ（領収書に内消費税を正しく書くため）
  const [currentAmountExcl, setCurrentAmountExcl] = useState("");
  const [currentTax, setCurrentTax] = useState("");
  const [currentTaxFree, setCurrentTaxFree] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  // 過去分（対象月より前の未入金など）をあとから登録するための入力
  const [showPastForm, setShowPastForm] = useState(false);
  const [pastMonth, setPastMonth] = useState("");
  const [pastInvoiceNo, setPastInvoiceNo] = useState("");
  const [pastAmountExcl, setPastAmountExcl] = useState("");
  const [pastTax, setPastTax] = useState("");
  const [pastTaxFree, setPastTaxFree] = useState("");
  const [pastAmount, setPastAmount] = useState("");
  const [pastPaid, setPastPaid] = useState("");
  const [pastPaidOn, setPastPaidOn] = useState("");

  const digits = (v: string) => v.replace(/[^0-9]/g, "");

  // 税込金額 = 税抜（課税対象）＋ 消費税 ＋ 非課税
  const totalOf = (excl: string, tax: string, taxFree: string) =>
    (Number(excl) || 0) + (Number(tax) || 0) + (Number(taxFree) || 0);

  // 税抜を入れたら消費税（10%・切り捨て）と税込を自動で埋める。
  // 消費税・非課税・税込はあとから直せるので、端数が違う請求書にも合わせられる
  const setExclAndFill = (
    value: string,
    taxFree: string,
    setExcl: (v: string) => void,
    setTaxValue: (v: string) => void,
    setTotal: (v: string) => void,
  ) => {
    const v = digits(value);
    setExcl(v);
    const t = v ? String(taxFromExcl(Number(v) || 0)) : "";
    setTaxValue(t);
    setTotal(v || taxFree ? String(totalOf(v, t, taxFree)) : "");
  };

  // 消費税・非課税を直したら税込を入れ直す
  const setTaxAndFill = (
    value: string,
    excl: string,
    taxFree: string,
    setTaxValue: (v: string) => void,
    setTotal: (v: string) => void,
  ) => {
    const v = digits(value);
    setTaxValue(v);
    setTotal(String(totalOf(excl, v, taxFree)));
  };

  const setTaxFreeAndFill = (
    value: string,
    excl: string,
    tax: string,
    setTaxFreeValue: (v: string) => void,
    setTotal: (v: string) => void,
  ) => {
    const v = digits(value);
    setTaxFreeValue(v);
    setTotal(String(totalOf(excl, tax, v)));
  };

  // 記録は古い月から順に並べる（上から下へ年月が流れるように見せる）
  const sortInvoices = (rows: OrgInvoice[]): OrgInvoice[] =>
    [...rows].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  const resetPastForm = () => {
    setPastMonth("");
    setPastInvoiceNo("");
    setPastAmountExcl("");
    setPastTax("");
    setPastTaxFree("");
    setPastAmount("");
    setPastPaid("");
    setPastPaidOn("");
  };

  // 督促状セクションを開いたら保存済みの記録を読み込み、今回分の入力に反映する
  const toggleReminder = async (org: MonthlyBillingOrg) => {
    const opening = !showReminder;
    setShowReminder(opening);
    if (!opening) return;
    setInvLoading(true);
    setError(null);
    try {
      const rows = await listOrgInvoices(createClient(), org.organizationId);
      setOrgInvoices(sortInvoices(rows));
      const cur = rows.find((r) => r.month === month);
      setCurrentInvoiceNo(cur?.invoice_no ?? "");
      if (cur) {
        setCurrentAmountExcl(String(cur.amount_excl || ""));
        setCurrentTax(String(cur.tax || ""));
        setCurrentTaxFree(String(cur.tax_free || ""));
        setCurrentAmount(String(cur.amount || ""));
      } else {
        // 未保存なら集計（税抜）から税込までを下書きしておく
        setCurrentTaxFree("");
        setExclAndFill(
          String(org.total || ""),
          "",
          setCurrentAmountExcl,
          setCurrentTax,
          setCurrentAmount,
        );
      }
    } catch (err) {
      setError(
        dbErrorMessage(err, "0070_org_invoices.sql", errorMessage(err, "請求記録の読み込みに失敗しました")),
      );
    } finally {
      setInvLoading(false);
    }
  };

  // 今回（対象月）の請求書番号・実際の請求金額を保存する（同じ月なら上書き）
  const saveCurrentInvoice = async (org: MonthlyBillingOrg) => {
    setInvBusy(true);
    setError(null);
    try {
      const row = await upsertOrgInvoice(createClient(), {
        organization_id: org.organizationId,
        month,
        billed_on: invoiceBilledOn(month),
        invoice_no: currentInvoiceNo.trim(),
        amount_excl: Number(currentAmountExcl) || 0,
        tax: Number(currentTax) || 0,
        tax_free: Number(currentTaxFree) || 0,
        amount: Number(currentAmount) || 0,
        due_on: invoiceDueOn(month),
      });
      setOrgInvoices((prev) => sortInvoices([row, ...prev.filter((r) => r.id !== row.id)]));
    } catch (err) {
      setError(
        dbErrorMessage(err, "0070_org_invoices.sql", errorMessage(err, "請求記録の保存に失敗しました")),
      );
    } finally {
      setInvBusy(false);
    }
  };

  // 過去分の請求をあとから登録する（未入金のまま残っている過去の請求を督促状に載せるため）。
  // 入金済み額・入金日も同時に入れられる（一部入金・入金済みの記録もそのまま残せる）
  const savePastInvoice = async (org: MonthlyBillingOrg) => {
    if (!isMonthStr(pastMonth)) {
      setError("対象の年月を選んでください");
      return;
    }
    setInvBusy(true);
    setError(null);
    try {
      const row = await upsertOrgInvoice(createClient(), {
        organization_id: org.organizationId,
        month: pastMonth,
        billed_on: invoiceBilledOn(pastMonth),
        invoice_no: pastInvoiceNo.trim(),
        amount_excl: Number(pastAmountExcl) || 0,
        tax: Number(pastTax) || 0,
        tax_free: Number(pastTaxFree) || 0,
        amount: Number(pastAmount) || 0,
        due_on: invoiceDueOn(pastMonth),
        paid: Number(pastPaid) || 0,
        paid_on: pastPaidOn || null,
      });
      setOrgInvoices((prev) => sortInvoices([row, ...prev.filter((r) => r.id !== row.id)]));
      // 対象月と同じ月を入れた場合は「今回分」の入力欄にも反映しておく
      if (row.month === month) {
        setCurrentInvoiceNo(row.invoice_no);
        setCurrentAmountExcl(String(row.amount_excl || ""));
        setCurrentTax(String(row.tax || ""));
        setCurrentTaxFree(String(row.tax_free || ""));
        setCurrentAmount(String(row.amount || ""));
      }
      resetPastForm();
    } catch (err) {
      setError(
        dbErrorMessage(err, "0070_org_invoices.sql", errorMessage(err, "過去分の請求の保存に失敗しました")),
      );
    } finally {
      setInvBusy(false);
    }
  };

  // 入金の記録（入金済み額・入金日）などの部分更新
  const patchInvoice = async (
    id: string,
    patch: Partial<
      Pick<
        OrgInvoice,
        | "invoice_no"
        | "amount_excl"
        | "tax"
        | "tax_free"
        | "amount"
        | "paid"
        | "paid_on"
        | "note"
      >
    >,
  ) => {
    setOrgInvoices((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    // 対象月の行を書き換えたときは「今回分」の入力欄にも合わせる
    if (orgInvoices.find((r) => r.id === id)?.month === month) {
      if (patch.invoice_no !== undefined) setCurrentInvoiceNo(patch.invoice_no);
      if (patch.amount_excl !== undefined) setCurrentAmountExcl(String(patch.amount_excl || ""));
      if (patch.tax !== undefined) setCurrentTax(String(patch.tax || ""));
      if (patch.tax_free !== undefined) setCurrentTaxFree(String(patch.tax_free || ""));
      if (patch.amount !== undefined) setCurrentAmount(String(patch.amount || ""));
    }
    try {
      await updateOrgInvoice(createClient(), id, patch);
    } catch (err) {
      setError(errorMessage(err, "入金記録の保存に失敗しました"));
    }
  };

  const removeInvoice = async (id: string) => {
    if (!window.confirm("この請求の記録を削除します。よろしいですか？")) return;
    try {
      await deleteOrgInvoice(createClient(), id);
      setOrgInvoices((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(errorMessage(err, "削除に失敗しました"));
    }
  };

  // 保存済みの記録のうち、残額が残っている過去の請求（督促状の一覧に自動で載る）
  const savedUnpaidRows = (): ReminderInvoiceRow[] =>
    orgInvoices
      .filter((r) => r.month !== month && r.amount - r.paid > 0)
      .map((r) => ({
        // 請求日・支払期限は対象月から決まる（古い記録も画面と督促状で同じ日付になる）
        billedOn: invoiceBilledOn(r.month),
        invoiceNo: r.invoice_no,
        amount: r.amount,
        paid: r.paid,
        dueOn: invoiceDueOn(r.month),
      }));

  // 今回（対象月）の請求分。金額は保存内容（未保存なら入力値か集計の機関合計）
  const currentInvoiceFor = (org: MonthlyBillingOrg): ReminderInvoiceRow => ({
    billedOn: invoiceBilledOn(month),
    invoiceNo: currentInvoiceNo.trim(),
    amount: Number(currentAmount) || org.total,
    paid: 0,
    dueOn: invoiceDueOn(month),
  });

  // 督促状はA4の印刷用ページで開く（文面と一覧表をそのまま印字できる）
  const reminderHref = (org: MonthlyBillingOrg): string =>
    `/sales/reminder?org=${encodeURIComponent(org.organizationId)}&month=${month}`;

  const [copiedOrgId, setCopiedOrgId] = useState<string | null>(null);
  const copyRemarks = async (org: MonthlyBillingOrg) => {
    const text = orgRemarks(org);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedOrgId(org.organizationId);
      setTimeout(() => setCopiedOrgId(null), 2000);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  // メモ（この月に請求しない理由など）。外国人×対象の年月ごとに保存する
  const saveNote = async (
    workerId: string,
    residenceStatus: string | null,
    note: string,
  ) => {
    setError(null);
    try {
      const row = await upsertMonthlySupportNote(createClient(), {
        worker_id: workerId,
        month,
        fee_name: feeNameFor(residenceStatus),
        note: note.trim(),
      });
      setRegs((prev) => ({ ...prev, [workerId]: row }));
    } catch (err) {
      setError(
        dbErrorMessage(
          err,
          "0069_monthly_support_note.sql",
          errorMessage(err, "メモの保存に失敗しました"),
        ),
      );
    }
  };

  // 「freee売上登録」ボタン: ◯月分の支援代を登録した記録を残す
  const registerMonthly = async (workerId: string, residenceStatus: string | null) => {
    setRegBusyId(workerId);
    setError(null);
    try {
      const row = await addMonthlySupportRegistration(createClient(), {
        worker_id: workerId,
        month,
        fee_name: feeNameFor(residenceStatus),
        registered_on: today,
      });
      setRegs((prev) => ({ ...prev, [workerId]: row }));
    } catch (err) {
      setError(
        dbErrorMessage(
          err,
          "0066_monthly_support_registrations.sql",
          errorMessage(err, "登録記録の保存に失敗しました"),
        ),
      );
    } finally {
      setRegBusyId(null);
    }
  };

  const unregisterMonthly = async (workerId: string) => {
    const reg = regs[workerId];
    if (!reg) return;
    setRegBusyId(workerId);
    setError(null);
    try {
      if (reg.note) {
        // メモが書かれている行は消さず、登録記録だけを取り消す
        await clearMonthlySupportRegistration(createClient(), reg.id);
        setRegs((prev) => ({ ...prev, [workerId]: { ...reg, registered_on: null } }));
      } else {
        await deleteMonthlySupportRegistration(createClient(), reg.id);
        setRegs((prev) => {
          const next = { ...prev };
          delete next[workerId];
          return next;
        });
      }
    } catch (err) {
      setError(errorMessage(err, "登録記録の取り消しに失敗しました"));
    } finally {
      setRegBusyId(null);
    }
  };

  // 支援代（月額）をこのページから所属機関に登録する（数字だけ）
  const saveOrgFee = async (orgId: string) => {
    const digits = feeDraft.replace(/[^0-9]/g, "");
    if (!digits || Number(digits) <= 0) {
      setError("支援代（月額）は数字だけで入力してください");
      return;
    }
    setFeeSaving(true);
    setError(null);
    try {
      const org = organizations.find((o) => o.id === orgId);
      await updateOrganization(createClient(), orgId, {
        intake: { ...(org?.intake ?? {}), support_fee: digits },
      });
      setOrgFees((prev) => ({ ...prev, [orgId]: digits }));
      setFeeDraft("");
    } catch (err) {
      setError(errorMessage(err, "支援代（月額）の保存に失敗しました"));
    } finally {
      setFeeSaving(false);
    }
  };

  const download = async (org?: MonthlyBillingOrg) => {
    setBusy(true);
    setError(null);
    try {
      const sheets = org ? orgBillingSheets(org, billing) : monthlyBillingSheets(billing);
      const blob = await buildXlsx(sheets);
      downloadBlob(blob, billingFileName(billing, org?.organizationName));
    } catch (err) {
      setError(errorMessage(err, "エクセルの書き出しに失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const saveSalesNo = async (workerId: string, value: string) => {
    setSalesNos((prev) => ({ ...prev, [workerId]: value }));
    try {
      await setWorkerRecurringSalesNo(createClient(), workerId, value.trim());
    } catch (err) {
      setError(errorMessage(err, "定期売上No.の保存に失敗しました"));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="status" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">対象の年月</span>
            <input
              type="month"
              value={month}
              onChange={(e) => changeMonth(e.target.value)}
              className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm"
            />
          </label>
          <Button
            icon={busy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            disabled={busy || billing.orgs.length === 0}
            onClick={() => void download()}
          >
            全機関のエクセル
          </Button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-muted">
          {monthLabel(month)}に1日でも在籍していた支援対象の1号特定技能外国人（特定活動（特定技能1号移行準備）を含む）を、
          所属機関ごとに並べています。 支援費は所属機関の「毎月の支援代」から計算し、
          その月に支援が始まった人は在留許可日から、退職した人は退職日までを日割りします（1日あたり＝月額÷その月の日数を小数点以下切り捨てで出してから、日数を掛けます）。
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">基準日</dt>
            <dd className="text-lg font-bold">{billing.monthEndOn}</dd>
          </div>
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">掲載人数</dt>
            <dd className="text-lg font-bold">{billing.totalPeople}名</dd>
            {billing.totalBillable < billing.totalPeople && (
              <dd className="text-[11px] text-muted">
                うち請求対象 {billing.totalBillable}名
              </dd>
            )}
          </div>
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">うち当月退職</dt>
            <dd className="text-lg font-bold">{billing.totalLeft}名</dd>
          </div>
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">支援費請求額合計</dt>
            <dd className="text-lg font-bold text-brand">{formatSalesYen(billing.totalAmount)}</dd>
          </div>
        </dl>

        {billing.unpriced.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              所属機関に「毎月の支援代」が未登録のため、{billing.unpriced.length}名の請求額が0円になっています（
              {[...new Set(billing.unpriced.map((r) => r.worker.name))].slice(0, 5).join("・")}
              {billing.unpriced.length > 5 && " ほか"}）。 所属機関の情報に支援代を登録してください。
            </span>
          </p>
        )}

        {/* 支援対象なのに名簿に載っていない人（理由つき）。「なぜ出てこない？」の確認用 */}
        {excluded.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowExcluded((v) => !v)}
              className="flex items-center gap-1 text-xs font-bold text-brand"
            >
              {showExcluded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              名簿に載っていない支援対象者 {excluded.length}名（理由を見る）
            </button>
            {showExcluded && (
              <ul className="mt-2 space-y-1.5 rounded-xl bg-background p-3 text-xs">
                {excluded.map(({ worker, reason }) => (
                  <li key={worker.id}>
                    <Link
                      href={`/workers/${worker.id}`}
                      className="font-bold underline-offset-2 hover:text-brand hover:underline"
                    >
                      {worker.name}
                    </Link>
                    <span className="text-muted">
                      （{orgNameById.get(worker.current_organization_id ?? "") ?? "所属機関未設定"}）
                      … {reason}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 当月許可者・当月退職者（エクセルの同名シートと同じ中身） */}
        <div className="mt-3 space-y-2">
          <div>
            <button
              type="button"
              onClick={() => setShowPermitted((v) => !v)}
              className="flex items-center gap-1 text-xs font-bold text-brand"
            >
              {showPermitted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              当月許可者リスト {permittedRows.length}名（在留許可日が{monthLabel(month)}の方）
            </button>
            {showPermitted && (
              <div className="mt-2 overflow-x-auto rounded-xl bg-background p-3">
                {permittedRows.length === 0 ? (
                  <p className="text-xs text-muted">当月に在留許可が下りた方はいません。</p>
                ) : (
                  <table className="w-full min-w-[620px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted">
                        <th className="py-1.5 pr-2 font-bold">許可日</th>
                        <th className="py-1.5 pr-2 font-bold">氏名</th>
                        <th className="py-1.5 pr-2 font-bold">所属機関</th>
                        <th className="py-1.5 pr-2 font-bold">在留資格</th>
                        <th className="py-1.5 pr-2 font-bold">在留期限</th>
                        <th className="py-1.5 pr-2 font-bold">区分</th>
                        <th className="py-1.5 text-right font-bold">支援費請求額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {permittedRows.map(({ org, row }) => (
                        <tr key={row.worker.id} className="border-b border-border/60">
                          <td className="py-1.5 pr-2 tabular-nums">
                            {row.worker.residence_permit_date ?? "—"}
                          </td>
                          <td className="py-1.5 pr-2">
                            <Link
                              href={`/workers/${row.worker.id}`}
                              className="font-bold underline-offset-2 hover:text-brand hover:underline"
                            >
                              {row.worker.name}
                            </Link>
                          </td>
                          <td className="py-1.5 pr-2">{org.organizationName}</td>
                          <td className="py-1.5 pr-2">{row.worker.residence_status}</td>
                          <td className="py-1.5 pr-2 tabular-nums">
                            {row.worker.residence_expiry_date ?? "—"}
                          </td>
                          <td className="py-1.5 pr-2">{row.kind}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatSalesYen(row.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowLeft((v) => !v)}
              className="flex items-center gap-1 text-xs font-bold text-brand"
            >
              {showLeft ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              当月退職者リスト {leftRows.length}名（退職日が{monthLabel(month)}の方）
            </button>
            {showLeft && (
              <div className="mt-2 overflow-x-auto rounded-xl bg-background p-3">
                {leftRows.length === 0 ? (
                  <p className="text-xs text-muted">当月に退職された方はいません。</p>
                ) : (
                  <table className="w-full min-w-[620px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted">
                        <th className="py-1.5 pr-2 font-bold">退職日</th>
                        <th className="py-1.5 pr-2 font-bold">氏名</th>
                        <th className="py-1.5 pr-2 font-bold">所属機関</th>
                        <th className="py-1.5 pr-2 font-bold">在留資格</th>
                        <th className="py-1.5 pr-2 font-bold">支援費算定期間</th>
                        <th className="py-1.5 pr-2 font-bold">日数</th>
                        <th className="py-1.5 text-right font-bold">支援費請求額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leftRows.map(({ org, row }) => (
                        <tr key={row.worker.id} className="border-b border-border/60">
                          <td className="py-1.5 pr-2 tabular-nums">{row.worker.leaving_on ?? "—"}</td>
                          <td className="py-1.5 pr-2">
                            <Link
                              href={`/workers/${row.worker.id}`}
                              className="font-bold underline-offset-2 hover:text-brand hover:underline"
                            >
                              {row.worker.name}
                            </Link>
                          </td>
                          <td className="py-1.5 pr-2">{org.organizationName}</td>
                          <td className="py-1.5 pr-2">{row.worker.residence_status}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{periodText(row)}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{daysText(row)}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatSalesYen(row.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 所属機関名で絞り込む（機関が増えても目的の会社にすぐ行けるように） */}
      {billing.orgs.length > 0 && (
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={orgQuery}
            onChange={(e) => setOrgQuery(e.target.value)}
            placeholder="所属機関名で検索（例: 國崎）"
            className="min-h-[44px] w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm"
          />
          {orgQuery && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
              {visibleOrgs.length}件
            </span>
          )}
        </div>
      )}

      {billing.orgs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          {monthLabel(month)}に在籍していた支援対象者がいません。
        </Card>
      ) : visibleOrgs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          「{orgQuery}」に一致する所属機関はありません。
        </Card>
      ) : (
        visibleOrgs.map((org) => {
          const open = openOrgId === org.organizationId;
          return (
            <Card key={org.organizationId || "none"} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenOrgId(open ? null : org.organizationId);
                    setFeeDraft("");
                    // 請求・入金の記録は機関ごとの内容なので切り替え時に閉じて消す
                    setShowReminder(false);
                    setOrgInvoices([]);
                    setCurrentInvoiceNo("");
                    setCurrentAmountExcl("");
                    setCurrentTax("");
                    setCurrentTaxFree("");
                    setCurrentAmount("");
                    setShowPastForm(false);
                    resetPastForm();
                  }}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  {open ? (
                    <ChevronDown size={16} className="shrink-0 text-muted" />
                  ) : (
                    <ChevronRight size={16} className="shrink-0 text-muted" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{org.organizationName}</span>
                    <span className="block text-xs text-muted">
                      {org.rows.length}名
                      {org.billableCount < org.rows.length &&
                        `（うち請求対象 ${org.billableCount}名）`}
                      {org.leftCount > 0 && `（うち当月退職 ${org.leftCount}名）`} ・{" "}
                      <span className="font-bold text-brand">{formatSalesYen(org.total)}</span>
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* 請求書（freee）の備考欄に貼る文章のコピー（許可おりた人・退職者） */}
                  {orgRemarks(org) && (
                    <button
                      type="button"
                      onClick={() => void copyRemarks(org)}
                      title="請求書の備考欄に貼る文章（許可おりた人・退職者）をコピーします"
                      className="flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-brand"
                    >
                      {copiedOrgId === org.organizationId ? <Check size={14} /> : <Copy size={14} />}
                      {copiedOrgId === org.organizationId ? "コピーしました" : "備考欄"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void download(org)}
                    className="flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-brand disabled:opacity-50"
                  >
                    <Download size={14} />
                    この機関のみ
                  </button>
                </div>
              </div>

              {open && canEdit && org.organizationId && (org.rows[0]?.monthlyFee ?? 0) <= 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span className="font-bold">支援代（月額）が未登録です。ここから登録できます:</span>
                  <input
                    value={feeDraft}
                    onChange={(e) => setFeeDraft(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    placeholder="例: 12000"
                    className="min-h-[32px] w-28 rounded-lg border border-border bg-surface px-2 text-xs text-foreground focus:border-brand focus:outline-none"
                  />
                  <span>円</span>
                  <button
                    type="button"
                    disabled={feeSaving || !feeDraft}
                    onClick={() => void saveOrgFee(org.organizationId)}
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
                  >
                    {feeSaving ? "保存中…" : "保存"}
                  </button>
                  <span className="text-[10px]">所属機関の「毎月の支援代」に保存され、集計にすぐ反映されます</span>
                </div>
              )}

              {/* 請求・入金の記録と督促状の作成。記録は月ごとに保存され積み上がっていく */}
              {open && canEdit && (
                <div className="mt-2 rounded-xl border border-border p-3">
                  <button
                    type="button"
                    onClick={() => void toggleReminder(org)}
                    className="flex items-center gap-1 text-xs font-bold text-brand"
                  >
                    {showReminder ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    請求・入金の記録と督促状（未入金のご確認）
                  </button>
                  {showReminder && (
                    <div className="mt-2 space-y-3">
                      <p className="text-[11px] leading-relaxed text-muted">
                        今回の請求書番号と実際の請求金額を保存すると、月ごとの記録として残ります。
                        入金があったら入金済み額・入金日を記録してください（「全額入金」で一括記録）。
                        残額が残っている請求は督促状の一覧に自動で載り、参考合計は今回のご請求と合算した金額になります。
                        請求日は対象月の翌月1日、支払期限はその月末です（例: 対象月2026年6月 → 請求日2026年7月1日）。
                        金額は<b>税抜（課税対象）・消費税・非課税</b>に分けて入れてください（上の集計・名簿は税抜です）。
                        非課税は特定技能総合保険など消費税がかからない項目です。
                        入金日を入れると、その入金に対する領収書を発行できます。
                        過去の未入金分は「過去分の請求を追加」から対象の年月を選んで登録できます。
                        表の請求書番号・請求金額はあとから直接直せます（欄から離れると保存されます）。
                      </p>

                      {/* 今回（対象月）の請求の保存 */}
                      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-background p-2.5">
                        <div className="leading-tight">
                          <span className="text-xs font-bold">{monthLabel(month)}分の請求</span>
                          <span className="block text-[10px] text-muted">
                            請求日 {ymdText(invoiceBilledOn(month))}
                          </span>
                        </div>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold text-muted">請求書番号</span>
                          <input
                            value={currentInvoiceNo}
                            onChange={(e) => setCurrentInvoiceNo(e.target.value)}
                            placeholder="INV-…"
                            className="min-h-[36px] w-40 rounded-lg border border-border bg-surface px-2 text-xs"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold text-muted">
                            税抜金額（集計 {formatSalesYen(org.total)}）
                          </span>
                          <input
                            value={currentAmountExcl}
                            onChange={(e) =>
                              setExclAndFill(
                                e.target.value,
                                currentTaxFree,
                                setCurrentAmountExcl,
                                setCurrentTax,
                                setCurrentAmount,
                              )
                            }
                            inputMode="numeric"
                            className="min-h-[36px] w-28 rounded-lg border border-border bg-surface px-2 text-right text-xs tabular-nums"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold text-muted">消費税額</span>
                          <input
                            value={currentTax}
                            onChange={(e) =>
                              setTaxAndFill(
                                e.target.value,
                                currentAmountExcl,
                                currentTaxFree,
                                setCurrentTax,
                                setCurrentAmount,
                              )
                            }
                            inputMode="numeric"
                            className="min-h-[36px] w-24 rounded-lg border border-border bg-surface px-2 text-right text-xs tabular-nums"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold text-muted">非課税額</span>
                          <input
                            value={currentTaxFree}
                            onChange={(e) =>
                              setTaxFreeAndFill(
                                e.target.value,
                                currentAmountExcl,
                                currentTax,
                                setCurrentTaxFree,
                                setCurrentAmount,
                              )
                            }
                            inputMode="numeric"
                            placeholder="0"
                            title="特定技能総合保険など消費税がかからない項目"
                            className="min-h-[36px] w-24 rounded-lg border border-border bg-surface px-2 text-right text-xs tabular-nums"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold text-muted">税込金額（請求額）</span>
                          <input
                            value={currentAmount}
                            onChange={(e) => setCurrentAmount(digits(e.target.value))}
                            inputMode="numeric"
                            className="min-h-[36px] w-28 rounded-lg border border-border bg-surface px-2 text-right text-xs font-bold tabular-nums"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={invBusy}
                          onClick={() => void saveCurrentInvoice(org)}
                          className="min-h-[36px] rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-50"
                        >
                          {invBusy ? "保存中…" : "保存"}
                        </button>
                        {orgInvoices.some((r) => r.month === month) && (
                          <span className="text-[11px] font-bold text-status-approved-fg">保存済み</span>
                        )}
                        {currentAmount &&
                          !taxBreakdownMatches(
                            Number(currentAmountExcl) || 0,
                            Number(currentTax) || 0,
                            Number(currentTaxFree) || 0,
                            Number(currentAmount) || 0,
                          ) && (
                            <span className="w-full text-[11px] font-bold text-seal">
                              税抜 {formatSalesYen(Number(currentAmountExcl) || 0)} ＋ 消費税{" "}
                              {formatSalesYen(Number(currentTax) || 0)} ＋ 非課税{" "}
                              {formatSalesYen(Number(currentTaxFree) || 0)} が税込{" "}
                              {formatSalesYen(Number(currentAmount) || 0)} と合いません。請求書の金額をご確認ください。
                            </span>
                          )}
                      </div>

                      {/* 過去分の請求をあとから登録する（過去の未入金を督促状に載せるため） */}
                      <div className="rounded-lg border border-dashed border-border p-2.5">
                        <button
                          type="button"
                          onClick={() => setShowPastForm((v) => !v)}
                          className="flex items-center gap-1 text-xs font-bold text-brand"
                        >
                          {showPastForm ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          過去分の請求を追加（未入金の記録を入れる）
                        </button>
                        {showPastForm && (
                          <div className="mt-2 space-y-2">
                            <p className="text-[11px] leading-relaxed text-muted">
                              このシステムを使う前に請求した分など、過去の請求をあとから登録できます。
                              入金がまだなら入金済み額は空のままにしてください（残額がそのまま督促状に載ります）。
                              一部だけ入金があった場合は、その金額と入金日を入れてください。
                            </p>
                            <div className="flex flex-wrap items-end gap-2">
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-muted">対象の年月</span>
                                <input
                                  type="month"
                                  value={pastMonth}
                                  max={month}
                                  onChange={(e) => setPastMonth(e.target.value)}
                                  className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs"
                                />
                              </label>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-muted">請求日</span>
                                <span className="flex min-h-[36px] items-center text-xs tabular-nums">
                                  {isMonthStr(pastMonth) ? ymdText(invoiceBilledOn(pastMonth)) : "—"}
                                </span>
                              </div>
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-muted">請求書番号</span>
                                <input
                                  value={pastInvoiceNo}
                                  onChange={(e) => setPastInvoiceNo(e.target.value)}
                                  placeholder="INV-…"
                                  className="min-h-[36px] w-40 rounded-lg border border-border bg-surface px-2 text-xs"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-muted">税抜金額</span>
                                <input
                                  value={pastAmountExcl}
                                  onChange={(e) =>
                                    setExclAndFill(
                                      e.target.value,
                                      pastTaxFree,
                                      setPastAmountExcl,
                                      setPastTax,
                                      setPastAmount,
                                    )
                                  }
                                  inputMode="numeric"
                                  placeholder="0"
                                  className="min-h-[36px] w-28 rounded-lg border border-border bg-surface px-2 text-right text-xs tabular-nums"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-muted">消費税額</span>
                                <input
                                  value={pastTax}
                                  onChange={(e) =>
                                    setTaxAndFill(
                                      e.target.value,
                                      pastAmountExcl,
                                      pastTaxFree,
                                      setPastTax,
                                      setPastAmount,
                                    )
                                  }
                                  inputMode="numeric"
                                  placeholder="0"
                                  className="min-h-[36px] w-24 rounded-lg border border-border bg-surface px-2 text-right text-xs tabular-nums"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-muted">非課税額</span>
                                <input
                                  value={pastTaxFree}
                                  onChange={(e) =>
                                    setTaxFreeAndFill(
                                      e.target.value,
                                      pastAmountExcl,
                                      pastTax,
                                      setPastTaxFree,
                                      setPastAmount,
                                    )
                                  }
                                  inputMode="numeric"
                                  placeholder="0"
                                  title="特定技能総合保険など消費税がかからない項目"
                                  className="min-h-[36px] w-24 rounded-lg border border-border bg-surface px-2 text-right text-xs tabular-nums"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-muted">税込金額（請求額）</span>
                                <input
                                  value={pastAmount}
                                  onChange={(e) => setPastAmount(digits(e.target.value))}
                                  inputMode="numeric"
                                  placeholder="0"
                                  className="min-h-[36px] w-28 rounded-lg border border-border bg-surface px-2 text-right text-xs font-bold tabular-nums"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-muted">
                                  入金済み額（税込・任意）
                                </span>
                                <input
                                  value={pastPaid}
                                  onChange={(e) => setPastPaid(e.target.value.replace(/[^0-9]/g, ""))}
                                  inputMode="numeric"
                                  placeholder="0"
                                  className="min-h-[36px] w-28 rounded-lg border border-border bg-surface px-2 text-right text-xs tabular-nums"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-muted">入金日（任意）</span>
                                <input
                                  type="date"
                                  value={pastPaidOn}
                                  onChange={(e) => setPastPaidOn(e.target.value)}
                                  className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs"
                                />
                              </label>
                              <button
                                type="button"
                                disabled={invBusy || !pastMonth}
                                onClick={() => void savePastInvoice(org)}
                                className="min-h-[36px] rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-50"
                              >
                                {invBusy ? "保存中…" : "この月を追加"}
                              </button>
                            </div>
                            {pastAmount &&
                              !taxBreakdownMatches(
                                Number(pastAmountExcl) || 0,
                                Number(pastTax) || 0,
                                Number(pastTaxFree) || 0,
                                Number(pastAmount) || 0,
                              ) && (
                                <p className="text-[11px] font-bold text-seal">
                                  税抜 ＋ 消費税 ＋ 非課税 が税込と合っていません。請求書の金額をご確認ください。
                                </p>
                              )}
                            {pastMonth && orgInvoices.some((r) => r.month === pastMonth) && (
                              <p className="text-[11px] font-bold text-seal">
                                {monthLabel(pastMonth)}分はすでに記録があります。保存すると上書きされます。
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 保存済みの請求と入金の記録（新しい月から） */}
                      {invLoading ? (
                        <p className="flex items-center gap-1.5 text-xs text-muted">
                          <Loader2 size={13} className="animate-spin" />
                          読み込み中…
                        </p>
                      ) : orgInvoices.length === 0 ? (
                        <p className="text-xs text-muted">
                          まだ記録がありません。上の「保存」で今回分から、
                          「過去分の請求を追加」で以前の未入金分から記録を始められます。
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1120px] border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-border text-left text-muted">
                                <th className="py-1.5 pr-2 font-bold">対象月</th>
                                <th className="py-1.5 pr-2 font-bold">請求日</th>
                                <th className="py-1.5 pr-2 font-bold">請求書番号</th>
                                <th className="py-1.5 pr-2 text-right font-bold">税抜金額</th>
                                <th className="py-1.5 pr-2 text-right font-bold">消費税額</th>
                                <th className="py-1.5 pr-2 text-right font-bold">非課税額</th>
                                <th className="py-1.5 pr-2 text-right font-bold">税込金額</th>
                                <th className="py-1.5 pr-2 text-right font-bold">入金済み額（税込）</th>
                                <th className="py-1.5 pr-2 font-bold">入金日</th>
                                <th className="py-1.5 pr-2 text-right font-bold">残額</th>
                                <th className="py-1.5 pr-2 font-bold">状態</th>
                                <th className="py-1.5 font-bold" />
                              </tr>
                            </thead>
                            <tbody>
                              {orgInvoices.map((inv) => {
                                const remaining = Math.max(inv.amount - inv.paid, 0);
                                return (
                                  <tr key={inv.id} className="border-b border-border/60">
                                    <td className="py-1.5 pr-2 tabular-nums">{monthLabel(inv.month)}</td>
                                    <td className="py-1.5 pr-2 tabular-nums">
                                      {ymdText(invoiceBilledOn(inv.month))}
                                    </td>
                                    <td className="py-1.5 pr-2">
                                      <input
                                        key={`${inv.id}-no-${inv.invoice_no}`}
                                        defaultValue={inv.invoice_no}
                                        onBlur={(e) => {
                                          const v = e.target.value.trim();
                                          if (v !== inv.invoice_no) void patchInvoice(inv.id, { invoice_no: v });
                                        }}
                                        placeholder="INV-…"
                                        className="w-36 rounded-lg border border-border bg-background px-1.5 py-1 text-xs"
                                      />
                                    </td>
                                    <td className="py-1.5 pr-2 text-right">
                                      <input
                                        key={`${inv.id}-excl-${inv.amount_excl}`}
                                        defaultValue={inv.amount_excl ? String(inv.amount_excl) : ""}
                                        onBlur={(e) => {
                                          const v = Number(digits(e.target.value)) || 0;
                                          if (v === inv.amount_excl) return;
                                          // 税抜を直したら消費税と税込も合わせて入れ直す
                                          const t = taxFromExcl(v);
                                          void patchInvoice(inv.id, {
                                            amount_excl: v,
                                            tax: t,
                                            amount: v + t + inv.tax_free,
                                          });
                                        }}
                                        inputMode="numeric"
                                        placeholder="0"
                                        className="w-24 rounded-lg border border-border bg-background px-1.5 py-1 text-right text-xs tabular-nums"
                                      />
                                    </td>
                                    <td className="py-1.5 pr-2 text-right">
                                      <input
                                        key={`${inv.id}-tax-${inv.tax}`}
                                        defaultValue={inv.tax ? String(inv.tax) : ""}
                                        onBlur={(e) => {
                                          const v = Number(digits(e.target.value)) || 0;
                                          if (v === inv.tax) return;
                                          void patchInvoice(inv.id, {
                                            tax: v,
                                            amount: inv.amount_excl + v + inv.tax_free,
                                          });
                                        }}
                                        inputMode="numeric"
                                        placeholder="0"
                                        className="w-20 rounded-lg border border-border bg-background px-1.5 py-1 text-right text-xs tabular-nums"
                                      />
                                    </td>
                                    <td className="py-1.5 pr-2 text-right">
                                      <input
                                        key={`${inv.id}-free-${inv.tax_free}`}
                                        defaultValue={inv.tax_free ? String(inv.tax_free) : ""}
                                        onBlur={(e) => {
                                          const v = Number(digits(e.target.value)) || 0;
                                          if (v === inv.tax_free) return;
                                          void patchInvoice(inv.id, {
                                            tax_free: v,
                                            amount: inv.amount_excl + inv.tax + v,
                                          });
                                        }}
                                        inputMode="numeric"
                                        placeholder="0"
                                        title="特定技能総合保険など消費税がかからない項目"
                                        className="w-20 rounded-lg border border-border bg-background px-1.5 py-1 text-right text-xs tabular-nums"
                                      />
                                    </td>
                                    <td className="py-1.5 pr-2 text-right">
                                      <input
                                        key={`${inv.id}-amt-${inv.amount}`}
                                        defaultValue={inv.amount ? String(inv.amount) : ""}
                                        onBlur={(e) => {
                                          const v = Number(digits(e.target.value)) || 0;
                                          if (v !== inv.amount) void patchInvoice(inv.id, { amount: v });
                                        }}
                                        inputMode="numeric"
                                        placeholder="0"
                                        className={`w-24 rounded-lg border bg-background px-1.5 py-1 text-right text-xs font-bold tabular-nums ${
                                          taxBreakdownMatches(
                                            inv.amount_excl,
                                            inv.tax,
                                            inv.tax_free,
                                            inv.amount,
                                          )
                                            ? "border-border"
                                            : "border-seal text-seal"
                                        }`}
                                        title={
                                          taxBreakdownMatches(
                                            inv.amount_excl,
                                            inv.tax,
                                            inv.tax_free,
                                            inv.amount,
                                          )
                                            ? undefined
                                            : "税抜＋消費税＋非課税が税込と合っていません"
                                        }
                                      />
                                    </td>
                                    <td className="py-1.5 pr-2 text-right">
                                      <input
                                        key={`${inv.id}-${inv.paid}`}
                                        defaultValue={inv.paid ? String(inv.paid) : ""}
                                        onBlur={(e) => {
                                          const v = Number(e.target.value.replace(/[^0-9]/g, "")) || 0;
                                          if (v !== inv.paid) void patchInvoice(inv.id, { paid: v });
                                        }}
                                        inputMode="numeric"
                                        placeholder="0"
                                        className="w-24 rounded-lg border border-border bg-background px-1.5 py-1 text-right text-xs tabular-nums"
                                      />
                                    </td>
                                    <td className="py-1.5 pr-2">
                                      <input
                                        type="date"
                                        value={inv.paid_on ?? ""}
                                        onChange={(e) =>
                                          void patchInvoice(inv.id, { paid_on: e.target.value || null })
                                        }
                                        className="rounded-lg border border-border bg-background px-1.5 py-1 text-xs"
                                      />
                                    </td>
                                    <td className="py-1.5 pr-2 text-right font-bold tabular-nums">
                                      {formatSalesYen(remaining)}
                                    </td>
                                    <td className="py-1.5 pr-2">
                                      {remaining === 0 && inv.amount > 0 ? (
                                        <span className="rounded-full bg-status-approved-bg px-2 py-0.5 text-[10px] font-bold text-status-approved-fg">
                                          入金済み
                                        </span>
                                      ) : inv.paid > 0 ? (
                                        <span className="rounded-full bg-status-notice-bg px-2 py-0.5 text-[10px] font-bold text-status-notice-fg">
                                          一部入金
                                        </span>
                                      ) : inv.month === month ? (
                                        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-bold text-muted ring-1 ring-border">
                                          請求中
                                        </span>
                                      ) : (
                                        <span className="rounded-full bg-seal/10 px-2 py-0.5 text-[10px] font-bold text-seal">
                                          未入金
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 text-right">
                                      {remaining > 0 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void patchInvoice(inv.id, { paid: inv.amount, paid_on: today })
                                          }
                                          className="mr-2 text-[10px] font-bold text-brand underline"
                                        >
                                          全額入金
                                        </button>
                                      )}
                                      {/* 入金日が入っている記録は、その入金に対する領収書を発行できる */}
                                      {inv.paid > 0 && inv.paid_on && (
                                        <Link
                                          href={`/sales/receipt?org=${encodeURIComponent(
                                            org.organizationId,
                                          )}&month=${inv.month}`}
                                          className="mr-2 text-[10px] font-bold text-brand underline"
                                        >
                                          領収書
                                        </Link>
                                      )}
                                      <button
                                        type="button"
                                        aria-label="この記録を削除"
                                        onClick={() => void removeInvoice(inv.id)}
                                        className="text-[10px] font-bold text-seal underline"
                                      >
                                        削除
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-bold">
                          未入金の残額合計（今回分を除く）:{" "}
                          <span className="text-seal">
                            {formatSalesYen(savedUnpaidRows().reduce((s2, r) => s2 + (r.amount - r.paid), 0))}
                          </span>
                        </span>
                        <span className="text-xs font-bold">
                          参考合計（今回分と合算）:{" "}
                          <span className="text-brand">
                            {formatSalesYen(
                              reminderTotal({ unpaid: savedUnpaidRows(), current: currentInvoiceFor(org) }),
                            )}
                          </span>
                        </span>
                        {savedUnpaidRows().length > 0 ? (
                          <Link
                            href={reminderHref(org)}
                            className="ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground"
                          >
                            <Printer size={16} />
                            督促状を印刷
                          </Link>
                        ) : (
                          <span className="ml-auto inline-flex min-h-[44px] cursor-not-allowed items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground opacity-50">
                            <Printer size={16} />
                            督促状を印刷
                          </span>
                        )}
                      </div>
                      {savedUnpaidRows().length === 0 && (
                        <p className="text-[11px] text-muted">
                          残額が残っている過去の請求がないため、督促状は作成できません（未入金が出たときに使えます）。
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 備考欄のプレビュー（コピーされる内容の確認用） */}
              {open && orgRemarks(org) && (
                <div className="mt-2 rounded-xl bg-background p-3">
                  <p className="mb-1 text-[11px] font-bold text-muted">請求書の備考欄（コピー用）</p>
                  <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed">
                    {orgRemarks(org)}
                  </pre>
                </div>
              )}

              {open && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[1120px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted">
                        <th className="py-1.5 pr-2 font-bold">氏名</th>
                        <th className="py-1.5 pr-2 font-bold">在留資格</th>
                        <th className="py-1.5 pr-2 font-bold">
                          <button
                            type="button"
                            onClick={() =>
                              setSalesNoSort((s) =>
                                s === null ? "asc" : s === "asc" ? "desc" : null,
                              )
                            }
                            title="クリックで 昇順 → 降順 → 氏名順 に切り替え"
                            className="inline-flex items-center gap-1 font-bold hover:text-brand"
                          >
                            定期売上No.
                            {salesNoSort === "asc" ? (
                              <ArrowUp size={12} />
                            ) : salesNoSort === "desc" ? (
                              <ArrowDown size={12} />
                            ) : (
                              <ArrowUpDown size={12} className="opacity-50" />
                            )}
                          </button>
                        </th>
                        <th className="py-1.5 pr-2 font-bold">許可売上No.</th>
                        <th className="py-1.5 pr-2 font-bold">保険No.</th>
                        <th className="py-1.5 pr-2 text-right font-bold">支援代（月額）</th>
                        <th className="py-1.5 pr-2 font-bold">支援費算定期間</th>
                        <th className="py-1.5 pr-2 font-bold">日数</th>
                        <th className="py-1.5 pr-2 font-bold">区分</th>
                        <th className="py-1.5 pr-2 text-right font-bold">支援費請求額</th>
                        <th className="py-1.5 pr-2 font-bold">メモ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortRows(org.rows).map((row) => (
                        <tr key={row.worker.id} className="border-b border-border/60">
                          <td className="py-1.5 pr-2">
                            <Link
                              href={`/workers/${row.worker.id}`}
                              className="font-bold underline-offset-2 hover:text-brand hover:underline"
                            >
                              {row.worker.name}
                            </Link>
                            {/* 対象の年月に許可が下りた人はグリーンのバッジで表示 */}
                            {permitInMonth(row.worker.residence_permit_date) && (
                              <span className="ml-1 rounded-full bg-status-approved-bg px-1.5 py-0.5 text-[10px] font-bold text-status-approved-fg">
                                許可日 {mdText(row.worker.residence_permit_date ?? "")}
                              </span>
                            )}
                            {row.leftThisMonth && (
                              <span className="ml-1 rounded-full bg-seal/10 px-1.5 py-0.5 text-[10px] font-bold text-seal">
                                退職 {row.worker.leaving_on}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-muted">{row.worker.residence_status}</td>
                          <td className="py-1.5 pr-2">
                            <div className="flex items-center gap-1.5">
                              {canEdit ? (
                                <input
                                  defaultValue={row.worker.recurring_sales_no}
                                  onBlur={(e) => {
                                    const v = e.target.value;
                                    if (v !== row.worker.recurring_sales_no) {
                                      void saveSalesNo(row.worker.id, v);
                                    }
                                  }}
                                  placeholder="SP-…"
                                  className={`w-36 rounded-lg border px-1.5 py-1 text-xs ${
                                    row.worker.recurring_sales_no
                                      ? "border-border bg-background"
                                      : "border-seal/40 bg-seal/5"
                                  }`}
                                />
                              ) : (
                                <span className="text-muted">{row.worker.recurring_sales_no || "—"}</span>
                              )}
                              {/* ◯月分の支援代をfreeeに登録した記録（登録漏れ・二重登録の防止）。
                                  支援対象外は請求しないので出さない */}
                              {!row.billable ? null : regs[row.worker.id]?.registered_on ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-approved-bg px-2 py-0.5 text-[10px] font-bold text-status-approved-fg">
                                  <Check size={11} />
                                  {monthNum}月分の{regs[row.worker.id].fee_name}登録済み
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => void unregisterMonthly(row.worker.id)}
                                      disabled={regBusyId === row.worker.id}
                                      className="ml-0.5 underline"
                                    >
                                      取消
                                    </button>
                                  )}
                                </span>
                              ) : (
                                canEdit && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void registerMonthly(row.worker.id, row.worker.residence_status)
                                    }
                                    disabled={regBusyId === row.worker.id}
                                    title={`freeeに${monthNum}月分の${feeNameFor(row.worker.residence_status)}を登録したら押して記録します`}
                                    className="shrink-0 rounded-lg border border-brand px-2 py-1 text-[10px] font-bold text-brand disabled:opacity-50"
                                  >
                                    freee売上登録
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                          {/* 許可売上No.・保険No.（売上明細の伝票番号をその場で直せる） */}
                          <SalesNoCell
                            entry={salesNos2[row.worker.id]?.permit ?? null}
                            canEdit={canEdit}
                            placeholder="許可売上No."
                            onSave={(v, entryId) =>
                              void saveEntryNo(row.worker.id, "permit", entryId, v)
                            }
                          />
                          <SalesNoCell
                            entry={salesNos2[row.worker.id]?.insurance ?? null}
                            canEdit={canEdit}
                            placeholder="保険No."
                            onSave={(v, entryId) =>
                              void saveEntryNo(row.worker.id, "insurance", entryId, v)
                            }
                          />
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {row.monthlyFee > 0 ? formatSalesYen(row.monthlyFee) : "未登録"}
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums text-muted">{periodText(row)}</td>
                          <td className="py-1.5 pr-2 tabular-nums text-muted">{daysText(row)}</td>
                          <td className="py-1.5 pr-2 text-muted">{row.kind}</td>
                          <td className="py-1.5 pr-2 text-right font-bold tabular-nums">
                            {formatSalesYen(row.amount)}
                            {/* 日割りの行は計算式を添える（退職日まで日割・許可日から日割） */}
                            {row.kind.includes("日割") && row.monthlyFee > 0 && (
                              <span className="block text-[10px] font-normal text-muted">
                                {formatSalesYen(row.monthlyFee)}÷{row.monthDays}日=
                                {formatSalesYen(dailyFee(row.monthlyFee, row.monthDays))}
                                （切り捨て）×{row.days}日
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            {/* 請求しない場合の理由などを外国人×対象の年月ごとに残せる */}
                            {canEdit ? (
                              <input
                                key={`${row.worker.id}-${month}`}
                                defaultValue={regs[row.worker.id]?.note ?? ""}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v !== (regs[row.worker.id]?.note ?? "")) {
                                    void saveNote(row.worker.id, row.worker.residence_status, v);
                                  }
                                }}
                                placeholder="請求しない理由など"
                                className="w-40 rounded-lg border border-border bg-background px-1.5 py-1 text-xs"
                              />
                            ) : (
                              <span className="text-muted">{regs[row.worker.id]?.note || "—"}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={7} className="py-1.5 pr-2 text-right font-bold">
                          合計
                        </td>
                        <td className="py-1.5 pr-2 text-right font-bold tabular-nums text-brand">
                          {formatSalesYen(org.total)}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

// 許可売上No.・保険No.の1マス。売上明細の行があればその場で直せる。
// 明細が無い人は空欄のまま（申請詳細の売上登録で作られる）
function SalesNoCell({
  entry,
  canEdit,
  placeholder,
  onSave,
}: {
  entry: { entryId: string; freeeNo: string; itemName: string } | null;
  canEdit: boolean;
  placeholder: string;
  onSave: (value: string, entryId: string) => void;
}) {
  if (!entry) {
    return (
      <td className="py-1.5 pr-2 text-muted" title="売上明細がまだありません（申請詳細の売上登録で作られます）">
        —
      </td>
    );
  }
  if (!canEdit) {
    return <td className="py-1.5 pr-2 tabular-nums">{entry.freeeNo || "—"}</td>;
  }
  return (
    <td className="py-1.5 pr-2">
      <input
        key={`${entry.entryId}-${entry.freeeNo}`}
        defaultValue={entry.freeeNo}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== entry.freeeNo) onSave(v, entry.entryId);
        }}
        placeholder={placeholder}
        title={entry.itemName}
        className={`w-32 rounded-lg border px-1.5 py-1 text-xs ${
          entry.freeeNo ? "border-border bg-background" : "border-seal/40 bg-seal/5"
        }`}
      />
    </td>
  );
}
