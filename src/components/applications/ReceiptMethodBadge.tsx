import { Building2, Truck } from "lucide-react";
import { cardReceiptLabel } from "@/lib/online-application";

// 在留カードの受領方法（郵送／窓口）のバッジ。
// 申請準備の詳細（オンライン申請の順 ＞ 受領方法等）で選んだものを、申請一覧の行・カードにも出す。
// 未選択なら何も出さない
export function ReceiptMethodBadge({ method, className = "" }: { method: string | null | undefined; className?: string }) {
  const label = cardReceiptLabel(method);
  if (!label) return null;
  const counter = (method ?? "").trim() === "窓口";
  return (
    <span
      title="在留カードの受領方法（申請準備の詳細 ＞ オンライン申請の順 ＞ 受領方法等 で選びます）"
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        counter ? "bg-status-notice-bg text-status-notice-fg" : "bg-status-applied-bg text-status-applied-fg"
      } ${className}`}
    >
      {counter ? <Building2 size={11} /> : <Truck size={11} />}
      {label}
    </span>
  );
}
