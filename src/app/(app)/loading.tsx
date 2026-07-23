// ページ切り替え直後に即表示される読み込み中画面（スケルトン）。
// サーバーでのデータ取得を待っている間、クリックした瞬間にこの画面へ切り替わる
export default function Loading() {
  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6">
      {/* ヘッダーの骨組み */}
      <div className="border-b border-border bg-brand px-4 py-3.5 md:px-8">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 animate-pulse rounded-full bg-brand-foreground/20" />
          <div className="h-6 w-40 animate-pulse rounded-md bg-brand-foreground/20" />
        </div>
      </div>

      {/* 本文の骨組み */}
      <div className="space-y-4 px-4 pt-5 md:px-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-border bg-surface"
            />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-border bg-surface"
          />
        ))}
        <p className="pt-1 text-center text-xs text-muted">読み込み中…</p>
      </div>
    </div>
  );
}
