"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Camera,
  Check,
  ChevronRight,
  FileUp,
  ImagePlus,
  RotateCcw,
  Search,
  SearchX,
} from "lucide-react";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApplications } from "@/lib/application-store";
import { createClient } from "@/lib/supabase/client";
import { uploadApplicationFile } from "@/lib/application-files";
import { findApplicationsByNumber } from "@/lib/application-number";
import {
  advanceSituationOnApproval,
  approvalPatch,
  canMarkApproved,
} from "@/lib/application-approval";
import { todayStr } from "@/lib/application-alerts";
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
  // 数字だけでも探せるようにしたため、当てはまる申請が複数になることがある。
  // 1件なら今までどおりそのまま出し、複数なら選んでもらう
  const [matches, setMatches] = useState<Application[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const result = matches.find((a) => a.id === pickedId) ?? (matches.length === 1 ? matches[0] : null);
  const [attachState, setAttachState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setNoticeFile(file);
    setNoticePreview(URL.createObjectURL(file));
  }

  function runSearch() {
    const number = manualNumber.trim();
    if (!number) return;
    // 「福熊C10685号」でも「10685」でも見つかる
    const found = findApplicationsByNumber(applications, number);
    setMatches(found);
    setPickedId(found.length === 1 ? found[0].id : null);
    setSearched(true);
    setAttachState("idle");
    setApproved(false);
    setError(null);
  }

  // 通知書が届いた＝許可が降りた、なので、この画面から許可済みにできるようにする
  async function markApproved() {
    if (!result) return;
    setApproving(true);
    setError(null);
    try {
      await updateApplication(result.id, approvalPatch(todayStr()));
      // 特定技能の更新の許可なら、外国人の只今の状況を「更新」に進める（＜支援委託中＞は残す）
      await advanceSituationOnApproval(createClient(), result.workerId);
      setApproved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setApproving(false);
    }
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
          <Card className="p-0">
            <FileDropArea
              onFiles={(files) => handleFile(files[0])}
              className="space-y-3 rounded-2xl p-4"
            >
            <p className="text-sm text-muted">
              届いた通知書ハガキを撮影・選択しておくと、検索でヒットした人にそのまま登録できます
              <span className="mt-1 block text-[11px]">
                パソコンからは、この枠に画像をドラッグ＆ドロップしても取り込めます。
              </span>
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
            </FileDropArea>
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
              placeholder="通知書の受付番号（数字だけでも可）"
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

      {/* 数字だけで探すと同じ数字の申請が並ぶことがあるため、選んでもらう */}
      {searched && matches.length > 1 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted">
            当てはまる申請が{matches.length}件あります。どれか選んでください
          </h2>
          <div className="flex flex-col gap-2">
            {matches.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setPickedId(a.id)}
                className={`rounded-2xl border p-3 text-left ${
                  a.id === pickedId ? "border-brand bg-brand/5" : "border-border bg-surface"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-bold">{a.name}</span>
                  <StatusBadge status={a.status} />
                </span>
                <span className="block text-xs tabular-nums text-muted">
                  申請番号 {a.applicationNumber || "未登録"} ・ 申請日 {a.applicationDate || "—"}
                </span>
                <span className="block text-xs text-muted">{a.applicationContent}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {searched && matches.length === 0 && (
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

            {/* 審査中の申請は、詳細を開かなくてもここで許可済みにできる */}
            {approved ? (
              <p className="mb-2 flex items-center gap-2 rounded-lg bg-status-reported-bg px-3 py-2.5 text-sm font-bold text-status-reported-fg">
                <Check size={16} />
                許可済みにしました（在留カード受け取り待ちに移ります）
              </p>
            ) : (
              canMarkApproved(result) && (
                <Button
                  fullWidth
                  variant="secondary"
                  icon={<BadgeCheck size={18} />}
                  disabled={approving}
                  onClick={markApproved}
                  className="mb-2"
                >
                  {approving ? "保存しています…" : "許可が降りた（許可済みにする）"}
                </Button>
              )
            )}

            <Link
              href={`/applications/${result.id}`}
              className="flex items-center justify-center gap-1 rounded-xl border border-border py-3 text-sm font-bold"
            >
              詳細を開く
              <ChevronRight size={16} />
            </Link>
          </Card>
        </section>
      )}
    </div>
  );
}
