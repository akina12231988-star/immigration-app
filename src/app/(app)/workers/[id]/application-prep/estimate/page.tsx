import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listPrepChecklists } from "@/lib/supabase/queries/application-prep";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { CUSTODIAN_SETTING_KEY, mergeCustodianInfo } from "@/lib/custody";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { prepDetailHref } from "@/lib/application-prep";
import { effectiveStampFeePayer } from "@/lib/stamp-fee";
import { defaultStampFeeBandKey, salesKindOfPrep } from "@/lib/estimate";
import { salesItemsForKind } from "@/lib/sales";
import { effectiveResidencePeriod } from "@/lib/residence-card";
import { normalizeTodoKey } from "@/lib/todo";
import { todayStr } from "@/lib/ssw/calc";
import { BackButton } from "@/components/BackButton";
import type { Organization, Worker } from "@/types/db";
import { EstimateSheet } from "./EstimateSheet";

export const dynamic = "force-dynamic";

// 申請準備の見積書（所属機関あて）の印刷ページ。
// 申請準備の詳細の「収入印紙代」の横の「見積書」から、表示しているTODO番号を付けて開く。
// 明細は所属機関の情報の「申請種別ごとの売上明細」から、収入印紙代の行は負担の選択から作る。
// 作るのに足りない登録（申請種別・負担・売上明細）があるときは、見積書の代わりに登録先の案内を出す
export default async function ApplicationPrepEstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ todo?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const { todo } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.from("workers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const worker = data as Worker;
  const backHref = prepDetailHref(id);

  const lists = await listPrepChecklists(supabase, id).catch(() => []);
  const wantKey = todo ? normalizeTodoKey(todo) : "";
  const current =
    (wantKey ? lists.find((l) => normalizeTodoKey(l.todo_no) === wantKey) : null) ?? lists[0] ?? null;

  // 申請準備の所属機関（転職の場合は転職先）。無ければ現在の所属機関
  const orgId = worker.application_prep_organization_id ?? worker.current_organization_id ?? null;
  let org: Organization | null = null;
  if (orgId) {
    const { data: o } = await supabase.from("organizations").select("*").eq("id", orgId).maybeSingle();
    org = o as Organization | null;
  }
  const custodianSetting = await getAppSetting<Record<string, unknown>>(supabase, CUSTODIAN_SETTING_KEY).catch(() => null);
  const custodian = mergeCustodianInfo(custodianSetting);

  const guide = (title: string, body: string, href: string, linkLabel: string) => (
    <>
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
        <BackButton fallbackHref={backHref} />
        <h1 className="flex-1 text-lg font-bold">見積書（{worker.name}）</h1>
      </div>
      <div className="px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-seal/40 bg-seal/10 p-4">
          <p className="text-sm font-bold text-seal">{title}</p>
          <p className="mt-2 text-sm leading-relaxed">{body}</p>
          <Link
            href={href}
            className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground"
          >
            {linkLabel}
          </Link>
        </div>
      </div>
    </>
  );

  if (!current) {
    return guide(
      "申請準備のリストがありません",
      "見積書は申請準備の詳細の内容（申請種別・収入印紙代の負担）から作ります。先に申請準備の詳細でTODO番号を登録してください。",
      backHref,
      "申請準備の詳細へ",
    );
  }
  const detailHref = `${backHref}?todo=${encodeURIComponent(current.todo_no)}`;
  if (!current.app_content && !current.app_type) {
    return guide(
      "申請種別が選ばれていません",
      "見積書の件名と、所属機関の情報から読み込む売上明細は申請種別で決まります。申請準備の詳細で申請種別を選んでから、もう一度開いてください。",
      detailHref,
      "申請準備の詳細で申請種別を選ぶ",
    );
  }
  if (!org) {
    return guide(
      "所属機関が登録されていません",
      "見積書の宛先と明細は所属機関の情報から作ります。外国人の詳細で所属機関（転職のときは転職先）を登録してから、もう一度開いてください。",
      `/workers/${id}`,
      "外国人の詳細へ",
    );
  }
  const payer = effectiveStampFeePayer(current.stamp_fee_payer, org.name);
  if (!payer) {
    return guide(
      "収入印紙代の負担が未設定です",
      "収入印紙代（申請手数料）を会社が負担するか本人が負担するかで見積書の内容が変わります。申請準備の詳細の「収入印紙代」で「本人負担」か「会社負担」を選んでから、もう一度開いてください。",
      detailHref,
      "申請準備の詳細で負担を選ぶ",
    );
  }
  const intake = normalizeOrganizationIntake(org.intake);
  const salesKind = salesKindOfPrep(current.app_content, current.app_type);
  // 既定の明細（lib/sales.ts。特定技能申請は所属機関名で金額が決まる）か、この機関だけの明細
  const salesItems = salesItemsForKind(intake, salesKind, org.name);
  if (salesItems.length === 0) {
    return guide(
      `所属機関の情報に「${salesKind}」の売上明細が登録されていません`,
      `見積書の明細は、所属機関の情報の「決算・売上」タブにある「申請種別ごとの売上明細」から作ります。${org.name} の「${salesKind}」に明細項目と金額（税抜・数字だけ）を登録してから、もう一度開いてください。`,
      `/organizations/${org.id}`,
      `${org.name} の情報を開いて登録する`,
    );
  }

  // 許可の見込みの在留期間: 特定活動は3月超6月以下、特定技能への変更は1年、特定技能の更新は在留カードの在留期間
  const defaultBandKey = defaultStampFeeBandKey(current.app_content, current.app_type, effectiveResidencePeriod(worker));
  // 申請はオンラインで行うので、収入印紙代はオンライン申請の金額を初期値にする（窓口は印刷ページで切り替え可）

  return (
    <EstimateSheet
      base={{
        workerName: worker.name,
        orgName: org.name,
        orgAddress: org.address ?? "",
        orgRepName: intake.rep_name,
        appContent: current.app_content,
        appType: current.app_type,
        stampFeePayer: payer,
        salesItems,
        supportFee: intake.support_fee,
        sswInsuranceBurden: intake.ssw_insurance_burden,
        todoNo: current.todo_no,
        today: todayStr(),
        plannedAppOn: current.planned_app_on,
        custodian,
      }}
      backHref={detailHref}
      defaultMethod="オンライン"
      defaultBandKey={defaultBandKey}
    />
  );
}
