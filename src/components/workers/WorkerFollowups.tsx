"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Home, ShieldPlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { listWorkerInsuranceCards } from "@/lib/supabase/queries/insurance-cards";
import { dbErrorMessage } from "@/lib/errors";
import {
  kokuhoInsuranceHint,
  type InsuranceHistoryRef,
  type WorkerInsuranceCardRow,
} from "@/lib/insurance-card";
import {
  followupLabels,
  followupsOf,
  INSURANCE_AFTER_OPTIONS,
  INSURANCE_BEFORE_OPTIONS,
  insuranceSwitchOf,
  LOSS_DOC_OPTIONS,
  MOVING_STATUSES,
  movingInsuranceGuide,
  patchFollowups,
  type InsuranceAfter,
  type InsuranceBefore,
  type KokuhoFollowup,
  type LossDoc,
  type MovingFollowup,
  type WorkerFollowups as Followups,
} from "@/lib/worker-followups";
import { PREP_ISSUE_REQUEST_OPTIONS } from "@/lib/application-prep";
import { todayStr } from "@/lib/ssw/calc";

// 依頼先の候補（発行依頼先の名簿＋本人）。自由に打つこともできる
const REQUEST_TO_OPTIONS = ["本人", ...PREP_ISSUE_REQUEST_OPTIONS];

const INPUT =
  "min-h-[36px] w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

// 忘れ防止の宿題。転居手続きと、国保・国民年金の加入（前職が社保のとき）。
// ここに「必要」を付けた人は、メニューの「外国人」の横に件数が出る。
export function WorkerFollowups({
  workerId,
  followups: initial,
  canEdit = false,
  histories = [],
}: {
  workerId: string;
  followups: unknown;
  canEdit?: boolean;
  histories?: InsuranceHistoryRef[]; // 現在の保険証が社保のとき、会社名を出すのに使う
}) {
  const router = useRouter();
  const [value, setValue] = useState<Followups>(() => followupsOf({ followups: initial }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 現在の保険証（保険証の欄の最新）。国保加入が必要そうかの目安を出すのに使う
  const [currentCard, setCurrentCard] = useState<WorkerInsuranceCardRow | null>(null);
  useEffect(() => {
    listWorkerInsuranceCards(createClient(), workerId)
      .then((rows) => setCurrentCard(rows[0] ?? null))
      .catch(() => undefined); // 0129未適用のときは未登録あつかい
  }, [workerId]);
  const insuranceHint = kokuhoInsuranceHint(currentCard, histories);
  const insuranceHintCls =
    insuranceHint.tone === "ok"
      ? "bg-status-approved-bg text-status-approved-fg"
      : insuranceHint.tone === "attention"
        ? "bg-status-notice-bg text-status-notice-fg"
        : "bg-background text-muted";

  // 画面に出ている片方だけを差し替えて保存する（もう片方は消さない）
  const save = async (patch: {
    moving?: Partial<MovingFollowup>;
    kokuho?: Partial<KokuhoFollowup>;
  }) => {
    const next = patchFollowups(value, patch);
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), workerId, { followups: next });
      router.refresh();
    } catch (err) {
      setError(dbErrorMessage(err, "0119_worker_followups.sql", "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  // 文字入力は打つたびに保存すると重いので、画面だけ先に変えて離れたときに保存する
  const edit = (patch: { moving?: Partial<MovingFollowup>; kokuho?: Partial<KokuhoFollowup> }) =>
    setValue(patchFollowups(value, patch));

  const labels = followupLabels({ followups: value });
  const disabled = !canEdit || busy;

  return (
    <section id="followups">
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
          <BellRing size={14} />
          あとでやる手続き（忘れ防止）
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          あとでやる手続きに「必要」を付けると、メニューの「外国人」の横に件数が出ます。
          外国人一覧の「あとでやる手続き」からは、誰の何が残っているかをまとめて見られます。
          終わったら下のとおり印を付けてください。件数から外れます。
        </p>

        {labels.length > 0 && (
          <p className="mb-3 rounded-lg border border-seal/40 bg-seal/10 px-3 py-2 text-xs font-bold leading-relaxed text-seal">
            残っている手続き: {labels.join(" ／ ")}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 転居手続き */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
              <Home size={13} className="shrink-0 text-muted" />
              転居手続きの依頼
            </p>
            <label className="flex items-start gap-2 text-xs font-bold">
              <input
                type="checkbox"
                checked={value.moving.needed}
                disabled={disabled}
                onChange={(e) => save({ moving: { needed: e.target.checked } })}
                className="mt-0.5 size-4 shrink-0"
              />
              転居の必要があり、転居手続きをする
            </label>
            {/* 申請準備の段階（入社前の住まい決めなど）でも使えることを添える */}
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              入社前・申請準備の段階の転居にも使えます。転居がすんだら、上の住所歴（転入日ごと）にも登録してください。
            </p>
            {value.moving.needed && (
              <div className="mt-2.5 space-y-2.5">
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">転居（予定）年月日</span>
                  <input
                    type="date"
                    value={value.moving.planned_on ?? ""}
                    disabled={disabled}
                    onChange={(e) => save({ moving: { planned_on: e.target.value || null } })}
                    className={INPUT}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">依頼の状況</span>
                  <select
                    value={value.moving.status}
                    disabled={disabled}
                    onChange={(e) => {
                      const status = e.target.value as MovingFollowup["status"];
                      // 依頼中にしたら依頼日を今日にしておく（TODO ＞ 依頼中 の一覧で経過日数を出す）
                      save({
                        moving: {
                          status,
                          ...(status === "依頼中" && !value.moving.requested_on
                            ? { requested_on: todayStr() }
                            : {}),
                        },
                      });
                    }}
                    className={INPUT}
                  >
                    {MOVING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                {/* 誰に・いつ依頼したか。TODO ＞ 依頼中 の一覧に出る */}
                <RequestFields
                  to={value.moving.requested_to}
                  on={value.moving.requested_on}
                  disabled={disabled}
                  listId="moving-request-to"
                  onEditTo={(v) => edit({ moving: { requested_to: v } })}
                  onBlurTo={() => save({})}
                  onChangeOn={(v) => save({ moving: { requested_on: v } })}
                />
                {/* 転出証明書と転入先。郵送で送った日と、どこに移るか */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-0.5 block text-[11px] text-muted">転出証明書を郵送で送った日</span>
                    <input
                      type="date"
                      value={value.moving.certificate_sent_on ?? ""}
                      disabled={disabled}
                      onChange={(e) => save({ moving: { certificate_sent_on: e.target.value || null } })}
                      className={INPUT}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[11px] text-muted">転入先の住所</span>
                    <input
                      value={value.moving.new_address}
                      disabled={disabled}
                      onChange={(e) => edit({ moving: { new_address: e.target.value } })}
                      onBlur={() => save({})}
                      placeholder="〒　転入先の住所"
                      className={INPUT}
                    />
                  </label>
                </div>
                {/* 保険証の切り替え。現在の保険証は保険証の欄の最新から目安を出す */}
                <MovingInsuranceFields
                  moving={value.moving}
                  disabled={disabled}
                  currentCardKind={currentCard?.kind ?? ""}
                  onSave={(patch) => save({ moving: patch })}
                />
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">メモ（転居先など）</span>
                  <input
                    value={value.moving.note}
                    disabled={disabled}
                    onChange={(e) => edit({ moving: { note: e.target.value } })}
                    onBlur={() => save({})}
                    className={INPUT}
                  />
                </label>
              </div>
            )}
          </div>

          {/* 国保・国民年金の加入 */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
              <ShieldPlus size={13} className="shrink-0 text-muted" />
              国民健康保険・国民年金の加入
            </p>
            <label className="flex items-start gap-2 text-xs font-bold">
              <input
                type="checkbox"
                checked={value.kokuho.needed}
                disabled={disabled}
                onChange={(e) => save({ kokuho: { needed: e.target.checked } })}
                className="mt-0.5 size-4 shrink-0"
              />
              あとで国保・国民年金の加入が必要
            </label>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              前職が社会保険だと、退職に関わる書類（資格喪失証明書・離職票など）が発行されるまで
              加入手続きができません。書類待ちのあいだも忘れないよう、ここに付けておきます。
            </p>
            {/* 現在の保険証（保険証の欄の最新）から、加入が必要そうかの目安を出す */}
            <p className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${insuranceHintCls}`}>
              {insuranceHint.text}{" "}
              <a href="#insurance-cards" className="font-bold underline underline-offset-2">
                保険証の欄へ
              </a>
            </p>
            {value.kokuho.needed && (
              <div className="mt-2.5 space-y-2.5">
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">
                    退職に関わる書類が発行された年月日（まだなら空のまま）
                  </span>
                  <input
                    type="date"
                    value={value.kokuho.docs_ready_on ?? ""}
                    disabled={disabled}
                    onChange={(e) => save({ kokuho: { docs_ready_on: e.target.value || null } })}
                    className={INPUT}
                  />
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={value.kokuho.kokuho_done}
                      disabled={disabled}
                      onChange={(e) => save({ kokuho: { kokuho_done: e.target.checked } })}
                      className="size-4 shrink-0"
                    />
                    国民健康保険に加入した
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={value.kokuho.nenkin_done}
                      disabled={disabled}
                      onChange={(e) => save({ kokuho: { nenkin_done: e.target.checked } })}
                      className="size-4 shrink-0"
                    />
                    国民年金に加入した
                  </label>
                </div>
                {/* 誰に・いつ加入手続きを依頼したか。入れると TODO ＞ 依頼中 の一覧に出る */}
                <RequestFields
                  to={value.kokuho.requested_to}
                  on={value.kokuho.requested_on}
                  disabled={disabled}
                  listId="kokuho-request-to"
                  onEditTo={(v) => edit({ kokuho: { requested_to: v } })}
                  onBlurTo={() => save({})}
                  onChangeOn={(v) => save({ kokuho: { requested_on: v } })}
                />
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">メモ（前職の会社名など）</span>
                  <input
                    value={value.kokuho.note}
                    disabled={disabled}
                    onChange={(e) => edit({ kokuho: { note: e.target.value } })}
                    onBlur={() => save({})}
                    className={INPUT}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}

// 依頼先（名簿から選ぶか自由に打つ）と依頼日。転居手続き・国保加入の両方で同じ形
function RequestFields({
  to,
  on,
  disabled,
  listId,
  onEditTo,
  onBlurTo,
  onChangeOn,
}: {
  to: string;
  on: string | null;
  disabled: boolean;
  listId: string;
  onEditTo: (v: string) => void;
  onBlurTo: () => void;
  onChangeOn: (v: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="block">
        <span className="mb-0.5 block text-[11px] text-muted">依頼先（誰に依頼したか）</span>
        <input
          list={listId}
          value={to}
          disabled={disabled}
          onChange={(e) => onEditTo(e.target.value)}
          onBlur={onBlurTo}
          placeholder="例: 本人 / NGAさん"
          className={INPUT}
        />
        <datalist id={listId}>
          {REQUEST_TO_OPTIONS.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[11px] text-muted">依頼日</span>
        <input
          type="date"
          value={on ?? ""}
          disabled={disabled}
          onChange={(e) => onChangeOn(e.target.value || null)}
          className={INPUT}
        />
      </label>
      <p className="text-[10px] leading-relaxed text-muted sm:col-span-2">
        依頼先か依頼日を入れると、TODO ＞ 依頼中 の一覧に「誰に・いつ依頼したか」と経過日数が出ます。
      </p>
    </div>
  );
}

// 転居にともなう保険証の切り替え。
// 現在の保険証（国保／社保／その他）と転居後の保険証（変更なし／国保／社保）を選ぶと、
// 社保→国保なら退職に関わる書類（資格喪失確認書・離職票）の発行の確認欄、
// 国保→社保なら「社保に入ったら国保を脱退」の案内とチェック欄を出す
function MovingInsuranceFields({
  moving,
  disabled,
  currentCardKind,
  onSave,
}: {
  moving: MovingFollowup;
  disabled: boolean;
  currentCardKind: string; // 保険証の欄の最新の種類（国保 / 社保 / マイナ保険証 / その他 / ''）
  onSave: (patch: Partial<MovingFollowup>) => void;
}) {
  const sw = insuranceSwitchOf(moving);
  const guide = movingInsuranceGuide(moving);
  // 保険証の欄から分かる現在の種類（未選択のときの目安として出す）
  const cardHint =
    currentCardKind === "国保"
      ? "国民健康保険"
      : currentCardKind === "社保"
        ? "社保"
        : "";
  return (
    <div className="rounded-lg border border-dashed border-border p-2.5">
      <p className="mb-1.5 text-[11px] font-bold text-muted">保険証の切り替え</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">
            現在の保険証
            {!moving.insurance_before && cardHint && (
              <span className="ml-1">（保険証の欄では「{cardHint}」）</span>
            )}
          </span>
          <select
            value={moving.insurance_before}
            disabled={disabled}
            onChange={(e) => onSave({ insurance_before: e.target.value as InsuranceBefore })}
            className={INPUT}
          >
            {INSURANCE_BEFORE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o || "選択してください"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">転居後の保険証</span>
          <select
            value={moving.insurance_after}
            disabled={disabled}
            onChange={(e) => onSave({ insurance_after: e.target.value as InsuranceAfter })}
            className={INPUT}
          >
            {INSURANCE_AFTER_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o || "選択してください"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sw === "shaho-to-kokuho" && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-0.5 block text-[11px] text-muted">
              退職に関わる書類（資格喪失確認書か離職票）は発行されたか
            </span>
            <select
              value={moving.loss_doc}
              disabled={disabled}
              onChange={(e) => onSave({ loss_doc: e.target.value as LossDoc })}
              className={INPUT}
            >
              {LOSS_DOC_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o || "未確認"}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[11px] text-muted">発行された日（分かれば）</span>
            <input
              type="date"
              value={moving.loss_doc_on ?? ""}
              disabled={disabled}
              onChange={(e) => onSave({ loss_doc_on: e.target.value || null })}
              className={INPUT}
            />
          </label>
        </div>
      )}

      {sw === "kokuho-to-shaho" && (
        <div className="mt-2 space-y-1.5">
          <label className="flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={moving.shaho_joined}
              disabled={disabled}
              onChange={(e) => onSave({ shaho_joined: e.target.checked })}
              className="size-4 shrink-0"
            />
            社保の加入手続きが済んだ
          </label>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={moving.kokuho_withdrawn}
              disabled={disabled}
              onChange={(e) => onSave({ kokuho_withdrawn: e.target.checked })}
              className="size-4 shrink-0"
            />
            国民健康保険の脱退手続きをした
          </label>
        </div>
      )}

      {guide && (
        <p
          className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] font-bold leading-relaxed ${
            guide.tone === "ok"
              ? "bg-status-approved-bg text-status-approved-fg"
              : "bg-status-notice-bg text-status-notice-fg"
          }`}
        >
          {guide.text}
        </p>
      )}
    </div>
  );
}
