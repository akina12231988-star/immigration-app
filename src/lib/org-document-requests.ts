// 所属機関からの書類の依頼（年末調整の書類など）の管理（0183）。
//
// 会社から「扶養控除申告書・送金証明書を集めてほしい」のようなメールが来たら、依頼を1件登録し、
// 集める書類を項目として並べる。その機関の在籍者ひとりひとり × 項目について
//   案内した（本人に伝えた）→ 発行した（書類を用意した）→ 会社に送った
// の3つを日付で記録し、誰のどの書類がまだかを一覧で見られるようにする。
// 画面から切り出して単体テストできるようにしている。

export interface DocumentRequestItem {
  id: string;
  name: string; // 書類の名前（扶養控除申告書 など）
  note: string; // 補足（コピーでよい・2026年入社の方のみ など）
  joined_year?: number | null; // この年に入社した人だけが対象（源泉徴収票は今年入社の人だけ など）。空なら全員
}

// 「2026年入社の方のみ」「2026年に入社した人」のような補足から入社年を読む（無ければ null）
export function joinedYearFromNote(note: string): number | null {
  const m = note.normalize("NFKC").match(/(20\d{2})\s*年(?:度)?\s*(?:に|の)?\s*(?:入社|採用|雇用開始|入職)/);
  return m ? Number(m[1]) : null;
}

// 雇用開始日の年（無ければ null）
export function joinedYearOf(startOn: string | null | undefined): number | null {
  const m = (startOn ?? "").match(/^(\d{4})-/);
  return m ? Number(m[1]) : null;
}

export interface RequestWorker {
  id: string;
  startOn: string | null; // この機関での雇用開始日（入社日）
}

// その書類がその人の対象か。入社年の指定がある書類は、入社日がその年の人だけ。
// 入社日が分からない人は対象にしておく（表で入社日の登録を促す）
export function itemAppliesTo(item: Pick<DocumentRequestItem, "joined_year">, startOn: string | null | undefined): boolean {
  if (!item.joined_year) return true;
  const y = joinedYearOf(startOn);
  return y === null || y === item.joined_year;
}

// 入社年で対象外になる理由（対象なら null）
export function joinedYearExcludedReason(item: Pick<DocumentRequestItem, "joined_year">, startOn: string | null | undefined): string | null {
  if (itemAppliesTo(item, startOn)) return null;
  return `${joinedYearOf(startOn)}年入社のため対象外`;
}

export interface OrganizationDocumentRequest {
  id: string;
  organization_id: string;
  title: string;
  requested_on: string; // 依頼が来た日
  due_on: string | null; // 期限
  source: string; // メール / 電話 / FAX など
  memo: string;
  items: DocumentRequestItem[];
  closed_on: string | null; // 対応が終わった日（空なら対応中）
  created_at: string;
  updated_at: string;
}

export type OrganizationDocumentRequestInput = Omit<
  OrganizationDocumentRequest,
  "id" | "created_at" | "updated_at"
>;

// 外国人 × 項目のチェック
export interface DocumentRequestCheck {
  id: string;
  request_id: string;
  worker_id: string;
  item_id: string;
  informed_on: string | null;
  issued_on: string | null;
  sent_on: string | null;
  not_needed: boolean;
  note: string;
  created_at: string;
  updated_at: string;
}

export type DocumentRequestCheckInput = Omit<DocumentRequestCheck, "id" | "created_at" | "updated_at">;

// 3つの段階（順に進める）
export const DOCUMENT_REQUEST_STEPS = [
  { key: "informed_on", label: "案内", long: "本人に案内した" },
  { key: "issued_on", label: "発行", long: "書類を発行した" },
  { key: "sent_on", label: "会社へ", long: "会社に送った" },
] as const;
export type DocumentRequestStepKey = (typeof DOCUMENT_REQUEST_STEPS)[number]["key"];

export const DOCUMENT_REQUEST_SOURCES = ["メール", "電話", "FAX", "口頭", "その他"] as const;

// 項目の id（画面で作る。短くて衝突しにくいもの）
export function newItemId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// テキストエリアの1行を1項目にする。「項目名｜補足」「項目名 / 補足」「項目名（補足）」の形を読む。
// 先頭の「・」「-」「1.」は外す。空行は無視
export function parseItemsText(text: string, makeId: () => string = newItemId): DocumentRequestItem[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*[・\-*‐–—]\s*/, "").replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.match(/^(.*?)\s*[|｜/／]\s*(.*)$/);
      const paren = sep ? null : line.match(/^(.*?)\s*[（(](.*)[)）]\s*$/);
      const name = sep ? sep[1].trim() : paren && paren[1].trim() ? paren[1].trim() : line;
      const note = sep ? sep[2].trim() : paren && paren[1].trim() ? paren[2].trim() : "";
      return { id: makeId(), name, note, joined_year: joinedYearFromNote(note) };
    });
}

// 項目を「項目名｜補足」の行にする（編集用のテキストに戻す）
export function itemsToText(items: DocumentRequestItem[]): string {
  return items.map((i) => (i.note ? `${i.name}｜${i.note}` : i.name)).join("\n");
}

// DB の jsonb から項目の配列にする（壊れていても落ちない）
export function normalizeItems(raw: unknown): DocumentRequestItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r, i): DocumentRequestItem | null => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!name) return null;
      const note = typeof o.note === "string" ? o.note : "";
      return {
        id: typeof o.id === "string" && o.id ? o.id : `item${i}`,
        name,
        note,
        joined_year: typeof o.joined_year === "number" ? o.joined_year : joinedYearFromNote(note),
      };
    })
    .filter((x): x is DocumentRequestItem => x !== null);
}

// 空のチェック（まだ何もしていない）
export function emptyCheck(requestId: string, workerId: string, itemId: string): DocumentRequestCheckInput {
  return {
    request_id: requestId,
    worker_id: workerId,
    item_id: itemId,
    informed_on: null,
    issued_on: null,
    sent_on: null,
    not_needed: false,
    note: "",
  };
}

export function checkKey(workerId: string, itemId: string): string {
  return `${workerId}_${itemId}`;
}

// チェックを 外国人_項目 で引けるようにする
export function indexChecks(checks: DocumentRequestCheck[]): Map<string, DocumentRequestCheck> {
  return new Map(checks.map((c) => [checkKey(c.worker_id, c.item_id), c]));
}

export type CheckState = "対象外" | "未着手" | "案内済" | "発行済" | "送付済";

// 1つのチェックがどこまで進んだか（送付済なら完了）
export function checkState(c: Pick<DocumentRequestCheck, "informed_on" | "issued_on" | "sent_on" | "not_needed"> | undefined): CheckState {
  if (!c) return "未着手";
  if (c.not_needed) return "対象外";
  if (c.sent_on) return "送付済";
  if (c.issued_on) return "発行済";
  if (c.informed_on) return "案内済";
  return "未着手";
}

// 段階に日付を入れる／外す。前の段階が空なら同じ日で埋める（案内せずに発行はできないため）。
// 外すときは後の段階も外す（送付済を外せば発行済・案内済は残る。発行済を外せば送付済も外れる）
export function toggleStep(
  c: DocumentRequestCheckInput,
  step: DocumentRequestStepKey,
  today: string,
): DocumentRequestCheckInput {
  const order = DOCUMENT_REQUEST_STEPS.map((s) => s.key);
  const i = order.indexOf(step);
  const next = { ...c, not_needed: false };
  if (c[step]) {
    for (const k of order.slice(i)) next[k] = null;
  } else {
    for (const k of order.slice(0, i + 1)) if (!next[k]) next[k] = today;
  }
  return next;
}

export interface ItemProgress {
  item: DocumentRequestItem;
  total: number; // 対象の人数（対象外を除く）
  informed: number;
  issued: number;
  sent: number;
  notNeeded: number; // 対象外にした人数（入社年で外れた人も含む）
}

export interface RequestProgress {
  items: ItemProgress[];
  total: number; // 外国人 × 項目（対象外を除く）
  sent: number; // 会社に送った数
  done: boolean; // 全部送った（対象が1つ以上あるとき）
}

// 依頼の進み具合（項目ごと・全体）
export function requestProgress(
  items: DocumentRequestItem[],
  workers: RequestWorker[],
  checks: DocumentRequestCheck[],
): RequestProgress {
  const idx = indexChecks(checks);
  const perItem = items.map((item) => {
    const p: ItemProgress = { item, total: 0, informed: 0, issued: 0, sent: 0, notNeeded: 0 };
    for (const { id: w, startOn } of workers) {
      const c = idx.get(checkKey(w, item.id));
      if (c?.not_needed || !itemAppliesTo(item, startOn)) {
        p.notNeeded += 1;
        continue;
      }
      p.total += 1;
      if (c?.informed_on) p.informed += 1;
      if (c?.issued_on) p.issued += 1;
      if (c?.sent_on) p.sent += 1;
    }
    return p;
  });
  const total = perItem.reduce((n, p) => n + p.total, 0);
  const sent = perItem.reduce((n, p) => n + p.sent, 0);
  return { items: perItem, total, sent, done: total > 0 && sent === total };
}

// 1人の進み具合（その人の項目のうち、まだ会社に送っていないもの）
export function workerPending(
  items: DocumentRequestItem[],
  worker: RequestWorker,
  idx: Map<string, DocumentRequestCheck>,
): DocumentRequestItem[] {
  return items.filter((item) => {
    if (!itemAppliesTo(item, worker.startOn)) return false;
    const s = checkState(idx.get(checkKey(worker.id, item.id)));
    return s !== "送付済" && s !== "対象外";
  });
}

// 期限までの日数（期限が無ければ null）。負なら過ぎている
export function daysToDue(dueOn: string | null, today: string): number | null {
  if (!dueOn) return null;
  const a = new Date(`${dueOn}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

// 期限の表示（「あと3日」「今日まで」「2日過ぎ」）
export function dueLabel(dueOn: string | null, today: string): string {
  const d = daysToDue(dueOn, today);
  if (d === null) return "";
  if (d > 0) return `あと${d}日`;
  if (d === 0) return "今日まで";
  return `${-d}日過ぎ`;
}
