// あとでやる手続きの宿題（忘れ防止）。
//  moving … 転居の必要があり、転居手続きを依頼する人
//  kokuho … 前職が社保で、退職に関わる書類が出てから国保・国民年金に加入する人
// どちらも workers.followups（jsonb・0119）に入れる。

// 転居手続きの進み具合
export const MOVING_STATUSES = ["未依頼", "依頼中", "完了"] as const;
export type MovingStatus = (typeof MOVING_STATUSES)[number];

// 転居前の保険証（何を持っているか）
export const INSURANCE_BEFORE_OPTIONS = ["", "国民健康保険", "社保", "その他"] as const;
export type InsuranceBefore = (typeof INSURANCE_BEFORE_OPTIONS)[number];
// 転居後の保険証（変更なし／国保／社保）
export const INSURANCE_AFTER_OPTIONS = ["", "変更なし", "国民健康保険", "社保"] as const;
export type InsuranceAfter = (typeof INSURANCE_AFTER_OPTIONS)[number];
// 社保→国保のときに要る、退職に関わる書類（どちらか発行されれば国保に加入できる）
export const LOSS_DOC_OPTIONS = ["", "未発行", "資格喪失確認書", "離職票"] as const;
export type LossDoc = (typeof LOSS_DOC_OPTIONS)[number];

export interface MovingFollowup {
  needed: boolean; // 転居手続きが必要
  planned_on: string | null; // 転居（予定）年月日
  status: MovingStatus;
  note: string;
  requested_to: string; // 誰に依頼したか（TODO ＞ 依頼中 の一覧に出す）
  requested_on: string | null; // 依頼日
  certificate_sent_on: string | null; // 転出証明書を郵送で送った日
  certificate_received_on: string | null; // 転出証明書が届いた（発行できた）日。ここから転入手続きに進む
  new_address: string; // 転入先の住所
  // 転入手続き（転出証明書が届いてから、別の人に頼むことがあるので転出とは別に持つ）
  movein_status: MovingStatus;
  movein_requested_to: string; // 転入手続きを誰に依頼したか
  movein_requested_on: string | null; // 転入手続きの依頼日
  insurance_before: InsuranceBefore; // 現在の保険証
  insurance_after: InsuranceAfter; // 転居後の保険証
  loss_doc: LossDoc; // 社保→国保: 資格喪失確認書か離職票が発行されたか
  loss_doc_on: string | null; // その発行日
  shaho_joined: boolean; // 国保→社保: 社保の加入手続きが済んだ
  kokuho_withdrawn: boolean; // 国保→社保: 国保の脱退手続きをした
}

export interface KokuhoFollowup {
  needed: boolean; // 国保・国民年金の加入手続きが必要
  docs_ready_on: string | null; // 退職に関わる書類が発行された年月日（出るまで加入できない）
  kokuho_done: boolean; // 国民健康保険に加入済み
  nenkin_done: boolean; // 国民年金に加入済み
  note: string;
  requested_to: string; // 誰に依頼したか（TODO ＞ 依頼中 の一覧に出す）
  requested_on: string | null; // 依頼日
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
  requested_to: "",
  requested_on: null,
  certificate_sent_on: null,
  certificate_received_on: null,
  new_address: "",
  movein_status: "未依頼",
  movein_requested_to: "",
  movein_requested_on: null,
  insurance_before: "",
  insurance_after: "",
  loss_doc: "",
  loss_doc_on: null,
  shaho_joined: false,
  kokuho_withdrawn: false,
};

export const EMPTY_KOKUHO: KokuhoFollowup = {
  needed: false,
  docs_ready_on: null,
  kokuho_done: false,
  nenkin_done: false,
  note: "",
  requested_to: "",
  requested_on: null,
};

function strOf(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function dateOf(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}
function oneOf<T extends string>(v: unknown, options: readonly T[]): T {
  return options.includes(v as T) ? (v as T) : options[0];
}

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
      note: strOf(moving.note),
      requested_to: strOf(moving.requested_to),
      requested_on: dateOf(moving.requested_on),
      certificate_sent_on: dateOf(moving.certificate_sent_on),
      certificate_received_on: dateOf(moving.certificate_received_on),
      new_address: strOf(moving.new_address),
      movein_status: oneOf(moving.movein_status, MOVING_STATUSES),
      movein_requested_to: strOf(moving.movein_requested_to),
      movein_requested_on: dateOf(moving.movein_requested_on),
      insurance_before: oneOf(moving.insurance_before, INSURANCE_BEFORE_OPTIONS),
      insurance_after: oneOf(moving.insurance_after, INSURANCE_AFTER_OPTIONS),
      loss_doc: oneOf(moving.loss_doc, LOSS_DOC_OPTIONS),
      loss_doc_on: dateOf(moving.loss_doc_on),
      shaho_joined: moving.shaho_joined === true,
      kokuho_withdrawn: moving.kokuho_withdrawn === true,
    },
    kokuho: {
      needed: kokuho.needed === true,
      docs_ready_on: dateOf(kokuho.docs_ready_on),
      kokuho_done: kokuho.kokuho_done === true,
      nenkin_done: kokuho.nenkin_done === true,
      note: strOf(kokuho.note),
      requested_to: strOf(kokuho.requested_to),
      requested_on: dateOf(kokuho.requested_on),
    },
  };
}

// 転居にともなう保険の切り替えの種類。
//   shaho-to-kokuho … 社保 → 国民健康保険（退職に関わる書類が要る）
//   kokuho-to-shaho … 国民健康保険 → 社保（社保に入ったら国保の脱退手続きが要る）
//   none            … 変更なし・未入力・その他
export type InsuranceSwitch = "shaho-to-kokuho" | "kokuho-to-shaho" | "none";

export function insuranceSwitchOf(m: Pick<MovingFollowup, "insurance_before" | "insurance_after">): InsuranceSwitch {
  if (m.insurance_before === "社保" && m.insurance_after === "国民健康保険") return "shaho-to-kokuho";
  if (m.insurance_before === "国民健康保険" && m.insurance_after === "社保") return "kokuho-to-shaho";
  return "none";
}

// 転居の保険の切り替えで、いま出す案内（無ければ空）。
// 転居手続きが残っている間だけ出す（完了・不要なら出さない）
export function movingInsuranceGuide(m: MovingFollowup): { tone: "attention" | "ok"; text: string } | null {
  if (!m.needed || m.status === "完了") return null;
  const sw = insuranceSwitchOf(m);
  if (sw === "shaho-to-kokuho") {
    if (m.loss_doc === "資格喪失確認書" || m.loss_doc === "離職票") {
      return {
        tone: "ok",
        text: `${m.loss_doc}が発行済み${m.loss_doc_on ? `（${m.loss_doc_on}）` : ""}なので、転入先で国民健康保険に加入できます。`,
      };
    }
    return {
      tone: "attention",
      text: "社保から国民健康保険に切り替えます。資格喪失確認書か離職票が発行されないと国保に加入できません。発行されたか確認してください。",
    };
  }
  if (sw === "kokuho-to-shaho") {
    if (m.shaho_joined && m.kokuho_withdrawn) {
      return { tone: "ok", text: "社保の加入と国民健康保険の脱退が済んでいます。" };
    }
    if (m.shaho_joined) {
      return {
        tone: "attention",
        text: "社保の加入手続きが済んでいます。国民健康保険の脱退手続きをしてください（届出をしないと保険料が二重にかかります）。",
      };
    }
    return {
      tone: "attention",
      text: "国民健康保険から社保に切り替えます。社保の加入手続きが済んだら、国民健康保険の脱退手続きをしてください。",
    };
  }
  return null;
}

// 国保・国民年金の加入を誰かに依頼してあるか（依頼先か依頼日が入っていれば依頼中）
export function isKokuhoRequested(f: WorkerFollowups): boolean {
  return needsKokuho(f) && Boolean(f.kokuho.requested_to || f.kokuho.requested_on);
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
    // 転出証明書が届いたあとは転入手続きの段階として出す
    if (f.moving.certificate_received_on || f.moving.movein_status !== "未依頼") {
      labels.push(
        f.moving.movein_status === "依頼中"
          ? "転入手続きを依頼中"
          : f.moving.movein_status === "完了"
            ? "転入手続きは完了（転居手続きを完了にしてください）"
            : "転入手続きの依頼（転出証明書は届いています）",
      );
    } else {
      labels.push(f.moving.status === "依頼中" ? "転出手続きを依頼中" : "転居手続きの依頼");
    }
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
