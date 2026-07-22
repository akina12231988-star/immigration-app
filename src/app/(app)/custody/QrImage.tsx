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

// 高解像度PNGとしてQRを保存
export async function downloadQrPng(text: string, filename: string): Promise<void> {
  const url = await QRCode.toDataURL(text, { margin: 2, width: 512 });
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
