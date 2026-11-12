"use client";

import { useState } from "react";
import { ChevronDown, Mail } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { CARD_MAIL_TO, CARD_RETURN_TO, mailAddressText, type MailAddress } from "@/lib/card-pickup-guide";

// 在留カードの受け取りの手続き（郵送で受け取る／郵送→窓口へ受け取り方法を変更）の案内。
// 郵送の宛名（郵送先・返信用封筒）は欄ごと・まとめてコピーできる
export function CardPickupGuide() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"mail" | "counter">("mail");
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
