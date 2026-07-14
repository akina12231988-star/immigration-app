"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, UserRound } from "lucide-react";
import { uploadWorkerPhoto } from "@/lib/worker-photo";
import { getWorkerPhotoUrl } from "@/app/(app)/workers/actions";

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

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const newUrl = await uploadWorkerPhoto(workerId, file);
      setUrl(newUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
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
      </div>
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
