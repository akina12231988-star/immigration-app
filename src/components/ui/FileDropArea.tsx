"use client";

import { useState } from "react";

// ファイルのドラッグ&ドロップを受け付ける領域。
// 「追加」ボタン（hidden な input[type=file]）と併用でき、
// この領域にファイルを落としても同じアップロード処理が動く。
export function FileDropArea({
  onFiles,
  disabled = false,
  className = "",
  style,
  title = "ここにファイルをドロップしてもアップロードできます",
  children,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      className={`${className} ${over ? "border-brand ring-2 ring-brand/30" : ""}`}
      style={style}
      title={disabled ? undefined : title}
      onDragOver={(e) => {
        if (disabled) return;
        // ドロップを受け付けるにはブラウザの既定動作を止める必要がある
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        // 子要素へ移っただけのときは解除しない
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(false);
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) onFiles(files);
      }}
    >
      {children}
    </div>
  );
}
