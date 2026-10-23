"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Download, Loader2, Mail, MessageCircle, Plus, Receipt } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import { messengerWebUrl } from "@/lib/messenger-link";
import { displayTodoNo, type TodoStatusOption } from "@/lib/todo";
import { fillXlsxTemplate } from "@/lib/xlsx-form-fill";
import type { SswSalesRow } from "@/lib/supabase/queries/ssw-insurance";
import {
  SSW_CANCEL_FORM_MAX_ROWS,
  SSW_CANCEL_MAILED_STATUS,
  SSW_CANCEL_MAIL_TO,
  SSW_STATE_LABELS,
  sswCancelMailToText,
  SSW_UPLOAD_MAX_ROWS,
  slashDate,
  sswCancelFormCells,
  sswCancelFormRow,
  sswColumnOf,
  sswRowTodo,
  sswStartOnFromPaidOn,
  sswInsuranceMonths,
  sswUploadCells,
  sswUploadRow,
  type SswInsuranceRow,
  type SswInsuranceWorker,
} from "@/lib/ssw-insurance";
import { updateSswInsurance } from "@/lib/supabase/queries/ssw-insurance";
import { registerSswCert } from "./actions";

// 特定技能総合保険の画面（案A）の部品。申込サイトの2つの画面と同じ並びにする。
//  ・SswTabBar: 加入手続き／解約手続き／加入中／加入しない
//  ・SswJoinTable: ① 加入の申込に入れる内容（被保険者情報の並び）＋申込用のファイルを出力
//  ・SswResultTable: ② 加入の結果を登録（被保険者検索の並び）
//  ・SswCancelTable: 退職した人の解約手続き

const MIGRATION = "0171_ssw_insurance_apply.sql";
const TEMPLATE_URL = "/forms/ssw-insurance-upload.xlsx";
// 解約の届出書（変更（解約）届出書）のひな形。被保険者の枠は10人分
const CANCEL_TEMPLATE_URL = "/forms/ssw-insurance-cancel.xlsx";

// 作ったファイルに名前を付けて保存する（すぐにURLを消すとファイル名が付かないことがあるので少し待つ）
function downloadXlsx(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TH = "border border-[#9fd3e0] bg-[#d7eef4] px-2 py-2 text-[11px] font-bold text-foreground";
const TD = "border border-border px-2 py-1.5 align-middle";
const CELL_INPUT =
  "min-h-[32px] w-full min-w-0 rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none disabled:opacity-60";
const SMALL_BTN =
  "rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-bold text-brand hover:border-brand disabled:opacity-50";

export type SswTabKey = "join" | "cancel" | "active" | "declined";

// 氏名の欄（加入手続き・解約手続きの表で共通）。
// 氏名のリンク・コピーの下に、本人への連絡用に Messenger のリンクを出す（外国人情報に登録があるときだけ）
function SswNameCell({ worker: w }: { worker: Pick<SswInsuranceWorker, "id" | "name" | "messenger_link"> }) {
  return (
    <div>
      <span className="flex items-center gap-1">
        <Link href={`/workers/${w.id}`} className="font-bold text-brand hover:underline">
          {w.name}
        </Link>
        <CopyButton value={w.name} label={`${w.name}の氏名をコピー`} size={12} className="inline-flex" />
      </span>
      {w.messenger_link && (
        <a
          href={messengerWebUrl(w.messenger_link)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-brand hover:underline"
          title={`${w.name}さんの Messenger を開く`}
        >
          <MessageCircle size={11} />
          Messenger
        </a>
      )}
    </div>
  );
}

export function SswTabBar({
  tab,
  counts,
  onChange,
}: {
  tab: SswTabKey;
  counts: Record<SswTabKey, number>;
  onChange: (tab: SswTabKey) => void;
}) {
  const tabs: { key: SswTabKey; label: string }[] = [
    { key: "join", label: "加入手続き" },
    { key: "cancel", label: "解約手続き" },
    { key: "active", label: "加入中" },
    { key: "declined", label: "加入しない" },
  ];
  return (
    <div role="tablist" aria-label="特定技能総合保険" className="flex gap-0.5 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={tab === t.key}
          onClick={() => onChange(t.key)}
          className={`flex min-h-[48px] shrink-0 items-center gap-1.5 border-b-[3px] px-4 text-sm font-bold ${
            tab === t.key ? "border-brand text-brand" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {t.label}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              t.key === "cancel" && counts.cancel > 0 ? "bg-seal text-seal-foreground" : "bg-background text-muted"
            }`}
          >
            {counts[t.key]}
          </span>
        </button>
      ))}
    </div>
  );
}

// 経過（TODO）の欄: TODOがあれば経過を選ぶ、無ければTODOを作るボタン
function TodoCell({
  row,
  title,
  canEdit,
  statusOptions,
  onMakeTodo,
  onTodoStatus,
}: {
  row: SswInsuranceRow;
  title: string;
  canEdit: boolean;
  statusOptions: TodoStatusOption[];
  onMakeTodo: (title: string) => void;
  onTodoStatus: (todoId: string, status: string) => void;
}) {
  const todo = sswRowTodo(row);
  if (!todo) {
    return canEdit ? (
      <button type="button" className={SMALL_BTN} onClick={() => onMakeTodo(title)}>
        <Plus size={11} className="mr-0.5 inline" />
        TODOを作成
      </button>
    ) : (
      <span className="text-muted">―</span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      <Link href="/todos" className="text-[10px] font-bold text-brand hover:underline">
        {displayTodoNo(todo.todo_no)}
      </Link>
      <select
        value={todo.status}
        disabled={!canEdit}
        onChange={(e) => onTodoStatus(todo.id, e.target.value)}
        className={`${CELL_INPUT} min-w-[6.5rem]`}
        aria-label={`${row.worker.name}の経過`}
      >
        {statusOptions.some((o) => o.name === todo.status) ? null : <option value={todo.status}>{todo.status}</option>}
        {statusOptions.map((o) => (
          <option key={o.id} value={o.name}>
            {o.name}
          </option>
        ))}
      </select>
    </span>
  );
}

function StateBadge({ row, today }: { row: SswInsuranceRow; today: string }) {
  const tone =
    row.state === "expired" || row.state === "cancel"
      ? "bg-seal/10 text-seal"
      : row.state === "soon"
        ? "bg-status-notice-bg text-status-notice-fg"
        : "bg-background text-muted";
  const expiry = row.worker.ssw_insurance_expiry_date;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>{SSW_STATE_LABELS[row.state]}</span>
      {expiry && <span className="text-[10px] text-muted">{expiry < today ? "期限 " : "〜"}{slashDate(expiry)}</span>}
    </span>
  );
}

// 保険売上No.（請求書作成の名簿の「保険No.」と同じ売上明細・kind='保険'）。
// いちばん新しい売上の番号を出し、無ければここから入力して売上明細を作る（請求書作成にもそのまま出る）
function SswSalesNoCell({
  worker,
  sale,
  canEdit,
  onSave,
}: {
  worker: Pick<SswInsuranceWorker, "id" | "name">;
  sale: SswSalesRow | undefined; // いちばん新しい保険の売上
  canEdit: boolean;
  onSave: (value: string, entryId: string) => Promise<void>;
}) {
  const saved = sale?.freee_no ?? "";
  const [value, setValue] = useState(saved);
  const [shownSaved, setShownSaved] = useState(saved);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // 保存済みの番号が外から変わったら、入力中でないときだけ追従する
  if (saved !== shownSaved) {
    setShownSaved(saved);
    if (!dirty) setValue(saved);
  }
  const commit = async () => {
    const v = value.trim();
    if (v !== value) setValue(v);
    if (v === saved) {
      setDirty(false);
      setFailed(false);
      return;
    }
    if (!v && !sale) {
      setDirty(false);
      return; // 空欄のまま離れただけなら何も作らない
    }
    setBusy(true);
    setFailed(false);
    try {
      await onSave(v, sale?.id ?? "");
      setDirty(false);
    } catch {
      setFailed(true); // 画面の上にもエラーが出る。入力した番号は消さずに「未保存」と出す
    } finally {
      setBusy(false);
    }
  };
  if (!canEdit) {
    return <span className="tabular-nums">{saved || <span className="text-muted">―</span>}</span>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(true);
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={busy}
        placeholder="保険No."
        aria-label={`${worker.name}の保険売上No.`}
        title={sale ? "請求書作成の名簿の保険No.と同じ番号です" : "番号を入れると保険の売上明細ができ、請求書作成の名簿にも出ます"}
        className={`${CELL_INPUT} tabular-nums`}
      />
      {busy && <span className="text-[10px] text-muted">保存中…</span>}
      {failed && <span className="text-[10px] font-bold text-seal">未保存</span>}
      {!busy && !failed && sale && (
        <span className="flex items-center gap-0.5 text-[10px] text-muted">
          <Receipt size={10} />
          {sale.insurance_joined_on ? `加入済み ${slashDate(sale.insurance_joined_on)}` : "売上あり"}
        </span>
      )}
    </span>
  );
}

// ① 加入の申込に入れる内容（申込サイトの「被保険者情報」と同じ並び）
export function SswJoinTable({
  rows,
  today,
  canEdit,
  statusOptions,
  openId,
  onToggle,
  renderDetail,
  onMakeTodo,
  onTodoStatus,
  onSaved,
  onError,
  salesByWorker,
  onSaveSalesNo,
}: {
  rows: SswInsuranceRow[];
  today: string;
  canEdit: boolean;
  statusOptions: TodoStatusOption[];
  openId: string | null;
  onToggle: (workerId: string) => void;
  renderDetail: (row: SswInsuranceRow) => ReactNode; // 詳細（今までのカード）を行の下に出す
  onMakeTodo: (workerId: string, title: string) => void;
  onTodoStatus: (todoId: string, status: string) => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
  salesByWorker: Map<string, SswSalesRow[]>; // 外国人ID → 保険の売上（新しい順）
  onSaveSalesNo: (row: SswInsuranceRow, value: string, entryId: string) => Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.worker.id));

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 振込日を保存する（保険始期希望日と保険期間はここから計算する）
  const savePaidOn = async (row: SswInsuranceRow, value: string) => {
    onError(null);
    try {
      await updateSswInsurance(createClient(), row.worker.id, { ssw_insurance_paid_on: value || null });
      onSaved();
    } catch (err) {
      onError(dbErrorMessage(err, MIGRATION, "振込日の保存に失敗しました"));
    }
  };

  // チェックした人を、申込サイトにアップロードする「特定技能名簿」（Excel）に書き込んでダウンロードする
  const exportFile = async () => {
    const targets = rows.filter((r) => picked.has(r.worker.id)).map(sswUploadRow);
    if (targets.length === 0) return;
    if (targets.length > SSW_UPLOAD_MAX_ROWS) {
      onError(`一度に出せるのは${SSW_UPLOAD_MAX_ROWS}人までです`);
      return;
    }
    const ng = targets.filter((t) => t.problems.length > 0);
    if (
      ng.length > 0 &&
      !window.confirm(
        `次の人は足りない項目があるため、その欄は空のまま出力します。よろしいですか？\n\n${ng
          .map((t) => `・${t.name || "（氏名なし）"}: ${t.problems.join("・")}`)
          .join("\n")}`,
      )
    ) {
      return;
    }
    setExporting(true);
    onError(null);
    try {
      const res = await fetch(TEMPLATE_URL);
      if (!res.ok) throw new Error("申込用のファイルのひな形を読み込めませんでした");
      const bytes = await fillXlsxTemplate(await res.arrayBuffer(), sswUploadCells(targets));
      downloadXlsx(bytes, `特定技能総合保険_申込_${today.replaceAll("-", "")}.xlsx`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "出力に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm font-black">① 加入の申込に入れる内容（申込サイトの「被保険者情報」と同じ並び）</p>
        <button
          type="button"
          disabled={picked.size === 0 || exporting}
          onClick={() => void exportFile()}
          className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-50"
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          チェックした人（{picked.size}人）を申込用のファイルに出力
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        振込日を入れると、保険始期希望日（振込日の翌日。土日なら翌週の月曜日）と保険期間（在留期限まで）が自動で入ります。加入タイプは全員A、100％補償期間は「なし」で出力します。
      </p>
      <div className="overflow-x-auto rounded-xl border border-[#9fd3e0] bg-surface">
        <table className="w-full min-w-[68rem] border-collapse text-xs">
          <thead>
            <tr>
              <th className={`${TH} w-8`}>
                <input
                  type="checkbox"
                  checked={allPicked}
                  onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.worker.id)))}
                  aria-label="全員を選ぶ"
                  className="h-4 w-4"
                />
              </th>
              <th className={`${TH} text-left`}>氏名（アルファベット）</th>
              <th className={TH}>国籍</th>
              <th className={TH}>性別</th>
              <th className={TH}>生年月日</th>
              <th className={TH}>振込日</th>
              <th className={TH}>保険始期希望日</th>
              <th className={TH}>保険期間</th>
              <th className={`${TH} text-left`}>特定技能所属機関名</th>
              <th className={TH}>いまの状態</th>
              <th className={TH}>保険売上No.</th>
              <th className={TH}>経過</th>
              <th className={TH}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const w = row.worker;
              const startOn = sswStartOnFromPaidOn(w.ssw_insurance_paid_on);
              const months = startOn ? sswInsuranceMonths(startOn, w.residence_expiry_date) : null;
              const open = openId === w.id;
              return (
                <Fragment key={w.id}>
                  <tr className={picked.has(w.id) ? "bg-brand/5" : ""}>
                    <td className={`${TD} text-center`}>
                      <input
                        type="checkbox"
                        checked={picked.has(w.id)}
                        onChange={() => toggle(w.id)}
                        aria-label={`${w.name}を選ぶ`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className={TD}>
                      <SswNameCell worker={w} />
                    </td>
                    <td className={`${TD} text-center`}>{w.nationality || <span className="text-seal">未登録</span>}</td>
                    <td className={`${TD} text-center`}>{w.gender || <span className="text-seal">未登録</span>}</td>
                    <td className={`${TD} text-center`}>{w.birth ? slashDate(w.birth) : <span className="text-seal">未登録</span>}</td>
                    <td className={TD}>
                      <input
                        type="date"
                        defaultValue={w.ssw_insurance_paid_on ?? ""}
                        key={w.ssw_insurance_paid_on ?? ""}
                        disabled={!canEdit}
                        onBlur={(e) => {
                          if (e.target.value !== (w.ssw_insurance_paid_on ?? "")) void savePaidOn(row, e.target.value);
                        }}
                        aria-label={`${w.name}の振込日`}
                        className={CELL_INPUT}
                      />
                    </td>
                    <td className={`${TD} text-center`}>{startOn ? slashDate(startOn) : <span className="text-muted">振込日から</span>}</td>
                    <td className={`${TD} text-center font-bold text-brand`}>
                      {months ? `${months}ヶ月` : <span className="font-normal text-muted">{startOn && !w.residence_expiry_date ? "在留期限なし" : "―"}</span>}
                    </td>
                    <td className={TD}>{row.orgName || <span className="text-seal">未設定</span>}</td>
                    <td className={TD}>
                      <StateBadge row={row} today={today} />
                    </td>
                    <td className={`${TD} min-w-[9rem]`}>
                      <SswSalesNoCell
                        worker={w}
                        sale={salesByWorker.get(w.id)?.[0]}
                        canEdit={canEdit}
                        onSave={(value, entryId) => onSaveSalesNo(row, value, entryId)}
                      />
                    </td>
                    <td className={TD}>
                      <TodoCell
                        row={row}
                        title="特定技能総合保険の加入手続き"
                        canEdit={canEdit}
                        statusOptions={statusOptions}
                        onMakeTodo={(title) => onMakeTodo(w.id, title)}
                        onTodoStatus={onTodoStatus}
                      />
                    </td>
                    <td className={`${TD} text-center`}>
                      <button type="button" className={SMALL_BTN} onClick={() => onToggle(w.id)} aria-expanded={open}>
                        {open ? <ChevronDown size={11} className="inline" /> : <ChevronRight size={11} className="inline" />}
                        詳細
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={13} className="border border-border bg-background p-2">
                        {renderDetail(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ② 加入の結果を登録（申込サイトの「被保険者検索」と同じ並び）
export function SswResultTable({
  rows,
  canEdit,
  onSaved,
  onError,
}: {
  rows: SswInsuranceRow[];
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-black">② 加入の結果を登録（申込サイトの「被保険者検索」と同じ並び）</p>
      <p className="text-[11px] leading-relaxed text-muted">
        申込手続中の人です。申込サイトの被保険者検索の結果を入れて「登録」を押すと、保険終期と被保険者証が記録され「加入中」に移ります。
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-background p-4 text-center text-[11px] text-muted">申込手続中の人はいません。</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#9fd3e0] bg-surface">
          <table className="w-full min-w-[68rem] border-collapse text-xs">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>被保険者名</th>
                <th className={`${TH} text-left`}>所属機関名</th>
                <th className={TH}>加入依頼 受付番号</th>
                <th className={TH}>加入依頼日</th>
                <th className={TH}>保険始期</th>
                <th className={TH}>保険終期</th>
                <th className={TH}>被保険者証</th>
                <th className={TH}>請求書のリンク</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SswResultRow key={row.worker.id} row={row} canEdit={canEdit} onSaved={onSaved} onError={onError} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SswResultRow({
  row,
  canEdit,
  onSaved,
  onError,
}: {
  row: SswInsuranceRow;
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const w = row.worker;
  const [requestNo, setRequestNo] = useState(w.ssw_insurance_request_no ?? "");
  const [requestedOn, setRequestedOn] = useState(w.ssw_insurance_requested_on ?? "");
  // 保険始期は、まだ入っていなければ振込日から出した保険始期希望日を入れておく
  const [startOn, setStartOn] = useState(w.ssw_insurance_start_on || sswStartOnFromPaidOn(w.ssw_insurance_paid_on));
  const [endOn, setEndOn] = useState("");
  const [certNo, setCertNo] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const url = invoiceUrl.trim();
    if (url && !/^https?:\/\//.test(url)) {
      onError("請求書のリンク先は https:// から始まるURLを入れてください");
      return;
    }
    if (endOn && !certNo.trim()) {
      onError("保険終期を入れるときは、被保険者証の番号も入れてください");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      // 受付番号・加入依頼日・保険始期は先に控えておける（結果が出る前でも保存できる）
      await updateSswInsurance(createClient(), w.id, {
        ssw_insurance_request_no: requestNo.trim(),
        ssw_insurance_requested_on: requestedOn || null,
        ssw_insurance_start_on: startOn || null,
        // 保険終期と被保険者証が入ったら加入の記録にする（一覧・アラートは workers 側を見る）
        ...(endOn
          ? {
              ssw_insurance_no: certNo.trim(),
              ssw_insurance_expiry_date: endOn,
              ssw_insurance_declined: false,
              ssw_insurance_declined_on: null,
            }
          : {}),
      });
      if (endOn) {
        const res = await registerSswCert({
          workerId: w.id,
          certNo: certNo.trim(),
          expiryDate: endOn,
          invoiceUrl: url,
        });
        if (!res.ok) throw new Error(res.message);
      }
      onSaved();
    } catch (err) {
      onError(dbErrorMessage(err, MIGRATION, "登録に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td className={TD}>
        <SswNameCell worker={w} />
      </td>
      <td className={TD}>{row.orgName}</td>
      <td className={TD}>
        <input value={requestNo} onChange={(e) => setRequestNo(e.target.value)} disabled={!canEdit} placeholder="R00000000" aria-label={`${w.name}の加入依頼 受付番号`} className={CELL_INPUT} />
      </td>
      <td className={TD}>
        <input type="date" value={requestedOn} onChange={(e) => setRequestedOn(e.target.value)} disabled={!canEdit} aria-label={`${w.name}の加入依頼日`} className={CELL_INPUT} />
      </td>
      <td className={TD}>
        <input type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} disabled={!canEdit} aria-label={`${w.name}の保険始期`} className={CELL_INPUT} />
      </td>
      <td className={TD}>
        <input type="date" value={endOn} onChange={(e) => setEndOn(e.target.value)} disabled={!canEdit} aria-label={`${w.name}の保険終期`} className={CELL_INPUT} />
      </td>
      <td className={TD}>
        <input value={certNo} onChange={(e) => setCertNo(e.target.value)} disabled={!canEdit} placeholder="B000000000" aria-label={`${w.name}の被保険者証`} className={CELL_INPUT} />
      </td>
      <td className={TD}>
        <input type="url" value={invoiceUrl} onChange={(e) => setInvoiceUrl(e.target.value)} disabled={!canEdit} placeholder="https://..." aria-label={`${w.name}の請求書のリンク`} className={CELL_INPUT} />
      </td>
      <td className={`${TD} text-center`}>
        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={() => void save()}
          className="rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-brand-foreground disabled:opacity-50"
        >
          {busy ? "登録中…" : "登録"}
        </button>
      </td>
    </tr>
  );
}

// 退職した人の解約手続き
export function SswCancelTable({
  rows,
  canEdit,
  statusOptions,
  openId,
  onToggle,
  renderDetail,
  onMakeTodo,
  onTodoStatus,
  onCancelled,
  onExported,
  onSaveMailing,
  today,
  onError,
}: {
  rows: SswInsuranceRow[];
  canEdit: boolean;
  statusOptions: TodoStatusOption[];
  openId: string | null;
  onToggle: (workerId: string) => void;
  renderDetail: (row: SswInsuranceRow) => ReactNode;
  onMakeTodo: (workerId: string, title: string) => void;
  onTodoStatus: (todoId: string, status: string) => void;
  onCancelled: (row: SswInsuranceRow) => void;
  // 届出書を出力した人の解約手続きのTODOを「解約書類郵送済み」にする（TODOが無ければ作る）
  onExported: (workerIds: string[]) => Promise<void>;
  // 投函日・追跡番号をまとめて保存する（workers.ssw_insurance_cancel_mailed_on / _tracking_no）
  onSaveMailing: (workerIds: string[], mailedOn: string | null, trackingNo: string) => Promise<void>;
  today: string;
  onError: (message: string | null) => void;
}) {
  // 解約の届出書を作る人（チェック）
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  // 届出書を出力した（または「投函日・追跡番号を入力」を押した）人。投函日と追跡番号をまとめて入れる
  const [mailingIds, setMailingIds] = useState<string[]>([]);
  const [mailedOn, setMailedOn] = useState(today);
  const [trackingNo, setTrackingNo] = useState("");
  const [savingMailing, setSavingMailing] = useState(false);
  const mailingRows = rows.filter((r) => mailingIds.includes(r.worker.id));

  const openMailing = (ids: string[]) => {
    setMailingIds(ids);
    setMailedOn(today);
    setTrackingNo("");
  };
  const saveMailing = async () => {
    if (mailingRows.length === 0) return;
    setSavingMailing(true);
    try {
      await onSaveMailing(
        mailingRows.map((r) => r.worker.id),
        mailedOn || null,
        trackingNo.trim(),
      );
      setMailingIds([]);
      setPicked(new Set());
    } finally {
      setSavingMailing(false);
    }
  };
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.worker.id));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pickedCount = rows.filter((r) => picked.has(r.worker.id)).length;

  // チェックした人を解約の届出書（変更（解約）届出書・Excel）に書き込んでダウンロードする。
  // 合計人数はチェックした人数が入る
  const exportCancelForm = async () => {
    const targets = rows.filter((r) => picked.has(r.worker.id)).map(sswCancelFormRow);
    if (targets.length === 0) return;
    if (targets.length > SSW_CANCEL_FORM_MAX_ROWS) {
      onError(`届出書に入れられるのは一度に${SSW_CANCEL_FORM_MAX_ROWS}人までです（チェックを減らしてください）`);
      return;
    }
    const ng = targets.filter((t) => t.problems.length > 0);
    if (
      ng.length > 0 &&
      !window.confirm(
        `次の人は足りない項目があるため、その欄は空のまま出力します。よろしいですか？\n\n${ng
          .map((t) => `・${t.name || "（氏名なし）"}: ${t.problems.join("・")}`)
          .join("\n")}`,
      )
    ) {
      return;
    }
    setExporting(true);
    onError(null);
    try {
      const res = await fetch(CANCEL_TEMPLATE_URL);
      if (!res.ok) throw new Error("解約の届出書のひな形を読み込めませんでした");
      const bytes = await fillXlsxTemplate(await res.arrayBuffer(), sswCancelFormCells(targets, today));
      downloadXlsx(bytes, `特定技能総合保険_解約届_${today.replaceAll("-", "")}.xlsx`);
      // 出力した人の解約手続きのTODOを「解約書類郵送済み」にして、投函日・追跡番号の入力欄を出す
      const ids = targets.map((t) => t.workerId);
      if (canEdit) await onExported(ids);
      openMailing(ids);
    } catch (err) {
      onError(err instanceof Error ? err.message : "出力に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm font-black">退職した人の解約手続き</p>
        <button
          type="button"
          disabled={pickedCount === 0 || exporting}
          onClick={() => void exportCancelForm()}
          className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-50"
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          チェックした人（{pickedCount}人）を解約の届出書に出力
        </button>
        {canEdit && (
          <button
            type="button"
            disabled={pickedCount === 0 || exporting}
            onClick={() => openMailing(rows.filter((r) => picked.has(r.worker.id)).map((r) => r.worker.id))}
            className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-bold text-brand disabled:opacity-50"
            title="出力はせずに、チェックした人の投函日・追跡番号だけを入れ直します"
          >
            <Mail size={14} />
            チェックした人の投函日・追跡番号を入力
          </button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        被保険者証明書番号と有効期限が入っていて、有効期限から4か月たっていない人だけを出しています（それより後は解約できません）。解約の手続きが済んだら「解約済み」を押してください。
        届出書に入れる人にチェックを付けて出力すると、変更（解約）届出書（エクセル）に被保険者番号・氏名・変更日（退職日）・変更理由「③自己都合」の○が入り、合計はチェックした人数になります（一度に{SSW_CANCEL_FORM_MAX_ROWS}人まで）。
        出力した人の経過は自動で「{SSW_CANCEL_MAILED_STATUS}」になり、続けて投函日と追跡番号をまとめて入れられます。
      </p>
      {/* 解約書類の送付先（宛名書き用にコピーできる） */}
      <SswCancelMailTo />
      {/* 届出書を出力した人の投函日・追跡番号（1通にまとめて送るので、同じ日付・番号を全員に保存する） */}
      {mailingRows.length > 0 && (
        <div className="rounded-xl border border-brand/40 bg-brand/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-black">
            <Mail size={14} className="text-brand" />
            出力した{mailingRows.length}人の投函日・追跡番号を入力
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {mailingRows.map((r) => r.worker.name).join("・")}
          </p>
          {/* 出力した書類の送り先をここにも出す（宛名を書くときにすぐコピーできる） */}
          <div className="mt-2">
            <SswCancelMailTo />
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-muted">投函日</span>
              <input
                type="date"
                value={mailedOn}
                onChange={(e) => setMailedOn(e.target.value)}
                className={`${CELL_INPUT} min-w-[9rem]`}
              />
            </label>
            <label className="block min-w-[14rem] flex-1">
              <span className="mb-0.5 block text-[11px] text-muted">追跡番号（レターパックなど）</span>
              <input
                value={trackingNo}
                onChange={(e) => setTrackingNo(e.target.value)}
                placeholder="例: 1234-5678-9012"
                className={`${CELL_INPUT} w-full tabular-nums`}
              />
            </label>
            <button
              type="button"
              disabled={savingMailing || !canEdit}
              onClick={() => void saveMailing()}
              className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-50"
            >
              {savingMailing && <Loader2 size={14} className="animate-spin" />}
              {mailingRows.length}人に保存
            </button>
            <button
              type="button"
              disabled={savingMailing}
              onClick={() => setMailingIds([])}
              className={SMALL_BTN}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-background p-4 text-center text-[11px] text-muted">解約手続きが必要な人はいません。</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#9fd3e0] bg-surface">
          <table className="w-full min-w-[58rem] border-collapse text-xs">
            <thead>
              <tr>
                <th className={`${TH} w-8`}>
                  <input
                    type="checkbox"
                    checked={allPicked}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.worker.id)))}
                    aria-label="全員を選ぶ"
                    className="h-4 w-4"
                  />
                </th>
                <th className={`${TH} text-left`}>被保険者名</th>
                <th className={`${TH} text-left`}>所属機関名</th>
                <th className={TH}>退職日</th>
                <th className={TH}>保険終期</th>
                <th className={TH}>被保険者証</th>
                <th className={TH}>経過</th>
                <th className={TH}>郵送（投函日・追跡番号）</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const w = row.worker;
                const open = openId === w.id;
                return (
                  <Fragment key={w.id}>
                    <tr className={picked.has(w.id) ? "bg-brand/5" : ""}>
                      <td className={`${TD} text-center`}>
                        <input
                          type="checkbox"
                          checked={picked.has(w.id)}
                          onChange={() => toggle(w.id)}
                          aria-label={`${w.name}を届出書に入れる`}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className={TD}>
                        <SswNameCell worker={w} />
                      </td>
                      <td className={TD}>{row.orgName}</td>
                      <td className={`${TD} text-center`}>{w.leaving_on ? slashDate(w.leaving_on) : "―"}</td>
                      <td className={`${TD} text-center`}>{slashDate(w.ssw_insurance_expiry_date)}</td>
                      <td className={`${TD} text-center`}>{w.ssw_insurance_no}</td>
                      <td className={TD}>
                        <TodoCell
                          row={row}
                          title="特定技能総合保険の解約手続き"
                          canEdit={canEdit}
                          statusOptions={statusOptions}
                          onMakeTodo={(title) => onMakeTodo(w.id, title)}
                          onTodoStatus={onTodoStatus}
                        />
                      </td>
                      <td className={`${TD} whitespace-nowrap text-center text-[11px]`}>
                        {w.ssw_insurance_cancel_mailed_on || (w.ssw_insurance_cancel_tracking_no ?? "").trim() ? (
                          <span className="inline-flex flex-col items-center gap-0.5">
                            <span className="tabular-nums">{w.ssw_insurance_cancel_mailed_on ? slashDate(w.ssw_insurance_cancel_mailed_on) : "投函日なし"}</span>
                            {(w.ssw_insurance_cancel_tracking_no ?? "").trim() ? (
                              <span className="inline-flex items-center gap-0.5 tabular-nums text-muted">
                                {w.ssw_insurance_cancel_tracking_no}
                                <CopyButton value={w.ssw_insurance_cancel_tracking_no ?? ""} label="追跡番号をコピー" size={11} />
                              </span>
                            ) : (
                              <span className="text-muted">追跡番号なし</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted">―</span>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-center`}>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => onCancelled(row)}
                            className="mr-1 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-brand-foreground"
                          >
                            解約済み
                          </button>
                        )}
                        <button type="button" className={SMALL_BTN} onClick={() => onToggle(w.id)} aria-expanded={open}>
                          {open ? <ChevronDown size={11} className="inline" /> : <ChevronRight size={11} className="inline" />}
                          詳細
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={9} className="border border-border bg-background p-2">
                          {renderDetail(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 解約書類の送付先・問合せ先。会社名・住所・電話番号をそれぞれコピーでき、宛名はまとめてコピーできる
function SswCancelMailTo() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-background px-3 py-2 text-[11px]">
      <span className="font-bold text-muted">書類送付・問合せ先</span>
      <span className="inline-flex items-center gap-1 font-bold">
        {SSW_CANCEL_MAIL_TO.company}
        <CopyButton value={SSW_CANCEL_MAIL_TO.company} label="会社名をコピー" size={12} />
      </span>
      <span className="inline-flex items-center gap-1">
        {SSW_CANCEL_MAIL_TO.postal}　{SSW_CANCEL_MAIL_TO.address}
        <CopyButton value={`${SSW_CANCEL_MAIL_TO.postal} ${SSW_CANCEL_MAIL_TO.address}`} label="住所をコピー" size={12} />
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums">
        TEL {SSW_CANCEL_MAIL_TO.tel}
        <CopyButton value={SSW_CANCEL_MAIL_TO.tel} label="電話番号をコピー" size={12} />
      </span>
      <span className="tabular-nums text-muted">FAX {SSW_CANCEL_MAIL_TO.fax}</span>
      <span className="inline-flex items-center gap-1 font-bold text-brand">
        <CopyButton value={sswCancelMailToText()} label="宛名（郵便番号・住所・会社名・電話）をまとめてコピー" size={12} />
        宛名をまとめてコピー
      </span>
    </div>
  );
}

// 申込手続中か（②の結果を登録する表に出す人）
export function isSswApplying(row: SswInsuranceRow): boolean {
  return row.state !== "cancel" && sswColumnOf(row) === "inProgress";
}
