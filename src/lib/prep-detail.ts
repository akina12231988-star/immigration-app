// 申請準備の詳細ページ（左に目次・右に章）で使う判定。
//  ・目次に並べる章
//  ・あっせん「無し」の理由の選択肢
//  ・必要な書類の「誰に・いつ」（依頼先と依頼日）
//  ・「何の書類を待っていますか？」に入れる文

// 目次に並べる章（ページ内リンクの id と見出し）
export const PREP_DETAIL_SECTIONS = [
  { id: "prep-basic", label: "基本情報・所属機関" },
  { id: "prep-prior", label: "前回の申請" },
  { id: "prep-docs", label: "必要な書類" },
  { id: "prep-copy", label: "申請書に貼る情報" },
  { id: "prep-sign", label: "署名・賃金・雇用契約書" },
  { id: "prep-assen", label: "あっせん" },
  { id: "prep-dates", label: "支援計画書の日付" },
  { id: "prep-plan", label: "1-17号 支援計画書" },
  { id: "prep-farm", label: "農業 加入通知書" },
  { id: "prep-submit", label: "提出・申請後の郵送" },
] as const;
export type PrepDetailSectionId = (typeof PREP_DETAIL_SECTIONS)[number]["id"];

// ---- あっせん ----

// あっせん「無し」の理由（どれかを選ぶ。当てはまらなければ「その他」で文字を入れる）
export const ASSEN_NONE_REASONS = [
  "技能実習生から特定技能へ資格変更申請のため",
  "外国人が直接会社へ面接して支援委託だけうけている",
] as const;
export const ASSEN_OTHER = "その他";

// 保存してある理由（todos.assen_note）が、どの選択肢に当たるか。
// 選択肢と同じ文ならその選択肢、それ以外の文は「その他」（文はそのまま入力欄に出す）
export function assenReasonChoice(note: string | null | undefined): { choice: string; other: string } {
  const n = (note ?? "").trim();
  if (!n) return { choice: "", other: "" };
  if ((ASSEN_NONE_REASONS as readonly string[]).includes(n)) return { choice: n, other: "" };
  return { choice: ASSEN_OTHER, other: n };
}

// あっせんが決まっているか（有り、または無しで理由まで入っている）
export function assenDecided(assen: string | null | undefined, note: string | null | undefined): boolean {
  if (assen === "あり") return true;
  if (assen === "なし") return !!(note ?? "").trim();
  return false;
}

// ---- 必要な書類の「誰に・いつ」 ----

export type PrepRequesteeKind = "person" | "self" | "mail";

export interface PrepRequestee {
  kind: PrepRequesteeKind;
  who: string; // 画面に出す依頼先（例: NGAさん・本人・郵送請求）
}

// 準備状況の選択値と入力（依頼先 note）から、いま誰に頼んでいるかを求める。
// 依頼先を選ぶ欄がある選択肢（発行依頼中）は、その入力を使う（未入力なら「依頼先未入力」）。
// それ以外は選択値の文から読み取る（例: 本人に依頼中 → 本人、秋吉伽恋に発行依頼中 → 秋吉伽恋）。
// 読み取れないとき・完了しているときは null
export function prepDocRequestee(
  status: string,
  note: string,
  opts: { hasIssuerField: boolean; done: boolean },
): PrepRequestee | null {
  const s = (status ?? "").trim();
  if (!s || opts.done) return null;
  if (opts.hasIssuerField) {
    const who = (note ?? "").trim();
    return { kind: "person", who: who || "依頼先未入力" };
  }
  if (s.includes("郵送請求")) return { kind: "mail", who: "郵送請求" };
  if (s.includes("本人")) return { kind: "self", who: "本人" };
  const m = s.match(/^(.+?)に(?:発行)?依頼中/);
  if (m) return { kind: "person", who: m[1].trim() };
  if (s.includes("領収書発行待ち")) return { kind: "self", who: "本人" };
  return null;
}

// 依頼日からの経過日数（日付が無い・未来なら null）
export function daysSince(dateOn: string | null | undefined, today: string): number | null {
  if (!dateOn) return null;
  const a = Date.parse(`${dateOn.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000);
}

// 依頼してから何日たったら目立たせるか
export const REQUEST_OVERDUE_DAYS = 14;

// 依頼先ごとの件数（目次の横ではなく、必要な書類の上に並べる）。件数の多い順
export function requesteeCounts(list: (PrepRequestee | null)[]): { who: string; kind: PrepRequesteeKind; count: number }[] {
  const map = new Map<string, { who: string; kind: PrepRequesteeKind; count: number }>();
  for (const r of list) {
    if (!r) continue;
    const cur = map.get(r.who) ?? { who: r.who, kind: r.kind, count: 0 };
    cur.count += 1;
    map.set(r.who, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.who.localeCompare(b.who, "ja"));
}

// ---- 「何の書類を待っていますか？」 ----

// 不足している書類の名前から、TODOの「待っている書類」に入れる文を作る（依頼先が分かれば括弧で付ける）
export function waitingNoteFromMissing(rows: { label: string; who?: string | null }[]): string {
  return rows
    .map((r) => (r.who && r.who !== "依頼先未入力" ? `${r.label}（${r.who}）` : r.label))
    .join("・");
}
