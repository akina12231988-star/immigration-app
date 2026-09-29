"use client";

import { createContext, useContext, type ReactNode } from "react";

// 外国人詳細を章のタブで分けて見せる（所属機関の情報と同じ作り）。
// 中身（入力欄・表示）はそのままで、どのタブに出すかだけを決める。
// タブを切り替えても入力中の内容が消えないよう、見えないタブも描いたまま hidden にする。
// タブの外で使ったときは、全部そのまま出す。
//
// 何がどこにあるか分かるように、タブの名前の下に中身の要約を出し、
// タブを開いたらいちばん上に「この中にあるもの」の見出し一覧（押すとその場所へ移動）を出す。

export interface WorkerTabSection {
  id: string; // 移動先（WorkerDetail の <div id="…">）
  label: string;
}

export const WORKER_TABS = [
  {
    id: "person",
    label: "本人・在留",
    hint: "在留カード・パスポート・基本情報",
    sections: [
      { id: "wd-zairyu", label: "在留カード" },
      { id: "wd-passport", label: "パスポート" },
      { id: "wd-entry", label: "出入国の記録" },
      { id: "wd-basic", label: "基本情報" },
      { id: "wd-visa", label: "在留資格の履歴" },
    ],
  },
  {
    id: "work",
    label: "雇用・お金",
    hint: "賃金・雇用開始日・売上",
    sections: [
      { id: "wd-resign", label: "退職者情報" },
      { id: "wd-wage", label: "賃金（時給・月給）" },
      { id: "wd-salesno", label: "許可売上No.・保険No." },
      { id: "wd-sales", label: "定期売上" },
      { id: "wd-empstart", label: "雇用開始日" },
      { id: "wd-dependents", label: "扶養家族" },
    ],
  },
  {
    id: "career",
    label: "職歴と在歴",
    hint: "通算期間・職歴・申請書類用の通算",
    sections: [
      { id: "wd-total", label: "特定技能1号の通算期間" },
      { id: "wd-career", label: "職歴" },
      { id: "wd-doctotal", label: "申請書類用の通算" },
    ],
  },
  {
    id: "docs",
    label: "書類",
    hint: "契約書・保険証・入社書類",
    sections: [
      { id: "wd-cardfile", label: "在留カード・指定書" },
      { id: "wd-contract", label: "雇用契約書・雇用条件書" },
      { id: "wd-koyo", label: "雇用保険" },
      { id: "wd-hoken", label: "保険証" },
      { id: "wd-onboarding", label: "入社書類" },
      { id: "wd-gensen", label: "源泉徴収票" },
      { id: "wd-kenshin", label: "健康診断" },
    ],
  },
  {
    id: "todo",
    label: "手続き・TODO",
    hint: "あとでやる手続き・郵送請求・入管申請",
    sections: [
      { id: "wd-followup", label: "あとでやる手続き" },
      { id: "wd-mailing", label: "郵送請求" },
      { id: "wd-job", label: "求職・応募" },
      { id: "wd-todo", label: "TODO" },
      { id: "wd-apply", label: "入管申請" },
    ],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  hint: string;
  sections: readonly WorkerTabSection[];
}[];

export type WorkerTabId = (typeof WORKER_TABS)[number]["id"];

// 「項目を探す」から隠れているタブの項目へ飛ぶときに、先にそのタブへ切り替えるための合図
export const WORKER_TAB_SHOW_EVENT = "worker-tab-show";

const WorkerTabContext = createContext<WorkerTabId | null>(null);

export function WorkerTabProvider({ tab, children }: { tab: WorkerTabId; children: ReactNode }) {
  return <WorkerTabContext.Provider value={tab}>{children}</WorkerTabContext.Provider>;
}

// そのタブのときだけ見せる。タブの外では常に見せる。
// data-tab-panel は「項目を探す」が、隠れているタブを見つけるために使う
// 印刷のときは、選んでいないタブの中身も全部出す（この画面をそのまま紙に出す人のため）
export function WorkerTabPanel({ tab, children }: { tab: WorkerTabId; children: ReactNode }) {
  const active = useContext(WorkerTabContext);
  if (active === null) return <>{children}</>;
  return (
    <div hidden={active !== tab} data-tab-panel={tab} className="flex flex-col gap-4 print:block">
      {children}
    </div>
  );
}

// 見出しへ移動する。上に固定しているバーの下に見出しが来るようにする
function jumpToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const bar = document.querySelector("[data-worker-sticky]");
  const barBottom = bar ? bar.getBoundingClientRect().bottom : 0;
  const top = el.getBoundingClientRect().top + window.scrollY - Math.max(barBottom, 0) - 8;
  window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
}

// 開いているタブの「この中にあるもの」。押すとその場所まで移動する
export function WorkerTabIndex({ tab, omit = [] }: { tab: WorkerTabId; omit?: string[] }) {
  const current = WORKER_TABS.find((t) => t.id === tab);
  if (!current) return null;
  const sections = current.sections.filter((s) => !omit.includes(s.id));
  if (sections.length === 0) return null;
  return (
    <nav
      aria-label={`${current.label}の中にあるもの`}
      className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 print:hidden"
    >
      <span className="text-[11px] font-bold text-muted">この中にあるもの</span>
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => jumpToSection(s.id)}
          className="min-h-[28px] rounded-lg border border-border bg-background px-2 text-[11px] font-bold text-brand hover:bg-brand/10"
        >
          {s.label}
        </button>
      ))}
    </nav>
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
          className={`min-h-[44px] shrink-0 border-b-[3px] px-3 py-1 text-left text-sm font-bold ${
            tab === t.id ? "border-brand text-brand" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <span className="block">{t.label}</span>
          {/* 何が入っているかの要約。狭い画面ではタブ名だけにする */}
          <span
            className={`hidden text-[10px] font-normal leading-tight md:block ${
              tab === t.id ? "text-brand/80" : "text-muted"
            }`}
          >
            {t.hint}
          </span>
        </button>
      ))}
    </div>
  );
}
