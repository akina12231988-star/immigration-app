import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { fillFuyoForm, type FuyoFormData } from "@/lib/fuyo-form";
import { todayStr } from "@/lib/ssw/calc";

// 扶養控除等（異動）申告書の生成はサーバー側で行う
// （国税庁の入力用PDFテンプレート＋日本語フォントの埋め込みが必要なため）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { data?: FuyoFormData };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (!body.data?.worker?.name) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  try {
    const [template, font] = await Promise.all([
      readFile(path.join(process.cwd(), "public", "forms", "fuyo-r8.pdf")),
      readFile(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf")),
    ]);
    const bytes = await fillFuyoForm(template, font, body.data, todayStr());

    const fileName = `扶養控除等申告書_${body.data.worker.name}.pdf`;
    return new NextResponse(new Blob([bytes as BlobPart]), {
      headers: {
        "content-type": "application/pdf",
        // 日本語ファイル名は filename*（UTF-8）で渡し、filename はASCIIのフォールバック
        "content-disposition": `attachment; filename="fuyo-form.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("dependents-form generation failed:", err);
    return NextResponse.json({ error: "申告書の生成に失敗しました" }, { status: 500 });
  }
}
