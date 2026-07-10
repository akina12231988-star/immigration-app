// Google Apps Script ウェブアプリ経由でGoogle Sheets/Driveを操作するクライアント。
// サーバーサイド（API Routes）からのみ呼び出すこと。GAS_SECRETはここでのみ扱い、
// クライアントバンドルには絶対に含めない。
import type { Application } from "@/types/application";

function getConfig() {
  const url = process.env.GAS_WEB_APP_URL;
  const secret = process.env.GAS_SECRET;
  if (!url || !secret) {
    throw new Error(
      "GAS_WEB_APP_URL / GAS_SECRET が設定されていません。.env.local を確認してください。"
    );
  }
  return { url, secret };
}

async function callGas<T>(body: Record<string, unknown>): Promise<T> {
  const { url, secret } = getConfig();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...body, secret }),
    // GASは実行に数秒かかることがあるためキャッシュしない
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GAS呼び出しに失敗しました (status ${res.status})`);
  }
  const json = await res.json();
  if (json.ok === false) {
    throw new Error(`GASエラー: ${json.error}`);
  }
  return json as T;
}

// Sheetsから読み取った行データは全て文字列/booleanで返るため、
// Sheetsが自動で日付型に変換してしまった場合に備えて日付部分だけを安全に取り出す。
function normalizeDate(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  return s.includes("T") ? s.split("T")[0] : s;
}

function normalizeApplication(row: Record<string, unknown>): Application {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    applicationDate: normalizeDate(row.applicationDate),
    applicationNumber: String(row.applicationNumber ?? ""),
    applicationContent: (row.applicationContent ?? "") as Application["applicationContent"],
    applicationMethod: (row.applicationMethod || "窓口申請") as Application["applicationMethod"],
    emailLink: row.emailLink ? String(row.emailLink) : undefined,
    emailBody: row.emailBody ? String(row.emailBody) : undefined,
    receiptImageUrl: row.receiptImageUrl ? String(row.receiptImageUrl) : undefined,
    noticeImageUrl: row.noticeImageUrl ? String(row.noticeImageUrl) : undefined,
    residenceCardImageUrl: row.residenceCardImageUrl
      ? String(row.residenceCardImageUrl)
      : undefined,
    approvalDate: row.approvalDate ? normalizeDate(row.approvalDate) : undefined,
    lineReported: Boolean(row.lineReported),
    notionSynced: Boolean(row.notionSynced),
    approved: Boolean(row.approved),
    status: (row.status || "申請前") as Application["status"],
    assignee: String(row.assignee ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
    notionPageId: row.notionPageId ? String(row.notionPageId) : undefined,
  };
}

export async function listApplications(): Promise<Application[]> {
  const data = await callGas<{ applications: Record<string, unknown>[] }>({
    action: "list",
  });
  return data.applications
    .filter((row) => row.id) // 空行を除外
    .map(normalizeApplication);
}

export async function upsertApplication(app: Application): Promise<void> {
  await callGas({ action: "upsert", application: app });
}

export async function deleteApplicationRemote(id: string): Promise<void> {
  await callGas({ action: "delete", id });
}

export async function uploadImageToDrive(params: {
  filename: string;
  mimeType: string;
  base64Data: string;
  folderName?: string;
}): Promise<{ url: string; fileId: string }> {
  return callGas<{ url: string; fileId: string }>({
    action: "uploadImage",
    ...params,
  });
}
