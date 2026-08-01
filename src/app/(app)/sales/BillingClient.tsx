"use client";

import { useState } from "react";
import { MonthlyBillingSection } from "./MonthlyBillingSection";
import { SalesClient } from "./SalesClient";
import type { BillingOrg, BillingWorker } from "@/lib/monthly-billing";

const TABS = [
  { key: "monthly", label: "月末の請求書作成" },
  { key: "entries", label: "売上明細の登録" },
] as const;

// 請求書作成。月末の在籍名簿・支援費の集計（月末）と、
// 在留カード受領後・退職時に作った売上明細のfreee販売への登録（都度）をまとめて扱う。
export function BillingClient({
  canEdit,
  workers,
  organizations,
  today,
}: {
  canEdit: boolean;
  workers: BillingWorker[];
  organizations: BillingOrg[];
  today: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("monthly");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-[40px] shrink-0 rounded-full border px-4 text-sm transition ${
              tab === t.key
                ? "border-brand bg-brand/10 font-bold text-brand"
                : "border-border bg-background text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "monthly" ? (
        <MonthlyBillingSection
          workers={workers}
          organizations={organizations}
          today={today}
          canEdit={canEdit}
        />
      ) : (
        <SalesClient canEdit={canEdit} />
      )}
    </div>
  );
}
