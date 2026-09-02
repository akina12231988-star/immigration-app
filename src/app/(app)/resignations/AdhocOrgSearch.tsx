"use client";

import { useMemo } from "react";
import { NameSearchBox } from "@/components/ui/NameSearchBox";
import { organizationSuggestions } from "@/lib/org-search";
import { adhocOrgCandidates, type AdhocOrgRow } from "@/lib/adhoc-report-org";

// 随時報告書の一覧を所属機関の名称で絞り込む検索ボックス。
// 3つの記録（退職・契約内容変更・支援委託終了）で同じものを使う。
export function AdhocOrgSearch({
  rows,
  value,
  onChange,
}: {
  rows: AdhocOrgRow[];
  value: string;
  onChange: (value: string) => void;
}) {
  const candidates = useMemo(() => adhocOrgCandidates(rows), [rows]);

  return (
    <NameSearchBox
      candidates={candidates}
      value={value}
      onChange={onChange}
      placeholder="所属機関の名称を入力して絞り込み（「BASE」「国崎」などでも探せます）"
      suggest={organizationSuggestions}
    />
  );
}
