"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 随時報告書の3つの記録の切り替え。
// 退職・契約内容変更・支援委託終了は、どれも特定技能所属機関の随時届出だが
// 使う様式と入力する内容が違うので、記録を分けている。
const TABS = [
  { href: "/resignations", label: "退職の記録" },
  { href: "/resignations/contract-changes", label: "契約内容変更の記録" },
  { href: "/resignations/support-end", label: "支援委託終了の記録" },
];

export function AdhocReportTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${
              active
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border bg-surface text-muted"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
