"use client";

import { createContext, useContext, type ReactNode } from "react";

// 外国人詳細を章のタブで分けて見せる（所属機関の情報と同じ作り）。
// 中身（入力欄・表示）はそのままで、どのタブに出すかだけを決める。
// タブを切り替えても入力中の内容が消えないよう、見えないタブも描いたまま hidden にする。
// タブの外で使ったときは、全部そのまま出す。

export const WORKER_TABS = [
  { id: "person", label: "本人・在留" },
  { id: "work", label: "雇用・お金" },
  { id: "docs", label: "書類" },
  { id: "todo", label: "手続き・TODO" },
] as const;
export type WorkerTabId = (typeof WORKER_TABS)[number]["id"];

// 「項目を探す」から隠れているタブの項目へ飛ぶときに、先にそのタブへ切り替えるための合図
export const WORKER_TAB_SHOW_EVENT = "worker-tab-show";

const WorkerTabContext = createContext<WorkerTabId | null>(null);

export function WorkerTabProvider({ tab, children }: { tab: WorkerTabId; children: ReactNode }) {
  return <WorkerTabContext.Provider value={tab}>{children}</WorkerTabContext.Provider>;
}

// そのタブのときだけ見せる。タブの外では常に見せる。
// data-tab-panel は「項目を探す」が、隠れているタブを見つけるために使う
export function WorkerTabPanel({ tab, children }: { tab: WorkerTabId; children: ReactNode }) {
  const active = useContext(WorkerTabContext);
  if (active === null) return <>{children}</>;
  // 印刷のときは、選んでいないタブの中身も全部出す（この画面をそのまま紙に出す人のため）
  return (
    <div hidden={active !== tab} data-tab-panel={tab} className="flex flex-col gap-4 print:block">
      {children}
    </div>
  );
}

export function WorkerTabBar({
  tab,
  onChange,
}: {
  tab: WorkerTabId;
  onChange: (tab: WorkerTabId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="外国人詳細"
      className="-mb-px flex gap-0.5 overflow-x-auto border-b border-border"
    >
      {WORKER_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onChange(t.id)}
          className={`min-h-[44px] shrink-0 border-b-[3px] px-3 text-sm font-bold ${
            tab === t.id ? "border-brand text-brand" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
