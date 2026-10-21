"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { downloadBlob } from "@/lib/xlsx-export";
import {
  APPROVAL_NOTICE_PER_IMAGE,
  APPROVAL_NOTICE_VIAS,
  approvalNoticeFileName,
  buildApprovalNoticeItems,
  canvasToPngBlob,
  chunkApprovalNoticeItems,
  copyCanvasToClipboard,
  drawApprovalNoticeImage,
  nowLabel,
  type ApprovalNoticeOverride,
} from "@/lib/approval-notice-image";
import type { Application } from "@/types/application";

const INPUT = "min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm focus:border-brand focus:outline-none";

// 選んだ申請を「許可のお知らせ」の画像にして、コピー（Messenger に貼る）か保存する
export function ApprovalNoticeImageDialog({
  apps,
  today,
  custodyNoLabel,
  tantouLabel,
  onClose,
}: {
  apps: Application[];
  today: string;
  custodyNoLabel: (app: Application) => string; // 預り番号（預かっていなければ「—」）
  tantouLabel?: (app: Application) => string; // 担当者（申請準備のTODOの担当者）
  onClose: () => void;
}) {
  // 預り番号は開いた時点のものを使う（毎回計算し直さない）
  const [custodyNos] = useState<Record<string, string>>(() =>
    Object.fromEntries(apps.map((a) => [a.id, custodyNoLabel(a)])),
  );
  const [tantous] = useState<Record<string, string>>(() =>
    Object.fromEntries(apps.map((a) => [a.id, tantouLabel?.(a) ?? ""])),
  );
  // まとめて決める「連絡が来た日」「手段」。人ごとに直したものは overrides に入る
  const [dateAll, setDateAll] = useState(today);
  const [via, setVia] = useState<string>(APPROVAL_NOTICE_VIAS[0]);
  const [overrides, setOverrides] = useState<Record<string, ApprovalNoticeOverride>>({});
  const [perImage, setPerImage] = useState(APPROVAL_NOTICE_PER_IMAGE);
  const [showRows, setShowRows] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(
    () =>
      buildApprovalNoticeItems(apps, {
        today,
        via,
        custodyNoLabel: (a) => custodyNos[a.id] ?? "—",
        tantouLabel: (a) => tantous[a.id] ?? "",
        overrides,
      }),
    [apps, today, via, custodyNos, tantous, overrides],
  );
  const chunks = useMemo(() => chunkApprovalNoticeItems(items, perImage), [items, perImage]);

  // 画像は Canvas に描く。内容が変わるたびに描き直す
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  useEffect(() => {
    const at = nowLabel();
    const total = chunks.reduce((n, c) => n + c.length, 0);
    let start = 1;
    chunks.forEach((chunk, i) => {
      const cv = canvases.current[i];
      if (cv) drawApprovalNoticeImage(cv, chunk, { generatedAt: at, total, page: i + 1, pages: chunks.length, startIndex: start });
      start += chunk.length;
    });
  }, [chunks]);

  const setRow = (id: string, patch: ApprovalNoticeOverride) =>
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  // 上で決めた日を全員に入れる（人ごとの直しは消える）
  const applyDateAll = () => setOverrides(Object.fromEntries(apps.map((a) => [a.id, { noticeDate: dateAll }])));

  const copy = async (i: number) => {
    setError(null);
    const cv = canvases.current[i];
    if (!cv) return;
    const ok = await copyCanvasToClipboard(cv);
    if (ok) {
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 2000);
    } else {
      setError("このブラウザは画像のコピーに対応していません。「画像を保存」で保存してから Messenger に添付してください。");
    }
  };
  const save = async (i: number) => {
    setError(null);
    const cv = canvases.current[i];
    if (!cv) return;
    try {
      const blob = await canvasToPngBlob(cv);
      const date = chunks[i]?.[0]?.noticeDate || today;
      downloadBlob(blob, approvalNoticeFileName(date, chunks[i].length, i + 1, chunks.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像を作れませんでした");
    }
  };

  return (
    <Modal open title={`許可のお知らせ画像（${apps.length}名）`} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <p className="text-[11px] leading-relaxed text-muted">
          選んだ人を1人1枠で並べた画像を作ります。右上に許可人数（全体）が出て、何枚かに分けたときは「1枚目／2枚（1〜5番）」のように枚数と通し番号も出ます。
          担当者は申請準備のTODOの担当者です。「画像をコピー」のあと Messenger の入力欄で貼り付け（長押し→ペースト／Ctrl+V）すると、
          そのまま送れます。連絡が来た日は、申請に許可日があればその日、無ければ今日が入っています。
        </p>

        {/* まとめて決める: 連絡が来た日・手段・1枚の人数 */}
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-2.5 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted">連絡が来た日</span>
            <span className="flex gap-1">
              <input type="date" value={dateAll} onChange={(e) => setDateAll(e.target.value)} className={INPUT} />
              <button
                type="button"
                onClick={applyDateAll}
                disabled={!dateAll}
                className="rounded-lg border border-border px-2.5 font-bold text-brand disabled:opacity-40"
              >
                全員この日にする
              </button>
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">連絡の手段</span>
            <select value={via} onChange={(e) => setVia(e.target.value)} className={`${INPUT} font-bold`}>
              {APPROVAL_NOTICE_VIAS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
              <option value="">（出さない）</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">1枚に入れる人数</span>
            <select value={perImage} onChange={(e) => setPerImage(Number(e.target.value))} className={`${INPUT} font-bold`}>
              {[3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n}名
                </option>
              ))}
              <option value={0}>全員1枚</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowRows((v) => !v)}
            aria-expanded={showRows}
            className="ml-auto min-h-[36px] rounded-lg border border-border px-2.5 font-bold text-muted"
          >
            {showRows ? "人ごとの日付をたたむ" : "人ごとに日付・手段を直す"}
          </button>
        </div>

        {showRows && (
          <div className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
            {items.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate font-bold">{it.name}</span>
                <input
                  type="date"
                  value={it.noticeDate}
                  onChange={(e) => setRow(it.id, { noticeDate: e.target.value })}
                  aria-label={`${it.name}の連絡が来た日`}
                  className={INPUT}
                />
                <select
                  value={it.via}
                  onChange={(e) => setRow(it.id, { via: e.target.value })}
                  aria-label={`${it.name}の連絡の手段`}
                  className={INPUT}
                >
                  {APPROVAL_NOTICE_VIAS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                  <option value="">（出さない）</option>
                </select>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        {/* できあがりの画像（複数枚なら順に並ぶ） */}
        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1">
          {chunks.map((chunk, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-muted">
                  {chunks.length > 1 ? `${i + 1}枚目／${chunks.length}枚（${chunk.length}名）` : `${chunk.length}名`}
                </span>
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => void copy(i)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-bold text-brand-foreground"
                  >
                    {copied === i ? <Check size={16} /> : <Copy size={16} />}
                    {copied === i ? "コピーしました" : "画像をコピー"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void save(i)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3.5 text-sm font-bold text-brand"
                  >
                    <Download size={16} />
                    画像を保存
                  </button>
                </span>
              </div>
              <canvas
                ref={(el) => {
                  canvases.current[i] = el;
                }}
                className="w-full rounded-xl border border-border bg-white"
                aria-label={`許可のお知らせ画像 ${i + 1}枚目`}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-xl border border-border px-5 text-sm font-bold text-muted"
        >
          閉じる
        </button>
      </div>
    </Modal>
  );
}
