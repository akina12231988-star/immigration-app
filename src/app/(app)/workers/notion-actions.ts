"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { NOTION_FIELD_MAP } from "@/lib/notion-transfer";
import { extractNotionPageId } from "@/lib/notion-link";
import type { Worker } from "@/types/db";

// Notion「ビザの状況」データベースへ外国人情報を直接書き込む（案A: アプリ優先・空欄は保持）。
// - 環境変数 NOTION_API_KEY（インテグレーションのシークレット）と、データベースの共有が前提。
// - notion_link があればそのページを更新、なければ新規ページを作成してURLを保存する。
// - Notion側に実在する「書き込み可能な型」のプロパティにだけ反映（数式・リレーション等は触らない）。

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const DEFAULT_DB_ID = "2f6e20bd-35c2-4f12-b4b7-b5c383c50af9"; // 👮 ビザの状況

interface Err {
  ok: false;
  message: string;
}

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

function notionHeaders(key: string): HeadersInit {
  return {
    Authorization: `Bearer ${key}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

// Notionプロパティ型に応じた書き込み値を組み立てる。対応外の型は null（書き込まない）。
function toNotionProperty(type: string, value: string): Record<string, unknown> | null {
  switch (type) {
    case "title":
      return { title: [{ text: { content: value } }] };
    case "rich_text":
      return { rich_text: [{ text: { content: value } }] };
    case "url":
      return { url: value };
    case "email":
      return { email: value };
    case "phone_number":
      return { phone_number: value };
    case "date":
      return /^\d{4}-\d{2}-\d{2}/.test(value) ? { date: { start: value.slice(0, 10) } } : null;
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? { number: n } : null;
    }
    default:
      return null; // select / status / relation / formula / rollup / files / checkbox など
  }
}

export async function syncWorkerToNotion(
  workerId: string,
): Promise<{ ok: true; url: string; written: string[] } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };

  const key = process.env.NOTION_API_KEY;
  if (!key) {
    return {
      ok: false,
      message:
        "NotionのAPIキーが未設定です（環境変数 NOTION_API_KEY）。管理者にNotion連携の設定を依頼してください。",
    };
  }
  const dbId = process.env.NOTION_VISA_DATABASE_ID || DEFAULT_DB_ID;

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data, error } = await admin.from("workers").select("*").eq("id", workerId).maybeSingle();
  if (error || !data) return { ok: false, message: "外国人が見つかりません" };
  const worker = data as Worker;

  // データベースのスキーマからプロパティ型を取得
  const dbRes = await fetch(`${NOTION_API}/databases/${dbId}`, { headers: notionHeaders(key) });
  if (!dbRes.ok) {
    const t = await dbRes.text().catch(() => "");
    return {
      ok: false,
      message: `Notionデータベースの取得に失敗（${dbRes.status}）。データベースを連携アプリに共有しているか確認してください。${t.slice(0, 200)}`,
    };
  }
  const db = (await dbRes.json()) as { properties?: Record<string, { type: string }> };
  const schema = db.properties ?? {};

  // 案A: アプリに値がある項目のみ、Notionに実在する書き込み可能プロパティへ反映（空欄はNotionを維持）
  const properties: Record<string, unknown> = {};
  const written: string[] = [];
  for (const { prop, get } of NOTION_FIELD_MAP) {
    const value = (get(worker) ?? "").toString().trim();
    if (!value) continue;
    const def = schema[prop];
    if (!def) continue;
    const built = toNotionProperty(def.type, value);
    if (!built) continue;
    properties[prop] = built;
    written.push(prop);
  }

  if (written.length === 0) {
    return {
      ok: false,
      message:
        "Notionに書き込める項目がありませんでした（対象項目が空、またはNotion側に該当プロパティがありません）。",
    };
  }

  // notion_link があれば更新、なければ新規作成
  const pageId = worker.notion_link ? extractNotionPageId(worker.notion_link) : null;
  if (pageId) {
    const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
      method: "PATCH",
      headers: notionHeaders(key),
      body: JSON.stringify({ properties }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, message: `Notionページの更新に失敗（${res.status}）。${t.slice(0, 200)}` };
    }
    const page = (await res.json()) as { url?: string };
    return { ok: true, url: page.url ?? worker.notion_link, written };
  }

  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: notionHeaders(key),
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, message: `Notionページの作成に失敗（${res.status}）。${t.slice(0, 200)}` };
  }
  const page = (await res.json()) as { url?: string };
  const url = page.url ?? "";
  if (url) await admin.from("workers").update({ notion_link: url }).eq("id", workerId);
  return { ok: true, url, written };
}
