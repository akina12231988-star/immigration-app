import { Building2, Mail, Truck } from "lucide-react";
import { cardReceiptLabel } from "@/lib/online-application";

// 在留カードの受領方法（郵送／窓口。認定申請は認定証明書のメール／郵送）のバッジ。
// 申請準備の詳細（オンライン申請の順 ＞ 受領方法等）で選んだものを、申請一覧の行・カードにも出す。
// 未選択なら何も出さない。郵送から窓口へ変更した申請（changedOn あり）は「窓口（郵送から変更）」と出す
export function ReceiptMethodBadge({
  method: chosen,
  changedOn,
  className = "",
}: {
  method: string | null | undefined;
  changedOn?: string | null; // 郵送から窓口へ変更した日（申請一覧の受け取り待ちのカードで入れる）
  className?: string;
}) {
  const method = changedOn ? "窓口" : chosen;
  const label = cardReceiptLabel(method);
  if (!label) return null;
  const counter = (method ?? "").trim() === "窓口";
  return (
    <span
      title={
        changedOn
          ? `郵送から窓口受け取りに変更しました（${changedOn}）`
          : "在留カードの受領方法（申請準備の詳細 ＞ オンライン申請の順 ＞ 受領方法等 で選びます）"
      }
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        counter ? "bg-status-notice-bg text-status-notice-fg" : "bg-status-applied-bg text-status-applied-fg"
      } ${className}`}
    >
      {counter ? <Building2 size={11} /> : (method ?? "").trim() === "メール" ? <Mail size={11} /> : <Truck size={11} />}
      {label}
      {changedOn && <span className="font-normal">・郵送から変更</span>}
    </span>
  );
}
