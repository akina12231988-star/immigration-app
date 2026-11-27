// オンライン申請の入力チェック。
//
// オンライン申請システムの「入力内容の確認」画面（または申込内容照会）を
// 全選択してコピーした文章を貼り付けると、アプリが持っている期待値
// （「オンライン申請の順」の各項目）と突き合わせて、違う項目を見つける。
// 画面の値は「男 Male」「無 Single」「2005年03月27日」のような表記なので、
// 全半角・空白・日付の書き方の違いはならしてから比べる。
// 見比べながらの手入力の「有無の押し間違い」などを、送信前に機械的に拾うための補助チェック。

import type { OnlineSection } from "@/lib/online-application";

export type OnlineCheckStatus = "ok" | "ng" | "notfound";

export interface OnlineCheckResult {
  no: string;
  label: string;
  expected: string; // アプリの期待値（貼り付ける値）
  status: OnlineCheckStatus;
  found: string; // 画面側で見つかった値のあたりの文章（ng のとき確認用に出す）
}

export interface OnlineCheckSummary {
  ok: number;
  ng: number;
  notfound: number;
  checked: number; // 突き合わせた項目の数（期待値のある項目）
  results: OnlineCheckResult[]; // ng と notfound だけ（画面に出す分）
}

// 比べる前のならし: 全角→半角（NFKC）・空白除去・記号の統一
function norm(s: string): string {
  return (s ?? "")
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[．]/g, ".")
    .replace(/[−ー―–-]/g, "-")
    .toLowerCase();
}

function digits(s: string): string {
  return norm(s).replace(/\D/g, "");
}

// 期待値が画面側の文章（値の近くの範囲）に入っているか。
// 「特定技能1号 Specified Skilled Worker (i)」のような和英併記は includes で拾い、
// 日付・番号（2005-03-27 と 2005年03月27日 など）は数字の並びで比べる
export function onlineValueMatches(expected: string, windowText: string): boolean {
  const e = norm(expected);
  if (!e) return true;
  const w = norm(windowText);
  if (w.includes(e)) return true;
  const ed = digits(expected);
  if (ed.length >= 4 && digits(windowText).includes(ed)) return true;
  return false;
}

// 貼り付けた文章をチェックする。
// 画面と同じ順に項目が並ぶ前提で、ラベルを前から順に探し、
// 次の項目のラベルまでを「その項目の値のあたり」として期待値と比べる
export function checkOnlineInput(sections: OnlineSection[], pasted: string): OnlineCheckSummary {
  const text = norm(pasted);
  const items = sections
    .flatMap((s) => s.items)
    .filter((i) => !i.skip && (i.value ?? "").trim() !== "");

  // 各項目のラベルの位置（前から順に。見つからなければ -1）
  const positions: number[] = [];
  let cursor = 0;
  for (const item of items) {
    const keys = [
      norm(`${item.no}${item.label}`),
      norm(item.label),
      // ラベルが画面と少し違っても拾えるよう、ラベルの後ろの部分でも探す
      norm(item.label).slice(-6),
    ].filter((k) => k.length >= 2);
    let at = -1;
    for (const k of keys) {
      const i1 = text.indexOf(k, cursor);
      const i2 = i1 < 0 ? text.indexOf(k) : i1;
      if (i2 >= 0) {
        at = i2 + k.length;
        break;
      }
    }
    positions.push(at);
    if (at >= 0 && at > cursor) cursor = at;
  }

  const summary: OnlineCheckSummary = { ok: 0, ng: 0, notfound: 0, checked: items.length, results: [] };
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const at = positions[i];
    if (at < 0) {
      summary.notfound += 1;
      summary.results.push({ no: item.no, label: item.label, expected: item.value, status: "notfound", found: "" });
      continue;
    }
    // 値のあたり = ラベルの直後から、次に見つかった項目のラベルまで（無ければ200文字）
    const next = positions.slice(i + 1).find((p) => p > at);
    const windowText = text.slice(at, next != null ? next : at + 200);
    if (onlineValueMatches(item.value, windowText)) {
      summary.ok += 1;
    } else {
      summary.ng += 1;
      summary.results.push({
        no: item.no,
        label: item.label,
        expected: item.value,
        status: "ng",
        found: windowText.slice(0, 60),
      });
    }
  }
  return summary;
}
