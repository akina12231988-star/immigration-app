// 住所・保険の手続きのTODO（転出・転入・国民健康保険の加入・国民年金の加入）。
//
// 1人につきTODOは1件（題名「住所・保険の手続き」）にし、その中に手続きごとの
// 経過（未着手 → 依頼中 → 完了／キャンセル）・依頼先・依頼日・メモを持つ（todos.procedure_steps・0219）。
// TODOの経過は中の手続きから決める（procedureOverallStatus）。
// 転居予定日・転入先の住所・保険証の切り替えなどの詳しい記録は、これまでどおり workers.followups に入れる。
// 手続きの経過から followups の「必要」「完了」の印を合わせ、外国人一覧の「あとでやる手続き」や
// TODO ＞ 依頼中 の一覧もこれまでどおり動くようにする（syncFollowupsWithTodos）。

import type { WorkerFollowups } from "@/lib/worker-followups";

export const PROCEDURE_TODO_KIND = "住所・保険の手続き" as const;
export const PROCEDURE_TODO_TITLE = "住所・保険の手続き";

export const PROCEDURE_TITLES = {
  moveOut: "転出手続き",
  moveIn: "転入手続き",
  kokuho: "国民健康保険の加入手続き",
  nenkin: "国民年金の加入手続き",
} as const;
export type ProcedureKey = keyof typeof PROCEDURE_TITLES;
export const PROCEDURE_KEYS: ProcedureKey[] = ["moveOut", "moveIn", "kokuho", "nenkin"];
// TODO一覧などで短く出す名前
export const PROCEDURE_SHORT: Record<ProcedureKey, string> = {
  moveOut: "転出",
  moveIn: "転入",
  kokuho: "国保",
  nenkin: "年金",
};

// 経過（0217 の選択肢と同じ）。依頼中は進行中、キャンセルは完了の扱い
export const PROCEDURE_STATUSES = ["未着手", "依頼中", "完了", "キャンセル"] as const;
export type ProcedureStatus = (typeof PROCEDURE_STATUSES)[number];

export function isProcedureDone(status: string): boolean {
  return status === "完了" || status === "キャンセル";
}

// TODOの中の手続き1つ
export interface ProcedureStep {
  status: string;
  requested_to: string;
  requested_on: string | null;
  note: string;
}
export type ProcedureSteps = Partial<Record<ProcedureKey, ProcedureStep>>;

export const NEW_STEP: ProcedureStep = { status: "未着手", requested_to: "", requested_on: null, note: "" };

// 保存されている jsonb を読む（知らない手続きは捨てる）
export function normalizeProcedureSteps(v: unknown): ProcedureSteps {
  const out: ProcedureSteps = {};
  if (!v || typeof v !== "object") return out;
  const o = v as Record<string, unknown>;
  for (const k of PROCEDURE_KEYS) {
    const s = o[k];
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    out[k] = {
      status: (PROCEDURE_STATUSES as readonly string[]).includes(String(r.status)) ? String(r.status) : "未着手",
      requested_to: typeof r.requested_to === "string" ? r.requested_to : "",
      requested_on: typeof r.requested_on === "string" && r.requested_on ? r.requested_on : null,
      note: typeof r.note === "string" ? r.note : "",
    };
  }
  return out;
}

// TODOの経過を中の手続きから決める。手続きが無ければ未着手
export function procedureOverallStatus(steps: ProcedureSteps): ProcedureStatus {
  const list = PROCEDURE_KEYS.map((k) => steps[k]).filter((s): s is ProcedureStep => !!s);
  if (list.length === 0) return "未着手";
  if (list.some((s) => s.status === "依頼中")) return "依頼中";
  if (list.some((s) => s.status === "未着手")) return "未着手";
  if (list.some((s) => s.status === "完了")) return "完了";
  return "キャンセル";
}

// 画面で扱うTODOの形（todos の行のうち使う列）
export interface ProcedureTodo {
  id: string;
  todo_no: string;
  title: string;
  status: string;
  steps: ProcedureSteps;
  deleted_at: string | null;
  created_at: string;
}

// その人の住所・保険の手続きのTODO（削除フォルダのものは除く。いちばん新しいもの）
export function currentProcedureTodo<T extends Pick<ProcedureTodo, "deleted_at" | "created_at">>(todos: T[]): T | null {
  return [...todos].filter((t) => !t.deleted_at).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null;
}

// これまでの外国人詳細のチェック（followups）から、TODOに足すべき手続きを決める（まだ無い手続きだけ）。
//  ・転居の必要あり → 転出手続き（転出証明書が届いていれば完了）。転入手続きを始めていれば転入手続きも
//  ・国保・国民年金の加入が必要 → 国保・国民年金の加入手続き（済んでいる方は完了）
export function procedureStepsFromFollowups(f: WorkerFollowups, existing: ProcedureSteps): ProcedureSteps {
  const out: ProcedureSteps = {};
  const statusOf = (s: string, requested: boolean): ProcedureStatus =>
    s === "完了" ? "完了" : s === "依頼中" || requested ? "依頼中" : "未着手";
  if (f.moving.needed) {
    if (!existing.moveOut) {
      out.moveOut = {
        status: f.moving.certificate_received_on ? "完了" : statusOf(f.moving.status, !!(f.moving.requested_to || f.moving.requested_on)),
        requested_to: f.moving.requested_to,
        requested_on: f.moving.requested_on,
        note: "",
      };
    }
    const moveInStarted =
      !!f.moving.certificate_received_on || f.moving.movein_status !== "未依頼" || !!f.moving.movein_requested_to;
    if (!existing.moveIn && moveInStarted) {
      out.moveIn = {
        status: f.moving.status === "完了" ? "完了" : statusOf(f.moving.movein_status, !!(f.moving.movein_requested_to || f.moving.movein_requested_on)),
        requested_to: f.moving.movein_requested_to,
        requested_on: f.moving.movein_requested_on,
        note: "",
      };
    }
  }
  if (f.kokuho.needed) {
    const requested = !!(f.kokuho.requested_to || f.kokuho.requested_on);
    if (!existing.kokuho) {
      out.kokuho = { status: f.kokuho.kokuho_done ? "完了" : requested ? "依頼中" : "未着手", requested_to: f.kokuho.requested_to, requested_on: f.kokuho.requested_on, note: "" };
    }
    if (!existing.nenkin) {
      out.nenkin = { status: f.kokuho.nenkin_done ? "完了" : requested ? "依頼中" : "未着手", requested_to: f.kokuho.requested_to, requested_on: f.kokuho.requested_on, note: "" };
    }
  }
  return out;
}

// 手続きの経過・依頼先から followups の印を合わせる（外国人一覧の件数・依頼中の一覧に使われているため）。
// 変わったときだけ新しい値を返す（変わらなければ null）
export function syncFollowupsWithTodos(f: WorkerFollowups, steps: ProcedureSteps): WorkerFollowups | null {
  const moving = { ...f.moving };
  const kokuho = { ...f.kokuho };
  const out = steps.moveOut;
  const inn = steps.moveIn;
  if (out || inn) {
    const allDone = (!out || isProcedureDone(out.status)) && (!inn || isProcedureDone(inn.status)) && !!inn;
    const outCanceled = out?.status === "キャンセル" && !inn;
    moving.needed = !(allDone || outCanceled);
    moving.status = allDone || outCanceled ? "完了" : out && out.status === "未着手" ? "未依頼" : "依頼中";
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
  const ko = steps.kokuho;
  const ne = steps.nenkin;
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

// TODO一覧に出す要約（例: 転出 完了／転入 依頼中（NGAさん））
export function procedureStepsSummary(steps: ProcedureSteps): { key: ProcedureKey; label: string; status: string; requestedTo: string }[] {
  return PROCEDURE_KEYS.filter((k) => steps[k]).map((k) => ({
    key: k,
    label: PROCEDURE_SHORT[k],
    status: steps[k]!.status,
    requestedTo: steps[k]!.requested_to,
  }));
}
