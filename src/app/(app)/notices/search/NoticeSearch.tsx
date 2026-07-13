"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Check,
  ChevronRight,
  FileUp,
  ImagePlus,
  RotateCcw,
  Search,
  SearchX,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApplications } from "@/lib/application-store";
import { uploadApplicationFile } from "@/lib/application-files";
import type { Application } from "@/types/application";

// 通知書が届いたときの流れ:
// ① 通知書を撮影 → ② 受付番号で検索して名前をヒットさせる →
// ③ その申請に通知書画像を登録（状態が「通知書到着」に進む）→ ④ 詳細で許可済みにする
export function NoticeSearch() {
  const { applications, updateApplication } = useApplications();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [noticeFile, setNoticeFile] = useState<File | null>(null);
  const [noticePreview, setNoticePreview] = useState<string | null>(null);
  const [manualNumber, setManualNumber] = useState("");
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<Application | null>(null);
  const [attachState, setAttachState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setNoticeFile(file);
    setNoticePreview(URL.createObjectURL(file));
  }

  function runSearch() {
    const number = manualNumber.trim();
    if (!number) return;
    const found = applications.find((a) => a.applicationNumber === number);
    setResult(found ?? null);
    setSearched(true);
    setAttachState("idle");
    setError(null);
  }

  // ヒットした申請に通知書画像を登録し、状態を「通知書到着」へ進める
  async function attachNotice() {
    if (!result || !noticeFile) return;
    setAttachState("busy");
    setError(null);
    try {
      await uploadApplicationFile(result.id, "通知書", noticeFile);
      if (
        result.status === "申請前" ||
        result.status === "申請済" ||
        result.status === "LINE報告済"
      ) {
        await updateApplication(result.id, { status: "通知書到着" });
      }
      setAttachState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
      setAttachState("idle");
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-sm font-bold text-muted">① 通知書の画像（任意）</h2>
        {!noticePreview ? (
          <Card className="space-y-3 p-4">
            <p className="text-sm text-muted">
              届いた通知書ハガキを撮影・選択しておくと、検索でヒットした人にそのまま登録できます
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="primary"
                icon={<Camera size={19} />}
                onClick={() => cameraInputRef.current?.click()}
              >
                撮影する
              </Button>
              <Button
                variant="secondary"
                icon={<ImagePlus size={19} />}
                onClick={() => galleryInputRef.current?.click()}
              >
                画像を選択
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={noticePreview}
              alt="通知書プレビュー"
              className="mb-3 max-h-64 w-full rounded-lg object-contain bg-background"
            />
            <Button
              variant="secondary"
              icon={<RotateCcw size={17} />}
              fullWidth
              onClick={() => {
                setNoticeFile(null);
                setNoticePreview(null);
              }}
            >
              撮り直す・選び直す
            </Button>
          </Card>
        )}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-muted">② 受付番号で検索</h2>
        <Card className="p-4">
          <div className="flex gap-2">
            <input
              value={manualNumber}
              onChange={(e) => setManualNumber(e.target.value)}
              placeholder="通知書の受付番号を入力"
              className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-3 text-base focus:border-brand focus:outline-none"
            />
            <Button
              variant="primary"
              icon={<Search size={18} />}
              disabled={!manualNumber.trim()}
              onClick={runSearch}
            >
              検索
            </Button>
          </div>
        </Card>
      </section>

      {searched && result === null && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <SearchX size={28} className="text-muted" />
          <p className="text-sm text-muted">
            該当する申請が見つかりませんでした。番号をご確認ください
          </p>
        </Card>
      )}

      {result && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted">③ 検索結果</h2>
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <p className="text-lg font-bold">{result.name}</p>
              <StatusBadge status={result.status} />
            </div>
            <p className="text-sm text-muted">{result.applicationContent}</p>
            <p className="mb-3 text-xs tabular-nums text-muted">
              申請番号 {result.applicationNumber} ・ 申請日 {result.applicationDate}
            </p>

            {error && (
              <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
                {error}
              </p>
            )}

            {noticeFile ? (
              attachState === "done" ? (
                <p className="mb-2 flex items-center gap-2 rounded-lg bg-status-reported-bg px-3 py-2.5 text-sm font-bold text-status-reported-fg">
                  <Check size={16} />
                  通知書を登録しました（状態: 通知書到着）
                </p>
              ) : (
                <Button
                  fullWidth
                  icon={<FileUp size={18} />}
                  disabled={attachState === "busy"}
                  onClick={attachNotice}
                  className="mb-2"
                >
                  {attachState === "busy"
                    ? "登録しています…"
                    : "この人に通知書画像を登録する"}
                </Button>
              )
            ) : (
              <p className="mb-2 rounded-lg bg-background px-3 py-2 text-xs text-muted">
                ①で通知書の画像を選ぶと、ここから直接登録できます
              </p>
            )}

            <Link
              href={`/applications/${result.id}`}
              className="flex items-center justify-center gap-1 rounded-xl border border-border py-3 text-sm font-bold"
            >
              詳細を開いて許可済みにする
              <ChevronRight size={16} />
            </Link>
          </Card>
        </section>
      )}
    </div>
  );
}
