"use client";

import { messengerWebUrl } from "@/lib/messenger-link";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  ExternalLink,
  MessageCircle,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AlertBadge } from "@/components/applications/AlertBadge";
import { ApplicantMeta } from "@/components/applications/ApplicantMeta";
import { ApplicationPrepChecklist } from "@/components/workers/ApplicationPrepChecklist";
import { createClient } from "@/lib/supabase/client";
import { listPrepStatuses, type PrepStatus } from "@/lib/supabase/queries/prep-status";
import { upsertPrepTantou } from "@/lib/supabase/queries/application-prep";
import { PREP_TANTOU_OPTIONS } from "@/lib/application-prep";
import { matchesApplicationTantou, tantouFilterOptions } from "@/lib/application-tantou";
import { listPrepTantou } from "@/lib/supabase/queries/application-prep";
import { notionAppUrl } from "@/lib/notion-link";
import { useApplications } from "@/lib/application-store";
import { applicationStatusLabel } from "@/lib/status";
import { STAT_VIEWS, type StatViewKey } from "@/lib/application-stats";
import { isExpiryAlert, todayStr } from "@/lib/application-alerts";
import {
  listWorkersWithOrg,
  updateWorker,
  type WorkerWithOrg,
} from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { orgStaffLabel } from "@/lib/organization-intake";
import type { Organization } from "@/types/db";
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
import { ExtraRequestBoard } from "./ExtraRequestBoard";
import { listAllExtraRequests } from "@/lib/supabase/queries/extra-requests";
import { countOpenExtraRequests } from "@/lib/extra-request-alerts";
import type { ApplicationExtraRequest } from "@/types/application";

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
type ViewKey = StatViewKey | "all" | "pre-prep" | "extra-request";

// 「申請前＜準備中＞」を最初に表示するため先頭に、「すべて」は一番右に置く
const VIEW_CHIPS: { key: ViewKey; label: string }[] = [
  { key: "pre-prep", label: "申請前＜準備中＞" },
  { key: "unreported", label: "LINE未報告" },
  { key: "waiting-notice", label: "審査中" },
  { key: "extra-request", label: "＜入管＞追加資料" },
  { key: "approved", label: "在留カード受け取り待ち" },
  { key: "card-issued", label: "在留カード新規発行済み" },
  { key: "all", label: "すべて" },
];

export function ApplicationsExplorer({
  applications,
  initialView = null,
}: {
  applications: Application[];
  initialView?: StatViewKey | "pre-prep" | null;
}) {
  const router = useRouter();
  const { updateApplication } = useApplications();
  const [keyword, setKeyword] = useState("");
  // タブ＝ダッシュボードと同じ集計区分＋申請前＜準備中＞。
  // 指定がなければ「申請前＜準備中＞」を最初に表示する
  const [view, setView] = useState<ViewKey>(initialView ?? "pre-prep");

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

  // 所属機関ごとの支援責任者・支援担当者の表示・絞り込み用に機関マスタを取得する
  const [orgs, setOrgs] = useState<Organization[]>([]);
  useEffect(() => {
    let cancelled = false;
    listOrganizations(createClient())
      .then((os) => {
        if (!cancelled) setOrgs(os);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const orgById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  // 申請準備の所属機関（転職先）の名称を引くための対応表
  const orgNameById = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);
  const orgIntakeFor = (a: Application) =>
    a.organizationId ? orgById.get(a.organizationId)?.intake : undefined;

  // 準備の読み直しの合図（担当者の保存に失敗したときなどに増やす）
  const [prepReload, setPrepReload] = useState(0);

  // 各人の申請準備の状況（不足数など）。表示中のページ分だけ読み込む
  const [prepStatuses, setPrepStatuses] = useState<Map<string, PrepStatus>>(new Map());

  // 担当者（申請準備）。絞り込みは表示中のページに関わらず効かせたいので、まとめて持つ
  // （キーは `${worker_id} ${申請TODO番号}`）
  const [prepTantou, setPrepTantou] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    listPrepTantou(createClient())
      .then((map) => {
        if (!cancelled) setPrepTantou(map);
      })
      .catch(() => undefined); // 0083未適用でも一覧は使えるようにする
    return () => {
      cancelled = true;
    };
  }, [prepReload]);

  // その案件の担当者（申請準備）
  const tantouOf = (a: Application) => {
    if (!a.workerId) return "";
    const todoNo = workerFor(a)?.residence_renewal_todo ?? "";
    return prepTantou[`${a.workerId} ${todoNo}`] ?? "";
  };

  // 担当者（申請準備）での絞り込み。一覧の担当者の欄に出ている人で探せるようにする
  const [tantouFilter, setTantouFilter] = useState("");
  const tantouOptions = useMemo(
    () => tantouFilterOptions(PREP_TANTOU_OPTIONS, Object.values(prepTantou)),
    [prepTantou],
  );

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

  // 全タブで表示する国籍（外国人一覧から引き当てる）
  const nationalityOf = (a: Application) => workerFor(a)?.nationality;

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
  // 入管から求められた追加資料（「＜入管＞追加資料」タブ用・全申請ぶん）
  const [extraRequests, setExtraRequests] = useState<ApplicationExtraRequest[]>([]);
  useEffect(() => {
    let cancelled = false;
    listAllExtraRequests(createClient())
      .then((rows) => {
        if (!cancelled) setExtraRequests(rows);
      })
      // 0083 が未適用でもタブ以外は使えるようにする（タブは0件表示になる）
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const openExtraCount = countOpenExtraRequests(extraRequests);

  // 表示用の預かり番号文字列（未預かり・外国人未紐づけは「—」）
  const custodyNoLabel = (a: Application) => {
    const no = a.workerId ? custodyNoByWorker.get(a.workerId) : undefined;
    return no != null ? formatStorageNo(no) : "—";
  };

  // 準備中のインライン編集（所属機関・TODO番号）の保存エラー
  const [workerError, setWorkerError] = useState<string | null>(null);

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
    // 担当者絞り込み: 一覧の担当者の欄（担当者（申請準備））に一致する案件のみ
    const matchesTantou = (a: Application) => matchesApplicationTantou(tantouFilter, tantouOf(a));

    const rows = applications.filter((a) => {
      if (view === "pre-prep") {
        // 申請前＜準備中＞タブ: 実レコードは「申請前」かつ在留更新が準備中の案件のみ
        if (a.status !== "申請前" || a.workerRenewalStatus !== "準備中") return false;
      } else if (view !== "all" && view !== "extra-request" && !STAT_VIEWS[view].test(a)) {
        return false;
      }
      // 新規発行済み: 在留許可日の期間（いつからいつまで）で絞り込む
      if (showIssued) {
        const d = a.grantedPermitDate ?? "";
        if (permitFrom && (!d || d < permitFrom)) return false;
        if (permitTo && (!d || d > permitTo)) return false;
      }
      return matchesKeyword(a) && matchesTantou(a);
    });

    // 「すべて」と「申請前＜準備中＞」では、在留更新で準備中の外国人を擬似行として先頭に出す。
    // 申請登録して審査中になると、この擬似行は実レコードの行に置き換わる。
    if (view === "all" || view === "pre-prep") {
      const placeholders = buildRenewalPlaceholders(
        renewalWorkers,
        applications,
        TODAY,
        orgNameById,
      )
        .filter((a) => matchesKeyword(a) && matchesTantou(a));
      return [...placeholders, ...rows];
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, renewalWorkers, keyword, view, showIssued, permitFrom, permitTo, tantouFilter, prepTantou, orgNameById]);

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
  const filterKey = `${view}|${keyword}|${tantouFilter}|${permitFrom}|${permitTo}|${pageSize}|${sort}`;
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

  // 申請前＜準備中＞: その場で添付するモーダル
  const [prepModal, setPrepModal] = useState<{
    id: string;
    name: string;
    photoPath: string | null;
    healthCheckOn: string | null;
  } | null>(null);

  const prepWorkerIds = useMemo(
    () =>
      showPrep
        ? (paged.map((a) => a.workerId).filter((id): id is string => !!id))
        : [],
    [showPrep, paged],
  );
  const prepIdsKey = prepWorkerIds.join(",");
  useEffect(() => {
    if (!showPrep || prepWorkerIds.length === 0) return;
    let cancelled = false;
    listPrepStatuses(createClient(), prepWorkerIds, TODAY)
      .then((m) => {
        if (!cancelled) setPrepStatuses(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPrep, prepIdsKey, prepReload]);

  const openPrepModal = (a: Application) => {
    if (!a.workerId) return;
    const st = prepStatuses.get(a.workerId);
    setPrepModal({
      id: a.workerId,
      name: a.name,
      photoPath: st?.photoPath ?? null,
      healthCheckOn: st?.healthCheckOn ?? null,
    });
  };

  // 担当者のインライン編集。外国人の申請TODO番号の準備リストに保存する（無ければ作成）
  const changeTantou = async (a: Application, tantou: string) => {
    if (!a.workerId) return;
    const workerId = a.workerId;
    const todoNo = workerFor(a)?.residence_renewal_todo ?? "";
    // 先に画面へ反映し、保存失敗時は再読込で正しい状態に戻す
    setPrepTantou((prev) => ({ ...prev, [`${workerId} ${todoNo}`]: tantou }));
    setPrepStatuses((prev) => {
      const next = new Map(prev);
      const st = next.get(workerId);
      if (st) next.set(workerId, { ...st, tantou });
      return next;
    });
    try {
      await upsertPrepTantou(createClient(), workerId, todoNo, tantou);
    } catch {
      setPrepReload((k) => k + 1);
    }
  };

  // 申請前＜準備中＞の所属機関のインライン編集。
  // 擬似行（まだ申請登録していない人）は外国人の「申請準備の所属機関」（転職先）に、
  // 申請登録済みの行はその申請の所属機関に保存する
  const changeOrg = async (a: Application, orgId: string) => {
    const name = orgId ? (orgNameById.get(orgId) ?? null) : null;
    if (!isRenewalPlaceholder(a)) {
      await updateApplication(a.id, { organizationId: orgId || null, organizationName: name });
      return;
    }
    if (!a.workerId) return;
    const workerId = a.workerId;
    setRenewalWorkers((prev) =>
      prev.map((w) =>
        w.id === workerId ? { ...w, application_prep_organization_id: orgId || null } : w,
      ),
    );
    try {
      await updateWorker(createClient(), workerId, {
        application_prep_organization_id: orgId || null,
      });
    } catch {
      setWorkerError("所属機関の保存に失敗しました。通信状況を確認してもう一度お試しください。");
    }
  };

  // 申請TODO番号のインライン編集（外国人に保存する）
  const changeTodo = async (a: Application, todo: string) => {
    if (!a.workerId) return;
    const workerId = a.workerId;
    const value = todo.trim();
    setRenewalWorkers((prev) =>
      prev.map((w) => (w.id === workerId ? { ...w, residence_renewal_todo: value } : w)),
    );
    try {
      await updateWorker(createClient(), workerId, { residence_renewal_todo: value });
    } catch {
      setWorkerError("申請TODO番号の保存に失敗しました。通信状況を確認してもう一度お試しください。");
    }
  };

  // 現在の所属機関の選択値（準備中の行で使う）
  const orgValueFor = (a: Application) => a.organizationId ?? "";

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
            label={
              c.key === "extra-request" && openExtraCount > 0
                ? `${c.label}（${openExtraCount}）`
                : c.label
            }
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

      {workerError && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {workerError}
        </p>
      )}

      {/* ＜入管＞追加資料: 提出期限のアラート付きで、郵送した日・追跡番号をこの場で入力する */}
      {view === "extra-request" ? (
        <ExtraRequestBoard
          rows={extraRequests}
          applications={applications}
          today={TODAY}
          keyword={keyword}
          canEdit={canEdit}
          onChanged={(row) =>
            setExtraRequests((prev) => prev.map((r) => (r.id === row.id ? row : r)))
          }
        />
      ) : (
        <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-muted">{filtered.length}件</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            担当者
            <select
              value={tantouFilter}
              onChange={(e) => setTantouFilter(e.target.value)}
              className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm font-bold focus:border-brand focus:outline-none"
            >
              <option value="">すべて</option>
              {tantouOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
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
              nationality={nationalityOf(a)}
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
                  <p className="mb-1 text-xs text-muted">
                    {a.organizationName ?? "所属機関未設定"}
                    {orgStaffLabel(orgIntakeFor(a)) && (
                      <span className="ml-2">支援 {orgStaffLabel(orgIntakeFor(a))}</span>
                    )}
                  </p>
                  <p className="mb-1 text-sm text-muted">{a.applicationContent}</p>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>申請番号 {a.applicationNumber || "未登録"}</span>
                    <span>{a.applicationDate || "—"}</span>
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-muted">
                    預かり番号 {custodyNoLabel(a)}
                  </p>
                  <ApplicantMeta
                    app={a}
                    nationality={nationalityOf(a)}
                    showApplicant={!isRenewalPlaceholder(a)}
                    className="mt-1"
                  />
                  {a.residenceExpiryAtApply && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      申請時在留期限 {a.residenceExpiryAtApply}
                      {showPrep && isExpiryWithinTwoMonths(a.residenceExpiryAtApply, TODAY) && (
                        <ApplyRushBadge expiry={a.residenceExpiryAtApply} />
                      )}
                    </p>
                  )}
                  {a.workerId && (
                    <span
                      className="mt-2 inline-block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <WorkerInfoLink workerId={a.workerId} />
                    </span>
                  )}
                </>
              );
              // カード内にリンク（外国人の情報・Notionなど）を置くため、
              // Link入れ子を避けて onClick 遷移にする
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
                    {canEdit ? (
                      <div
                        className="mb-2 space-y-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="block text-[11px] font-bold text-muted">
                          所属機関（転職の場合は転職先）
                        </span>
                        <PrepOrgSelect
                          value={orgValueFor(a)}
                          orgs={orgs}
                          onChange={(v) => void changeOrg(a, v)}
                          fullWidth
                        />
                        <span className="block text-[11px] font-bold text-muted">
                          申請TODO番号
                        </span>
                        <span className="flex items-center gap-1.5">
                          <PrepTodoInput
                            value={w?.residence_renewal_todo ?? ""}
                            onSave={(v) => void changeTodo(a, v)}
                            fullWidth
                          />
                          {w?.residence_renewal_todo && (
                            <CopyTodoButton todo={w.residence_renewal_todo} />
                          )}
                        </span>
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs tabular-nums text-muted">
                        申請TODO番号 {w?.residence_renewal_todo || "未登録"}
                        {w?.residence_renewal_todo && <CopyTodoButton todo={w.residence_renewal_todo} />}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-3">
                      <WorkerLink
                        href={w?.notion_link ? notionAppUrl(w.notion_link) : undefined}
                        icon={<ExternalLink size={13} />}
                      >
                        Notionを開く
                      </WorkerLink>
                      <WorkerLink href={w?.messenger_link ? messengerWebUrl(w.messenger_link) : undefined} icon={<MessageCircle size={13} />}>
                        Messenger
                      </WorkerLink>
                    </div>
                  </div>
                  <div
                    className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PrepStatusBadge status={a.workerId ? prepStatuses.get(a.workerId) : undefined} />
                    {canEdit && a.workerId && (
                      <button
                        type="button"
                        onClick={() => openPrepModal(a)}
                        className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-brand"
                      >
                        <ClipboardList size={13} />
                        準備状況・添付
                      </button>
                    )}
                  </div>
                  {a.workerId && (
                    <div
                      className="mt-2 flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[11px] font-bold text-muted">担当者</span>
                      <TantouSelect
                        value={tantouOf(a)}
                        disabled={!canEdit}
                        onChange={(v) => changeTantou(a, v)}
                      />
                    </div>
                  )}
                </Card>
              ) : (
                <Card
                  key={a.id}
                  onClick={() => router.push(hrefFor(a))}
                  className={`h-full cursor-pointer p-4 hover:border-brand ${
                    isExpiryAlert(a, TODAY) ? "border-seal" : ""
                  }`}
                >
                  {body}
                </Card>
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
                  <Th>支援責任者・支援担当者</Th>
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
                  {showPrep && (
                    <>
                      <Th>担当者</Th>
                      <Th>準備状況</Th>
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
                        <ApplicantMeta
                          app={a}
                          nationality={nationalityOf(a)}
                          showApplicant={!isRenewalPlaceholder(a)}
                          className="mt-1 font-normal"
                        />
                        {a.workerId && (
                          <span
                            className="mt-1 block"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <WorkerInfoLink workerId={a.workerId} />
                          </span>
                        )}
                      </Td>
                      <Td>
                        {showPrep && canEdit ? (
                          <span onClick={(e) => e.stopPropagation()}>
                            <PrepOrgSelect
                              value={orgValueFor(a)}
                              orgs={orgs}
                              onChange={(v) => void changeOrg(a, v)}
                            />
                          </span>
                        ) : (
                          (a.organizationName ?? "—")
                        )}
                      </Td>
                      <Td className="text-xs">{orgStaffLabel(orgIntakeFor(a)) || "—"}</Td>
                      {showPrep ? (
                        <>
                          <Td className="tabular-nums">
                            <span
                              className="flex items-center gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canEdit && a.workerId ? (
                                <PrepTodoInput
                                  value={w?.residence_renewal_todo ?? ""}
                                  onSave={(v) => void changeTodo(a, v)}
                                />
                              ) : (
                                <span className="select-text">
                                  {w?.residence_renewal_todo || "—"}
                                </span>
                              )}
                              {w?.residence_renewal_todo && (
                                <CopyTodoButton todo={w.residence_renewal_todo} />
                              )}
                            </span>
                          </Td>
                          <Td>
                            <WorkerLink
                              href={w?.notion_link ? notionAppUrl(w.notion_link) : undefined}
                              icon={<ExternalLink size={13} />}
                            >
                              Notionを開く
                            </WorkerLink>
                          </Td>
                          <Td>
                            <WorkerLink href={w?.messenger_link ? messengerWebUrl(w.messenger_link) : undefined} icon={<MessageCircle size={13} />}>
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
                      {showPrep && (
                        <>
                          <Td>
                            <span onClick={(e) => e.stopPropagation()}>
                              <TantouSelect
                                value={tantouOf(a)}
                                disabled={!canEdit || !a.workerId}
                                onChange={(v) => changeTantou(a, v)}
                              />
                            </span>
                          </Td>
                          <Td>
                            <span
                              className="flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <PrepStatusBadge status={a.workerId ? prepStatuses.get(a.workerId) : undefined} />
                              {canEdit && a.workerId && (
                                <button
                                  type="button"
                                  onClick={() => openPrepModal(a)}
                                  className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-brand"
                                >
                                  <ClipboardList size={12} />
                                  添付
                                </button>
                              )}
                            </span>
                          </Td>
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
        </>
      )}

      {/* 申請前＜準備中＞: 準備状況の確認とその場での書類添付 */}
      {prepModal && (
        <Modal
          open
          title={`${prepModal.name}｜申請準備`}
          onClose={() => {
            setPrepModal(null);
            setPrepReload((k) => k + 1); // 添付結果を一覧のバッジに反映
          }}
        >
          <ApplicationPrepChecklist
            workerId={prepModal.id}
            canEdit={canEdit}
            photoPath={prepModal.photoPath}
            healthCheckOn={prepModal.healthCheckOn}
          />
        </Modal>
      )}
    </div>
  );
}

// 申請TODO番号のコピー（申請前＜準備中＞）。Notionで検索して開く時に使う
function CopyTodoButton({ todo }: { todo: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(todo);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="TODO番号をコピー"
      className="shrink-0 text-muted hover:text-brand"
    >
      {copied ? <Check size={13} className="text-status-reported-fg" /> : <Copy size={13} />}
    </button>
  );
}

// 所属機関のインライン選択（申請前＜準備中＞）。
// 転職の準備では転職先をここで選ぶ。まだ申請登録していない人は外国人の
// 「申請準備の所属機関」に、申請登録済みならその申請の所属機関に保存される
function PrepOrgSelect({
  value,
  orgs,
  onChange,
  fullWidth = false,
}: {
  value: string;
  orgs: Organization[];
  onChange: (id: string) => void;
  fullWidth?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`min-h-[32px] rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none ${
        fullWidth ? "w-full" : "max-w-[13rem]"
      }`}
    >
      <option value="">未設定</option>
      {/* 一覧に無い機関（削除済みなど）が入っていても選択状態を保てるようにする */}
      {value && !orgs.some((o) => o.id === value) && <option value={value}>登録なし</option>}
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

// 申請TODO番号のインライン入力（申請前＜準備中＞）。入力欄から離れたときに保存する
function PrepTodoInput({
  value,
  onSave,
  fullWidth = false,
}: {
  value: string;
  onSave: (v: string) => void;
  fullWidth?: boolean;
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      onBlur={(e) => {
        if (e.target.value.trim() !== value) onSave(e.target.value);
      }}
      placeholder="例: TODO-1234"
      className={`min-h-[32px] rounded-lg border border-border bg-surface px-2 text-xs tabular-nums focus:border-brand focus:outline-none ${
        fullWidth ? "w-full" : "w-32"
      }`}
    />
  );
}

// 担当者のインライン選択（申請前＜準備中＞）。外国人の申請TODO番号の準備リストに紐づく
function TantouSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-[34px] max-w-[140px] rounded-lg border border-border bg-surface px-1.5 text-xs focus:border-brand focus:outline-none disabled:opacity-60"
    >
      <option value="">未定</option>
      {/* 名簿から外れた保存済みの名前も選択肢として残す */}
      {value && !PREP_TANTOU_OPTIONS.includes(value as (typeof PREP_TANTOU_OPTIONS)[number]) && (
        <option value={value}>{value}</option>
      )}
      {PREP_TANTOU_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

// 申請前＜準備中＞の準備状況バッジ（未設定 / 不足N件 / 準備完了）
function PrepStatusBadge({ status }: { status: PrepStatus | undefined }) {
  if (!status || !status.appTypeSet) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-status-before-bg px-2 py-0.5 text-[11px] font-bold text-status-before-fg">
        未設定
      </span>
    );
  }
  if (status.missing === 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-approved-bg px-2 py-0.5 text-[11px] font-bold text-status-approved-fg">
        <CheckCircle2 size={12} />
        準備完了
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-seal/10 px-2 py-0.5 text-[11px] font-bold text-seal">
      不足 {status.missing}件
    </span>
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

// 外国人の詳細ページ（/workers/[id]）を開くボタン。行クリックの遷移とは別に使う
function WorkerInfoLink({ workerId }: { workerId: string }) {
  return (
    <Link
      href={`/workers/${workerId}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-brand hover:bg-brand/5"
    >
      <UserRound size={12} />
      外国人の情報
    </Link>
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
  // notion:// などアプリで開くリンクは target="_blank" を付けない（空タブが残るのを防ぐ）
  const isWeb = /^https?:/i.test(href);
  return (
    <a
      href={href}
      target={isWeb ? "_blank" : undefined}
      rel={isWeb ? "noopener noreferrer" : undefined}
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
