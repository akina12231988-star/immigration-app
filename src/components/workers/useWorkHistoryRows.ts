"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteHistory, insertHistory, updateHistory } from "@/lib/supabase/queries/histories";
import type { VisaType } from "@/types/ssw";

// 履歴書・求職票で職歴を直すための共通のしくみ。
// 画面に出す行は必ず時系列（開始日の古い順）に並べ直す。

export interface WorkHistoryInputRow {
  id: string;
  visa: string;
  start: string; // YYYY-MM-DD
  end: string | null;
  org: string;
  role: string;
}

export interface HistoryRow {
  key: string;
  id: string;
  visa: string;
  start: string;
  end: string;
  org: string;
  role: string;
  // 所属機関の雇用開始日から自動で出している行（work_histories にはまだ無い）
  auto: boolean;
  // この画面で足した行（保存で work_histories に入る）
  added: boolean;
  dirty: boolean;
  removed: boolean;
}

const toRow = (h: WorkHistoryInputRow): HistoryRow => ({
  key: h.id,
  id: h.id,
  visa: h.visa,
  start: h.start,
  end: h.end ?? "",
  org: h.org,
  role: h.role,
  auto: h.id.startsWith("employment-"),
  added: false,
  dirty: false,
  removed: false,
});

// 開始日の古い順。日付がまだ入っていない行は最後に置く（入力の途中で飛ばない）
function sortRows(rows: HistoryRow[]): HistoryRow[] {
  return [...rows].sort((a, b) => {
    if (!a.start && !b.start) return 0;
    if (!a.start) return 1;
    if (!b.start) return -1;
    return a.start.localeCompare(b.start);
  });
}

export function useWorkHistoryRows(
  histories: WorkHistoryInputRow[],
  onChange: () => void,
  defaultVisa: string,
) {
  const [rows, setRows] = useState<HistoryRow[]>(() => sortRows(histories.map(toRow)));

  const setRow = (key: string, patch: Partial<HistoryRow>) => {
    setRows((list) =>
      sortRows(list.map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r))),
    );
    onChange();
  };
  const addRow = () => {
    setRows((list) => [
      ...list,
      {
        key: `new-${list.length}-${list.map((r) => r.key).join("")}`.slice(0, 60),
        id: "",
        visa: defaultVisa,
        start: "",
        end: "",
        org: "",
        role: "",
        auto: false,
        added: true,
        dirty: true,
        removed: false,
      },
    ]);
    onChange();
  };
  const removeRow = (key: string) => {
    setRows((list) =>
      list
        // まだ保存していない行はその場で消す。保存済みの行は保存のときに消す
        .filter((r) => !(r.key === key && r.added))
        .map((r) => (r.key === key ? { ...r, removed: true } : r)),
    );
    onChange();
  };

  // 保存。足した行・自動の行は登録、直した行は更新、消した行は削除する
  const saveRows = async (supabase: SupabaseClient, workerId: string) => {
    for (const r of rows) {
      if (r.removed) {
        if (r.id && !r.auto) await deleteHistory(supabase, r.id);
        continue;
      }
      if (!r.dirty) continue;
      // この画面で出している項目だけを書き戻す。
      // 都道府県・備考・通算の扱いは職歴の画面でしか触らないので、ここでは触らない
      // （空で上書きすると、外国人詳細の職歴から消えてしまう）
      const edited = {
        // 画面の選択肢は VISA_TYPES から出しているので、そのまま在留資格として保存する
        visa: r.visa as VisaType,
        start_date: r.start,
        end_date: r.end || null,
        org_name: r.org,
        role: r.role,
      };
      if (r.auto || r.added) {
        if (!r.start) continue;
        await insertHistory(supabase, {
          worker_id: workerId,
          ...edited,
          prefecture: "",
          note: "",
          kept_residence_status: false,
        });
      } else {
        await updateHistory(supabase, r.id, edited);
      }
    }
  };

  return { rows: rows.filter((r) => !r.removed), setRow, addRow, removeRow, saveRows };
}
