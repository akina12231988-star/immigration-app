// あとでやる手続きの宿題（忘れ防止）。
//  moving … 転居の必要があり、転居手続きを依頼する人
//  kokuho … 前職が社保で、退職に関わる書類が出てから国保・国民年金に加入する人
// どちらも workers.followups（jsonb・0119）に入れる。

// 転居手続きの進み具合
export const MOVING_STATUSES = ["未依頼", "依頼中", "完了"] as const;
export type MovingStatus = (typeof MOVING_STATUSES)[number];

export interface MovingFollowup {
  needed: boolean; // 転居手続きが必要
  planned_on: string | null; // 転居（予定）年月日
  status: MovingStatus;
  note: string;
}

export interface KokuhoFollowup {
  needed: boolean; // 国保・国民年金の加入手続きが必要
  docs_ready_on: string | null; // 退職に関わる書類が発行された年月日（出るまで加入できない）
  kokuho_done: boolean; // 国民健康保険に加入済み
  nenkin_done: boolean; // 国民年金に加入済み
  note: string;
}

export interface WorkerFollowups {
  moving: MovingFollowup;
  kokuho: KokuhoFollowup;
}

export const EMPTY_MOVING: MovingFollowup = {
  needed: false,
  planned_on: null,
  status: "未依頼",
  note: "",
};

export const EMPTY_KOKUHO: KokuhoFollowup = {
  needed: false,
  docs_ready_on: null,
  kokuho_done: false,
  nenkin_done: false,
  note: "",
};

export const EMPTY_FOLLOWUPS: WorkerFollowups = { moving: EMPTY_MOVING, kokuho: EMPTY_KOKUHO };

// 保存してある jsonb を、欠けているキーを補って読む。
// 0119 が未適用でも（列が無く undefined でも）画面が壊れないようにする。
export function followupsOf(source: { followups?: unknown } | null | undefined): WorkerFollowups {
  const raw = (source?.followups ?? {}) as Record<string, unknown>;
  const moving = (raw.moving ?? {}) as Record<string, unknown>;
  const kokuho = (raw.kokuho ?? {}) as Record<string, unknown>;
  const status = MOVING_STATUSES.includes(moving.status as MovingStatus)
    ? (moving.status as MovingStatus)
    : EMPTY_MOVING.status;
  return {
    moving: {
      needed: moving.needed === true,
      planned_on: typeof moving.planned_on === "string" && moving.planned_on ? moving.planned_on : null,
      status,
      note: typeof moving.note === "string" ? moving.note : "",
    },
    kokuho: {
      needed: kokuho.needed === true,
      docs_ready_on:
        typeof kokuho.docs_ready_on === "string" && kokuho.docs_ready_on ? kokuho.docs_ready_on : null,
      kokuho_done: kokuho.kokuho_done === true,
      nenkin_done: kokuho.nenkin_done === true,
      note: typeof kokuho.note === "string" ? kokuho.note : "",
    },
  };
}

// 転居手続きがまだ終わっていないか（アラートを出すか）
export function needsMoving(f: WorkerFollowups): boolean {
  return f.moving.needed && f.moving.status !== "完了";
}

// 国保・国民年金の加入がまだ残っているか（片方だけ済みでもアラートは出す）
export function needsKokuho(f: WorkerFollowups): boolean {
  return f.kokuho.needed && !(f.kokuho.kokuho_done && f.kokuho.nenkin_done);
}

// この人に手続きの宿題が残っているか
export function hasFollowup(source: { followups?: unknown } | null | undefined): boolean {
  const f = followupsOf(source);
  return needsMoving(f) || needsKokuho(f);
}

// アラートに出す短い説明（「国民健康保険・国民年金の加入」など）。
// 残っている宿題が無いときは空の配列
export function followupLabels(source: { followups?: unknown } | null | undefined): string[] {
  const f = followupsOf(source);
  const labels: string[] = [];
  if (needsMoving(f)) {
    labels.push(f.moving.status === "依頼中" ? "転居手続きを依頼中" : "転居手続きの依頼");
  }
  if (needsKokuho(f)) {
    const rest = [
      f.kokuho.kokuho_done ? null : "国民健康保険",
      f.kokuho.nenkin_done ? null : "国民年金",
    ].filter((s): s is string => s !== null);
    labels.push(
      f.kokuho.docs_ready_on
        ? `${rest.join("・")}の加入（退職書類は発行済み）`
        : `${rest.join("・")}の加入（退職書類の発行待ち）`,
    );
  }
  return labels;
}

// 手続きの宿題が残っている人だけ（メニューのアラート件数・外国人一覧の絞り込み）
export function withFollowups<T extends { followups?: unknown }>(workers: T[]): T[] {
  return workers.filter(hasFollowup);
}

// 保存するときは、いま画面に出ている片方だけを差し替えて、もう片方はそのまま残す
export function patchFollowups(
  base: WorkerFollowups,
  patch: Partial<{ moving: Partial<MovingFollowup>; kokuho: Partial<KokuhoFollowup> }>,
): WorkerFollowups {
  return {
    moving: { ...base.moving, ...(patch.moving ?? {}) },
    kokuho: { ...base.kokuho, ...(patch.kokuho ?? {}) },
  };
}
