import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { fillNenkinForm } from "@/lib/nenkin-form";

// 年金事務所あての「【特定技能・本人用】年金加入記録・国民年金保険料納付記録交付申請書」の作成はサーバー側で行う
// （日本年金機構の様式PDF＋日本語フォントの埋め込みが必要なため）。
// 外国人の登録内容（氏名・現在の住所・生年月日・基礎年金番号・個人番号）を書き込んで返す。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 画面から新しいタブで開く（印刷用）: /api/nenkin-form?workerId=...
export async function GET(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const workerId = req.nextUrl.searchParams.get("workerId") ?? "";
  if (!workerId) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workers")
      .select("id, name, kana, address, birth, pension_no, my_number")
      .eq("id", workerId)
      .maybeSingle();
    if (error) throw error;
    const worker = data as {
      id: string;
      name: string;
      kana: string | null;
      address: string | null;
      birth: string | null;
      pension_no: string | null;
      my_number: string | null;
    } | null;
    if (!worker) return NextResponse.json({ error: "外国人が見つかりません" }, { status: 404 });

    const [template, font] = await Promise.all([
      readFile(path.join(process.cwd(), "public", "forms", "nenkin-kiroku.pdf")),
      readFile(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")),
    ]);
    const bytes = await fillNenkinForm(template, font, {
      name: worker.name,
      kana: worker.kana ?? "",
      address: worker.address ?? "",
      birth: worker.birth ?? "",
      pensionNo: worker.pension_no ?? "",
      myNumber: worker.my_number ?? "",
    });

    const fileName = `年金記録交付申請書_${worker.name}.pdf`;
    return new NextResponse(new Blob([bytes as BlobPart]), {
      headers: {
        "content-type": "application/pdf",
        // 日本語ファイル名は filename*（UTF-8）で渡し、filename はASCIIのフォールバック
        "content-disposition": `inline; filename="nenkin-kiroku.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("nenkin-form generation failed:", err);
    return NextResponse.json({ error: "交付申請書の生成に失敗しました" }, { status: 500 });
  }
}
