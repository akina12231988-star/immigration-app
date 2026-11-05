import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { getResignationForForms } from "@/lib/supabase/queries/resignations";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { normalizeOrgEmploymentStarts } from "@/lib/org-employment";
import { fillKoyoJokyo3 } from "@/lib/koyo-jokyo-forms";
import { koyoFileName } from "@/lib/koyo-jokyo";
import type { Organization } from "@/types/db";

// 外国人雇用状況届出書（様式第3号）を作る。
// 様式の生成はサーバー側で行う（他の届出書と同じ方式）。
//   { workerId }      … 雇入れの届出（入社手続き）
//   { resignationId } … 離職の届出（随時報告書の退職記録から。退職元の所属機関・退職日を書く）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { workerId?: string; resignationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (!body.workerId && !body.resignationId) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const supabase = await createClient();

  // 離職の届出: 退職記録から外国人・退職元の所属機関・退職日を引く
  const resignation = body.resignationId
    ? await getResignationForForms(supabase, body.resignationId).catch(() => null)
    : null;
  if (body.resignationId && !resignation) {
    return NextResponse.json({ error: "退職記録が見つかりません" }, { status: 404 });
  }
  const leaving = resignation !== null;

  const workerId = resignation?.worker_id ?? body.workerId ?? "";
  const worker = await getWorkerWithHistories(supabase, workerId).catch(() => null);
  if (!worker) {
    return NextResponse.json({ error: "外国人が見つかりません" }, { status: 404 });
  }

  // 事業所: 離職は退職元の所属機関（退職すると今の所属機関が変わるため）、雇入れは今の所属機関
  const orgId = leaving ? resignation.organization_id : worker.current_organization_id;
  let org: Organization | null = leaving ? resignation.organizations : null;
  if (!org && orgId) {
    const { data } = await supabase.from("organizations").select("*").eq("id", orgId).maybeSingle();
    org = data as Organization | null;
  }

  // 雇入れ年月日: 所属機関別の雇用開始日を優先し、無ければ雇用開始年月日
  const orgStart = normalizeOrgEmploymentStarts(worker.org_employment_starts).find(
    (e) => e.organization_id === orgId && e.start_on,
  );
  const hiredOn = orgStart?.start_on || worker.employment_start_on || null;

  try {
    const templateFile = leaving ? "koyo-jokyo-3-rishoku.docx" : "koyo-jokyo-3.docx";
    const buf = await readFile(path.join(process.cwd(), "public", "forms", templateFile));
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
      leavingOn: resignation?.leaving_on ?? null,
      // 離職は退職記録に残した退職元の名称・住所・電話番号を優先する（所属機関の情報はその後に変わることがある）
      officeName: (leaving && resignation.org_name) || org?.name || "",
      officeAddress: (leaving && resignation.org_address) || org?.address || "",
      officeTel: (leaving && resignation.org_contact) || org?.contact || "",
      ownerName: intake.rep_name,
    });

    const fileName = `${koyoFileName(worker.name, leaving ? "離職" : "雇入れ")}.docx`;
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
