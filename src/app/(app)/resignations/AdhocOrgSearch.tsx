"use client";

import { useMemo } from "react";
import { NameSearchBox } from "@/components/ui/NameSearchBox";
import { adhocOrgCandidates, adhocSearchSuggestions, type AdhocOrgRow } from "@/lib/adhoc-report-org";

// 随時報告書の一覧を所属機関の名称または外国人の氏名で絞り込む検索ボックス。
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
      placeholder="所属機関の名称または外国人の氏名で絞り込み（「BASE」「国崎」、ふりがなでも探せます）"
      hintOf={(c) => (c.kind === "worker" ? "外国人" : "所属機関")}
      suggest={adhocSearchSuggestions}
    />
  );
}
