// 入社書類メール: 書類定義とメール本文の組み立て（純粋ロジック）
// 旧スタンドアロンHTMLツール「入社書類メール生成ツール」の生成規則を踏襲する。

import type { OnboardingDocStatus } from "@/types/db";

export interface OnboardingDocDef {
  key: string;
  label: string;
  num: number; // メール本文の番号
}

// 令和年（例: 2026年 → 令和8年）
export function reiwaYear(today: string): number {
  const y = Number(today.slice(0, 4));
  return Number.isNaN(y) ? 0 : y - 2018;
}

// 書類一覧。源泉徴収票のラベルは作成日の令和年で変わる
export function onboardingDocDefs(today: string): OnboardingDocDef[] {
  const defs = [
    { key: "zairyu", label: "在留カード" },
    { key: "shiteisho", label: "指定書" },
    { key: "shinsei", label: "申請書類一式（雇用契約書・雇用条件書含む）" },
    { key: "mynumber", label: "マイナンバー" },
    { key: "tsuchou", label: "通帳の見開き" },
    { key: "fuyo", label: "扶養証明書（日本語翻訳）" },
    { key: "fuyokojo", label: "扶養控除等申告書" },
    { key: "meibo", label: "労働者名簿" },
    { key: "rirekisho", label: "履歴書" },
    { key: "gensen", label: `令和${reiwaYear(today)}年分源泉徴収票` },
    { key: "furigana", label: "フリガナがわかる書類（前職の社保など）" },
  ];
  return defs.map((d, i) => ({ ...d, num: i + 1 }));
}

// 外国人詳細ページの「入社書類」で保存・差し替え・削除を管理する書類キー。
// 申請書類一式（shinsei）・労働者名簿（meibo）はこの画面では扱わない。
// 源泉徴収票（gensen）は令和年ごとに蓄積するため専用セクションで管理する。
export const WORKER_DETAIL_DOC_KEYS = [
  "zairyu",
  "shiteisho",
  "mynumber",
  "tsuchou",
  "fuyo",
  "fuyokojo",
  "rirekisho",
  "furigana",
] as const;

// 登録済みの worker_documents（在留カード・指定書）から複製して紐付けられる書類キー。
export const LINKABLE_DOC_KINDS: Record<string, "在留カード" | "指定書"> = {
  zairyu: "在留カード",
  shiteisho: "指定書",
};

// 書類の横に表示する参考リンク（国税庁の様式ページなど）。
export const DOC_REFERENCE_LINKS: Record<string, string> = {
  fuyokojo: "https://www.nta.go.jp/users/gensen/nencho/shinkokusyo/index.htm",
};

// 健康診断（入社書類メールには添付しないが外国人詳細で保存する）
export const HEALTH_CHECK_DOC_KEY = "kenshin";
export const HEALTH_CHECK_LABEL = "健康診断";

// 外国人の書類（PDF・画像）。入社書類メールとは別に、外国人の情報として保管する。
export const WORKER_CERT_DOCS = [
  { key: "cert_senmonkyu", label: "専門級の合格証" },
  { key: "cert_passport", label: "パスポート" },
  { key: "cert_nihongo", label: "日本語の合格証" },
  { key: "cert_senmongai", label: "専門外の合格証" },
  { key: "cert_rirekisho", label: "履歴書" },
  { key: "cert_zairyu", label: "在留カード（申請書類準備時・両面）" },
] as const;
export function isWorkerCertKey(key: string): boolean {
  return /^cert_[a-z0-9_]+$/.test(key);
}

// 源泉徴収票の令和年ごとのキー・表示名（例: 令和8年分 → gensen_r8 / 令和8年分源泉徴収票）
export function gensenDocKey(reiwa: number): string {
  return `gensen_r${reiwa}`;
}
export function gensenLabel(reiwa: number): string {
  return `令和${reiwa}年分源泉徴収票`;
}
export function isGensenYearKey(key: string): boolean {
  return /^gensen_r\d+$/.test(key);
}
// gensen_r8 → 8（令和年）。取れなければ null
export function gensenReiwaFromKey(key: string): number | null {
  const m = /^gensen_r(\d+)$/.exec(key);
  return m ? Number(m[1]) : null;
}

// YYYY-MM-DD → YYYY/MM/DD（未入力は全角スペースで空欄を表す）
export function formatDateSlash(dateStr: string | null): string {
  if (!dateStr) return "　　　　";
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "　　　　";
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}/${mm}/${dd}`;
}

export interface OnboardingMailDoc {
  num: number;
  label: string;
  status: OnboardingDocStatus;
  note: string;
}

export interface OnboardingMailInput {
  workerName: string;
  orgName: string;
  honorific: "御中" | "様";
  employmentStartOn: string | null; // YYYY-MM-DD
  office: string;
  residence: string;
  sender: string;
  extraNote: string;
  docs: OnboardingMailDoc[];
}

// メール本文の組み立て（添付資料 / 後送予定 / 未入手 の3区分・対象外は載せない）
export function buildOnboardingMail(input: OnboardingMailInput): string {
  const name = input.workerName.trim() || "（氏名未入力）";
  const sections: [string, OnboardingDocStatus][] = [
    ["【添付資料】", "添付"],
    ["【後送予定】", "後送"],
    ["【未入手】", "未入手"],
  ];

  let body = "";
  if (input.orgName.trim()) body += `${input.orgName.trim()} ${input.honorific}\n\n`;
  body += `お世話になっております。\n\n${name}さんの下記の該当する資料を添付いたします。\n\n`;
  body += `雇用開始年月日：${formatDateSlash(input.employmentStartOn)}\n`;
  body += `配属先の営業所：${input.office.trim() || "（未入力）"}\n`;
  body += `居住地：${input.residence.trim() || "（未入力）"}\n\n`;

  for (const [heading, status] of sections) {
    const items = input.docs.filter((d) => d.status === status);
    if (items.length === 0) continue;
    body += `${heading}\n`;
    for (const item of items) {
      body += `${item.num}. ${item.label}`;
      if (item.note.trim()) body += `→${item.note.trim()}`;
      body += "\n";
    }
    body += "\n";
  }

  if (input.extraNote.trim()) body += `${input.extraNote.trim()}\n\n`;
  body += `ご確認のほどよろしくお願いします。\n\n${input.sender.trim()}`;
  return body;
}

// ダウンロード名の共通部分: 「外国人の氏名＋添付データ名」（拡張子なし）。
// 括弧内の補足とファイル名に使えない文字を除いて短くする。
export function onboardingDownloadBaseName(workerName: string, label: string): string {
  const cleanLabel = label.replace(/[（(].*?[）)]/g, "").trim();
  return `${workerName.trim()}_${cleanLabel}`.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
}

// ダウンロード時のファイル名: 「外国人の氏名＋添付データ名」＋元ファイルの拡張子
export function onboardingDownloadName(
  workerName: string,
  label: string,
  fileName: string,
): string {
  const rawExt = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? `.${rawExt.toLowerCase()}` : "";
  return `${onboardingDownloadBaseName(workerName, label)}${ext}`;
}

// PDF化してダウンロードするときのファイル名: 「外国人の氏名＋添付データ名.pdf」
export function onboardingPdfName(workerName: string, label: string): string {
  return `${onboardingDownloadBaseName(workerName, label)}.pdf`;
}

// 後送アラート対象: 後送のまま本人からまだ届いていない書類
export function isPendingDocAlert(doc: {
  status: OnboardingDocStatus;
  received_on: string | null;
}): boolean {
  return doc.status === "後送" && !doc.received_on;
}

// 期日超過か（期日未設定は超過扱いにしない）
export function isPendingDocOverdue(dueOn: string | null, today: string): boolean {
  return !!dueOn && today > dueOn;
}
