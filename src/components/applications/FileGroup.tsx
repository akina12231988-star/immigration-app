"use client";

import { useRef } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import type { ApplicationFile } from "@/types/application";

// 画像種別ごとのサムネイル一覧＋追加ボタン（受付票・通知書・在留カード・指定書 共通）
export function FileGroup({
  label,
  hint,
  files,
  uploading,
  multiple = false,
  onSelect,
  onDelete,
}: {
  label: string;
  hint?: string;
  files: ApplicationFile[];
  uploading: boolean;
  multiple?: boolean;
  onSelect: (list: FileList | null) => void;
  onDelete?: (file: ApplicationFile) => void; // 指定時のみ各サムネイルに削除ボタンを表示
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold text-muted">{label}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {files.map((f) => (
          <div key={f.id} className="relative">
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-xl border border-border bg-background"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.fileName} className="aspect-square w-full object-cover" />
            </a>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(f)}
                aria-label={`${f.fileName}を削除`}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-seal text-seal-foreground shadow hover:opacity-90"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border bg-background text-muted disabled:opacity-50"
          aria-label={`${label}を追加`}
        >
          {uploading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          ) : (
            <ImagePlus size={22} />
          )}
        </button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          onSelect(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
