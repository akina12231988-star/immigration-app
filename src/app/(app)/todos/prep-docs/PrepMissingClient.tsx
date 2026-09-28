"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, FileSearch, RotateCcw, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { prepDetailHref } from "@/lib/application-prep";
import { elapsedDays } from "@/lib/issue-requests";
import {
  EMPTY_PREP_MISSING_FILTER,
  PREP_MISSING_GROUP_LABELS,
  filterPrepMissing,
  groupPrepMissing,
  prepMissingOptions,
  prepMissingStatusText,
  prepMissingSummary,
  type PrepMissingGroupBy,
  type PrepMissingOption,
  type PrepMissingRow,
} from "@/lib/prep-missing";

// 依頼日からこれだけたっていたら赤く出す（催促の目安。依頼中の一覧と同じ）
const STALE_DAYS = 14;

const SELECT =
  "min-h-[34px] w-full rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none";

// 申請準備で、まだ揃っていない書類をまとめて見る画面。
// 何（書類）を誰の分（外国人・所属機関）で、誰にいつ依頼して、いまどうなっているかを1行ずつ出す。
// まとめ方（書類別・外国人別・所属機関別・依頼先別）を切り替えられ、しぼり込みは組み合わせられる。
export function PrepMissingClient({
  rows,
  error,
  today,
}: {
  rows: PrepMissingRow[];
  error: string | null;
  today: string;
}) {
  const [groupBy, setGroupBy] = useState<PrepMissingGroupBy>("doc");
  const [filter, setFilter] = useState(EMPTY_PREP_MISSING_FILTER);

  const options = useMemo(() => prepMissingOptions(rows, filter), [rows, filter]);
  const shown = useMemo(() => filterPrepMissing(rows, filter), [rows, filter]);
  const groups = useMemo(() => groupPrepMissing(shown, groupBy), [shown, groupBy]);
  const summary = useMemo(() => prepMissingSummary(shown), [shown]);
  const filtered = Object.values(filter).some(Boolean);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
          <FileSearch size={16} />
          まだ揃っていない書類（申請準備）
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          申請準備の詳細で必要になっている書類のうち、まだ完了していないものを全員分まとめています。
          誰に・いつ依頼したか（発行依頼先・依頼日）と、いまの準備状況も出します。
          「書類別」にすると、たとえば推薦状がまだ揃っていない人が一度に分かります。
          しぼり込みは組み合わせられます（例: 担当者＝◯◯ ＋ 書類＝課税証明書）。
          申請準備のTODOの経過（進捗状況）が「完了」の人は出ません。
          直すときは行を押して、その人の申請準備の詳細で準備状況を変えてください。
          依頼日から{STALE_DAYS}日以上たったものは赤く出ます。
        </p>

        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            取得に失敗しました（{error}）。0件という意味ではありません。
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="flex items-center gap-1 rounded-lg border border-seal/40 bg-seal/10 px-2.5 py-1 text-seal">
            <TriangleAlert size={13} />
            まだ {summary.rows}件（{summary.workers}人）
          </span>
          <span className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-muted">
            <Clock size={13} />
            依頼して待っている {summary.requesting}件
          </span>
          <span className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-muted">
            まだ依頼していない {summary.notRequested}件
          </span>
        </div>

        {/* まとめ方としぼり込み */}
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-bold text-muted">まとめ方</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as PrepMissingGroupBy)}
              className={SELECT}
            >
              {PREP_MISSING_GROUP_LABELS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <FilterSelect
            label="書類でしぼる"
            value={filter.docId}
            options={options.docs}
            onChange={(v) => setFilter((f) => ({ ...f, docId: v }))}
          />
          <FilterSelect
            label="外国人でしぼる"
            value={filter.workerId}
            options={options.workers}
            onChange={(v) => setFilter((f) => ({ ...f, workerId: v }))}
          />
          <FilterSelect
            label="所属機関でしぼる"
            value={filter.orgId}
            options={options.orgs}
            onChange={(v) => setFilter((f) => ({ ...f, orgId: v }))}
          />
          <FilterSelect
            label="担当者でしぼる"
            value={filter.tantou}
            options={options.tantous}
            onChange={(v) => setFilter((f) => ({ ...f, tantou: v }))}
          />
          <FilterSelect
            label="依頼先でしぼる"
            value={filter.issuer}
            options={options.issuers}
            onChange={(v) => setFilter((f) => ({ ...f, issuer: v }))}
          />
        </div>
        {filtered && (
          <button
            type="button"
            onClick={() => setFilter(EMPTY_PREP_MISSING_FILTER)}
            className="mb-3 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted"
          >
            <RotateCcw size={12} />
            しぼり込みを外す
          </button>
        )}

        {groups.length === 0 ? (
          <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
            {rows.length === 0
              ? "まだ揃っていない書類はありません。"
              : "この条件に当てはまるものはありません。しぼり込みを外してください。"}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((g) => (
              <li key={`${groupBy}-${g.key || "none"}`} className="rounded-xl border border-border p-3">
                <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className={g.key ? "" : "text-seal"}>{g.label}</span>
                  <span className="font-normal text-muted">{g.rows.length}件</span>
                </p>
                <ul className="flex flex-col gap-1">
                  {g.rows.map((r) => (
                    <MissingRow
                      key={`${r.workerId}-${r.checklistId}-${r.docId}`}
                      r={r}
                      groupBy={groupBy}
                      today={today}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// しぼり込みの1つ（選んでいるほかの条件での件数を出す）
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: PrepMissingOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-bold text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        <option value="">すべて</option>
        {/* いま選んでいる値が、ほかの条件で候補から消えても選んだまま見えるようにする */}
        {value && !options.some((o) => o.value === value) && (
          <option value={value}>（いまの条件では0件）</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}（{o.count}件）
          </option>
        ))}
      </select>
    </label>
  );
}

// 1件分。押すとその人の申請準備の詳細が開く
function MissingRow({
  r,
  groupBy,
  today,
}: {
  r: PrepMissingRow;
  groupBy: PrepMissingGroupBy;
  today: string;
}) {
  const days = r.requesting ? elapsedDays(r.requestedOn, today) : null;
  const stale = days != null && days >= STALE_DAYS;
  return (
    <li className="rounded-lg border border-border/60 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-relaxed">
        {/* まとめ方で見出しに出ている項目は、行では省く */}
        {groupBy !== "worker" && (
          <Link href={prepDetailHref(r.workerId)} className="font-bold text-brand underline">
            {r.workerName}
          </Link>
        )}
        <Link href={prepDetailHref(r.workerId)} className="underline">
          {r.docLabel}
        </Link>
        <span className={r.status ? "text-muted" : "font-bold text-seal"}>
          {prepMissingStatusText(r)}
        </span>
        {/* 添付はあるのに完了になっていない（あと一歩のもの）が分かるようにする */}
        {r.hasFile && <span className="text-muted">添付あり</span>}
        {r.requesting ? (
          <span className={`tabular-nums ${stale ? "font-bold text-seal" : "text-muted"}`}>
            {r.issuer || "依頼先が未入力"}
            {r.requestedOn ? ` ／ 依頼日 ${r.requestedOn}` : " ／ 依頼日が未入力"}
            {days != null && `（${days}日経過）`}
          </span>
        ) : (
          r.issuer && <span className="text-muted">{r.issuer}</span>
        )}
        {groupBy !== "org" && r.orgName && <span className="text-muted">／ {r.orgName}</span>}
        {r.todoNo && <span className="text-muted">／ {r.todoNo}</span>}
        {groupBy !== "tantou" && r.tantou && <span className="text-muted">／ 担当 {r.tantou}</span>}
        {r.memo && <span className="max-w-[16rem] truncate text-muted">／ {r.memo}</span>}
      </div>
    </li>
  );
}
