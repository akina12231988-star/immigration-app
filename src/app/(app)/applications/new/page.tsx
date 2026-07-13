"use client";

import { useState } from "react";
import { Building2, Globe, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
import { ReceiptRegistrationForm } from "./ReceiptRegistrationForm";
import type { ApplicationMethod } from "@/types/application";

// 申請の登録は 窓口（受付票あり）/ オンライン（受付メールのリンクを記録）の2通り
export default function NewApplicationPage() {
  const [method, setMethod] = useState<ApplicationMethod | null>(null);

  return (
    <div className="-mx-4 -mt-4">
      <AppHeader
        title={
          method === null
            ? "申請の登録"
            : method === "窓口"
              ? "窓口申請の登録"
              : "オンライン申請の登録"
        }
        backHref="/applications"
      />
      <div className="px-4 pt-4">
        {method === null ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">申請の方法を選んでください</p>
            <button type="button" className="w-full text-left" onClick={() => setMethod("窓口")}>
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Building2 size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">窓口申請</span>
                  <span className="block text-xs text-muted">
                    入管窓口で受け取った受付票を撮影して登録
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </Card>
            </button>
            <button type="button" className="w-full text-left" onClick={() => setMethod("オンライン")}>
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Globe size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">オンライン申請</span>
                  <span className="block text-xs text-muted">
                    申請受付メールのリンクと内容を登録
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </Card>
            </button>
          </div>
        ) : (
          <ReceiptRegistrationForm method={method} />
        )}
      </div>
    </div>
  );
}
