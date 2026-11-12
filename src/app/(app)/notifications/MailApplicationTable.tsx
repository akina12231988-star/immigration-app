"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { gmailLinkForAccount } from "@/lib/mail-format";
import {
  buildMailTable,
  displayStatus,
  MAIL_TABLE_STATUSES,
  mailTableRowKey,
  mailTableRowKeys,
  type MailTableOverride,
  type MailTableRow,
} from "@/lib/immigration-mail-table";
import {
  listMailsForTable,
  listMailTableOverrides,
  saveMailTableOverride,
} from "@/lib/supabase/queries/mail-notifications";

// 入管メール通知を「申請1件＝1行」の表で見る（スプレッドシート「申請一覧」と同じまとめ方）。
// 表はメールから毎回組み立てるので、新しいメールが届けば開き直す（または「最新にする」）だけで更新される。
// 状態とメモは手で直せる（mail_table_overrides。0222）

const OVERRIDE_MIGRATION = "0222_mail_table_overrides.sql";

function statusClass(s: string): string {
  if (s === "完了") return "bg-status-approved-bg text-status-approved-fg";
  if (s === "入金済・受領待ち") return "bg-brand/10 text-brand";
  if (s === "納付待ち") return "bg-seal/10 text-seal";
  return "bg-status-notice-bg text-status-notice-fg";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type StatusFilter = "進行中" | "すべて" | (typeof MAIL_TABLE_STATUSES)[number];

export function MailApplicationTable({ gmailAccount, canEdit }: { gmailAccount: string; canEdit: boolean }) {
  const [rows, setRows] = useState<MailTableRow[] | null>(null);
  const [overrides, setOverrides] = useState<Map<string, MailTableOverride>>(new Map());
  const [overrideReady, setOverrideReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("進行中");
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const mails = await listMailsForTable(createClient());
      setRows(buildMailTable(mails));
    } catch (err) {
      setError(errorMessage(err, "メールの読み込みに失敗しました"));
    }
    try {
      const list = await listMailTableOverrides(createClient());
      setOverrides(new Map(list.map((o) => [o.key, o])));
      setOverrideReady(true);
    } catch {
      // 0222 が未適用でも表は見られる（状態・メモの手直しだけできない）
      setOverrideReady(false);
    }
    setLoading(false);
  };
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  const overrideOf = (r: MailTableRow): MailTableOverride | null => {
    for (const k of mailTableRowKeys(r)) {
      const o = overrides.get(k);
      if (o) return o;
    }
    return null;
  };

  const save = async (r: MailTableRow, patch: { status?: string; memo?: string }) => {
    const cur = overrideOf(r);
    const key = cur?.key ?? mailTableRowKey(r);
    if (!key) return;
    try {
      const saved = await saveMailTableOverride(createClient(), {
        key,
        status: patch.status ?? cur?.status ?? "",
        memo: patch.memo ?? cur?.memo ?? "",
      });
      setOverrides((prev) => new Map(prev).set(saved.key, saved));
    } catch (err) {
      setError(dbErrorMessage(err, OVERRIDE_MIGRATION, "保存に失敗しました"));
    }
  };

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = query.replace(/[\s　]/g, "").toLowerCase();
    return rows.filter((r) => {
      const st = displayStatus(r, overrideOf(r));
      if (filter === "進行中" && st === "完了") return false;
      if (filter !== "進行中" && filter !== "すべて" && st !== filter) return false;
      if (!q) return true;
      return [r.applicant, r.receipt, r.card, r.prov, r.staff, overrideOf(r)?.memo ?? ""]
        .join(" ")
        .replace(/[\s　]/g, "")
        .toLowerCase()
        .includes(q);
    });
    // overrideOf は overrides に依存する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, overrides, filter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows ?? []) {
      const st = displayStatus(r, overrideOf(r)) || "（不明）";
      c[st] = (c[st] ?? 0) + 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, overrides]);

  if (rows === null) {
    return (
      <Card className="p-6 text-center text-sm text-muted">
        {error ?? (
          <span className="inline-flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            メールを読み込んでいます…
          </span>
        )}
      </Card>
    );
  }

  const th = "whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-bold text-muted";
  const td = "whitespace-nowrap px-2 py-1.5 align-top";
  const filters: StatusFilter[] = ["進行中", ...MAIL_TABLE_STATUSES, "すべて"];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${filter === f ? "bg-brand text-brand-foreground" : "bg-surface text-muted hover:bg-background"}`}
          >
            {f}
            {f !== "進行中" && f !== "すべて" && counts[f] ? <span className="ml-1 tabular-nums">{counts[f]}</span> : null}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="氏名・受付番号・在留カード番号で探す"
          className="min-h-[32px] min-w-[200px] flex-1 rounded-lg border border-border bg-surface px-2.5 text-xs"
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-brand disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          最新にする
        </button>
      </div>
      {error && <p className="rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}
      {!overrideReady && (
        <p className="rounded-lg bg-status-notice-bg px-3 py-2 text-xs text-status-notice-fg">
          状態・メモを手で直すには、マイグレーション {OVERRIDE_MIGRATION} の適用が必要です（表は見られます）。
        </p>
      )}
      <p className="text-[11px] text-muted">
        入管のオンライン申請メール（仮番号・受付番号・審査完了・受領方法変更）と手数料の決済メールを、申請ごとに1行にまとめています。{visible.length}件
      </p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1900px] border-collapse text-xs">
          <thead className="border-b border-border bg-background">
            <tr>
              {["申請人", "状態", "受付番号", "担当", "在留カード番号", "申請種別", "受付日", "仮番号", "審査完了日", "許可内容", "手数料", "支払期限", "入金日", "メモ", "在留期限", "受領方法", "最新メール", "更新日時"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const ov = overrideOf(r);
              const st = displayStatus(r, ov);
              const rowKey = r.latestMailId;
              return (
                <tr key={rowKey} className={`border-b border-border/60 ${r.unread > 0 ? "bg-brand/5" : ""}`}>
                  <td className={`${td} font-bold`}>
                    {r.unread > 0 && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-seal align-middle" title="未読のメールあり" />}
                    {r.applicationId ? (
                      <Link href={`/applications/${r.applicationId}`} className="text-brand hover:underline">
                        {r.applicant || "（氏名なし）"}
                      </Link>
                    ) : (
                      r.applicant || <span className="text-muted">（氏名なし）</span>
                    )}
                  </td>
                  <td className={td}>
                    <select
                      value={st}
                      disabled={!canEdit || !overrideReady}
                      onChange={(e) => void save(r, { status: e.target.value })}
                      className={`rounded-full border-0 px-2 py-0.5 text-[11px] font-bold ${statusClass(st)}`}
                    >
                      {!st && <option value="">—</option>}
                      {MAIL_TABLE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={`${td} tabular-nums`}>
                    {r.receipt}
                    {r.receipt && <CopyButton value={r.receipt} label="受付番号をコピー" size={11} />}
                  </td>
                  <td className={td}>{r.staff}</td>
                  <td className={`${td} tabular-nums`}>
                    {r.card}
                    {r.card && <CopyButton value={r.card} label="在留カード番号をコピー" size={11} />}
                  </td>
                  <td className={`${td} max-w-[180px] truncate`} title={r.appType}>
                    {r.appType}
                  </td>
                  <td className={`${td} tabular-nums`}>{r.acceptDate}</td>
                  <td className={`${td} tabular-nums text-muted`}>{r.prov}</td>
                  <td className={`${td} tabular-nums`}>{r.examDoneDate}</td>
                  <td className={`${td} max-w-[180px] truncate`} title={r.permit}>
                    {r.permit}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{r.fee ? Number(r.fee).toLocaleString("ja-JP") : ""}</td>
                  <td className={`${td} tabular-nums`}>{r.payDue}</td>
                  <td className={`${td} tabular-nums`}>{r.paidDate}</td>
                  <td className={td}>
                    <MemoInput value={ov?.memo ?? ""} disabled={!canEdit || !overrideReady} onSave={(memo) => void save(r, { memo })} />
                  </td>
                  <td className={`${td} tabular-nums`}>{r.expiry}</td>
                  <td className={td}>{r.pickup}</td>
                  <td className={td}>
                    {r.latestLink ? (
                      <a
                        href={gmailLinkForAccount(r.latestLink, gmailAccount)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-brand hover:underline"
                      >
                        <ExternalLink size={12} />
                        Gmailで開く
                      </a>
                    ) : null}
                  </td>
                  <td className={`${td} tabular-nums text-muted`}>{formatDateTime(r.updatedAt)}</td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={18} className="px-3 py-6 text-center text-xs text-muted">
                  該当する申請はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function MemoInput({ value, disabled, onSave }: { value: string; disabled: boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      value={draft ?? value}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onSave(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      placeholder="メモ"
      className="w-[220px] rounded-lg border border-border bg-background px-2 py-1 text-xs"
    />
  );
}
