"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ImagePlus, Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { FileDropArea } from "@/components/ui/FileDropArea";
import {
  createGuideImageTicket,
  getGuideImageUrls,
  setGuideImage,
  type GuideImageKind,
} from "./guide-actions";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { CARD_MAIL_TO, CARD_RETURN_TO, mailAddressText, type MailAddress } from "@/lib/card-pickup-guide";

// 在留カードの受け取りの手続き（郵送で受け取る／郵送→窓口へ受け取り方法を変更）の案内。
// 郵送の宛名（郵送先・返信用封筒）は欄ごと・まとめてコピーできる
export function CardPickupGuide({ canEdit = true }: { canEdit?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"mail" | "counter">("mail");
  // 手続きのイラスト（画面からドラッグ＆ドロップで登録・差し替え）
  const [images, setImages] = useState<Partial<Record<GuideImageKind, string>>>({});
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getGuideImageUrls()
      .then((u) => {
        if (!cancelled) setImages(u);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold"
      >
        <Mail size={15} className="text-brand" />
        在留カードの受け取りの手続き（郵送で受け取る・郵送→窓口へ変更）と郵送の宛名
        <ChevronDown size={16} className={`ml-auto text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="flex gap-1 rounded-lg bg-background p-1 text-xs font-bold">
            {(
              [
                ["mail", "郵送で受け取る場合"],
                ["counter", "郵送→窓口へ受け取り方法を変更する場合"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex-1 rounded-md px-2 py-1.5 ${tab === k ? "bg-brand text-brand-foreground" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <GuideImage
            kind={tab}
            url={images[tab] ?? null}
            canEdit={canEdit}
            onUploaded={(url) => setImages((prev) => ({ ...prev, [tab]: url }))}
          />
          {tab === "counter" && (
            <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted">
              受け取り方法を郵送から窓口へ変えたときは、一覧表の「受領方法」に「窓口（受領官署）」と出ます。
            </p>
          )}
          {tab === "mail" && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <AddressBox title="郵送先（書類を送る先）" address={CARD_MAIL_TO} />
              <AddressBox title="返信用封筒の宛名（在留カードを送り返してもらう先）" address={CARD_RETURN_TO} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function AddressBox({ title, address: a }: { title: string; address: MailAddress }) {
  const row = (label: string, value: string) =>
    value ? (
      <p className="flex items-start gap-2 text-xs">
        <span className="w-10 shrink-0 text-muted">{label}</span>
        <span className="min-w-0 flex-1 font-bold">{value}</span>
        <CopyButton value={value} label={`${label}をコピー`} size={12} />
      </p>
    ) : null;
  return (
    <div className="space-y-1 rounded-lg border border-border bg-background p-2.5">
      <p className="flex items-center justify-between gap-2 text-[11px] font-bold text-muted">
        {title}
        <span className="inline-flex items-center gap-1 font-bold text-brand">
          まとめてコピー
          <CopyButton value={mailAddressText(a)} label={`${title}をまとめてコピー`} size={12} />
        </span>
      </p>
      {row("〒", a.postal)}
      {row("住所", a.address)}
      {row("宛名", a.name)}
    </div>
  );
}

// 手続きのイラスト。画像をドロップするか押して選ぶと登録・差し替えできる。押すと別タブで大きく開く
function GuideImage({
  kind,
  url,
  canEdit,
  onUploaded,
}: {
  kind: GuideImageKind;
  url: string | null;
  canEdit: boolean;
  onUploaded: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      if (!file.type.startsWith("image/")) throw new Error("画像を選んでください");
      // 文字の多いイラストなので、長辺 2400px まで残す
      const { blob, mimeType } = await compressImage(file, 2400, 0.92);
      const ticket = await createGuideImageTicket(kind, mimeType);
      if (!ticket.ok) throw new Error(ticket.message);
      const { error: upErr } = await createClient()
        .storage.from("app-files")
        .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
      if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
      const res = await setGuideImage(kind, ticket.path);
      if (!res.ok) throw new Error(res.message);
      onUploaded(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  };
  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => {
        void upload(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  return (
    <div className="space-y-1">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" title="押すと大きく開きます">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={kind === "mail" ? "郵送での受け取り方法" : "窓口での受け取りへの変更"} className="w-full rounded-lg border border-border" />
        </a>
      ) : (
        !canEdit && <p className="text-xs text-muted">イラストはまだ登録されていません。</p>
      )}
      {canEdit && (
        <FileDropArea
          onFiles={(files) => void upload(files[0])}
          disabled={busy}
          className="rounded-lg border border-dashed border-border bg-background p-2"
          title="イラストの画像をここにドロップすると登録されます"
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            {picker}
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 font-bold text-brand disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
              {url ? "イラストを差し替える" : "イラストを登録する"}
            </button>
            画像をここにドラッグ＆ドロップしても登録できます
          </div>
          {error && <p className="mt-1 text-[11px] text-seal">{error}</p>}
        </FileDropArea>
      )}
    </div>
  );
}
