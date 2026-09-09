"use client";

import {
  PREFECTURE_LIST,
  PREFECTURE_TILE_COLS,
  PREFECTURE_TILE_ROWS,
  PREFECTURE_TILES,
  prefectureShortName,
  type Prefecture,
} from "@/lib/prefectures";

// 日本列島を格子に簡略化したタイル地図。
// 登録のある県だけ色を付けて件数を出し、押すとその県で絞り込める（もう一度押すと解除）。
export function PrefectureTileMap({
  counts,
  selected,
  onSelect,
}: {
  counts: Map<string, number>; // 都道府県 → 件数
  selected: Prefecture | null;
  onSelect: (p: Prefecture | null) => void;
}) {
  return (
    <div>
      <div
        role="group"
        aria-label="都道府県の地図"
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${PREFECTURE_TILE_COLS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${PREFECTURE_TILE_ROWS}, minmax(0, 1fr))`,
          aspectRatio: `${PREFECTURE_TILE_COLS} / ${PREFECTURE_TILE_ROWS}`,
        }}
      >
        {PREFECTURE_LIST.map((p) => {
          const [x, y] = PREFECTURE_TILES[p];
          const n = counts.get(p) ?? 0;
          const has = n > 0;
          const on = selected === p;
          return (
            <button
              key={p}
              type="button"
              disabled={!has}
              aria-pressed={on}
              aria-label={has ? `${p} ${n}件` : `${p} 登録なし`}
              onClick={() => onSelect(on ? null : p)}
              style={{ gridColumn: x + 1, gridRow: y + 1 }}
              className={`relative flex items-center justify-center overflow-hidden rounded-[5px] font-bold leading-none tracking-tighter ${
                prefectureShortName(p).length >= 3 ? "text-[7px] sm:text-[8px]" : "text-[9px] sm:text-[10px]"
              } ${
                has
                  ? `cursor-pointer bg-brand text-brand-foreground hover:bg-brand-strong ${on ? "ring-[3px] ring-status-notice-fg ring-offset-1 ring-offset-surface" : ""}`
                  : "bg-background text-muted/50"
              } ${p === "沖縄県" && !has ? "border border-dashed border-border" : ""}`}
            >
              {prefectureShortName(p)}
              {has && (
                <span className="absolute -right-1.5 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-status-notice-fg px-1 text-[9px] font-bold text-white tabular-nums">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex items-center gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-[3px] bg-brand" />
          登録あり（数字は件数）
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-[3px] bg-background" />
          登録なし
        </span>
      </p>
    </div>
  );
}
