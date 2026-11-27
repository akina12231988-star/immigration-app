import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization, getOrgRoster } from "@/lib/supabase/queries/organizations";
import { listGrantedPermits, listPermitHistoryExtras } from "@/lib/supabase/queries/applications";
import { listOrgPayrollItems, listPeriodicReportEntries } from "@/lib/supabase/queries/periodic-report";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { CUSTODIAN_SETTING_KEY, mergeCustodianInfo } from "@/lib/custody";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { buildPayrollRequestRows, jpDate, type PayrollPermit, type PayrollRequestCandidate } from "@/lib/payroll-request";
import { buildReport36, workerAnnualTotals, type ReportEntryLike } from "@/lib/periodic-report";
import {
  B1_PER_PAGE,
  fill36,
  fill36Besshi1,
  type FillB1Worker,
} from "@/lib/periodic-report-forms";

// 定期報告書（参考様式第3-6号・別紙1）を作る。
// 賃金台帳の入力（periodic_report_entries）から平均値を計算し、公式様式のExcelに転記する。
// 様式の生成はサーバー側で行う（他の届出書と同じ方式）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface Body {
  organizationId?: string;
  fy?: number; // 届出対象年度（開始年）
  kind?: "honshi" | "besshi1";
  page?: number; // 別紙1のページ（1始まり。5名ごと）
  supportDelegated?: boolean; // 支援の全部委託あり（省略時は支援委託の状況から判定）
  note?: string; // 本紙の６備考
}

export async function POST(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const { organizationId, fy, kind } = body;
  if (!organizationId || !fy || (kind !== "honshi" && kind !== "besshi1")) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const supabase = await createClient();
  const organization = await getOrganization(supabase, organizationId).catch(() => null);
  if (!organization) {
    return NextResponse.json({ error: "所属機関が見つかりません" }, { status: 404 });
  }
  const intake = normalizeOrganizationIntake(organization.intake);

  // 対象者（依頼案内・入力画面と同じ抽出）と入力・項目・登録支援機関の情報
  const roster = await getOrgRoster(supabase, organizationId).catch(() => ({ current: [], past: [] }));
  const candidates: PayrollRequestCandidate[] = [...roster.current, ...roster.past].map((w) => ({
    id: w.id,
    name: w.name,
    kana: w.kana,
    nationality: w.nationality,
    residenceStatus: w.residenceStatus,
    residencePermitDate: w.residencePermitDate,
    startOn: w.startOn,
    leavingOn: w.leavingOn,
  }));
  const ids = new Set(candidates.map((c) => c.id));
  const [granted, extras, items, entries, custodianSetting] = await Promise.all([
    listGrantedPermits(supabase).catch(() => []),
    listPermitHistoryExtras(supabase).catch(() => []),
    listOrgPayrollItems(supabase, organizationId),
    listPeriodicReportEntries(supabase, organizationId, `${fy - 1}-04`, `${fy + 1}-03`),
    getAppSetting<Record<string, unknown>>(supabase, CUSTODIAN_SETTING_KEY).catch(() => null),
  ]);
  const permitsByWorker: Record<string, PayrollPermit[]> = {};
  for (const p of [...granted, ...extras]) {
    if (!ids.has(p.workerId)) continue;
    (permitsByWorker[p.workerId] ??= []).push({ permitDate: p.permitDate, visa: p.visa });
  }
  const { rows } = buildPayrollRequestRows(candidates, permitsByWorker, fy);
  if (rows.length === 0) {
    return NextResponse.json({ error: "この年度に特定技能として在籍していた人が見つかりません" }, { status: 404 });
  }

  const entryByKey = new Map<string, ReportEntryLike>();
  for (const e of entries) entryByKey.set(`${e.worker_id}|${e.ym}`, e);
  const getEntry = (workerId: string, ym: string) => entryByKey.get(`${workerId}|${ym}`) ?? null;
  const itemsById = Object.fromEntries(items.map((it) => [it.id, { category: it.category }]));

  const custodian = mergeCustodianInfo(custodianSetting);
  const supportDelegated =
    body.supportDelegated ?? ["特定技能1号の許可後に支援委託開始", "支援委託中"].includes(intake.support_contract_status ?? "");

  try {
    if (kind === "honshi") {
      const report = buildReport36(rows, getEntry, itemsById, fy);
      // ②特定産業分野: 対象者の分野でいちばん多いもの（workers.field）。分野の数も数える
      const workerRows = await listWorkerFields(supabase, rows.map((r) => r.id));
      const fieldCounts = new Map<string, number>();
      for (const w of workerRows) {
        const f = (w.field ?? "").trim();
        if (f) fieldCounts.set(f, (fieldCounts.get(f) ?? 0) + 1);
      }
      const fieldName = [...fieldCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? organization.business_category;
      // 1か月未満の備考（要領: その号の（1）〜（6）に0を書いたときは備考に「1か月未満」）
      const notes: string[] = [];
      if (report.one.note) notes.push(`特定技能1号は${report.one.note}`);
      if (report.two.note) notes.push(`特定技能2号は${report.two.note}`);
      if (body.note?.trim()) notes.push(body.note.trim());

      const template = await readTemplate("sanko-3-6.xlsx");
      const bytes = await fill36(template, {
        fy,
        corporateNo: organization.corporate_no ?? "",
        fieldName,
        fieldCount: fieldCounts.size,
        orgKana: intake.kana ?? "",
        orgName: organization.name,
        postal: organization.postal_code ?? "",
        address: organization.address ?? "",
        phone: organization.contact ?? "",
        count1: report.oneCount,
        count2: report.twoCount,
        one: report.oneCount > 0 ? report.one : null,
        two: report.twoCount > 0 ? report.two : null,
        raise1: report.raise1,
        raise2: report.raise2,
        supportDelegated,
        note: notes.join("。"),
        staffName: intake.report_staff ?? "",
        staffPhone: organization.contact ?? "",
      });
      return fileResponse(bytes);
    }

    // 別紙1（5名ごとにページを分ける）
    const page = Math.max(1, Math.floor(body.page ?? 1));
    const pageRows = rows.slice((page - 1) * B1_PER_PAGE, page * B1_PER_PAGE);
    if (pageRows.length === 0) {
      return NextResponse.json({ error: "そのページに載せる人がいません" }, { status: 400 });
    }
    const details = await listWorkerFields(supabase, pageRows.map((r) => r.id));
    const detailById = new Map(details.map((d) => [d.id, d]));
    const payBank = intake.pay_method === "口座振込" ? true : intake.pay_method === "通貨払い" ? false : null;
    const workers: FillB1Worker[] = pageRows.map((r) => {
      const d = detailById.get(r.id);
      const totals = workerAnnualTotals(r, getEntry, itemsById, fy);
      const notes: string[] = [];
      // 要領: 期間中に受入れを開始・終了した人は備考に開始日・終了日を書く
      if (r.sswStart >= `${fy}-04-01`) notes.push(`受入れ開始日:\n${jpDate(r.sswStart)}`);
      const leaving = candidates.find((c) => c.id === r.id)?.leavingOn;
      if (leaving && leaving <= `${fy + 1}-03-31`) notes.push(`受入れ終了日:\n${jpDate(leaving)}`);
      return {
        name: r.name,
        nationality: r.nationality,
        birth: d?.birth ?? null,
        gender: d?.gender ?? "",
        cardNo: d?.residence_card_no ?? "",
        field: d?.field ?? "",
        days: totals.days,
        pay: totals.pay,
        payBank,
        note: notes.join("\n"),
      };
    });
    const template = await readTemplate("sanko-3-6-b1.xlsx");
    const bytes = await fill36Besshi1(template, {
      orgName: organization.name,
      officeName: organization.name, // 事業所ごとの管理は無いため本社名。必要なら様式上で直す
      supportDelegated,
      supportOrgName: supportDelegated ? custodian.officeName : "",
      staffName: custodian.supportStaffName || custodian.agentName || "",
      staffPhone: custodian.tel,
      workers,
    });
    return fileResponse(bytes);
  } catch (e) {
    return NextResponse.json(
      { error: `様式の生成に失敗しました: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}

async function readTemplate(name: string): Promise<ArrayBuffer> {
  const buf = await readFile(path.join(process.cwd(), "public", "forms", name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function fileResponse(bytes: Uint8Array): NextResponse {
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": MIME } });
}

// 別紙1・本紙の分野欄に使う外国人の項目
async function listWorkerFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<{ id: string; field: string; birth: string | null; gender: string; residence_card_no: string }[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("workers")
    .select("id, field, birth, gender, residence_card_no")
    .in("id", ids);
  if (error) throw error;
  return (data as { id: string; field: string; birth: string | null; gender: string; residence_card_no: string }[]) ?? [];
}
