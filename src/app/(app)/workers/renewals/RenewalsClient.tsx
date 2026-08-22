"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  SquarePen,
  UserPlus,
  UserRoundPlus,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import {
  fetchWorkerSituationInfo,
  insertWorker,
  updateWorker,
  type WorkerWithOrg,
} from "@/lib/supabase/queries/workers";
import { insertOrganization } from "@/lib/supabase/queries/organizations";
import { upsertPrepTantou } from "@/lib/supabase/queries/application-prep";
import { PREP_TANTOU_OPTIONS } from "@/lib/application-prep";
import { blankWorkerInput } from "@/lib/worker-defaults";
import { nameCounts } from "@/lib/worker-label";
import { isResidenceRenewalTarget } from "@/lib/worker-alerts";
import { offListReason } from "@/lib/renewal-search";
import { matchesWorkerName } from "@/lib/worker-search";
import { NameSearchBox } from "@/components/ui/NameSearchBox";
import { TodosClient } from "@/app/(app)/todos/TodosClient";
import { todayStr } from "@/lib/application-alerts";
import { RESIDENCE_RENEWAL_STATUSES, type ResidenceRenewalStatus } from "@/types/db";
import { PREP_SITUATIONS, mergeSituation } from "@/lib/worker-situation";
import {
  WorkerRenewalCard,
  RENEWAL_STATUS_LABEL as STATUS_LABEL,
} from "@/components/workers/WorkerRenewalCard";

type HandlingFilter = ResidenceRenewalStatus | "all";
type PrepMode = "新規" | "更新";

// 所属機関の選択肢（申請準備で選ぶ・転職の場合は転職先）
export interface OrgOption {
  id: string;
  name: string;
}

const INPUT_CLASS =
  "min-h-[40px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

export function RenewalsClient({
  workers,
  organizations,
  underReviewWorkerIds = [],
  canEdit,
}: {
  workers: WorkerWithOrg[];
  organizations: OrgOption[];
  underReviewWorkerIds?: string[];
  canEdit: boolean;
}) {
  const today = todayStr();
  // この画面で新規登録した所属機関もすぐ選べるようにローカルに持つ
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>(organizations);
  // 新規で申請書類準備 / 更新で申請書類準備 のどちらかから始まる
  const [mode, setMode] = useState<PrepMode | null>(null);
  const [filter, setFilter] = useState<HandlingFilter>("");

  // 在留期限の期間検索（更新モード: 指定すると4か月の枠を超えてその期間の人を表示できる）
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");
  const hasExpiryRange = Boolean(expiryFrom || expiryTo);

  // 氏名で検索（候補から選ぶ・部分一致）。入力中は対応状況のタブに関わらず対象者全体から探す
  const [nameQuery, setNameQuery] = useState("");
  const query = nameQuery.trim();

  const underReview = useMemo(() => new Set(underReviewWorkerIds), [underReviewWorkerIds]);

  const targets = useMemo(() => {
    // 新規モード: 申請準備に手動で追加した人（在留期限は問わない）
    if (mode === "新規") {
      return workers
        .filter(
          (w) =>
            w.application_prep_kind === "新規" &&
            w.status !== "退職" &&
            !underReview.has(w.id),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "ja"));
    }
    // 更新モード
    // 期間指定あり: 在留期限がその期間内の人（4か月より先も含む）。
    // 期間指定なし: 在留期限の4か月前になった人（前もって準備できるよう4か月前から）。
    const inScope = (w: WorkerWithOrg) => {
      if (!hasExpiryRange) return isResidenceRenewalTarget(w, today);
      const d = w.residence_expiry_date;
      if (w.status === "退職" || !d) return false;
      if (expiryFrom && d < expiryFrom) return false;
      if (expiryTo && d > expiryTo) return false;
      return true;
    };
    return workers
      // 退職者・申請の途中（審査中・在留カード受け取り待ち）の人・新規準備で追加した人は対象外
      .filter((w) => w.application_prep_kind !== "新規" && inScope(w) && !underReview.has(w.id))
      .sort((a, b) => (a.residence_expiry_date ?? "").localeCompare(b.residence_expiry_date ?? ""));
  }, [workers, today, underReview, mode, hasExpiryRange, expiryFrom, expiryTo]);

  const countFor = (f: HandlingFilter) =>
    f === "all" ? targets.length : targets.filter((w) => w.residence_renewal_status === f).length;

  const filtered = useMemo(() => {
    // 氏名で検索しているときは、対応状況のタブを気にせず対象者全体から探す
    if (query) return targets.filter((w) => matchesWorkerName(w, query));
    return filter === "all" ? targets : targets.filter((w) => w.residence_renewal_status === filter);
  }, [targets, filter, query]);

  // 探した人が一覧に出てこないとき、その理由（在留期限がまだ先・審査中など）を出す
  const offList = useMemo(() => {
    if (!query) return [];
    const shown = new Set(filtered.map((w) => w.id));
    return workers
      .filter((w) => !shown.has(w.id) && matchesWorkerName(w, query))
      .map((w) => ({
        worker: w,
        reason:
          offListReason(w, {
            today,
            underReview: underReview.has(w.id),
            mode: mode ?? "更新",
          }) ??
          (hasExpiryRange
            ? "指定した在留期限の期間の外です。期間をクリアすると表示されます。"
            : null),
      }))
      .filter((r) => r.reason)
      .slice(0, 5);
  }, [workers, filtered, query, today, underReview, mode, hasExpiryRange]);

  // 検索の候補に出す人（退職者は除く）
  const searchCandidates = useMemo(() => workers.filter((w) => w.status !== "退職"), [workers]);

  const pendingCount = countFor("");

  // 入口: どちらの準備から始めるかを選ぶ
  if (mode === null) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">どちらの申請書類を準備しますか？</p>
        <button type="button" className="w-full text-left" onClick={() => setMode("新規")}>
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <UserRoundPlus size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">新規で申請書類準備</span>
              <span className="block text-xs text-muted">
                初めて申請する人の書類準備。外国人の情報とTODO番号・対応状況を登録します
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </Card>
        </button>
        <button type="button" className="w-full text-left" onClick={() => setMode("更新")}>
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <CalendarClock size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">更新で申請書類準備</span>
              <span className="block text-xs text-muted">
                在留期限の4か月前になった人の更新準備（前もって準備できます）
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </Card>
        </button>

        {/* 申請準備のTODO（旧TODOページの申請準備と合体。選択の下に一覧が続く） */}
        <div className="pt-3">
          <p className="mb-2 text-sm font-bold">申請準備のTODO</p>
          <TodosClient canEdit={canEdit} fixedKind="申請準備" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => {
          setMode(null);
          setFilter("");
          setNameQuery("");
        }}
        className="flex items-center gap-1 text-xs font-bold text-brand"
      >
        <ArrowLeft size={14} />
        準備の種類を選び直す
      </button>

      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <CalendarClock size={14} className="mt-0.5 shrink-0" />
        {mode === "新規"
          ? "初めて申請する人の書類準備です。外国人を選んで（いなければ氏名で登録して）、NotionのTODO番号と対応状況を登録します。「準備中」の人は申請一覧に「申請前＜準備中＞」として表示され、申請したらそこから申請登録できます。"
          : "在留期限の4か月前になった対象者です。Notionで申請TODOを作成し、そのTODO番号を入力すると「準備中」になります。「準備中」の人は申請一覧に「申請前＜準備中＞」として表示され、申請したらそこから申請登録できます。弊社で準備しない場合は「転職先にて対応中」「他登録支援機関にて対応中」「帰国」を選べます。"}
      </p>

      {mode === "新規" && canEdit && (
        <NewPrepForm
          workers={workers}
          organizations={orgOptions}
          onOrgCreated={(o) =>
            setOrgOptions((prev) =>
              [...prev, o].sort((a, b) => a.name.localeCompare(b.name, "ja")),
            )
          }
        />
      )}

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-seal/40 bg-seal/10 px-3 py-2.5 text-sm font-bold text-seal">
          <AlertTriangle size={17} className="shrink-0" />
          未対応の対象者が{pendingCount}件あります。
        </div>
      )}

      {/* 氏名で検索: 入力すると候補が出て、選ぶとその人だけ表示される */}
      <NameSearchBox
        candidates={searchCandidates}
        value={nameQuery}
        onChange={setNameQuery}
        hintOf={(w) =>
          mode === "更新" && w.residence_expiry_date
            ? `在留期限 ${w.residence_expiry_date}`
            : (w.organizations?.name ?? "")
        }
      />

      <div className="flex flex-wrap gap-2">
        {(["", "準備中", "審査中", "転職先にて対応中", "他登録支援機関にて対応中", "帰国", "all"] as HandlingFilter[]).map((f) => (
          <button
            key={f || "pending"}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-xl border px-3 py-2 text-sm font-bold ${
              filter === f
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border bg-surface text-muted"
            }`}
          >
            {f === "all" ? "すべて" : STATUS_LABEL[f]}（{countFor(f)}）
          </button>
        ))}
      </div>

      {/* 在留期限の期間検索: 見落としがないか期間で確認できる（更新モードのみ） */}
      {mode === "更新" && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface px-3.5 py-3">
          <p className="w-full text-[11px] font-bold text-muted">
            在留期限で期間検索（指定すると4か月より先の人も表示されます）
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">いつから</span>
            <input
              type="date"
              value={expiryFrom}
              onChange={(e) => setExpiryFrom(e.target.value)}
              className="min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>
          <span className="pb-2.5 text-muted">〜</span>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">いつまで</span>
            <input
              type="date"
              value={expiryTo}
              onChange={(e) => setExpiryTo(e.target.value)}
              className="min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>
          {hasExpiryRange && (
            <button
              type="button"
              onClick={() => {
                setExpiryFrom("");
                setExpiryTo("");
              }}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border bg-surface px-3 text-xs font-bold text-muted"
            >
              <X size={14} />
              クリア
            </button>
          )}
        </div>
      )}

      <p className="text-sm font-bold text-muted">
        {query ? `「${query}」の検索結果 ${filtered.length}件` : `${filtered.length}件`}
        {query && (
          <span className="ml-1 text-[11px] font-normal">
            （対応状況のタブに関わらず探しています）
          </span>
        )}
      </p>

      {/* 検索した人が一覧に出てこない場合は、その理由と外国人詳細への導線を出す */}
      {offList.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-surface px-3.5 py-3">
          <p className="text-[11px] font-bold text-muted">一覧に出ていない、名前が一致した方</p>
          {offList.map(({ worker, reason }) => (
            <div key={worker.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 text-xs text-muted">
                <span className="font-bold text-foreground">{worker.name}</span>
                <span className="ml-1">{reason}</span>
              </span>
              <Link
                href={`/workers/${worker.id}`}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-brand"
              >
                外国人詳細
              </Link>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {query
            ? `「${query}」に一致する対象者はいません。`
            : mode === "新規"
              ? "新規の申請準備はまだ登録されていません。上のフォームから追加できます。"
              : "該当者はいません。"}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((w) => (
            <WorkerRenewalCard
              key={w.id}
              worker={w}
              orgName={w.organizations?.name ?? null}
              organizations={orgOptions}
              today={today}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 新規で申請書類準備: 外国人を選んで（いなければ氏名で登録して）
// 所属機関（転職の場合は転職先）・TODO番号・対応状況を登録する
function NewPrepForm({
  workers,
  organizations,
  onOrgCreated,
}: {
  workers: WorkerWithOrg[];
  organizations: OrgOption[];
  onOrgCreated: (org: OrgOption) => void;
}) {
  const router = useRouter();
  const [workerId, setWorkerId] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [todo, setTodo] = useState("");
  const [orgId, setOrgId] = useState("");
  const [status, setStatus] = useState<ResidenceRenewalStatus>("準備中");
  // 準備の内容。保存すると外国人の「只今の状況」に入る
  const [prepSituation, setPrepSituation] = useState("");
  const [tantou, setTantou] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // この画面で氏名登録した人も選択肢に出すため、ローカルにも持つ
  const [extraWorkers, setExtraWorkers] = useState<{ id: string; name: string }[]>([]);
  // 新規登録した人を追加した直後に、詳細（編集）ページへの導線を出すための情報
  const [addedNewWorker, setAddedNewWorker] = useState<{ id: string; name: string } | null>(null);

  // 同姓同名は（所属機関名）付きで区別する
  const options = useMemo(() => {
    const counts = nameCounts([...workers.map((w) => w.name), ...extraWorkers.map((w) => w.name)]);
    return [
      ...workers
        .filter((w) => w.status !== "退職")
        .map((w) => ({
          id: w.id,
          label:
            (counts.get(w.name) ?? 0) > 1
              ? `${w.name}（${w.organizations?.name ?? "所属未設定"}）`
              : w.name,
        })),
      ...extraWorkers.map((w) => ({ id: w.id, label: w.name })),
    ].sort((a, b) => a.label.localeCompare(b.label, "ja"));
  }, [workers, extraWorkers]);

  const selected = options.find((o) => o.id === workerId) ?? null;

  // 外国人を選んだら、その人の所属機関を初期値にする（転職ならここで転職先に選び直す）
  const selectWorker = (id: string) => {
    setWorkerId(id);
    const w = workers.find((x) => x.id === id);
    setOrgId(w?.application_prep_organization_id ?? w?.current_organization_id ?? "");
  };

  // 一覧に無い会社は、名前だけでその場で登録して選択する
  const createOrg = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const org = await insertOrganization(createClient(), {
        name: trimmed,
        industry: "",
        business_category: "",
        address: "",
        contact: "",
        corporate_no: "",
        note: "",
        intake: {},
      });
      onOrgCreated({ id: org.id, name: org.name });
      setOrgId(org.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "所属機関の登録に失敗しました");
    }
  };

  // 一覧にいない人は氏名だけで先に登録して選択状態にする
  async function createByName() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const worker = await insertWorker(createClient(), blankWorkerInput(name));
      setExtraWorkers((prev) => [...prev, { id: worker.id, name: worker.name }]);
      setWorkerId(worker.id);
      setNewName("");
      setNotice(
        `外国人「${name}」を登録しました。国籍・在留カード番号などの詳細は、あとで外国人管理から入力できます。`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "外国人の登録に失敗しました");
    } finally {
      setCreating(false);
    }
  }

  async function save() {
    if (!workerId) return;
    setSaving(true);
    setError(null);
    try {
      // この画面で氏名だけ登録した新規の人か（詳細入力への導線を出すため）
      const newWorker = extraWorkers.find((w) => w.id === workerId) ?? null;
      // 只今の状況に入れる値。支援対象かつ在籍中の「特定技能1号＜支援委託中＞」は外さず併記する
      const situation =
        status === "準備中" && prepSituation
          ? mergeSituation(prepSituation, await fetchWorkerSituationInfo(createClient(), workerId))
          : "";
      await updateWorker(createClient(), workerId, {
        residence_renewal_todo: todo.trim(),
        residence_renewal_status: status,
        application_prep_kind: "新規",
        // 転職の場合の転職先。現在の所属機関は在留カード受領まで変えない
        application_prep_organization_id: orgId || null,
        // 準備の内容を選んでいれば、外国人の「只今の状況」にも入れる
        ...(situation ? { current_situation: situation } : {}),
      });
      // 担当者を選んだ場合は、TODO番号の準備リストに紐づけて保存する
      if (tantou) {
        await upsertPrepTantou(createClient(), workerId, todo.trim(), tantou);
      }
      setNotice(`${selected?.label ?? "対象者"}を新規の申請準備に追加しました。`);
      setAddedNewWorker(newWorker);
      setWorkerId("");
      setOrgId("");
      setTodo("");
      setStatus("準備中");
      setPrepSituation("");
      setTantou("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <p className="flex items-center gap-1.5 text-sm font-bold">
        <UserPlus size={16} className="text-brand" />
        新規の申請準備を追加
      </p>
      {notice && <p className="rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">{notice}</p>}
      {error && <p className="rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}

      {/* 新規登録した人は、続けて詳細情報を入力できるよう編集ページへ誘導する */}
      {addedNewWorker && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/40 bg-brand/5 px-3 py-2.5">
          <span className="text-xs text-muted">
            新規登録した「{addedNewWorker.name}」の詳細情報（国籍・在留カード番号・書類など）を入力できます。
          </span>
          <Link
            href={`/workers/${addedNewWorker.id}#edit`}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground"
          >
            <SquarePen size={13} />
            詳細を入力する
          </Link>
        </div>
      )}

      <div>
        <span className="mb-1.5 block text-[11px] font-bold text-muted">外国人氏名（必須）</span>
        <Combobox
          options={options}
          value={workerId}
          onChange={selectWorker}
          placeholder="氏名を入力して検索"
        />
        {!workerId && (
          <div className="mt-2 rounded-xl border border-dashed border-border p-3">
            <p className="mb-1.5 text-[11px] font-bold text-muted">
              一覧にいない場合は、氏名だけで先に登録できます
            </p>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="氏名を入力"
                className={INPUT_CLASS}
              />
              <Button
                type="button"
                variant="secondary"
                icon={<UserPlus size={17} />}
                onClick={createByName}
                disabled={!newName.trim() || creating}
              >
                {creating ? "登録中…" : "登録"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div>
        <span className="mb-1.5 block text-[11px] font-bold text-muted">
          所属機関（転職の場合は転職先）
        </span>
        <Combobox
          options={organizations.map((o) => ({ id: o.id, label: o.name }))}
          value={orgId}
          onChange={setOrgId}
          onCreate={(name) => void createOrg(name)}
          createLabel="を所属機関として新規登録"
          placeholder="会社名を入力して検索"
        />
        <p className="mt-1 text-[11px] text-muted">
          転職の申請はここで転職先を選びます。申請一覧の「申請前＜準備中＞」にこの会社で表示されます。
          外国人詳細の「現在の所属機関」は、在留カードを受け取るまで変わりません。
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-muted">Notion 申請TODO番号</span>
        <input
          value={todo}
          onChange={(e) => setTodo(e.target.value)}
          placeholder="例: TODO-1234"
          className={INPUT_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-muted">対応状況</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ResidenceRenewalStatus)}
          className={INPUT_CLASS}
        >
          {RESIDENCE_RENEWAL_STATUSES.map((s) => (
            <option key={s || "pending"} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      {/* 準備中のときは、どの準備かを選ぶ。追加すると外国人詳細の「只今の状況」に入る */}
      {status === "準備中" && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">準備の内容（只今の状況）</span>
          <select
            value={prepSituation}
            onChange={(e) => setPrepSituation(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">未選択（只今の状況は変えない）</option>
            {PREP_SITUATIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted">
            追加すると外国人詳細の「只今の状況」に入ります。
          </span>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-muted">担当者（未定でも可・あとから設定できます）</span>
        <select value={tantou} onChange={(e) => setTantou(e.target.value)} className={INPUT_CLASS}>
          <option value="">未定</option>
          {PREP_TANTOU_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <Button fullWidth disabled={!workerId || saving} onClick={save}>
        {saving ? "追加中…" : "申請準備に追加する"}
      </Button>
    </Card>
  );
}
