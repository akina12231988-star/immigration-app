"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { workerNameSuggestions, type SearchableWorker } from "@/lib/worker-search";

// 名前を入力すると候補が出て、選ぶと一覧をその1件で絞り込む検索ボックス。
// 既定は外国人の氏名（ふりがな・空白の入れ方の違いでも探せる。worker-search.ts）。
// suggest を渡すと会社・機関の名称など別の探し方にもできる（org-search.ts）。
// 申請準備の一覧・求職一覧・所属機関の情報で同じ形にしている。
export function NameSearchBox<T extends SearchableWorker & { id: string }>({
  candidates,
  value,
  onChange,
  placeholder = "外国人の氏名を入力して検索（ふりがなでも探せます）",
  hintOf,
  suggest = workerNameSuggestions,
}: {
  candidates: T[]; // 候補に出す人
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hintOf?: (worker: T) => string; // 候補の右に出す補足（在留期限・応募先など）
  suggest?: (candidates: T[], query: string) => T[]; // 候補の絞り込み方（既定は氏名）
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 外側をクリックしたら候補を閉じる
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const suggestions = useMemo(() => suggest(candidates, value), [suggest, candidates, value]);
  const showSuggestions = open && value.trim().length > 0 && suggestions.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
        <Search size={16} className="shrink-0 text-muted" />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="min-h-[44px] w-full bg-transparent text-base focus:outline-none"
        />
        {value && (
          <button
            type="button"
            aria-label="検索をクリア"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="shrink-0 text-muted"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {showSuggestions && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
          {suggestions.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(w.name);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm"
              >
                <span className="min-w-0 truncate font-bold">{w.name}</span>
                <span className="shrink-0 text-[11px] text-muted">{hintOf?.(w) ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
