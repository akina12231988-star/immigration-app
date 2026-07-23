"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageCircle,
  Search,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AlertBadge } from "@/components/applications/AlertBadge";
import { createClient } from "@/lib/supabase/client";
import { useApplications } from "@/lib/application-store";
import { applicationStatusLabel } from "@/lib/status";
import { STAT_VIEWS, type StatViewKey } from "@/lib/application-stats";
import { isExpiryAlert, todayStr } from "@/lib/application-alerts";
import { listWorkersWithOrg, type WorkerWithOrg } from "@/lib/supabase/queries/workers";
import { listActiveCustodyNoByWorker } from "@/lib/supabase/queries/custody";
import { formatStorageNo } from "@/lib/custody";
import {
  daysUntil,
  isExpiryWithinTwoMonths,
  remainingLabel,
} from "@/lib/worker-alerts";
import {
  buildRenewalPlaceholders,
  isRenewalPlaceholder,
} from "@/lib/renewal-placeholders";
import type { Application } from "@/types/application";
import { ApprovedCard } from "./ApprovedCard";

const TODAY = todayStr();

// 表示件数の選択肢（データが重くならないよう、既定は50件）
const PAGE_SIZES = [10, 50, 100] as const;

// 並び順の選択肢（申請日・申請時点在留期限の昇順/降順）
const SORT_OPTIONS = [
  { key: "date-desc", label: "申請日が遅い順" },
  { key: "date-asc", label: "申請日が早い順" },
  { key: "expiry-asc", label: "在留期限が短い順" },
  { key: "expiry-desc", label: "在留期限が遅い順" },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]["key"];

// フィルタータブ（ダッシュボードの集計と同じ区分＋在留更新の「申請前＜準備中＞」）
type ViewKey = StatViewKey | "all" | "pre-prep";

const VIEW_CHIPS: { key: ViewKey; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "pre-prep", label: "申請前＜準備中＞" },
  { key: "unreported", label: "LINE未報告" },
  { key: "waiting-notice", label: "審査中" },
  { key: "approved", label: "在留カード受け取り待ち" },
  { key: "card-issued", label: "在留カード新規発行済み" },
];

export function ApplicationsExplorer({
  applications,
  initialView = null,
}: {
  applications: Application[];
  initialView?: StatViewKey | null;
}) {
  const router = useRouter();
  const { updateApplication } = useApplications();
  const [keyword, setKeyword] = useState("");
  // タブ＝ダッシュボードと同じ集計区分＋申請前＜準備中＞
  const [view, setView] = useState<ViewKey>(initialView ?? "all");

  // 在留カード新規発行済みタブの「在留許可日」期間検索
  const [permitFrom, setPermitFrom] = useState("");
  const [permitTo, setPermitTo] = useState("");

  // 表示件数・ページ
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState(1);

  // 在留更新で「準備中」の外国人を「申請前＜準備中＞」の擬似行として出すための外国人一覧
  const [renewalWorkers, setRenewalWorkers] = useState<WorkerWithOrg[]>([]);
  useEffect(() => {
    let cancelled = false;
    listWorkersWithOrg(createClient())
      .then((ws) => {
        if (!cancelled) setRenewalWorkers(ws);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // メモ・受取予定日のインライン編集用（記入者名と編集可否）
  const [authorName, setAuthorName] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name, email, role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (cancelled || !p) return;
      const prof = p as { display_name: string; email: string; role: string };
      setAuthorName(prof.display_name || prof.email);
      setCanEdit(prof.role !== "viewer");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const showApprovedDetail = view === "approved";
  const showIssued = view === "card-issued";
  const showPrep = view === "pre-prep";

  // 申請前＜準備中＞タブで TODO番号・Notion・Messenger を表示するための外国人引き当て
  const workersById = useMemo(
    () => new Map(renewalWorkers.map((w) => [w.id, w])),
    [renewalWorkers],
  );
  const workerFor = (a: Application) =>
    a.workerId ? workersById.get(a.workerId) : undefined;

  // 全タブで表示する「預かり番号」（返却済み以外の保管番号）。外国人ごとに引き当てる。
  const [custodyNoByWorker, setCustodyNoByWorker] = useState<Map<string, number>>(
    new Map(),
  );
  useEffect(() => {
    let cancelled = false;
    listActiveCustodyNoByWorker(createClient())
      .then((m) => {
        if (!cancelled) setCustodyNoByWorker(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  // 表示用の預かり番号文字列（未預かり・外国人未紐づけは「—」）
  const custodyNoLabel = (a: Application) => {
    const no = a.workerId ? custodyNoByWorker.get(a.workerId) : undefined;
    return no != null ? formatStorageNo(no) : "—";
  };

  // 並び順（申請日の早い/遅い順・在留期限の短い/遅い順）
  const [sort, setSort] = useState<SortKey>("date-desc");

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const matchesKeyword = (a: Application) =>
      !kw ||
      a.name.toLowerCase().includes(kw) ||
      a.applicationNumber.toLowerCase().includes(kw) ||
      a.applicationContent.toLowerCase().includes(kw) ||
      a.assignee.toLowerCase().includes(kw);

    const rows = applications.filter((a) => {
      if (view === "pre-prep") {
        // 申請前＜準備中＞タブ: 実レコードは「申請前」かつ在留更新が準備中の案件のみ
        if (a.status !== "申請前" || a.workerRenewalStatus !== "準備中") return false;
      } else if (view !== "all" && !STAT_VIEWS[view].test(a)) {
        return false;
      }
      // 新規発行済み: 在留許可日の期間（いつからいつまで）で絞り込む
      if (showIssued) {
        const d = a.grantedPermitDate ?? "";
        if (permitFrom && (!d || d < permitFrom)) return false;
        if (permitTo && (!d || d > permitTo)) return false;
      }
      return matchesKeyword(a);
    });

    // 「すべて」と「申請前＜準備中＞」では、在留更新で準備中の外国人を擬似行として先頭に出す。
    // 申請登録して審査中になると、この擬似行は実レコードの行に置き換わる。
    if (view === "all" || view === "pre-prep") {
      const placeholders = buildRenewalPlaceholders(renewalWorkers, applications, TODAY)
        .filter(matchesKeyword);
      return [...placeholders, ...rows];
    }
    return rows;
  }, [applications, renewalWorkers, keyword, view, showIssued, permitFrom, permitTo]);

  // 並び替え。日付が未設定の行は末尾に回す
  const sorted = useMemo(() => {
    // 既定は取得順のまま（申請日の新しい順・準備中の擬似行が先頭）
    if (sort === "date-desc") return filtered;
    const value = (a: Application) =>
      sort === "date-asc" ? a.applicationDate : (a.residenceExpiryAtApply ?? "");
    const dir = sort === "expiry-desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      return va.localeCompare(vb) * dir;
    });
  }, [filtered, sort]);

  // 絞り込み条件・並び順・表示件数が変わったら1ページ目に戻す（レンダー時に調整）
  const filterKey = `${view}|${keyword}|${permitFrom}|${permitTo}|${pageSize}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  // 擬似行（申請前＜準備中＞）は申請登録へ、実レコードは詳細へ遷移する
  const hrefFor = (a: Application) =>
    isRenewalPlaceholder(a)
      ? `/applications/new?workerId=${a.workerId}`
      : `/applications/${a.id}`;

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  return (
    <div className="space-y-4">
      {view === "this-month" && (
        <div className="flex items-center justify-between rounded-xl bg-brand/10 px-3.5 py-2.5">
          <p className="text-sm font-bold text-brand">
            「{STAT_VIEWS["this-month"].label}」で絞り込み中
          </p>
          <button
            type="button"
            onClick={() => setView("all")}
            aria-label="絞り込みを解除"
            className="flex h-7 w-7 items-center justify-center rounded-full text-brand hover:bg-brand/10"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ⑩検索: 氏名・申請番号・申請内容・担当者を横断検索 */}
      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="氏名・申請番号・申請内容・申請取次士で検索"
          className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-3 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {VIEW_CHIPS.map((c) => (
          <FilterChip
            key={c.key}
            label={c.label}
            active={view === c.key}
            onClick={() => setView(c.key)}
          />
        ))}
      </div>

      {/* 新規発行済み: 在留許可日の期間検索 */}
      {showIssued && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface px-3.5 py-3">
          <p className="w-full text-[11px] font-bold text-muted">在留許可日で期間検索</p>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">いつから</span>
            <input
              type="date"
              value={permitFrom}
              onChange={(e) => setPermitFrom(e.target.value)}
              className="min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>
          <span className="pb-2.5 text-muted">〜</span>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">いつまで</span>
            <input
              type="date"
              value={permitTo}
              onChange={(e) => setPermitTo(e.target.value)}
              className="min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>
          {(permitFrom || permitTo) && (
            <button
              type="button"
              onClick={() => {
                setPermitFrom("");
                setPermitTo("");
              }}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border bg-surface px-3 text-xs font-bold text-muted"
            >
              <X size={14} />
              クリア
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-muted">{filtered.length}件</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            並び順
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm font-bold focus:border-brand focus:outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            表示件数
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm font-bold focus:border-brand focus:outline-none"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}件
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">該当する申請が見つかりません</p>
      ) : showApprovedDetail || showIssued ? (
        /* 受け取り待ち / 新規発行済み: メモ・受取予定日をこの場で編集できるカード */
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {paged.map((a) => (
            <ApprovedCard
              key={a.id}
              app={a}
              today={TODAY}
              variant={showIssued ? "issued" : "waiting"}
              canEdit={canEdit}
              authorName={authorName}
              custodyNoLabel={custodyNoLabel(a)}
              updateApplication={updateApplication}
            />
          ))}
        </div>
      ) : (
        <>
          {/* モバイル: カード表示 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {paged.map((a) => {
              const w = showPrep ? workerFor(a) : undefined;
              const body = (
                <>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="font-bold">{a.name}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      {isExpiryAlert(a, TODAY) && <AlertBadge expiry={a.residenceExpiryAtApply} />}
                      <StatusBadge status={a.status} label={applicationStatusLabel(a)} />
                    </div>
                  </div>
                  <p className="mb-1 text-xs text-muted">{a.organizationName ?? "所属機関未設定"}</p>
                  <p className="mb-1 text-sm text-muted">{a.applicationContent}</p>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>申請番号 {a.applicationNumber || "未登録"}</span>
                    <span>{a.applicationDate || "—"}</span>
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-muted">
                    預かり番号 {custodyNoLabel(a)}
                  </p>
                  {a.residenceExpiryAtApply && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      申請時在留期限 {a.residenceExpiryAtApply}
                      {showPrep && isExpiryWithinTwoMonths(a.residenceExpiryAtApply, TODAY) && (
                        <ApplyRushBadge expiry={a.residenceExpiryAtApply} />
                      )}
                    </p>
                  )}
                </>
              );
              // 申請前＜準備中＞: TODO番号・Notion・Messenger を表示。
              // カード内にリンクを置くため、Link入れ子を避けて onClick 遷移にする
              return showPrep ? (
                <Card
                  key={a.id}
                  onClick={() => router.push(hrefFor(a))}
                  className={`h-full cursor-pointer p-4 hover:border-brand ${
                    isExpiryAlert(a, TODAY) ? "border-seal" : ""
                  }`}
                >
                  {body}
                  <div className="mt-2 border-t border-border pt-2">
                    <p className="text-xs tabular-nums text-muted">
                      申請TODO番号 {w?.residence_renewal_todo || "未登録"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-3">
                      <WorkerLink href={w?.notion_link} icon={<ExternalLink size={13} />}>
                        Notionを開く
                      </WorkerLink>
                      <WorkerLink href={w?.messenger_link} icon={<MessageCircle size={13} />}>
                        Messenger
                      </WorkerLink>
                    </div>
                  </div>
                </Card>
              ) : (
                <Link key={a.id} href={hrefFor(a)}>
                  <Card className={`h-full p-4 ${isExpiryAlert(a, TODAY) ? "border-seal" : ""}`}>
                    {body}
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* PC: テーブル表示 */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border lg:block">
            <table className="w-full text-sm">
              <thead className="bg-background text-left text-xs font-bold text-muted">
                <tr>
                  <Th>名前</Th>
                  <Th>所属機関</Th>
                  {showPrep ? (
                    /* 申請前＜準備中＞: 申請内容・申請日・申請番号はまだ空のため、
                       代わりに在留更新の TODO番号・Notion・Messenger を表示する */
                    <>
                      <Th>申請TODO番号</Th>
                      <Th>Notion</Th>
                      <Th>Messenger</Th>
                    </>
                  ) : (
                    <>
                      <Th>申請内容</Th>
                      <Th>申請日</Th>
                      <Th>申請番号</Th>
                    </>
                  )}
                  <Th>預かり番号</Th>
                  <Th>申請時点在留期限</Th>
                  <Th>状態</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paged.map((a) => {
                  const w = showPrep ? workerFor(a) : undefined;
                  return (
                    <tr
                      key={a.id}
                      onClick={() => router.push(hrefFor(a))}
                      className="cursor-pointer bg-surface hover:bg-background"
                    >
                      <Td className="font-bold">
                        <span className="flex items-center gap-1.5">
                          {a.name}
                          {isExpiryAlert(a, TODAY) && <AlertBadge expiry={a.residenceExpiryAtApply} />}
                        </span>
                      </Td>
                      <Td>{a.organizationName ?? "—"}</Td>
                      {showPrep ? (
                        <>
                          <Td className="tabular-nums">{w?.residence_renewal_todo || "—"}</Td>
                          <Td>
                            <WorkerLink href={w?.notion_link} icon={<ExternalLink size={13} />}>
                              Notionを開く
                            </WorkerLink>
                          </Td>
                          <Td>
                            <WorkerLink href={w?.messenger_link} icon={<MessageCircle size={13} />}>
                              Messenger
                            </WorkerLink>
                          </Td>
                        </>
                      ) : (
                        <>
                          <Td>{a.applicationContent || "—"}</Td>
                          <Td className="tabular-nums">{a.applicationDate || "—"}</Td>
                          <Td className="tabular-nums">{a.applicationNumber || "—"}</Td>
                        </>
                      )}
                      <Td className="tabular-nums">{custodyNoLabel(a)}</Td>
                      <Td className="tabular-nums">
                        {showPrep &&
                        a.residenceExpiryAtApply &&
                        isExpiryWithinTwoMonths(a.residenceExpiryAtApply, TODAY) ? (
                          <span className="flex items-center gap-1.5">
                            {a.residenceExpiryAtApply}
                            <ApplyRushBadge expiry={a.residenceExpiryAtApply} />
                          </span>
                        ) : (
                          a.residenceExpiryAtApply ?? "—"
                        )}
                      </Td>
                      <Td>
                        <StatusBadge status={a.status} label={applicationStatusLabel(a)} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {totalPages > 1 && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          onChange={setPage}
        />
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  // 現在ページ周辺のページ番号を表示（先頭・末尾は常に表示）
  const pages: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 pt-1">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="前のページ"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted disabled:opacity-40"
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-xs text-muted">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-bold ${
              p === page
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border bg-surface text-muted"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="次のページ"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// 申請前＜準備中＞: 在留期限が2ヶ月以内に迫ったら「期限まであと〇ヶ月〇日！早く申請して」
function ApplyRushBadge({ expiry }: { expiry: string }) {
  const d = daysUntil(expiry, TODAY);
  const label =
    d > 0
      ? `期限まで${remainingLabel(expiry, TODAY)}！早く申請して`
      : d === 0
        ? "期限は本日！早く申請して"
        : `期限を${remainingLabel(expiry, TODAY)}！早く申請して`;
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-seal px-2 py-0.5 text-[10px] font-bold text-seal-foreground">
      {label}
    </span>
  );
}

// 外国人のNotion/Messengerリンク。行クリックの遷移を止めて別タブで開く。未登録なら「—」
function WorkerLink({
  href,
  icon,
  children,
}: {
  href?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!href) return <span className="text-muted">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline"
    >
      {icon}
      {children}
    </a>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-4 py-3 ${className}`}>{children}</td>;
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border bg-surface text-muted"
      }`}
    >
      {label}
    </button>
  );
}
