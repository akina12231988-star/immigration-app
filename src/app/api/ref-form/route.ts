import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { CUSTODIAN_SETTING_KEY, mergeCustodianInfo } from "@/lib/custody";
import { todayStr } from "@/lib/application-alerts";
import { annualHolidays } from "@/lib/job-conditions";
import {
  REF_FORM_ITEMS,
  REF_FORM_SAMPLE_DATA,
  fillRefForm,
  mergeRefForms,
  normalizeRefFormLayout,
  normalizeSignPages,
  parseRefFormMode,
  pickRefFormTemplate,
  refFormFileName,
  refFormPagesFor,
  type RefFormData,
  type RefFormTemplate,
} from "@/lib/ref-form";

// 参考様式のPDFを作って返す（申請書類作成をアプリ一本化計画・試験中）。
//   /api/ref-form?workerId=...&keys=t1-4-1,t1-5&mode=one|all|sign[&download=1]
//     keys は提出書類一覧表の順に並べて渡す。様式ごとに本人の国籍に合う言語のひな形を選ぶ
//   /api/ref-form?templateId=...&sample=1 … そのひな形に見本の人で書き込む（記入位置の確認用）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const mode = parseRefFormMode(sp.get("mode"));
  const sample = sp.get("sample") === "1";
  const templateId = sp.get("templateId") ?? "";
  const workerId = sp.get("workerId") ?? "";
  const keys = (sp.get("keys") ?? "").split(",").filter((k) => REF_FORM_ITEMS.some((i) => i.key === k));
  if (sample ? !templateId : !workerId || keys.length === 0) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "サーバー設定エラー" }, { status: 500 });
    const { data: tData, error: tErr } = await supabase.from("ref_form_templates").select("*");
    if (tErr) throw tErr;
    const templates = ((tData as RefFormTemplate[] | null) ?? []).map((t) => ({ ...t, sign_pages: normalizeSignPages(t.sign_pages) }));

    let data: RefFormData;
    let targets: RefFormTemplate[];
    let workerName = "見本";
    if (sample) {
      const t = templates.find((x) => x.id === templateId);
      if (!t) return NextResponse.json({ error: "ひな形が見つかりません" }, { status: 404 });
      data = { ...REF_FORM_SAMPLE_DATA, today: todayStr() };
      targets = [t];
    } else {
      const { data: w, error: wErr } = await supabase.from("workers").select("*").eq("id", workerId).maybeSingle();
      if (wErr) throw wErr;
      const worker = w as Record<string, unknown> | null;
      if (!worker) return NextResponse.json({ error: "外国人が見つかりません" }, { status: 404 });
      const s = (k: string) => (typeof worker[k] === "string" ? (worker[k] as string) : "");
      workerName = s("name");
      const orgId = s("application_prep_organization_id") || s("current_organization_id");
      let org: Record<string, unknown> = {};
      if (orgId) {
        const { data: o } = await supabase
          .from("organizations")
          .select("name, address, postal_code, contact, corporate_no, intake")
          .eq("id", orgId)
          .maybeSingle();
        org = (o as Record<string, unknown> | null) ?? {};
      }
      const intake = (org.intake && typeof org.intake === "object" ? org.intake : {}) as Record<string, unknown>;
      const os = (v: unknown) => (typeof v === "string" ? v : "");
      const { data: so } = await supabase.from("app_settings").select("value").eq("key", CUSTODIAN_SETTING_KEY).maybeSingle();
      const c = mergeCustodianInfo((so as { value: Record<string, unknown> } | null)?.value ?? null);
      data = {
        person: {
          name: s("name"),
          kana: s("kana"),
          birth: s("birth") || null,
          gender: s("gender"),
          nationality: s("nationality"),
          postalCode: s("postal_code"),
          address: s("address"),
          cardNo: s("residence_card_no"),
          passportNo: s("passport_no"),
        },
        org: {
          name: os(org.name),
          postalCode: os(org.postal_code),
          address: os(org.address),
          tel: os(org.contact),
          rep: os(intake.rep_name),
          repKana: os(intake.rep_kana),
          corporateNo: os(org.corporate_no),
          holidayWeekly: os(intake.job_holiday_weekly),
          holidayOther: os(intake.job_holiday_other),
          holidayYearDays: String(annualHolidays(os(intake.job_days_year)) ?? ""),
          holidayIrregularUnit: os(intake.job_holiday_irregular_unit),
          holidayIrregularDays: os(intake.job_holiday_irregular_days),
          holidayIrregularOther: os(intake.job_holiday_irregular_other),
        },
        so: {
          name: c.officeName,
          regNo: c.registrationNo,
          address: c.address,
          tel: c.tel,
          rep: c.representativeName,
          manager: c.supportManagerName,
          staff: c.supportStaffName,
        },
        today: todayStr(),
      };
      // その所属機関の版があればそれを使う（雇用条件書など、所属機関ごとの書式）
      targets = keys
        .map((k) => pickRefFormTemplate(templates, k, data.person.nationality, orgId || null))
        .filter((t): t is (typeof templates)[number] => !!t);
      if (targets.length === 0) {
        return NextResponse.json({ error: "参考様式のひな形が登録されていません" }, { status: 404 });
      }
    }

    const font = await readFile(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"));
    const parts = [];
    for (const t of targets) {
      const onlyPages = refFormPagesFor(mode, t.sign_pages);
      if (onlyPages && onlyPages.length === 0) continue; // 署名ページの印が無い様式は入れない
      const { data: blob, error: dlErr } = await admin.storage.from("app-files").download(t.pdf_path);
      if (dlErr || !blob) throw dlErr ?? new Error("PDFを読めませんでした");
      const doc = await fillRefForm(new Uint8Array(await blob.arrayBuffer()), font, normalizeRefFormLayout(t.layout), data);
      parts.push({ doc, onlyPages });
    }
    if (parts.length === 0) {
      return NextResponse.json({ error: "署名ページの印が付いた様式がありません（記入位置の画面で署名ページを選んでください）" }, { status: 404 });
    }
    const bytes = await mergeRefForms(parts);
    const fileName = refFormFileName(sample ? "one" : mode, workerName, sample ? targets[0].form_key : keys[0]);
    const disposition = sp.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(new Blob([bytes as BlobPart]), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${disposition}; filename="ref-form.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("ref-form failed:", err);
    return NextResponse.json({ error: "参考様式の作成に失敗しました（ひな形のPDFが読めない形式か、0227 が未適用の可能性があります）" }, { status: 500 });
  }
}
