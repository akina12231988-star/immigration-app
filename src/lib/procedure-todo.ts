// 住所・保険の手続きのTODO（転出手続き・転入手続き・国民健康保険の加入手続き・国民年金の加入手続き）。
//
// 手続きごとに1件のTODOにして、経過（未着手 → 依頼中 → 完了／キャンセル）・依頼先・依頼日を持つ。
// 転居予定日・転入先の住所・保険証の切り替えなどの詳しい記録は、これまでどおり workers.followups に入れる。
// TODOの経過から followups の「必要」「完了」の印を合わせ、外国人一覧の「あとでやる手続き」や
// TODO ＞ 依頼中 の一覧もこれまでどおり動くようにする（syncFollowupsWithTodos）。

import type { WorkerFollowups } from "@/lib/worker-followups";

export const PROCEDURE_TODO_KIND = "住所・保険の手続き" as const;

export const PROCEDURE_TITLES = {
  moveOut: "転出手続き",
  moveIn: "転入手続き",
  kokuho: "国民健康保険の加入手続き",
  nenkin: "国民年金の加入手続き",
} as const;
export type ProcedureKey = keyof typeof PROCEDURE_TITLES;
export const PROCEDURE_KEYS: ProcedureKey[] = ["moveOut", "moveIn", "kokuho", "nenkin"];
export const PROCEDURE_TITLE_LIST: string[] = PROCEDURE_KEYS.map((k) => PROCEDURE_TITLES[k]);

// 経過（0217 の選択肢と同じ）。依頼中は進行中、キャンセルは完了の扱い
export const PROCEDURE_STATUSES = ["未着手", "依頼中", "完了", "キャンセル"] as const;
export type ProcedureStatus = (typeof PROCEDURE_STATUSES)[number];

export function procedureKeyOfTitle(title: string): ProcedureKey | null {
  const k = PROCEDURE_KEYS.find((key) => PROCEDURE_TITLES[key] === title.trim());
  return k ?? null;
}

export function isProcedureDone(status: string): boolean {
  return status === "完了" || status === "キャンセル";
}

// 画面で扱うTODOの形（todos の行のうち使う列）
export interface ProcedureTodo {
  id: string;
  todo_no: string;
  title: string;
  status: string;
  note: string;
  requested_to: string;
  requested_on: string | null;
  deleted_at: string | null;
  created_at: string;
}

// その人の手続きごとの最新のTODO（削除フォルダのものは除く。新しい順で渡す前提）
export function latestProcedureTodos(todos: ProcedureTodo[]): Partial<Record<ProcedureKey, ProcedureTodo>> {
  const out: Partial<Record<ProcedureKey, ProcedureTodo>> = {};
  const sorted = [...todos].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  for (const t of sorted) {
    if (t.deleted_at) continue;
    const k = procedureKeyOfTitle(t.title);
    if (k && !out[k]) out[k] = t;
  }
  return out;
}

// これまでの外国人詳細のチェック（followups）から、作るべきTODOを決める（まだTODOが無い手続きだけ）。
//  ・転居の必要あり → 転出手続き（転出が完了なら完了で作る）。転出証明書が届いていれば転入手続きも
//  ・国保・国民年金の加入が必要 → 国保・国民年金の加入手続き（済んでいる方は完了で作る）
export interface ProcedureTodoDraft {
  key: ProcedureKey;
  status: ProcedureStatus;
  requested_to: string;
  requested_on: string | null;
}

export function procedureDraftsFromFollowups(
  f: WorkerFollowups,
  existing: Partial<Record<ProcedureKey, unknown>>,
): ProcedureTodoDraft[] {
  const out: ProcedureTodoDraft[] = [];
  const statusOf = (s: string, requested: boolean): ProcedureStatus =>
    s === "完了" ? "完了" : s === "依頼中" || requested ? "依頼中" : "未着手";
  if (f.moving.needed) {
    if (!existing.moveOut) {
      out.push({
        key: "moveOut",
        status: f.moving.certificate_received_on ? "完了" : statusOf(f.moving.status, !!(f.moving.requested_to || f.moving.requested_on)),
        requested_to: f.moving.requested_to,
        requested_on: f.moving.requested_on,
      });
    }
    const moveInStarted =
      !!f.moving.certificate_received_on || f.moving.movein_status !== "未依頼" || !!f.moving.movein_requested_to;
    if (!existing.moveIn && moveInStarted) {
      out.push({
        key: "moveIn",
        status: f.moving.status === "完了" ? "完了" : statusOf(f.moving.movein_status, !!(f.moving.movein_requested_to || f.moving.movein_requested_on)),
        requested_to: f.moving.movein_requested_to,
        requested_on: f.moving.movein_requested_on,
      });
    }
  }
  if (f.kokuho.needed) {
    const requested = !!(f.kokuho.requested_to || f.kokuho.requested_on);
    if (!existing.kokuho) {
      out.push({
        key: "kokuho",
        status: f.kokuho.kokuho_done ? "完了" : requested ? "依頼中" : "未着手",
        requested_to: f.kokuho.requested_to,
        requested_on: f.kokuho.requested_on,
      });
    }
    if (!existing.nenkin) {
      out.push({
        key: "nenkin",
        status: f.kokuho.nenkin_done ? "完了" : requested ? "依頼中" : "未着手",
        requested_to: f.kokuho.requested_to,
        requested_on: f.kokuho.requested_on,
      });
    }
  }
  return out;
}

// TODOの経過・依頼先から followups の印を合わせる（外国人一覧の件数・依頼中の一覧に使われているため）。
// 変わったときだけ新しい値を返す（変わらなければ null）
export function syncFollowupsWithTodos(
  f: WorkerFollowups,
  todos: Partial<Record<ProcedureKey, ProcedureTodo>>,
): WorkerFollowups | null {
  const moving = { ...f.moving };
  const kokuho = { ...f.kokuho };
  const out = todos.moveOut;
  const inn = todos.moveIn;
  if (out || inn) {
    const allDone = (!out || isProcedureDone(out.status)) && (!inn || isProcedureDone(inn.status)) && !!inn;
    const outCanceled = out?.status === "キャンセル" && !inn;
    moving.needed = !(allDone || outCanceled);
    moving.status = allDone || outCanceled ? "完了" : out && !isProcedureDone(out.status) && out.status === "未着手" ? "未依頼" : "依頼中";
    if (out) {
      moving.requested_to = out.requested_to;
      moving.requested_on = out.requested_on;
    }
    if (inn) {
      moving.movein_status = isProcedureDone(inn.status) ? "完了" : inn.status === "依頼中" ? "依頼中" : "未依頼";
      moving.movein_requested_to = inn.requested_to;
      moving.movein_requested_on = inn.requested_on;
    }
  }
  const ko = todos.kokuho;
  const ne = todos.nenkin;
  if (ko || ne) {
    kokuho.kokuho_done = ko ? isProcedureDone(ko.status) : kokuho.kokuho_done;
    kokuho.nenkin_done = ne ? isProcedureDone(ne.status) : kokuho.nenkin_done;
    kokuho.needed = !!((ko && !isProcedureDone(ko.status)) || (ne && !isProcedureDone(ne.status)));
    const req = ko ?? ne;
    if (req) {
      kokuho.requested_to = req.requested_to;
      kokuho.requested_on = req.requested_on;
    }
  }
  const next: WorkerFollowups = { moving, kokuho };
  return JSON.stringify(next) === JSON.stringify(f) ? null : next;
}
