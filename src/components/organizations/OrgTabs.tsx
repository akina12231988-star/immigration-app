"use client";

import { createContext, useContext, type ReactNode } from "react";

// 所属機関の詳細をタブで分けて見せる（案B）。
// 中身（入力欄・表示）はそのままで、どのタブに出すかだけを決める。
// タブを切り替えても入力中の内容が消えないよう、見えないタブも描いたまま hidden にする。
// タブの外（管理画面の登録フォームなど）で使ったときは、全部そのまま出す。

export const ORG_TABS = [
  { id: "company", label: "会社・代表者" },
  { id: "support", label: "支援体制・在籍者" },
  { id: "work", label: "雇用条件" },
  { id: "insure", label: "保険・寮" },
  { id: "docs", label: "提出書類" },
  { id: "money", label: "決算・売上" },
  { id: "ssw2", label: "２号の指導体制" },
] as const;
export type OrgTabId = (typeof ORG_TABS)[number]["id"];

const OrgTabContext = createContext<OrgTabId | null>(null);

export function OrgTabProvider({ tab, children }: { tab: OrgTabId; children: ReactNode }) {
  return <OrgTabContext.Provider value={tab}>{children}</OrgTabContext.Provider>;
}

// そのタブのときだけ見せる。タブの外では常に見せる
export function OrgTabPanel({ tab, children }: { tab: OrgTabId; children: ReactNode }) {
  const active = useContext(OrgTabContext);
  if (active === null) return <>{children}</>;
  return (
    <div hidden={active !== tab} className="flex flex-col gap-2.5">
      {children}
    </div>
  );
}

export function OrgTabBar({ tab, onChange }: { tab: OrgTabId; onChange: (tab: OrgTabId) => void }) {
  return (
    <div role="tablist" aria-label="所属機関の情報" className="-mb-px flex gap-0.5 overflow-x-auto border-b border-border">
      {ORG_TABS.map((t) => (
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
