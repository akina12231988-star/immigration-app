import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { normalizeOrgEmploymentStarts } from "@/lib/org-employment";
import { fillKoyoJokyo3 } from "@/lib/koyo-jokyo-forms";
import { koyoFileName } from "@/lib/koyo-jokyo";
import type { Organization } from "@/types/db";

// 外国人雇用状況届出書（様式第3号）を作る。
// 様式の生成はサーバー側で行う（他の届出書と同じ方式）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { workerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (!body.workerId) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const supabase = await createClient();
  const worker = await getWorkerWithHistories(supabase, body.workerId).catch(() => null);
  if (!worker) {
    return NextResponse.json({ error: "外国人が見つかりません" }, { status: 404 });
  }

  let org: Organization | null = null;
  if (worker.current_organization_id) {
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", worker.current_organization_id)
      .maybeSingle();
    org = data as Organization | null;
  }

  // 雇入れ年月日: 所属機関別の雇用開始日を優先し、無ければ雇用開始年月日
  const orgStart = normalizeOrgEmploymentStarts(worker.org_employment_starts).find(
    (e) => e.organization_id === worker.current_organization_id && e.start_on,
  );
  const hiredOn = orgStart?.start_on || worker.employment_start_on || null;

  try {
    const buf = await readFile(path.join(process.cwd(), "public", "forms", "koyo-jokyo-3.docx"));
    const template = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
    const intake = normalizeOrganizationIntake(org?.intake);
    const bytes = await fillKoyoJokyo3(template, {
      workerName: worker.name,
      kana: worker.kana,
      residenceStatus: worker.residence_status,
      field: worker.field,
      residenceExpiryDate: worker.residence_expiry_date,
      birth: worker.birth,
      gender: worker.gender,
      nationality: worker.nationality,
      residenceCardNo: worker.residence_card_no,
      hiredOn,
      officeName: org?.name ?? "",
      officeAddress: org?.address ?? "",
      officeTel: org?.contact ?? "",
      ownerName: intake.rep_name,
    });

    const fileName = `${koyoFileName(worker.name)}.docx`;
    return new NextResponse(new Blob([bytes as BlobPart]), {
      headers: {
        "content-type": MIME,
        // 日本語ファイル名は filename*（UTF-8）で渡し、filename はASCIIのフォールバック
        "content-disposition": `attachment; filename="form.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        // 画面側で保存名に使う（fetch では content-disposition を読めないため）
        "x-file-name": encodeURIComponent(fileName),
        "access-control-expose-headers": "x-file-name",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("koyo-jokyo form generation failed:", err);
    return NextResponse.json({ error: "様式の生成に失敗しました" }, { status: 500 });
  }
}
