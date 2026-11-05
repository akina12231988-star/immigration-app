"use client";

import { useEffect, useState } from "react";
import { formatPostal } from "@/lib/org-address-label";

// 住所 → 郵便番号の検索結果（同じ住所は画面の中で何度も問い合わせない）。
// 値が "" のときは見つからなかった
const cache = new Map<string, Promise<string>>();

function lookupPostal(address: string): Promise<string> {
  const key = address.trim();
  const hit = cache.get(key);
  if (hit) return hit;
  const p = fetch(`/api/postal?address=${encodeURIComponent(key)}`)
    .then((r) => (r.ok ? r.json() : { postal: "" }))
    .then((j: { postal?: string }) => j.postal ?? "")
    .catch(() => "");
  cache.set(key, p);
  // 見つからなかったとき（通信の失敗を含む）は、次に開いたときにもう一度探せるように覚えない
  void p.then((v) => {
    if (!v) cache.delete(key);
  });
  return p;
}

// 住所から探した郵便番号（例: 866-0021。見つからない・探している間は ""）
export function usePostalCode(address: string | null | undefined): string {
  const key = (address ?? "").trim();
  const [found, setFound] = useState<{ key: string; postal: string } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void lookupPostal(key).then((postal) => {
      if (!cancelled) setFound({ key, postal });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return found && found.key === key && found.postal ? formatPostal(found.postal) : "";
}

// 住所の前に出す郵便番号（例: 〒866-0021）。住所から自動で探し、見つからなければ何も出さない。
// 外国人詳細の住居地・住所歴で使う（郵便番号は保存せず、表示のたびに住所から探す）
export function PostalCode({ address, className = "" }: { address: string | null | undefined; className?: string }) {
  const postal = usePostalCode(address);
  if (!postal) return null;
  return (
    <span className={`mr-1.5 tabular-nums ${className}`} title="住所から自動で探した郵便番号">
      〒{postal}
    </span>
  );
}
