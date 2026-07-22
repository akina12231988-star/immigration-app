import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { fill312, fill34, fill511, type FormFillData } from "@/lib/resignation-forms";

// 参考様式の生成はサーバー側で行う（ブラウザ側でのExcel生成は本番ビルドで
// 正しく動作しないことがあるため。Node環境ではテストで動作を保証している）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMS = {
  form312: {
    template: "sanko-3-1-2.xlsx",
    fill: fill312,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
    label: "参考様式第3-1-2号",
  },
  form34: {
    template: "sanko-3-4.xlsx",
    fill: fill34,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
    label: "参考様式第3-4号",
  },
  form511: {
    template: "sanko-5-11.docx",
    fill: fill511,
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
    label: "参考様式第5-11号",
  },
} as const;

export async function POST(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { form?: string; data?: FormFillData };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const def = FORMS[body.form as keyof typeof FORMS];
  if (!def || !body.data) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  try {
    const buf = await readFile(path.join(process.cwd(), "public", "forms", def.template));
    const template = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const bytes = await def.fill(template, body.data);

    const fileName = `${def.label}_${body.data.workerName || "届出"}.${def.ext}`;
    return new NextResponse(new Blob([bytes as BlobPart]), {
      headers: {
        "content-type": def.mime,
        // 日本語ファイル名は filename*（UTF-8）で渡し、filename はASCIIのフォールバック
        "content-disposition": `attachment; filename="form.${def.ext}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("resignation-forms generation failed:", err);
    return NextResponse.json({ error: "様式の生成に失敗しました" }, { status: 500 });
  }
}
