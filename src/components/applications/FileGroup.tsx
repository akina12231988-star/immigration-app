"use client";

import { useRef, useState } from "react";
import { FileText, ImagePlus, Trash2, Upload } from "lucide-react";
import type { ApplicationFile } from "@/types/application";

// 画像として表示できる拡張子。PDFなどはサムネイルにできないのでファイル名で表示する
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i;
const isImageFile = (fileName: string) => IMAGE_EXT.test(fileName);

// 種別ごとの添付一覧＋追加（受付票・通知書・在留カード・指定書・追加資料通知 共通）。
// 追加はドラッグ＆ドロップと、押してファイルを選ぶ方法のどちらでもできる。
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
  const [dragOver, setDragOver] = useState(false);

  // 1件だけの欄に複数ドロップされたら先頭の1件だけ受け取る（ファイル選択と同じ扱い）
  const limitFiles = (list: FileList | null) => {
    if (!list || multiple || list.length <= 1) return list;
    const dt = new DataTransfer();
    dt.items.add(list[0]);
    return dt.files;
  };

  return (
    <div>
      <p className="mb-1.5 text-xs font-bold text-muted">{label}</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!uploading) onSelect(limitFiles(e.dataTransfer.files));
        }}
        className={`rounded-xl p-1 ${dragOver ? "bg-brand/10 ring-2 ring-brand" : ""}`}
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f) => (
            <div key={f.id} className="relative">
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-xl border border-border bg-background"
              >
                {isImageFile(f.fileName) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={f.fileName} className="aspect-square w-full object-cover" />
                ) : (
                  /* PDFなどは画像として表示できないため、アイコンとファイル名を出して
                     押したら別タブで開く */
                  <span className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 px-2 text-center">
                    <FileText size={26} className="shrink-0 text-brand" />
                    <span className="line-clamp-3 break-all text-[10px] leading-tight text-muted">
                      {f.fileName}
                    </span>
                    <span className="text-[10px] font-bold text-brand">開く</span>
                  </span>
                )}
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
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-background px-2 text-center text-muted disabled:opacity-50"
            aria-label={`${label}を追加`}
          >
            {uploading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            ) : (
              <>
                {dragOver ? <Upload size={22} className="text-brand" /> : <ImagePlus size={22} />}
                <span className="text-[10px] leading-tight">
                  ファイルを選ぶ
                  <br />
                  ドロップも可
                </span>
              </>
            )}
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        画像・PDFをここにドラッグ＆ドロップするか、点線の枠を押してファイルを選んでください。
      </p>
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
