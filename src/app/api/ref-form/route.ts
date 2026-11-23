import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { CUSTODIAN_SETTING_KEY, mergeCustodianInfo } from "@/lib/custody";
import { todayStr } from "@/lib/application-alerts";
import { annualHolidays } from "@/lib/job-conditions";
import { findPlanDatesForTodo, listPlanDates } from "@/lib/supabase/queries/plan-dates";
import { listWorkerWages } from "@/lib/supabase/queries/wages";
import { sortWages } from "@/lib/wage";
import { prep117Values } from "@/lib/ref-form-117";
import { addSupportSystemPages, type SupportSystemPdfInput } from "@/lib/support-system-pdf";
import { supportSystemPrintPeople } from "@/lib/support-system-print";
import type { OrganizationIntake } from "@/types/db";
import { listEmployees } from "@/lib/supabase/queries/employees";
import { listWorkersForSupport } from "@/lib/supabase/queries/workers";
import { mergeSupportOrgLists } from "@/lib/custody";
import type { Organization, WorkerWage } from "@/types/db";
import {
  isRefFormKey,
  REF_FORM_SAMPLE_DATA,
  fillRefForm,
  mergeRefForms,
  normalizeRefFormLayout,
  normalizeSignPages,
  parseRefFormMode,
  pickRefFormTemplate,
  refFormFileName,
  refFormOffIds,
  refFormWage6Values,
  withDerivedPlanDates,
  applyRefFormEdits,
  normalizeRefFormEdits,
  EMPTY_REF_FORM_EDITS,
  type RefFormEdits,
  refFormPagesFor,
  type RefFormData,
  type RefFormTemplate,
} from "@/lib/ref-form";

// 参考様式のPDFを作って返す（申請書類作成をアプリ一本化計画・試験中）。
//   /api/ref-form?workerId=...&keys=t1-4-1,t1-5&mode=one|all|sign[&download=1][&off=ひな形ID:項目ID,...]
//     off は作るときに外す○（記入位置に置いてあっても書かない）
//     todoNo は申請準備のTODO番号（書類作成日を「支援計画書の日付」から読む）
//     keys は提出書類一覧表の順に並べて渡す。様式ごとに本人の国籍に合う言語のひな形を選ぶ
//   /api/ref-form?templateId=...&sample=1 … そのひな形に見本の人で書き込む（記入位置の確認用）
export const runtime = "nodejs";
// 名簿（支援業務を行う体制についての説明）を付ける様式: 参考様式第1-17号（1号特定技能外国人支援計画書）
const ROSTER_FORM_KEY = "t1-18";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return makePdf(req.nextUrl.searchParams, null);
}

// 作成画面の「印刷」「PDFで保存」: まだ一時保存していない直した分（edits）で作る。
//   body: { query: "workerId=...&keys=...&mode=one&todoNo=...", edits: { [form_key]: RefFormEdits } }
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { query?: unknown; edits?: unknown } | null;
  if (!body || typeof body.query !== "string") return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  const edits: Record<string, RefFormEdits> = {};
  if (body.edits && typeof body.edits === "object") {
    for (const [k, v] of Object.entries(body.edits as Record<string, unknown>)) {
      edits[k] = normalizeRefFormEdits(v as Parameters<typeof normalizeRefFormEdits>[0]);
    }
  }
  return makePdf(new URLSearchParams(body.query), edits);
}

async function makePdf(sp: URLSearchParams, posted: Record<string, RefFormEdits> | null) {
  const me = await getMyProfile();
  if (!me) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const mode = parseRefFormMode(sp.get("mode"));
  const sample = sp.get("sample") === "1";
  const templateId = sp.get("templateId") ?? "";
  const workerId = sp.get("workerId") ?? "";
  const keys = (sp.get("keys") ?? "").split(",").filter((k) => isRefFormKey(k));
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
    // この人の一時保存（様式ごと）と所属機関の共通の文字（ひな形ごと）。0230 が未適用なら無し
    let drafts: Record<string, { template_id: string | null } & RefFormEdits> = {};
    let orgTexts: Record<string, Record<string, string>> = {};
    // 参考様式第1-17号（支援計画書）のうしろに付ける「支援業務を行う体制についての説明」（名簿）。roster=0 で付けない
    let roster: SupportSystemPdfInput | null = null;
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
          supportFee: os(intake.support_fee),
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
        planDates: withDerivedPlanDates(await planDates(supabase, workerId, sp.get("todoNo") ?? "")),
      };
      data.docDate = data.planDates?.doc ?? "";
      const cw = await currentWage(supabase, workerId, orgId || null);
      data.wage = cw ? { kind: cw.kind, amount: cw.amount } : null;
      data.wage6 = cw ? refFormWage6Values(cw, cw.detail, cw.annualHours) : {};
      if (sp.get("roster") !== "0" && keys.includes(ROSTER_FORM_KEY)) {
        const people = supportSystemPrintPeople(
          await listEmployees(supabase).catch(() => []),
          todayStr(),
          (intake as Partial<OrganizationIntake>) ?? null,
        );
        roster = {
          note: c.supportSystemNote,
          officeName: c.officeName,
          orgName: os(org.name),
          managers: people.managers.filter((x) => x.selected).map((x) => x.name),
          staff: people.staff.filter((x) => x.selected).map((x) => x.name),
        };
      }
      data.p117 = await load117(supabase, {
        workerId,
        todoNo: sp.get("todoNo") ?? "",
        orgId: orgId || null,
        org,
        nationality: data.person.nationality,
        planDates: data.planDates ?? {},
        wageDetail: cw?.detail ?? null,
        settings: (so as { value: Record<string, unknown> } | null)?.value ?? null,
      });
      ({ drafts, orgTexts } = await loadRefFormEdits(supabase, workerId, sp.get("todoNo") ?? "", orgId || null));
      // その所属機関の版があればそれを使う（雇用条件書など、所属機関ごとの書式）
      targets = keys
        .map((k) => pickRefFormTemplate(templates, k, data.person.nationality, orgId || null, sp.get("lang")))
        .filter((t): t is (typeof templates)[number] => !!t);
      if (targets.length === 0) {
        return NextResponse.json({ error: "参考様式のひな形が登録されていません" }, { status: 404 });
      }
    }

    const font = await readFile(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"));
    const parts = [];
    for (const t of targets) {
      const onlyPages = refFormPagesFor(mode, t.sign_pages, t.form_key);
      if (onlyPages && onlyPages.length === 0) continue; // 署名ページの印が無い様式は入れない
      const { data: blob, error: dlErr } = await admin.storage.from("app-files").download(t.pdf_path);
      if (dlErr || !blob) throw dlErr ?? new Error("PDFを読めませんでした");
      // 作成画面で直した分を重ねる（送られてきた分 → 一時保存した分。ひな形を差し替えた後の一時保存は使わない）
      const draft = drafts[t.form_key];
      const edits =
        posted?.[t.form_key] ?? (draft && (!draft.template_id || draft.template_id === t.id) ? draft : EMPTY_REF_FORM_EDITS);
      const layout = sample ? normalizeRefFormLayout(t.layout) : applyRefFormEdits(normalizeRefFormLayout(t.layout), edits, orgTexts[t.id] ?? {});
      const withRoster = roster && t.form_key === ROSTER_FORM_KEY && mode !== "sign" ? roster : null;
      const doc = await fillRefForm(
        new Uint8Array(await blob.arrayBuffer()),
        font,
        layout,
        data,
        refFormOffIds(sp.get("off"), t.id),
        withRoster ? (d, f) => addSupportSystemPages(d, f, withRoster) : undefined,
      );
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

// 申請準備の「支援計画書の日付」に保存した日付（キー → YYYY-MM-DD。0107 が未適用・未保存なら空）
async function planDates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workerId: string,
  todoNo: string,
): Promise<Record<string, string>> {
  try {
    const hit = findPlanDatesForTodo(await listPlanDates(supabase, workerId), todoNo);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(hit?.dates ?? {})) {
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

// この人の一時保存（ref_form_drafts）と所属機関の共通の文字（ref_form_org_texts）。0230 が未適用なら空
async function loadRefFormEdits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workerId: string,
  todoNo: string,
  orgId: string | null,
): Promise<{
  drafts: Record<string, { template_id: string | null } & RefFormEdits>;
  orgTexts: Record<string, Record<string, string>>;
}> {
  const drafts: Record<string, { template_id: string | null } & RefFormEdits> = {};
  const orgTexts: Record<string, Record<string, string>> = {};
  const { data: d } = await supabase
    .from("ref_form_drafts")
    .select("form_key, template_id, texts, moves, off")
    .eq("worker_id", workerId)
    .eq("todo_no", todoNo);
  for (const r of (d as { form_key: string; template_id: string | null; texts: unknown; moves: unknown; off: unknown }[] | null) ?? []) {
    drafts[r.form_key] = { template_id: r.template_id, ...normalizeRefFormEdits(r) };
  }
  if (orgId) {
    const { data: o } = await supabase.from("ref_form_org_texts").select("template_id, texts").eq("organization_id", orgId);
    for (const r of (o as { template_id: string; texts: unknown }[] | null) ?? []) {
      orgTexts[r.template_id] = normalizeRefFormEdits({ texts: r.texts }).texts;
    }
  }
  return { drafts, orgTexts };
}

// 賃金（外国人詳細の「賃金（1-6号別紙）」）のいちばん新しい記録。申請準備の所属機関の記録があればそちらを使う。
// annualHours は、その賃金の所属機関の年間所定労働時間（1-6号別紙に入れていないときの計算に使う）
async function currentWage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workerId: string,
  orgId: string | null,
): Promise<{ kind: string; amount: number; detail: unknown; annualHours: number } | null> {
  try {
    const all = await listWorkerWages(supabase, workerId);
    const own = orgId ? all.filter((w) => w.organization_id === orgId) : [];
    const w = sortWages(own.length > 0 ? own : all)[0];
    if (!w) return null;
    let annualHours = 0;
    const hoursOrg = w.organization_id ?? orgId;
    if (hoursOrg) {
      const { data: o } = await supabase.from("organizations").select("annual_work_hours").eq("id", hoursOrg).maybeSingle();
      annualHours = Number((o as { annual_work_hours: number | null } | null)?.annual_work_hours) || 0;
    }
    return { kind: w.kind, amount: w.amount, detail: w.detail, annualHours };
  } catch {
    return null;
  }
}

// 1-17号 支援計画書に記載する項目（申請準備の Prep117Section と同じ値）。読めないものは空欄
async function load117(
  supabase: Awaited<ReturnType<typeof createClient>>,
  p: {
    workerId: string;
    todoNo: string;
    orgId: string | null;
    org: Record<string, unknown>;
    nationality: string;
    planDates: Record<string, string>;
    wageDetail: unknown;
    settings: Record<string, unknown> | null;
  },
): Promise<Record<string, string>> {
  try {
    // 連名の方（この申請準備の joint_worker_id）
    let joint: { name: string; birth: string | null; gender: string; nationality: string } | null = null;
    const { data: chk } = await supabase
      .from("application_prep_checklists")
      .select("joint_worker_id")
      .eq("worker_id", p.workerId)
      .eq("todo_no", p.todoNo)
      .maybeSingle();
    const jointId = (chk as { joint_worker_id: string | null } | null)?.joint_worker_id ?? null;
    if (jointId) {
      const { data: j } = await supabase.from("workers").select("name, birth, gender, nationality").eq("id", jointId).maybeSingle();
      const r = j as { name: string; birth: string | null; gender: string | null; nationality: string | null } | null;
      if (r) joint = { name: r.name, birth: r.birth, gender: r.gender ?? "", nationality: r.nationality ?? "" };
    }
    const { data: hp } = await supabase.from("workers").select("housing_plan").eq("id", p.workerId).maybeSingle();
    const [employees, supportWorkers] = await Promise.all([
      listEmployees(supabase).catch(() => []),
      listWorkersForSupport(supabase).catch(() => []),
    ]);
    return prep117Values({
      mainNationality: p.nationality,
      joint,
      org: p.orgId ? ({ intake: p.org.intake } as Pick<Organization, "intake">) : null,
      orgId: p.orgId,
      employees,
      supportWorkers,
      planDates: p.planDates,
      wage: { detail: p.wageDetail as WorkerWage["detail"] },
      housingPlan: (hp as { housing_plan?: unknown } | null)?.housing_plan ?? null,
      interpreters: mergeSupportOrgLists(p.settings).interpreters,
      today: todayStr(),
    });
  } catch {
    return {};
  }
}
