"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, UserRound } from "lucide-react";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { uploadWorkerPhoto } from "@/lib/worker-photo";
import { getWorkerPhotoUrl } from "@/app/(app)/workers/actions";
import { notifyWorkerPhotoChanged, useWorkerPhotoChanged } from "@/lib/worker-docs-events";

// 顔写真の表示＋アップロード（外国人詳細）
export function WorkerPhoto({
  workerId,
  photoPath,
  canEdit,
  size = 80,
}: {
  workerId: string;
  photoPath: string | null;
  canEdit: boolean;
  size?: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (photoPath) {
      getWorkerPhotoUrl(photoPath).then((u) => {
        if (!cancelled) setUrl(u);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  // 申請準備のチェックリストで登録された写真もすぐここに出す。
  // ページ側の photo_path も新しくして、次の保存で古い写真に戻らないようにする
  useWorkerPhotoChanged(workerId, (newUrl) => {
    setUrl(newUrl);
    router.refresh();
  });

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const newUrl = await uploadWorkerPhoto(workerId, file);
      setUrl(newUrl);
      notifyWorkerPhotoChanged(workerId, newUrl); // チェックリスト側にも反映する
      // ページ側の photo_path も新しくする。古いままだと、このあと編集フォームを
      // 開いて保存したときに写真が古いパスに戻ってしまう
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {/* 写真の枠にドロップしてもアップロードできる */}
      <FileDropArea
        onFiles={(files) => void handleFile(files[0])}
        disabled={!canEdit || busy}
        title="ここに写真をドロップしても登録できます"
        className="relative overflow-hidden rounded-2xl border border-border bg-background"
        style={{ width: size, height: size }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="顔写真" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <UserRound size={size * 0.5} />
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        )}
      </FileDropArea>
      {canEdit && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1 text-[11px] font-bold text-brand"
        >
          <Camera size={12} />
          写真
        </button>
      )}
      {error && <span className="text-[10px] text-seal">{error}</span>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
