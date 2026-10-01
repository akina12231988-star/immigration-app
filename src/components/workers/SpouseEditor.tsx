"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import {
  SPOUSE_LIVING_OPTIONS,
  isLinkedSpouse,
  spouseSummary,
} from "@/lib/worker-spouse";
import type { WorkerSpouse } from "@/types/db";

// 配偶者の情報の入力・表示（外国人詳細の「家族情報」）。
//
// 日本に住んでいる配偶者がこのシステムに外国人として登録されていれば、その人を選んでリンクする。
// リンクすると氏名・生年月日・在留カード番号はその人の登録を見るので、ここでは持たない
// （二重に持つと、相手の登録を直したときに食い違うため）。
// 登録が無ければ、氏名・生年月日・同居の有無・在留カード番号・勤務先を直接入れる。

const INPUT =
  "min-h-[40px] w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none";
const LABEL = "text-[11px] font-bold text-muted";

// リンク先の外国人（氏名などを出すために読む）
export interface SpouseWorker {
  id: string;
  name: string;
  kana: string;
  birth: string | null;
  residence_card_no: string;
  nationality: string;
}

// このシステムに登録されている外国人（自分は除く）を読む。
// 配偶者を選ぶときと、リンク先の氏名を出すときに使う
function useSpouseCandidates(excludeId: string): SpouseWorker[] {
  const [rows, setRows] = useState<SpouseWorker[]>([]);
  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from("workers")
      .select("id, name, kana, birth, residence_card_no, nationality")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setRows(((data as SpouseWorker[] | null) ?? []).filter((w) => w.id !== excludeId));
      });
    return () => {
      cancelled = true;
    };
  }, [excludeId]);
  return rows;
}

// 見るだけの表示（編集していないとき）
export function SpouseView({ workerId, spouse }: { workerId: string; spouse: WorkerSpouse }) {
  const candidates = useSpouseCandidates(workerId);
  const linked = isLinkedSpouse(spouse)
    ? (candidates.find((w) => w.id === spouse.worker_id) ?? null)
    : null;

  return (
    <div className="rounded-lg bg-background px-3 py-2 text-sm">
      {isLinkedSpouse(spouse) ? (
        <>
          <p className="flex flex-wrap items-center gap-1.5 font-bold">
            <Link
              href={`/workers/${spouse.worker_id}`}
              className="text-brand hover:underline"
            >
              {linked?.name ?? "この システムに登録の配偶者"}
            </Link>
            <ExternalLink size={12} className="text-muted" />
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
              システムに登録あり
            </span>
          </p>
          <p className="text-xs text-muted">
            {spouseSummary({ ...spouse, name: "" }, linked) || "詳細未登録"}
          </p>
        </>
      ) : (
        <>
          <p className="font-bold">{spouse.name || "氏名未登録"}</p>
          <p className="text-xs text-muted">{spouseSummary(spouse) || "詳細未登録"}</p>
        </>
      )}
    </div>
  );
}

export function SpouseEditor({
  workerId,
  spouse,
  onChange,
}: {
  workerId: string;
  spouse: WorkerSpouse;
  onChange: (spouse: WorkerSpouse) => void;
}) {
  const candidates = useSpouseCandidates(workerId);
  const linkedMode = isLinkedSpouse(spouse);
  const linked = linkedMode ? (candidates.find((w) => w.id === spouse.worker_id) ?? null) : null;
  const set = (patch: Partial<WorkerSpouse>) => onChange({ ...spouse, ...patch });

  const living = (
    <label className="flex flex-col gap-1">
      <span className={LABEL}>同居の有無</span>
      <select
        value={spouse.lives_together}
        onChange={(e) => set({ lives_together: e.target.value })}
        className={INPUT}
      >
        <option value="">未選択</option>
        {SPOUSE_LIVING_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-background p-3">
      <p className="text-[11px] font-bold text-muted">配偶者の情報</p>

      {/* 日本に住んでいてこのシステムに登録がある配偶者は、その人を選んでリンクする */}
      <label className="flex flex-col gap-1">
        <span className={LABEL}>
          システムに登録がある外国人から選ぶ（日本に住んでいて登録がある配偶者）
        </span>
        <Combobox
          options={candidates.map((w) => ({
            id: w.id,
            label: `${w.name}${w.kana ? `（${w.kana}）` : ""}`,
          }))}
          value={spouse.worker_id}
          onChange={(id) => set({ worker_id: id })}
          placeholder="氏名で検索して選ぶ（登録が無ければ空のまま）"
        />
        {linkedMode ? (
          <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            氏名・生年月日・在留カード番号は
            <Link href={`/workers/${spouse.worker_id}`} className="font-bold text-brand hover:underline">
              {linked?.name ?? "その外国人"}の詳細
            </Link>
            の登録を見ます（ここでは持ちません）。
            <button
              type="button"
              onClick={() => set({ worker_id: "" })}
              className="rounded-lg border border-border bg-surface px-2 py-0.5 font-bold text-brand"
            >
              リンクをやめて手で入力する
            </button>
          </span>
        ) : (
          <span className="text-[11px] text-muted">
            システムに登録が無い配偶者は、ここは空のままで下の欄に入れてください。
          </span>
        )}
      </label>

      {linkedMode ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {living}
          <label className="flex flex-col gap-1">
            <span className={LABEL}>勤務先</span>
            <input
              value={spouse.workplace}
              onChange={(e) => set({ workplace: e.target.value })}
              placeholder="例: 株式会社◯◯"
              className={INPUT}
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>氏名</span>
            <input
              value={spouse.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="例: NGUYEN THI B"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>生年月日</span>
            <input
              type="date"
              value={spouse.birth}
              onChange={(e) => set({ birth: e.target.value })}
              className={INPUT}
            />
          </label>
          {living}
          <label className="flex flex-col gap-1">
            <span className={LABEL}>在留カード番号</span>
            <input
              value={spouse.residence_card_no}
              onChange={(e) => set({ residence_card_no: e.target.value })}
              placeholder="例: AB12345678CD"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={LABEL}>勤務先</span>
            <input
              value={spouse.workplace}
              onChange={(e) => set({ workplace: e.target.value })}
              placeholder="例: 株式会社◯◯"
              className={INPUT}
            />
          </label>
        </div>
      )}
    </div>
  );
}
