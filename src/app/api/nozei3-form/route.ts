import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getTaxOffice } from "@/lib/supabase/queries/tax-office";
import { DEFAULT_NOZEI3_AGENT, fillNozei3Form } from "@/lib/nozei3-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayStr } from "@/lib/application-alerts";
import {
  NOZEI3_REF_FORM_KEY,
  REF_FORM_SAMPLE_DATA,
  fillRefForm,
  normalizeRefFormLayout,
  type RefFormData,
} from "@/lib/ref-form";

// 納税証明書交付請求書（納税証明書その3）の作成はサーバー側で行う
// （国税庁の様式PDF＋日本語フォントの埋め込みが必要なため）。
// 外国人の登録内容（氏名・フリガナ・現在の住所・個人番号）と投函先の税務署名を書き込んで返す。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Agent {
  address: string;
  name: string;
}

async function build(workerId: string, taxOfficeId: string, agent: Agent, disposition: "inline" | "attachment") {
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

  const font = await readFile(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"));
  // 「ひな形・記入位置」で登録したひな形（全員共通・日本語）があり、記入位置を置いてあれば、それで作る
  const own = await registeredTemplate(supabase);
  const bytes = own
    ? await (
        await fillRefForm(own.pdf, font, own.layout, {
          ...REF_FORM_SAMPLE_DATA,
          person: {
            ...REF_FORM_SAMPLE_DATA.person,
            name: worker.name,
            kana: worker.kana ?? "",
            address: worker.address ?? "",
            birth: null,
            gender: "",
            nationality: "",
            postalCode: "",
            cardNo: "",
            passportNo: "",
          },
          org: { name: "", postalCode: "", address: "", tel: "", rep: "", repKana: "", corporateNo: "" },
          so: { name: "", regNo: "", address: "", tel: "", rep: "", manager: "", staff: "" },
          today: todayStr(),
          planDates: {},
          wage: null,
          wage6: {},
          p117: {},
          myNumber: worker.my_number ?? "",
          taxOfficeName: office?.name ?? "",
          agent: { name: agent.name, address: agent.address },
        } satisfies RefFormData)
      ).save()
    : await fillNozei3Form(await readFile(path.join(process.cwd(), "public", "forms", "nozei-shomei-3.pdf")), font, {
    name: worker.name,
    kana: worker.kana ?? "",
    address: worker.address ?? "",
    myNumber: worker.my_number ?? "",
    taxOfficeName: office?.name ?? "",
    agentAddress: agent.address,
    agentName: agent.name,
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

// 画面から新しいタブで開く（印刷用）: /api/nozei3-form?workerId=...&taxOfficeId=...&agentAddress=...&agentName=...
// 代理人の指定が無いとき（agentAddress・agentName のどちらも無い）はテンプレートの代理人を入れる
export async function GET(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const workerId = req.nextUrl.searchParams.get("workerId") ?? "";
  const taxOfficeId = req.nextUrl.searchParams.get("taxOfficeId") ?? "";
  if (!workerId) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  try {
    const sp = req.nextUrl.searchParams;
    const agent =
      sp.has("agentAddress") || sp.has("agentName")
        ? { address: sp.get("agentAddress") ?? "", name: sp.get("agentName") ?? "" }
        : { ...DEFAULT_NOZEI3_AGENT };
    return await build(workerId, taxOfficeId, agent, "inline");
  } catch (err) {
    console.error("nozei3-form generation failed:", err);
    return NextResponse.json({ error: "請求書の生成に失敗しました" }, { status: 500 });
  }
}

// 添付データとして保存するとき（ダウンロード）
export async function POST(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  let body: { workerId?: string; taxOfficeId?: string; agentAddress?: string; agentName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (!body.workerId) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  try {
    const agent =
      body.agentAddress !== undefined || body.agentName !== undefined
        ? { address: body.agentAddress ?? "", name: body.agentName ?? "" }
        : { ...DEFAULT_NOZEI3_AGENT };
    return await build(body.workerId, body.taxOfficeId ?? "", agent, "attachment");
  } catch (err) {
    console.error("nozei3-form generation failed:", err);
    return NextResponse.json({ error: "請求書の生成に失敗しました" }, { status: 500 });
  }
}

// 登録したひな形（参考様式と同じ ref_form_templates。form_key = nozei3・全員共通・日本語）。
// 記入位置がまだ空なら、これまでのアプリに入っている様式で作る
async function registeredTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ pdf: Uint8Array; layout: ReturnType<typeof normalizeRefFormLayout> } | null> {
  try {
    const { data } = await supabase
      .from("ref_form_templates")
      .select("pdf_path, layout, organization_id, language")
      .eq("form_key", NOZEI3_REF_FORM_KEY);
    const rows = (data as { pdf_path: string; layout: unknown; organization_id?: string | null; language: string }[] | null) ?? [];
    const t = rows.find((r) => !r.organization_id && r.language === "日本語") ?? rows.find((r) => !r.organization_id) ?? null;
    if (!t) return null;
    const layout = normalizeRefFormLayout(t.layout);
    if (layout.length === 0) return null;
    const admin = createAdminClient();
    if (!admin) return null;
    const { data: blob } = await admin.storage.from("app-files").download(t.pdf_path);
    if (!blob) return null;
    return { pdf: new Uint8Array(await blob.arrayBuffer()), layout };
  } catch {
    return null;
  }
}
