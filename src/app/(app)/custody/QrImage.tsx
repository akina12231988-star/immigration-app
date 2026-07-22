"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";

// 保管番号QR: 読み取ると /custody?no=番号 が開き、その番号の持出・返却画面に直行する
export function custodyQrUrl(origin: string, storageNo: number): string {
  return `${origin}/custody?no=${storageNo}`;
}

// SSR中は空文字、クライアントでは現在のオリジンを返す
const noopSubscribe = () => () => {};
export function useOrigin(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}

export function QrImage({
  text,
  size = 140,
  className = "",
}: {
  text: string;
  size?: number;
  className?: string;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(text, { margin: 1, width: size * 2 })
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [text, size]);

  if (!url) {
    return <div style={{ width: size, height: size }} className={`rounded bg-background ${className}`} />;
  }
  // dataURL のQR画像のため next/image は使わない
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="QRコード" width={size} height={size} className={className} />;
}

// QRを高解像度PNGとして保存するボタン。
// スマホでは共有シート（「画像を保存」「写真に追加」）を開き、PCでは通常のダウンロード。
// どちらも使えない場合は大きなQRを表示して長押し保存を案内する。
export function QrSaveButton({
  text,
  filename,
  className = "",
  children,
}: {
  text: string;
  filename: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const dataUrl = await QRCode.toDataURL(text, { margin: 2, width: 512 });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: "image/png" });

      // スマホ: 共有シートから写真に保存できる（iOS Safari は download 属性が効かないため）
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return;
        } catch (err) {
          // キャンセルは正常終了扱い。それ以外はフォールバックへ
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      // PCブラウザ: 通常のダウンロード
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setFallback(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" disabled={busy} onClick={() => void save()} className={className}>
        {children}
      </button>
      {fallback && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
          onClick={() => setFallback(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <QrImage text={text} size={220} className="mx-auto" />
            <p className="mt-3 text-xs leading-relaxed text-gray-700">
              自動保存ができない端末です。
              <br />
              上のQR画像を<strong>長押し</strong>して「写真に追加」「画像を保存」を選んでください。
            </p>
            <button
              type="button"
              onClick={() => setFallback(false)}
              className="mt-3 text-sm font-bold text-[#1d4ed8]"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  );
}
