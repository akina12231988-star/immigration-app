"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import {
  listPrepChecklists,
  upsertPrepTantou,
  type PrepChecklistRow,
} from "@/lib/supabase/queries/application-prep";
import { PREP_TANTOU_OPTIONS } from "@/lib/application-prep";
import { PREP_SITUATIONS } from "@/lib/worker-situation";
import { isPrepListTarget } from "@/lib/renewal-placeholders";
import { dbErrorMessage } from "@/lib/errors";
import {
  RESIDENCE_RENEWAL_STATUSES,
  type ResidenceRenewalStatus,
  type Worker,
} from "@/types/db";

export const RENEWAL_STATUS_LABEL: Record<ResidenceRenewalStatus, string> = {
  "": "未対応",
  準備中: "準備中",
  審査中: "審査中",
  転職先にて対応中: "転職先にて対応中",
  他登録支援機関にて対応中: "他登録支援機関にて対応中",
  帰国: "帰国",
};

// 入力に必要な項目だけ（一覧は列を絞って取るため全項目は持たない）
export type RenewalFieldsWorker = Pick<
  Worker,
  | "id"
  | "name"
  | "status"
  | "residence_expiry_date"
  | "residence_renewal_status"
  | "residence_renewal_todo"
  | "notion_link"
  | "messenger_link"
> & {
  current_organization_id?: string | null;
  application_prep_organization_id?: string | null;
  application_prep_kind?: string | null;
  current_situation?: string | null; // 只今の状況（準備の内容の初期値に使う。0093）
};

const INPUT =
  "min-h-[40px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

// 申請準備の入力欄（所属機関・申請TODO番号・対応状況・担当者）。
// 申請準備（在留更新対象）のカードと、外国人詳細の申請準備 書類チェックリストで
// 同じものを使う。どちらから入力しても「準備中」にすれば申請一覧の
// 「申請前＜準備中＞」に出る。
export function WorkerRenewalFields({
  worker,
  organizations,
  canEdit,
  today,
  fixedTodo,
  showTantou = true,
  showLinks = true,
  showPrepKind = false,
  onDraftChange,
  onSaved,
}: {
  worker: RenewalFieldsWorker;
  // 渡すと「所属機関（転職の場合は転職先）」を選べるようになる
  organizations?: { id: string; name: string }[];
  canEdit: boolean;
  today: string;
  // 申請TODO番号を画面側で決めているとき（外国人詳細の準備リスト）はその番号を使う
  fixedTodo?: string;
  // 担当者・リンクの入力欄を別に持っている画面では隠す
  showTantou?: boolean;
  showLinks?: boolean;
  // 「新規で申請書類準備」として扱うかを選べるようにする（外国人詳細用）
  showPrepKind?: boolean;
  // 入力中の値を親（カードの見出しなど）へ伝える
  onDraftChange?: (draft: { status: ResidenceRenewalStatus; prepOrgId: string }) => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [todo, setTodo] = useState(worker.residence_renewal_todo ?? "");
  const [status, setStatus] = useState<ResidenceRenewalStatus>(worker.residence_renewal_status);
  const [notionLink, setNotionLink] = useState(worker.notion_link ?? "");
  const [messengerLink, setMessengerLink] = useState(worker.messenger_link ?? "");
  // 申請準備の所属機関（転職の場合の転職先）。未設定なら現在の所属機関を初期値にする
  const [prepOrgId, setPrepOrgId] = useState(
    worker.application_prep_organization_id ?? worker.current_organization_id ?? "",
  );
  const [isNewPrep, setIsNewPrep] = useState(worker.application_prep_kind === "新規");
  // 準備の内容（対応状況が「準備中」のとき）。保存すると外国人の「只今の状況」に入る
  const [prepSituation, setPrepSituation] = useState(() =>
    worker.current_situation && PREP_SITUATIONS.includes(worker.current_situation)
      ? worker.current_situation
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 担当者はTODO番号ごとの準備リスト（application_prep_checklists）に保存されている
  const [prepRows, setPrepRows] = useState<PrepChecklistRow[]>([]);
  const [tantou, setTantou] = useState("");
  useEffect(() => {
    if (!canEdit || !showTantou) return;
    listPrepChecklists(createClient(), worker.id)
      .then((rows) => {
        setPrepRows(rows);
        const t = (fixedTodo ?? worker.residence_renewal_todo ?? "").trim();
        setTantou(rows.find((r) => r.todo_no === t)?.tantou ?? "");
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker.id, canEdit, showTantou, fixedTodo]);

  // 画面側でTODO番号が切り替わったら、その番号を保存対象にする
  const [prevFixed, setPrevFixed] = useState(fixedTodo);
  if (fixedTodo !== prevFixed) {
    setPrevFixed(fixedTodo);
    if (fixedTodo !== undefined) {
      setTodo(fixedTodo);
      setSaved(false);
      if (fixedTodo.trim() && status === "") setStatus("準備中");
    }
  }

  const change = (patch: { status?: ResidenceRenewalStatus; prepOrgId?: string }) => {
    const next = { status, prepOrgId, ...patch };
    if (patch.status !== undefined) setStatus(patch.status);
    if (patch.prepOrgId !== undefined) setPrepOrgId(patch.prepOrgId);
    setSaved(false);
    onDraftChange?.(next);
  };

  const onTodoChange = (v: string) => {
    setTodo(v);
    setSaved(false);
    // 番号を入れたら「準備中」にする（未対応のままだと申請一覧に出ないため）
    if (v.trim() && status === "") change({ status: "準備中" });
    // 担当者はTODO番号に紐づくため、番号を変えたらその番号の担当者に切り替える
    setTantou(prepRows.find((r) => r.todo_no === v.trim())?.tantou ?? "");
  };

  // 保存後に申請一覧の「申請前＜準備中＞」へ出るかどうか（出ないときは理由を案内する）
  const willAppear = isPrepListTarget(
    {
      status: worker.status,
      residence_expiry_date: worker.residence_expiry_date,
      residence_renewal_status: status,
      application_prep_kind: isNewPrep ? "新規" : "",
    },
    today,
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), worker.id, {
        residence_renewal_todo: todo.trim(),
        residence_renewal_status: status,
        ...(showLinks
          ? { notion_link: notionLink.trim(), messenger_link: messengerLink.trim() }
          : {}),
        // 所属機関を選べる画面のときだけ保存する
        ...(organizations ? { application_prep_organization_id: prepOrgId || null } : {}),
        ...(showPrepKind ? { application_prep_kind: isNewPrep ? "新規" : "" } : {}),
        // 準備の内容を選んでいれば、外国人の「只今の状況」にも入れる
        ...(status === "準備中" && prepSituation ? { current_situation: prepSituation } : {}),
      });
      // 担当者はTODO番号の準備リストへ保存（選択済み、またはリストが既にある場合のみ）
      const todoNo = todo.trim();
      if (showTantou && (tantou || prepRows.some((r) => r.todo_no === todoNo))) {
        await upsertPrepTantou(createClient(), worker.id, todoNo, tantou);
        setPrepRows((rows) =>
          rows.some((r) => r.todo_no === todoNo)
            ? rows.map((r) => (r.todo_no === todoNo ? { ...r, tantou } : r))
            : rows,
        );
      }
      setSaved(true);
      onSaved?.();
      router.refresh();
    } catch (err) {
      setError(dbErrorMessage(err, "0084_worker_prep_organization.sql", "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit) return null;

  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {organizations && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">所属機関（転職の場合は転職先）</span>
          <select
            value={prepOrgId}
            onChange={(e) => change({ prepOrgId: e.target.value })}
            className={INPUT}
          >
            <option value="">未設定</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted">
            転職はここで転職先を選ぶと、申請一覧の「申請前＜準備中＞」にその会社で表示されます。
            現在の所属機関は在留カードを受け取るまで変わりません。
          </span>
        </label>
      )}
      {fixedTodo === undefined ? (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">Notion 申請TODO番号</span>
          <input
            value={todo}
            onChange={(e) => onTodoChange(e.target.value)}
            placeholder="例: TODO-1234"
            className={INPUT}
          />
        </label>
      ) : (
        <p className="text-[11px] text-muted">
          申請一覧に出す申請TODO番号：
          <span className="font-bold text-brand">{fixedTodo || "（番号未設定）"}</span>
        </p>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-muted">対応状況</span>
        <select
          value={status}
          onChange={(e) => change({ status: e.target.value as ResidenceRenewalStatus })}
          className={INPUT}
        >
          {RESIDENCE_RENEWAL_STATUSES.map((s) => (
            <option key={s || "pending"} value={s}>
              {RENEWAL_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      {/* 準備中のときは、どの準備かを選ぶ。保存すると外国人詳細の「只今の状況」に入る */}
      {status === "準備中" && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">準備の内容（只今の状況）</span>
          <select
            value={prepSituation}
            onChange={(e) => {
              setPrepSituation(e.target.value);
              setSaved(false);
            }}
            className={INPUT}
          >
            <option value="">未選択（只今の状況は変えない）</option>
            {PREP_SITUATIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted">
            保存すると外国人詳細の「只今の状況」に入り、「Notionに登録／更新」でNotionにも反映できます。
          </span>
        </label>
      )}
      {showTantou && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">
            担当者（TODO番号に紐づき・未定でも可）
          </span>
          <select
            value={tantou}
            onChange={(e) => {
              setTantou(e.target.value);
              setSaved(false);
            }}
            className={INPUT}
          >
            <option value="">未定</option>
            {tantou &&
              !PREP_TANTOU_OPTIONS.includes(tantou as (typeof PREP_TANTOU_OPTIONS)[number]) && (
                <option value={tantou}>{tantou}</option>
              )}
            {PREP_TANTOU_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}
      {showPrepKind && (
        <label className="flex items-start gap-2 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={isNewPrep}
            onChange={(e) => {
              setIsNewPrep(e.target.checked);
              setSaved(false);
            }}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            新規で申請書類準備として扱う（在留期限に関係なく申請一覧に出します。
            転職・特定技能への変更などで、まだ在留期限が先の人はこちら）
          </span>
        </label>
      )}
      {/* メッセンジャー未登録なら、この画面で入力して登録できる（登録済みなら上にリンク表示） */}
      {showLinks && !worker.messenger_link && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">Messenger リンク（未登録）</span>
          <input
            type="url"
            value={messengerLink}
            onChange={(e) => {
              setMessengerLink(e.target.value);
              setSaved(false);
            }}
            placeholder="https://m.me/... または https://www.messenger.com/..."
            className={INPUT}
          />
        </label>
      )}
      {/* Notion未登録なら、この画面で入力して登録できる（登録済みなら上にリンク表示） */}
      {showLinks && !worker.notion_link && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">
            Notion 個人ページのリンク（未登録）
          </span>
          <input
            type="url"
            value={notionLink}
            onChange={(e) => {
              setNotionLink(e.target.value);
              setSaved(false);
            }}
            placeholder="https://www.notion.so/... または https://app.notion.com/..."
            className={INPUT}
          />
        </label>
      )}
      {/* 「準備中」にしても申請一覧に出ない条件のときは、その理由をその場で伝える */}
      {status === "準備中" && !willAppear && (
        <p className="rounded-lg bg-status-notice-bg px-2.5 py-1.5 text-[11px] text-status-notice-fg">
          {worker.status === "退職"
            ? "退職の人は申請一覧の「申請前＜準備中＞」には出ません。"
            : "在留期限が4か月より先（または未登録）のため、このままでは申請一覧の「申請前＜準備中＞」に出ません。" +
              (showPrepKind ? "上の「新規で申請書類準備として扱う」を選ぶと出ます。" : "")}
        </p>
      )}
      <Button fullWidth disabled={busy} onClick={save}>
        {busy ? "保存中…" : saved ? "保存しました" : "保存する"}
      </Button>
    </div>
  );
}
