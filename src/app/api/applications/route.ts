import { NextResponse } from "next/server";
import {
  listApplications,
  upsertApplication,
} from "@/lib/google/gas-client";
import type { Application } from "@/types/application";

// GET /api/applications: Google Sheetsから全申請を取得
export async function GET() {
  try {
    const applications = await listApplications();
    return NextResponse.json({ ok: true, applications });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

// POST /api/applications: 新規登録・更新（UPSERT）
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { application: Application };
    if (!body.application?.id) {
      return NextResponse.json(
        { ok: false, error: "application.id is required" },
        { status: 400 }
      );
    }
    await upsertApplication(body.application);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
