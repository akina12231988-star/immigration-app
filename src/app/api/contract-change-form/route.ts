import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getContractChangeForForms } from "@/lib/supabase/queries/contract-changes";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { fill311 } from "@/lib/contract-change-forms";

// 契約内容変更の届出書（参考様式第3-1-1号）を作る。
// 様式の生成はサーバー側で行う（ブラウザ側でのExcel生成は本番ビルドで
// 正しく動作しないことがあるため。退職の様式と同じ方式）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABEL = "参考様式第3-1-1号";
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
  const record = await getContractChangeForForms(supabase, body.id).catch(() => null);
  if (!record || !record.workers) {
    return NextResponse.json({ error: "記録が見つかりません" }, { status: 404 });
  }

  const w = record.workers;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "forms", "sanko-3-1-1.xlsx"));
    const template = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
    const bytes = await fill311(template, {
      workerName: w.name,
      gender: w.gender,
      birth: w.birth,
      nationality: w.nationality,
      residenceCardNo: w.residence_card_no,
      field: w.field,
      businessCategory: record.organizations?.business_category ?? "",
      changedOn: record.changed_on,
      changeItems: record.items ?? [],
      orgCorporateNo: record.organizations?.corporate_no ?? "",
      // 機関の情報は記録した時点のスナップショットを優先し、無ければ機関マスタから
      orgName: record.org_name || (record.organizations?.name ?? ""),
      orgAddress: record.org_address || (record.organizations?.address ?? ""),
      orgPhone: record.org_contact || (record.organizations?.contact ?? ""),
      orgStaff:
        record.org_staff ||
        normalizeOrganizationIntake(record.organizations?.intake).report_staff,
    });

    // いつ届出書を作ったかを残す（一覧に「作成済み」と出す）
    if (!record.forms_downloaded_at && me.role !== "viewer") {
      await supabase
        .from("contract_changes")
        .update({ forms_downloaded_at: new Date().toISOString() })
        .eq("id", record.id);
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
    console.error("contract-change form generation failed:", err);
    return NextResponse.json({ error: "様式の生成に失敗しました" }, { status: 500 });
  }
}
