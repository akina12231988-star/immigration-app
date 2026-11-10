"use client";

import { useRef, useState } from "react";
import { Building2, ImagePlus, Loader2, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { createOrgIconTicket, removeOrgIcon, setOrgIcon, type OrgIconKind } from "@/app/(app)/organizations/actions";

const LABEL: Record<OrgIconKind, string> = { logo: "ロゴマーク", rep_photo: "代表者の顔写真" };

// 画像を縮小してアップロードし、機関のアイコンに登録する。表示用のURLを返す
async function uploadOrgIcon(organizationId: string, kind: OrgIconKind, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("画像を選んでください");
  // アイコンなので長辺 512px で十分。透過PNGのロゴは白背景にして JPEG にする
  const { blob, mimeType } = await compressImage(file, 512, 0.9, true);
  const ticket = await createOrgIconTicket(organizationId, kind, mimeType);
  if (!ticket.ok) throw new Error(ticket.message);
  const { error } = await createClient()
    .storage.from("app-files")
    .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);
  const res = await setOrgIcon(organizationId, kind, ticket.path);
  if (!res.ok) throw new Error(res.message);
  return res.url;
}

// 所属機関のアイコン（ロゴマーク・代表者の顔写真）。
// 画像をドラッグ＆ドロップするか、押して選ぶと登録・差し替えできる。
//   size="sm": 一覧のカードの名前の横（小さい丸・四角）
//   size="lg": 所属機関の画面（大きい枠に「ここに画像をドロップ」）
export function OrgIcon({
  organizationId,
  kind,
  initialUrl,
  fallbackUrl,
  canEdit,
  size = "lg",
}: {
  organizationId: string;
  kind: OrgIconKind;
  initialUrl: string | null;
  fallbackUrl?: string | null; // 小さい表示で、この画像が無いときに代わりに出す（ロゴが無ければ顔写真）
  canEdit: boolean;
  size?: "sm" | "lg";
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const label = LABEL[kind];
  const shown = url ?? fallbackUrl ?? null;
  const round = kind === "rep_photo" || (!url && !!fallbackUrl);

  const upload = async (file: File | undefined) => {
    if (!file || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      setUrl(await uploadOrgIcon(organizationId, kind, file));
    } catch (err) {
      const message = err instanceof Error ? err.message : "登録できませんでした";
      setError(message);
      if (size === "sm") window.alert(message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  const remove = async () => {
    if (!window.confirm(`${label}を外しますか？`)) return;
    setBusy(true);
    const res = await removeOrgIcon(organizationId, kind);
    setBusy(false);
    if (!res.ok) setError(res.message);
    else setUrl(null);
  };
  const dropProps = canEdit
    ? {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
          if (!dragging) setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
          if (f) void upload(f);
          else setError("画像をドロップしてください");
        },
      }
    : {};
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => void upload(e.target.files?.[0])}
    />
  );
  const Fallback = kind === "rep_photo" ? UserRound : Building2;

  if (size === "sm") {
    return (
      <span
        {...dropProps}
        onClick={(e) => {
          if (!canEdit || shown) return;
          e.preventDefault();
          inputRef.current?.click();
        }}
        title={canEdit ? `${label}の画像をここにドロップすると登録できます` : label}
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border bg-background ${
          round ? "rounded-full" : "rounded-lg"
        } ${dragging ? "border-2 border-brand bg-brand/10" : "border-border"}`}
      >
        {input}
        {busy ? (
          <Loader2 size={14} className="animate-spin text-muted" />
        ) : shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像
          <img src={shown} alt={label} className="h-full w-full object-cover" />
        ) : (
          <Fallback size={16} className="text-muted" />
        )}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {input}
      <div
        {...dropProps}
        role={canEdit ? "button" : undefined}
        tabIndex={canEdit ? 0 : undefined}
        onClick={() => canEdit && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (canEdit && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
        }}
        title={canEdit ? `${label}：画像をドロップ、または押して選ぶ` : label}
        className={`relative flex h-28 w-28 items-center justify-center overflow-hidden border-2 border-dashed bg-background ${
          kind === "rep_photo" ? "rounded-full" : "rounded-xl"
        } ${dragging ? "border-brand bg-brand/10" : url ? "border-transparent" : "border-border"} ${canEdit ? "cursor-pointer" : ""}`}
      >
        {busy ? (
          <Loader2 size={20} className="animate-spin text-muted" />
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 px-2 text-center text-[10px] text-muted">
            <ImagePlus size={20} />
            {canEdit ? "画像をドロップ／押して選ぶ" : "未登録"}
          </span>
        )}
      </div>
      <span className="flex items-center gap-1 text-[11px] font-bold text-muted">
        {label}
        {canEdit && url && !busy && (
          <button type="button" onClick={() => void remove()} aria-label={`${label}を外す`} className="text-seal">
            <X size={12} />
          </button>
        )}
      </span>
      {error && <span className="max-w-[10rem] text-center text-[10px] text-seal">{error}</span>}
    </div>
  );
}
