"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { buildXlsx, downloadBlob } from "@/lib/xlsx-export";
import { todayStr } from "@/lib/ssw/calc";
import {
  buildWorkerExportSheet,
  DEFAULT_WORKER_EXPORT_KEYS,
  WORKER_EXPORT_COLUMNS,
  workerExportFileName,
  workerExportGroups,
  type WorkerExportContext,
} from "@/lib/worker-export";
import type { WorkerWithHistories } from "@/types/db";

// 前回選んだ項目を同じ端末で覚えておく（無くても動く）
const STORAGE_KEY = "worker-export-keys";

function loadKeys(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string") && parsed.length > 0) return parsed;
  } catch {
    /* 読めなければ既定の項目 */
  }
  return DEFAULT_WORKER_EXPORT_KEYS;
}

function saveKeys(keys: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* 保存できなくても続ける */
  }
}

// 選んだ外国人について、出したい項目を選んで Excel（.xlsx）にする
export function WorkerExportDialog({
  workers,
  ctx,
  onClose,
}: {
  workers: WorkerWithHistories[];
  ctx: WorkerExportContext;
  onClose: () => void;
}) {
  const [keys, setKeys] = useState<string[]>(() => loadKeys());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = new Set(keys);
  const groups = workerExportGroups();

  const toggle = (key: string) =>
    setKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const setGroup = (group: string, on: boolean) => {
    const inGroup = WORKER_EXPORT_COLUMNS.filter((c) => c.group === group).map((c) => c.key);
    setKeys((prev) => (on ? [...new Set([...prev, ...inGroup])] : prev.filter((k) => !inGroup.includes(k))));
  };

  const download = async () => {
    if (keys.length === 0) {
      setError("出す項目を1つ以上選んでください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const today = todayStr();
      const blob = await buildXlsx([buildWorkerExportSheet(workers, keys, ctx)]);
      downloadBlob(blob, workerExportFileName(workers.length, today));
      saveKeys(keys);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Excel を作れませんでした");
      setBusy(false);
    }
  };

  return (
    <Modal open title={`Excel 出力（${workers.length}名）`} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <p className="text-[11px] leading-relaxed text-muted">
          選んだ外国人を1人1行で、下でチェックした項目を列にして Excel（.xlsx）にします。1行目が見出しです。
          選んだ項目はこの端末で次回も覚えています。個人番号などの番号を含めるときは、ファイルの取り扱いに注意してください。
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="font-bold text-muted">{keys.length}項目を選択中</span>
          <button
            type="button"
            onClick={() => setKeys(WORKER_EXPORT_COLUMNS.map((c) => c.key))}
            className="rounded-full border border-border px-2.5 py-1 font-bold text-brand"
          >
            すべて選ぶ
          </button>
          <button
            type="button"
            onClick={() => setKeys(DEFAULT_WORKER_EXPORT_KEYS)}
            className="rounded-full border border-border px-2.5 py-1 font-bold text-brand"
          >
            基本の項目だけ
          </button>
          <button
            type="button"
            onClick={() => setKeys([])}
            className="rounded-full border border-border px-2.5 py-1 font-bold text-muted"
          >
            すべて外す
          </button>
        </div>
        <div className="grid max-h-[55vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {groups.map((group) => {
            const cols = WORKER_EXPORT_COLUMNS.filter((c) => c.group === group);
            const allOn = cols.every((c) => selected.has(c.key));
            return (
              <div key={group} className="rounded-xl border border-border p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{group}</span>
                  <button
                    type="button"
                    onClick={() => setGroup(group, !allOn)}
                    className="text-[11px] font-bold text-brand"
                  >
                    {allOn ? "この欄を外す" : "この欄をすべて選ぶ"}
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {cols.map((c) => (
                    <label key={c.key} className="flex min-h-[28px] items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selected.has(c.key)}
                        onChange={() => toggle(c.key)}
                        className="h-4 w-4"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button fullWidth icon={<Download size={18} />} onClick={() => void download()} disabled={busy}>
            {busy ? "作成中…" : `Excel をダウンロード（${workers.length}名・${keys.length}項目）`}
          </Button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 whitespace-nowrap rounded-xl border border-border px-5 text-sm font-bold text-muted"
          >
            やめる
          </button>
        </div>
      </div>
    </Modal>
  );
}
