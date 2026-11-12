// 入管メール通知を「申請1件＝1行」の表にまとめる。
//
// 入管のオンライン申請のメール（仮番号・受付番号・審査完了・受領方法変更）と、手数料の決済メール
// （dgft の決済リンク・veritrans の決済申込完了／入金完了）を古い順に読み、
// 受付番号・仮番号・在留カード番号で同じ申請の行にまとめる。
// 読み取り方は、スプレッドシート「申請一覧」を作っている Apps Script（入管メール → 申請一覧）と同じにしてある。
// メールは毎回アプリに届く（/api/mail/inbound）ので、画面を開くたびにこの表を組み立て直す＝メールが来るたびに更新される。

export const MAIL_TABLE_STATUSES = ["審査中", "納付待ち", "入金済・受領待ち", "完了"] as const;
export type MailTableStatus = (typeof MAIL_TABLE_STATUSES)[number];
// 状態は「進む方向」にだけ自動で更新する
const STATUS_RANK: Record<string, number> = { 審査中: 1, 納付待ち: 2, "入金済・受領待ち": 3, 完了: 4 };
export function statusRank(s: string | null | undefined): number {
  return STATUS_RANK[s ?? ""] ?? 0;
}

// 受付番号の頭文字 ⇔ 官署番号（仮番号メールに記載の対応表）
const OFFICE_CODE: Record<string, string> = {
  札オン: "958", 仙オン: "959", 東オン: "960", 横オン: "961", 名オン: "962", 阪オン: "963",
  神オン: "964", 高オン: "965", 広オン: "966", 福オン: "967", 那オン: "968",
};

// 担当者の表記（メール上のローマ字 → 一覧での表記）。人が増えたらここに1行足す
export const STAFF_NAMES: Record<string, string> = {
  "ICHIHARA AYANA": "市原彩奈",
  "AKIYOSHI KAREN": "秋吉伽恋",
  "OOMOTO RENA": "大元麗奈",
  "TANOUE NATSUKI": "田上夏季",
};

export function toHalf(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

function staffName(s: string): string {
  const key = toHalf(s).replace(/\s+/g, " ").trim().toUpperCase();
  return STAFF_NAMES[key] ?? String(s ?? "").trim();
}

function cleanLines(body: string): string[] {
  return String(body ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/　/g, " ").trim())
    .filter((l) => l !== "");
}

// label に一致する行の「次の行」
function valueAfter(lines: string[], labelRe: RegExp): string {
  for (let i = 0; i < lines.length - 1; i++) {
    if (labelRe.test(lines[i])) return lines[i + 1];
  }
  return "";
}

const stripSama = (s: string) => String(s ?? "").replace(/\s*様\s*$/, "").trim();

// 「福オンCV26010044」も「967CV26010044」も同じキーにそろえる
export function receiptKey(no: string | null | undefined): string {
  const s = toHalf(no).replace(/\s/g, "");
  if (!s) return "";
  const head = s.slice(0, 3);
  return OFFICE_CODE[head] ? OFFICE_CODE[head] + s.slice(3) : s;
}

export type MailInfoType = "skip" | "other" | "payLink" | "paid" | "payApplied" | "pickup" | "examDone" | "prov" | "recv";

export interface MailInfo {
  type: MailInfoType;
  status?: MailTableStatus;
  staff?: string;
  receipt?: string;
  prov?: string;
  card?: string;
  appType?: string;
  acceptDate?: string;
  applicant?: string;
  fee?: string;
  permit?: string;
  payDue?: string;
  paidDate?: string;
  expiry?: string;
  pickup?: string;
  examDone?: boolean;
}

// 1通のメールを読む（Apps Script の parseMail と同じ）
export function parseImmigrationMail(subjectIn: string, body: string): MailInfo {
  const lines = cleanLines(body);
  const text = lines.join("\n");
  const subject = String(subjectIn ?? "");
  const info: MailInfo = { type: "other" };

  // --- 決済代行（veritrans / dgft）---
  const order = text.match(/ISA\d+_([A-Z0-9]+)-([A-Z0-9]+)-\d+-[A-Z]+/);
  if (/手数料納付用決済リンク/.test(subject)) {
    info.type = "payLink";
    info.status = "納付待ち";
    const who = lines.filter((l) => /様$/.test(l))[0] ?? "";
    info.staff = stripSama(who).replace(/^[A-Z0-9]+-/, ""); // 先頭の利用者IDを外す
    info.receipt = toHalf(valueAfter(lines, /^●申請受付番号/));
    info.fee = toHalf(valueAfter(lines, /^●納付金額/)).replace(/[^\d]/g, "");
    info.permit = valueAfter(lines, /^●許可の内容/);
    if (order) {
      info.card = order[1];
      if (!info.receipt) info.receipt = order[2];
    }
    return info;
  }
  if (/決済申込完了のお知らせ|入金完了のお知らせ/.test(subject)) {
    if (!/在留申請/.test(text)) return { type: "skip" }; // 入管以外の決済メール
    const paid = /入金完了/.test(subject);
    info.type = paid ? "paid" : "payApplied";
    info.status = paid ? "入金済・受領待ち" : "納付待ち";
    if (order) {
      info.card = order[1];
      info.receipt = order[2];
    }
    const r = text.match(/受付番号\s*[：:]\s*([A-Z0-9]+)/);
    if (r && !info.receipt) info.receipt = r[1];
    const total = text.match(/合計金額\s*[：:]\s*([\d,]+)/);
    if (total) info.fee = total[1].replace(/,/g, "");
    const due = text.match(/支払期限\s*[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/);
    if (due) info.payDue = due[1];
    const fin = text.match(/完了日時\s*[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/);
    if (fin) info.paidDate = fin[1];
    return info;
  }

  // --- 在留申請オンラインシステム ---
  if (/申請受付完了のお知らせ/.test(subject)) return { type: "skip" };

  const isProv = /申請受付仮番号のお知らせ/.test(subject);
  const isRecv = /申請受付番号のお知らせ/.test(subject);
  const isDone = /審査完了に関するお知らせ/.test(subject);
  const isPickup = /受領方法変更のお知らせ/.test(subject);
  if (!isProv && !isRecv && !isDone && !isPickup) return info; // 知らない種類（表には載せない）

  info.acceptDate = valueAfter(lines, /^申請受付日\s*[（(]/);
  info.card = toHalf(valueAfter(lines, /在留カード等番号\s*[（(]/)).replace(/\s/g, "");
  info.receipt = toHalf(valueAfter(lines, /^申請受付番号\s*[（(]/)).replace(/\s/g, "");
  info.prov = toHalf(valueAfter(lines, /^申請受付仮番号\s*[（(]/)).replace(/\s/g, "");
  info.appType = valueAfter(lines, /^申請種別\s*[（(]/);

  // 冒頭の「○○様」の行：1行目＝利用者（担当）、2行目＝申請人
  const top: string[] = [];
  for (let i = 0; i < lines.length && i < 8; i++) {
    if (/^申請受付日|^申請人氏名|^申請受付が完了/.test(lines[i])) break;
    if (/様$/.test(lines[i])) top.push(stripSama(lines[i]));
  }
  info.staff = top[0] ?? "";

  if (isPickup) {
    // 受領方法の変更（例：郵送 → 窓口）。状態は変えず、受領方法だけ書き換える
    info.type = "pickup";
    const how = valueAfter(lines, /^変更後の在留カード/).replace(/\s*[A-Za-z].*$/, "").trim();
    const office = valueAfter(lines, /^窓口受取を希望されている場合の受領官署/);
    info.pickup = how + (how === "窓口" && office && !/^■/.test(office) ? `（${office}）` : "");
  } else if (isDone) {
    info.pickup = /郵送による/.test(text) ? "郵送" : "";
    info.type = "examDone";
    info.status = "納付待ち";
    info.applicant = stripSama(valueAfter(lines, /^申請人氏名\s*[（(]/));
    info.expiry = valueAfter(lines, /^申請人在留期限\s*[（(]/);
    info.examDone = true;
  } else {
    info.type = isProv ? "prov" : "recv";
    info.status = "審査中";
    info.applicant = top.length >= 2 ? top[top.length - 1] : "";
  }
  return info;
}

// 表に入れるメール（アプリの mail_notifications の行の必要なところ）
export interface TableMail {
  id: string;
  subject: string;
  body: string;
  receivedAt: string; // ISO
  gmailLink: string;
  isRead: boolean;
  matchedApplicationId: string | null;
  matchedWorkerId: string | null;
}

export interface MailTableRow {
  applicant: string;
  autoStatus: string; // メールから決まった状態
  receipt: string; // 受付番号
  staff: string; // 担当
  card: string; // 在留カード番号
  appType: string; // 申請種別
  acceptDate: string; // 受付日
  prov: string; // 仮番号
  examDoneDate: string; // 審査完了日
  permit: string; // 許可内容
  fee: string; // 手数料
  payDue: string; // 支払期限
  paidDate: string; // 入金日
  expiry: string; // 在留期限
  pickup: string; // 受領方法
  latestMailId: string;
  latestLink: string; // 最新メール
  updatedAt: string; // 更新日時（最新メールの受信日時。ISO）
  statusUpdatedAt: string; // 状態が最後に自動で進んだメールの受信日時（ISO）
  unread: number; // 未読のメールの数
  mailIds: string[];
  applicationId: string | null; // アプリの申請に紐づいていれば
  workerId: string | null;
}

// メモ・状態の手直しを保存するキー（仮番号 → 受付番号 → 在留カード番号の順で、先に分かるもの）
export function mailTableRowKey(r: Pick<MailTableRow, "prov" | "receipt" | "card">): string {
  return r.prov || receiptKey(r.receipt) || r.card;
}
// 手直しを探すときに試すキー（保存したあとで受付番号が届いても見つかるように全部試す）
export function mailTableRowKeys(r: Pick<MailTableRow, "prov" | "receipt" | "card">): string[] {
  return [r.prov, receiptKey(r.receipt), r.card].filter(Boolean);
}

function ymdSlash(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

function emptyRow(): MailTableRow {
  return {
    applicant: "", autoStatus: "", receipt: "", staff: "", card: "", appType: "", acceptDate: "", prov: "",
    examDoneDate: "", permit: "", fee: "", payDue: "", paidDate: "", expiry: "", pickup: "",
    latestMailId: "", latestLink: "", updatedAt: "", statusUpdatedAt: "", unread: 0, mailIds: [],
    applicationId: null, workerId: null,
  };
}

function findRow(rows: MailTableRow[], info: MailInfo): number {
  const key = receiptKey(info.receipt);
  if (key) {
    for (let i = rows.length - 1; i >= 0; i--) if (receiptKey(rows[i].receipt) === key) return i;
  }
  if (info.prov) {
    for (let i = rows.length - 1; i >= 0; i--) if (toHalf(rows[i].prov) === info.prov) return i;
  }
  if (info.card) {
    // 同じ在留カード番号で、受付番号がまだ空か同じもの（別の申請の行は上書きしない）
    for (let i = rows.length - 1; i >= 0; i--) {
      if (toHalf(rows[i].card) !== info.card) continue;
      const rowKey = receiptKey(rows[i].receipt);
      const rowProv = toHalf(rows[i].prov);
      if (info.prov && rowProv && rowProv !== info.prov) continue;
      if (!rowKey || !key || rowKey === key) return i;
    }
  }
  return -1;
}

function applyToRows(rows: MailTableRow[], info: MailInfo, mail: TableMail): void {
  let idx = findRow(rows, info);
  if (idx < 0) {
    rows.push(emptyRow());
    idx = rows.length - 1;
  }
  const row = rows[idx];
  const fill = <K extends keyof MailTableRow>(k: K, v: MailTableRow[K] | undefined | "") => {
    if (v) row[k] = v as MailTableRow[K];
  };
  fill("applicant", info.applicant);
  fill("staff", info.staff ? staffName(info.staff) : "");
  fill("card", info.card);
  fill("appType", info.appType);
  fill("acceptDate", info.acceptDate);
  fill("prov", info.prov);
  fill("permit", info.permit);
  fill("fee", info.fee);
  fill("payDue", info.payDue);
  fill("paidDate", info.paidDate);
  fill("expiry", info.expiry);
  if (info.examDone) fill("examDoneDate", ymdSlash(mail.receivedAt));
  // 受領方法：変更通知は常に上書き。審査完了メールの「郵送」は空欄のときだけ入れる
  if (info.pickup && (info.type === "pickup" || !row.pickup)) row.pickup = info.pickup;
  // 受付番号：官署名つき（福オン…）の表記を優先して残す
  if (info.receipt) {
    const cur = toHalf(row.receipt);
    if (!cur || (/^\d/.test(cur) && !/^\d/.test(info.receipt))) row.receipt = info.receipt;
  }
  if (statusRank(info.status) > statusRank(row.autoStatus)) {
    row.autoStatus = info.status ?? "";
    row.statusUpdatedAt = mail.receivedAt;
  }
  row.latestMailId = mail.id;
  row.latestLink = mail.gmailLink;
  row.updatedAt = mail.receivedAt;
  row.mailIds.push(mail.id);
  if (!mail.isRead) row.unread += 1;
  if (mail.matchedApplicationId) row.applicationId = mail.matchedApplicationId;
  if (mail.matchedWorkerId) row.workerId = mail.matchedWorkerId;
}

// メール（順不同）→ 申請1件＝1行の表（新しく更新された順）
export function buildMailTable(mails: TableMail[]): MailTableRow[] {
  const sorted = [...mails].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const rows: MailTableRow[] = [];
  for (const m of sorted) {
    const info = parseImmigrationMail(m.subject, m.body);
    if (info.type === "skip" || info.type === "other") continue;
    applyToRows(rows, info, m);
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// 手で直した状態・メモ（mail_table_overrides。0222）
export interface MailTableOverride {
  key: string;
  status: string; // 手で選んだ状態（'' は自動のまま）
  memo: string;
  updatedAt: string; // ISO
}

// 表示する状態。手で選んだあとに状態を進めるメールが届いたら、自動のほう（進んだほう）を出す
export function displayStatus(row: Pick<MailTableRow, "autoStatus" | "statusUpdatedAt">, ov: MailTableOverride | null): string {
  if (!ov?.status) return row.autoStatus;
  if (ov.updatedAt >= row.statusUpdatedAt) return ov.status;
  return statusRank(row.autoStatus) > statusRank(ov.status) ? row.autoStatus : ov.status;
}
