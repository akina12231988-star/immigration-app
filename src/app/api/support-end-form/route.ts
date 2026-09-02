import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getSupportEndForForms } from "@/lib/supabase/queries/support-end";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { fill332 } from "@/lib/support-end-forms";
import { statusAfterFormDownload } from "@/lib/adhoc-report-progress";

// 支援委託終了の届出書（参考様式第3-3-2号）を作る。
// 様式の生成はサーバー側で行う（他の届出書と同じ方式）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABEL = "参考様式第3-3-2号";
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function POST(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const supabase = await createClient();
  const record = await getSupportEndForForms(supabase, body.id).catch(() => null);
  if (!record || !record.workers) {
    return NextResponse.json({ error: "記録が見つかりません" }, { status: 404 });
  }

  const w = record.workers;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "forms", "sanko-3-3-2.xlsx"));
    const template = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
    const bytes = await fill332(template, {
      workerName: w.name,
      gender: w.gender,
      birth: w.birth,
      nationality: w.nationality,
      // ①欄は特定技能1号のときの内容。記録したスナップショットを使い、
      // 空なら今の外国人情報・機関情報で補う
      residenceCardNo: record.card_no || w.residence_card_no,
      field: record.field || w.field,
      businessCategory:
        record.business_category || (record.organizations?.business_category ?? ""),
      endedOn: record.ended_on,
      majorReason: record.major_reason,
      minorReason: record.minor_reason,
      otherReason: record.other_reason,
      orgCorporateNo: record.organizations?.corporate_no ?? "",
      orgName: record.org_name || (record.organizations?.name ?? ""),
      orgAddress: record.org_address || (record.organizations?.address ?? ""),
      orgPhone: record.org_contact || (record.organizations?.contact ?? ""),
      orgStaff:
        record.org_staff ||
        normalizeOrganizationIntake(record.organizations?.intake).report_staff,
    });

    // 届出書を作ったら「署名依頼中」へ進める（他の随時報告書と同じ運用）
    if (me.role !== "viewer") {
      if (!record.forms_downloaded_at) {
        await supabase
          .from("support_end_records")
          .update({ forms_downloaded_at: new Date().toISOString() })
          .eq("id", record.id);
      }
      const nextStatus = statusAfterFormDownload(record);
      if (nextStatus) {
        await supabase
          .from("support_end_records")
          .update({ status: nextStatus })
          .eq("id", record.id);
      }
    }

    const fileName = `${LABEL}_${w.name || "届出"}.xlsx`;
    return new NextResponse(new Blob([bytes as BlobPart]), {
      headers: {
        "content-type": MIME,
        // 日本語ファイル名は filename*（UTF-8）で渡し、filename はASCIIのフォールバック
        "content-disposition": `attachment; filename="form.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("support-end form generation failed:", err);
    return NextResponse.json({ error: "様式の生成に失敗しました" }, { status: 500 });
  }
}
