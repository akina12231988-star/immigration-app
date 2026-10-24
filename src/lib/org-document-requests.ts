import {
  HEALTH_CHECK_DOC_KEY,
  HEALTH_CHECK_LABEL,
  gensenDocKey,
  gensenLabel,
  isGensenYearKey,
  onboardingDocDefs,
  reiwaYear,
} from "@/lib/onboarding";
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
  // 外国人詳細の「入社時に送る資料」のどの書類に紐づけるか（書類キー）。
  // 空・未設定なら書類名から自動で判定、LINK_DOC_NONE なら紐づけない
  link_doc_key?: string;
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
  // 本人から「無い」と回答があった日（案内のあと。0198）。
  // 0198 未適用の環境でも他の保存が止まらないよう、値を入れるときだけ送る（省略可）
  none_replied_on?: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export type DocumentRequestCheckInput = Omit<DocumentRequestCheck, "id" | "created_at" | "updated_at">;

// マスに添付したファイル（0185）。実体は app-files バケット
export interface DocumentRequestFile {
  id: string;
  request_id: string;
  worker_id: string;
  item_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  created_at: string;
}

// 添付ファイルを 外国人_項目 でまとめる
export function groupFilesByCell(files: DocumentRequestFile[]): Map<string, DocumentRequestFile[]> {
  const m = new Map<string, DocumentRequestFile[]>();
  for (const f of files) {
    const k = checkKey(f.worker_id, f.item_id);
    m.set(k, [...(m.get(k) ?? []), f]);
  }
  return m;
}

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
        link_doc_key: typeof o.link_doc_key === "string" ? o.link_doc_key : "",
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

export type CheckState = "対象外" | "未着手" | "案内済" | "無し回答" | "発行済" | "送付済";

// 1つのチェックがどこまで進んだか（送付済なら完了。無し回答＝案内のあと本人から「無い」と返事があった）
export function checkState(
  c: Pick<DocumentRequestCheck, "informed_on" | "issued_on" | "sent_on" | "not_needed" | "none_replied_on"> | undefined,
): CheckState {
  if (!c) return "未着手";
  if (c.not_needed) return "対象外";
  if (c.sent_on) return "送付済";
  if (c.issued_on) return "発行済";
  if (c.none_replied_on) return "無し回答";
  if (c.informed_on) return "案内済";
  return "未着手";
}

// 「無し回答」を外すための差分。付いているときだけ null を送る（0198 未適用でも他の保存が止まらないように）
function clearNoneReplied(c: Pick<DocumentRequestCheckInput, "none_replied_on">): Pick<DocumentRequestCheckInput, "none_replied_on"> {
  return c.none_replied_on ? { none_replied_on: null } : {};
}

// 本人から「無い」と回答があった（案内のあと）。案内がまだなら同じ日で案内済にし、発行・送付は外す
export function setNoneReplied(c: DocumentRequestCheckInput, today: string): DocumentRequestCheckInput {
  return {
    ...c,
    not_needed: false,
    informed_on: c.informed_on ?? today,
    issued_on: null,
    sent_on: null,
    none_replied_on: today,
  };
}

// 「無し回答」を取り消す（案内済に戻る）
export function unsetNoneReplied(c: DocumentRequestCheckInput): DocumentRequestCheckInput {
  return { ...c, ...clearNoneReplied(c) };
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
  // 段階を動かしたら「無し回答」は外す（あとで手に入って発行した、案内を取り消した など）
  const next = { ...c, not_needed: false, ...clearNoneReplied(c) };
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
  noneReplied: number; // 本人から「無い」と回答があった人数（対象の数には入れない）
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
    const p: ItemProgress = { item, total: 0, informed: 0, issued: 0, sent: 0, notNeeded: 0, noneReplied: 0 };
    for (const { id: w, startOn } of workers) {
      const c = idx.get(checkKey(w, item.id));
      if (c?.not_needed || !itemAppliesTo(item, startOn)) {
        p.notNeeded += 1;
        continue;
      }
      // 本人が持っていない書類は、会社に送る数には入れない（別に数える）
      if (checkState(c) === "無し回答") {
        p.noneReplied += 1;
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
    return s !== "送付済" && s !== "対象外" && s !== "無し回答";
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

// ---- チェック表の絞り込み（国籍・入社年） ----

export interface FilterableWorker {
  nationality: string;
  startOn: string | null;
}

// 国籍の選択肢（表に出ている人の国籍。空は「未登録」としてまとめる）
export function nationalityOptions(workers: FilterableWorker[]): string[] {
  const set = new Set(workers.map((w) => (w.nationality ?? "").trim() || "未登録"));
  return [...set].sort((a, b) => (a === "未登録" ? 1 : b === "未登録" ? -1 : a.localeCompare(b, "ja")));
}

// 入社年の選択肢（新しい年から。入社日が無い人がいれば「未登録」も）
export function joinedYearOptions(workers: FilterableWorker[]): string[] {
  const years = new Set<string>();
  let unknown = false;
  for (const w of workers) {
    const y = joinedYearOf(w.startOn);
    if (y === null) unknown = true;
    else years.add(String(y));
  }
  const list = [...years].sort((a, b) => Number(b) - Number(a));
  return unknown ? [...list, "未登録"] : list;
}

export interface WorkerFilter {
  nationality: string; // "" = すべて
  joinedYear: string; // "" = すべて / "2026" / "未登録"
}

export function filterRequestWorkers<T extends FilterableWorker>(workers: T[], f: WorkerFilter): T[] {
  return workers.filter((w) => {
    if (f.nationality && ((w.nationality ?? "").trim() || "未登録") !== f.nationality) return false;
    if (f.joinedYear) {
      const y = joinedYearOf(w.startOn);
      if (f.joinedYear === "未登録" ? y !== null : String(y) !== f.joinedYear) return false;
    }
    return true;
  });
}

// ---- 外国人詳細の「入社時に送る資料」に添付済みの書類との突き合わせ ----
//
// 会社から頼まれた書類（扶養控除申告書 など）が、すでに外国人詳細の入社書類として
// 添付してあれば、このチェック表のマスにその添付データを出して開けるようにする。
// 書類名は書き方が揺れる（「扶養控除申告書」と「扶養控除等申告書」、「2026年送金証明書」など）ので、
// 年・括弧書き・「等」などを取り除いてから突き合わせる

// 比べやすい形にする（全角半角をそろえ、空白・括弧書き・年の前置き・「等」「の写し」「コピー」を除く）
export function normalizeDocName(name: string): string {
  return (name ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/^(20\d{2}年度?分?|令和\d+年度?分?)+/g, "")
    .replace(/等|の写し|コピー/g, "")
    .trim();
}

// 書類名に入っている年（令和年に直す。無ければ null）。源泉徴収票の年の突き合わせに使う
export function docNameReiwaYear(name: string): number | null {
  const n = (name ?? "").normalize("NFKC");
  const r = n.match(/令和\s*(\d+)\s*年/);
  if (r) return Number(r[1]);
  const y = n.match(/(20\d{2})\s*年/);
  return y ? Number(y[1]) - 2018 : null;
}

export interface OnboardingDocLike {
  doc_key: string;
  label: string;
}

// 依頼の書類名と、入社書類の1件が同じ書類か
export function matchesOnboardingDoc(itemName: string, doc: OnboardingDocLike): boolean {
  const a = normalizeDocName(itemName);
  const b = normalizeDocName(doc.label);
  if (a.length < 3 || b.length < 3) return false;
  if (!(a === b || a.includes(b) || b.includes(a))) return false;
  // 源泉徴収票は令和年ごとに別の書類。依頼に年が書いてあれば同じ年のものだけ
  const m = /^gensen_r(\d+)$/.exec(doc.doc_key);
  if (m) {
    const y = docNameReiwaYear(itemName);
    if (y !== null && y !== Number(m[1])) return false;
  }
  return true;
}

// 「紐づけない」の印（依頼の登録で選ぶ）
export const LINK_DOC_NONE = "none";

// 依頼の登録で選べる紐づけ先（外国人詳細の入社書類。源泉徴収票は前後の年も選べる）
export function linkDocOptions(today: string): { key: string; label: string }[] {
  const reiwa = reiwaYear(today);
  const out: { key: string; label: string }[] = [];
  for (const d of onboardingDocDefs(today)) {
    if (isGensenYearKey(d.key)) {
      for (const r of [reiwa + 1, reiwa, reiwa - 1]) out.push({ key: gensenDocKey(r), label: gensenLabel(r) });
    } else {
      out.push({ key: d.key, label: d.label });
    }
  }
  out.push({ key: HEALTH_CHECK_DOC_KEY, label: HEALTH_CHECK_LABEL });
  return out;
}

// その人の入社書類のうち、依頼の書類に当たる添付済みのもの（無ければ null）。
// 依頼の登録で紐づけ先を選んであればその書類だけ、「紐づけない」なら null、未設定なら書類名から自動で判定
export function findOnboardingDocFor<T extends OnboardingDocLike>(
  item: Pick<DocumentRequestItem, "name" | "link_doc_key">,
  docs: T[],
): T | null {
  const key = item.link_doc_key ?? "";
  if (key === LINK_DOC_NONE) return null;
  if (key) return docs.find((d) => d.doc_key === key) ?? null;
  return docs.find((d) => matchesOnboardingDoc(item.name, d)) ?? null;
}
