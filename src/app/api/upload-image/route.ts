import { NextResponse } from "next/server";
import { uploadImageToDrive } from "@/lib/google/gas-client";

const MAX_BASE64_LENGTH = 8_000_000; // 概ね6MB程度の画像まで許容

// POST /api/upload-image: 画像(base64)をGoogle Driveへ保存し、共有URLを返す
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      filename: string;
      mimeType: string;
      base64Data: string;
      folderName?: string;
    };

    if (!body.filename || !body.mimeType || !body.base64Data) {
      return NextResponse.json(
        { ok: false, error: "filename, mimeType, base64Data is required" },
        { status: 400 }
      );
    }
    if (!body.mimeType.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "画像ファイルのみアップロードできます" },
        { status: 400 }
      );
    }
    if (body.base64Data.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { ok: false, error: "画像サイズが大きすぎます" },
        { status: 400 }
      );
    }

    const result = await uploadImageToDrive(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
