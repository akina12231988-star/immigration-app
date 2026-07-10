import { NextResponse } from "next/server";
import { deleteApplicationRemote } from "@/lib/google/gas-client";

// DELETE /api/applications/[id]: Google Sheetsから該当行を削除
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteApplicationRemote(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
