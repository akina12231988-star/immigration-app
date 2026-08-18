"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { RELEASE_NOTES } from "@/lib/release-notes";
import { READ_KEY, readReleaseNotes } from "@/lib/release-notes-read";
import { formatDateJP } from "@/lib/tax-cert";

// 新機能・変更点の一覧。開いた時点で「読んだ」ことにしてバッジを消す
export function UpdatesClient() {
  const [lastRead, setLastRead] = useState<string>("");

  useEffect(() => {
    // 開いた時点の既読日を控えてから既読にする（今回の分に NEW を付けるため）
    const apply = () => {
      let at = "";
      try {
        at = window.localStorage.getItem(READ_KEY) ?? "";
      } catch {
        at = "";
      }
      setLastRead(at);
    };
    apply();
    readReleaseNotes();
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        アプリに追加した機能と、変わったところのお知らせです。新しい順に並んでいます。
      </p>
      {RELEASE_NOTES.map((n, i) => {
        const isNew = !lastRead || n.date > lastRead;
        return (
          <Card key={`${n.date}-${i}`} className="p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold tabular-nums text-muted">
                {formatDateJP(n.date)}
              </span>
              {isNew && (
                <span className="flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
                  <Sparkles size={11} />
                  NEW
                </span>
              )}
            </div>
            <h2 className="text-sm font-bold">{n.title}</h2>
            <p className="mt-1 rounded-lg bg-background px-2.5 py-1.5 text-[11px] font-bold text-muted">
              場所：{n.where}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted">
              {n.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
            {n.href && (
              <Link
                href={n.href}
                className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand"
              >
                この画面を開く
                <ArrowRight size={13} />
              </Link>
            )}
          </Card>
        );
      })}
    </div>
  );
}
