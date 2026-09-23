"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { effectivePrefecture, guessPrefecture, PREFECTURE_LIST } from "@/lib/prefectures";
import {
  type MoneyOrder,
  type Municipality,
  type MunicipalityInput,
  type RecipientType,
  type RequestMethod,
} from "@/lib/tax-cert";
import { MoneyOrderFields } from "./MoneyOrderFields";
import { CheckRow, INPUT, LABEL, Pill } from "./ui";

// 郵送請求の画面で共用する部品（受領方法・判定結果の表示・自治体マスタの登録モーダル）

interface MethodState {
  method: RequestMethod;
  setMethod: (v: RequestMethod) => void;
  mailDate: string;
  setMailDate: (v: string) => void;
  recipient: RecipientType;
  setRecipient: (v: RecipientType) => void;
  agent: string;
  setAgent: (v: string) => void;
  title?: string;
  // 郵送請求のときに出す定額小為替の入力（証明書1枚につき1枚）
  orderTitles?: string[];
  orders?: MoneyOrder[];
  setOrders?: (o: MoneyOrder[]) => void;
}

export function MethodToggleSection(p: MethodState) {
  return (
    <div className="mt-4 border-t border-dashed border-border pt-4">
      {p.title && <p className="mb-2 text-sm font-bold text-muted">{p.title}</p>}
      <div className="mb-3 flex flex-wrap gap-2">
        <Pill active={p.method === "window"} onClick={() => p.setMethod("window")}>本人が窓口で取得</Pill>
        <Pill active={p.method === "agent_window"} onClick={() => p.setMethod("agent_window")}>代理人が窓口で取得</Pill>
        <Pill active={p.method === "mail"} onClick={() => p.setMethod("mail")}>郵送請求した</Pill>
      </div>
      {p.method === "agent_window" && (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>代理人の氏名・宛先</span>
          <input value={p.agent} onChange={(e) => p.setAgent(e.target.value)} placeholder="例：山田太郎（行政書士事務所）" className={INPUT} />
        </label>
      )}
      {p.method === "mail" && (
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>郵送請求した日</span>
            <input type="date" value={p.mailDate} onChange={(e) => p.setMailDate(e.target.value)} className={INPUT} />
          </label>
          <div className="flex gap-2">
            <Pill active={p.recipient === "self"} onClick={() => p.setRecipient("self")}>本人宛に届く</Pill>
            <Pill active={p.recipient === "agent"} onClick={() => p.setRecipient("agent")}>代理人宛に届く</Pill>
          </div>
          {p.recipient === "agent" && (
            <label className="flex flex-col gap-1">
              <span className={LABEL}>代理人の氏名・宛先</span>
              <input value={p.agent} onChange={(e) => p.setAgent(e.target.value)} placeholder="例：山田太郎（行政書士事務所）" className={INPUT} />
            </label>
          )}
          {p.orders && p.setOrders && (
            <div className="mt-1">
              <p className="mb-1.5 text-sm font-bold text-muted">同封した定額小為替</p>
              <MoneyOrderFields
                titles={p.orderTitles ?? []}
                orders={p.orders}
                onChange={p.setOrders}
                group="main"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function checkMethodValid(method: RequestMethod, mDate: string, rType: RecipientType, aName: string): boolean {
  return (
    method === "window" ||
    (method === "agent_window" && aName.trim() !== "") ||
    (method === "mail" && mDate !== "" && (rType === "self" || (rType === "agent" && aName.trim() !== "")))
  );
}

export function buildMethodInfo(method: RequestMethod, mDate: string, rType: RecipientType, aName: string) {
  if (method === "mail") {
    return { requestMethod: "mail" as RequestMethod, mailRequestDate: mDate, recipientType: rType, agentName: rType === "agent" ? aName.trim() : "" };
  }
  if (method === "agent_window") {
    return { requestMethod: "agent_window" as RequestMethod, mailRequestDate: "", recipientType: "agent" as RecipientType, agentName: aName.trim() };
  }
  return { requestMethod: "window" as RequestMethod, mailRequestDate: "", recipientType: "self" as RecipientType, agentName: "" };
}


// 判定結果に、請求先の自治体のサイトへのリンクを出す（URLが登録されている自治体だけ）
export function MunicipalitySiteLinks({ municipalities, ids }: { municipalities: Municipality[]; ids: string[] }) {
  const targets = Array.from(new Set(ids.filter(Boolean)))
    .map((id) => municipalities.find((m) => m.id === id))
    .filter((m): m is Municipality => !!m && !!m.website_url);
  if (targets.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {targets.map((m) => (
        <a key={m.id} href={m.website_url} target="_blank" rel="noopener noreferrer" className="font-bold text-brand underline">
          {m.name}のサイトを開く
        </a>
      ))}
    </p>
  );
}

export function ResultStamp({ warn, title, label, notes }: { warn: boolean; title: string; label: string; notes: string[] }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${warn ? "border-status-notice-fg/40 bg-status-notice-bg" : "border-status-reported-fg/30 bg-status-reported-bg"}`}>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-base font-black ${warn ? "border-status-notice-fg text-status-notice-fg" : "border-status-reported-fg text-status-reported-fg"}`}>
        {warn ? "！" : "OK"}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className={`mt-1 text-sm font-bold ${warn ? "text-status-notice-fg" : "text-status-reported-fg"}`}>{label}</p>
        {notes.filter(Boolean).map((n, i) => (
          <p key={i} className="mt-1 text-xs leading-relaxed text-muted">{n}</p>
        ))}
      </div>
    </div>
  );
}

export function DocList({ docs }: { docs: { title: string; meta: string; starred: boolean }[] }) {
  if (docs.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {docs.map((d, i) => (
        <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-foreground">{i + 1}</span>
          <div>
            <p className="font-bold">
              {d.title}
              {d.starred && <span className="text-seal"> ＊表示あり</span>}
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted">{d.meta}</p>
          </div>
        </div>
      ))}
    </div>
  );
}


export function MunicipalityModal({
  initial,
  initialName = "",
  busy,
  onClose,
  onSave,
}: {
  initial: Municipality | null;
  initialName?: string; // 新規登録のときに最初から入れておく自治体名（請求フォームで入力した名前）
  busy: boolean;
  onClose: () => void;
  onSave: (form: MunicipalityInput) => void;
}) {
  const [form, setForm] = useState<MunicipalityInput>(
    initial
      ? { name: initial.name, prefecture: effectivePrefecture(initial), website_url: initial.website_url ?? "", cert_name: initial.cert_name, has_income: initial.has_income, has_tax: initial.has_tax, needs_tax_payment_cert: initial.needs_tax_payment_cert, show_asterisk: initial.show_asterisk, note: initial.note, tenshutsu_self_only: initial.tenshutsu_self_only ?? false, juminhyo_self_only: initial.juminhyo_self_only ?? false }
      : { name: initialName, prefecture: guessPrefecture(initialName), website_url: "", cert_name: "課税証明書", has_income: true, has_tax: true, needs_tax_payment_cert: false, show_asterisk: false, note: "", tenshutsu_self_only: false, juminhyo_self_only: false },
  );
  const set = <K extends keyof MunicipalityInput>(k: K, v: MunicipalityInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  // 自治体名を打つと都道府県を推定して入れる（手で選び直せる）
  const setName = (name: string) =>
    setForm((f) => ({ ...f, name, prefecture: f.prefecture && f.prefecture !== guessPrefecture(f.name) ? f.prefecture : guessPrefecture(name) }));
  const canSave = form.name.trim() !== "" && form.cert_name.trim() !== "";

  return (
    <Modal open title={initial ? "自治体情報を編集" : "自治体を追加"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>自治体名</span>
          <input value={form.name} onChange={(e) => setName(e.target.value)} placeholder="例：熊本市" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>都道府県（地図と一覧のまとまりに使う）</span>
          <select value={form.prefecture} onChange={(e) => set("prefecture", e.target.value)} className={INPUT}>
            <option value="">（未設定）</option>
            {PREFECTURE_LIST.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>自治体のサイト（郵送請求の案内ページなどのURL）</span>
          <input type="url" inputMode="url" value={form.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://www.city.example.lg.jp/..." className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>証明書名称</span>
          <input value={form.cert_name} onChange={(e) => set("cert_name", e.target.value)} placeholder="例：市民税・県民税 課税証明書" className={INPUT} />
        </label>
        <div>
          <CheckRow checked={form.has_income} onChange={(v) => set("has_income", v)} label="所得額の記載がある" />
          <CheckRow checked={form.has_tax} onChange={(v) => set("has_tax", v)} label="課税額の記載がある" />
          <CheckRow checked={form.needs_tax_payment_cert} onChange={(v) => set("needs_tax_payment_cert", v)} label="納税証明書が別途必要" />
          <CheckRow checked={form.show_asterisk} onChange={(v) => set("show_asterisk", v)} label="納期未到来額・未納額を「＊」表示する" />
          <CheckRow checked={form.tenshutsu_self_only} onChange={(v) => set("tenshutsu_self_only", v)} label="転出届は本人申請のみ（代理人申請不可）" />
          <CheckRow checked={form.juminhyo_self_only} onChange={(v) => set("juminhyo_self_only", v)} label="住民票は個人番号なしでも本人申請のみ（代理人申請不可）" />
        </div>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>備考</span>
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="窓口情報、注意事項など" className={`${INPUT} min-h-[56px] py-2`} />
        </label>
        <Button fullWidth disabled={!canSave || busy} onClick={() => onSave({ ...form, name: form.name.trim(), website_url: form.website_url.trim(), cert_name: form.cert_name.trim() })}>
          {busy ? "保存中…" : "保存する"}
        </Button>
      </div>
    </Modal>
  );
}
