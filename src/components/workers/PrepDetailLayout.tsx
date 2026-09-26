"use client";

import { useState, type ReactNode } from "react";
import { Check, Mail, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { PrepDetailSectionId, PrepRequesteeKind } from "@/lib/prep-detail";

// 申請準備の詳細ページ（案B）の部品。
//  ・PrepSection: 右に並べる章（目次から飛べるよう id を付ける）
//  ・PrepToc: 左の目次（済んだ章は ✓、足りない章は ! と件数）
//  ・PrepApplyConfirmDialog: ステータスを「入管へ申請！！」にしたときの確認

export function PrepSection({
  id,
  title,
  right,
  tone = "normal",
  children,
}: {
  id: PrepDetailSectionId;
  title?: string; // 無いときは見出しを出さない（中の部品に見出しがあるとき）
  right?: ReactNode; // 見出しの右に出すもの（件数・リンクなど）
  tone?: "normal" | "alert"; // alert: 必須でまだのとき赤い枠
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className={`scroll-mt-20 rounded-2xl border bg-surface p-4 ${
        tone === "alert" ? "border-2 border-seal" : "border-border"
      }`}
    >
      {title && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-base font-bold">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export interface PrepTocItem {
  id: PrepDetailSectionId;
  label: string;
  state: "ok" | "ng" | "none"; // ok: 済み / ng: 足りない・未選択 / none: 判定しない
  badge?: string; // 「不足7」「必須」など
}

export function PrepToc({ items, progress }: { items: PrepTocItem[]; progress?: { done: number; total: number } }) {
  return (
    <nav aria-label="申請準備の目次" className="rounded-2xl border border-border bg-surface p-3">
      {progress && progress.total > 0 && (
        <div className="mb-2 border-b border-border px-1 pb-2.5">
          <p className="mb-1 flex justify-between text-[11px]">
            <span className="text-muted">全体の進み</span>
            <span className="font-bold">
              {progress.done} / {progress.total}
            </span>
          </p>
          <div className="h-2 rounded-full bg-background">
            <div
              className="h-2 rounded-full bg-brand"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}
      <ul className="flex flex-col">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              className="flex min-h-[40px] items-center gap-2 rounded-lg px-1.5 text-[13px] hover:bg-background"
            >
              {it.state === "ok" ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-status-approved-fg text-surface">
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : it.state === "ng" ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-seal text-[11px] font-bold text-seal">
                  !
                </span>
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-full border-2 border-border" />
              )}
              <span className="min-w-0 flex-1">{it.label}</span>
              {it.badge && <span className="shrink-0 text-[11px] font-bold text-seal">{it.badge}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ---- 「入管へ申請！！」にしたときの確認 ----

export interface PrepApplyConfirmDoc {
  id: string;
  label: string;
  note: string; // いまのステータスなど（例: 本人に依頼中）
  mailable: boolean; // 申請後に郵送できる書類か（在留カード・パスポート・顔写真は郵送リストに入れない）
}

export function PrepApplyConfirmDialog({
  open,
  missing,
  mailList,
  assenMissing,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  missing: PrepApplyConfirmDoc[]; // まだ揃っていない書類（申請後に郵送のしるしが無いもの）
  mailList: string[]; // いまの「申請後に郵送するリスト」（書類名）
  assenMissing: boolean; // あっせんが未選択（必須なので、この場合は進めない）
  onCancel: () => void;
  onConfirm: (docIds: string[]) => Promise<void>; // チェックした書類を郵送リストに入れてから、ステータスを変える
}) {
  // 開くたびに、足りない書類を全部チェックした状態から始める（開いている間だけ中身を持つ）
  return (
    <Modal
      open={open}
      title={missing.length > 0 ? "まだ揃っていない書類があります" : "あっせんがまだ選ばれていません"}
      onClose={onCancel}
    >
      {open && (
        <ConfirmBody
          missing={missing}
          mailList={mailList}
          assenMissing={assenMissing}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </Modal>
  );
}

function ConfirmBody({
  missing,
  mailList,
  assenMissing,
  onCancel,
  onConfirm,
}: {
  missing: PrepApplyConfirmDoc[];
  mailList: string[];
  assenMissing: boolean;
  onCancel: () => void;
  onConfirm: (docIds: string[]) => Promise<void>;
}) {
  const mailable = missing.filter((m) => m.mailable);
  const notMailable = missing.filter((m) => !m.mailable);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(mailable.map((m) => m.id)));
  const [busy, setBusy] = useState(false);
  const left = mailable.filter((m) => !picked.has(m.id)).length;
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const added = mailable.filter((m) => picked.has(m.id)).map((m) => m.label);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {assenMissing && (
        <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-seal bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          あっせんの「有り／無し」（無しのときは理由）がまだです。必須のため、選んでから「入管へ申請！！」にしてください。
        </p>
      )}
      {missing.length > 0 && (
        <>
          <p className="leading-relaxed">
            <span className="font-bold">
              {missing.slice(0, 3).map((m) => `「${m.label}」`).join("")}
              {missing.length > 3 ? `ほか${missing.length - 3}件` : ""}
            </span>
            の書類がまだのようです。こちらは、入管へ申請後に揃い次第郵送するリストへ追加して大丈夫ですか？
          </p>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-bold text-muted">まだ揃っていない書類（チェックしたものを郵送リストへ追加）</p>
            {notMailable.length > 0 && (
              <p className="rounded-lg border border-seal/40 bg-seal/5 px-3 py-2 text-xs text-seal">
                <span className="font-bold">{notMailable.map((m) => m.label).join("・")}</span>
                は申請後に郵送できません。申請の前に揃えてください。
              </p>
            )}
            {mailable.map((m) => (
              <label
                key={m.id}
                className={`flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 ${
                  picked.has(m.id) ? "border-2 border-brand bg-brand/5" : "border border-border"
                }`}
              >
                <input
                  type="checkbox"
                  checked={picked.has(m.id)}
                  onChange={() => toggle(m.id)}
                  className="h-5 w-5"
                />
                <span className="flex-1 font-bold">{m.label}</span>
                {m.note && <span className="text-[11px] text-muted">{m.note}</span>}
              </label>
            ))}
          </div>
          <div className="rounded-lg bg-status-notice-bg px-3 py-2.5">
            <p className="mb-1 flex items-center gap-1 text-xs font-bold text-status-notice-fg">
              <Mail size={13} />
              申請後に郵送するリスト（いまの内容）
            </p>
            <p className="mb-1.5 text-[11px] text-muted">
              ここに入った書類は、申請一覧の「申請後の郵送・タスク」に出ます。郵送したらそこで消し込みます。
            </p>
            {mailList.length === 0 && added.length === 0 ? (
              <p className="text-xs text-muted">まだありません</p>
            ) : (
              <ul className="flex flex-col gap-0.5 text-xs">
                {mailList.map((l) => (
                  <li key={`now-${l}`} className="flex items-center gap-2">
                    <span className="flex-1">{l}</span>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-muted">登録済み</span>
                  </li>
                ))}
                {added.map((l) => (
                  <li key={`add-${l}`} className="flex items-center gap-2">
                    <span className="flex-1">{l}</span>
                    <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-brand-foreground">ここで追加</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {left > 0 && (
            <p className="text-xs font-bold text-seal">
              チェックしていない書類が {left} 件あります。このまま進むと、その書類は揃っていないまま申請することになります。
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-[44px] rounded-lg border border-border px-4 text-sm font-bold"
        >
          戻って揃える
        </button>
        <button
          type="button"
          disabled={busy || assenMissing}
          onClick={() => {
            setBusy(true);
            void onConfirm([...picked]).finally(() => setBusy(false));
          }}
          className="min-h-[44px] rounded-lg bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-50"
        >
          {busy
            ? "保存中…"
            : missing.length > 0
              ? "郵送リストに追加して「入管へ申請！！」にする"
              : "「入管へ申請！！」にする"}
        </button>
      </div>
    </div>
  );
}

// 依頼先の頭文字の丸（本人＝本、郵送請求＝〒、それ以外は名前の1文字目。人ごとに色を変える）
const AVATAR_COLORS = ["bg-[#6b4fa0]", "bg-[#1e6b7a]", "bg-[#8a3b5c]", "bg-[#3d6b2a]", "bg-[#5a5a8a]"];
export function RequesteeAvatar({ who, kind }: { who: string; kind: PrepRequesteeKind }) {
  const text = kind === "self" ? "本" : kind === "mail" ? "〒" : (who.trim()[0] ?? "?").toUpperCase();
  const color =
    kind === "self"
      ? "bg-brand"
      : kind === "mail"
        ? "bg-status-notice-fg"
        : AVATAR_COLORS[[...who].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span
      aria-hidden
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${color}`}
    >
      {text}
    </span>
  );
}
