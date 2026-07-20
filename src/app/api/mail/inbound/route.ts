import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyMailCategory,
  matchNotification,
  type ApplicationCandidate,
  type WorkerNameCandidate,
} from "@/lib/mail-classify";

export const dynamic = "force-dynamic";

// Google Apps Script から入管メールを受け取るWebhook。
// 認証は共有シークレット（MAIL_INBOUND_SECRET）で行う。
// service_role クライアントで mail_notifications に登録し、氏名で自動紐づけする。

interface InboundMessage {
  id?: string; // Gmailメッセージの内部ID（重複防止のキー）
  subject?: string;
  from?: string;
  snippet?: string;
  body?: string;
  receivedAt?: string; // ISO文字列（省略時はサーバー時刻）
  link?: string; // Gmailで開くリンク
}

function extractSecret(req: NextRequest): string | null {
  const header = req.headers.get("x-webhook-secret");
  if (header) return header;
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function POST(req: NextRequest) {
  const expected = process.env.MAIL_INBOUND_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "MAIL_INBOUND_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (extractSecret(req) !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // 単発 or バッチ（{ messages: [...] }）の両方を受け付ける
  const messages: InboundMessage[] = Array.isArray(payload)
    ? (payload as InboundMessage[])
    : Array.isArray((payload as { messages?: unknown }).messages)
      ? ((payload as { messages: InboundMessage[] }).messages)
      : [payload as InboundMessage];

  if (messages.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: 0 });
  }

  // 自動紐づけ用に外国人・申請の一覧を取得
  const [{ data: workerRows }, { data: appRows }] = await Promise.all([
    admin.from("workers").select("id, name, kana"),
    admin
      .from("immigration_applications")
      .select("id, worker_id, name, status, application_date"),
  ]);

  const workers: WorkerNameCandidate[] = (workerRows ?? []).map((w) => ({
    id: w.id as string,
    name: (w.name as string) ?? "",
    kana: (w.kana as string) ?? "",
  }));
  const applications: ApplicationCandidate[] = (appRows ?? []).map((a) => ({
    id: a.id as string,
    workerId: (a.worker_id as string | null) ?? null,
    name: (a.name as string) ?? "",
    status: (a.status as string) ?? "",
    applicationDate: (a.application_date as string) ?? "",
  }));

  const rows = messages
    .filter((m) => m.subject || m.body || m.snippet)
    .map((m) => {
      const subject = m.subject ?? "";
      const body = m.body ?? m.snippet ?? "";
      const match = matchNotification(subject, body, workers, applications);
      return {
        gmail_message_id: m.id ?? null,
        category: classifyMailCategory(subject, body),
        subject,
        from_address: m.from ?? "",
        snippet: m.snippet ?? "",
        body: body.slice(0, 4000),
        received_at: m.receivedAt ?? new Date().toISOString(),
        gmail_link: m.link ?? "",
        matched_worker_id: match.workerId,
        matched_application_id: match.applicationId,
        matched_name: match.matchedName,
        is_read: false,
      };
    });

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: 0 });
  }

  // gmail_message_id で重複を無視（既に取り込んだメールはスキップ）
  const { data, error } = await admin
    .from("mail_notifications")
    .upsert(rows, { onConflict: "gmail_message_id", ignoreDuplicates: true })
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const inserted = data?.length ?? 0;
  return NextResponse.json({
    inserted,
    skipped: rows.length - inserted,
  });
}
