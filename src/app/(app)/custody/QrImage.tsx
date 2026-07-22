"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Link2 } from "lucide-react";
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

// QRのリンク先URLをコピーするボタン
export function QrLinkCopyButton({ url, className = "" }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };
  return (
    <button type="button" onClick={() => void copy()} className={className}>
      {copied ? <Check size={13} /> : <Link2 size={13} />}
      {copied ? "コピーしました" : "リンクをコピー"}
    </button>
  );
}

// ---- テプラ・プロ用ラベル画像（24mm幅テープ × 50mm） ----
// 左にQR、右に折り返し用の番号2面（互いに逆向き）。区切りは折り線として控えめの破線を印字する。
// 360dpi相当（1mm≒14px）で生成し、テプラのアプリ・PCソフトに画像として取り込んで印刷する。

const TEPRA_MM = 14; // px / mm
const TEPRA_W_MM = 50;
const TEPRA_H_MM = 24;
const TEPRA_QR_SECTION_MM = 24; // QR部の幅
const TEPRA_NUM_SECTION_MM = 13; // 番号部の幅 ×2

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function buildTepraLabel(
  text: string,
  numberLabel: string,
): Promise<{ blob: Blob; dataUrl: string }> {
  const W = TEPRA_W_MM * TEPRA_MM;
  const H = TEPRA_H_MM * TEPRA_MM;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // QR（左端セクションの中央に 20mm 角）
  const qrSize = 20 * TEPRA_MM;
  const qrDataUrl = await QRCode.toDataURL(text, { margin: 0, width: qrSize });
  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, (TEPRA_QR_SECTION_MM * TEPRA_MM - qrSize) / 2, (H - qrSize) / 2, qrSize, qrSize);

  // 折り線（目印用なので細く・短い破線で控えめに）
  const x1 = TEPRA_QR_SECTION_MM * TEPRA_MM;
  const x2 = x1 + TEPRA_NUM_SECTION_MM * TEPRA_MM;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 16]);
  for (const x of [x1, x2]) {
    ctx.beginPath();
    ctx.moveTo(x, 1.5 * TEPRA_MM);
    ctx.lineTo(x, H - 1.5 * TEPRA_MM);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 番号2面（折り返したとき両側から読めるよう互いに逆向きに回転）
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fontSize = (TEPRA_NUM_SECTION_MM - 2.5) * TEPRA_MM;
  ctx.font = `bold ${fontSize}px "Helvetica Neue", Arial, sans-serif`;
  const maxLen = H - 3 * TEPRA_MM;
  while (fontSize > 20 && ctx.measureText(numberLabel).width > maxLen) {
    fontSize -= 4;
    ctx.font = `bold ${fontSize}px "Helvetica Neue", Arial, sans-serif`;
  }
  const centers: Array<[number, number]> = [
    [x1 + (TEPRA_NUM_SECTION_MM * TEPRA_MM) / 2, Math.PI / 2],
    [x2 + (TEPRA_NUM_SECTION_MM * TEPRA_MM) / 2, -Math.PI / 2],
  ];
  for (const [cx, angle] of centers) {
    ctx.save();
    ctx.translate(cx, H / 2);
    ctx.rotate(angle);
    ctx.fillText(numberLabel, 0, 0);
    ctx.restore();
  }

  const dataUrl = canvas.toDataURL("image/png");
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("画像の変換に失敗しました");
  return { blob, dataUrl };
}

// スマホは共有シート、PCはダウンロードで画像を保存する共通処理
async function saveImageBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // キャンセルは正常終了
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// テプラ用ラベル画像を保存するボタン（保存できない端末では長押し保存の案内を表示）
export function TepraSaveButton({
  text,
  numberLabel,
  filename,
  className = "",
  children,
}: {
  text: string;
  numberLabel: string;
  filename: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const { blob, dataUrl } = await buildTepraLabel(text, numberLabel);
      try {
        await saveImageBlob(blob, filename);
      } catch {
        setFallbackUrl(dataUrl);
      }
    } catch {
      /* 生成失敗時は何もしない */
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" disabled={busy} onClick={() => void save()} className={className}>
        {children}
      </button>
      {fallbackUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
          onClick={() => setFallbackUrl("")}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fallbackUrl} alt="テプラ用ラベル" className="mx-auto w-full border border-gray-300" />
            <p className="mt-3 text-xs leading-relaxed text-gray-700">
              自動保存ができない端末です。上の画像を<strong>長押し</strong>して保存してください。
            </p>
            <button
              type="button"
              onClick={() => setFallbackUrl("")}
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
