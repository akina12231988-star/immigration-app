"use client";

import { Search } from "lucide-react";
import {
  SUPPORT_SCOPES,
  WORKER_STATUSES,
  type Organization,
  type SupportScope,
  type WorkerStatus,
} from "@/types/db";

export type WorkerSortKey = "created" | "name" | "remain" | "expiry";

export const SORT_LABELS: Record<WorkerSortKey, string> = {
  created: "登録順",
  name: "名前順",
  remain: "残日数が少ない順",
  expiry: "在留期限が近い順",
};

// サマリーカードから選ぶクイック絞り込み
export type WorkerQuickFilter =
  | "all"
  | "active" // 1号在留中（在籍中）
  | "within1year" // 1号で残り1年以内
  | "reached" // 5年到達
  | "expiry3m" // 在留期限まで3ヶ月以内
  | "retired"; // 退職者

export interface WorkerFilterState {
  keyword: string;
  status: WorkerStatus | "all";
  support: SupportScope | "all";
  orgId: string | "all" | "none"; // none = 未所属
  sort: WorkerSortKey;
  quick: WorkerQuickFilter;
  expiryFrom: string; // 在留期限の対象期間（開始）
  expiryTo: string; // 在留期限の対象期間（終了）
}

export const INITIAL_FILTER: WorkerFilterState = {
  keyword: "",
  status: "all",
  support: "all",
  orgId: "all",
  sort: "created",
  quick: "all",
  expiryFrom: "",
  expiryTo: "",
};

const SELECT_CLASS =
  "min-h-[40px] flex-1 rounded-xl border border-border bg-surface px-2.5 text-xs font-bold focus:border-brand focus:outline-none";

// 検索＋状態・支援対象・所属機関フィルター＋並び替え（拡張要件⑤）
export function WorkerFilters({
  filter,
  organizations,
  onChange,
}: {
  filter: WorkerFilterState;
  organizations: Organization[];
  onChange: (next: WorkerFilterState) => void;
}) {
  const set = <K extends keyof WorkerFilterState>(key: K, value: WorkerFilterState[K]) =>
    onChange({ ...filter, [key]: value });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={filter.keyword}
          onChange={(e) => set("keyword", e.target.value)}
          placeholder="氏名・フリガナ・国籍・在留カード番号で検索"
          className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-3 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <FilterChip
          label="すべて"
          active={filter.status === "all"}
          onClick={() => set("status", "all")}
        />
        {WORKER_STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={s}
            active={filter.status === s}
            onClick={() => set("status", s)}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <select
          value={filter.support}
          onChange={(e) => set("support", e.target.value as SupportScope | "all")}
          aria-label="支援区分で絞り込み"
          className={SELECT_CLASS}
        >
          <option value="all">支援区分: すべて</option>
          {SUPPORT_SCOPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filter.orgId}
          onChange={(e) => set("orgId", e.target.value)}
          aria-label="所属機関で絞り込み"
          className={SELECT_CLASS}
        >
          <option value="all">所属: すべて</option>
          <option value="none">未所属</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          value={filter.sort}
          onChange={(e) => set("sort", e.target.value as WorkerSortKey)}
          aria-label="並び替え"
          className={SELECT_CLASS}
        >
          {(Object.keys(SORT_LABELS) as WorkerSortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">在留期限（対象期間）開始</span>
          <input
            type="date"
            value={filter.expiryFrom}
            onChange={(e) => set("expiryFrom", e.target.value)}
            className="min-h-[40px] rounded-xl border border-border bg-surface px-2.5 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">終了</span>
          <input
            type="date"
            value={filter.expiryTo}
            onChange={(e) => set("expiryTo", e.target.value)}
            className="min-h-[40px] rounded-xl border border-border bg-surface px-2.5 text-xs"
          />
        </label>
        {(filter.expiryFrom || filter.expiryTo) && (
          <button
            type="button"
            onClick={() => onChange({ ...filter, expiryFrom: "", expiryTo: "" })}
            className="min-h-[40px] text-xs font-bold text-brand"
          >
            期間クリア
          </button>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border bg-surface text-muted"
      }`}
    >
      {label}
    </button>
  );
}
