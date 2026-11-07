import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWorkerAddresses } from "@/lib/supabase/queries/worker-addresses";
import { addressOnDate, type WorkerAddress } from "@/lib/worker-address";
import { fillMunicipalForm, normalizeMunicipalFormLayout, type MunicipalFormPerson } from "@/lib/municipal-form";
import { todayStr } from "@/lib/application-alerts";

// 自治体の申請書（課税・納税証明書の交付請求書）PDFに、外国人の情報を記入位置どおりに書き込んで返す。
// /api/municipal-cert-form?municipalityId=...&workerId=...&fiscalYear=2026[&download=1]
// workerId が無い（sample=1）ときは見本の人で書き込む（記入位置の確認用）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE: MunicipalFormPerson = {
  name: "NGUYEN VAN A",
  kana: "グエン ヴァン ア",
  birth: "1995-03-08",
  nationality: "ベトナム",
  postalCode: "8660021",
  address: "熊本県八代市郡築四番町102-7 サンプルハイツ101",
  yearAddress: "熊本県八代市本町1-1-1",
  fiscalYear: 2026,
  today: "",
};

export async function GET(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const municipalityId = sp.get("municipalityId") ?? "";
  const workerId = sp.get("workerId") ?? "";
  const fiscalYear = Number(sp.get("fiscalYear") ?? "") || null;
  const sample = sp.get("sample") === "1";
  if (!municipalityId || (!workerId && !sample)) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });

  try {
    const supabase = await createClient();
    const { data: m, error: mErr } = await supabase
      .from("municipalities")
      .select("name, cert_form_pdf_path, cert_form_layout")
      .eq("id", municipalityId)
      .maybeSingle();
    if (mErr) throw mErr;
    const muni = m as { name: string; cert_form_pdf_path: string; cert_form_layout: unknown } | null;
    if (!muni?.cert_form_pdf_path) return NextResponse.json({ error: "申請書のPDFが登録されていません" }, { status: 404 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "サーバー設定エラー" }, { status: 500 });
    const { data: blob, error: dlErr } = await admin.storage.from("app-files").download(muni.cert_form_pdf_path);
    if (dlErr || !blob) throw dlErr ?? new Error("PDFを読めませんでした");

    const today = todayStr();
    let person: MunicipalFormPerson;
    let fileLabel = "見本";
    if (sample) {
      person = { ...SAMPLE, today, fiscalYear: fiscalYear ?? SAMPLE.fiscalYear };
    } else {
      const { data: w, error: wErr } = await supabase.from("workers").select("*").eq("id", workerId).maybeSingle();
      if (wErr) throw wErr;
      const worker = w as {
        name: string;
        kana: string | null;
        birth: string | null;
        nationality: string | null;
        postal_code?: string | null;
        address: string | null;
      } | null;
      if (!worker) return NextResponse.json({ error: "外国人が見つかりません" }, { status: 404 });
      const addrs = await listWorkerAddresses(supabase, workerId).catch(() => [] as WorkerAddress[]);
      const hit = fiscalYear ? addressOnDate(addrs, `${fiscalYear}-01-01`) : null;
      person = {
        name: worker.name,
        kana: worker.kana ?? "",
        birth: worker.birth,
        nationality: worker.nationality ?? "",
        postalCode: worker.postal_code ?? "",
        address: worker.address ?? "",
        yearAddress: hit?.address ?? "",
        fiscalYear,
        today,
      };
      fileLabel = worker.name;
    }

    const font = await readFile(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"));
    const bytes = await fillMunicipalForm(
      new Uint8Array(await blob.arrayBuffer()),
      font,
      normalizeMunicipalFormLayout(muni.cert_form_layout),
      person,
    );
    const fileName = `課税証明書申請書_${muni.name}_${fileLabel}.pdf`;
    const disposition = sp.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(new Blob([bytes as BlobPart]), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${disposition}; filename="cert-form.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("municipal-cert-form failed:", err);
    return NextResponse.json({ error: "申請書の作成に失敗しました（PDFが読めない形式の可能性があります）" }, { status: 500 });
  }
}
