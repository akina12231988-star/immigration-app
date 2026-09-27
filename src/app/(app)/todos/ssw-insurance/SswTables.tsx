"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Download, Loader2, Plus } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import { displayTodoNo, type TodoStatusOption } from "@/lib/todo";
import { fillXlsxTemplate } from "@/lib/xlsx-form-fill";
import {
  SSW_STATE_LABELS,
  SSW_UPLOAD_MAX_ROWS,
  slashDate,
  sswColumnOf,
  sswRowTodo,
  sswStartOnFromPaidOn,
  sswInsuranceMonths,
  sswUploadCells,
  sswUploadRow,
  type SswInsuranceRow,
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

const TH = "border border-[#9fd3e0] bg-[#d7eef4] px-2 py-2 text-[11px] font-bold text-foreground";
const TD = "border border-border px-2 py-1.5 align-middle";
const CELL_INPUT =
  "min-h-[32px] w-full min-w-0 rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none disabled:opacity-60";
const SMALL_BTN =
  "rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-bold text-brand hover:border-brand disabled:opacity-50";

export type SswTabKey = "join" | "cancel" | "active" | "declined";

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
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      // ファイル名を付けて保存する（すぐにURLを消すとファイル名が付かないことがあるので少し待つ）
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `特定技能総合保険_申込_${today.replaceAll("-", "")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
                      <span className="flex items-center gap-1">
                        <Link href={`/workers/${w.id}`} className="font-bold text-brand hover:underline">
                          {w.name}
                        </Link>
                        <CopyButton value={w.name} label={`${w.name}の氏名をコピー`} size={12} className="inline-flex" />
                      </span>
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
                      <td colSpan={12} className="border border-border bg-background p-2">
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
        <span className="flex items-center gap-1">
          <Link href={`/workers/${w.id}`} className="font-bold text-brand hover:underline">
            {w.name}
          </Link>
          <CopyButton value={w.name} label={`${w.name}の氏名をコピー`} size={12} className="inline-flex" />
        </span>
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
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-black">退職した人の解約手続き</p>
      <p className="text-[11px] leading-relaxed text-muted">
        被保険者証明書番号と有効期限が入っていて、有効期限から4か月たっていない人だけを出しています（それより後は解約できません）。解約の手続きが済んだら「解約済み」を押してください。
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-background p-4 text-center text-[11px] text-muted">解約手続きが必要な人はいません。</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#9fd3e0] bg-surface">
          <table className="w-full min-w-[56rem] border-collapse text-xs">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>被保険者名</th>
                <th className={`${TH} text-left`}>所属機関名</th>
                <th className={TH}>退職日</th>
                <th className={TH}>保険終期</th>
                <th className={TH}>被保険者証</th>
                <th className={TH}>経過</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const w = row.worker;
                const open = openId === w.id;
                return (
                  <Fragment key={w.id}>
                    <tr>
                      <td className={TD}>
                        <span className="flex items-center gap-1">
                          <Link href={`/workers/${w.id}`} className="font-bold text-brand hover:underline">
                            {w.name}
                          </Link>
                          <CopyButton value={w.name} label={`${w.name}の氏名をコピー`} size={12} className="inline-flex" />
                        </span>
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
                        <td colSpan={7} className="border border-border bg-background p-2">
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

// 申込手続中か（②の結果を登録する表に出す人）
export function isSswApplying(row: SswInsuranceRow): boolean {
  return row.state !== "cancel" && sswColumnOf(row) === "inProgress";
}
