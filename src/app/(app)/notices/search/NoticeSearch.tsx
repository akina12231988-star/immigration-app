"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, ImagePlus, Search, ChevronRight, SearchX } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApplications } from "@/lib/application-store";
import type { Application } from "@/types/application";

export function NoticeSearch() {
  const { applications } = useApplications();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [manualNumber, setManualNumber] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [result, setResult] = useState<Application | null | undefined>(
    undefined
  );

  function runSearch(number: string) {
    setStatus("loading");
    setTimeout(() => {
      const found = applications.find((a) => a.applicationNumber === number);
      setResult(found ?? null);
      setStatus("done");
    }, 900);
  }

  function handleImage() {
    // OCRで通知書から受付番号を読み取るモック。手元の登録データからランダムに1件を検出したことにする
    const candidates = applications.filter((a) => a.applicationNumber);
    const picked =
      candidates[Math.floor(Math.random() * candidates.length)];
    runSearch(picked?.applicationNumber ?? "");
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-4">
        <p className="text-sm text-muted">
          通知書ハガキを撮影・選択するか、受付番号を直接入力して検索できます
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="primary"
            icon={<Camera size={19} />}
            onClick={() => cameraInputRef.current?.click()}
          >
            撮影して検索
          </Button>
          <Button
            variant="secondary"
            icon={<ImagePlus size={19} />}
            onClick={() => galleryInputRef.current?.click()}
          >
            画像から検索
          </Button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleImage()}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleImage()}
        />

        <div className="flex items-center gap-2 pt-1">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted">または</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="flex gap-2">
          <input
            value={manualNumber}
            onChange={(e) => setManualNumber(e.target.value)}
            inputMode="numeric"
            placeholder="申請番号を入力"
            className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-3 text-base focus:border-brand focus:outline-none"
          />
          <Button
            variant="primary"
            icon={<Search size={18} />}
            disabled={!manualNumber}
            onClick={() => runSearch(manualNumber)}
          >
            検索
          </Button>
        </div>
      </Card>

      {status === "loading" && (
        <Card className="flex items-center gap-3 p-5">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-sm text-muted">検索しています…</p>
        </Card>
      )}

      {status === "done" && result === null && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <SearchX size={28} className="text-muted" />
          <p className="text-sm text-muted">
            該当する申請が見つかりませんでした
          </p>
        </Card>
      )}

      {status === "done" && result && (
        <div>
          <h2 className="mb-2 text-sm font-bold text-muted">検索結果</h2>
          <Link href={`/applications/${result.id}`}>
            <Card className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <p className="font-bold">{result.name}</p>
                  <StatusBadge status={result.status} />
                </div>
                <p className="truncate text-sm text-muted">
                  {result.applicationContent}
                </p>
                <p className="text-xs text-muted">
                  申請番号 {result.applicationNumber}
                </p>
              </div>
              <ChevronRight size={20} className="shrink-0 text-muted" />
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}
