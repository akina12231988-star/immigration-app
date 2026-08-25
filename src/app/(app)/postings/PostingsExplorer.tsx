"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileSpreadsheet, FileText, ImageIcon, Plus, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { updatePosting } from "@/lib/supabase/queries/postings";
import { formatWage, POSTING_STATUSES, type PostingStatus } from "@/types/recruiting";
import { postingDisplayName } from "@/lib/posting-output";
import { NameSearchBox } from "@/components/ui/NameSearchBox";
import { matchesOrganizationName, organizationSuggestions } from "@/lib/org-search";
import { buildXlsx, downloadBlob } from "@/lib/xlsx-export";
import {
  buildForm30Sheet,
  buildPostingLedgerSheet,
  postingEntriesToForm30,
} from "@/lib/recruit-ledgers";
import { fetchPostingLedger } from "@/lib/supabase/queries/recruit-ledgers";
import {
  extendedValidUntil,
  needsExtensionDecision,
  postingValidUntil,
} from "@/lib/posting-validity";
import { dbErrorMessage } from "@/lib/errors";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";

export function PostingsExplorer({
  postings,
  canEdit,
}: {
  postings: PostingWithStats[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<PostingStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState(postings);
  // 会社名で探す（法人格・全角半角・異体字の違いがあっても探せる）。
  // 入力中は募集中/充足/終了のタブに関わらず、期間内の全体から探す
  const [orgQuery, setOrgQuery] = useState("");
  const query = orgQuery.trim();

  // 期間（求人受付日）で絞った母集団 → 集計に使用
  const inPeriod = useMemo(
    () =>
      rows.filter((p) => {
        if (from && p.received_on < from) return false;
        if (to && p.received_on > to) return false;
        return true;
      }),
    [rows, from, to],
  );

  const stats = useMemo(() => {
    const s = { total: inPeriod.length, 募集中: 0, 充足: 0, 終了: 0 };
    for (const p of inPeriod) s[p.status as PostingStatus] += 1;
    return s;
  }, [inPeriod]);

  // カードに出す会社名（求人票の掲載名 → 所属機関の名称の順）
  const companyOf = (p: PostingWithStats) => postingDisplayName(p, p.organizations?.name);

  // 会社名の検索の候補（期間内の求人に出てくる会社。求人の多い順）
  const companyOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of inPeriod) {
      const name = companyOf(p);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
      .map(([name, count]) => ({ id: name, name, count }));
  }, [inPeriod]);

  // 募集中を上に出す（それぞれの中は受付日の新しい順のまま）
  const filtered = useMemo(() => {
    // 会社名で探しているときは、募集中/充足/終了のタブを気にせず期間内の全体から探す
    const list = query
      ? inPeriod.filter((p) => matchesOrganizationName({ name: companyOf(p) }, query))
      : statusFilter === "all"
        ? inPeriod
        : inPeriod.filter((p) => p.status === statusFilter);
    return [...list].sort(
      (a, b) => (a.status === "募集中" ? 0 : 1) - (b.status === "募集中" ? 0 : 1),
    );
  }, [inPeriod, statusFilter, query]);

  const today = new Date().toISOString().slice(0, 10);

  // 期限切れ・採用不足の求人の「期限を3か月延長する」
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const extendPosting = async (p: PostingWithStats) => {
    const next = extendedValidUntil(p.received_on, p.valid_until);
    if (!next) return;
    setExtendingId(p.id);
    try {
      await updatePosting(createClient(), p.id, { valid_until: next });
      setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, valid_until: next } : r)));
      router.refresh();
    } catch {
      /* 失敗したら表示は変えない（もう一度押せる） */
    } finally {
      setExtendingId(null);
    }
  };

  // 労働局の監査（訪問指導）用の帳簿出力。
  // 求人管理簿（厚労省様式の項目）と、事前提出する様式30（求人者リスト）
  const [exporting, setExporting] = useState<"ledger" | "form30" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportLedger = async (kind: "ledger" | "form30") => {
    setExporting(kind);
    setExportError(null);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const entries = await fetchPostingLedger(createClient());
      const sheet =
        kind === "ledger"
          ? buildPostingLedgerSheet(entries)
          : buildForm30Sheet(postingEntriesToForm30(entries), today);
      downloadBlob(
        await buildXlsx([sheet]),
        kind === "ledger" ? `求人管理簿_${today}.xlsx` : `様式30_求人者リスト_${today}.xlsx`,
      );
    } catch (err) {
      setExportError(dbErrorMessage(err, "0079_recruit_ledgers.sql", "出力に失敗しました"));
    } finally {
      setExporting(null);
    }
  };

  const changeStatus = async (id: string, status: PostingStatus) => {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      // 充足・終了になったら無効化年月日を記録、募集中へ戻したらクリア
      const patch: { status: PostingStatus; closed_on?: string | null } = { status };
      patch.closed_on = status === "募集中" ? null : new Date().toISOString().slice(0, 10);
      await updatePosting(createClient(), id, patch);
      router.refresh();
    } catch {
      setRows(prev);
    }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <LinkButton href="/postings/new" fullWidth icon={<Plus size={20} />}>
            求人を登録
          </LinkButton>
          <LinkButton href="/postings/flyer" variant="secondary" fullWidth icon={<ImageIcon size={18} />}>
            Facebook掲載画像
          </LinkButton>
        </div>
      )}

      {exportError && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {exportError}
        </p>
      )}
      {/* 労働局の訪問指導（監査）で提出する帳簿。ボタン1つで様式の項目どおりに出力する */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void exportLedger("ledger")}
          disabled={exporting !== null}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
        >
          <FileSpreadsheet size={14} />
          {exporting === "ledger" ? "出力中…" : "求人管理簿（Excel）"}
        </button>
        {/* 様式30は入金済みの企業だけを載せるため、選んでからWord・印刷に進む画面へ */}
        <Link
          href="/postings/form30"
          className="flex items-center gap-1.5 rounded-lg border border-brand px-3 py-2 text-xs font-bold text-brand"
        >
          <FileText size={14} />
          様式30 求人者リストを作る（Word・印刷）
        </Link>
        <button
          type="button"
          onClick={() => void exportLedger("form30")}
          disabled={exporting !== null}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
        >
          <FileSpreadsheet size={14} />
          {exporting === "form30" ? "出力中…" : "様式30（Excel）"}
        </button>
        <Link
          href="/postings/audit"
          className="flex items-center gap-1.5 rounded-lg border border-brand px-3 py-2 text-xs font-bold text-brand"
        >
          <FileText size={14} />
          訪問指導の確認書類（規程・手数料表）
        </Link>
        <span className="text-[11px] text-muted">労働局の訪問指導（監査）用</span>
      </div>
      <p className="-mt-1 mb-3 text-[11px] leading-relaxed text-muted">
        「求人管理簿（Excel）」は全件を出します。訪問指導の当日点検で労働局から指定された
        リストNo.の分だけ出すときは、
        <Link href="/postings/form30" className="font-bold text-brand hover:underline">
          様式30 求人者リストの画面
        </Link>
        の「訪問指導の当日点検」から、その番号の求人管理簿・求職管理簿を出せます。
      </p>

      {/* 期間集計（人材紹介事業の定期報告用） */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">開始日（受付日）</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">終了日</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
          {(from || to) && (
            <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="text-xs font-bold text-brand">
              期間クリア
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <StatBox label="求人数" value={stats.total} />
          <StatBox label="募集中" value={stats.募集中} />
          <StatBox label="充足" value={stats.充足} />
          <StatBox label="終了" value={stats.終了} />
        </div>
      </Card>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Chip label="すべて" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        {POSTING_STATUSES.map((s) => (
          <Chip key={s} label={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
        ))}
      </div>

      {/* 会社名で探す（「BASE株式会社」を「BASE」だけでも、「髙濱」を「高浜」でも探せる） */}
      <NameSearchBox
        candidates={companyOptions}
        value={orgQuery}
        onChange={setOrgQuery}
        suggest={organizationSuggestions}
        placeholder="会社名を入力して検索（「BASE」だけ・「高浜」など常用の字でも探せます）"
        hintOf={(o) => `求人${o.count}件`}
      />

      <p className="text-sm font-bold text-muted">
        {filtered.length}件
        {query && <span className="ml-2 font-medium">「{query}」で検索中（すべての状態から）</span>}
      </p>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          {rows.length === 0
            ? "まだ求人がありません。「求人を登録」から追加してください。"
            : query
              ? `「${query}」に一致する会社の求人はありません。`
              : "条件に合う求人がありません"}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const applicants = p.job_applications?.length ?? 0;
            const hired = p.job_applications?.filter((a) => a.result === "採用").length ?? 0;
            // 採用者・不採用者が誰かを一目で出す（氏名はカードの下に色分けで並べる）
            const nameOf = (a: { workers: { name: string } | null }) =>
              a.workers?.name ?? "氏名未登録";
            const hiredNames = (p.job_applications ?? [])
              .filter((a) => a.result === "採用")
              .map(nameOf);
            const rejectedNames = (p.job_applications ?? [])
              .filter((a) => a.result === "不採用")
              .map(nameOf);
            const validUntil = postingValidUntil(p.received_on, p.valid_until);
            // 期限を過ぎたのに採用が足りない募集中の求人（延長するか締め切るかを決めてもらう）
            const needsDecision = needsExtensionDecision(
              {
                status: p.status,
                received_on: p.received_on,
                valid_until: p.valid_until,
                openings: p.openings,
                hired,
              },
              today,
            );
            return (
              <Card
                key={p.id}
                // 募集中はひと目で分かるよう背景を赤にする（枠線は変えない）
                className={`flex flex-col p-4 ${
                  p.status === "募集中" ? "bg-seal/15" : ""
                }`}
              >
                <Link href={`/postings/${p.id}`} className="min-w-0">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {/* 一覧はFacebook掲載用の名前ではなく所属機関名で見分けられるようにする */}
                      <p className="truncate font-bold">
                        {p.organizations?.name || postingDisplayName(p)}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[p.job_type, p.display_address].filter(Boolean).join(" ・ ") || "詳細未設定"}
                      </p>
                      {/* 求人受付日と有効期限（受付から3か月。帳簿・様式30と同じ日付を一覧で確かめられる） */}
                      {p.received_on && (
                        <p className="text-xs tabular-nums text-muted">
                          受付 {p.received_on}
                          {validUntil && `（期限 ${validUntil}）`}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={16} className="mt-1 shrink-0 text-muted" />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span className="font-bold text-foreground">{formatWage(p.wage_kind, p.wage_amount)}</span>
                    <span className="flex items-center gap-1">
                      <Users size={13} />
                      応募{applicants}・採用{hired}/{p.openings}名
                    </span>
                  </div>
                  {(hiredNames.length > 0 || rejectedNames.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {hiredNames.map((n, i) => (
                        <span
                          key={`hired-${i}`}
                          className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand"
                        >
                          採用 {n}
                        </span>
                      ))}
                      {rejectedNames.map((n, i) => (
                        <span
                          key={`rejected-${i}`}
                          className="rounded-full bg-seal/10 px-2 py-0.5 text-[11px] font-bold text-seal"
                        >
                          不採用 {n}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
                {/* 受付から3か月の期限が切れたのに採用が足りない求人は、延長するか締め切るかを決める */}
                {needsDecision && (
                  <div className="mt-2 rounded-lg bg-seal/10 px-2.5 py-2 text-[11px] leading-relaxed text-seal">
                    <p className="font-bold">
                      有効期限（{validUntil}）を過ぎましたが、採用 {hired}/{p.openings ?? "?"}
                      名です。延長するか、締め切るか決めてください。
                    </p>
                    {canEdit && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={extendingId === p.id}
                          onClick={() => void extendPosting(p)}
                          className="rounded-lg border border-seal/40 bg-surface px-2.5 py-1 font-bold disabled:opacity-50"
                        >
                          {extendingId === p.id
                            ? "延長中…"
                            : `期限を3か月延長する（→ ${extendedValidUntil(p.received_on, p.valid_until)}）`}
                        </button>
                        <span className="text-seal/80">締め切る場合は下の「充足」「終了」を押してください。</span>
                      </div>
                    )}
                  </div>
                )}
                {/* ワンクリック状態変更 */}
                <div className="mt-3 flex gap-1.5 border-t border-border pt-3">
                  {POSTING_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={!canEdit || p.status === s}
                      onClick={() => changeStatus(p.id, s)}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold ${
                        p.status === s
                          ? "bg-brand text-brand-foreground"
                          : "border border-border text-muted hover:bg-background disabled:opacity-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-background p-3 text-center">
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="text-[11px] font-medium text-muted">{label}</p>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
        active ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted"
      }`}
    >
      {label}
    </button>
  );
}
