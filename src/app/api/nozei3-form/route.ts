import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getTaxOffice } from "@/lib/supabase/queries/tax-office";
import { fillNozei3Form } from "@/lib/nozei3-form";

// 納税証明書交付請求書（納税証明書その3）の作成はサーバー側で行う
// （国税庁の様式PDF＋日本語フォントの埋め込みが必要なため）。
// 外国人の登録内容（氏名・フリガナ・現在の住所・個人番号）と投函先の税務署名を書き込んで返す。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function build(workerId: string, taxOfficeId: string, disposition: "inline" | "attachment") {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workers")
    .select("id, name, kana, address, my_number")
    .eq("id", workerId)
    .maybeSingle();
  if (error) throw error;
  const worker = data as { id: string; name: string; kana: string | null; address: string | null; my_number: string | null } | null;
  if (!worker) return NextResponse.json({ error: "外国人が見つかりません" }, { status: 404 });

  const office = taxOfficeId ? await getTaxOffice(supabase, taxOfficeId).catch(() => null) : null;

  const [template, font] = await Promise.all([
    readFile(path.join(process.cwd(), "public", "forms", "nozei-shomei-3.pdf")),
    readFile(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")),
  ]);
  const bytes = await fillNozei3Form(template, font, {
    name: worker.name,
    kana: worker.kana ?? "",
    address: worker.address ?? "",
    myNumber: worker.my_number ?? "",
    taxOfficeName: office?.name ?? "",
  });

  const fileName = `納税証明書交付請求書_${worker.name}.pdf`;
  return new NextResponse(new Blob([bytes as BlobPart]), {
    headers: {
      "content-type": "application/pdf",
      // 日本語ファイル名は filename*（UTF-8）で渡し、filename はASCIIのフォールバック
      "content-disposition": `${disposition}; filename="nozei-shomei-3.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "no-store",
    },
  });
}

// 画面から新しいタブで開く（印刷用）: /api/nozei3-form?workerId=...&taxOfficeId=...
export async function GET(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const workerId = req.nextUrl.searchParams.get("workerId") ?? "";
  const taxOfficeId = req.nextUrl.searchParams.get("taxOfficeId") ?? "";
  if (!workerId) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  try {
    return await build(workerId, taxOfficeId, "inline");
  } catch (err) {
    console.error("nozei3-form generation failed:", err);
    return NextResponse.json({ error: "請求書の生成に失敗しました" }, { status: 500 });
  }
}

// 添付データとして保存するとき（ダウンロード）
export async function POST(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  let body: { workerId?: string; taxOfficeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (!body.workerId) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  try {
    return await build(body.workerId, body.taxOfficeId ?? "", "attachment");
  } catch (err) {
    console.error("nozei3-form generation failed:", err);
    return NextResponse.json({ error: "請求書の生成に失敗しました" }, { status: 500 });
  }
}
