"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ImageIcon } from "lucide-react";
import { renderPostingsGrid, type GridPosting } from "@/lib/posting-grid";

export interface FlyerItem {
  id: string;
  company: string;
  grid: GridPosting;
}

const DEFAULT_TAGLINE =
  "Miễn phí xin việc. Sau khi vào làm nếu không ưng hỗ trợ chuyển công ty mới ngay !";

// Facebook掲載用の複数会社グリッド画像を作成・ダウンロードする
export function FlyerClient({ items }: { items: FlyerItem[] }) {
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState(DEFAULT_TAGLINE);
  const [selected, setSelected] = useState<Set<string>>(new Set(items.map((i) => i.id)));
  const [imageUrl, setImageUrl] = useState("");

  const chosen = items.filter((i) => selected.has(i.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const generate = () => {
    const url = renderPostingsGrid(
      chosen.map((i) => i.grid),
      { title, tagline, companyNames: chosen.map((i) => i.company) },
    );
    setImageUrl(url);
  };

  const download = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `求人掲載_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  };

  const INPUT = "min-h-[44px] w-full rounded-xl border border-border bg-surface px-3.5 text-sm focus:border-brand focus:outline-none";

  return (
    <>
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
        <Link href="/postings" aria-label="戻る" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-foreground/10">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="flex-1 text-lg font-bold">Facebook掲載画像（一覧）</h1>
      </div>

      <div className="space-y-4 px-4 py-4 lg:px-8">
        <p className="text-sm text-muted">
          複数の会社に番号を振った掲載画像を作成します。外国人が「何番の求人を希望」と返事しやすくなります。
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">見出し（登録支援機関名など）</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 〇〇サポート" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">キャッチコピー（ベトナム語）</span>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} className={INPUT} />
          </label>
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl bg-background p-4 text-sm text-muted">
            掲載できる求人がありません。求人を登録してください。
          </p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-sm font-bold text-muted">掲載する求人（番号順）</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {items.map((it, idx) => (
                  <label key={it.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} className="h-4 w-4" />
                    <span className="font-bold text-muted">{idx + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{it.company}</span>
                    <span className="truncate text-xs text-muted">{it.grid.job}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={generate}
              disabled={chosen.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground disabled:opacity-50"
            >
              <ImageIcon size={18} />
              掲載画像を作成（{chosen.length}社）
            </button>

            {imageUrl && (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="掲載画像プレビュー" className="w-full rounded-xl border border-border" />
                <button
                  type="button"
                  onClick={download}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-bold text-brand"
                >
                  <Download size={18} />
                  画像を保存（PNG）
                </button>
                <p className="text-xs text-muted">スマホは画像を長押しでも保存できます。</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
