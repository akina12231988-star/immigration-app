"use client";

import { useCallback, useEffect, useState } from "react";

// 求職一覧の「日付の流れがおかしい応募があります」のお知らせを、一旦消しておくための仕組み。
// 直すタイミングは人によって違う（朝は出先で見るだけ、など）ので、DBには持たせず
// この端末（ブラウザ）に「いつまで隠すか」だけ覚えさせる。
export const DATE_ISSUE_SNOOZE_KEY = "jobs-date-issue-snoozed-until";

// 隠す期限が変わったことを、同じ画面の中の他の場所にも知らせるための合図
const SNOOZE_EVENT = "jobs-date-issue-snooze";

// setTimeout に渡せる上限（約24.8日）。これを超えると即時に発火してしまう
const MAX_TIMEOUT = 2_147_483_647;

// まだ一度も「消す・出す」を押していない端末で、はじめから隠しておく期限。
// 「一旦消して、今日の12:00からまた出して」という依頼に合わせた一度きりの指定で、
// この時刻を過ぎたあとは（押していなければ）ふつうに出るようになる。
export const INITIAL_SNOOZE_UNTIL = new Date(2026, 7, 26, 12, 0, 0, 0); // 2026-08-26 12:00

// 次のお昼12:00。今が12:00より前なら今日の12:00、過ぎていれば翌日の12:00。
export function nextNoon(now: Date): Date {
  const noon = new Date(now);
  noon.setHours(12, 0, 0, 0);
  if (noon.getTime() <= now.getTime()) noon.setDate(noon.getDate() + 1);
  return noon;
}

// 「今日 12:00」「明日 12:00」のような、ボタンや説明に出す言い方
export function snoozeUntilLabel(until: Date, now: Date): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(until);
  day.setHours(0, 0, 0, 0);
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const when = days === 0 ? "今日" : days === 1 ? "明日" : `${until.getMonth() + 1}月${until.getDate()}日`;
  const hh = String(until.getHours()).padStart(2, "0");
  const mm = String(until.getMinutes()).padStart(2, "0");
  return `${when} ${hh}:${mm}`;
}

// 保存してある値から期限（ミリ秒）を決める。
// まだ何も押していない（値がない・壊れている）端末は、上の初期の期限まで隠す。
// 「今すぐ出す」を押した端末には "0" が入っていて、隠さない。
export function snoozedUntilFrom(raw: string | null): number {
  const at = Number(raw);
  if (raw === null || raw === "" || !Number.isFinite(at)) return INITIAL_SNOOZE_UNTIL.getTime();
  return at;
}

// 覚えている期限（ミリ秒）。隠さないときは 0
export function readSnoozedUntil(): number {
  try {
    return snoozedUntilFrom(window.localStorage.getItem(DATE_ISSUE_SNOOZE_KEY));
  } catch {
    return 0; /* localStorage が使えない環境では隠さない */
  }
}

export function snoozeDateIssues(until: Date): void {
  try {
    window.localStorage.setItem(DATE_ISSUE_SNOOZE_KEY, String(until.getTime()));
    window.dispatchEvent(new Event(SNOOZE_EVENT));
  } catch {
    /* localStorage が使えない環境では何もしない */
  }
}

// 「今すぐ出す」。値を消すと「まだ何も押していない」扱いに戻ってしまうので、
// 出すと決めた印として "0" を入れる。
export function clearDateIssueSnooze(): void {
  try {
    window.localStorage.setItem(DATE_ISSUE_SNOOZE_KEY, "0");
    window.dispatchEvent(new Event(SNOOZE_EVENT));
  } catch {
    /* localStorage が使えない環境では何もしない */
  }
}

export interface DateIssueSnooze {
  // この端末の覚えを読み終えたか。読み終えるまではお知らせを出さない
  // （サーバ側では読めないので、先に出すと赤いお知らせが一瞬ちらつく）
  ready: boolean;
  // 隠している間だけ期限が入る。出してよいときは null
  snoozedUntil: Date | null;
  // 隠している期限の言い方（「今日 12:00」など）
  untilLabel: string;
  // これから隠したときの期限の言い方（「一旦消す」ボタンに出す）
  nextLabel: string;
  // 一旦消す（次のお昼12:00まで）
  snooze: () => void;
  // 今すぐ出す
  show: () => void;
}

// 画面が出る前は localStorage も端末の時計も読めない（サーバ側で作った HTML と
// 食い違ってしまう）ので、最初は必ず「出す・ラベルなし」で始めて、あとから読み直す。
const NOT_READ: {
  ready: boolean;
  until: number | null;
  untilLabel: string;
  nextLabel: string;
} = {
  ready: false,
  until: null,
  untilLabel: "",
  nextLabel: "",
};

export function useDateIssueSnooze(): DateIssueSnooze {
  const [state, setState] = useState(NOT_READ);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      if (timer) clearTimeout(timer);
      const now = new Date();
      const at = readSnoozedUntil();
      const nextLabel = snoozeUntilLabel(nextNoon(now), now);
      if (at > now.getTime()) {
        const until = new Date(at);
        setState({ ready: true, until: at, untilLabel: snoozeUntilLabel(until, now), nextLabel });
        // 画面を開きっぱなしにしていても、期限が来たら自分で出す
        timer = setTimeout(apply, Math.min(at - now.getTime() + 500, MAX_TIMEOUT));
      } else {
        setState({ ready: true, until: null, untilLabel: "", nextLabel });
      }
    };
    apply();
    window.addEventListener(SNOOZE_EVENT, apply);
    return () => {
      window.removeEventListener(SNOOZE_EVENT, apply);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const snooze = useCallback(() => snoozeDateIssues(nextNoon(new Date())), []);
  const show = useCallback(() => clearDateIssueSnooze(), []);

  return {
    ready: state.ready,
    snoozedUntil: state.until === null ? null : new Date(state.until),
    untilLabel: state.untilLabel,
    nextLabel: state.nextLabel,
    snooze,
    show,
  };
}
