// 申請準備の詳細画面を最後に開いてからの経過（workers.prep_opened_at・0202）。
//
// 入管へ申請まで進んでいないのに長く開いていない申請準備は、放置の可能性がある。
// TODO一覧（申請準備）と申請準備の詳細画面で「最後に開いてから何日」を出し、
// 2週間以上開いていなければアラートにする。

import { jstDateStr } from "@/lib/jst-date";
import { isImmigrationAppliedStatus } from "@/lib/todo";

// この日数以上開いていなければアラート
export const PREP_STALE_DAYS = 14;

const DAY = 86_400_000;

export interface PrepOpenedInfo {
  openedOn: string | null; // 最後に開いた日（日本時間 YYYY-MM-DD）。記録が無ければ null
  days: number | null; // 最後に開いてから何日（今日なら 0）。記録が無ければ null
  stale: boolean; // 2週間以上開いていない（アラート）
  label: string; // 画面に出す文（例: 最終確認 2026-10-10（17日前））
}

// 最後に開いた日時（timestamptz の文字列）と今日（YYYY-MM-DD・日本時間）から経過を出す
export function prepOpenedInfo(openedAt: string | null | undefined, today: string): PrepOpenedInfo {
  if (!openedAt) {
    return { openedOn: null, days: null, stale: false, label: "最終確認 記録なし" };
  }
  const at = new Date(openedAt);
  if (Number.isNaN(at.getTime())) {
    return { openedOn: null, days: null, stale: false, label: "最終確認 記録なし" };
  }
  const openedOn = jstDateStr(at);
  const days = Math.max(
    0,
    Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${openedOn}T00:00:00Z`)) / DAY),
  );
  const ago = days === 0 ? "今日" : `${days}日前`;
  return {
    openedOn,
    days,
    stale: days >= PREP_STALE_DAYS,
    label: `最終確認 ${openedOn}（${ago}）`,
  };
}

// この申請準備のTODOに「最後に開いてから」を出すか。
// 入管へ申請済み・完了のものは進捗の心配が無いので出さない
export function showsPrepOpened(status: string, stage: string): boolean {
  if (isImmigrationAppliedStatus(status)) return false;
  return stage !== "完了";
}
