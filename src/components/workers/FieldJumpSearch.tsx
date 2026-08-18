"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

// 画面内の入力項目・見出しへ飛ぶための検索。
// 外国人詳細は項目が多く、目当ての欄まで探すのに時間がかかるので、
// 左下の検索窓に言葉を入れて、その項目まで一気にスクロールできるようにする。
//
// 項目は画面に出ている見出し（h1〜h3）とラベルをその場で拾う。
// 事前に項目リストを持たないので、画面を増やしてもそのまま使える。

// 画面の左下に固定する位置。
// スマホ: 下タブ（BottomNav）に重ならないよう、タブの高さ＋セーフエリア分だけ上げる。
// PC: 左のサイドナビ（w-60 = 15rem）に重ならないよう、その右側に置く。
const ANCHOR =
  "fixed left-4 z-30 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] md:bottom-6 md:left-[16.5rem] print:hidden";

interface Target {
  el: HTMLElement;
  text: string; // 項目名
  section: string; // 直前の見出し（どのカードの項目か）
}

// ラベルの文字。selectのoptionやinputのボタン文字まで拾わないように、
// 直下の文字と、入力欄以外の子要素の文字だけを使う
function labelText(el: HTMLElement): string {
  const parts: string[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
    } else if (node instanceof HTMLElement) {
      if (/^(SELECT|INPUT|TEXTAREA|BUTTON|OPTION)$/.test(node.tagName)) continue;
      parts.push(node.textContent ?? "");
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// いま画面にある見出しとラベルを、上から順に集める
function collectTargets(): Target[] {
  const root = document.querySelector("main") ?? document.body;
  const out: Target[] = [];
  let section = "";
  root.querySelectorAll<HTMLElement>("h1, h2, h3, label").forEach((el) => {
    // 検索パネル自身は対象外
    if (el.closest("[data-field-jump]")) return;
    const heading = el.tagName !== "LABEL";
    const text = heading ? (el.textContent ?? "").replace(/\s+/g, " ").trim() : labelText(el);
    if (!text || text.length > 40) {
      if (heading && text) section = text;
      return;
    }
    if (heading) section = text;
    out.push({ el, text, section: heading ? "" : section });
  });
  return out;
}

export function FieldJumpSearch({
  label = "項目を探す",
}: {
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Target[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 開いたら入力欄にカーソルを置く
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 入力のたびに、そのとき画面に出ている項目から探す
  const search = (value: string) => {
    setQuery(value);
    const q = value.trim().toLowerCase();
    if (!q) {
      setHits([]);
      setActive(0);
      return;
    }
    const found = collectTargets().filter(
      (t) => t.text.toLowerCase().includes(q) || t.section.toLowerCase().includes(q),
    );
    setHits(found.slice(0, 12));
    setActive(0);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
    setHits([]);
  };

  // その項目までスクロールして、入力欄があればカーソルも置く
  const jumpTo = (t: Target) => {
    t.el.scrollIntoView({ behavior: "smooth", block: "center" });
    // どこへ飛んだかが分かるように一瞬だけ枠を光らせる
    const mark = t.el.tagName === "LABEL" ? t.el : (t.el.closest("div") ?? t.el);
    mark.classList.add("ring-2", "ring-brand", "rounded-xl");
    window.setTimeout(() => mark.classList.remove("ring-2", "ring-brand", "rounded-xl"), 2000);
    const field = t.el.querySelector<HTMLElement>("input, select, textarea");
    if (field) window.setTimeout(() => field.focus({ preventScroll: true }), 400);
    close();
  };

  if (!open) {
    return (
      <button
        type="button"
        data-field-jump
        onClick={() => setOpen(true)}
        className={`${ANCHOR} flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2.5 text-xs font-bold text-brand shadow-lg`}
      >
        <Search size={15} />
        {label}
      </button>
    );
  }

  return (
    <div
      data-field-jump
      className={`${ANCHOR} w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-3 shadow-xl`}
    >
      <div className="mb-2 flex items-center gap-2">
        <Search size={15} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              close();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              jumpTo(hits[active]);
            }
          }}
          placeholder="例: 在留期限、給与、住所"
          className="min-h-[36px] w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={close}
          aria-label="項目検索を閉じる"
          className="shrink-0 text-muted"
        >
          <X size={16} />
        </button>
      </div>

      {query.trim() === "" ? (
        <p className="px-1 text-[11px] leading-relaxed text-muted">
          探したい項目の名前を入れると、その欄まで移動します。
          編集フォームを開いていれば、その中の項目も探せます。
        </p>
      ) : hits.length === 0 ? (
        <p className="px-1 text-[11px] text-muted">「{query}」に当てはまる項目はありません。</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto">
          {hits.map((t, i) => (
            <li key={`${t.section}-${t.text}-${i}`}>
              <button
                type="button"
                onClick={() => jumpTo(t)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left ${
                  i === active ? "bg-brand/10" : ""
                }`}
              >
                <span className="text-xs font-bold">{t.text}</span>
                {t.section && <span className="text-[10px] text-muted">{t.section}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
