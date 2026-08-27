"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import {
  candidateNote,
  instructeeCandidates,
  instructeeMissingFields,
  instructeeShortage,
  requiredInstructeeCount,
  type InstructeeCandidate,
  type InstructeeCandidateWorker,
  type Ssw2Instructee,
} from "@/lib/ssw2-instructees";
import {
  deleteSsw2Instructee,
  fetchTakenInstructees,
  insertSsw2Instructee,
  listSsw2Instructees,
  updateSsw2Instructee,
} from "@/lib/supabase/queries/ssw2-instructees";

const INPUT =
  "min-h-[34px] w-full rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none disabled:opacity-60";

// 「２号特定技能外国人の業務内容に関する誓約書」（参考様式第１－３２号）の
// 「２ 当該２号特定技能外国人に指導を受ける対象者一覧」。
// 準備の内容が「特定技能2号申請準備中」のときだけ出す。
export function Ssw2Instructees({
  workerId,
  workerName,
  organizationId,
  field,
  canEdit = false,
}: {
  workerId: string;
  workerName: string;
  organizationId: string | null | undefined;
  field: string; // 特定産業分野（必要な対象者数の判定に使う）
  canEdit?: boolean;
}) {
  const [rows, setRows] = useState<Ssw2Instructee[]>([]);
  const [candidates, setCandidates] = useState<InstructeeCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 読み直しの合図。保存・削除のあとに1つ増やして、下の useEffect を走らせる
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      listSsw2Instructees(supabase, workerId),
      fetchTakenInstructees(supabase, workerId),
      supabase
        .from("workers")
        .select(
          "id, name, status, residence_status, residence_card_no, current_organization_id",
        ),
    ])
      .then(([list, taken, res]) => {
        if (cancelled) return;
        setRows(list);
        setCandidates(
          instructeeCandidates(((res.data as InstructeeCandidateWorker[] | null) ?? []), {
            selfWorkerId: workerId,
            organizationId,
            takenBy: taken,
          }),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          dbErrorMessage(err, "0120_ssw2_instructees.sql", "指導対象者の読み込みに失敗しました"),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [workerId, organizationId, reloadKey]);

  const handle = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await run();
      setReloadKey((k) => k + 1);
    } catch (err) {
      // 一意制約（0120）で弾かれたときは、何が起きたかを日本語で伝える
      const code = (err as { code?: string } | null)?.code;
      setError(
        code === "23505"
          ? "この人はすでに、ほかの２号申請者の指導対象者になっています。様式の留意事項4のとおり、同じ人を2か所に書くことはできません。"
          : dbErrorMessage(err, "0120_ssw2_instructees.sql", "保存に失敗しました"),
      );
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    handle(() =>
      insertSsw2Instructee(createClient(), {
        worker_id: workerId,
        target_worker_id: null,
        name: "",
        residence_card_no: "",
        office: "",
        position: "",
        duties: "",
        sort_order: rows.length,
      }),
    );

  // 画面だけ先に変えて、離れたときに保存する（1文字ごとに保存しない）
  const edit = (id: string, patch: Partial<Ssw2Instructee>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const save = (row: Ssw2Instructee) =>
    handle(() =>
      updateSsw2Instructee(createClient(), row.id, {
        target_worker_id: row.target_worker_id,
        name: row.name,
        residence_card_no: row.residence_card_no,
        office: row.office,
        position: row.position,
        duties: row.duties,
      }),
    );

  // 登録のある外国人を選んだら、氏名と在留カード番号を入れる
  const pickWorker = (row: Ssw2Instructee, targetId: string) => {
    const c = candidates.find((x) => x.id === targetId);
    const next = {
      ...row,
      target_worker_id: targetId || null,
      name: c ? c.name : row.name,
      residence_card_no: c ? c.residence_card_no : row.residence_card_no,
    };
    setRows((prev) => prev.map((r) => (r.id === row.id ? next : r)));
    void save(next);
  };

  const remove = (row: Ssw2Instructee) => {
    if (!window.confirm(`「${row.name || "未入力"}」を指導対象者から外します。よろしいですか？`)) return;
    void handle(() => deleteSsw2Instructee(createClient(), row.id));
  };

  const required = requiredInstructeeCount(field);
  const shortage = instructeeShortage(field, rows.length);
  const disabled = !canEdit || busy;

  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
        <UserCheck size={13} className="shrink-0 text-muted" />
        指導を受ける対象者（誓約書 参考様式第１－３２号）
      </p>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        {workerName}さんが指導する相手を選びます。候補に出るのは
        <span className="font-bold">同じ所属機関に在籍している外国人</span>だけです
        （すでに特定技能２号を持っている方は、指導する側なので出ません）。
        日本人従業員や、ほかの所属機関の方は「選ばない」にして氏名を直接入力してください。
        対象者は同じ事業所に出勤し、原則同じ部署でフルタイムで働いている人に限ります。
        <span className="font-bold">
          すでに他の２号申請者の対象者になっている人は選べません
        </span>
        （様式の留意事項4）。登録の無い日本人従業員は、氏名を直接入力してください。
      </p>

      {required > 0 && (
        <p
          className={`mb-2 rounded-lg px-2 py-1 text-[11px] font-bold leading-relaxed ${
            shortage > 0 ? "border border-seal/40 bg-seal/10 text-seal" : "bg-background text-muted"
          }`}
        >
          {field || "この分野"}は<span className="mx-0.5">{required}名以上</span>必要です。
          {shortage > 0 ? `いま${rows.length}名なので、あと${shortage}名足してください。` : `いま${rows.length}名で足りています。`}
        </p>
      )}

      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-2 py-1.5 text-[11px] leading-relaxed text-seal">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const missing = instructeeMissingFields(row);
          return (
            <li key={row.id} className="rounded-lg border border-border p-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-muted">{i + 1}人目</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    disabled={busy}
                    className="flex items-center gap-1 text-[11px] font-bold text-seal disabled:opacity-40"
                  >
                    <Trash2 size={12} />
                    外す
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-0.5 block text-[11px] text-muted">
                    この所属機関の外国人から選ぶ（日本人・ほかの所属機関の方は、下の氏名に直接入力）
                  </span>
                  <select
                    value={row.target_worker_id ?? ""}
                    disabled={disabled}
                    onChange={(e) => pickWorker(row, e.target.value)}
                    className={INPUT}
                  >
                    <option value="">選ばない（氏名を直接入力する）</option>
                    {candidates.map((c) => (
                      <option
                        key={c.id}
                        value={c.id}
                        // 他の2号申請者に押さえられている人は選べないようにする
                        disabled={c.takenBy !== null && c.id !== row.target_worker_id}
                      >
                        {c.name}（{candidateNote(c)}）
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">対象者の氏名</span>
                  <input
                    value={row.name}
                    disabled={disabled || row.target_worker_id !== null}
                    onChange={(e) => edit(row.id, { name: e.target.value })}
                    onBlur={() => save(row)}
                    className={INPUT}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">
                    在留カード番号（外国人のみ）
                  </span>
                  <input
                    value={row.residence_card_no}
                    disabled={disabled}
                    onChange={(e) => edit(row.id, { residence_card_no: e.target.value })}
                    onBlur={() => save(row)}
                    className={INPUT}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">事業所及び所属部署名</span>
                  <input
                    value={row.office}
                    disabled={disabled}
                    onChange={(e) => edit(row.id, { office: e.target.value })}
                    onBlur={() => save(row)}
                    className={INPUT}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">役職又は地位</span>
                  <input
                    value={row.position}
                    disabled={disabled}
                    onChange={(e) => edit(row.id, { position: e.target.value })}
                    onBlur={() => save(row)}
                    className={INPUT}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-0.5 block text-[11px] text-muted">指導を受ける職務内容</span>
                  <input
                    value={row.duties}
                    disabled={disabled}
                    onChange={(e) => edit(row.id, { duties: e.target.value })}
                    onBlur={() => save(row)}
                    className={INPUT}
                  />
                </label>
              </div>
              {missing.length > 0 && (
                <p className="mt-1.5 text-[11px] text-seal">
                  誓約書に書けていない欄: {missing.join("・")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {canEdit && (
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="mt-2 flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted disabled:opacity-40"
        >
          <Plus size={13} />
          対象者を足す
        </button>
      )}
    </div>
  );
}
