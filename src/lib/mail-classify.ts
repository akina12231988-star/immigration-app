import type { MailCategory } from "@/types/db";

// 入管メールの件名・本文からカテゴリ（許可 / 申請受付 / その他）を判定する。
// 判定順が重要: 「不許可」は結果通知だが許可ではないので先に除外する。
export function classifyMailCategory(subject: string, body: string): MailCategory {
  const text = `${subject}\n${body}`;
  if (/不許可|不交付/.test(text)) return "その他";
  if (/許可|交付|認定証明書/.test(text)) return "許可";
  if (/受付|受け付け|受理|申請番号/.test(text)) return "申請受付";
  return "その他";
}

// 氏名マッチ用の正規化: 空白（全角/半角）を除去し小文字化する。
export function normalizeForMatch(s: string): string {
  return s.replace(/[\s　]+/g, "").toLowerCase();
}

export interface WorkerNameCandidate {
  id: string;
  name: string;
  kana?: string | null;
}

// メール文面（件名＋本文）に含まれる外国人を推定する。
// 誤検出を減らすため、正規化後の氏名（またはフリガナ）が最も長く一致する候補を返す。
export function matchWorker(
  text: string,
  workers: WorkerNameCandidate[],
): WorkerNameCandidate | null {
  const haystack = normalizeForMatch(text);
  let best: WorkerNameCandidate | null = null;
  let bestLen = 0;
  for (const w of workers) {
    const name = normalizeForMatch(w.name);
    const kana = w.kana ? normalizeForMatch(w.kana) : "";
    // 2文字以下の氏名は誤検出しやすいので対象外
    const hitName = name.length >= 3 && haystack.includes(name);
    const hitKana = kana.length >= 3 && haystack.includes(kana);
    if (!hitName && !hitKana) continue;
    const len = hitName ? name.length : kana.length;
    if (len > bestLen) {
      best = w;
      bestLen = len;
    }
  }
  return best;
}

export interface ApplicationCandidate {
  id: string;
  workerId: string | null;
  name: string;
  status: string;
  applicationDate: string;
}

// 進行外の終端ステータス（紐づけ候補として優先度を下げる）
const CLOSED_STATUSES = new Set(["取下げ", "在留カード受領"]);

// 紐づいた外国人の申請から、最も関連の高いものを選ぶ。
// 進行中の申請を優先し、その中で申請日が新しいものを選ぶ。
export function pickApplicationForWorker(
  workerId: string,
  applications: ApplicationCandidate[],
): string | null {
  const mine = applications.filter((a) => a.workerId === workerId);
  if (mine.length === 0) return null;
  const sorted = [...mine].sort((a, b) => {
    const aClosed = CLOSED_STATUSES.has(a.status) ? 1 : 0;
    const bClosed = CLOSED_STATUSES.has(b.status) ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed; // 進行中を先に
    return b.applicationDate.localeCompare(a.applicationDate); // 新しい順
  });
  return sorted[0].id;
}

export interface MatchResult {
  workerId: string | null;
  workerName: string | null;
  applicationId: string | null;
  matchedName: string;
}

// 件名・本文から外国人と申請を推定する（自動紐づけの本体）。
export function matchNotification(
  subject: string,
  body: string,
  workers: WorkerNameCandidate[],
  applications: ApplicationCandidate[],
): MatchResult {
  const text = `${subject}\n${body}`;
  const worker = matchWorker(text, workers);
  if (!worker) {
    // 外国人が未登録の申請（氏名だけ一致）も拾う
    const app = applications.find((a) => {
      const n = normalizeForMatch(a.name);
      return n.length >= 3 && normalizeForMatch(text).includes(n);
    });
    return {
      workerId: null,
      workerName: null,
      applicationId: app?.id ?? null,
      matchedName: app?.name ?? "",
    };
  }
  return {
    workerId: worker.id,
    workerName: worker.name,
    applicationId: pickApplicationForWorker(worker.id, applications),
    matchedName: worker.name,
  };
}
