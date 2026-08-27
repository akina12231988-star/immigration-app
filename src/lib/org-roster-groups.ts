import { isSsw1Residence } from "@/lib/support-system";

// 所属機関の「在籍者・過去の在籍者」の並べ分け。
//
// これまで「在籍中」は "この機関に紐づいていて退職日が無い人" だけで決めていたため、
// 状態がまだ「申請準備中」の人も在籍中として並んでいた。
// 支援体制の「在籍（1号特定技能）」は状態が「在籍中」の人しか数えないので、
// 画面の見え方と数が食い違って見えた。
// ここで状態「在籍中」の人だけを在籍中とし、それ以外は「在籍前・その他」に分ける。

export interface RosterGroupWorker {
  status: string;
}

export interface RosterGroups<T extends RosterGroupWorker> {
  active: T[]; // 在籍中（状態が「在籍中」）
  notYet: T[]; // まだ在籍中ではない方（申請準備中など）
}

export function splitCurrentRoster<T extends RosterGroupWorker>(rows: T[]): RosterGroups<T> {
  return {
    active: rows.filter((r) => r.status === "在籍中"),
    notYet: rows.filter((r) => r.status !== "在籍中"),
  };
}

// 支援体制の「在籍（1号特定技能）」に数えられない理由。
// 数えられるときは null。表の中で、なぜ数に入っていないかが分かるようにする。
// 在留資格の判定は支援体制と同じ isSsw1Residence を使う（two つの判定がずれないように）。
export function notCountedReason(worker: {
  status: string;
  support: string;
  residenceStatus: string;
}): string | null {
  if (worker.support !== "支援対象") return `支援区分が「${worker.support || "未設定"}」`;
  if (worker.status !== "在籍中") return `状態が「${worker.status || "未設定"}」`;
  if (isSsw1Residence(worker.residenceStatus)) return null;
  return (worker.residenceStatus ?? "").includes("特定活動")
    ? "在留資格が特定活動"
    : `在留資格が特定技能1号ではない（${worker.residenceStatus || "未設定"}）`;
}
