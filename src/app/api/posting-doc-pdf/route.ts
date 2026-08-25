import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getPosting } from "@/lib/supabase/queries/postings";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { buildJikoShinkokuPdf, jikoShinkokuFileName } from "@/lib/jiko-shinkoku";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { normalizePostingSheet } from "@/lib/posting-sheet";

// 求人ごとに作る書類のPDF。いまは「求人不受理に係る自己申告書（様式例第7号）」。
// 事業所名・所在地・代表者名は所属機関の登録内容から、右上の年月日は
// その求人の受付年月日（求人管理簿・様式30と同じ日付）を入れる。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT = () => readFile(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"));
const FORM = () => readFile(path.join(process.cwd(), "public", "forms", "jiko-shinkoku.pdf"));

export async function POST(req: NextRequest) {
  const me = await getMyProfile();
  if (!me || me.role === "viewer") {
    return NextResponse.json({ error: "権限がありません" }, { status: 401 });
  }

  let body: { postingId?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const { postingId, kind } = body;
  if (!postingId || (kind !== undefined && kind !== "自己申告書")) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const posting = await getPosting(supabase, postingId);
    if (!posting) {
      return NextResponse.json({ error: "求人が見つかりません" }, { status: 404 });
    }
    const org = posting.organization_id
      ? await getOrganization(supabase, posting.organization_id).catch(() => null)
      : null;
    const intake = normalizeOrganizationIntake(org?.intake);

    const [form, font] = await Promise.all([FORM(), FONT()]);
    const orgName = org?.name ?? posting.organizations?.name ?? "";
    // 右上の年月日 = 求人票の記入日。
    // 求人票がまだ書かれていないときは、求人の受付年月日・作成日の順に使う
    const sheet = normalizePostingSheet(posting.sheet);
    const dateOn =
      sheet.filled_on || posting.received_on || (posting.created_at ?? "").slice(0, 10);

    const bytes = await buildJikoShinkokuPdf(form, font, {
      orgName,
      orgAddress: org?.address ?? "",
      repName: intake.rep_name ?? "",
      dateOn,
    });

    const fileName = jikoShinkokuFileName(orgName, dateOn);
    return new NextResponse(new Blob([bytes as BlobPart]), {
      headers: {
        "content-type": "application/pdf",
        // 日本語ファイル名は filename*（UTF-8）で渡し、filename はASCIIのフォールバック
        "content-disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("posting-doc-pdf generation failed:", err);
    return NextResponse.json({ error: "書類の作成に失敗しました" }, { status: 500 });
  }
}
