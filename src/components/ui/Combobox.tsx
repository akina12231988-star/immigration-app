"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export interface ComboOption {
  id: string;
  label: string;
}

// 文字入力で候補を絞り込み、クリックで選択するコンボボックス。
// 1文字でもヒットすれば候補を表示する。
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "入力して検索",
  className = "",
}: {
  options: ComboOption[];
  value: string; // 選択中の id
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;

  // 外側クリックで閉じる
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const base =
    "min-h-[44px] w-full rounded-xl border border-border bg-surface px-3.5 text-base focus:border-brand focus:outline-none";

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {selected && !open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setQuery("");
          }}
          className={`${base} flex items-center justify-between py-2 text-left`}
        >
          <span className="truncate">{selected.label}</span>
          <span className="flex items-center gap-1">
            <X
              size={16}
              className="text-muted"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            />
            <ChevronDown size={16} className="text-muted" />
          </span>
        </button>
      ) : (
        <div className="relative">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={`${base} py-2 pr-9`}
          />
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted">候補がありません</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                  setQuery("");
                }}
                className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-background ${
                  o.id === value ? "font-bold text-brand" : ""
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
